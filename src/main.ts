import { type Config, loadConfig } from './config.ts'
import { createApp } from './http/app.ts'
import { Fetcher } from './services/fetcher.ts'
import { JellyfinClient } from './upstream/jellyfin.ts'

export interface ListenAddress {
  hostname: string
  port: number
}

export interface CliOptions {
  configPath: string
  staticDir: string
}

export function parseListen(value: string): ListenAddress {
  let hostname: string
  let portText: string
  const ipv6 = /^\[([^\]]+)]:(\d+)$/.exec(value)
  if (ipv6) {
    hostname = ipv6[1] as string
    portText = ipv6[2] as string
  } else {
    const hostAndPort = /^([^:]*):(\d+)$/.exec(value)
    if (!hostAndPort) {
      throw new Error(
        `invalid listen address ${JSON.stringify(value)}, want :PORT, HOST:PORT, or [IPv6]:PORT`,
      )
    }
    hostname = (hostAndPort[1] as string) || '0.0.0.0'
    portText = hostAndPort[2] as string
  }

  const port = Number(portText)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid listen port ${JSON.stringify(portText)}`)
  }
  return { hostname, port }
}

export function parseArgs(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = Deno.env.toObject(),
): CliOptions {
  let configPath = env.CALTHING_CONFIG || 'config.yaml'
  const staticDir = env.CALTHING_STATIC_DIR || 'frontend/dist'

  for (let index = 0; index < args.length; index++) {
    const argument = args[index] as string
    if (argument === '-config' || argument === '--config') {
      const value = args[++index]
      if (!value) throw new Error(`${argument} requires a path`)
      configPath = value
      continue
    }
    if (argument.startsWith('-config=') || argument.startsWith('--config=')) {
      const value = argument.slice(argument.indexOf('=') + 1)
      if (!value) throw new Error(`${argument.slice(0, argument.indexOf('='))} requires a path`)
      configPath = value
      continue
    }
    throw new Error(`unknown argument ${JSON.stringify(argument)}`)
  }

  return { configPath, staticDir }
}

function installShutdownSignals(controller: AbortController): () => void {
  const shutdown = () => {
    if (controller.signal.aborted) return
    console.info('shutting down')
    controller.abort()
  }
  Deno.addSignalListener('SIGINT', shutdown)
  Deno.addSignalListener('SIGTERM', shutdown)
  return () => {
    Deno.removeSignalListener('SIGINT', shutdown)
    Deno.removeSignalListener('SIGTERM', shutdown)
  }
}

export function buildApp(config: Config, staticDir?: string) {
  const jellyfin = config.jellyfin.url ? new JellyfinClient(config.jellyfin) : undefined
  // Linking needs the API key and public URL; login only needs the private URL.
  const linker = config.jellyfin.apiKey && config.jellyfin.publicUrl ? jellyfin : undefined
  return createApp({
    config,
    fetcher: new Fetcher(
      config.instances,
      config.cache.ttlMs,
      undefined,
      undefined,
      linker,
      config.calendar.availabilityDelayMs,
    ),
    auth: config.auth.secret !== '' ? jellyfin : undefined,
    staticDir,
  })
}

export async function main(
  args: readonly string[] = Deno.args,
  env: Record<string, string | undefined> = Deno.env.toObject(),
): Promise<void> {
  const options = parseArgs(args, env)
  const config = await loadConfig(options.configPath, env)
  const address = parseListen(config.listen)
  const app = buildApp(config, options.staticDir)
  const controller = new AbortController()
  const removeSignalListeners = installShutdownSignals(controller)

  console.info('listening', { addr: config.listen, instances: config.instances.length })
  const server = Deno.serve({ ...address, signal: controller.signal }, app.fetch)
  try {
    await server.finished
  } finally {
    removeSignalListeners()
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('server error', error)
    Deno.exit(1)
  })
}

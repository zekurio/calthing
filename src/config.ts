import { parse as parseYaml } from '@std/yaml'
import type { Source } from '../shared/api.ts'

export type Env = Record<string, string | undefined>

export interface Instance {
  name: string
  type: Source
  url: string
  apiKey: string
  includeUnmonitored: boolean
}

export interface Config {
  listen: string
  cache: {
    ttlMs: number
  }
  calendar: {
    pastDays: number
    futureDays: number
    name: string
    availabilityDelayMs: number
    feedSecret: string
  }
  branding: {
    name: string
    iconUrl: string
    pageTitle: string
    description: string
  }
  jellyfin: {
    url: string
    publicUrl: string
    apiKey: string
  }
  instances: Instance[]
}

const DEFAULT_LISTEN = ':8080'
const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_PAST_DAYS = 30
const DEFAULT_FUTURE_DAYS = 90
const DEFAULT_CALENDAR_NAME = 'Media Calendar'
const DEFAULT_BRAND_NAME = 'calthing'

const DURATION_UNITS: Readonly<Record<string, number>> = {
  ns: 1 / 1_000_000,
  us: 1 / 1000,
  'µs': 1 / 1000,
  'μs': 1 / 1000,
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
}

function parseDuration(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error(`invalid duration ${JSON.stringify(value)}`)
  }
  const duration = String(value)
  if (duration === '0') return 0

  let sign = 1
  let rest = duration
  if (rest.startsWith('-') || rest.startsWith('+')) {
    sign = rest[0] === '-' ? -1 : 1
    rest = rest.slice(1)
  }
  if (rest.length === 0) throw new Error(`invalid duration ${JSON.stringify(value)}`)

  const part = /^(?:(\d+(?:\.\d*)?)|(\.\d+))(ns|us|µs|μs|ms|s|m|h)/
  let total = 0
  let matched = false
  while (rest.length > 0) {
    const match = part.exec(rest)
    if (match === null) throw new Error(`invalid duration ${JSON.stringify(value)}`)
    const amount = Number(match[1] ?? match[2])
    const unit = DURATION_UNITS[match[3] as string]
    if (unit === undefined || !Number.isFinite(amount)) {
      throw new Error(`invalid duration ${JSON.stringify(value)}`)
    }
    total += amount * unit
    rest = rest.slice(match[0].length)
    matched = true
  }
  if (!matched || !Number.isFinite(total)) {
    throw new Error(`invalid duration ${JSON.stringify(value)}`)
  }
  return sign * total
}

function expandEnv(raw: string, env: Env): string {
  const missing: string[] = []
  const expanded = raw.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_reference, braced: string | undefined, bare: string | undefined) => {
      const name = braced ?? bare as string
      const value = env[name]
      if (value === undefined) {
        missing.push(name)
        return ''
      }
      return value
    },
  )
  if (missing.length > 0) {
    throw new Error(`config references unset environment variables: ${missing.join(', ')}`)
  }
  return expanded
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`parse config: ${path} must be a mapping`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, fallback: string, path: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new Error(`parse config: ${path} must be a string`)
}

function integerValue(value: unknown, fallback: number, path: string): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`parse config: ${path} must be an integer`)
  }
  return value
}

function booleanValue(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new Error(`parse config: ${path} must be a boolean`)
  return value
}

function parseInstance(value: unknown, index: number): Instance {
  const raw = record(value, `instances[${index}]`)
  const type = stringValue(raw.type, '', `instances[${index}].type`)
  return {
    name: stringValue(raw.name, '', `instances[${index}].name`),
    type: type as Source,
    url: stringValue(raw.url, '', `instances[${index}].url`),
    apiKey: stringValue(raw.api_key, '', `instances[${index}].api_key`),
    includeUnmonitored: booleanValue(
      raw.include_unmonitored,
      false,
      `instances[${index}].include_unmonitored`,
    ),
  }
}

function validate(config: Config): void {
  if (config.instances.length === 0) {
    throw new Error('config: at least one instance is required')
  }
  if (config.cache.ttlMs <= 0) {
    throw new Error('config: cache.ttl must be positive')
  }
  if (config.calendar.pastDays < 0 || config.calendar.futureDays < 0) {
    throw new Error('config: calendar.past_days and future_days must be >= 0')
  }
  if (config.calendar.availabilityDelayMs < 0) {
    throw new Error('config: calendar.availability_delay must be >= 0')
  }

  const linkValues = [config.jellyfin.publicUrl, config.jellyfin.apiKey]
  if (linkValues.some(Boolean)) {
    if (!linkValues.every(Boolean)) {
      throw new Error('config: jellyfin.public_url and api_key must be set together')
    }
    if (!config.jellyfin.url) {
      throw new Error('config: jellyfin.url is required when public_url and api_key are set')
    }
  }
  if (config.jellyfin.url !== '' && config.calendar.feedSecret === '') {
    throw new Error(
      'config: calendar.feed_secret is required when jellyfin.url is set — it signs personal feed URLs',
    )
  }
  if (config.calendar.feedSecret !== '' && config.jellyfin.url === '') {
    throw new Error('config: calendar.feed_secret requires jellyfin.url')
  }
  for (
    const [path, value] of [
      ['branding.icon_url', config.branding.iconUrl],
      ['jellyfin.url', config.jellyfin.url],
      ['jellyfin.public_url', config.jellyfin.publicUrl],
    ] as const
  ) {
    if (!value) continue
    try {
      new URL(value)
    } catch {
      throw new Error(`config: ${path}: invalid url ${JSON.stringify(value)}`)
    }
  }

  const names = new Set<string>()
  for (let index = 0; index < config.instances.length; index++) {
    const instance = config.instances[index]
    if (instance === undefined) continue
    if (instance.name === '') {
      throw new Error(`config: instances[${index}]: name is required`)
    }
    if (names.has(instance.name)) {
      throw new Error(`config: duplicate instance name ${JSON.stringify(instance.name)}`)
    }
    names.add(instance.name)
    if (instance.type !== 'radarr' && instance.type !== 'sonarr') {
      throw new Error(
        `config: instance ${
          JSON.stringify(instance.name)
        }: type must be "radarr" or "sonarr", got ${JSON.stringify(instance.type)}`,
      )
    }

    let url: URL
    try {
      url = new URL(instance.url)
    } catch {
      throw new Error(
        `config: instance ${JSON.stringify(instance.name)}: invalid url ${
          JSON.stringify(instance.url)
        }`,
      )
    }
    if (url.protocol === '' || url.hostname === '') {
      throw new Error(
        `config: instance ${JSON.stringify(instance.name)}: invalid url ${
          JSON.stringify(instance.url)
        }`,
      )
    }
    if (instance.apiKey === '') {
      throw new Error(`config: instance ${JSON.stringify(instance.name)}: api_key is required`)
    }
  }
}

export function parseConfig(raw: string, env: Env = Deno.env.toObject()): Config {
  let parsed: unknown
  try {
    parsed = parseYaml(expandEnv(raw, env))
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('config references unset environment variables:')
    ) {
      throw error
    }
    throw new Error(`parse config: ${error instanceof Error ? error.message : String(error)}`)
  }

  const root = record(parsed, 'root')
  const cache = record(root.cache, 'cache')
  const calendar = record(root.calendar, 'calendar')
  const branding = record(root.branding, 'branding')
  const jellyfin = record(root.jellyfin, 'jellyfin')
  if (root.instances !== undefined && !Array.isArray(root.instances)) {
    throw new Error('parse config: instances must be a sequence')
  }

  let ttlMs = DEFAULT_TTL_MS
  if (cache.ttl !== undefined && cache.ttl !== null) {
    try {
      ttlMs = parseDuration(cache.ttl)
    } catch (error) {
      throw new Error(`parse config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  let availabilityDelayMs = 0
  if (calendar.availability_delay !== undefined && calendar.availability_delay !== null) {
    try {
      availabilityDelayMs = parseDuration(calendar.availability_delay)
    } catch (error) {
      throw new Error(`parse config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const config: Config = {
    listen: stringValue(root.listen, DEFAULT_LISTEN, 'listen'),
    cache: { ttlMs },
    calendar: {
      pastDays: integerValue(calendar.past_days, DEFAULT_PAST_DAYS, 'calendar.past_days'),
      futureDays: integerValue(calendar.future_days, DEFAULT_FUTURE_DAYS, 'calendar.future_days'),
      name: stringValue(calendar.name, DEFAULT_CALENDAR_NAME, 'calendar.name'),
      availabilityDelayMs,
      feedSecret: stringValue(calendar.feed_secret, '', 'calendar.feed_secret'),
    },
    branding: {
      name: stringValue(branding.name, DEFAULT_BRAND_NAME, 'branding.name'),
      iconUrl: stringValue(branding.icon_url, '', 'branding.icon_url'),
      pageTitle: stringValue(branding.page_title, '', 'branding.page_title'),
      description: stringValue(branding.description, '', 'branding.description'),
    },
    jellyfin: {
      url: stringValue(jellyfin.url, '', 'jellyfin.url'),
      publicUrl: stringValue(jellyfin.public_url, '', 'jellyfin.public_url'),
      apiKey: stringValue(jellyfin.api_key, '', 'jellyfin.api_key'),
    },
    instances: (root.instances ?? []).map(parseInstance),
  }

  if (env.CALTHING_LISTEN) config.listen = env.CALTHING_LISTEN

  validate(config)
  return config
}

export async function loadConfig(path: string, env: Env = Deno.env.toObject()): Promise<Config> {
  let raw: string
  try {
    raw = await Deno.readTextFile(path)
  } catch (error) {
    throw new Error(`read config: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseConfig(raw, env)
}

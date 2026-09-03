import { assertEquals, assertRejects, assertThrows } from '@std/assert'

import { buildApp, main, parseArgs, parseListen } from '../src/main.ts'
import type { Config } from '../src/config.ts'

Deno.test('parseListen accepts wildcard, hostname, IPv4, and bracketed IPv6 addresses', () => {
  assertEquals(parseListen(':8080'), { hostname: '0.0.0.0', port: 8080 })
  assertEquals(parseListen(':0'), { hostname: '0.0.0.0', port: 0 })
  assertEquals(parseListen('localhost:1234'), { hostname: 'localhost', port: 1234 })
  assertEquals(parseListen('127.0.0.1:443'), { hostname: '127.0.0.1', port: 443 })
  assertEquals(parseListen('[::1]:9000'), { hostname: '::1', port: 9000 })
})

Deno.test('parseListen rejects malformed addresses and invalid ports', () => {
  for (const address of ['8080', 'localhost', '::1:8080', '[::1]', ':65536', 'host:-1']) {
    assertThrows(() => parseListen(address), Error, undefined, address)
  }
})

Deno.test('parseArgs preserves legacy config precedence and static root override', () => {
  assertEquals(parseArgs([], {}), {
    configPath: 'config.yaml',
    staticDir: 'frontend/dist',
  })
  assertEquals(
    parseArgs([], {
      CALTHING_CONFIG: '/env/config.yaml',
      CALTHING_STATIC_DIR: '/srv/frontend',
    }),
    {
      configPath: '/env/config.yaml',
      staticDir: '/srv/frontend',
    },
  )
  assertEquals(
    parseArgs(['-config', '/cli/config.yaml'], {
      CALTHING_CONFIG: '/env/config.yaml',
    }),
    {
      configPath: '/cli/config.yaml',
      staticDir: 'frontend/dist',
    },
  )
  assertEquals(parseArgs(['--config=/long/config.yaml'], {}), {
    configPath: '/long/config.yaml',
    staticDir: 'frontend/dist',
  })
})

Deno.test('parseArgs rejects missing config values, positional args, and unknown flags', () => {
  for (const args of [['-config'], ['--config='], ['config.yaml'], ['-listen', ':9000']]) {
    assertThrows(() => parseArgs(args, {}), Error)
  }
})

Deno.test('importing main does not start a server and buildApp wires health without upstream access', async () => {
  const config: Config = {
    listen: ':0',
    cache: { ttlMs: 60_000 },
    calendar: {
      pastDays: 30,
      futureDays: 90,
      name: 'Test',
      availabilityDelayMs: 0,
      feedSecret: '',
    },
    branding: { name: 'calthing', iconUrl: '', pageTitle: '', description: '' },
    jellyfin: { url: '', publicUrl: '', apiKey: '' },
    instances: [],
  }
  const app = buildApp(config)
  const response = await app.fetch(new Request('http://localhost/api/health'))
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { status: 'ok', instances: 0 })
})

Deno.test('main reports config read failures instead of starting the listener', async () => {
  await assertRejects(
    () =>
      main([], {
        CALTHING_CONFIG: '/definitely/missing/calthing-config.yaml',
      }),
    Error,
    'read config:',
  )
})

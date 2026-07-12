import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'

import type { Config } from '../src/config.ts'
import type { CalendarEvent } from '../src/domain/event.ts'
import { createApp, type Logger } from '../src/http/app.ts'

const config: Config = {
  listen: ':0',
  cache: { ttlMs: 65_500 },
  calendar: { pastDays: 30, futureDays: 90, name: 'Test Calendar', availabilityDelayMs: 0 },
  auth: { token: '' },
  branding: { name: 'Jellyfin', iconUrl: '', pageTitle: '', description: '' },
  jellyfin: { url: '', publicUrl: '', apiKey: '' },
  instances: [{
    name: 'tv',
    type: 'sonarr',
    url: 'http://tv.example',
    apiKey: 'key',
    includeUnmonitored: false,
  }],
}

const event: CalendarEvent = {
  uid: 'sonarr-tv-1@arr-cal-proxy',
  instance: 'tv',
  source: 'sonarr',
  kind: 'episode',
  title: 'Example Show',
  subtitle: 'Pilot',
  season: 1,
  episode: 1,
  start: new Date('2026-07-02T00:00:00Z'),
  end: new Date('2026-07-02T00:45:00Z'),
  allDay: false,
  downloaded: false,
  overview: 'A pilot',
  posterUrl: 'https://example.test/poster.jpg',
}

function copyConfig(token = ''): Config {
  return {
    ...config,
    cache: { ...config.cache },
    calendar: { ...config.calendar },
    auth: { token },
    instances: config.instances.map((instance) => ({ ...instance })),
  }
}

function request(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init))
}

Deno.test('events returns DTOs, statuses, exact windows, and request logs', async () => {
  const calls: Array<[Date, Date]> = []
  const logs: Array<{ message: string; details: Record<string, unknown> }> = []
  const logger: Logger = { info: (message, details) => logs.push({ message, details }) }
  const app = createApp({
    config: copyConfig(),
    now: () => new Date('2026-07-11T19:30:00-07:00'),
    logger,
    fetcher: {
      async fetch(start, end) {
        calls.push([start, end])
        return {
          events: [event],
          instances: [{
            name: 'tv',
            type: 'sonarr',
            ok: true,
            fetchedAt: '2026-07-01T00:00:00Z',
          }],
        }
      },
    },
  })

  const response = await request(app, '/api/events?start=2026-07-01&end=2026-08-01')
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('content-type'), 'application/json; charset=utf-8')
  const body = await response.json()
  assertEquals(body.events[0].start, '2026-07-02T00:00:00Z')
  assertEquals(body.events[0].title, 'Example Show')
  assertEquals(body.instances[0].ok, true)
  assertEquals(calls.map(([start, end]) => [start.toISOString(), end.toISOString()]), [[
    '2026-07-01T00:00:00.000Z',
    '2026-08-01T00:00:00.000Z',
  ]])
  assertEquals(logs.length, 1)
  assertEquals(logs[0]?.message, 'request')
  assertEquals(logs[0]?.details.method, 'GET')
  assertEquals(logs[0]?.details.path, '/api/events')
  assert(typeof logs[0]?.details.durationMs === 'number')
})

Deno.test('default window is based on the current UTC calendar day', async () => {
  let window: [Date, Date] | undefined
  const app = createApp({
    config: copyConfig(),
    now: () => new Date('2026-07-11T23:59:59Z'),
    logger: { info() {} },
    fetcher: {
      async fetch(start, end) {
        window = [start, end]
        return { events: [], instances: [] }
      },
    },
  })
  assertEquals((await request(app, '/api/events')).status, 200)
  assertEquals(window?.map((date) => date.toISOString()), [
    '2026-06-11T00:00:00.000Z',
    '2026-10-09T00:00:00.000Z',
  ])
})

Deno.test('date windows reject malformed, impossible, and non-increasing dates', async () => {
  let calls = 0
  const app = createApp({
    config: copyConfig(),
    logger: { info() {} },
    fetcher: {
      async fetch() {
        calls++
        return { events: [], instances: [] }
      },
    },
  })

  for (
    const [path, message] of [
      ['/api/events?start=banana', 'invalid start "banana", want YYYY-MM-DD\n'],
      ['/api/events?start=2026-02-29', 'invalid start "2026-02-29", want YYYY-MM-DD\n'],
      ['/api/events?end=2026-13-01', 'invalid end "2026-13-01", want YYYY-MM-DD\n'],
      ['/api/events?start=2026-08-01&end=2026-08-01', 'end must be after start\n'],
      ['/api/events?start=2026-08-02&end=2026-08-01', 'end must be after start\n'],
    ] as const
  ) {
    const response = await request(app, path)
    assertEquals(response.status, 400, path)
    assertEquals(await response.text(), message, path)
  }
  assertEquals(calls, 0)
})

Deno.test('ICS authenticates before date validation and returns calendar cache headers', async () => {
  let calls = 0
  const app = createApp({
    config: copyConfig('sekrit'),
    now: () => new Date('2026-07-11T00:00:00Z'),
    logger: { info() {} },
    fetcher: {
      async fetch() {
        calls++
        return { events: [event], instances: [] }
      },
    },
  })

  for (const path of ['/calendar.ics?start=banana', '/calendar.ics?token=wrong&start=banana']) {
    const response = await request(app, path)
    assertEquals(response.status, 401)
    assertEquals(await response.text(), 'unauthorized\n')
  }
  const invalid = await request(app, '/calendar.ics?token=sekrit&start=banana')
  assertEquals(invalid.status, 400)
  assertStringIncludes(await invalid.text(), 'invalid start')

  const response = await request(app, '/calendar.ics?token=sekrit&start=2026-07-01&end=2026-08-01')
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('content-type'), 'text/calendar; charset=utf-8')
  assertEquals(response.headers.get('cache-control'), 'max-age=65')
  const calendar = await response.text()
  assertStringIncludes(calendar, 'BEGIN:VCALENDAR')
  assertStringIncludes(calendar, 'sonarr-tv-1@arr-cal-proxy')
  assertEquals(calls, 1)
})

Deno.test('health is static and does not fetch upstream instances', async () => {
  let calls = 0
  const app = createApp({
    config: copyConfig(),
    logger: { info() {} },
    fetcher: {
      async fetch() {
        calls++
        return { events: [], instances: [] }
      },
    },
  })
  const response = await app.fetch(new Request('http://localhost/api/health'))
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assertEquals(await response.json(), { status: 'ok', instances: 1 })
  assertEquals(calls, 0)
})

Deno.test('static handler serves files, SPA fallback, HEAD, and rejects traversal', async () => {
  const app = createApp({
    config: copyConfig(),
    staticDir: 'frontend',
    logger: { info() {} },
    fetcher: {
      async fetch() {
        return { events: [], instances: [] }
      },
    },
  })

  const index = await request(app, '/')
  assertEquals(index.status, 200)
  assertStringIncludes(await index.text(), '<!doctype html>')

  const asset = await request(app, '/vite.config.ts')
  assertEquals(asset.status, 200)
  assertStringIncludes(await asset.text(), 'defineConfig')

  const fallback = await request(app, '/some/client/route')
  assertEquals(fallback.status, 200)
  assertStringIncludes(await fallback.text(), '<!doctype html>')

  const head = await request(app, '/vite.config.ts', { method: 'HEAD' })
  assertEquals(head.status, 200)
  assertEquals(await head.text(), '')
  assertEquals(head.headers.get('content-type'), 'application/octet-stream')

  const traversal = await request(app, '/%2e%2e%2fconfig.example.yaml')
  assertEquals(traversal.status, 404)
})

Deno.test('unsupported methods return 405 and an Allow header', async () => {
  const app = createApp({
    config: copyConfig(),
    logger: { info() {} },
    fetcher: {
      async fetch() {
        return { events: [], instances: [] }
      },
    },
  })
  for (const path of ['/api/events', '/api/health', '/calendar.ics']) {
    const response = await request(app, path, { method: 'HEAD' })
    assertEquals(response.status, 200, path)
    assertEquals(await response.text(), '', path)
  }
  for (const path of ['/api/events', '/api/health', '/calendar.ics', '/', '/client-route']) {
    const response = await request(app, path, { method: 'POST' })
    assertEquals(response.status, 405, path)
    assertEquals(response.headers.get('allow'), 'GET, HEAD', path)
    assertMatch(await response.text(), /Method Not Allowed/)
  }
})

import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert'

import type { Config } from '../src/config.ts'
import type { CalendarEvent } from '../src/domain/event.ts'
import { type AuthClient, createApp, type Logger } from '../src/http/app.ts'
import { signFeedToken, verifyFeedToken } from '../src/services/tokens.ts'

const config: Config = {
  listen: ':0',
  cache: { ttlMs: 65_500 },
  calendar: {
    pastDays: 30,
    futureDays: 90,
    name: 'Test Calendar',
    availabilityDelayMs: 0,
    feedSecret: '',
  },
  branding: { name: 'calthing', iconUrl: '', pageTitle: '', description: '' },
  jellyfin: { url: '', publicUrl: '', apiKey: '' },
  instances: [{
    name: 'tv',
    type: 'sonarr',
    url: 'http://tv.example',
    apiKey: 'key',
    includeUnmonitored: false,
  }],
}

const browserDeviceId = '00000000-0000-4000-8000-000000000001'

const event: CalendarEvent = {
  uid: 'sonarr-tv-1@calthing',
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

function copyConfig(feedSecret = ''): Config {
  return {
    ...config,
    cache: { ...config.cache },
    calendar: { ...config.calendar, feedSecret },
    jellyfin: feedSecret
      ? { ...config.jellyfin, url: 'http://jellyfin.example' }
      : { ...config.jellyfin },
    instances: config.instances.map((instance) => ({ ...instance })),
  }
}

/** Stub Jellyfin: one account (alice/right) whose session token is "jf-token". */
const stubAuth: AuthClient = {
  async authenticate(username, password) {
    if (username !== 'alice' || password !== 'right') return null
    return {
      token: 'jf-token',
      user: {
        id: 'user-1',
        name: 'alice',
        avatarUrl: 'https://jf.example/Users/user-1/Images/Primary?tag=t1',
      },
    }
  },
  async user(token) {
    return token === 'jf-token'
      ? {
        id: 'user-1',
        name: 'alice',
        avatarUrl: 'https://jf.example/Users/user-1/Images/Primary?tag=t1',
      }
      : null
  },
  async logout() {},
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
      ['/api/events?start=2025-01-01&end=2027-01-01', 'date window must not exceed 370 days\n'],
      ['/api/events?start=2026-08-02&end=2026-08-01', 'end must be after start\n'],
    ] as const
  ) {
    const response = await request(app, path)
    assertEquals(response.status, 400, path)
    assertEquals(await response.text(), message, path)
  }
  assertEquals(calls, 0)
})

Deno.test('ICS requires a per-user feed token before date validation and returns cache headers', async () => {
  let calls = 0
  const app = createApp({
    config: copyConfig('feed-secret'),
    auth: stubAuth,
    now: () => new Date('2026-07-11T00:00:00Z'),
    logger: { info() {} },
    fetcher: {
      async fetch() {
        calls++
        return { events: [event], instances: [] }
      },
    },
  })

  const otherSecret = await signFeedToken('other-secret', 'user-1')
  for (
    const path of [
      '/calendar.ics?start=banana',
      '/calendar.ics?token=wrong&start=banana',
      `/calendar.ics?token=${otherSecret}`,
    ]
  ) {
    const response = await request(app, path)
    assertEquals(response.status, 401, path)
    assertEquals(await response.text(), 'unauthorized\n')
  }

  const token = await signFeedToken('feed-secret', 'user-1')
  const invalid = await request(app, `/calendar.ics?token=${token}&start=banana`)
  assertEquals(invalid.status, 400)
  assertStringIncludes(await invalid.text(), 'invalid start')

  const response = await request(
    app,
    `/calendar.ics?token=${token}&start=2026-07-01&end=2026-08-01`,
  )
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('content-type'), 'text/calendar; charset=utf-8')
  assertEquals(response.headers.get('cache-control'), 'max-age=65')
  const calendar = await response.text()
  assertStringIncludes(calendar, 'BEGIN:VCALENDAR')
  assertStringIncludes(calendar, 'sonarr-tv-1@calthing')
  assertEquals(calls, 1)
})

Deno.test('login sets a session cookie, guards the API, and mints per-user feed tokens', async () => {
  const app = createApp({
    config: copyConfig('feed-secret'),
    auth: stubAuth,
    logger: { info() {} },
    fetcher: {
      async fetch() {
        return { events: [], instances: [] }
      },
    },
  })

  const wrong = await request(app, '/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      password: 'wrong',
      deviceId: browserDeviceId,
    }),
  })
  assertEquals(wrong.status, 401)
  assertEquals(await wrong.text(), 'unauthorized\n')

  const login = await request(app, '/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      password: 'right',
      deviceId: browserDeviceId,
    }),
  })
  assertEquals(login.status, 200)
  const cookie = login.headers.get('set-cookie') ?? ''
  assertStringIncludes(cookie, 'calthing_session=jf-token')
  assertStringIncludes(cookie, 'HttpOnly')
  assertStringIncludes(cookie, 'Secure')
  assertEquals(login.headers.get('cache-control'), 'private, no-store')
  assertEquals(login.headers.get('vary'), 'Cookie')
  const body = await login.json()
  assertEquals(body.name, 'alice')
  assertEquals(body.avatarUrl, 'https://jf.example/Users/user-1/Images/Primary?tag=t1')
  assertEquals(await verifyFeedToken('feed-secret', body.feedToken), 'user-1')

  const anonymous = await request(app, '/api/events')
  assertEquals(anonymous.status, 401)
  assertEquals(anonymous.headers.get('cache-control'), 'private, no-store')
  assertEquals(anonymous.headers.get('vary'), 'Cookie')
  assertEquals(anonymous.headers.get('x-content-type-options'), 'nosniff')
  const anonymousMe = await request(app, '/api/me')
  assertEquals(anonymousMe.status, 401)

  const sessionHeaders = { cookie: 'calthing_session=jf-token' }
  const events = await request(app, '/api/events', { headers: sessionHeaders })
  assertEquals(events.status, 200)
  assertEquals(events.headers.get('cache-control'), 'private, no-store')
  assertEquals(events.headers.get('vary'), 'Cookie')
  const me = await request(app, '/api/me', { headers: sessionHeaders })
  assertEquals(me.status, 200)
  assertEquals(me.headers.get('cache-control'), 'private, no-store')
  assertEquals(me.headers.get('vary'), 'Cookie')
  assertEquals(await me.json(), body)

  const staleSession = await request(app, '/api/events', {
    headers: { cookie: 'calthing_session=revoked' },
  })
  assertEquals(staleSession.status, 401)

  const logout = await request(app, '/api/logout', { method: 'POST', headers: sessionHeaders })
  assertEquals(logout.status, 200)
  const clearedCookie = logout.headers.get('set-cookie') ?? ''
  assertStringIncludes(clearedCookie, 'calthing_session=')
  assertStringIncludes(clearedCookie, 'Max-Age=0')
  assertStringIncludes(clearedCookie, 'Secure')
  assertEquals(logout.headers.get('cache-control'), 'private, no-store')
  assertEquals(logout.headers.get('vary'), 'Cookie')
})

Deno.test('auth disabled keeps the API and feed public and /api/me anonymous', async () => {
  const app = createApp({
    config: copyConfig(),
    logger: { info() {} },
    fetcher: {
      async fetch() {
        return { events: [], instances: [] }
      },
    },
  })

  assertEquals((await request(app, '/api/events')).status, 200)
  assertEquals((await request(app, '/calendar.ics')).status, 200)
  const me = await request(app, '/api/me')
  assertEquals(me.status, 200)
  assertEquals(await me.json(), { name: '', feedToken: '', avatarUrl: '' })
  const login = await request(app, '/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      password: 'right',
      deviceId: browserDeviceId,
    }),
  })
  assertEquals(login.status, 404)
})

Deno.test('Jellyfin outages return 502 for login but 503 for session validation', async () => {
  const app = createApp({
    config: copyConfig('feed-secret'),
    auth: {
      authenticate() {
        return Promise.reject(new Error('connection refused'))
      },
      user() {
        return Promise.reject(new Error('connection refused'))
      },
      async logout() {},
    },
    logger: { info() {} },
    fetcher: {
      async fetch() {
        return { events: [], instances: [] }
      },
    },
  })

  const login = await request(app, '/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'alice',
      password: 'right',
      deviceId: browserDeviceId,
    }),
  })
  assertEquals(login.status, 502)
  assertEquals(await login.text(), 'jellyfin unreachable\n')

  // An outage is not proof that a revalidated token is invalid.
  for (const path of ['/api/events', '/api/me']) {
    const response = await request(app, path, {
      headers: { cookie: 'calthing_session=jf-token' },
    })
    assertEquals(response.status, 503, path)
    assertEquals(await response.text(), 'session validation unavailable\n', path)
    assertEquals(response.headers.get('content-type'), 'text/plain; charset=utf-8', path)
    assertEquals(response.headers.get('x-content-type-options'), 'nosniff', path)
    assertEquals(response.headers.get('cache-control'), 'private, no-store', path)
    assertEquals(response.headers.get('vary'), 'Cookie', path)
  }
})

Deno.test('logout clears the cookie without waiting for upstream revocation', async () => {
  let releaseLogout: (() => void) | undefined
  let logoutStarted = false
  const auth: AuthClient = {
    ...stubAuth,
    logout() {
      logoutStarted = true
      return new Promise<void>((resolve) => {
        releaseLogout = resolve
      })
    },
  }
  const app = createApp({
    config: copyConfig('feed-secret'),
    auth,
    logger: { info() {} },
    fetcher: {
      async fetch() {
        return { events: [], instances: [] }
      },
    },
  })

  const pendingResponse = request(app, '/api/logout', {
    method: 'POST',
    headers: { cookie: 'calthing_session=jf-token' },
  })
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const outcome = await Promise.race([
    pendingResponse,
    new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), 50)
    }),
  ])
  clearTimeout(timeoutId)

  assertEquals(logoutStarted, true)
  assert(outcome instanceof Response)
  assertEquals(outcome.status, 200)
  assertStringIncludes(outcome.headers.get('set-cookie') ?? '', 'Max-Age=0')
  const replay = await request(app, '/api/events', {
    headers: { cookie: 'calthing_session=jf-token' },
  })
  assertEquals(replay.status, 401, 'a logged-out token is rejected before upstream revocation')
  releaseLogout?.()
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

Deno.test('static handler serves files, falls back only for SPA paths, and rejects traversal', async () => {
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
  assertEquals(index.headers.get('cache-control'), 'no-cache')
  assertStringIncludes(await index.text(), '<!doctype html>')

  const file = await request(app, '/vite.config.ts')
  assertEquals(file.status, 200)
  assertEquals(file.headers.get('cache-control'), 'no-cache')
  assertEquals(file.headers.get('content-length'), null)
  assertStringIncludes(await file.text(), 'defineConfig')

  const fallback = await request(app, '/some/client/route')
  assertEquals(fallback.status, 200)
  assertEquals(fallback.headers.get('cache-control'), 'no-cache')
  assertStringIncludes(await fallback.text(), '<!doctype html>')

  const missingAsset = await request(app, '/some/client/route.js')
  assertEquals(missingAsset.status, 404)
  assertEquals(await missingAsset.text(), 'Not Found\n')

  const unknownApi = await request(app, '/api/typo')
  assertEquals(unknownApi.status, 404)
  assertEquals(await unknownApi.text(), 'Not Found\n')
  assertEquals(unknownApi.headers.get('content-type'), 'text/plain; charset=utf-8')

  const head = await request(app, '/vite.config.ts', { method: 'HEAD' })
  assertEquals(head.status, 200)
  assertEquals(await head.text(), '')
  assertEquals(head.headers.get('content-type'), 'application/octet-stream')

  const traversal = await request(app, '/%2e%2e%2fconfig.example.yaml')
  assertEquals(traversal.status, 404)
})

Deno.test('static handler gives hashed assets immutable cache headers and contains symlinks', async () => {
  const { createStaticHandler } = await import('../src/http/static.ts')
  const encoder = new TextEncoder()
  const contents = new Map([
    ['/srv/index.html', encoder.encode('<!doctype html>')],
    ['/srv/icon.svg', encoder.encode('<svg/>')],
    ['/srv/assets/index-AbCd1234.css', encoder.encode('body { color: black }')],
    ['/srv/assets/custom.css', encoder.encode('body { color: red }')],
  ])
  const handler = createStaticHandler('/srv', {
    realPath(path) {
      return Promise.resolve(path === '/srv/assets/leak.css' ? '/outside/leak.css' : path)
    },
    readFile(path) {
      const content = contents.get(path)
      if (!content) throw new Deno.errors.NotFound()
      return Promise.resolve(content)
    },
    stat(path) {
      const content = contents.get(path)
      if (!content) throw new Deno.errors.NotFound()
      return Promise.resolve({ isFile: true })
    },
  })
  const get = async (path: string, method = 'GET') => {
    const response = await handler(new Request(`http://localhost${path}`, { method }))
    assert(response)
    return response
  }

  const asset = await get('/assets/index-AbCd1234.css')
  assertEquals(asset.status, 200)
  assertEquals(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assertEquals(asset.headers.get('content-type'), 'text/css; charset=utf-8')
  assertEquals(asset.headers.get('content-length'), null)

  const head = await get('/assets/index-AbCd1234.css', 'HEAD')
  assertEquals(head.headers.get('content-length'), null)
  assertEquals(await head.text(), 'body { color: black }')

  const unhashedAsset = await get('/assets/custom.css')
  assertEquals(unhashedAsset.headers.get('cache-control'), 'no-cache')

  const icon = await get('/icon.svg')
  assertEquals(icon.headers.get('cache-control'), 'no-cache')

  const fallback = await get('/calendar/month')
  assertEquals(fallback.headers.get('cache-control'), 'no-cache')
  assertEquals(await fallback.text(), '<!doctype html>')

  assertEquals((await get('/assets/missing.js')).status, 404)
  assertEquals((await get('/assets/leak.css')).status, 404)
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
  for (const path of ['/api/auth', '/api/logout']) {
    const response = await request(app, path)
    assertEquals(response.status, 405, path)
    assertEquals(response.headers.get('allow'), 'POST', path)
  }
  const me = await request(app, '/api/me', { method: 'PUT' })
  assertEquals(me.status, 405)
  assertEquals(me.headers.get('allow'), 'GET, HEAD')
})

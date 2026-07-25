import { Elysia, t } from 'elysia'

import { toEventDto } from '../domain/event.ts'
import type { CalendarEvent } from '../domain/event.ts'
import { generateCalendar } from '../services/ical.ts'
import { signFeedToken, verifyFeedToken } from '../services/tokens.ts'
import { createStaticHandler } from './static.ts'
import type { InstanceStatusDto } from '../../shared/api.ts'

export interface AppConfig {
  cache: { ttlMs: number }
  calendar: { pastDays: number; futureDays: number; name: string; feedSecret: string }
  branding: { name: string; iconUrl: string; pageTitle: string; description: string }
  instances: readonly unknown[]
}

export interface AuthUser {
  id: string
  name: string
  avatarUrl: string
}

/** Jellyfin-backed login; see src/upstream/jellyfin.ts for the production client. */
export interface AuthClient {
  authenticate(
    username: string,
    password: string,
  ): Promise<{ token: string; user: AuthUser } | null>
  user(token: string): Promise<AuthUser | null>
  logout(token: string): Promise<void>
}

export interface AppFetcher {
  fetch(start: Date, end: Date): Promise<{
    events: CalendarEvent[]
    instances: InstanceStatusDto[]
  }>
}

export interface Logger {
  info(message: string, details: Record<string, unknown>): void
}

export interface AppDependencies {
  config: AppConfig
  fetcher: AppFetcher
  auth?: AuthClient
  staticDir?: string
  now?: () => Date
  logger?: Logger
}

const querySchema = t.Object({
  start: t.Optional(t.String()),
  end: t.Optional(t.String()),
  token: t.Optional(t.String()),
})

const eventSchema = t.Object({
  uid: t.String(),
  instance: t.String(),
  source: t.Union([t.Literal('radarr'), t.Literal('sonarr')]),
  kind: t.Union([
    t.Literal('episode'),
    t.Literal('movie-cinema'),
    t.Literal('movie-digital'),
    t.Literal('movie-physical'),
  ]),
  title: t.String(),
  subtitle: t.String(),
  season: t.Number(),
  episode: t.Number(),
  start: t.String(),
  end: t.String(),
  allDay: t.Boolean(),
  downloaded: t.Boolean(),
  overview: t.String(),
  posterUrl: t.String(),
  jellyfinUrl: t.String(),
})

const instanceStatusSchema = t.Object({
  name: t.String(),
  type: t.Union([t.Literal('radarr'), t.Literal('sonarr')]),
  ok: t.Boolean(),
  error: t.Optional(t.String()),
  fetchedAt: t.String(),
})

const eventsResponseSchema = t.Object({
  events: t.Array(eventSchema),
  instances: t.Array(instanceStatusSchema),
  branding: t.Object({
    name: t.String(),
    iconUrl: t.String(),
    pageTitle: t.String(),
    description: t.String(),
  }),
})

const healthResponseSchema = t.Object({
  status: t.Literal('ok'),
  instances: t.Number(),
})

const meResponseSchema = t.Object({
  name: t.String(),
  feedToken: t.String(),
  avatarUrl: t.String(),
})

const loginBodySchema = t.Object({
  username: t.String({ minLength: 1 }),
  password: t.String(),
})

const SESSION_COOKIE = 'calthing_session'

// 400 days is the maximum browsers accept; the Jellyfin token stays valid
// until it is revoked, we just re-check it periodically.
const SESSION_MAX_AGE = 60 * 60 * 24 * 400

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return cookies
}

function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return undefined
  }
  return parsed
}

function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function resolveWindow(
  query: { start?: string; end?: string },
  config: AppConfig,
  now: Date,
): { start: Date; end: Date } | string {
  const today = utcToday(now)
  let start = addDays(today, -config.calendar.pastDays)
  let end = addDays(today, config.calendar.futureDays)

  if (query.start) {
    const parsed = parseDate(query.start)
    if (!parsed) return `invalid start ${JSON.stringify(query.start)}, want YYYY-MM-DD`
    start = parsed
  }
  if (query.end) {
    const parsed = parseDate(query.end)
    if (!parsed) return `invalid end ${JSON.stringify(query.end)}, want YYYY-MM-DD`
    end = parsed
  }
  if (end.getTime() <= start.getTime()) return 'end must be after start'
  return { start, end }
}

const defaultLogger: Logger = {
  info(message, details) {
    console.info(message, details)
  },
}

const errorHeaders = {
  'content-type': 'text/plain; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

export function createApp(dependencies: AppDependencies) {
  const { config, fetcher, auth } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const logger = dependencies.logger ?? defaultLogger
  const staticHandler = createStaticHandler(dependencies.staticDir)
  const requestStarted = new WeakMap<Request, number>()
  const authEnabled = auth !== undefined

  const sessionCookie = (token: string, maxAge: number = SESSION_MAX_AGE) =>
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`

  /** Resolves the session cookie to a Jellyfin user (null = not logged in). */
  const currentUser = async (cookieHeader: string | undefined): Promise<AuthUser | null> => {
    if (!auth) return null
    const token = parseCookies(cookieHeader)[SESSION_COOKIE]
    if (!token) return null
    try {
      return await auth.user(token)
    } catch {
      return null // Jellyfin unreachable — treat as logged out
    }
  }

  const methodNotAllowed = (allow: string) => () =>
    new Response('Method Not Allowed\n', {
      status: 405,
      headers: { ...errorHeaders, allow },
    })

  const serveStatic = async ({ request }: { request: Request }) =>
    await staticHandler(request) ??
      new Response('Not Found\n', { status: 404, headers: errorHeaders })

  return new Elysia()
    .onRequest(({ request }) => {
      requestStarted.set(request, performance.now())
    })
    .onAfterHandle(({ request }) => {
      const started = requestStarted.get(request)
      logger.info('request', {
        method: request.method,
        path: new URL(request.url).pathname,
        durationMs: Math.round(performance.now() - (started ?? performance.now())),
      })
    })
    .get('/api/events', async ({ query, headers, set, status }) => {
      if (authEnabled && await currentUser(headers.cookie) === null) {
        Object.assign(set.headers, errorHeaders)
        return status(401, 'unauthorized\n')
      }
      const window = resolveWindow(query, config, now())
      if (typeof window === 'string') {
        Object.assign(set.headers, errorHeaders)
        return status(400, `${window}\n`)
      }
      const result = await fetcher.fetch(window.start, window.end)
      set.headers['content-type'] = 'application/json; charset=utf-8'
      return {
        events: result.events.map(toEventDto),
        instances: result.instances,
        branding: config.branding,
      }
    }, {
      query: querySchema,
      response: {
        200: eventsResponseSchema,
        400: t.String(),
        401: t.String(),
      },
    })
    .post('/api/auth', async ({ body, set, status }) => {
      if (!authEnabled || !auth) {
        Object.assign(set.headers, errorHeaders)
        return status(404, 'auth disabled\n')
      }
      let session: Awaited<ReturnType<AuthClient['authenticate']>>
      try {
        session = await auth.authenticate(body.username, body.password)
      } catch {
        Object.assign(set.headers, errorHeaders)
        return status(502, 'jellyfin unreachable\n')
      }
      if (session === null) {
        Object.assign(set.headers, errorHeaders)
        return status(401, 'unauthorized\n')
      }
      set.headers['set-cookie'] = sessionCookie(session.token)
      set.headers['content-type'] = 'application/json; charset=utf-8'
      return {
        name: session.user.name,
        feedToken: await signFeedToken(config.calendar.feedSecret, session.user.id),
        avatarUrl: session.user.avatarUrl,
      }
    }, {
      body: loginBodySchema,
      response: {
        200: meResponseSchema,
        401: t.String(),
        404: t.String(),
        502: t.String(),
      },
    })
    .post('/api/logout', async ({ headers, set }) => {
      const token = parseCookies(headers.cookie)[SESSION_COOKIE]
      if (token && auth) await auth.logout(token)
      set.headers['set-cookie'] = sessionCookie('', 0)
      set.headers['content-type'] = 'application/json; charset=utf-8'
      return { ok: true as const }
    }, {
      response: { 200: t.Object({ ok: t.Literal(true) }) },
    })
    .get('/api/me', async ({ headers, set, status }) => {
      set.headers['content-type'] = 'application/json; charset=utf-8'
      if (!authEnabled) return { name: '', feedToken: '', avatarUrl: '' }
      const user = await currentUser(headers.cookie)
      if (user === null) {
        Object.assign(set.headers, errorHeaders)
        return status(401, 'unauthorized\n')
      }
      return {
        name: user.name,
        feedToken: await signFeedToken(config.calendar.feedSecret, user.id),
        avatarUrl: user.avatarUrl,
      }
    }, {
      response: {
        200: meResponseSchema,
        401: t.String(),
      },
    })
    .get('/api/health', ({ set }) => {
      set.headers['content-type'] = 'application/json; charset=utf-8'
      return {
        status: 'ok' as const,
        instances: config.instances.length,
      }
    }, {
      response: healthResponseSchema,
    })
    .get('/calendar.ics', async ({ query, set, status }) => {
      if (authEnabled) {
        const userId = query.token
          ? await verifyFeedToken(config.calendar.feedSecret, query.token)
          : null
        if (userId === null) {
          Object.assign(set.headers, errorHeaders)
          return status(401, 'unauthorized\n')
        }
      }
      const window = resolveWindow(query, config, now())
      if (typeof window === 'string') {
        Object.assign(set.headers, errorHeaders)
        return status(400, `${window}\n`)
      }
      const result = await fetcher.fetch(window.start, window.end)
      set.headers['content-type'] = 'text/calendar; charset=utf-8'
      set.headers['cache-control'] = `max-age=${Math.trunc(config.cache.ttlMs / 1000)}`
      return generateCalendar(config.calendar.name, result.events, now())
    }, {
      query: querySchema,
      response: {
        200: t.String(),
        400: t.String(),
        401: t.String(),
      },
    })
    .all('/api/events', methodNotAllowed('GET, HEAD'))
    .all('/api/health', methodNotAllowed('GET, HEAD'))
    .all('/api/me', methodNotAllowed('GET, HEAD'))
    .all('/api/auth', methodNotAllowed('POST'))
    .all('/api/logout', methodNotAllowed('POST'))
    .all('/calendar.ics', methodNotAllowed('GET, HEAD'))
    .head('/', serveStatic)
    .get('/', serveStatic)
    .head('/*', serveStatic)
    .get('/*', serveStatic)
    .all('/', methodNotAllowed('GET, HEAD'))
    .all('/*', methodNotAllowed('GET, HEAD'))
}

export type App = ReturnType<typeof createApp>

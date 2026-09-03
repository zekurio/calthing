import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { Type } from '@sinclair/typebox'

import {
  type BrandingDto,
  type EventsResponse,
  type HealthResponse,
  type InstanceStatusDto,
  LoginRequestSchema,
  MAX_CALENDAR_WINDOW_DAYS,
  type MeDto,
} from '../../shared/api.ts'
import { toEventDto } from '../domain/event.ts'
import type { CalendarEvent } from '../domain/event.ts'
import { generateCalendar } from '../services/ical.ts'
import { signFeedToken, verifyFeedToken } from '../services/tokens.ts'
import { createStaticHandler } from './static.ts'
import { typeboxValidator } from './validation.ts'

export interface AppConfig {
  cache: { ttlMs: number }
  calendar: {
    pastDays: number
    futureDays: number
    name: string
    availabilityDelayMs: number
    feedSecret: string
  }
  branding: BrandingDto
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
    deviceId: string,
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

const CalendarQuerySchema = Type.Object({
  start: Type.Optional(Type.String()),
  end: Type.Optional(Type.String()),
  token: Type.Optional(Type.String()),
})

const SESSION_COOKIE = 'calthing_session'

// 400 days is the maximum browsers accept; the Jellyfin token stays valid
// until revoked and is revalidated with Jellyfin on every protected request.
const SESSION_MAX_AGE = 60 * 60 * 24 * 400

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
  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  if (days > MAX_CALENDAR_WINDOW_DAYS) {
    return `date window must not exceed ${MAX_CALENDAR_WINDOW_DAYS} days`
  }
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

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' }

const privateSessionHeaders = {
  'cache-control': 'private, no-store',
  vary: 'Cookie',
}

export function createApp(dependencies: AppDependencies) {
  const { config, fetcher, auth } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const logger = dependencies.logger ?? defaultLogger
  const staticHandler = createStaticHandler(dependencies.staticDir)
  const revokedSessions = new Set<string>()
  const authEnabled = auth !== undefined

  const setSessionCookie = (
    context: Parameters<typeof setCookie>[0],
    token: string,
    maxAge: number,
  ) =>
    setCookie(context, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'Lax',
      maxAge,
    })

  /** Resolves the session cookie; upstream failures propagate so callers can answer 503. */
  const currentUser = async (token: string | undefined): Promise<AuthUser | null> => {
    if (!auth || !token || revokedSessions.has(token)) return null
    return await auth.user(token)
  }

  const api = new Hono()
    .get(
      '/events',
      typeboxValidator('query', CalendarQuerySchema),
      async (context) => {
        if (authEnabled) {
          context.header('cache-control', privateSessionHeaders['cache-control'])
          context.header('vary', privateSessionHeaders.vary)
          try {
            const token = getCookie(context, SESSION_COOKIE)
            if (await currentUser(token) === null) {
              return context.text('unauthorized\n', 401, errorHeaders)
            }
          } catch {
            return context.text('session validation unavailable\n', 503, errorHeaders)
          }
        }
        const query = context.req.valid('query')
        const window = resolveWindow(query, config, now())
        if (typeof window === 'string') {
          return context.text(`${window}\n`, 400, errorHeaders)
        }
        const result = await fetcher.fetch(window.start, window.end)
        const response: EventsResponse = {
          events: result.events.map(toEventDto),
          instances: result.instances,
          branding: config.branding,
        }
        return context.json(response, 200, jsonHeaders)
      },
    )
    .post(
      '/auth',
      typeboxValidator('json', LoginRequestSchema),
      async (context) => {
        if (!authEnabled || !auth) {
          return context.text('auth disabled\n', 404, {
            ...privateSessionHeaders,
            ...errorHeaders,
          })
        }
        const body = context.req.valid('json')
        let session: Awaited<ReturnType<AuthClient['authenticate']>>
        try {
          session = await auth.authenticate(body.username, body.password, body.deviceId)
        } catch {
          return context.text('jellyfin unreachable\n', 502, {
            ...privateSessionHeaders,
            ...errorHeaders,
          })
        }
        if (session === null) {
          return context.text('unauthorized\n', 401, {
            ...privateSessionHeaders,
            ...errorHeaders,
          })
        }
        revokedSessions.delete(session.token)
        setSessionCookie(context, session.token, SESSION_MAX_AGE)
        const response: MeDto = {
          name: session.user.name,
          feedToken: await signFeedToken(config.calendar.feedSecret, session.user.id),
          avatarUrl: session.user.avatarUrl,
        }
        return context.json(response, 200, { ...privateSessionHeaders, ...jsonHeaders })
      },
    )
    .post('/logout', (context) => {
      const token = getCookie(context, SESSION_COOKIE)
      setSessionCookie(context, '', 0)
      if (token && auth) {
        rememberRevokedSession(revokedSessions, token)
        try {
          void auth.logout(token).catch(() => {})
        } catch {
          // A collaborator may throw before returning its best-effort promise.
        }
      }
      return context.json({ ok: true as const }, 200, {
        ...privateSessionHeaders,
        ...jsonHeaders,
      })
    })
    .get('/me', async (context) => {
      if (!authEnabled) {
        const response: MeDto = { name: '', feedToken: '', avatarUrl: '' }
        return context.json(response, 200, { ...privateSessionHeaders, ...jsonHeaders })
      }

      let user: AuthUser | null
      try {
        user = await currentUser(getCookie(context, SESSION_COOKIE))
      } catch {
        return context.text('session validation unavailable\n', 503, {
          ...privateSessionHeaders,
          ...errorHeaders,
        })
      }
      if (user === null) {
        return context.text('unauthorized\n', 401, {
          ...privateSessionHeaders,
          ...errorHeaders,
        })
      }
      const response: MeDto = {
        name: user.name,
        feedToken: await signFeedToken(config.calendar.feedSecret, user.id),
        avatarUrl: user.avatarUrl,
      }
      return context.json(response, 200, { ...privateSessionHeaders, ...jsonHeaders })
    })
    .get('/health', (context) => {
      const response: HealthResponse = {
        status: 'ok',
        instances: config.instances.length,
      }
      return context.json(response, 200, jsonHeaders)
    })

  return new Hono()
    .use('*', async (context, next) => {
      const started = performance.now()
      await next()
      logger.info('request', {
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        durationMs: Math.round(performance.now() - started),
      })
    })
    .use('*', async (context, next) => {
      const path = new URL(context.req.url).pathname
      const methods: Readonly<Record<string, readonly string[]>> = {
        '/api/events': ['GET', 'HEAD'],
        '/api/health': ['GET', 'HEAD'],
        '/api/me': ['GET', 'HEAD'],
        '/api/auth': ['POST'],
        '/api/logout': ['POST'],
        '/calendar.ics': ['GET', 'HEAD'],
      }
      const allowed = methods[path]
      if (allowed && !allowed.includes(context.req.method)) {
        return context.text('Method Not Allowed\n', 405, {
          ...errorHeaders,
          allow: allowed.join(', '),
        })
      }
      const isApi = path === '/api' || path.startsWith('/api/')
      if (!isApi && !['GET', 'HEAD'].includes(context.req.method)) {
        return context.text('Method Not Allowed\n', 405, {
          ...errorHeaders,
          allow: 'GET, HEAD',
        })
      }
      await next()
    })
    .route('/api', api)
    .get(
      '/calendar.ics',
      typeboxValidator('query', CalendarQuerySchema),
      async (context) => {
        const query = context.req.valid('query')
        if (authEnabled) {
          const userId = query.token
            ? await verifyFeedToken(config.calendar.feedSecret, query.token)
            : null
          if (userId === null) {
            return context.text('unauthorized\n', 401, errorHeaders)
          }
        }
        const window = resolveWindow(query, config, now())
        if (typeof window === 'string') {
          return context.text(`${window}\n`, 400, errorHeaders)
        }
        const result = await fetcher.fetch(window.start, window.end)
        return context.text(generateCalendar(config.calendar.name, result.events, now()), 200, {
          'content-type': 'text/calendar; charset=utf-8',
          'cache-control': `max-age=${Math.trunc(config.cache.ttlMs / 1000)}`,
        })
      },
    )
    .use('/api', async (context) => context.text('Not Found\n', 404, errorHeaders))
    .use('/api/*', async (context) => context.text('Not Found\n', 404, errorHeaders))
    .get(
      '*',
      async (context) =>
        await staticHandler(context.req.raw) ?? context.text('Not Found\n', 404, errorHeaders),
    )
    .onError((error, context) => {
      if (error instanceof HTTPException) {
        if (error.status === 400) {
          return context.text('invalid request\n', 400, errorHeaders)
        }
        return error.getResponse()
      }
      console.error(error)
      return context.text('Internal Server Error\n', 500, errorHeaders)
    })
}

export type AppType = ReturnType<typeof createApp>

function rememberRevokedSession(sessions: Set<string>, token: string): void {
  // Bound attacker-controlled cookie values while retaining recent local logout tombstones.
  const maxEntries = 1_024
  sessions.delete(token)
  sessions.add(token)
  while (sessions.size > maxEntries) {
    const oldest = sessions.values().next().value
    if (oldest === undefined) break
    sessions.delete(oldest)
  }
}

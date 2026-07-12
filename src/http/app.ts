import { Elysia, t } from 'elysia'

import { toEventDto } from '../domain/event.ts'
import type { CalendarEvent } from '../domain/event.ts'
import { generateCalendar } from '../services/ical.ts'
import { createStaticHandler } from './static.ts'
import type { InstanceStatusDto } from '../../shared/api.ts'

export interface AppConfig {
  cache: { ttlMs: number }
  calendar: { pastDays: number; futureDays: number; name: string }
  auth: { token: string }
  branding: { name: string; iconUrl: string; pageTitle: string; description: string }
  instances: readonly unknown[]
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

function tokenMatches(actual: string, expected: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(actual)
  const right = encoder.encode(expected)
  const length = Math.max(left.length, right.length)
  let different = left.length ^ right.length
  for (let index = 0; index < length; index++) different |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return different === 0
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
  const { config, fetcher } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const logger = dependencies.logger ?? defaultLogger
  const staticHandler = createStaticHandler(dependencies.staticDir)
  const requestStarted = new WeakMap<Request, number>()

  const methodNotAllowed = () =>
    new Response('Method Not Allowed\n', {
      status: 405,
      headers: { ...errorHeaders, allow: 'GET, HEAD' },
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
    .get('/api/events', async ({ query, set, status }) => {
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
      if (config.auth.token && !tokenMatches(query.token ?? '', config.auth.token)) {
        Object.assign(set.headers, errorHeaders)
        return status(401, 'unauthorized\n')
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
    .all('/api/events', methodNotAllowed)
    .all('/api/health', methodNotAllowed)
    .all('/calendar.ics', methodNotAllowed)
    .head('/', serveStatic)
    .get('/', serveStatic)
    .head('/*', serveStatic)
    .get('/*', serveStatic)
    .all('/', methodNotAllowed)
    .all('/*', methodNotAllowed)
}

export type App = ReturnType<typeof createApp>

import type { Instance } from '../src/config.ts'
import { fetchCalendar, type HttpFetch } from '../src/upstream/client.ts'

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEquals<T>(actual: T, expected: T, message = 'values differ'): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
    )
  }
}

function fixtureFetch(
  fixture: string,
  inspect: (url: URL, init: RequestInit) => void = () => undefined,
): HttpFetch {
  return async (input, init = {}) => {
    inspect(new URL(String(input)), init)
    const body = await Deno.readTextFile(new URL(`./fixtures/${fixture}`, import.meta.url))
    return new Response(body, { headers: { 'Content-Type': 'application/json' } })
  }
}

const start = new Date('2026-07-01T00:00:00Z')
const end = new Date('2026-08-01T00:00:00Z')

Deno.test('Sonarr request and normalization match the ARR contract', async () => {
  const instance: Instance = {
    name: 'tv',
    type: 'sonarr',
    url: 'https://arr.example/base',
    apiKey: 'sekrit',
    includeUnmonitored: false,
  }
  let inspected = false
  const events = await fetchCalendar(
    instance,
    start,
    end,
    fixtureFetch('sonarr_calendar.json', (url, init) => {
      inspected = true
      assertEquals(url.pathname, '/base/api/v3/calendar', 'calendar path')
      assertEquals(url.searchParams.get('start'), '2026-07-01T00:00:00Z')
      assertEquals(url.searchParams.get('end'), '2026-08-01T00:00:00Z')
      assertEquals(url.searchParams.get('unmonitored'), 'false')
      assertEquals(url.searchParams.get('includeSeries'), 'true')
      assertEquals(new Headers(init.headers).get('X-Api-Key'), 'sekrit')
      assertEquals(new Headers(init.headers).get('Accept'), 'application/json')
      assert(init.signal instanceof AbortSignal, 'request must carry a timeout signal')
    }),
  )

  assert(inspected, 'request was not inspected')
  assertEquals(events.length, 2, 'missing air date must be skipped')
  const first = events[0]
  assert(first !== undefined, 'first episode missing')
  assertEquals(first.uid, 'sonarr-tv-101@arr-cal-proxy')
  assertEquals(first.source, 'sonarr')
  assertEquals(first.kind, 'episode')
  assertEquals(first.instance, 'tv')
  assertEquals(first.title, 'Example Show')
  assertEquals(first.subtitle, 'The Beginning')
  assertEquals(first.season, 2)
  assertEquals(first.episode, 5)
  assertEquals(first.start.toISOString(), '2026-07-15T20:00:00.000Z')
  assertEquals(first.end.toISOString(), '2026-07-15T20:45:00.000Z')
  assertEquals(first.allDay, false)
  assertEquals(first.downloaded, false)
  assertEquals(first.posterUrl, 'https://images.example/poster.jpg')

  const fallback = events[1]
  assert(fallback !== undefined, 'fallback episode missing')
  assertEquals(fallback.end.getTime() - fallback.start.getTime(), 30 * 60_000)
  assertEquals(fallback.downloaded, true)
})

Deno.test('Radarr request and release normalization match the ARR contract', async () => {
  const instance: Instance = {
    name: 'movies',
    type: 'radarr',
    url: 'https://arr.example',
    apiKey: 'key',
    includeUnmonitored: true,
  }
  const events = await fetchCalendar(
    instance,
    start,
    end,
    fixtureFetch('radarr_calendar.json', (url) => {
      assertEquals(url.searchParams.get('unmonitored'), 'true')
      assertEquals(url.searchParams.has('includeSeries'), false)
    }),
  )

  assertEquals(events.length, 3, 'each in-window release should become an event')
  const byUid = new Map(events.map((event) => [event.uid, event]))
  assertEquals(byUid.has('radarr-movies-42-physical@arr-cal-proxy'), false)
  const cinema = byUid.get('radarr-movies-42-cinema@arr-cal-proxy')
  assert(cinema !== undefined, 'cinema release missing')
  assertEquals(cinema.kind, 'movie-cinema')
  assertEquals(cinema.allDay, true)
  assertEquals(cinema.start.toISOString(), '2026-07-10T00:00:00.000Z')
  assertEquals(cinema.end.toISOString(), '2026-07-11T00:00:00.000Z')
  assertEquals(cinema.posterUrl, 'https://images.example/movie-poster.jpg')
  assertEquals(cinema.overview, 'A movie about examples.')
  assertEquals(cinema.providerIds?.Tmdb, '24680')

  const digital = byUid.get('radarr-movies-43-digital@arr-cal-proxy')
  assert(digital !== undefined, 'digital release missing')
  assertEquals(digital.kind, 'movie-digital')
  assertEquals(digital.downloaded, true)
  assertEquals(digital.subtitle, '')
  assertEquals(digital.season, 0)
  assertEquals(digital.episode, 0)
})

Deno.test('ARR errors name the instance and bound upstream body text', async () => {
  const instance: Instance = {
    name: 'broken',
    type: 'sonarr',
    url: 'https://arr.example',
    apiKey: 'bad',
    includeUnmonitored: false,
  }
  const oversized = 'x'.repeat(800)
  let error: unknown
  try {
    await fetchCalendar(instance, start, end, async () => new Response(oversized, { status: 401 }))
  } catch (cause) {
    error = cause
  }
  assert(error instanceof Error, '401 should reject')
  assert(error.message.includes('instance broken'), 'error should name instance')
  assert(error.message.includes('returned 401'), 'error should name status')
  const includedBody = error.message.split(': ').at(-1) ?? ''
  assertEquals(includedBody.length, 512, 'error body should be bounded')
})

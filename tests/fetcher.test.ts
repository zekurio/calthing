import type { Instance } from '../src/config.ts'
import type { CalendarEvent } from '../src/domain/event.ts'
import { Fetcher } from '../src/services/fetcher.ts'
import type { ArrFetch } from '../src/upstream/client.ts'

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

const instances: Instance[] = [
  {
    name: 'tv',
    type: 'sonarr',
    url: 'http://tv',
    apiKey: 'k',
    includeUnmonitored: false,
  },
  {
    name: 'movies',
    type: 'radarr',
    url: 'http://movies',
    apiKey: 'k',
    includeUnmonitored: false,
  },
]

function testEvent(
  instance: Instance,
  start: Date,
  uid = `${instance.name}-event@test`,
): CalendarEvent {
  return {
    uid,
    instance: instance.name,
    source: instance.type,
    kind: instance.type === 'sonarr' ? 'episode' : 'movie-digital',
    title: instance.name,
    subtitle: '',
    season: 0,
    episode: 0,
    start,
    end: new Date(start.getTime() + 60_000),
    allDay: false,
    downloaded: false,
    overview: '',
    posterUrl: '',
  }
}

Deno.test('partial failures preserve successful events and configured status order', async () => {
  const upstream: ArrFetch = async (instance, start) => {
    if (instance.name === 'movies') {
      throw new Error('connection refused')
    }
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(instances, 60_000, upstream, () => new Date('2026-07-10T12:00:00Z'))
  const result = await fetcher.fetch(
    new Date('2026-07-01T06:00:00Z'),
    new Date('2026-07-08T21:00:00Z'),
  )

  assertEquals(result.events.length, 1)
  assertEquals(result.events[0]?.instance, 'tv')
  assertEquals(result.instances.map((status) => status.name).join(','), 'tv,movies')
  assertEquals(result.instances[0]?.ok, true)
  assertEquals(result.instances[0]?.error, undefined)
  assertEquals(result.instances[1]?.ok, false)
  assertEquals(result.instances[1]?.error, 'connection refused')
  assertEquals(result.instances[1]?.fetchedAt, '2026-07-10T12:00:00Z')
})

Deno.test('events merge deterministically by start then UID', async () => {
  const base = new Date('2026-07-10T00:00:00Z')
  const upstream: ArrFetch = async (instance) =>
    instance.name === 'tv'
      ? [
        testEvent(instance, new Date(base.getTime() + 48 * 60 * 60_000), 'z@test'),
        testEvent(instance, base, 'z-tie@test'),
      ]
      : [testEvent(instance, base, 'a-tie@test')]
  const result = await new Fetcher(instances, 60_000, upstream).fetch(
    base,
    new Date('2026-07-17T00:00:00Z'),
  )

  assertEquals(result.events.map((event) => event.uid).join(','), 'a-tie@test,z-tie@test,z@test')
})

Deno.test('episode availability delay shifts air time and expands Sonarr bounds', async () => {
  const requestedStart = new Date('2026-07-01T00:00:00Z')
  const requestedEnd = new Date('2026-08-01T00:00:00Z')
  let upstreamBounds = ''
  const upstream: ArrFetch = async (instance, start, end) => {
    upstreamBounds = `${start.toISOString()}|${end.toISOString()}`
    return [testEvent(instance, new Date('2026-06-30T23:30:00Z'))]
  }
  const fetcher = new Fetcher(
    instances.slice(0, 1),
    60_000,
    upstream,
    undefined,
    undefined,
    60 * 60_000,
  )

  const result = await fetcher.fetch(requestedStart, requestedEnd)

  assertEquals(upstreamBounds, '2026-06-30T23:00:00.000Z|2026-07-31T23:00:00.000Z')
  assertEquals(result.events[0]?.start.toISOString(), '2026-07-01T00:30:00.000Z')
  assertEquals(result.events[0]?.end.toISOString(), '2026-07-01T00:31:00.000Z')
})

Deno.test('UTC day cache keys share sub-day windows and expire at TTL', async () => {
  let calls = 0
  let monotonicNow = 0
  const seenBounds: string[] = []
  const upstream: ArrFetch = async (instance, start, end) => {
    calls++
    seenBounds.push(`${start.toISOString()}|${end.toISOString()}`)
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(
    instances.slice(0, 1),
    10 * 60_000,
    upstream,
    undefined,
    undefined,
    0,
    { monotonicNow: () => monotonicNow },
  )
  const start = new Date('2026-07-01T00:00:00Z')
  const end = new Date('2026-07-31T00:00:00Z')

  await fetcher.fetch(start, end)
  await fetcher.fetch(start, end)
  await fetcher.fetch(
    new Date('2026-07-01T03:00:00Z'),
    new Date('2026-07-31T05:00:00Z'),
  )
  assertEquals(calls, 1, 'same UTC day bounds should hit cache')
  assertEquals(seenBounds[0], '2026-07-01T00:00:00.000Z|2026-07-31T00:00:00.000Z')

  monotonicNow = 10 * 60_000
  await fetcher.fetch(start, end)
  assertEquals(calls, 2, 'entry is expired at the exact TTL boundary')
})

Deno.test('failed upstream results are cached for the same TTL', async () => {
  let calls = 0
  const upstream: ArrFetch = () => {
    calls++
    throw new Error('boom')
  }
  const fetcher = new Fetcher(instances.slice(0, 1), 60_000, upstream)
  const start = new Date('2026-07-01T00:00:00Z')
  const end = new Date('2026-07-08T00:00:00Z')

  const first = await fetcher.fetch(start, end)
  const second = await fetcher.fetch(start, end)
  assertEquals(calls, 1)
  assertEquals(first.instances[0]?.ok, false)
  assertEquals(second.instances[0]?.error, 'boom')
})

Deno.test('concurrent misses coalesce independently per cache key', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const callStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const upstream: ArrFetch = async (instance, start) => {
    calls++
    started()
    await gate
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(instances.slice(0, 1), 60_000, upstream)
  const start = new Date('2026-07-01T00:00:00Z')
  const end = new Date('2026-07-08T00:00:00Z')
  const requests = Array.from({ length: 10 }, () => fetcher.fetch(start, end))

  await callStarted
  await Promise.resolve()
  assertEquals(calls, 1, 'only one refresh should enter upstream')
  release()
  const results = await Promise.all(requests)
  assert(
    results.every((result) => result.events.length === 1),
    'all waiters should share the result',
  )
  assertEquals(calls, 1)
})

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

Deno.test('backward wall clock changes do not extend cache lifetime', async () => {
  let calls = 0
  let monotonicNow = 1_000
  let wallNow = new Date('2026-07-10T12:00:00Z')
  const upstream: ArrFetch = async (instance, start) => {
    calls++
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(
    instances.slice(0, 1),
    60_000,
    upstream,
    () => wallNow,
    undefined,
    0,
    { monotonicNow: () => monotonicNow },
  )
  const start = new Date('2026-07-01T00:00:00Z')
  const end = new Date('2026-07-08T00:00:00Z')

  const first = await fetcher.fetch(start, end)
  wallNow = new Date('2026-07-09T12:00:00Z')
  monotonicNow += 59_999
  await fetcher.fetch(start, end)
  assertEquals(calls, 1, 'entry should remain cached before the monotonic TTL')

  monotonicNow++
  const refreshed = await fetcher.fetch(start, end)
  assertEquals(calls, 2, 'entry should expire despite the backward wall clock jump')
  assertEquals(first.instances[0]?.fetchedAt, '2026-07-10T12:00:00Z')
  assertEquals(refreshed.instances[0]?.fetchedAt, '2026-07-09T12:00:00Z')
})

Deno.test('bounded cache evicts the least recently used window', async () => {
  let calls = 0
  const upstream: ArrFetch = async (instance, start) => {
    calls++
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(
    instances.slice(0, 1),
    60_000,
    upstream,
    undefined,
    undefined,
    0,
    { maxEntries: 2, monotonicNow: () => 0 },
  )
  const windows = [1, 2, 3].map((day) => ({
    start: new Date(`2026-07-0${day}T00:00:00Z`),
    end: new Date(`2026-07-0${day + 1}T00:00:00Z`),
  }))
  const first = windows[0]!
  const second = windows[1]!
  const third = windows[2]!

  await fetcher.fetch(first.start, first.end)
  await fetcher.fetch(second.start, second.end)
  await fetcher.fetch(first.start, first.end)
  await fetcher.fetch(third.start, third.end)
  await fetcher.fetch(first.start, first.end)
  assertEquals(calls, 3, 'recently used window should survive capacity eviction')

  await fetcher.fetch(second.start, second.end)
  assertEquals(calls, 4, 'least recently used window should be fetched again')
})

Deno.test('expired entries are pruned before capacity eviction', async () => {
  let calls = 0
  let monotonicNow = 0
  const upstream: ArrFetch = async (instance, start) => {
    calls++
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(
    instances.slice(0, 1),
    10,
    upstream,
    undefined,
    undefined,
    0,
    { maxEntries: 2, monotonicNow: () => monotonicNow },
  )
  const first = {
    start: new Date('2026-07-01T00:00:00Z'),
    end: new Date('2026-07-02T00:00:00Z'),
  }
  const second = {
    start: new Date('2026-07-02T00:00:00Z'),
    end: new Date('2026-07-03T00:00:00Z'),
  }
  const third = {
    start: new Date('2026-07-03T00:00:00Z'),
    end: new Date('2026-07-04T00:00:00Z'),
  }

  await fetcher.fetch(first.start, first.end)
  monotonicNow = 5
  await fetcher.fetch(second.start, second.end)
  await fetcher.fetch(first.start, first.end)
  monotonicNow = 11
  await fetcher.fetch(third.start, third.end)
  await fetcher.fetch(second.start, second.end)

  assertEquals(calls, 3, 'expired recent entry should be pruned instead of evicting a live entry')
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

Deno.test('concurrent misses coalesce only for truly identical cache keys', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const bothStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const upstream: ArrFetch = async (instance, start) => {
    calls++
    if (calls === 2) started()
    await gate
    return [testEvent(instance, start)]
  }
  const fetcher = new Fetcher(
    instances.slice(0, 1),
    60_000,
    upstream,
    undefined,
    undefined,
    0,
    { maxEntries: 1 },
  )
  const firstStart = new Date('2026-07-01T00:00:00Z')
  const firstEnd = new Date('2026-07-08T00:00:00Z')
  const secondStart = new Date('2026-08-01T00:00:00Z')
  const secondEnd = new Date('2026-08-08T00:00:00Z')
  const requests = [
    ...Array.from({ length: 5 }, () => fetcher.fetch(firstStart, firstEnd)),
    ...Array.from({ length: 5 }, () => fetcher.fetch(secondStart, secondEnd)),
  ]

  await bothStarted
  await Promise.resolve()
  assertEquals(calls, 2, 'each distinct window should start one upstream request')
  release()
  const results = await Promise.all(requests)
  assert(
    results.every((result) => result.events.length === 1),
    'all waiters should receive their key result',
  )
  assertEquals(calls, 2)
})

Deno.test('media linking and caller mutations are isolated from cached events', async () => {
  const start = new Date('2026-07-01T00:00:00Z')
  const end = new Date('2026-07-08T00:00:00Z')
  const upstream: ArrFetch = async (instance) => {
    const event = testEvent(instance, start)
    event.providerIds = { tvdb: '123' }
    return [event]
  }
  let linkerCalls = 0
  const initialTitles: string[] = []
  let firstStarted!: () => void
  const firstLinkStarted = new Promise<void>((resolve) => {
    firstStarted = resolve
  })
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const linker = {
    async addLinks(events: CalendarEvent[]) {
      const call = ++linkerCalls
      const event = events[0]!
      initialTitles.push(event.title)
      event.title = `linked-${call}`
      if (call === 1) {
        firstStarted()
        await firstGate
      } else if (call === 2) {
        releaseFirst()
      }
    },
  }
  const fetcher = new Fetcher(instances.slice(0, 1), 60_000, upstream, undefined, linker)

  const firstPending = fetcher.fetch(start, end)
  await firstLinkStarted
  const second = await fetcher.fetch(start, end)
  const first = await firstPending

  assertEquals(first.events[0]?.title, 'linked-1')
  assertEquals(second.events[0]?.title, 'linked-2')
  assertEquals(initialTitles.join(','), 'tv,tv')

  const firstEvent = first.events[0]!
  firstEvent.subtitle = 'caller mutation'
  firstEvent.start.setUTCFullYear(2000)
  firstEvent.providerIds!.tvdb = 'changed'
  const third = await fetcher.fetch(start, end)

  assertEquals(initialTitles.join(','), 'tv,tv,tv')
  assertEquals(third.events[0]?.subtitle, '')
  assertEquals(third.events[0]?.start.toISOString(), '2026-07-01T00:00:00.000Z')
  assertEquals(third.events[0]?.providerIds?.tvdb, '123')
})

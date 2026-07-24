import { assertEquals, assertNotStrictEquals } from '@std/assert'
import {
  addUtcDays,
  type CalendarEvent,
  episodeUid,
  movieUid,
  sortEvents,
  sxxEyy,
  toEventDto,
  utcStartOfDay,
} from '../src/domain/event.ts'

function event(uid: string, start: string): CalendarEvent {
  return {
    uid,
    instance: 'tv',
    source: 'sonarr',
    kind: 'episode',
    title: 'Series',
    subtitle: 'Episode',
    season: 2,
    episode: 5,
    start: new Date(start),
    end: new Date('2025-02-03T05:00:00Z'),
    allDay: false,
    downloaded: true,
    overview: 'Overview',
    posterUrl: 'https://example.test/poster.jpg',
    jellyfinUrl: '',
  }
}

Deno.test('stable UIDs and episode labels match the Go format', () => {
  assertEquals(episodeUid('living-room', 42), 'sonarr-living-room-42@calthing')
  assertEquals(movieUid('movies', 7, 'digital'), 'radarr-movies-7-digital@calthing')
  assertEquals(sxxEyy({ season: 2, episode: 5 }), 'S02E05')
  assertEquals(sxxEyy({ season: 123, episode: 4 }), 'S123E04')
})

Deno.test('sortEvents orders by start then UID and mutates the input', () => {
  const events = [
    event('z', '2025-02-02T00:00:00Z'),
    event('b', '2025-02-01T00:00:00Z'),
    event('a', '2025-02-01T00:00:00Z'),
  ]

  sortEvents(events)

  assertEquals(events.map(({ uid }) => uid), ['a', 'b', 'z'])
})

Deno.test('UTC date helpers return new dates and cross month boundaries in UTC', () => {
  const original = new Date('2024-03-31T23:45:10.123-07:00')
  const start = utcStartOfDay(original)
  const next = addUtcDays(start, 1)

  assertNotStrictEquals(start, original)
  assertNotStrictEquals(next, start)
  assertEquals(start.toISOString(), '2024-04-01T00:00:00.000Z')
  assertEquals(next.toISOString(), '2024-04-02T00:00:00.000Z')
  assertEquals(original.toISOString(), '2024-04-01T06:45:10.123Z')
})

Deno.test('toEventDto converts dates to Go-compatible RFC3339 strings', () => {
  const domain = event('uid', '2025-02-03T04:05:06.120Z')
  const dto = toEventDto(domain)

  assertEquals(dto, {
    uid: 'uid',
    instance: 'tv',
    source: 'sonarr',
    kind: 'episode',
    title: 'Series',
    subtitle: 'Episode',
    season: 2,
    episode: 5,
    start: '2025-02-03T04:05:06.12Z',
    end: '2025-02-03T05:00:00Z',
    allDay: false,
    downloaded: true,
    overview: 'Overview',
    posterUrl: 'https://example.test/poster.jpg',
    jellyfinUrl: '',
  })
  assertEquals(domain.start.toISOString(), '2025-02-03T04:05:06.120Z')
})

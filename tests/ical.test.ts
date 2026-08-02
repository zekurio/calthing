import type { CalendarEvent } from '../src/domain/event.ts'
import { generateCalendar } from '../src/services/ical.ts'

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

function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`missing item at index ${index}`)
  }
  return item
}

function physicalPropertyLines(calendar: string, name: string): string[] {
  const lines = calendar.split('\r\n')
  const propertyIndex = lines.findIndex((line) => line.startsWith(`${name}:`))
  if (propertyIndex < 0) {
    throw new Error(`missing ${name} property`)
  }

  const propertyLines = [itemAt(lines, propertyIndex)]
  for (let index = propertyIndex + 1; index < lines.length; index++) {
    const line = itemAt(lines, index)
    if (!line.startsWith(' ')) break
    propertyLines.push(line)
  }
  return propertyLines
}

function fixtureEvents(): CalendarEvent[] {
  return [
    {
      uid: 'sonarr-tv-101@calthing',
      instance: 'tv',
      source: 'sonarr',
      kind: 'episode',
      title: 'Example Show',
      subtitle: 'The Beginning',
      season: 2,
      episode: 5,
      start: new Date('2026-07-15T20:00:00Z'),
      end: new Date('2026-07-15T20:45:00Z'),
      allDay: false,
      downloaded: false,
      overview: 'Things begin, dramatically.\nWith a newline, a comma, and a; semicolon.',
      posterUrl: '',
    },
    {
      uid: 'radarr-movies-42-digital@calthing',
      instance: 'movies',
      source: 'radarr',
      kind: 'movie-digital',
      title: 'Example Movie',
      subtitle: '',
      season: 0,
      episode: 0,
      start: new Date('2026-07-20T00:00:00Z'),
      end: new Date('2026-07-21T00:00:00Z'),
      allDay: true,
      downloaded: true,
      overview: 'A movie about examples.',
      posterUrl: '',
    },
  ]
}

const fixedNow = new Date('2026-07-11T12:00:00Z')

Deno.test('generateCalendar matches the existing golden bytes with CRLF', async () => {
  const goldenUrl = new URL('./fixtures/expected.ics', import.meta.url)
  const goldenLf = await Deno.readTextFile(goldenUrl)
  const expected = goldenLf.replaceAll('\n', '\r\n')
  const actual = generateCalendar('Test Calendar', fixtureEvents(), fixedNow)
  const encoder = new TextEncoder()
  const expectedBytes = encoder.encode(expected)
  const actualBytes = encoder.encode(actual)

  assertEquals(actualBytes.length, expectedBytes.length, 'golden byte length differs')
  for (let index = 0; index < expectedBytes.length; index++) {
    assertEquals(actualBytes[index], expectedBytes[index], `golden byte differs at offset ${index}`)
  }
})

Deno.test('generateCalendar emits metadata, summaries, escaping, and date forms', () => {
  const output = generateCalendar('Test, Calendar; \\ Feed', fixtureEvents(), fixedNow)

  for (
    const expected of [
      'VERSION:2.0\r\n',
      'PRODID:-//calthing//EN\r\n',
      'METHOD:PUBLISH\r\n',
      'NAME:Test\\, Calendar\\; \\\\ Feed\r\n',
      'X-WR-CALNAME:Test\\, Calendar\\; \\\\ Feed\r\n',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n',
      'X-PUBLISHED-TTL:PT1H\r\n',
      'SUMMARY:Example Show S02E05 - The Beginning\r\n',
      'SUMMARY:✔ Example Movie (Digitalstart)\r\n',
      'DESCRIPTION:Things begin\\, dramatically.\\nWith a newline\\, a comma\\, and\r\n  a\\; semicolon.\r\n',
      'CATEGORIES:tv\r\n',
      'DTSTART:20260715T200000Z\r\n',
      'DTEND:20260715T204500Z\r\n',
      'DTSTART;VALUE=DATE:20260720\r\n',
      'DTEND;VALUE=DATE:20260721\r\n',
    ]
  ) {
    assert(output.includes(expected), `output is missing ${JSON.stringify(expected)}`)
  }

  assertEquals(output.replaceAll('\r\n', '').includes('\n'), false, 'output contains a bare LF')
  assert(output.endsWith('END:VCALENDAR\r\n'), 'calendar must end with CRLF')
})

Deno.test('generateCalendar preserves the exact duration of timed events', () => {
  const event: CalendarEvent = {
    ...itemAt(fixtureEvents(), 0),
    start: new Date('2026-08-01T09:12:34Z'),
    end: new Date('2026-08-01T11:47:56Z'),
  }
  const output = generateCalendar('Duration', [event], fixedNow)
  const dateLines = output.split('\r\n').filter((line) =>
    line.startsWith('DTSTART:') || line.startsWith('DTEND:')
  )

  assertEquals(
    dateLines.join('\r\n'),
    'DTSTART:20260801T091234Z\r\nDTEND:20260801T114756Z',
  )
})

Deno.test('generateCalendar escapes every text newline without injecting properties', () => {
  const event: CalendarEvent = {
    ...itemAt(fixtureEvents(), 0),
    title: 'Safe\r\nATTENDEE:evil\rSUMMARY:evil\nEND:VEVENT',
    subtitle: '',
    overview: 'first\r\nATTENDEE:evil\rDTEND:evil\nBEGIN:VEVENT',
  }
  const output = generateCalendar('Calendar\r\nX-WR-CALNAME:evil', [event], fixedNow)

  assert(
    output.includes('NAME:Calendar\\nX-WR-CALNAME:evil\r\n'),
    'calendar name line endings were not escaped',
  )
  assert(
    output.includes(
      'SUMMARY:Safe\\nATTENDEE:evil\\nSUMMARY:evil\\nEND:VEVENT S02E05\r\n',
    ),
    'summary line endings were not escaped',
  )
  assert(
    output.includes(
      'DESCRIPTION:first\\nATTENDEE:evil\\nDTEND:evil\\nBEGIN:VEVENT\r\n',
    ),
    'description line endings were not escaped',
  )
  assertEquals(output.split('\r\n').filter((line) => line === 'ATTENDEE:evil').length, 0)
  assertEquals(output.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 1)
  assertEquals(output.split('\r\n').filter((line) => line === 'END:VEVENT').length, 1)
})

Deno.test('generateCalendar removes forbidden control characters from text', () => {
  const controls = Array.from(
    { length: 32 },
    (_, codePoint) =>
      codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d
        ? ''
        : String.fromCharCode(codePoint),
  ).join('') + '\u007f'
  const event: CalendarEvent = {
    ...itemAt(fixtureEvents(), 0),
    title: `before${controls}after`,
    subtitle: '',
    overview: '',
  }
  const output = generateCalendar('Controls', [event], fixedNow)

  assertEquals(physicalPropertyLines(output, 'SUMMARY').join('\r\n'), 'SUMMARY:beforeafter S02E05')
})

Deno.test('generateCalendar renders every movie summary and omits empty descriptions', () => {
  const base = itemAt(fixtureEvents(), 1)
  const events: CalendarEvent[] = [
    {
      ...base,
      uid: 'cinema',
      kind: 'movie-cinema',
      title: 'Cinema',
      downloaded: false,
      overview: '',
    },
    {
      ...base,
      uid: 'physical',
      kind: 'movie-physical',
      title: 'Physical',
      downloaded: true,
      overview: '',
    },
  ]
  const output = generateCalendar('Kinds', events, fixedNow)

  assert(output.includes('SUMMARY:Cinema (Kinostart)\r\n'), 'cinema summary differs')
  assert(output.includes('SUMMARY:✔ Physical (Heimkinostart)\r\n'), 'physical summary differs')
  assertEquals(output.includes('DESCRIPTION:'), false, 'empty descriptions must be omitted')
})

Deno.test('generateCalendar links episodes available on Jellyfin', () => {
  const event = fixtureEvents()[0]
  if (!event) throw new Error('missing fixture event')
  event.jellyfinUrl = 'https://watch.example/web/#/details?id=episode-id'

  const calendar = generateCalendar('Media', [event], new Date('2026-01-01T00:00:00Z'))
  assert(
    calendar.includes('URL:https://watch.example/web/#/details?id=episode-id\r\n'),
    'calendar should contain the Jellyfin URL',
  )
})

Deno.test('generateCalendar keeps multibyte characters intact at the 75-octet boundary', () => {
  const base = itemAt(fixtureEvents(), 0)
  const exactBoundary: CalendarEvent = {
    ...base,
    uid: 'exact-boundary',
    title: `${'a'.repeat(65)}é`,
    subtitle: '',
    overview: '',
  }
  const acrossBoundary: CalendarEvent = {
    ...base,
    uid: 'across-boundary',
    title: `${'a'.repeat(66)}é`,
    subtitle: '',
    overview: '',
  }

  const exactLines = physicalPropertyLines(
    generateCalendar('Fold', [exactBoundary], fixedNow),
    'SUMMARY',
  )
  assertEquals(
    exactLines.join('\r\n'),
    `SUMMARY:${'a'.repeat(65)}é\r\n  S02E05`,
  )

  const acrossLines = physicalPropertyLines(
    generateCalendar('Fold', [acrossBoundary], fixedNow),
    'SUMMARY',
  )
  assertEquals(
    acrossLines.join('\r\n'),
    `SUMMARY:${'a'.repeat(66)}\r\n é S02E05`,
  )
})

Deno.test('generateCalendar folds at UTF-8 byte boundaries and preserves content', () => {
  const event: CalendarEvent = {
    ...itemAt(fixtureEvents(), 0),
    uid: 'unicode-fold',
    title: `${'é'.repeat(34)} long title ${'x'.repeat(90)}`,
    subtitle: '',
    overview: '',
  }
  const output = generateCalendar('Fold', [event], fixedNow)
  const lines = output.split('\r\n').slice(0, -1)
  const summaryIndex = lines.findIndex((line) => line.startsWith('SUMMARY:'))
  assert(summaryIndex >= 0, 'summary line is missing')

  const summaryLines = [itemAt(lines, summaryIndex)]
  for (let index = summaryIndex + 1; index < lines.length; index++) {
    const line = itemAt(lines, index)
    if (!line.startsWith(' ')) {
      break
    }
    summaryLines.push(line)
  }
  assert(summaryLines.length > 1, 'long summary was not folded')
  const encoder = new TextEncoder()
  for (const line of summaryLines) {
    assert(encoder.encode(line).length <= 75, `folded line exceeds 75 octets: ${line}`)
  }
  const unfolded = itemAt(summaryLines, 0) +
    summaryLines.slice(1).map((line) => line.slice(1)).join('')
  assertEquals(unfolded, `SUMMARY:${event.title} S02E05`)
})

Deno.test('generateCalendar folds long content in linear-sized exact segments', () => {
  const title = 'x'.repeat(100_000)
  const event: CalendarEvent = {
    ...itemAt(fixtureEvents(), 0),
    uid: 'long-fold',
    title,
    subtitle: '',
    overview: '',
  }
  const summaryLines = physicalPropertyLines(
    generateCalendar('Long', [event], fixedNow),
    'SUMMARY',
  )

  assertEquals(summaryLines.length, 1_352)
  assertEquals(itemAt(summaryLines, 0), `SUMMARY:${'x'.repeat(67)}`)
  assertEquals(itemAt(summaryLines, 1), ` ${'x'.repeat(74)}`)
  assertEquals(itemAt(summaryLines, summaryLines.length - 1), ` ${'x'.repeat(33)} S02E05`)
  const unfolded = itemAt(summaryLines, 0) +
    summaryLines.slice(1).map((line) => line.slice(1)).join('')
  assertEquals(unfolded, `SUMMARY:${title} S02E05`)
})

Deno.test('generateCalendar is deterministic for an injected timestamp', () => {
  const events = fixtureEvents()
  const first = generateCalendar('Test Calendar', events, fixedNow)
  const second = generateCalendar('Test Calendar', events, new Date(fixedNow))
  assertEquals(second, first)
  assertEquals((first.match(/DTSTAMP:20260711T120000Z/g) ?? []).length, events.length)
  assertEquals((first.match(/LAST-MODIFIED:20260711T120000Z/g) ?? []).length, events.length)

  const later = generateCalendar('Test Calendar', events, new Date('2026-07-11T12:00:01Z'))
  assert(later !== first, 'changing the injected timestamp should change the output')
  assert(later.includes('DTSTAMP:20260711T120001Z'), 'updated timestamp is missing')
})

import { type CalendarEvent, sxxEyy } from '../domain/event.ts'

const CRLF = '\r\n'
const encoder = new TextEncoder()

function byteLength(value: string): number {
  return encoder.encode(value).length
}

function takeFoldSegment(value: string, maxBytes: number): string {
  let byteCount = 0
  let codeUnitIndex = 0
  let lastWordBoundary = -1
  let lastCharacter = ''

  for (const character of value) {
    if (character === ' ' || character === '<' || lastCharacter === '>') {
      lastWordBoundary = codeUnitIndex
    }
    lastCharacter = character

    const nextByteCount = byteCount + byteLength(character)
    if (nextByteCount > maxBytes) {
      break
    }
    byteCount = nextByteCount
    codeUnitIndex += character.length
  }

  return lastWordBoundary > 0 ? value.slice(0, lastWordBoundary) : value.slice(0, codeUnitIndex)
}

function foldLine(line: string): string {
  if (byteLength(line) <= 75) {
    return line + CRLF
  }

  const first = takeFoldSegment(line, 75)
  let output = first + CRLF
  let remainder = line.slice(first.length)

  while (byteLength(remainder) > 74) {
    const segment = takeFoldSegment(remainder, 74)
    output += ` ${segment}${CRLF}`
    remainder = remainder.slice(segment.length)
  }

  return `${output} ${remainder}${CRLF}`
}

function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
}

function property(name: string, value: string, text = true): string {
  return foldLine(`${name}:${text ? escapeText(value) : value}`)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function utcTimestamp(value: Date): string {
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}` +
    `T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`
}

function calendarDate(value: Date): string {
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}`
}

function eventSummary(event: CalendarEvent): string {
  let summary: string
  switch (event.kind) {
    case 'episode':
      summary = `${event.title} ${sxxEyy(event)}`
      if (event.subtitle !== '') {
        summary += ` - ${event.subtitle}`
      }
      break
    case 'movie-cinema':
      summary = `${event.title} (Kinostart)`
      break
    case 'movie-digital':
      summary = `${event.title} (Digitalstart)`
      break
    case 'movie-physical':
      summary = `${event.title} (Heimkinostart)`
      break
    default:
      summary = event.title
  }

  return event.downloaded ? `✔ ${summary}` : summary
}

export function generateCalendar(
  name: string,
  events: readonly CalendarEvent[],
  now = new Date(),
): string {
  const timestamp = utcTimestamp(now)
  let output = 'BEGIN:VCALENDAR' + CRLF
  output += property('VERSION', '2.0')
  output += property('PRODID', '-//calthing//EN')
  output += property('METHOD', 'PUBLISH')
  output += property('NAME', name)
  output += property('X-WR-CALNAME', name)
  output += foldLine('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
  output += property('X-PUBLISHED-TTL', 'PT1H')

  for (const event of events) {
    output += 'BEGIN:VEVENT' + CRLF
    output += property('UID', event.uid)
    output += foldLine(`DTSTAMP:${timestamp}`)
    output += foldLine(`LAST-MODIFIED:${timestamp}`)
    output += property('SUMMARY', eventSummary(event))
    if (event.overview !== '') {
      output += property('DESCRIPTION', event.overview)
    }
    if (event.jellyfinUrl) {
      output += property('URL', event.jellyfinUrl, false)
    }
    output += property('CATEGORIES', event.instance)
    if (event.allDay) {
      output += foldLine(`DTSTART;VALUE=DATE:${calendarDate(event.start)}`)
      output += foldLine(`DTEND;VALUE=DATE:${calendarDate(event.end)}`)
    } else {
      output += foldLine(`DTSTART:${utcTimestamp(event.start)}`)
    }
    output += 'END:VEVENT' + CRLF
  }

  return output + 'END:VCALENDAR' + CRLF
}

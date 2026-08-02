import { type CalendarEvent, sxxEyy } from '../domain/event.ts'

const CRLF = '\r\n'

function utf8ByteLength(character: string): number {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined || codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}

function foldLine(line: string): string {
  const segments: string[] = []
  let segmentStart = 0
  let segmentStartByte = 0
  let codeUnitIndex = 0
  let byteIndex = 0
  let lastWordBoundary = -1
  let lastWordBoundaryByte = -1
  let lastCharacter = ''

  for (const character of line) {
    if (character === ' ' || character === '<' || lastCharacter === '>') {
      lastWordBoundary = codeUnitIndex
      lastWordBoundaryByte = byteIndex
    }

    const characterBytes = utf8ByteLength(character)
    // Continuation whitespace consumes one of the RFC's 75 allowed octets.
    let maxBytes = segments.length === 0 ? 75 : 74
    while (byteIndex - segmentStartByte + characterBytes > maxBytes) {
      const useWordBoundary = lastWordBoundary > segmentStart
      const foldIndex = useWordBoundary ? lastWordBoundary : codeUnitIndex
      const foldByte = useWordBoundary ? lastWordBoundaryByte : byteIndex
      const continuation = segments.length === 0 ? '' : ' '
      segments.push(continuation + line.slice(segmentStart, foldIndex))
      segmentStart = foldIndex
      segmentStartByte = foldByte
      lastWordBoundary = -1
      lastWordBoundaryByte = -1
      maxBytes = 74
    }

    byteIndex += characterBytes
    codeUnitIndex += character.length
    lastCharacter = character
  }

  const continuation = segments.length === 0 ? '' : ' '
  segments.push(continuation + line.slice(segmentStart))
  return segments.join(CRLF) + CRLF
}

function isForbiddenControl(codeUnit: number): boolean {
  // RFC 5545 excludes every ASCII control except horizontal tab.
  return codeUnit < 0x09 || (codeUnit > 0x09 && codeUnit < 0x20) || codeUnit === 0x7f
}

function escapeText(value: string): string {
  const parts: string[] = []
  let runStart = 0

  for (let index = 0; index < value.length; index++) {
    const characterIndex = index
    const codeUnit = value.charCodeAt(index)
    let replacement: string | undefined

    if (codeUnit === 0x0d) {
      if (value.charCodeAt(index + 1) === 0x0a) index++
      replacement = '\\n'
    } else if (codeUnit === 0x0a) {
      replacement = '\\n'
    } else if (isForbiddenControl(codeUnit)) {
      replacement = ''
    } else if (codeUnit === 0x5c) {
      replacement = '\\\\'
    } else if (codeUnit === 0x3b) {
      replacement = '\\;'
    } else if (codeUnit === 0x2c) {
      replacement = '\\,'
    }

    if (replacement !== undefined) {
      parts.push(value.slice(runStart, characterIndex), replacement)
      runStart = index + 1
    }
  }

  parts.push(value.slice(runStart))
  return parts.join('')
}

function stripForbiddenControls(value: string): string {
  const parts: string[] = []
  let runStart = 0

  for (let index = 0; index < value.length; index++) {
    if (!isForbiddenControl(value.charCodeAt(index))) continue
    parts.push(value.slice(runStart, index))
    runStart = index + 1
  }

  parts.push(value.slice(runStart))
  return parts.join('')
}

function property(name: string, value: string, text = true): string {
  const safeValue = text ? escapeText(value) : stripForbiddenControls(value)
  return foldLine(`${name}:${safeValue}`)
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
      output += foldLine(`DTEND:${utcTimestamp(event.end)}`)
    }
    output += 'END:VEVENT' + CRLF
  }

  return output + 'END:VCALENDAR' + CRLF
}

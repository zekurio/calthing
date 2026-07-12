import type { EventDto } from '../../../shared/api.ts'
import { i18n, LOCALE_TAGS, type Locale } from './i18n.svelte.ts'

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** Monday-first start of the week containing `d`, as a local midnight Date. */
export function startOfWeek(d: Date): Date {
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return addDays(midnight, -((midnight.getDay() + 6) % 7))
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Local date formatted as YYYY-MM-DD (the API's date format). */
export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * The 42 cells (6 weeks, Monday-first) covering the month of `viewDate`.
 */
export function monthGrid(viewDate: Date): Date[] {
  const first = startOfMonth(viewDate)
  const offset = (first.getDay() + 6) % 7 // Mon=0 .. Sun=6
  const gridStart = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

/**
 * The day an event belongs to, as a local midnight Date.
 * All-day events (movie releases) are calendar dates: use their UTC date
 * parts verbatim. Timed events (episode air times) are instants: use the
 * viewer's local date.
 */
export function eventDay(e: EventDto): Date {
  const d = new Date(e.start)
  if (e.allDay) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

interface Formatters {
  time: Intl.DateTimeFormat
  month: Intl.DateTimeFormat
  weekday: Intl.DateTimeFormat
  day: Intl.DateTimeFormat
  weekRange: Intl.DateTimeFormat
}

const formatterCache: Partial<Record<Locale, Formatters>> = {}

function formatters(): Formatters {
  const locale = i18n.locale
  let cached = formatterCache[locale]
  if (!cached) {
    const tag = LOCALE_TAGS[locale]
    cached = {
      time: new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }),
      month: new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: 'short' }),
      day: new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long' }),
      weekRange: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }),
    }
    formatterCache[locale] = cached
  }
  return cached
}

export function formatTime(iso: string): string {
  return formatters().time.format(new Date(iso))
}

export function monthLabel(d: Date): string {
  return formatters().month.format(d)
}

/** Range label for the week starting at `start`, e.g. "6.–12. Juli 2026". */
export function weekLabel(start: Date): string {
  return formatters().weekRange.formatRange(start, addDays(start, 6))
}

export function weekdayLabels(): string[] {
  // Mon 2026-07-06 .. Sun 2026-07-12, purely for localized labels.
  return Array.from({ length: 7 }, (_, i) => formatters().weekday.format(new Date(2026, 6, 6 + i)))
}

export function dayLabel(d: Date): string {
  return formatters().day.format(d)
}

export function sxxeyy(season: number, episode: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `S${pad(season)}E${pad(episode)}`
}

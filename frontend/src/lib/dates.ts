import type { ArrEvent } from './types'

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
export function eventDay(e: ArrEvent): Date {
  const d = new Date(e.start)
  if (e.allDay) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function monthLabel(d: Date): string {
  return monthFmt.format(d)
}

export function weekdayLabels(): string[] {
  // Mon 2026-07-06 .. Sun 2026-07-12, purely for localized labels.
  return Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2026, 6, 6 + i)))
}

export function dayLabel(d: Date): string {
  return dayFmt.format(d)
}

export function sxxeyy(season: number, episode: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `S${pad(season)}E${pad(episode)}`
}

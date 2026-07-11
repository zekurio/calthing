import type { EventsResponse } from './types'
import { ymd } from './dates'

export async function fetchEvents(start: Date, end: Date): Promise<EventsResponse> {
  const params = new URLSearchParams({ start: ymd(start), end: ymd(end) })
  const res = await fetch(`/api/events?${params}`)
  if (!res.ok) {
    throw new Error(`Loading events failed (${res.status})`)
  }
  return res.json()
}

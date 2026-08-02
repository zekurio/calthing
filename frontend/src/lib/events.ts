import type { EventDto } from '../../../shared/api.ts'
import { eventDay, ymd } from './dates.ts'

export function groupEventsByDay(events: readonly EventDto[]): Map<string, EventDto[]> {
  const groups = new Map<string, EventDto[]>()

  for (const event of events) {
    const key = ymd(eventDay(event))
    const group = groups.get(key)
    if (group) {
      group.push(event)
    } else {
      groups.set(key, [event])
    }
  }

  return groups
}

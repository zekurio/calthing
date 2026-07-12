import { treaty } from '@elysiajs/eden'
import type { App } from '../../../src/http/app.ts'
import type { EventsResponse, Kind } from '../../../shared/api.ts'

const client = treaty<App>(location.origin)

export const KIND_LABELS: Record<Kind, string> = {
  episode: 'Episode',
  'movie-cinema': 'Cinema release',
  'movie-digital': 'Digital release',
  'movie-physical': 'Physical release',
}

export async function fetchEvents(
  start: string,
  end: string,
  signal: AbortSignal,
): Promise<EventsResponse> {
  const { data, error, status } = await client.api.events.get({
    query: { start, end },
    fetch: { signal },
  })

  if (error) {
    throw new Error(`Loading events failed (${status})`)
  }

  return data
}

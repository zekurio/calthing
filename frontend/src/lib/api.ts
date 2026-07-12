import { treaty } from '@elysiajs/eden'
import type { App } from '../../../src/http/app.ts'
import type { EventsResponse } from '../../../shared/api.ts'
import { t } from './i18n.svelte.ts'

const client = treaty<App>(location.origin)

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
    throw new Error(t('loadFailed', { status }))
  }

  return data
}

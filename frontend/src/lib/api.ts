import { treaty } from '@elysiajs/eden'
import type { App } from '../../../src/http/app.ts'
import type { EventsResponse, MeDto } from '../../../shared/api.ts'
import { t } from './i18n.svelte.ts'

const client = treaty<App>(location.origin)

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
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
    throw new ApiError(status, t('loadFailed', { status }))
  }

  return data
}

/** Resolves the current session; throws ApiError 401 when a login is required. */
export async function fetchMe(): Promise<MeDto> {
  const { data, error, status } = await client.api.me.get()
  if (error) {
    throw new ApiError(status, t('loadFailed', { status }))
  }
  return data
}

export async function login(username: string, password: string): Promise<MeDto> {
  const { data, error, status } = await client.api.auth.post({ username, password })
  if (error) {
    throw new ApiError(status, t('loadFailed', { status }))
  }
  return data
}

export async function logout(): Promise<void> {
  await client.api.logout.post()
}

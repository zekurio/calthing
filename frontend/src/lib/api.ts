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
  try {
    const { data, error, status } = await client.api.events.get({
      query: { start, end },
      fetch: { signal },
    })

    if (error) throw new ApiError(status, t('loadFailed', { status }))
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, t('networkFailed'))
  }
}

/** Resolves the current session; throws ApiError 401 when a login is required. */
export async function fetchMe(signal: AbortSignal): Promise<MeDto> {
  try {
    const { data, error, status } = await client.api.me.get({ fetch: { signal } })
    if (error) throw new ApiError(status, t('loadFailed', { status }))
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, t('sessionUnavailable'))
  }
}

export async function login(username: string, password: string): Promise<MeDto> {
  try {
    const { data, error, status } = await client.api.auth.post({ username, password })
    if (error) throw new ApiError(status, t('loadFailed', { status }))
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, t('signInFailed'))
  }
}

export async function logout(): Promise<void> {
  try {
    const { error, status } = await client.api.logout.post()
    if (error) throw new ApiError(status, t('signOutFailed'))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, t('signOutFailed'))
  }
}

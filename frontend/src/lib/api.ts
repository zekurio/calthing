import { treaty } from '@elysiajs/eden'
import type { App } from '../../../src/http/app.ts'
import type { EventsResponse, MeDto } from '../../../shared/api.ts'
import { t } from './i18n.svelte.ts'
import { readPreference, writePreference } from './preferences.ts'

const client = treaty<App>(location.origin)
const DEVICE_ID_KEY = 'calthing.deviceId'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
let memoryDeviceId = ''

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
    const { data, error, status } = await client.api.auth.post({
      username,
      password,
      deviceId: browserDeviceId(),
    })
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

function browserDeviceId(): string {
  const stored = readPreference(DEVICE_ID_KEY)
  if (stored && UUID_PATTERN.test(stored)) return stored
  if (!memoryDeviceId) memoryDeviceId = crypto.randomUUID()
  writePreference(DEVICE_ID_KEY, memoryDeviceId)
  return memoryDeviceId
}

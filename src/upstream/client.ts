import { type Static, type TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

import type { Instance } from '../config.ts'
import type { CalendarEvent } from '../domain/event.ts'
import { fetchRadarr } from './radarr.ts'
import type { ArrImage } from './schemas.ts'
import { fetchSonarr } from './sonarr.ts'

const requestTimeoutMs = 15_000
const maxErrorBodyBytes = 512

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type ArrFetch = (
  instance: Instance,
  start: Date,
  end: Date,
) => Promise<CalendarEvent[]>

export function posterUrl(images: ArrImage[] | null | undefined): string {
  return images?.find((image) => image.coverType === 'poster' && image.remoteUrl)?.remoteUrl ?? ''
}

function instanceUrl(instance: Instance, path: string): URL {
  let url: URL
  try {
    url = new URL(instance.url)
  } catch (error) {
    throw new Error(`instance ${instance.name}: parse url: ${errorMessage(error)}`)
  }

  const basePath = url.pathname.replace(/\/+$/, '')
  url.pathname = `${basePath}/${path.replace(/^\/+/, '')}`
  return url
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readErrorBody(response: Response): Promise<string> {
  if (response.body === null) {
    return ''
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (length < maxErrorBodyBytes) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      const remaining = maxErrorBodyBytes - length
      const chunk = value.subarray(0, remaining)
      chunks.push(chunk)
      length += chunk.length
      if (chunk.length < value.length) {
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(body)
}

function toRfc3339Seconds(date: Date): string {
  const seconds = new Date(date)
  seconds.setUTCMilliseconds(0)
  return seconds.toISOString().replace('.000Z', 'Z')
}

export function calendarQuery(start: Date, end: Date, unmonitored: boolean): URLSearchParams {
  return new URLSearchParams({
    start: toRfc3339Seconds(start),
    end: toRfc3339Seconds(end),
    unmonitored: String(unmonitored),
  })
}

export async function getJson<T extends TSchema>(
  instance: Instance,
  path: string,
  query: URLSearchParams,
  schema: T,
  fetchFn: HttpFetch = fetch,
): Promise<Static<T>> {
  const url = instanceUrl(instance, path)
  url.search = query.toString()

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error('request timed out')),
    requestTimeoutMs,
  )
  try {
    let response: Response
    try {
      response = await fetchFn(url, {
        method: 'GET',
        headers: {
          'X-Api-Key': instance.apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
    } catch (error) {
      throw new Error(`instance ${instance.name}: ${errorMessage(error)}`)
    }

    if (response.status !== 200) {
      const body = await readErrorBody(response)
      throw new Error(`instance ${instance.name}: ${path} returned ${response.status}: ${body}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      throw new Error(`instance ${instance.name}: decode response: ${errorMessage(error)}`)
    }
    if (!Value.Check(schema, payload)) {
      const first = Value.Errors(schema, payload).First()
      const detail = first ? `${first.path || '/'} ${first.message.toLowerCase()}` : 'invalid value'
      throw new Error(`instance ${instance.name}: decode response: ${detail}`)
    }
    return Value.Decode(schema, payload)
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchCalendar(
  instance: Instance,
  start: Date,
  end: Date,
  fetchFn: HttpFetch = fetch,
): Promise<CalendarEvent[]> {
  switch (instance.type) {
    case 'sonarr':
      return await fetchSonarr(instance, start, end, fetchFn)
    case 'radarr':
      return await fetchRadarr(instance, start, end, fetchFn)
    default:
      throw new Error(`instance ${instance.name}: unknown type ${JSON.stringify(instance.type)}`)
  }
}

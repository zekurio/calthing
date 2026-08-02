import type { CalendarEvent } from '../domain/event.ts'

export interface JellyfinConfig {
  url: string
  publicUrl: string
  apiKey: string
}

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type DeviceId = (
  scope: string,
  username: string,
  browserDeviceId: string,
) => string | Promise<string>

export interface JellyfinUser {
  id: string
  name: string
  /** profile image on the public Jellyfin host; empty when the user has none */
  avatarUrl: string
}

interface JellyfinUserDto {
  Id?: string
  Name?: string
  PrimaryImageTag?: string
}

interface JellyfinItem {
  Id?: string
  Name?: string
  SeriesName?: string
  Overview?: string
  ProviderIds?: Record<string, string>
}

interface JellyfinItemsResponse {
  Items?: JellyfinItem[]
  TotalRecordCount?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_ERROR_BODY_BYTES = 512

function endpoint(base: string, path: string): URL {
  const url = new URL(base)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  return url
}

function itemUrl(publicUrl: string, id: string): string {
  const url = endpoint(publicUrl, '/web/')
  url.hash = `/details?id=${encodeURIComponent(id)}`
  return url.toString()
}

function toUser(dto: JellyfinUserDto | undefined, publicUrl: string): JellyfinUser | null {
  if (!dto?.Id || !dto.Name) return null
  let avatarUrl = ''
  if (dto.PrimaryImageTag && publicUrl) {
    const url = endpoint(publicUrl, `/Users/${encodeURIComponent(dto.Id)}/Images/Primary`)
    url.searchParams.set('tag', dto.PrimaryImageTag)
    avatarUrl = url.toString()
  }
  return { id: dto.Id, name: dto.Name, avatarUrl }
}

async function defaultDeviceId(
  scope: string,
  username: string,
  browserDeviceId: string,
): Promise<string> {
  const input = new TextEncoder().encode(`${scope}\0${username}\0${browserDeviceId}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function clientAuthorization(deviceId: string): string {
  return `MediaBrowser Client="calthing", Device="calthing", DeviceId="${deviceId}", Version="1.0"`
}

function tokenAuthorization(token: string): string {
  return `MediaBrowser Token="${token}"`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function responseJson<T>(response: Response, context: string): Promise<T> {
  try {
    return await response.json() as T
  } catch (error) {
    throw new Error(`jellyfin: ${context} returned invalid json: ${errorMessage(error)}`, {
      cause: error,
    })
  }
}

async function responseError(response: Response, context: string): Promise<Error> {
  const body = await boundedResponseText(response, MAX_ERROR_BODY_BYTES)
  return new Error(`jellyfin: ${context} returned ${response.status}: ${body}`)
}

async function boundedResponseText(response: Response, limit: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const bytes = new Uint8Array(limit)
  let length = 0

  while (length < limit) {
    const { done, value } = await reader.read()
    if (done) break
    const take = Math.min(value.length, limit - length)
    bytes.set(value.subarray(0, take), length)
    length += take
    if (take < value.length) break
  }
  void reader.cancel().catch(() => {})
  return new TextDecoder().decode(bytes.subarray(0, length))
}

function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => {})
}

export class JellyfinClient {
  readonly #config: JellyfinConfig
  readonly #fetch: HttpFetch
  readonly #deviceId: DeviceId
  readonly #timeoutMs: number

  constructor(
    config: JellyfinConfig,
    fetchFn: HttpFetch = fetch,
    deviceId: DeviceId = defaultDeviceId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.#config = config
    this.#fetch = fetchFn
    this.#deviceId = deviceId
    this.#timeoutMs = timeoutMs
  }

  /** Logs in via /Users/AuthenticateByName. Returns null on wrong credentials. */
  async authenticate(
    username: string,
    password: string,
    browserDeviceId: string,
  ): Promise<{ token: string; user: JellyfinUser } | null> {
    const context = '/Users/AuthenticateByName'
    const deviceId = await this.#deviceId(this.#config.url, username, browserDeviceId)
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
      throw new Error('jellyfin: generated device id is invalid')
    }
    return await this.#request(context, endpoint(this.#config.url, context), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: clientAuthorization(deviceId),
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    }, async (response) => {
      if (response.status === 401 || response.status === 403) {
        discardBody(response)
        return null
      }
      if (!response.ok) throw await responseError(response, context)

      const payload = await responseJson<{ AccessToken?: string; User?: JellyfinUserDto }>(
        response,
        context,
      )
      const user = toUser(payload.User, this.#config.publicUrl)
      if (!payload.AccessToken || user === null) {
        throw new Error('jellyfin: /Users/AuthenticateByName response is missing token or user')
      }
      return { token: payload.AccessToken, user }
    })
  }

  /** Resolves a session token to its user; null only when Jellyfin rejects the token. */
  user(token: string): Promise<JellyfinUser | null> {
    const context = '/Users/Me'
    return this.#request(context, endpoint(this.#config.url, context), {
      headers: {
        Accept: 'application/json',
        Authorization: tokenAuthorization(token),
      },
    }, async (response) => {
      if (response.status === 401 || response.status === 403) {
        discardBody(response)
        return null
      }
      if (!response.ok) throw await responseError(response, context)

      const user = toUser(
        await responseJson<JellyfinUserDto>(response, context),
        this.#config.publicUrl,
      )
      if (user === null) throw new Error('jellyfin: /Users/Me response is missing user')
      return user
    })
  }

  /** Invalidates the session on the Jellyfin side (bounded best effort). */
  async logout(token: string): Promise<void> {
    const context = '/Sessions/Logout'
    try {
      await this.#request(context, endpoint(this.#config.url, context), {
        method: 'POST',
        headers: { Authorization: tokenAuthorization(token) },
      }, (response) => {
        discardBody(response)
        return Promise.resolve()
      })
    } catch {
      // The HTTP layer clears the cookie regardless of Jellyfin availability.
    }
  }

  async addLinks(events: CalendarEvent[]): Promise<void> {
    const providerKey = (event: CalendarEvent): string => {
      if (event.providerIds?.Tvdb) return `Tvdb.${event.providerIds.Tvdb}`
      if (event.providerIds?.Tmdb) return `Tmdb.${event.providerIds.Tmdb}`
      return ''
    }
    const providerKeys = [...new Set(events.map(providerKey).filter(Boolean))]
    if (providerKeys.length === 0) return

    const wanted = new Set(providerKeys)
    const byProvider = new Map<string, JellyfinItem>()
    const deadline = performance.now() + this.#timeoutMs
    const pageSize = 1000
    let startIndex = 0
    while (byProvider.size < wanted.size) {
      const context = '/Items'
      const url = endpoint(this.#config.url, context)
      url.searchParams.set('IncludeItemTypes', 'Episode,Movie')
      url.searchParams.set('Recursive', 'true')
      url.searchParams.set('Fields', 'ProviderIds,Overview')
      url.searchParams.set('StartIndex', String(startIndex))
      url.searchParams.set('Limit', String(pageSize))

      const remainingMs = deadline - performance.now()
      if (remainingMs <= 0) {
        throw new Error(`jellyfin: ${context} timed out after ${this.#timeoutMs}ms`)
      }
      const payload = await this.#request(context, url, {
        headers: {
          Accept: 'application/json',
          Authorization: tokenAuthorization(this.#config.apiKey),
        },
      }, async (response) => {
        if (!response.ok) throw await responseError(response, context)
        const decoded = await responseJson<JellyfinItemsResponse>(response, context)
        if (decoded.Items !== undefined && !Array.isArray(decoded.Items)) {
          throw new Error('jellyfin: /Items response has invalid items')
        }
        return decoded
      }, remainingMs)

      const items = payload.Items ?? []
      for (const item of items) {
        for (const provider of ['Tvdb', 'Tmdb'] as const) {
          const providerId = item.ProviderIds?.[provider]
          const key = providerId ? `${provider}.${providerId}` : ''
          if (item.Id && wanted.has(key)) byProvider.set(key, item)
        }
      }
      startIndex += items.length
      if (
        items.length === 0 || items.length < pageSize ||
        (payload.TotalRecordCount !== undefined && startIndex >= payload.TotalRecordCount)
      ) break
    }
    for (const event of events) {
      const item = byProvider.get(providerKey(event))
      if (!item?.Id) continue
      event.jellyfinUrl = itemUrl(this.#config.publicUrl, item.Id)
      if (event.kind === 'episode') {
        if (item.SeriesName) event.title = item.SeriesName
        if (item.Name) event.subtitle = item.Name
      } else if (item.Name) {
        event.title = item.Name
      }
      if (item.Overview) event.overview = item.Overview
    }
  }

  async #request<T>(
    context: string,
    input: URL,
    init: RequestInit,
    consume: (response: Response) => Promise<T>,
    timeoutMs = this.#timeoutMs,
  ): Promise<T> {
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new Error(`jellyfin: ${context} timed out after ${Math.ceil(timeoutMs)}ms`))
      }, timeoutMs)
    })
    const request = (async () => {
      let response: Response
      try {
        response = await this.#fetch(input, { ...init, signal: controller.signal })
      } catch (error) {
        throw new Error(`jellyfin: ${context} request failed: ${errorMessage(error)}`, {
          cause: error,
        })
      }
      return await consume(response)
    })()

    try {
      return await Promise.race([request, timeout])
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

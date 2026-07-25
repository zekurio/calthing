import type { CalendarEvent } from '../domain/event.ts'

export interface JellyfinConfig {
  url: string
  publicUrl: string
  apiKey: string
}

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

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

const AUTH_HEADER =
  'MediaBrowser Client="calthing", Device="calthing", DeviceId="calthing", Version="1.0"'

/** how long a resolved session-token → user mapping is trusted before re-asking Jellyfin */
const USER_CACHE_MS = 60_000

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

export class JellyfinClient {
  readonly #config: JellyfinConfig
  readonly #fetch: HttpFetch
  readonly #userCache = new Map<string, { user: JellyfinUser; expires: number }>()

  constructor(config: JellyfinConfig, fetchFn: HttpFetch = fetch) {
    this.#config = config
    this.#fetch = fetchFn
  }

  /** Logs in via /Users/AuthenticateByName. Returns null on wrong credentials. */
  async authenticate(
    username: string,
    password: string,
  ): Promise<{ token: string; user: JellyfinUser } | null> {
    const response = await this.#fetch(endpoint(this.#config.url, '/Users/AuthenticateByName'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    })
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel()
      return null
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 512)
      throw new Error(`jellyfin: /Users/AuthenticateByName returned ${response.status}: ${body}`)
    }
    const payload = await response.json() as { AccessToken?: string; User?: JellyfinUserDto }
    const user = toUser(payload.User, this.#config.publicUrl)
    if (!payload.AccessToken || user === null) {
      throw new Error('jellyfin: auth response is missing the access token or user')
    }
    this.#userCache.set(payload.AccessToken, { user, expires: Date.now() + USER_CACHE_MS })
    return { token: payload.AccessToken, user }
  }

  /** Resolves a session token to its user; null if the token is no longer valid. */
  async user(token: string): Promise<JellyfinUser | null> {
    const hit = this.#userCache.get(token)
    if (hit && hit.expires > Date.now()) return hit.user
    const response = await this.#fetch(endpoint(this.#config.url, '/Users/Me'), {
      headers: { Accept: 'application/json', 'X-Emby-Token': token },
    })
    if (!response.ok) {
      await response.body?.cancel()
      this.#userCache.delete(token)
      return null
    }
    const user = toUser(await response.json() as JellyfinUserDto, this.#config.publicUrl)
    if (user === null) return null
    this.#userCache.set(token, { user, expires: Date.now() + USER_CACHE_MS })
    return user
  }

  /** Invalidates the session on the Jellyfin side (best effort). */
  async logout(token: string): Promise<void> {
    this.#userCache.delete(token)
    try {
      const response = await this.#fetch(endpoint(this.#config.url, '/Sessions/Logout'), {
        method: 'POST',
        headers: { 'X-Emby-Token': token },
      })
      await response.body?.cancel()
    } catch {
      // Jellyfin unreachable — the cookie is cleared either way
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
    const pageSize = 1000
    let startIndex = 0
    while (byProvider.size < wanted.size) {
      const url = endpoint(this.#config.url, '/Items')
      url.searchParams.set('IncludeItemTypes', 'Episode,Movie')
      url.searchParams.set('Recursive', 'true')
      url.searchParams.set('Fields', 'ProviderIds,Overview')
      url.searchParams.set('StartIndex', String(startIndex))
      url.searchParams.set('Limit', String(pageSize))

      const response = await this.#fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Emby-Token': this.#config.apiKey,
        },
      })
      if (!response.ok) {
        const body = (await response.text()).slice(0, 512)
        throw new Error(`jellyfin: /Items returned ${response.status}: ${body}`)
      }

      const payload = await response.json() as JellyfinItemsResponse
      const items = payload.Items ?? []
      for (const item of items) {
        for (const provider of ['Tvdb', 'Tmdb'] as const) {
          const providerId = item.ProviderIds?.[provider]
          const key = providerId ? `${provider}.${providerId}` : ''
          if (item.Id && wanted.has(key)) byProvider.set(key, item)
        }
      }
      startIndex += items.length
      if (items.length === 0 || startIndex >= (payload.TotalRecordCount ?? startIndex)) break
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
}

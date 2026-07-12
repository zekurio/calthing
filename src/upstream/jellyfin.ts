import type { CalendarEvent } from '../domain/event.ts'

export interface JellyfinConfig {
  url: string
  publicUrl: string
  apiKey: string
}

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

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

  constructor(config: JellyfinConfig, fetchFn: HttpFetch = fetch) {
    this.#config = config
    this.#fetch = fetchFn
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

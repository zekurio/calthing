import type { Instance } from '../config.ts'
import { type CalendarEvent, sortEvents, utcStartOfDay } from '../domain/event.ts'
import type { InstanceStatusDto } from '../../shared/api.ts'
import { type ArrFetch, fetchCalendar } from '../upstream/client.ts'

export interface MediaLinker {
  addLinks(events: CalendarEvent[]): Promise<void>
}

export interface FetchResult {
  events: CalendarEvent[]
  instances: InstanceStatusDto[]
}

export type Clock = () => Date
export type MonotonicClock = () => number

export interface FetcherCacheOptions {
  maxEntries?: number
  monotonicNow?: MonotonicClock
}

interface CacheEntry {
  events: CalendarEvent[]
  status: InstanceStatusDto
  expiresAt: number
}

const defaultMaxCacheEntries = 256

function rfc3339(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, 'Z').replace(/(\.\d*?[1-9])0+Z$/, '$1Z')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class Fetcher {
  readonly #instances: Instance[]
  readonly #ttlMs: number
  readonly #fetchInstance: ArrFetch
  readonly #now: Clock
  readonly #mediaLinker?: MediaLinker
  readonly #episodeDelayMs: number
  readonly #maxCacheEntries: number
  readonly #monotonicNow: MonotonicClock
  readonly #cache = new Map<string, CacheEntry>()
  readonly #inflight = new Map<string, Promise<CacheEntry>>()

  constructor(
    instances: Instance[],
    ttlMs: number,
    fetchInstance: ArrFetch = fetchCalendar,
    now: Clock = () => new Date(),
    mediaLinker?: MediaLinker,
    episodeDelayMs = 0,
    cacheOptions: FetcherCacheOptions = {},
  ) {
    const maxCacheEntries = cacheOptions.maxEntries ?? defaultMaxCacheEntries
    if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1) {
      throw new Error('fetcher cache: max entries must be a positive integer')
    }

    this.#instances = instances
    this.#ttlMs = ttlMs
    this.#fetchInstance = fetchInstance
    this.#now = now
    this.#mediaLinker = mediaLinker
    this.#episodeDelayMs = episodeDelayMs
    this.#maxCacheEntries = maxCacheEntries
    this.#monotonicNow = cacheOptions.monotonicNow ?? (() => performance.now())
  }

  async fetch(start: Date, end: Date): Promise<FetchResult> {
    const dayStart = utcStartOfDay(start)
    const dayEnd = utcStartOfDay(end)
    const results = await Promise.all(
      this.#instances.map((instance) => this.#instanceEvents(instance, dayStart, dayEnd)),
    )

    const events = results.flatMap((result) => result.events.map(cloneEvent))
    if (this.#mediaLinker) {
      try {
        await this.#mediaLinker.addLinks(events)
      } catch (error) {
        console.warn(`jellyfin link lookup failed: error=${errorMessage(error)}`)
      }
    }
    sortEvents(events)
    return {
      events,
      instances: results.map((result) => ({ ...result.status })),
    }
  }

  async #instanceEvents(instance: Instance, start: Date, end: Date): Promise<CacheEntry> {
    const key = `${instance.name}|${start.getTime() / 1000}|${end.getTime() / 1000}`
    this.#pruneExpired(this.#monotonicNow())
    const cached = this.#cache.get(key)
    if (cached !== undefined) {
      this.#cache.delete(key)
      this.#cache.set(key, cached)
      return cached
    }

    const existing = this.#inflight.get(key)
    if (existing !== undefined) {
      return await existing
    }

    const pending = this.#refresh(key, instance, start, end)
    this.#inflight.set(key, pending)
    try {
      return await pending
    } finally {
      if (this.#inflight.get(key) === pending) {
        this.#inflight.delete(key)
      }
    }
  }

  async #refresh(
    key: string,
    instance: Instance,
    start: Date,
    end: Date,
  ): Promise<CacheEntry> {
    let events: CalendarEvent[] = []
    let error: string | undefined
    try {
      const delay = instance.type === 'sonarr' ? this.#episodeDelayMs : 0
      const upstreamStart = new Date(start.getTime() - delay)
      const upstreamEnd = new Date(end.getTime() - delay)
      events = (await this.#fetchInstance(instance, upstreamStart, upstreamEnd)).map(cloneEvent)
      if (delay > 0) {
        for (const event of events) {
          if (event.kind !== 'episode') continue
          event.start = new Date(event.start.getTime() + delay)
          event.end = new Date(event.end.getTime() + delay)
        }
      }
      events = events.filter((event) => event.start >= start && event.start < end)
    } catch (cause) {
      error = errorMessage(cause)
      console.warn(`instance fetch failed: instance=${instance.name} error=${error}`)
    }

    const fetchedAt = this.#now()
    const cachedAt = this.#monotonicNow()
    const status: InstanceStatusDto = {
      name: instance.name,
      type: instance.type,
      ok: error === undefined,
      ...(error === undefined ? {} : { error }),
      fetchedAt: rfc3339(fetchedAt),
    }
    const entry: CacheEntry = {
      events,
      status,
      expiresAt: cachedAt + this.#ttlMs,
    }
    this.#pruneExpired(cachedAt)
    this.#cache.delete(key)
    this.#cache.set(key, entry)
    while (this.#cache.size > this.#maxCacheEntries) {
      const leastRecentlyUsed = this.#cache.keys().next().value
      if (leastRecentlyUsed === undefined) break
      this.#cache.delete(leastRecentlyUsed)
    }
    return entry
  }

  #pruneExpired(now: number): void {
    for (const [key, entry] of this.#cache) {
      if (now >= entry.expiresAt) {
        this.#cache.delete(key)
      }
    }
  }
}

function cloneEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    start: new Date(event.start),
    end: new Date(event.end),
    ...(event.providerIds === undefined ? {} : { providerIds: { ...event.providerIds } }),
  }
}

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

interface CacheEntry {
  events: CalendarEvent[]
  status: InstanceStatusDto
  expiresAt: number
}

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
  readonly #cache = new Map<string, CacheEntry>()
  readonly #inflight = new Map<string, Promise<CacheEntry>>()

  constructor(
    instances: Instance[],
    ttlMs: number,
    fetchInstance: ArrFetch = fetchCalendar,
    now: Clock = () => new Date(),
    mediaLinker?: MediaLinker,
    episodeDelayMs = 0,
  ) {
    this.#instances = instances
    this.#ttlMs = ttlMs
    this.#fetchInstance = fetchInstance
    this.#now = now
    this.#mediaLinker = mediaLinker
    this.#episodeDelayMs = episodeDelayMs
  }

  async fetch(start: Date, end: Date): Promise<FetchResult> {
    const dayStart = utcStartOfDay(start)
    const dayEnd = utcStartOfDay(end)
    const results = await Promise.all(
      this.#instances.map((instance) => this.#instanceEvents(instance, dayStart, dayEnd)),
    )

    const events = results.flatMap((result) => result.events)
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
      instances: results.map((result) => result.status),
    }
  }

  async #instanceEvents(instance: Instance, start: Date, end: Date): Promise<CacheEntry> {
    const key = `${instance.name}|${start.getTime() / 1000}|${end.getTime() / 1000}`
    const cached = this.#cache.get(key)
    if (cached !== undefined && this.#now().getTime() < cached.expiresAt) {
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
    const cached = this.#cache.get(key)
    if (cached !== undefined && this.#now().getTime() < cached.expiresAt) {
      return cached
    }

    let events: CalendarEvent[] = []
    let error: string | undefined
    try {
      const delay = instance.type === 'sonarr' ? this.#episodeDelayMs : 0
      const upstreamStart = new Date(start.getTime() - delay)
      const upstreamEnd = new Date(end.getTime() - delay)
      events = await this.#fetchInstance(instance, upstreamStart, upstreamEnd)
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
      expiresAt: fetchedAt.getTime() + this.#ttlMs,
    }
    this.#cache.set(key, entry)
    return entry
  }
}

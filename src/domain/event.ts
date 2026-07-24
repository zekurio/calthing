import type { EventDto, Kind, Source } from '../../shared/api.ts'

export interface CalendarEvent {
  uid: string
  instance: string
  source: Source
  kind: Kind
  title: string
  subtitle: string
  season: number
  episode: number
  start: Date
  end: Date
  allDay: boolean
  downloaded: boolean
  overview: string
  posterUrl: string
  providerIds?: Record<string, string>
  jellyfinUrl?: string
}

export function episodeUid(instance: string, episodeId: number): string {
  return `sonarr-${instance}-${episodeId}@calthing`
}

export function movieUid(
  instance: string,
  movieId: number,
  release: 'cinema' | 'digital' | 'physical',
): string {
  return `radarr-${instance}-${movieId}-${release}@calthing`
}

export function sxxEyy(event: Pick<CalendarEvent, 'season' | 'episode'>): string {
  return `S${String(event.season).padStart(2, '0')}E${String(event.episode).padStart(2, '0')}`
}

export function sortEvents(events: CalendarEvent[]): void {
  events.sort((a, b) => {
    const byStart = a.start.getTime() - b.start.getTime()
    if (byStart !== 0) return byStart
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
  })
}

export function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function toRfc3339(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, 'Z').replace(/(\.\d*?[1-9])0+Z$/, '$1Z')
}

export function toEventDto(event: CalendarEvent): EventDto {
  return {
    uid: event.uid,
    instance: event.instance,
    source: event.source,
    kind: event.kind,
    title: event.title,
    subtitle: event.subtitle,
    season: event.season,
    episode: event.episode,
    start: toRfc3339(event.start),
    end: toRfc3339(event.end),
    allDay: event.allDay,
    downloaded: event.downloaded,
    overview: event.overview,
    posterUrl: event.posterUrl,
    jellyfinUrl: event.jellyfinUrl ?? '',
  }
}

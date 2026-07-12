import type { Instance } from '../config.ts'
import { type CalendarEvent, episodeUid } from '../domain/event.ts'
import { type ArrImage, calendarQuery, getJson, type HttpFetch, posterUrl } from './client.ts'

const defaultEpisodeRuntimeMinutes = 30

interface SonarrEpisode {
  id: number
  title: string
  seasonNumber: number
  episodeNumber: number
  airDateUtc?: string
  hasFile?: boolean
  overview?: string
  series?: {
    title: string
    runtime?: number
    images?: ArrImage[]
  }
}

export async function fetchSonarr(
  instance: Instance,
  start: Date,
  end: Date,
  fetchFn: HttpFetch = fetch,
): Promise<CalendarEvent[]> {
  const query = calendarQuery(start, end, instance.includeUnmonitored)
  query.set('includeSeries', 'true')
  const episodes = await getJson<SonarrEpisode[]>(instance, '/api/v3/calendar', query, fetchFn)
  const events: CalendarEvent[] = []

  for (const episode of episodes) {
    if (!episode.airDateUtc) {
      continue
    }
    const eventStart = new Date(episode.airDateUtc)
    if (Number.isNaN(eventStart.getTime())) {
      continue
    }
    const series = episode.series
    const configuredRuntime = series?.runtime ?? 0
    const runtimeMinutes = configuredRuntime > 0 ? configuredRuntime : defaultEpisodeRuntimeMinutes
    events.push({
      uid: episodeUid(instance.name, episode.id),
      instance: instance.name,
      source: 'sonarr',
      kind: 'episode',
      title: series?.title ?? '',
      subtitle: episode.title,
      season: episode.seasonNumber,
      episode: episode.episodeNumber,
      start: eventStart,
      end: new Date(eventStart.getTime() + runtimeMinutes * 60_000),
      allDay: false,
      downloaded: episode.hasFile ?? false,
      overview: episode.overview ?? '',
      posterUrl: posterUrl(series?.images),
    })
  }

  return events
}

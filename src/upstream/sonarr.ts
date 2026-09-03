import { Type } from '@sinclair/typebox'

import type { Instance } from '../config.ts'
import { type CalendarEvent, episodeUid } from '../domain/event.ts'
import { calendarQuery, getJson, type HttpFetch, posterUrl } from './client.ts'
import { ArrImageSchema } from './schemas.ts'

const defaultEpisodeRuntimeMinutes = 30

const NullableStringSchema = Type.Union([Type.String(), Type.Null()])
const SonarrEpisodeSchema = Type.Object({
  id: Type.Number(),
  title: Type.String(),
  seasonNumber: Type.Number(),
  episodeNumber: Type.Number(),
  airDateUtc: Type.Optional(NullableStringSchema),
  hasFile: Type.Optional(Type.Boolean()),
  overview: Type.Optional(NullableStringSchema),
  tvdbId: Type.Optional(Type.Number()),
  series: Type.Optional(Type.Union([
    Type.Object({
      title: Type.String(),
      runtime: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
      images: Type.Optional(Type.Union([Type.Array(ArrImageSchema), Type.Null()])),
    }),
    Type.Null(),
  ])),
})
const SonarrCalendarSchema = Type.Array(SonarrEpisodeSchema)

export async function fetchSonarr(
  instance: Instance,
  start: Date,
  end: Date,
  fetchFn: HttpFetch = fetch,
): Promise<CalendarEvent[]> {
  const query = calendarQuery(start, end, instance.includeUnmonitored)
  query.set('includeSeries', 'true')
  const episodes = await getJson(instance, '/api/v3/calendar', query, SonarrCalendarSchema, fetchFn)
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
      providerIds: episode.tvdbId ? { Tvdb: String(episode.tvdbId) } : {},
      jellyfinUrl: '',
    })
  }

  return events
}

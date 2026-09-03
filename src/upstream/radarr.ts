import { Type } from '@sinclair/typebox'

import type { Instance } from '../config.ts'
import { addUtcDays, type CalendarEvent, movieUid } from '../domain/event.ts'
import { calendarQuery, getJson, type HttpFetch, posterUrl } from './client.ts'
import { ArrImageSchema } from './schemas.ts'

const NullableStringSchema = Type.Union([Type.String(), Type.Null()])
const RadarrMovieSchema = Type.Object({
  id: Type.Number(),
  title: Type.String(),
  tmdbId: Type.Optional(Type.Number()),
  inCinemas: Type.Optional(NullableStringSchema),
  digitalRelease: Type.Optional(NullableStringSchema),
  physicalRelease: Type.Optional(NullableStringSchema),
  hasFile: Type.Optional(Type.Boolean()),
  overview: Type.Optional(NullableStringSchema),
  images: Type.Optional(Type.Union([Type.Array(ArrImageSchema), Type.Null()])),
})
const RadarrCalendarSchema = Type.Array(RadarrMovieSchema)

function releaseDay(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function fetchRadarr(
  instance: Instance,
  start: Date,
  end: Date,
  fetchFn: HttpFetch = fetch,
): Promise<CalendarEvent[]> {
  const query = calendarQuery(start, end, instance.includeUnmonitored)
  const movies = await getJson(instance, '/api/v3/calendar', query, RadarrCalendarSchema, fetchFn)
  const events: CalendarEvent[] = []

  for (const movie of movies) {
    const releases = [
      { name: 'cinema' as const, kind: 'movie-cinema' as const, date: movie.inCinemas },
      { name: 'digital' as const, kind: 'movie-digital' as const, date: movie.digitalRelease },
      { name: 'physical' as const, kind: 'movie-physical' as const, date: movie.physicalRelease },
    ]

    for (const release of releases) {
      const day = releaseDay(release.date)
      if (day === undefined || day < start || day >= end) {
        continue
      }
      events.push({
        uid: movieUid(instance.name, movie.id, release.name),
        instance: instance.name,
        source: 'radarr',
        kind: release.kind,
        title: movie.title,
        subtitle: '',
        season: 0,
        episode: 0,
        start: day,
        end: addUtcDays(day, 1),
        allDay: true,
        downloaded: movie.hasFile ?? false,
        overview: movie.overview ?? '',
        posterUrl: posterUrl(movie.images),
        providerIds: movie.tmdbId ? { Tmdb: String(movie.tmdbId) } : {},
        jellyfinUrl: '',
      })
    }
  }

  return events
}

import type { EventDto, Kind } from '../../../shared/api.ts'

export type MovieReleaseKind = Exclude<Kind, 'episode'>

const movieReleaseCodes: Record<MovieReleaseKind, string> = {
  'movie-cinema': 'CIN',
  'movie-digital': 'DIG',
  'movie-physical': 'PHY',
}

export function eventColor(event: EventDto, instanceColor?: string): string {
  return instanceColor ?? (event.source === 'radarr' ? 'var(--radarr)' : 'var(--sonarr)')
}

export function movieReleaseCode(kind: MovieReleaseKind): string {
  return movieReleaseCodes[kind]
}

export function eventAriaLabel(
  event: EventDto,
  detail: string,
  availability: string,
  time?: string,
): string {
  return [event.title, event.instance, detail, time, availability].filter(Boolean).join(', ')
}

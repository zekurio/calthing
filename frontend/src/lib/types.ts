// Mirrors the Go JSON API (internal/event, internal/fetch).

export type Kind = 'episode' | 'movie-cinema' | 'movie-digital' | 'movie-physical'

export interface ArrEvent {
  uid: string
  instance: string
  source: 'radarr' | 'sonarr'
  kind: Kind
  title: string
  subtitle: string
  season: number
  episode: number
  start: string // RFC3339
  end: string
  allDay: boolean
  downloaded: boolean
  overview: string
  posterUrl: string
}

export interface InstanceStatus {
  name: string
  type: 'radarr' | 'sonarr'
  ok: boolean
  error?: string
  fetchedAt: string
}

export interface EventsResponse {
  events: ArrEvent[]
  instances: InstanceStatus[]
}

export const KIND_LABELS: Record<Kind, string> = {
  episode: 'Episode',
  'movie-cinema': 'Cinema release',
  'movie-digital': 'Digital release',
  'movie-physical': 'Physical release',
}

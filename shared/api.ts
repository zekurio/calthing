export type Source = 'radarr' | 'sonarr'

export type Kind =
  | 'episode'
  | 'movie-cinema'
  | 'movie-digital'
  | 'movie-physical'

export interface EventDto {
  uid: string
  instance: string
  source: Source
  kind: Kind
  title: string
  subtitle: string
  season: number
  episode: number
  start: string
  end: string
  allDay: boolean
  downloaded: boolean
  overview: string
  posterUrl: string
  jellyfinUrl: string
}

export interface BrandingDto {
  name: string
  iconUrl: string
  pageTitle: string
  description: string
}

export interface InstanceStatusDto {
  name: string
  type: Source
  ok: boolean
  error?: string
  fetchedAt: string
}

export interface EventsResponse {
  events: EventDto[]
  instances: InstanceStatusDto[]
  branding: BrandingDto
}

export interface HealthResponse {
  status: 'ok'
  instances: number
}

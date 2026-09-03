import { type Static, Type } from '@sinclair/typebox'

export const MAX_CALENDAR_WINDOW_DAYS = 370

export const SourceSchema = Type.Union([
  Type.Literal('radarr'),
  Type.Literal('sonarr'),
])

export type Source = Static<typeof SourceSchema>

export const KindSchema = Type.Union([
  Type.Literal('episode'),
  Type.Literal('movie-cinema'),
  Type.Literal('movie-digital'),
  Type.Literal('movie-physical'),
])

export type Kind = Static<typeof KindSchema>

export const EventDtoSchema = Type.Object({
  uid: Type.String(),
  instance: Type.String(),
  source: SourceSchema,
  kind: KindSchema,
  title: Type.String(),
  subtitle: Type.String(),
  season: Type.Number(),
  episode: Type.Number(),
  start: Type.String(),
  end: Type.String(),
  allDay: Type.Boolean(),
  downloaded: Type.Boolean(),
  overview: Type.String(),
  posterUrl: Type.String(),
  jellyfinUrl: Type.String(),
})

export type EventDto = Static<typeof EventDtoSchema>

export const BrandingDtoSchema = Type.Object({
  name: Type.String(),
  iconUrl: Type.String(),
  pageTitle: Type.String(),
  description: Type.String(),
})

export type BrandingDto = Static<typeof BrandingDtoSchema>

export const InstanceStatusDtoSchema = Type.Object({
  name: Type.String(),
  type: SourceSchema,
  ok: Type.Boolean(),
  error: Type.Optional(Type.String()),
  fetchedAt: Type.String(),
})

export type InstanceStatusDto = Static<typeof InstanceStatusDtoSchema>

export const EventsResponseSchema = Type.Object({
  events: Type.Array(EventDtoSchema),
  instances: Type.Array(InstanceStatusDtoSchema),
  branding: BrandingDtoSchema,
})

export type EventsResponse = Static<typeof EventsResponseSchema>

export const HealthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  instances: Type.Number(),
})

export type HealthResponse = Static<typeof HealthResponseSchema>

/**
 * Current session. With auth disabled the API answers anonymously with empty
 * strings; with auth enabled a missing session yields 401 instead.
 */
export const MeDtoSchema = Type.Object({
  name: Type.String(),
  /** per-user credential for /calendar.ics?token=… — empty when auth is disabled */
  feedToken: Type.String(),
  /** Jellyfin profile image; empty when the user has none or auth is disabled */
  avatarUrl: Type.String(),
})

export type MeDto = Static<typeof MeDtoSchema>

export const LoginRequestSchema = Type.Object({
  username: Type.String({ minLength: 1 }),
  password: Type.String(),
  deviceId: Type.String({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  }),
})

export type LoginRequest = Static<typeof LoginRequestSchema>

export const LogoutResponseSchema = Type.Object({ ok: Type.Literal(true) })

export type LogoutResponse = Static<typeof LogoutResponseSchema>

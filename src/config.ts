import { parse as parseYaml } from '@std/yaml'
import { type Static, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { BrandingDtoSchema, MAX_CALENDAR_WINDOW_DAYS, SourceSchema } from '../shared/api.ts'

export type Env = Record<string, string | undefined>

export const InstanceSchema = Type.Object({
  name: Type.String(),
  type: SourceSchema,
  url: Type.String(),
  apiKey: Type.String(),
  includeUnmonitored: Type.Boolean(),
})

export type Instance = Static<typeof InstanceSchema>

export const ConfigSchema = Type.Object({
  listen: Type.String(),
  cache: Type.Object({ ttlMs: Type.Number() }),
  calendar: Type.Object({
    pastDays: Type.Integer(),
    futureDays: Type.Integer(),
    name: Type.String(),
    availabilityDelayMs: Type.Number(),
    feedSecret: Type.String(),
  }),
  branding: BrandingDtoSchema,
  jellyfin: Type.Object({
    url: Type.String(),
    publicUrl: Type.String(),
    apiKey: Type.String(),
  }),
  instances: Type.Array(InstanceSchema),
})

export type Config = Static<typeof ConfigSchema>

const StringInputSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
])
const IntegerInputSchema = Type.Union([Type.Integer(), Type.Null()])
const BooleanInputSchema = Type.Union([Type.Boolean(), Type.Null()])
const RawInstanceSchema = Type.Object({
  name: Type.Optional(StringInputSchema),
  type: Type.Optional(StringInputSchema),
  url: Type.Optional(StringInputSchema),
  api_key: Type.Optional(StringInputSchema),
  include_unmonitored: Type.Optional(BooleanInputSchema),
})
const RawConfigSchema = Type.Object({
  listen: Type.Optional(StringInputSchema),
  cache: Type.Optional(Type.Union([
    Type.Object({ ttl: Type.Optional(StringInputSchema) }),
    Type.Null(),
  ])),
  calendar: Type.Optional(Type.Union([
    Type.Object({
      past_days: Type.Optional(IntegerInputSchema),
      future_days: Type.Optional(IntegerInputSchema),
      name: Type.Optional(StringInputSchema),
      availability_delay: Type.Optional(StringInputSchema),
      feed_secret: Type.Optional(StringInputSchema),
    }),
    Type.Null(),
  ])),
  branding: Type.Optional(Type.Union([
    Type.Object({
      name: Type.Optional(StringInputSchema),
      icon_url: Type.Optional(StringInputSchema),
      page_title: Type.Optional(StringInputSchema),
      description: Type.Optional(StringInputSchema),
    }),
    Type.Null(),
  ])),
  jellyfin: Type.Optional(Type.Union([
    Type.Object({
      url: Type.Optional(StringInputSchema),
      public_url: Type.Optional(StringInputSchema),
      api_key: Type.Optional(StringInputSchema),
    }),
    Type.Null(),
  ])),
  instances: Type.Optional(Type.Array(Type.Union([RawInstanceSchema, Type.Null()]))),
})

type RawConfig = Static<typeof RawConfigSchema>
type RawInstance = Static<typeof RawInstanceSchema>
type StringInput = Static<typeof StringInputSchema>
type IntegerInput = Static<typeof IntegerInputSchema>
type BooleanInput = Static<typeof BooleanInputSchema>

const DEFAULT_LISTEN = ':8080'
const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_PAST_DAYS = 30
const DEFAULT_FUTURE_DAYS = 90
const DEFAULT_CALENDAR_NAME = 'Media Calendar'
const DEFAULT_BRAND_NAME = 'calthing'

const DURATION_UNITS: Readonly<Record<string, number>> = {
  ns: 1 / 1_000_000,
  us: 1 / 1000,
  'µs': 1 / 1000,
  'μs': 1 / 1000,
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
}

function parseDuration(value: StringInput): number {
  if (value === null) throw new Error(`invalid duration ${JSON.stringify(value)}`)
  const duration = String(value)
  if (duration === '0') return 0

  let sign = 1
  let rest = duration
  if (rest.startsWith('-') || rest.startsWith('+')) {
    sign = rest[0] === '-' ? -1 : 1
    rest = rest.slice(1)
  }
  if (rest.length === 0) throw new Error(`invalid duration ${JSON.stringify(value)}`)

  const part = /^(?:(\d+(?:\.\d*)?)|(\.\d+))(ns|us|µs|μs|ms|s|m|h)/
  let total = 0
  let matched = false
  while (rest.length > 0) {
    const match = part.exec(rest)
    if (match === null) throw new Error(`invalid duration ${JSON.stringify(value)}`)
    const amount = Number(match[1] ?? match[2])
    const unit = DURATION_UNITS[match[3] as string]
    if (unit === undefined || !Number.isFinite(amount)) {
      throw new Error(`invalid duration ${JSON.stringify(value)}`)
    }
    total += amount * unit
    rest = rest.slice(match[0].length)
    matched = true
  }
  if (!matched || !Number.isFinite(total)) {
    throw new Error(`invalid duration ${JSON.stringify(value)}`)
  }
  return sign * total
}

function expandEnv(raw: string, env: Env): string {
  const missing: string[] = []
  const expanded = raw.replace(
    /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_reference, braced: string | undefined, bare: string | undefined) => {
      const name = braced ?? bare as string
      const value = env[name]
      if (value === undefined) {
        missing.push(name)
        return ''
      }
      return value
    },
  )
  if (missing.length > 0) {
    throw new Error(`config references unset environment variables: ${missing.join(', ')}`)
  }
  return expanded
}

function stringValue(value: StringInput | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function integerValue(value: IntegerInput | undefined, fallback: number): number {
  return value ?? fallback
}

function booleanValue(value: BooleanInput | undefined, fallback: boolean): boolean {
  return value ?? fallback
}

function parseInstance(value: RawInstance | null, index: number): Instance {
  const raw = value ?? {}
  const name = stringValue(raw.name, '')
  if (name === '') {
    throw new Error(`config: instances[${index}]: name is required`)
  }
  const type = stringValue(raw.type, '')
  if (type !== 'radarr' && type !== 'sonarr') {
    throw new Error(
      `config: instance ${JSON.stringify(name)}: type must be "radarr" or "sonarr", got ${
        JSON.stringify(type)
      }`,
    )
  }
  return {
    name,
    type,
    url: stringValue(raw.url, ''),
    apiKey: stringValue(raw.api_key, ''),
    includeUnmonitored: booleanValue(raw.include_unmonitored, false),
  }
}

function validate(config: Config): void {
  if (config.instances.length === 0) {
    throw new Error('config: at least one instance is required')
  }
  if (config.cache.ttlMs <= 0) {
    throw new Error('config: cache.ttl must be positive')
  }
  if (config.calendar.pastDays < 0 || config.calendar.futureDays < 0) {
    throw new Error('config: calendar.past_days and future_days must be >= 0')
  }
  if (config.calendar.pastDays + config.calendar.futureDays > MAX_CALENDAR_WINDOW_DAYS) {
    throw new Error(
      `config: calendar default window must not exceed ${MAX_CALENDAR_WINDOW_DAYS} days`,
    )
  }
  if (config.calendar.availabilityDelayMs < 0) {
    throw new Error('config: calendar.availability_delay must be >= 0')
  }

  const linkValues = [config.jellyfin.publicUrl, config.jellyfin.apiKey]
  if (linkValues.some(Boolean)) {
    if (!linkValues.every(Boolean)) {
      throw new Error('config: jellyfin.public_url and api_key must be set together')
    }
    if (!config.jellyfin.url) {
      throw new Error('config: jellyfin.url is required when public_url and api_key are set')
    }
  }
  if (config.jellyfin.url !== '' && config.calendar.feedSecret === '') {
    throw new Error(
      'config: calendar.feed_secret is required when jellyfin.url is set — it signs personal feed URLs',
    )
  }
  if (config.calendar.feedSecret !== '' && config.jellyfin.url === '') {
    throw new Error('config: calendar.feed_secret requires jellyfin.url')
  }
  for (
    const [path, value] of [
      ['branding.icon_url', config.branding.iconUrl],
      ['jellyfin.url', config.jellyfin.url],
      ['jellyfin.public_url', config.jellyfin.publicUrl],
    ] as const
  ) {
    if (!value) continue
    try {
      new URL(value)
    } catch {
      throw new Error(`config: ${path}: invalid url ${JSON.stringify(value)}`)
    }
  }

  const names = new Set<string>()
  for (let index = 0; index < config.instances.length; index++) {
    const instance = config.instances[index]
    if (instance === undefined) continue
    if (instance.name === '') {
      throw new Error(`config: instances[${index}]: name is required`)
    }
    if (names.has(instance.name)) {
      throw new Error(`config: duplicate instance name ${JSON.stringify(instance.name)}`)
    }
    names.add(instance.name)

    let url: URL
    try {
      url = new URL(instance.url)
    } catch {
      throw new Error(
        `config: instance ${JSON.stringify(instance.name)}: invalid url ${
          JSON.stringify(instance.url)
        }`,
      )
    }
    if (url.protocol === '' || url.hostname === '') {
      throw new Error(
        `config: instance ${JSON.stringify(instance.name)}: invalid url ${
          JSON.stringify(instance.url)
        }`,
      )
    }
    if (instance.apiKey === '') {
      throw new Error(`config: instance ${JSON.stringify(instance.name)}: api_key is required`)
    }
  }
}

export function parseConfig(raw: string, env: Env = Deno.env.toObject()): Config {
  let parsed: unknown
  try {
    parsed = parseYaml(expandEnv(raw, env))
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('config references unset environment variables:')
    ) {
      throw error
    }
    throw new Error(`parse config: ${error instanceof Error ? error.message : String(error)}`)
  }

  const root = decodeRawConfig(parsed ?? {})
  const cache = root.cache ?? {}
  const calendar = root.calendar ?? {}
  const branding = root.branding ?? {}
  const jellyfin = root.jellyfin ?? {}

  let ttlMs = DEFAULT_TTL_MS
  if (cache.ttl !== undefined && cache.ttl !== null) {
    try {
      ttlMs = parseDuration(cache.ttl)
    } catch (error) {
      throw new Error(`parse config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  let availabilityDelayMs = 0
  if (calendar.availability_delay !== undefined && calendar.availability_delay !== null) {
    try {
      availabilityDelayMs = parseDuration(calendar.availability_delay)
    } catch (error) {
      throw new Error(`parse config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const config: Config = {
    listen: stringValue(root.listen, DEFAULT_LISTEN),
    cache: { ttlMs },
    calendar: {
      pastDays: integerValue(calendar.past_days, DEFAULT_PAST_DAYS),
      futureDays: integerValue(calendar.future_days, DEFAULT_FUTURE_DAYS),
      name: stringValue(calendar.name, DEFAULT_CALENDAR_NAME),
      availabilityDelayMs,
      feedSecret: stringValue(calendar.feed_secret, ''),
    },
    branding: {
      name: stringValue(branding.name, DEFAULT_BRAND_NAME),
      iconUrl: stringValue(branding.icon_url, ''),
      pageTitle: stringValue(branding.page_title, ''),
      description: stringValue(branding.description, ''),
    },
    jellyfin: {
      url: stringValue(jellyfin.url, ''),
      publicUrl: stringValue(jellyfin.public_url, ''),
      apiKey: stringValue(jellyfin.api_key, ''),
    },
    instances: (root.instances ?? []).map(parseInstance),
  }

  if (env.CALTHING_LISTEN) config.listen = env.CALTHING_LISTEN

  validate(config)
  return Value.Decode(ConfigSchema, config)
}

export async function loadConfig(path: string, env: Env = Deno.env.toObject()): Promise<Config> {
  let raw: string
  try {
    raw = await Deno.readTextFile(path)
  } catch (error) {
    throw new Error(`read config: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseConfig(raw, env)
}

function decodeRawConfig(value: unknown): RawConfig {
  if (Value.Check(RawConfigSchema, value)) return Value.Decode(RawConfigSchema, value)

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('parse config: root must be a mapping')
  }
  for (const key of ['cache', 'calendar', 'branding', 'jellyfin'] as const) {
    const nested = Reflect.get(value, key)
    if (
      nested !== undefined && nested !== null &&
      (typeof nested !== 'object' || Array.isArray(nested))
    ) {
      throw new Error(`parse config: ${key} must be a mapping`)
    }
  }
  const instances = Reflect.get(value, 'instances')
  if (instances !== undefined && !Array.isArray(instances)) {
    throw new Error('parse config: instances must be a sequence')
  }
  for (let index = 0; index < (instances?.length ?? 0); index++) {
    const instance = instances?.[index]
    if (instance !== null && (typeof instance !== 'object' || Array.isArray(instance))) {
      throw new Error(`parse config: instances[${index}] must be a mapping`)
    }
    for (const key of ['name', 'type', 'url', 'api_key'] as const) {
      const field = property(instance, key)
      if (
        field !== undefined && field !== null && typeof field !== 'string' &&
        typeof field !== 'number' && typeof field !== 'boolean'
      ) {
        throw new Error(`parse config: instances[${index}].${key} must be a string`)
      }
    }
    const includeUnmonitored = property(instance, 'include_unmonitored')
    if (
      includeUnmonitored !== undefined && includeUnmonitored !== null &&
      typeof includeUnmonitored !== 'boolean'
    ) {
      throw new Error(`parse config: instances[${index}].include_unmonitored must be a boolean`)
    }
  }

  const stringValues = [
    ['listen', Reflect.get(value, 'listen')],
    ['calendar.name', property(Reflect.get(value, 'calendar'), 'name')],
    ['calendar.feed_secret', property(Reflect.get(value, 'calendar'), 'feed_secret')],
    ['branding.name', property(Reflect.get(value, 'branding'), 'name')],
    ['branding.icon_url', property(Reflect.get(value, 'branding'), 'icon_url')],
    ['branding.page_title', property(Reflect.get(value, 'branding'), 'page_title')],
    ['branding.description', property(Reflect.get(value, 'branding'), 'description')],
    ['jellyfin.url', property(Reflect.get(value, 'jellyfin'), 'url')],
    ['jellyfin.public_url', property(Reflect.get(value, 'jellyfin'), 'public_url')],
    ['jellyfin.api_key', property(Reflect.get(value, 'jellyfin'), 'api_key')],
  ] as const
  for (const [path, field] of stringValues) {
    if (
      field !== undefined && field !== null && typeof field !== 'string' &&
      typeof field !== 'number' && typeof field !== 'boolean'
    ) {
      throw new Error(`parse config: ${path} must be a string`)
    }
  }

  for (
    const [path, field] of [
      ['calendar.past_days', property(Reflect.get(value, 'calendar'), 'past_days')],
      ['calendar.future_days', property(Reflect.get(value, 'calendar'), 'future_days')],
    ] as const
  ) {
    if (
      field !== undefined && field !== null &&
      (typeof field !== 'number' || !Number.isInteger(field))
    ) {
      throw new Error(`parse config: ${path} must be an integer`)
    }
  }

  const first = Value.Errors(RawConfigSchema, value).First()
  const path = first?.path ? first.path.slice(1).replaceAll('/', '.') : 'root'
  throw new Error(`parse config: ${path} ${first?.message.toLowerCase() ?? 'is invalid'}`)
}

function property(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Reflect.get(value, key)
}

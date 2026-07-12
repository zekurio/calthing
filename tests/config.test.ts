import { assertEquals, assertThrows } from '@std/assert'
import { parseConfig } from '../src/config.ts'

const validYaml = `
listen: ':9090'
cache:
  ttl: 5m
calendar:
  past_days: 7
  future_days: 14
  name: Test Calendar
auth:
  token: secret
instances:
  - name: movies
    type: radarr
    url: http://localhost:7878
    api_key: abc123
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: def456
    include_unmonitored: true
`

Deno.test('parseConfig loads explicit values', () => {
  const config = parseConfig(validYaml, {})

  assertEquals(config.listen, ':9090')
  assertEquals(config.cache.ttlMs, 5 * 60 * 1000)
  assertEquals(config.calendar, {
    pastDays: 7,
    futureDays: 14,
    name: 'Test Calendar',
  })
  assertEquals(config.auth.token, 'secret')
  assertEquals(config.instances, [
    {
      name: 'movies',
      type: 'radarr',
      url: 'http://localhost:7878',
      apiKey: 'abc123',
      includeUnmonitored: false,
    },
    {
      name: 'tv',
      type: 'sonarr',
      url: 'http://localhost:8989',
      apiKey: 'def456',
      includeUnmonitored: true,
    },
  ])
})

Deno.test('parseConfig applies the Go defaults and compound duration syntax', () => {
  const config = parseConfig(
    `
instances:
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: key
`,
    {},
  )

  assertEquals(config.listen, ':8080')
  assertEquals(config.cache.ttlMs, 10 * 60 * 1000)
  assertEquals(config.calendar, {
    pastDays: 30,
    futureDays: 90,
    name: 'Media Calendar',
  })
  assertEquals(config.auth.token, '')

  const compound = parseConfig(validYaml.replace('5m', '1h30m500ms'), {})
  assertEquals(compound.cache.ttlMs, 5_400_500)
})

Deno.test('parseConfig expands environment references and applies non-empty overrides', () => {
  const config = parseConfig(
    `
listen: ':9090'
auth:
  token: yaml-token
instances:
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: $TEST_ARR_KEY
`,
    {
      TEST_ARR_KEY: 'expanded-key',
      ARR_CAL_PROXY_LISTEN: ':7777',
      ARR_CAL_PROXY_TOKEN: 'env-token',
    },
  )

  assertEquals(config.instances[0]?.apiKey, 'expanded-key')
  assertEquals(config.listen, ':7777')
  assertEquals(config.auth.token, 'env-token')

  const noEmptyOverride = parseConfig(validYaml, {
    ARR_CAL_PROXY_LISTEN: '',
    ARR_CAL_PROXY_TOKEN: '',
  })
  assertEquals(noEmptyOverride.listen, ':9090')
  assertEquals(noEmptyOverride.auth.token, 'secret')
})

Deno.test('parseConfig reports every missing environment reference', () => {
  assertThrows(
    () =>
      parseConfig(
        `
instances:
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: \${MISSING_KEY}-\${ALSO_MISSING}
`,
        {},
      ),
    Error,
    'config references unset environment variables: MISSING_KEY, ALSO_MISSING',
  )
})

Deno.test('parseConfig preserves config validation errors', async (t) => {
  const cases: Array<[string, string, string]> = [
    ['no instances', "listen: ':8080'", 'at least one instance'],
    [
      'bad type',
      `instances:
  - {name: x, type: lidarr, url: 'http://a', api_key: k}`,
      'type must be',
    ],
    [
      'duplicate names',
      `instances:
  - {name: x, type: radarr, url: 'http://a', api_key: k}
  - {name: x, type: sonarr, url: 'http://b', api_key: k}`,
      'duplicate instance name',
    ],
    [
      'missing api key',
      `instances:
  - {name: x, type: radarr, url: 'http://a', api_key: ''}`,
      'api_key is required',
    ],
    [
      'bad url',
      `instances:
  - {name: x, type: radarr, url: 'not a url', api_key: k}`,
      'invalid url',
    ],
    [
      'missing name',
      `instances:
  - {name: '', type: radarr, url: 'http://a', api_key: k}`,
      'name is required',
    ],
    [
      'bad duration',
      `cache: {ttl: banana}
instances:
  - {name: x, type: radarr, url: 'http://a', api_key: k}`,
      'invalid duration',
    ],
    [
      'zero duration',
      `cache: {ttl: 0s}
instances:
  - {name: x, type: radarr, url: 'http://a', api_key: k}`,
      'cache.ttl must be positive',
    ],
    [
      'negative window',
      `calendar: {past_days: -1}
instances:
  - {name: x, type: radarr, url: 'http://a', api_key: k}`,
      'past_days and future_days must be >= 0',
    ],
  ]

  for (const [name, yaml, message] of cases) {
    await t.step(name, () => {
      assertThrows(() => parseConfig(yaml, {}), Error, message)
    })
  }
})

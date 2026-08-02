import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert'

import type { CalendarEvent } from '../src/domain/event.ts'
import { JellyfinClient } from '../src/upstream/jellyfin.ts'

function episode(tvdbId: string): CalendarEvent {
  return {
    uid: `episode-${tvdbId}`,
    instance: 'tv',
    source: 'sonarr',
    kind: 'episode',
    title: 'Show',
    subtitle: 'Episode',
    season: 1,
    episode: 2,
    start: new Date('2026-07-01T00:00:00Z'),
    end: new Date('2026-07-01T00:30:00Z'),
    allDay: false,
    downloaded: true,
    overview: '',
    posterUrl: '',
    providerIds: { Tvdb: tvdbId },
  }
}

const config = {
  url: 'http://jellyfin.internal:8096/base',
  publicUrl: 'https://watch.example/jellyfin',
  apiKey: 'secret',
}

Deno.test('Jellyfin matches TVDB episode IDs using standard API-key authorization', async () => {
  const events = [episode('123'), episode('456')]
  let requested: URL | undefined
  let authorization = ''
  const client = new JellyfinClient(config, (input, init) => {
    requested = new URL(input.toString())
    authorization = new Headers(init?.headers).get('Authorization') ?? ''
    return Promise.resolve(Response.json({
      TotalRecordCount: 1,
      Items: [{
        Id: 'item-a',
        Name: 'Folgentitel',
        SeriesName: 'Serientitel',
        Overview: 'Deutsche Beschreibung',
        ProviderIds: { Tvdb: '123' },
      }],
    }))
  })

  await client.addLinks(events)

  assertEquals(authorization, 'MediaBrowser Token="secret"')
  assertEquals(requested?.pathname, '/base/Items')
  assertEquals(requested?.searchParams.get('IncludeItemTypes'), 'Episode,Movie')
  assertEquals(requested?.searchParams.get('Limit'), '1000')
  assertEquals(events[0]?.jellyfinUrl, 'https://watch.example/jellyfin/web/#/details?id=item-a')
  assertEquals(events[0]?.title, 'Serientitel')
  assertEquals(events[0]?.subtitle, 'Folgentitel')
  assertEquals(events[0]?.overview, 'Deutsche Beschreibung')
  assertEquals(events[1]?.jellyfinUrl, undefined)
  assertStringIncludes(requested?.toString() ?? '', 'jellyfin.internal')
})

Deno.test('Jellyfin continues full pages when item counts are omitted', async () => {
  const starts: string[] = []
  const client = new JellyfinClient(config, (input) => {
    const url = new URL(input.toString())
    starts.push(url.searchParams.get('StartIndex') ?? '')
    if (starts.length === 1) {
      return Promise.resolve(Response.json({
        Items: Array.from({ length: 1000 }, (_, index) => ({ Id: `other-${index}` })),
      }))
    }
    return Promise.resolve(Response.json({
      Items: [{ Id: 'wanted', ProviderIds: { Tvdb: '123' } }],
    }))
  })
  const events = [episode('123')]

  await client.addLinks(events)

  assertEquals(starts, ['0', '1000'])
  assertEquals(events[0]?.jellyfinUrl, 'https://watch.example/jellyfin/web/#/details?id=wanted')
})

Deno.test('Jellyfin errors include bounded upstream context', async () => {
  const marker = 'must-not-leak'
  const client = new JellyfinClient(
    config,
    () => Promise.resolve(new Response(`${'x'.repeat(600)}${marker}`, { status: 500 })),
  )

  const error = await assertRejects(() => client.addLinks([episode('123')]), Error)
  assertStringIncludes(error.message, 'jellyfin: /Items returned 500:')
  assertEquals(error.message.includes(marker), false)
  assertEquals(error.message.length <= 550, true)
})

Deno.test('Jellyfin login keeps browser device IDs stable and validates every request', async () => {
  const requests: Array<{ url: URL; authorization: string }> = []
  const deviceInputs: Array<[string, string, string]> = []
  const client = new JellyfinClient(config, (input, init) => {
    const url = new URL(input.toString())
    const authorization = new Headers(init?.headers).get('Authorization') ?? ''
    requests.push({ url, authorization })

    if (url.pathname === '/base/Users/AuthenticateByName') {
      const { Pw } = JSON.parse(String(init?.body)) as { Pw: string }
      if (Pw !== 'right') return Promise.resolve(new Response('denied', { status: 401 }))
      return Promise.resolve(Response.json({
        AccessToken: 'jf-token',
        User: { Id: 'user-1', Name: 'alice', PrimaryImageTag: 'tag123' },
      }))
    }
    if (url.pathname === '/base/Users/Me') {
      if (authorization !== 'MediaBrowser Token="jf-token"') {
        return Promise.resolve(new Response('denied', { status: 401 }))
      }
      return Promise.resolve(
        Response.json({ Id: 'user-1', Name: 'alice', PrimaryImageTag: 'tag123' }),
      )
    }
    if (url.pathname === '/base/Sessions/Logout') {
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(new Response('unexpected', { status: 500 }))
  }, (scope, username, browserDeviceId) => {
    deviceInputs.push([scope, username, browserDeviceId])
    return `${browserDeviceId}-${username}`
  })

  const avatarUrl = 'https://watch.example/jellyfin/Users/user-1/Images/Primary?tag=tag123'
  assertEquals(await client.authenticate('alice', 'wrong', 'browser-one'), null)
  const session = await client.authenticate('alice', 'right', 'browser-one')
  assertEquals(session, { token: 'jf-token', user: { id: 'user-1', name: 'alice', avatarUrl } })
  assertEquals(
    requests[0]?.authorization,
    'MediaBrowser Client="calthing", Device="calthing", DeviceId="browser-one-alice", Version="1.0"',
  )
  assertEquals(
    requests[1]?.authorization,
    'MediaBrowser Client="calthing", Device="calthing", DeviceId="browser-one-alice", Version="1.0"',
  )
  await client.authenticate('alice', 'right', 'browser-two')
  assertEquals(
    requests[2]?.authorization,
    'MediaBrowser Client="calthing", Device="calthing", DeviceId="browser-two-alice", Version="1.0"',
  )
  assertEquals(deviceInputs, [
    ['http://jellyfin.internal:8096/base', 'alice', 'browser-one'],
    ['http://jellyfin.internal:8096/base', 'alice', 'browser-one'],
    ['http://jellyfin.internal:8096/base', 'alice', 'browser-two'],
  ])

  assertEquals(await client.user('jf-token'), { id: 'user-1', name: 'alice', avatarUrl })
  assertEquals(await client.user('jf-token'), { id: 'user-1', name: 'alice', avatarUrl })
  assertEquals(requests[3]?.url.pathname, '/base/Users/Me')
  assertEquals(requests[4]?.url.pathname, '/base/Users/Me')
  assertEquals(requests[3]?.authorization, 'MediaBrowser Token="jf-token"')
  assertEquals(requests[4]?.authorization, 'MediaBrowser Token="jf-token"')

  await client.logout('jf-token')
  assertEquals(requests[5]?.url.pathname, '/base/Sessions/Logout')
  assertEquals(requests[5]?.authorization, 'MediaBrowser Token="jf-token"')
})

Deno.test('Jellyfin distinguishes rejected tokens from validation outages', async () => {
  const rejected = new JellyfinClient(
    config,
    () => Promise.resolve(new Response('denied', { status: 403 })),
  )
  assertEquals(await rejected.user('revoked'), null)

  const unavailable = new JellyfinClient(
    config,
    () => Promise.resolve(new Response('maintenance', { status: 503 })),
  )
  await assertRejects(
    () => unavailable.user('jf-token'),
    Error,
    'jellyfin: /Users/Me returned 503: maintenance',
  )

  const malformed = new JellyfinClient(config, () =>
    Promise.resolve(
      new Response('{', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ))
  await assertRejects(() => malformed.user('jf-token'), Error, 'returned invalid json')

  const offline = new JellyfinClient(config, () => Promise.reject(new Error('connection reset')))
  await assertRejects(
    () => offline.user('jf-token'),
    Error,
    'jellyfin: /Users/Me request failed: connection reset',
  )
})

Deno.test('Jellyfin validation is bounded by the injected timeout', async () => {
  const client = new JellyfinClient(
    config,
    () => new Promise<Response>(() => {}),
    () => 'device-id',
    5,
  )

  await assertRejects(
    () => client.user('jf-token'),
    Error,
    'jellyfin: /Users/Me timed out after 5ms',
  )
})

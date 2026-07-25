import { assertEquals, assertStringIncludes } from '@std/assert'

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

Deno.test('Jellyfin matches TVDB episode IDs and emits only the public item URL', async () => {
  const events = [episode('123'), episode('456')]
  let requested: URL | undefined
  let token = ''
  const client = new JellyfinClient({
    url: 'http://jellyfin.internal:8096/base',
    publicUrl: 'https://watch.example/jellyfin',
    apiKey: 'secret',
  }, (input, init) => {
    requested = new URL(input.toString())
    token = new Headers(init?.headers).get('X-Emby-Token') ?? ''
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

  assertEquals(token, 'secret')
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

Deno.test('Jellyfin errors include bounded upstream context', async () => {
  const client = new JellyfinClient({
    url: 'http://jellyfin.internal:8096',
    publicUrl: 'https://watch.example',
    apiKey: 'secret',
  }, () => Promise.resolve(new Response('denied', { status: 401 })))

  let message = ''
  try {
    await client.addLinks([episode('123')])
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  assertStringIncludes(message, 'jellyfin: /Items returned 401: denied')
})

Deno.test('Jellyfin login identifies as calthing, caches the user, and expires with the session', async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = []
  const client = new JellyfinClient({
    url: 'http://jellyfin.internal:8096/base',
    publicUrl: 'https://watch.example',
    apiKey: '',
  }, (input, init) => {
    const url = new URL(input.toString())
    requests.push({ url, init })
    if (url.pathname === '/base/Users/AuthenticateByName') {
      const { Pw } = JSON.parse(String(init?.body)) as { Pw: string }
      if (Pw !== 'right') return Promise.resolve(new Response('denied', { status: 401 }))
      return Promise.resolve(Response.json({
        AccessToken: 'jf-token',
        User: { Id: 'user-1', Name: 'alice', PrimaryImageTag: 'tag123' },
      }))
    }
    if (url.pathname === '/base/Users/Me') {
      const token = new Headers(init?.headers).get('X-Emby-Token')
      if (token !== 'jf-token') return Promise.resolve(new Response('denied', { status: 401 }))
      return Promise.resolve(
        Response.json({ Id: 'user-1', Name: 'alice', PrimaryImageTag: 'tag123' }),
      )
    }
    if (url.pathname === '/base/Sessions/Logout') {
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(new Response('unexpected', { status: 500 }))
  })

  const avatarUrl = 'https://watch.example/Users/user-1/Images/Primary?tag=tag123'
  assertEquals(await client.authenticate('alice', 'wrong'), null)
  const session = await client.authenticate('alice', 'right')
  assertEquals(session, { token: 'jf-token', user: { id: 'user-1', name: 'alice', avatarUrl } })
  const authHeader = new Headers(requests[1]?.init?.headers).get('Authorization') ?? ''
  assertStringIncludes(authHeader, 'MediaBrowser Client="calthing"')

  // a fresh login primes the cache — resolving the session hits no endpoint
  assertEquals(await client.user('jf-token'), { id: 'user-1', name: 'alice', avatarUrl })
  assertEquals(requests.length, 2)

  // unknown tokens are checked against Jellyfin and rejected
  assertEquals(await client.user('revoked'), null)
  assertEquals(requests[2]?.url.pathname, '/base/Users/Me')

  await client.logout('jf-token')
  assertEquals(requests[3]?.url.pathname, '/base/Sessions/Logout')

  // logout drops the cache entry, so the next lookup asks Jellyfin again
  assertEquals(await client.user('jf-token'), { id: 'user-1', name: 'alice', avatarUrl })
  assertEquals(requests[4]?.url.pathname, '/base/Users/Me')
})

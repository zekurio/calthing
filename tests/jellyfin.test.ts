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

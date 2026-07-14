import { assertEquals, assertNotEquals } from '@std/assert'

import type { InstanceStatusDto } from '../shared/api.ts'
import { buildInstanceColors } from '../frontend/src/lib/instanceColors.ts'

const status = (name: string, type: 'radarr' | 'sonarr'): InstanceStatusDto => ({
  name,
  type,
  ok: true,
  fetchedAt: '2026-07-12T00:00:00Z',
})

Deno.test('instance colors preserve primary ARR colors and distinguish later instances', () => {
  const colors = buildInstanceColors([
    status('Movies', 'radarr'),
    status('Anime Movies', 'radarr'),
    status('Series', 'sonarr'),
    status('Anime', 'sonarr'),
  ])

  assertEquals(colors.Movies, '#9a4fb5')
  assertEquals(colors.Series, '#0090c4')
  assertNotEquals(colors['Anime Movies'], colors.Movies)
  assertNotEquals(colors.Anime, colors.Series)
})

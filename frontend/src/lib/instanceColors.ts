import type { InstanceStatusDto, Source } from '../../../shared/api.ts'

/* Monochrome UI, Jellyfin duotone identity: movies take the purple end of the
 * gradient, series the blue end; extra instances step along each family. */
const palettes: Record<Source, string[]> = {
  radarr: ['#9a4fb5', '#7a5fd0', '#c05a9e', '#5f55c9', '#b0699b'],
  sonarr: ['#0090c4', '#2a7de0', '#00a3a3', '#4f68d8', '#1f8fa8'],
}

export function buildInstanceColors(instances: InstanceStatusDto[]): Record<string, string> {
  const positions: Record<Source, number> = { radarr: 0, sonarr: 0 }
  return Object.fromEntries(instances.map((instance) => {
    const palette = palettes[instance.type]
    const index = positions[instance.type]++
    return [instance.name, palette[index % palette.length] as string]
  }))
}

import type { InstanceStatusDto, Source } from '../../../shared/api.ts'

const palettes: Record<Source, string[]> = {
  radarr: ['#ed7c43', '#b85d91', '#9a68c7', '#c64d54', '#b38224'],
  sonarr: ['#168dad', '#2b7b61', '#536fc2', '#8b68b6', '#b06e22'],
}

export function buildInstanceColors(instances: InstanceStatusDto[]): Record<string, string> {
  const positions: Record<Source, number> = { radarr: 0, sonarr: 0 }
  return Object.fromEntries(instances.map((instance) => {
    const palette = palettes[instance.type]
    const index = positions[instance.type]++
    return [instance.name, palette[index % palette.length] as string]
  }))
}

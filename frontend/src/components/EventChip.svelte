<script lang="ts">
  import { formatTime, sxxeyy } from '../lib/dates'
  import { t } from '../lib/i18n.svelte.ts'
  import type { EventDto } from '../../../shared/api.ts'

  let {
    event,
    compact = false,
    color,
    onselect,
  }: {
    event: EventDto
    compact?: boolean
    color?: string
    onselect: () => void
  } = $props()

  const RELEASE_CODES: Record<string, string> = {
    'movie-cinema': 'CIN',
    'movie-digital': 'DIG',
    'movie-physical': 'PHY',
  }

  const code = $derived(
    event.kind === 'episode' ? formatTime(event.start) : RELEASE_CODES[event.kind],
  )
</script>

<button
  class="chip"
  class:compact
  style:--instance-color={color ?? (event.source === 'radarr' ? 'var(--radarr)' : 'var(--sonarr)')}
  onclick={onselect}
  title={event.title}
>
  <span class="code mono">{code}</span>
  <span class="title">
    {event.title}{#if !compact && event.kind === 'episode'}
      <span class="ep mono">{sxxeyy(event.season, event.episode)}</span>{/if}
  </span>
  {#if event.downloaded}<span class="check" title={t('available')}>✓</span>{/if}
</button>

<style>
  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 3px 7px 3px 5px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--instance-color) 9%, var(--surface));
    border-left: 3px solid var(--instance-color);
    font-size: 0.8rem;
    line-height: 1.3;
    min-width: 0;
  }

  .chip:hover {
    background: color-mix(in srgb, var(--instance-color) 18%, var(--surface));
  }

  .code {
    color: var(--muted);
    flex-shrink: 0;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .ep {
    color: var(--muted);
    margin-left: 5px;
  }

  .check {
    color: var(--ok);
    flex-shrink: 0;
    font-weight: 700;
  }

  @media (max-width: 700px) {
    .chip.compact {
      padding: 2px 4px;
      gap: 4px;
      border-left-width: 3px;
      font-size: 0.72rem;
    }

    .chip.compact .code,
    .chip.compact .check {
      display: none;
    }
  }
</style>

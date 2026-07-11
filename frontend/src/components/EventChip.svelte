<script lang="ts">
  import { formatTime, sxxeyy } from '../lib/dates'
  import type { ArrEvent } from '../lib/types'

  let {
    event,
    compact = false,
    onselect,
  }: {
    event: ArrEvent
    compact?: boolean
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

<button class="chip {event.source}" class:compact onclick={onselect} title={event.title}>
  <span class="code mono">{code}</span>
  <span class="title">
    {event.title}{#if !compact && event.kind === 'episode'}
      <span class="ep mono">{sxxeyy(event.season, event.episode)}</span>{/if}
  </span>
  {#if event.downloaded}<span class="check" title="Downloaded">✓</span>{/if}
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
    background: var(--surface-2);
    border-left: 3px solid;
    font-size: 0.8rem;
    line-height: 1.3;
    min-width: 0;
  }

  .chip.sonarr {
    border-left-color: var(--sonarr);
  }

  .chip.radarr {
    border-left-color: var(--radarr);
  }

  .chip:hover {
    filter: brightness(1.15);
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
</style>

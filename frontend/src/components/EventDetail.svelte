<script lang="ts">
  import { dayLabel, eventDay, formatTime, sxxeyy } from '../lib/dates'
  import { KIND_LABELS, type ArrEvent } from '../lib/types'
  import Poster from './Poster.svelte'

  let { event }: { event: ArrEvent } = $props()
</script>

<article class={event.source}>
  <Poster url={event.posterUrl} source={event.source} size="full" />


  <div class="body">
    <h2>{event.title}</h2>

    {#if event.kind === 'episode'}
      <p class="sub">
        <span class="mono">{sxxeyy(event.season, event.episode)}</span>
        {#if event.subtitle}· {event.subtitle}{/if}
      </p>
    {/if}

    <div class="badges">
      <span class="badge {event.source}">{event.instance}</span>
      <span class="badge">{KIND_LABELS[event.kind]}</span>
      {#if event.downloaded}
        <span class="badge ok">✓ Downloaded</span>
      {:else}
        <span class="badge">Pending</span>
      {/if}
    </div>

    <p class="when mono">
      {dayLabel(eventDay(event))}{#if !event.allDay}
        · {formatTime(event.start)}–{formatTime(event.end)}{/if}
    </p>

    {#if event.overview}
      <p class="overview">{event.overview}</p>
    {/if}
  </div>
</article>

<style>
  article {
    display: flex;
    gap: 18px;
    max-width: 520px;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding-right: 24px;
  }

  h2 {
    font-size: 1.25rem;
    margin: 0;
    line-height: 1.25;
  }

  .sub {
    margin: 0;
    color: var(--muted);
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .badge {
    font-size: 0.75rem;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--muted);
  }

  .badge.sonarr {
    color: var(--sonarr);
    border-color: color-mix(in srgb, var(--sonarr) 40%, transparent);
  }

  .badge.radarr {
    color: var(--radarr);
    border-color: color-mix(in srgb, var(--radarr) 40%, transparent);
  }

  .badge.ok {
    color: var(--ok);
    border-color: color-mix(in srgb, var(--ok) 40%, transparent);
  }

  .when {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .overview {
    margin: 4px 0 0;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--ink);
  }

  @media (max-width: 540px) {
    article {
      flex-direction: column;
    }
  }
</style>

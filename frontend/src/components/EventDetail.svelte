<script lang="ts">
  import { dayLabel, eventDay, formatTime, sxxeyy } from '../lib/dates'
  import type { EventDto } from '../../../shared/api.ts'
  import { kindLabel, t } from '../lib/i18n.svelte.ts'
  import Poster from './Poster.svelte'

  let { event, color }: { event: EventDto; color?: string } = $props()
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
      <span class="badge instance" style:--instance-color={color}>{event.instance}</span>
      <span class="badge">{kindLabel(event.kind)}</span>
      {#if event.downloaded}
        <span class="badge ok">✓ {t('available')}</span>
      {:else}
        <span class="badge">{t('pending')}</span>
      {/if}
    </div>

    <p class="when mono">
      {dayLabel(eventDay(event))}{#if !event.allDay}&nbsp;· {formatTime(event.start)}{/if}
    </p>

    {#if event.overview}
      <p class="overview">{event.overview}</p>
    {/if}

    {#if event.jellyfinUrl}
      <a class="watch" href={event.jellyfinUrl} target="_blank" rel="noreferrer">
        {t('watchOnJellyfin')} <span aria-hidden="true">↗</span>
      </a>
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

  .badge.instance {
    color: var(--instance-color, var(--muted));
    border-color: color-mix(in srgb, var(--instance-color, var(--muted)) 45%, transparent);
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

  .watch {
    align-self: flex-start;
    margin-top: 4px;
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--gradient);
    color: var(--on-accent);
    font-weight: 600;
    text-decoration: none;
  }

  .watch:hover {
    filter: brightness(1.08);
  }

  @media (max-width: 540px) {
    article {
      flex-direction: column;
    }
  }
</style>

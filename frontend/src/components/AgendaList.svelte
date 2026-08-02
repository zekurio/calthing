<script lang="ts">
  import { dayLabel, formatTime, sxxeyy, ymd } from '../lib/dates'
  import { eventAriaLabel, eventColor } from '../lib/eventPresentation.ts'
  import { groupEventsByDay } from '../lib/events.ts'
  import type { EventDto } from '../../../shared/api.ts'
  import { kindLabel, t } from '../lib/i18n.svelte.ts'
  import Poster from './Poster.svelte'

  let {
    events,
    onselect,
    instanceColors,
  }: {
    events: EventDto[]
    onselect: (e: EventDto) => void
    instanceColors: Record<string, string>
  } = $props()

  const groups = $derived.by(() =>
    [...groupEventsByDay(events).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, events]) => ({ date: new Date(`${key}T00:00:00`), events })),
  )
</script>

{#if groups.length === 0}
  <div class="empty">
    <p>{t('emptyAgenda')}</p>
    <p class="hint">{t('emptyAgendaHint')}</p>
  </div>
{/if}

<div class="agenda">
  {#each groups as group (ymd(group.date))}
    <section>
      <h2>{dayLabel(group.date)}</h2>
      {#each group.events as e (e.uid)}
        <button
          class="row"
          aria-label={eventAriaLabel(
            e,
            e.kind === 'episode'
              ? `${sxxeyy(e.season, e.episode)}${e.subtitle ? ` · ${e.subtitle}` : ''}`
              : kindLabel(e.kind),
            e.downloaded ? t('available') : t('pending'),
            e.kind === 'episode' ? formatTime(e.start) : undefined,
          )}
          style:--instance-color={eventColor(e, instanceColors[e.instance])}
          onclick={() => onselect(e)}
        >
          <Poster url={e.posterUrl} source={e.source} />

          <div class="info">
            <span class="title">{e.title}</span>
            <span class="sub">
              {#if e.kind === 'episode'}
                <span class="mono">{sxxeyy(e.season, e.episode)}</span>
                {#if e.subtitle}· {e.subtitle}{/if}
              {:else}
                {kindLabel(e.kind)}
              {/if}
            </span>
          </div>
          <div class="meta">
            {#if e.kind === 'episode'}
              <span class="mono time">{formatTime(e.start)}</span>
            {/if}
            {#if e.downloaded}
              <span class="check" title={t('available')}>✓</span>
            {/if}
          </div>
        </button>
      {/each}
    </section>
  {/each}
</div>

<style>
  .agenda {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 760px;
    width: 100%;
    margin: 0 auto;
    padding-bottom: 32px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h2 {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 0 0 2px;
    position: sticky;
    top: 0;
    background: var(--bg);
    padding: 6px 0 4px;
    z-index: 1;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 3px solid var(--instance-color);
    text-align: left;
  }

  .row:hover {
    background: var(--surface-2);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: 0.85rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .time {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .check {
    color: var(--ok);
    font-weight: 700;
  }

  .empty {
    text-align: center;
    margin-top: 15vh;
    color: var(--muted);
  }

  .empty p {
    margin: 4px 0;
  }

  .hint {
    font-size: 0.85rem;
  }
</style>

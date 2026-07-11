<script lang="ts">
  import { dayLabel, eventDay, formatTime, sxxeyy, ymd } from '../lib/dates'
  import { KIND_LABELS, type ArrEvent } from '../lib/types'
  import Poster from './Poster.svelte'

  let {
    events,
    onselect,
  }: {
    events: ArrEvent[]
    onselect: (e: ArrEvent) => void
  } = $props()

  const groups = $derived.by(() => {
    const map = new Map<string, { date: Date; events: ArrEvent[] }>()
    for (const e of events) {
      const day = eventDay(e)
      const key = ymd(day)
      const group = map.get(key)
      if (group) {
        group.events.push(e)
      } else {
        map.set(key, { date: day, events: [e] })
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g)
  })
</script>

{#if groups.length === 0}
  <div class="empty">
    <p>Nothing scheduled in the next 90 days.</p>
    <p class="hint">Releases and air dates from your instances show up here as they're announced.</p>
  </div>
{/if}

<div class="agenda">
  {#each groups as group (ymd(group.date))}
    <section>
      <h2>{dayLabel(group.date)}</h2>
      {#each group.events as e (e.uid)}
        <button class="row {e.source}" onclick={() => onselect(e)}>
          <Poster url={e.posterUrl} source={e.source} />

          <div class="info">
            <span class="title">{e.title}</span>
            <span class="sub">
              {#if e.kind === 'episode'}
                <span class="mono">{sxxeyy(e.season, e.episode)}</span>
                {#if e.subtitle}· {e.subtitle}{/if}
              {:else}
                {KIND_LABELS[e.kind]}
              {/if}
            </span>
          </div>
          <div class="meta">
            {#if e.kind === 'episode'}
              <span class="mono time">{formatTime(e.start)}</span>
            {/if}
            {#if e.downloaded}
              <span class="check" title="Downloaded">✓</span>
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
    border-left: 3px solid;
    text-align: left;
  }

  .row.sonarr {
    border-left-color: var(--sonarr);
  }

  .row.radarr {
    border-left-color: var(--radarr);
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

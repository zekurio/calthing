<script lang="ts">
  import { eventDay, monthGrid, sameDay, weekdayLabels, ymd } from '../lib/dates'
  import type { EventDto } from '../../../shared/api.ts'
  import EventChip from './EventChip.svelte'

  let {
    viewDate,
    events,
    onselect,
    onselectday,
  }: {
    viewDate: Date
    events: EventDto[]
    onselect: (e: EventDto) => void
    onselectday: (d: Date) => void
  } = $props()

  const MAX_CHIPS = 3

  const cells = $derived(monthGrid(viewDate))
  const byDay = $derived.by(() => {
    const map = new Map<string, EventDto[]>()
    for (const e of events) {
      const key = ymd(eventDay(e))
      const list = map.get(key)
      if (list) {
        list.push(e)
      } else {
        map.set(key, [e])
      }
    }
    return map
  })

  const today = new Date()
</script>

<div class="grid" role="grid" aria-label="Month">
  {#each weekdayLabels() as label}
    <div class="weekday">{label}</div>
  {/each}

  {#each cells as day (ymd(day))}
    {@const dayList = byDay.get(ymd(day)) ?? []}
    {@const isToday = sameDay(day, today)}
    <div
      class="cell"
      class:other-month={day.getMonth() !== viewDate.getMonth()}
      class:today={isToday}
      role="gridcell"
    >
      <div class="date">
        {#if isToday}
          <span class="live" aria-label="Today"><span class="dot"></span>{day.getDate()}</span>
        {:else}
          {day.getDate()}
        {/if}
      </div>
      {#each dayList.slice(0, MAX_CHIPS) as e (e.uid)}
        <EventChip event={e} compact onselect={() => onselect(e)} />
      {/each}
      {#if dayList.length > MAX_CHIPS}
        <button class="more" onclick={() => onselectday(day)}>
          +{dayList.length - MAX_CHIPS} more
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-template-rows: auto repeat(6, minmax(96px, 1fr));
    gap: 4px;
    min-height: 0;
  }

  .weekday {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    padding: 4px 0;
  }

  .cell {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: hidden;
    min-width: 0;
  }

  .cell.other-month {
    opacity: 0.45;
  }

  .cell.today {
    border-color: var(--live);
    box-shadow: inset 0 2px 0 var(--live);
  }

  .date {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    padding: 1px 3px;
  }

  .cell.today .date {
    color: var(--ink);
  }

  .live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    animation: pulse 2.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  .more {
    font-size: 0.75rem;
    color: var(--muted);
    text-align: left;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .more:hover {
    color: var(--ink);
    background: var(--surface-2);
  }

  @media (max-width: 700px) {
    .grid {
      grid-template-rows: auto repeat(6, minmax(64px, 1fr));
      gap: 2px;
    }

    .cell {
      border-radius: 5px;
      padding: 2px;
    }
  }
</style>

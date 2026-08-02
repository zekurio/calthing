<script lang="ts">
  import { monthGrid, sameDay, weekdayLabels, ymd } from '../lib/dates'
  import { groupEventsByDay } from '../lib/events.ts'
  import { t } from '../lib/i18n.svelte.ts'
  import type { EventDto } from '../../../shared/api.ts'
  import EventChip from './EventChip.svelte'

  let {
    viewDate,
    today,
    events,
    onselect,
    onselectday,
    instanceColors,
  }: {
    viewDate: Date
    today: Date
    events: EventDto[]
    onselect: (e: EventDto) => void
    onselectday: (d: Date) => void
    instanceColors: Record<string, string>
  } = $props()

  const MAX_CHIPS = 3

  const cells = $derived(monthGrid(viewDate))
  const byDay = $derived(groupEventsByDay(events))
</script>

<div class="grid" role="grid" aria-label={t('viewMonth')}>
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
          <span class="live" aria-label={t('today')}><span class="dot"></span>{day.getDate()}</span>
        {:else}
          {day.getDate()}
        {/if}
      </div>
      {#each dayList.slice(0, MAX_CHIPS) as e (e.uid)}
        <EventChip event={e} color={instanceColors[e.instance]} compact onselect={() => onselect(e)} />
      {/each}
      {#if dayList.length > MAX_CHIPS}
        <button class="more" onclick={() => onselectday(day)}>
          {t('moreCount', { n: dayList.length - MAX_CHIPS })}
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
    gap: 0;
    min-height: 0;
  }

  .weekday {
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--muted);
    padding: 8px 0;
    border-bottom: 1px solid var(--muted);
  }

  .cell {
    background: var(--surface);
    border: 0;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    padding: 7px;
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
    background: color-mix(in srgb, var(--accent) 7%, var(--surface));
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .date {
    font-family: var(--font-display);
    font-size: 0.95rem;
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
    background: var(--gradient);
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
      padding: 2px;
    }
  }
</style>

<script lang="ts">
  import { addDays, eventDay, sameDay, startOfWeek, weekdayLabels, ymd } from '../lib/dates'
  import { t } from '../lib/i18n.svelte.ts'
  import type { EventDto } from '../../../shared/api.ts'
  import EventChip from './EventChip.svelte'

  let {
    viewDate,
    events,
    onselect,
    instanceColors,
  }: {
    viewDate: Date
    events: EventDto[]
    onselect: (e: EventDto) => void
    instanceColors: Record<string, string>
  } = $props()

  const days = $derived.by(() => {
    const start = startOfWeek(viewDate)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  })
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

<div class="week" role="grid" aria-label={t('viewWeek')}>
  {#each days as day, i (ymd(day))}
    {@const dayList = byDay.get(ymd(day)) ?? []}
    {@const isToday = sameDay(day, today)}
    <section class="day" class:today={isToday} class:empty={dayList.length === 0} role="gridcell">
      <header>
        <span class="wd">{weekdayLabels()[i]}</span>
        <span class="num">
          {#if isToday}<span class="dot" aria-label={t('today')}></span>{/if}
          {day.getDate()}
        </span>
      </header>
      <div class="list">
        {#each dayList as e (e.uid)}
          <EventChip event={e} color={instanceColors[e.instance]} onselect={() => onselect(e)} />
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .week {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    min-height: 0;
  }

  .day {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 320px;
    background: var(--surface);
    border-right: 1px solid color-mix(in srgb, var(--line) 28%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--line) 28%, transparent);
  }

  .day.today {
    background: color-mix(in srgb, var(--live) 8%, var(--surface));
    box-shadow: inset 0 2px 0 var(--live);
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    padding: 8px 9px 6px;
    border-bottom: 2px solid var(--line);
  }

  .wd {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--muted);
  }

  .num {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--muted);
  }

  .day.today .num {
    color: var(--ink);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px;
    overflow-y: auto;
    min-height: 0;
  }

  @media (max-width: 700px) {
    .week {
      display: flex;
      flex-direction: column;
    }

    .day {
      min-height: 0;
      border-right: 0;
    }

    .day.empty:not(.today) {
      flex-direction: row;
      align-items: center;
      opacity: 0.6;
    }

    .day.empty:not(.today) header {
      border-bottom: 0;
      flex: 1;
    }

    header {
      justify-content: flex-start;
    }

    .num {
      order: -1;
    }
  }
</style>

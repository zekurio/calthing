<script lang="ts">
  import { fetchEvents } from './lib/api'
  import { addDays, eventDay, monthGrid, sameDay, startOfMonth, dayLabel } from './lib/dates'
  import type { ArrEvent, InstanceStatus } from './lib/types'
  import Header from './components/Header.svelte'
  import MonthGrid from './components/MonthGrid.svelte'
  import AgendaList from './components/AgendaList.svelte'
  import EventDetail from './components/EventDetail.svelte'
  import EventChip from './components/EventChip.svelte'
  import Modal from './components/Modal.svelte'

  type View = 'month' | 'agenda'
  type ModalState = { kind: 'event'; event: ArrEvent } | { kind: 'day'; date: Date } | null

  const initialView = (): View => {
    const fromURL = new URLSearchParams(location.search).get('view')
    const v = fromURL ?? localStorage.getItem('view')
    return v === 'agenda' ? 'agenda' : 'month'
  }
  let view = $state<View>(initialView())
  let viewDate = $state(startOfMonth(new Date()))
  let hidden = $state(new Set<string>(JSON.parse(localStorage.getItem('hiddenInstances') ?? '[]')))
  let events = $state<ArrEvent[]>([])
  let instances = $state<InstanceStatus[]>([])
  let loading = $state(true)
  let error = $state('')
  let modal = $state<ModalState>(null)

  $effect(() => {
    localStorage.setItem('view', view)
    localStorage.setItem('hiddenInstances', JSON.stringify([...hidden]))
  })

  $effect(() => {
    let start: Date
    let end: Date
    if (view === 'month') {
      const cells = monthGrid(viewDate)
      start = cells[0]
      end = addDays(cells[41], 1)
    } else {
      start = new Date()
      end = addDays(start, 90)
    }
    loading = true
    error = ''
    fetchEvents(start, end)
      .then((resp) => {
        events = resp.events
        instances = resp.instances
      })
      .catch((e: Error) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  const visible = $derived(events.filter((e) => !hidden.has(e.instance)))
  const failed = $derived(instances.filter((i) => !i.ok))
  const dayEvents = $derived.by(() => {
    const m = modal
    if (m?.kind !== 'day') return []
    return visible.filter((e) => sameDay(eventDay(e), m.date))
  })

  function toggleInstance(name: string) {
    const next = new Set(hidden)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    hidden = next
  }
</script>

<Header
  {view}
  {viewDate}
  {instances}
  {hidden}
  {loading}
  onview={(v) => (view = v)}
  onnavigate={(d) => (viewDate = d)}
  ontoggleinstance={toggleInstance}
/>

{#if failed.length > 0}
  <div class="notice" role="status">
    {failed.map((i) => i.name).join(', ')}
    {failed.length === 1 ? 'is' : 'are'} unreachable — showing the instances that responded.
  </div>
{/if}
{#if error}
  <div class="notice error" role="alert">{error}</div>
{/if}

<main>
  {#if view === 'month'}
    <MonthGrid
      {viewDate}
      events={visible}
      onselect={(e) => (modal = { kind: 'event', event: e })}
      onselectday={(date) => (modal = { kind: 'day', date })}
    />
  {:else}
    <AgendaList events={visible} onselect={(e) => (modal = { kind: 'event', event: e })} />
  {/if}
</main>

{#if modal?.kind === 'event'}
  <Modal onclose={() => (modal = null)}>
    <EventDetail event={modal.event} />
  </Modal>
{:else if modal?.kind === 'day'}
  <Modal onclose={() => (modal = null)}>
    <div class="day-list">
      <h2>{dayLabel(modal.date)}</h2>
      {#each dayEvents as e (e.uid)}
        <EventChip event={e} onselect={() => (modal = { kind: 'event', event: e })} />
      {/each}
    </div>
  </Modal>
{/if}

<style>
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 16px 16px;
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
  }

  .notice {
    max-width: 1400px;
    width: 100%;
    margin: 0 auto 8px;
    padding: 8px 16px;
    color: var(--radarr);
    font-size: 0.9rem;
  }

  .notice.error {
    color: var(--live);
  }

  .day-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: min(420px, 80vw);
  }

  .day-list h2 {
    font-size: 1.05rem;
    margin: 0 0 8px;
  }
</style>

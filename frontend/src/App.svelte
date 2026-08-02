<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import type { EventDto, MeDto } from '../../shared/api.ts'
  import { ApiError, fetchEvents, fetchMe, logout } from './lib/api'
  import Gate from './components/Gate.svelte'
  import SessionStatus from './components/SessionStatus.svelte'
  import { addDays, dayLabel, eventDay, monthGrid, sameDay, startOfWeek, ymd } from './lib/dates'
  import Header from './components/Header.svelte'
  import MonthGrid from './components/MonthGrid.svelte'
  import WeekGrid from './components/WeekGrid.svelte'
  import AgendaList from './components/AgendaList.svelte'
  import EventDetail from './components/EventDetail.svelte'
  import EventChip from './components/EventChip.svelte'
  import Modal from './components/Modal.svelte'
  import { applyBrandingMetadata, DEFAULT_BRANDING } from './lib/branding'
  import { buildInstanceColors } from './lib/instanceColors'
  import { t } from './lib/i18n.svelte.ts'

  type View = 'month' | 'week' | 'agenda'
  type ModalState = { kind: 'event'; event: EventDto } | { kind: 'day'; date: Date } | null

  const initialView = (): View => {
    const fromURL = new URLSearchParams(location.search).get('view')
    const v = fromURL ?? localStorage.getItem('calthing.view')
    return v === 'agenda' || v === 'week' || v === 'month' ? v : 'month'
  }
  let view = $state<View>(initialView())
  let viewDate = $state(new Date())
  let session = $state<'bootstrap' | 'gate' | 'ready'>('bootstrap')
  let me = $state<MeDto | null>(null)
  const queryClient = useQueryClient()
  let hidden = $state(
    new Set<string>(JSON.parse(localStorage.getItem('calthing.hiddenInstances') ?? '[]')),
  )
  let modal = $state<ModalState>(null)

  $effect(() => {
    localStorage.setItem('calthing.view', view)
    localStorage.setItem('calthing.hiddenInstances', JSON.stringify([...hidden]))
  })

  const range = $derived.by(() => {
    if (view === 'month') {
      const cells = monthGrid(viewDate)
      return {
        start: ymd(cells[0]),
        end: ymd(addDays(cells[41], 1)),
      }
    }

    if (view === 'week') {
      const start = startOfWeek(viewDate)
      return {
        start: ymd(start),
        end: ymd(addDays(start, 7)),
      }
    }

    const start = new Date()
    return {
      start: ymd(start),
      end: ymd(addDays(start, 90)),
    }
  })

  const meQuery = createQuery(() => ({
    queryKey: ['me'] as const,
    queryFn: ({ signal }) => fetchMe(signal),
    enabled: session === 'bootstrap',
  }))

  const eventsQuery = createQuery(() => ({
    queryKey: ['events', range.start, range.end] as const,
    queryFn: ({ queryKey: [, start, end], signal }) => fetchEvents(start, end, signal),
    placeholderData: (previous) => previous,
    enabled: session === 'ready',
  }))

  function clearProtectedEvents() {
    modal = null
    void queryClient.cancelQueries({ queryKey: ['events'] })
    queryClient.removeQueries({ queryKey: ['events'] })
  }

  function requireLogin() {
    session = 'gate'
    me = null
    clearProtectedEvents()
    void queryClient.cancelQueries({ queryKey: ['me'] })
    queryClient.removeQueries({ queryKey: ['me'] })
  }

  $effect(() => {
    if (session !== 'bootstrap') return
    if (meQuery.isSuccess) {
      me = meQuery.data
      session = 'ready'
      return
    }
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) requireLogin()
  })

  // An expired or revoked session surfaces as a 401 from the protected events endpoint.
  $effect(() => {
    if (eventsQuery.error instanceof ApiError && eventsQuery.error.status === 401) requireLogin()
  })

  function retrySession() {
    void meQuery.refetch()
  }

  function unlock(resolved: MeDto) {
    clearProtectedEvents()
    queryClient.setQueryData(['me'], resolved)
    me = resolved
    session = 'ready'
  }

  let actionError = $state('')

  async function signOut() {
    actionError = ''
    try {
      await logout()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        requireLogin()
        return
      }
      dismissedError = ''
      actionError = t('signOutFailed')
      return
    }
    requireLogin()
  }

  const events = $derived(eventsQuery.data?.events ?? [])
  const instances = $derived(eventsQuery.data?.instances ?? [])
  const branding = $derived(eventsQuery.data?.branding ?? DEFAULT_BRANDING)
  const instanceColors = $derived(buildInstanceColors(instances))
  const loading = $derived(eventsQuery.isFetching)
  const error = $derived(actionError || eventsQuery.error?.message || '')
  const visible = $derived(events.filter((e) => !hidden.has(e.instance)))
  const failed = $derived(instances.filter((i) => !i.ok))
  const failedNotice = $derived(
    failed.length > 0
      ? t(failed.length === 1 ? 'unreachableOne' : 'unreachableMany', {
        names: failed.map((i) => i.name).join(', '),
      })
      : '',
  )
  // toasts are dismissed per message — a changed failure set surfaces them again
  let dismissedNotice = $state('')
  let dismissedError = $state('')
  const dayEvents = $derived.by(() => {
    const m = modal
    if (m?.kind !== 'day') return []
    return visible.filter((e) => sameDay(eventDay(e), m.date))
  })

  $effect(() => applyBrandingMetadata(branding))

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

{#if session === 'bootstrap'}
  <SessionStatus error={meQuery.isError && !meQuery.isFetching} onretry={retrySession} />
{:else if session === 'gate'}
  <Gate onunlock={unlock} />
{:else if session === 'ready'}
  <Header
    {view}
    {viewDate}
    {instances}
    {hidden}
    {loading}
    {branding}
    {instanceColors}
    {me}
    onview={(v) => (view = v)}
    onnavigate={(d) => (viewDate = d)}
    ontoggleinstance={toggleInstance}
    onsignout={signOut}
  />

  <div class="toasts">
    {#if failedNotice && failedNotice !== dismissedNotice}
      <div class="toast" role="status">
        <span class="dot" aria-hidden="true"></span>
        <span class="text">{failedNotice}</span>
        <button
          class="dismiss"
          aria-label={t('close')}
          onclick={() => (dismissedNotice = failedNotice)}
        >×</button>
      </div>
    {/if}
    {#if error && error !== dismissedError}
      <div class="toast" role="alert">
        <span class="dot" aria-hidden="true"></span>
        <span class="text">{error}</span>
        <button class="dismiss" aria-label={t('close')} onclick={() => (dismissedError = error)}
        >×</button>
      </div>
    {/if}
  </div>

  <main>
    {#if view === 'month'}
      <MonthGrid
        {viewDate}
        events={visible}
        {instanceColors}
        onselect={(e) => (modal = { kind: 'event', event: e })}
        onselectday={(date) => (modal = { kind: 'day', date })}
      />
    {:else if view === 'week'}
      <WeekGrid
        {viewDate}
        events={visible}
        {instanceColors}
        onselect={(e) => (modal = { kind: 'event', event: e })}
      />
    {:else}
      <AgendaList
        events={visible}
        {instanceColors}
        onselect={(e) => (modal = { kind: 'event', event: e })}
      />
    {/if}
  </main>

  {#if modal?.kind === 'event'}
    <Modal onclose={() => (modal = null)}>
      <EventDetail event={modal.event} color={instanceColors[modal.event.instance]} />
    </Modal>
  {:else if modal?.kind === 'day'}
    <Modal onclose={() => (modal = null)}>
      <div class="day-list">
        <h2>{dayLabel(modal.date)}</h2>
        {#each dayEvents as e (e.uid)}
          <EventChip
            event={e}
            color={instanceColors[e.instance]}
            onselect={() => (modal = { kind: 'event', event: e })}
          />
        {/each}
      </div>
    </Modal>
  {/if}
{/if}

<style>
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 24px 24px;
    max-width: 1560px;
    width: 100%;
    margin: 0 auto;
  }

  .toasts {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: min(520px, calc(100vw - 32px));
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 100%;
    padding: 10px 10px 10px 14px;
    background: var(--surface);
    border-radius: 12px;
    box-shadow: var(--shadow-2);
    font-size: 0.88rem;
    animation: toast-in 160ms ease;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  .toast .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--live);
    flex-shrink: 0;
  }

  .toast .text {
    min-width: 0;
  }

  .toast .dismiss {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 99px;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
    flex-shrink: 0;
    transition: background 120ms ease, color 120ms ease;
  }

  .toast .dismiss:hover {
    background: var(--surface-2);
    color: var(--ink);
  }

  .day-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: min(420px, 80vw);
  }

  .day-list h2 {
    font-size: 1.05rem;
    font-weight: 650;
    margin: 0 0 8px;
  }

  @media (max-width: 700px) {
    main { padding: 0 10px 10px; }
  }
</style>

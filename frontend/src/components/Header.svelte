<script lang="ts">
  import { addMonths, monthLabel, startOfMonth } from '../lib/dates'
  import type { InstanceStatus } from '../lib/types'

  let {
    view,
    viewDate,
    instances,
    hidden,
    loading,
    onview,
    onnavigate,
    ontoggleinstance,
  }: {
    view: 'month' | 'agenda'
    viewDate: Date
    instances: InstanceStatus[]
    hidden: Set<string>
    loading: boolean
    onview: (v: 'month' | 'agenda') => void
    onnavigate: (d: Date) => void
    ontoggleinstance: (name: string) => void
  } = $props()

  let copied = $state(false)

  async function copyFeedURL() {
    await navigator.clipboard.writeText(`${location.origin}/calendar.ics`)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<header>
  <div class="brand" aria-hidden="true">
    <span class="block sonarr"></span><span class="block radarr"></span>
  </div>
  <h1>Media Calendar</h1>

  {#if view === 'month'}
    <nav class="month-nav" aria-label="Month">
      <button onclick={() => onnavigate(addMonths(viewDate, -1))} aria-label="Previous month">‹</button>
      <button class="today-btn" onclick={() => onnavigate(startOfMonth(new Date()))}>Today</button>
      <button onclick={() => onnavigate(addMonths(viewDate, 1))} aria-label="Next month">›</button>
      <span class="month-label">{monthLabel(viewDate)}</span>
      {#if loading}<span class="loading mono">…</span>{/if}
    </nav>
  {:else}
    <span class="month-label">Next 90 days</span>
  {/if}

  <div class="spacer"></div>

  {#if instances.length > 1}
    <div class="filters" role="group" aria-label="Instances">
      {#each instances as inst (inst.name)}
        <button
          class="pill {inst.type}"
          class:off={hidden.has(inst.name)}
          onclick={() => ontoggleinstance(inst.name)}
          aria-pressed={!hidden.has(inst.name)}
        >
          {inst.name}
        </button>
      {/each}
    </div>
  {/if}

  <div class="view-toggle" role="group" aria-label="View">
    <button class:active={view === 'month'} onclick={() => onview('month')}>Month</button>
    <button class:active={view === 'agenda'} onclick={() => onview('agenda')}>Agenda</button>
  </div>

  <button class="subscribe" onclick={copyFeedURL} title="Copy the iCal feed URL for your calendar app">
    {copied ? 'Copied' : 'Copy feed URL'}
  </button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 14px 16px;
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
  }

  .brand {
    display: flex;
    gap: 3px;
  }

  .block {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .block.sonarr {
    background: var(--sonarr);
  }

  .block.radarr {
    background: var(--radarr);
  }

  h1 {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.01em;
  }

  .month-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 12px;
  }

  .month-nav button {
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 0.9rem;
  }

  .month-nav button:hover {
    background: var(--surface-2);
  }

  .month-label {
    font-weight: 600;
    margin-left: 10px;
    min-width: 10ch;
  }

  .loading {
    color: var(--muted);
  }

  .spacer {
    flex: 1;
  }

  .filters {
    display: flex;
    gap: 6px;
  }

  .pill {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 0.85rem;
    position: relative;
    padding-left: 22px;
  }

  .pill::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    width: 7px;
    height: 7px;
    border-radius: 2px;
  }

  .pill.sonarr::before {
    background: var(--sonarr);
  }

  .pill.radarr::before {
    background: var(--radarr);
  }

  .pill.off {
    opacity: 0.45;
  }

  .pill.off::before {
    background: var(--muted);
  }

  .view-toggle {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }

  .view-toggle button {
    padding: 5px 14px;
    font-size: 0.9rem;
    background: var(--surface);
    color: var(--muted);
  }

  .view-toggle button.active {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }

  .subscribe {
    padding: 5px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 0.9rem;
  }

  .subscribe:hover {
    background: var(--surface-2);
  }
</style>

<script lang="ts">
  import { addDays, addMonths, monthLabel, startOfWeek, weekLabel } from '../../lib/dates.ts'
  import { t } from '../../lib/i18n.svelte.ts'
  import type { View } from '../../lib/view.ts'

  let {
    view,
    viewDate,
    loading,
    onnavigate,
  }: {
    view: View
    viewDate: Date
    loading: boolean
    onnavigate: (date: Date) => void
  } = $props()

  function navigate(amount: number) {
    const date = view === 'month'
      ? addMonths(viewDate, amount)
      : addDays(viewDate, amount * 7)
    onnavigate(date)
  }
</script>

{#if view === 'agenda'}
  <div class="month-nav">
    <span class="month-label">{t('next90')}</span>
    {#if loading}<span class="loading mono">…</span>{/if}
  </div>
{:else}
  <nav class="month-nav" aria-label={view === 'month' ? t('monthNav') : t('viewWeek')}>
    <div class="nav-group">
      <button
        type="button"
        onclick={() => navigate(-1)}
        aria-label={view === 'month' ? t('prevMonth') : t('prevWeek')}>‹</button
      >
      <button type="button" class="today-btn" onclick={() => onnavigate(new Date())}
        >{t('today')}</button
      >
      <button
        type="button"
        onclick={() => navigate(1)}
        aria-label={view === 'month' ? t('nextMonth') : t('nextWeek')}>›</button
      >
    </div>
    <span class="month-label">
      {view === 'month' ? monthLabel(viewDate) : weekLabel(startOfWeek(viewDate))}
    </span>
    {#if loading}<span class="loading mono">…</span>{/if}
  </nav>
{/if}

<style>
  .month-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 12px;
  }

  .nav-group {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 99px;
    background: var(--topbar-tile);
  }

  .nav-group button {
    padding: 4px 12px;
    border-radius: 99px;
    font-size: 0.88rem;
    transition: background 120ms ease;
  }

  .nav-group button:hover {
    background: var(--topbar-hover);
  }

  .today-btn {
    font-weight: 550;
  }

  .month-label {
    min-width: 10ch;
    font-size: 1rem;
    font-weight: 600;
  }

  .loading {
    opacity: 0.6;
  }

  @media (max-width: 800px) {
    .month-nav {
      order: 4;
      width: 100%;
      margin-left: 0;
      justify-content: space-between;
    }

    .month-label {
      min-width: 0;
      text-align: right;
    }
  }
</style>

<script lang="ts">
  import { addDays, addMonths, monthLabel, startOfWeek, weekLabel } from '../lib/dates'
  import type { BrandingDto, InstanceStatusDto } from '../../../shared/api.ts'
  import { TICKET_NOTCHES, TICKET_OUTLINE } from '../lib/branding'
  import { i18n, setLocale, t } from '../lib/i18n.svelte.ts'
  import { setTheme, theme } from '../lib/theme.svelte.ts'

  let {
    view,
    viewDate,
    instances,
    hidden,
    loading,
    branding,
    instanceColors,
    onview,
    onnavigate,
    ontoggleinstance,
  }: {
    view: 'month' | 'week' | 'agenda'
    viewDate: Date
    instances: InstanceStatusDto[]
    hidden: Set<string>
    loading: boolean
    branding: BrandingDto
    instanceColors: Record<string, string>
    onview: (v: 'month' | 'week' | 'agenda') => void
    onnavigate: (d: Date) => void
    ontoggleinstance: (name: string) => void
  } = $props()

  let copied = $state(false)
  let settingsOpen = $state(false)
  const radarrInstances = $derived(instances.filter((instance) => instance.type === 'radarr'))
  const sonarrInstances = $derived(instances.filter((instance) => instance.type === 'sonarr'))
  const sourceGroups = $derived(
    [
      { label: t('movies'), items: radarrInstances },
      { label: t('series'), items: sonarrInstances },
    ].filter((group) => group.items.length > 0),
  )

  async function copyFeedURL() {
    await navigator.clipboard.writeText(`${location.origin}/calendar.ics`)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<svelte:window
  onclick={(event) => {
    const target = event.target
    if (!(target instanceof Element && target.closest('.settings'))) settingsOpen = false
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') settingsOpen = false
  }}
/>

<header>
  <div class="brand" aria-hidden="true">
    {#if branding.iconUrl}
      <img src={branding.iconUrl} alt="" />
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={TICKET_OUTLINE} />
        <path d={TICKET_NOTCHES} />
      </svg>
    {/if}
  </div>
  <div class="title-lockup">
    <h1>{branding.name}</h1>
    <span class="eyebrow">{t('programme')}</span>
  </div>

  {#if view === 'agenda'}
    <div class="month-nav">
      <span class="month-label">{t('next90')}</span>
      {#if loading}<span class="loading mono">…</span>{/if}
    </div>
  {:else}
    {@const step = view === 'month' ? (n: number) => addMonths(viewDate, n) : (n: number) => addDays(viewDate, n * 7)}
    <nav class="month-nav" aria-label={view === 'month' ? t('monthNav') : t('viewWeek')}>
      <div class="nav-group">
        <button onclick={() => onnavigate(step(-1))} aria-label={view === 'month' ? t('prevMonth') : t('prevWeek')}>‹</button>
        <button class="today-btn" onclick={() => onnavigate(new Date())}>{t('today')}</button>
        <button onclick={() => onnavigate(step(1))} aria-label={view === 'month' ? t('nextMonth') : t('nextWeek')}>›</button>
      </div>
      <span class="month-label">
        {view === 'month' ? monthLabel(viewDate) : weekLabel(startOfWeek(viewDate))}
      </span>
      {#if loading}<span class="loading mono">…</span>{/if}
    </nav>
  {/if}

  <div class="spacer"></div>

  <div class="view-toggle" role="group" aria-label={t('view')}>
    <button class:active={view === 'month'} onclick={() => onview('month')}>{t('viewMonth')}</button>
    <button class:active={view === 'week'} onclick={() => onview('week')}>{t('viewWeek')}</button>
    <button class:active={view === 'agenda'} onclick={() => onview('agenda')}>{t('viewAgenda')}</button>
  </div>

  <details class="settings" bind:open={settingsOpen}>
    <summary aria-label={t('settings')} title={t('settings')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.09A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57a1.7 1.7 0 0 0 1.03-1.56V3h4v.09A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.43 9a1.7 1.7 0 0 0 1.56 1.03H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
      </svg>
    </summary>
    <div class="settings-menu">
      {#if sourceGroups.length > 0}
        <section>
          <span class="menu-label">{t('sources')}</span>
          {#each sourceGroups as group (group.label)}
            <span class="group-label">{group.label}</span>
            {#each group.items as inst (inst.name)}
              <button
                class="source-row"
                class:off={hidden.has(inst.name)}
                style:--instance-color={instanceColors[inst.name]}
                onclick={() => ontoggleinstance(inst.name)}
                aria-pressed={!hidden.has(inst.name)}
              >
                <span class="dot" aria-hidden="true"></span>
                <span class="name">{inst.name}</span>
                {#if !inst.ok}
                  <span class="warn" title={t('unreachable')}>!</span>
                {/if}
                <svg class="tick" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </button>
            {/each}
          {/each}
        </section>
      {/if}

      <section>
        <span class="menu-label">{t('language')}</span>
        <div class="seg-toggle" role="group" aria-label={t('language')}>
          <button class:active={i18n.locale === 'de'} onclick={() => setLocale('de')}>Deutsch</button>
          <button class:active={i18n.locale === 'en'} onclick={() => setLocale('en')}>English</button>
        </div>
      </section>

      <section>
        <span class="menu-label">{t('appearance')}</span>
        <div class="seg-toggle" role="group" aria-label={t('appearance')}>
          <button class:active={theme.mode === 'light'} onclick={() => setTheme('light')}>{t('themeLight')}</button>
          <button class:active={theme.mode === 'dark'} onclick={() => setTheme('dark')}>{t('themeDark')}</button>
          <button class:active={theme.mode === 'system'} onclick={() => setTheme('system')}>{t('themeSystem')}</button>
        </div>
      </section>

      <section>
        <span class="menu-label">{t('calendar')}</span>
        <button class="subscribe" class:copied onclick={copyFeedURL}>
          <span class="sub-text">
            <span class="sub-label">{copied ? t('copied') : t('copyLink')}</span>
            <span class="sub-url mono">{location.host}/calendar.ics</span>
          </span>
          {#if copied}
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          {:else}
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
            </svg>
          {/if}
        </button>
      </section>
    </div>
  </details>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 16px 24px 22px;
    max-width: 1560px;
    width: 100%;
    margin: 0 auto;
    position: relative;
    border-bottom: 2px solid var(--line);
  }

  header::after {
    content: '';
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: 4px;
    height: 5px;
    background: repeating-linear-gradient(90deg, var(--line) 0 12px, transparent 12px 20px);
    opacity: 0.14;
  }

  .brand {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    background: var(--line);
    color: var(--surface);
    border-radius: 10px;
    overflow: hidden;
  }

  .brand svg,
  .brand img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  .brand img {
    width: 100%;
    height: 100%;
  }

  .brand svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .title-lockup {
    display: grid;
    gap: 1px;
    line-height: 1.2;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 650;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .eyebrow {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 550;
    letter-spacing: 0.02em;
  }

  .month-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 16px;
  }

  .nav-group {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    overflow: hidden;
  }

  .nav-group button {
    padding: 5px 11px;
    font-size: 0.88rem;
    color: var(--ink);
  }

  .nav-group button + button {
    border-left: 1px solid color-mix(in srgb, var(--line) 30%, transparent);
  }

  .nav-group button:hover {
    background: var(--surface-2);
  }

  .today-btn {
    font-weight: 550;
  }

  .month-label {
    font-size: 1.02rem;
    font-weight: 600;
    min-width: 10ch;
  }

  .loading {
    color: var(--muted);
  }

  .spacer {
    flex: 1;
  }

  .view-toggle {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    overflow: hidden;
  }

  .view-toggle button {
    padding: 5px 14px;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .view-toggle button + button {
    border-left: 1px solid color-mix(in srgb, var(--line) 30%, transparent);
  }

  .view-toggle button.active {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }

  .settings {
    position: relative;
  }

  .settings summary {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    list-style: none;
  }

  .settings summary:hover {
    color: var(--ink);
    background: var(--surface-2);
  }

  .settings[open] summary {
    color: var(--ink);
    background: var(--surface-2);
  }

  .settings summary::-webkit-details-marker {
    display: none;
  }

  .settings summary svg {
    width: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
  }

  .settings-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 10;
    width: 250px;
    display: grid;
    gap: 14px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: 4px 5px 0 color-mix(in srgb, var(--line) 18%, transparent);
  }

  .settings-menu section {
    display: grid;
    gap: 6px;
  }

  .menu-label {
    color: var(--muted);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .group-label {
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 550;
    margin-top: 2px;
  }

  .group-label:first-of-type {
    margin-top: 0;
  }

  .source-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 7px;
    text-align: left;
    font-size: 0.88rem;
  }

  .source-row:hover {
    background: var(--surface-2);
  }

  .source-row .dot {
    width: 8px;
    height: 8px;
    border-radius: 3px;
    background: var(--instance-color);
    flex-shrink: 0;
  }

  .source-row .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-row .warn {
    color: var(--live);
    font-weight: 700;
    flex-shrink: 0;
  }

  .source-row .tick {
    width: 14px;
    flex-shrink: 0;
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .source-row.off {
    color: var(--muted);
  }

  .source-row.off .dot {
    background: color-mix(in srgb, var(--muted) 45%, transparent);
  }

  .source-row.off .tick {
    visibility: hidden;
  }

  .seg-toggle {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }

  .seg-toggle button {
    flex: 1;
    padding: 6px 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .seg-toggle button + button {
    border-left: 1px solid color-mix(in srgb, var(--line) 30%, transparent);
  }

  .seg-toggle button.active {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: 600;
  }

  .subscribe {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px dashed color-mix(in srgb, var(--line) 55%, transparent);
    background: var(--surface-2);
    text-align: left;
  }

  .subscribe:hover {
    border-color: var(--line);
  }

  .subscribe.copied {
    border-style: solid;
    border-color: var(--ok);
  }

  .sub-text {
    display: grid;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .sub-label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .subscribe.copied .sub-label {
    color: var(--ok);
  }

  .sub-url {
    color: var(--muted);
    font-size: 0.72rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subscribe svg {
    width: 15px;
    flex-shrink: 0;
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .subscribe.copied svg {
    stroke: var(--ok);
  }

  @media (max-width: 800px) {
    header {
      padding: 12px 12px 18px;
    }

    header::after {
      left: 12px;
      right: 12px;
    }

    .spacer {
      display: none;
    }

    .month-nav {
      order: 3;
      width: 100%;
      margin-left: 0;
      justify-content: space-between;
    }

    .view-toggle {
      margin-left: auto;
    }
  }
</style>

<script lang="ts">
  import { addDays, addMonths, monthLabel, startOfWeek, weekLabel } from '../lib/dates'
  import type { BrandingDto, InstanceStatusDto, MeDto } from '../../../shared/api.ts'
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
    me,
    onview,
    onnavigate,
    ontoggleinstance,
    onsignout,
  }: {
    view: 'month' | 'week' | 'agenda'
    viewDate: Date
    instances: InstanceStatusDto[]
    hidden: Set<string>
    loading: boolean
    branding: BrandingDto
    instanceColors: Record<string, string>
    me: MeDto | null
    onview: (v: 'month' | 'week' | 'agenda') => void
    onnavigate: (d: Date) => void
    ontoggleinstance: (name: string) => void
    onsignout: () => void
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

  const feedURL = $derived(
    me?.feedToken
      ? `${location.origin}/calendar.ics?token=${me.feedToken}`
      : `${location.origin}/calendar.ics`,
  )

  async function copyFeedURL() {
    await navigator.clipboard.writeText(feedURL)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<svelte:window
  onclick={(event) => {
    const target = event.target
    if (!(target instanceof Element && target.closest('.user-menu'))) settingsOpen = false
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') settingsOpen = false
  }}
/>

<header>
  <div class="brand">
    <span class="tile" aria-hidden="true">
      {#if branding.iconUrl}
        <img src={branding.iconUrl} alt="" />
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={TICKET_OUTLINE} />
          <path d={TICKET_NOTCHES} />
        </svg>
      {/if}
    </span>
    <h1 class="brand-name">{branding.name}</h1>
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

  <details class="user-menu" bind:open={settingsOpen}>
    <summary class="avatar-btn" aria-label={t('menu')} title={t('menu')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 20a6 6 0 0 0-12 0" />
        <circle cx="12" cy="10" r="4" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    </summary>
    <div class="menu">
      {#if me?.name}
        <div class="menu-user">
          <span class="menu-user-name">{me.name}</span>
        </div>
        <div class="menu-sep"></div>
      {/if}
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

      {#if me?.name}
        <div class="menu-sep"></div>
        <button class="signout" onclick={onsignout}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          </svg>
          <span>{t('signOut')}</span>
        </button>
      {/if}
    </div>
  </details>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 10px 24px;
    width: 100%;
    background: var(--topbar-bg);
    color: var(--on-topbar);
    border-bottom: 1px solid var(--topbar-border);
    box-shadow: var(--shadow-1);
    position: relative;
    z-index: 5;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tile {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: var(--topbar-tile);
    border-radius: 8px;
    overflow: hidden;
  }

  .tile svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .brand-name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0;
  }

  .month-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 12px;
  }

  .nav-group {
    display: flex;
    gap: 2px;
    background: var(--topbar-tile);
    border-radius: 99px;
    padding: 3px;
  }

  .nav-group button {
    padding: 4px 12px;
    font-size: 0.88rem;
    border-radius: 99px;
    transition: background 120ms ease;
  }

  .nav-group button:hover {
    background: var(--topbar-hover);
  }

  .today-btn {
    font-weight: 550;
  }

  .month-label {
    font-size: 1rem;
    font-weight: 600;
    min-width: 10ch;
  }

  .loading {
    opacity: 0.6;
  }

  .spacer {
    flex: 1;
  }

  .view-toggle {
    display: flex;
    gap: 2px;
    background: var(--topbar-tile);
    border-radius: 99px;
    padding: 3px;
  }

  .view-toggle button {
    padding: 4px 14px;
    font-size: 0.88rem;
    border-radius: 99px;
    opacity: 0.75;
    transition: background 120ms ease, opacity 120ms ease;
  }

  .view-toggle button:hover {
    opacity: 1;
    background: var(--topbar-hover);
  }

  .view-toggle button.active {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    opacity: 1;
    box-shadow: var(--shadow-1);
  }

  .user-menu {
    position: relative;
  }

  .avatar-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 99px;
    cursor: pointer;
    list-style: none;
    transition: background 120ms ease;
  }

  .avatar-btn:hover,
  .user-menu[open] .avatar-btn {
    background: var(--topbar-hover);
  }

  .avatar-btn::-webkit-details-marker {
    display: none;
  }

  .avatar-btn svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    z-index: 20;
    width: 250px;
    display: grid;
    gap: 8px;
    padding: 6px;
    border-radius: 14px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-2);
  }

  .menu section {
    display: grid;
    gap: 6px;
    padding: 4px 6px;
  }

  .menu-user {
    display: flex;
    align-items: center;
    padding: 10px 12px 6px;
  }

  .menu-user-name {
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-sep {
    height: 1px;
    margin: 0 8px;
    background: var(--line);
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
    border-radius: 9px;
    transition: background 120ms ease;
    text-align: left;
    font-size: 0.88rem;
  }

  .source-row:hover {
    background: var(--surface-2);
  }

  .source-row .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
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
    gap: 2px;
    background: var(--surface-2);
    border-radius: 99px;
    padding: 3px;
  }

  .seg-toggle button {
    flex: 1;
    padding: 6px 0;
    font-size: 0.85rem;
    color: var(--muted);
    border-radius: 99px;
    transition: background 120ms ease, color 120ms ease;
  }

  .seg-toggle button:hover {
    color: var(--ink);
  }

  .seg-toggle button.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 600;
  }

  .subscribe {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    text-align: left;
    transition: border-color 120ms ease;
  }

  .subscribe:hover {
    border-color: var(--muted);
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

  .signout {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 9px;
    font-size: 14px;
    text-align: left;
    transition: background 120ms ease;
  }

  .signout:hover {
    background: var(--surface-2);
  }

  .signout svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (max-width: 800px) {
    header {
      padding: 8px 12px;
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

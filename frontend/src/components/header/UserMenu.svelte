<script lang="ts">
  import type { InstanceStatusDto, MeDto } from '../../../../shared/api.ts'
  import {
    i18n,
    setLocale,
    t,
    type Locale,
  } from '../../lib/i18n.svelte.ts'
  import { setTheme, theme, type ThemeMode } from '../../lib/theme.svelte.ts'
  import FeedLink from './FeedLink.svelte'
  import SegmentedControl from './SegmentedControl.svelte'
  import SourcePicker from './SourcePicker.svelte'
  import type { SegmentOption } from './types.ts'

  let {
    instances,
    hidden,
    instanceColors,
    me,
    ontoggleinstance,
    onsignout,
  }: {
    instances: InstanceStatusDto[]
    hidden: Set<string>
    instanceColors: Record<string, string>
    me: MeDto | null
    ontoggleinstance: (name: string) => void
    onsignout: () => void
  } = $props()

  let settingsOpen = $state(false)
  let failedAvatarUrl = $state('')
  let menuElement = $state<HTMLDetailsElement>()

  const languageOptions = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ] as const satisfies readonly SegmentOption<Locale>[]
  const themeOptions: readonly SegmentOption<ThemeMode>[] = $derived([
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
    { value: 'system', label: t('themeSystem') },
  ])

  function closeFromOutside(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof Node && menuElement?.contains(target))) settingsOpen = false
  }
</script>

<svelte:window
  onclick={closeFromOutside}
  onkeydown={(event) => {
    if (event.key === 'Escape') settingsOpen = false
  }}
/>

<details class="user-menu" bind:this={menuElement} bind:open={settingsOpen}>
  <summary class="avatar-btn" aria-label={t('menu')} title={t('menu')}>
    {#if me?.avatarUrl && failedAvatarUrl !== me.avatarUrl}
      <img
        class="avatar-img"
        src={me.avatarUrl}
        alt=""
        onerror={() => (failedAvatarUrl = me?.avatarUrl ?? '')}
      />
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 20a6 6 0 0 0-12 0" />
        <circle cx="12" cy="10" r="4" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    {/if}
  </summary>
  <div class="menu">
    {#if me?.name}
      <div class="menu-user">
        <span class="menu-user-name">{me.name}</span>
      </div>
      <div class="menu-sep"></div>
    {/if}

    <SourcePicker {instances} {hidden} {instanceColors} {ontoggleinstance} />

    <section class="menu-section">
      <span class="menu-label">{t('language')}</span>
      <SegmentedControl
        options={languageOptions}
        value={i18n.locale}
        label={t('language')}
        onchange={setLocale}
      />
    </section>

    <section class="menu-section">
      <span class="menu-label">{t('appearance')}</span>
      <SegmentedControl
        options={themeOptions}
        value={theme.mode}
        label={t('appearance')}
        onchange={setTheme}
      />
    </section>

    <FeedLink feedToken={me?.feedToken} />

    {#if me?.name}
      <div class="menu-sep"></div>
      <button type="button" class="signout" onclick={onsignout}>
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

<style>
  .user-menu {
    position: relative;
  }

  .avatar-btn {
    display: grid;
    width: 34px;
    height: 34px;
    cursor: pointer;
    list-style: none;
    border-radius: 99px;
    place-items: center;
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

  .avatar-img {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
  }

  .menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: 20;
    display: grid;
    width: 250px;
    max-height: calc(100dvh - 70px);
    gap: 8px;
    padding: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 14px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-2);
  }

  .menu-section {
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
</style>

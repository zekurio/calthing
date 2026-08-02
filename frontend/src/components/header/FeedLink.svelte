<script lang="ts">
  import { tick } from 'svelte'
  import { t } from '../../lib/i18n.svelte.ts'

  let { feedToken }: { feedToken?: string } = $props()

  let copied = $state(false)
  let manualCopy = $state(false)
  let fallbackInput = $state<HTMLInputElement>()
  const feedURL = $derived(
    feedToken
      ? `${location.origin}/calendar.ics?token=${feedToken}`
      : `${location.origin}/calendar.ics`,
  )

  async function copyFeedURL() {
    try {
      await navigator.clipboard.writeText(feedURL)
    } catch {
      manualCopy = true
      await tick()
      fallbackInput?.focus()
      fallbackInput?.select()
      return
    }

    manualCopy = false
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  function selectFeedURL() {
    fallbackInput?.select()
  }
</script>

<section>
  <span class="menu-label">{t('calendar')}</span>
  {#if manualCopy}
    <label class="manual-copy">
      <span class="sub-label">{t('copyLink')}</span>
      <input
        class="mono"
        bind:this={fallbackInput}
        value={feedURL}
        aria-label={t('copyLink')}
        readonly
        onfocus={selectFeedURL}
        onclick={selectFeedURL}
      />
    </label>
  {:else}
    <button type="button" class="subscribe" class:copied onclick={copyFeedURL}>
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
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: 6px;
    padding: 4px 6px;
  }

  .menu-label {
    color: var(--muted);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .subscribe {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
    text-align: left;
    transition: border-color 120ms ease;
  }

  .subscribe:hover {
    border-color: var(--muted);
  }

  .subscribe.copied {
    border-color: var(--ok);
    border-style: solid;
  }

  .sub-text {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }

  .sub-label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .subscribe.copied .sub-label {
    color: var(--ok);
  }

  .sub-url {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.72rem;
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

  .manual-copy {
    display: grid;
    gap: 4px;
  }

  .manual-copy input {
    width: 100%;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--ink);
    font-size: 0.72rem;
  }

  .manual-copy input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>

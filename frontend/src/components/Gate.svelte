<script lang="ts">
  import { ApiError, login } from '../lib/api'
  import { DEFAULT_BRANDING, TICKET_NOTCHES, TICKET_OUTLINE } from '../lib/branding'
  import { t } from '../lib/i18n.svelte.ts'
  import type { MeDto } from '../../../shared/api.ts'

  let { onunlock }: { onunlock: (me: MeDto) => void } = $props()

  let username = $state('')
  let password = $state('')
  let error = $state('')
  let busy = $state(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!username.trim() || busy) return
    busy = true
    error = ''
    try {
      onunlock(await login(username.trim(), password))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        error = t('wrongCredentials')
        password = ''
      } else if (err instanceof ApiError && err.status === 502) {
        error = t('jellyfinUnreachable')
      } else {
        error = t('signInFailed')
      }
    } finally {
      busy = false
    }
  }
</script>

<div class="gate">
  <form class="card" onsubmit={submit}>
    <span class="tile" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={TICKET_OUTLINE} />
        <path d={TICKET_NOTCHES} />
      </svg>
    </span>
    <h1>{DEFAULT_BRANDING.name}</h1>
    <p class="hint">{t('signInHint')}</p>
    <input
      type="text"
      bind:value={username}
      placeholder={t('username')}
      aria-label={t('username')}
      autocomplete="username"
    />
    <input
      type="password"
      bind:value={password}
      placeholder={t('password')}
      aria-label={t('password')}
      autocomplete="current-password"
    />
    {#if error}<p class="error">{error}</p>{/if}
    <button class="primary" type="submit" disabled={busy || !username.trim()}>
      {busy ? t('signingIn') : t('signIn')}
    </button>
  </form>
</div>

<style>
  .gate {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .card {
    width: min(360px, 100%);
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow-2);
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    text-align: center;
  }

  .tile {
    width: 52px;
    height: 52px;
    margin: 0 auto;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    border-radius: 13px;
  }

  .tile svg {
    width: 30px;
    height: 30px;
    fill: none;
    stroke: var(--accent-strong);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  input {
    font: inherit;
    color: var(--ink);
    background-color: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 12px;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .error {
    margin: 0;
    color: var(--live);
    font-size: 13px;
  }

  .primary {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    border-radius: 99px;
    padding: 10px;
    transition: background 120ms ease;
  }

  .primary:hover:not(:disabled) {
    background: var(--accent-strong);
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>

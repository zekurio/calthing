<script lang="ts">
  import { t } from '../lib/i18n.svelte.ts'

  let { error, onretry }: { error: boolean; onretry: () => void } = $props()
</script>

<div class="status" role={error ? 'alert' : 'status'}>
  <div class="card">
    <p>{t(error ? 'sessionUnavailable' : 'sessionLoading')}</p>
    {#if error}
      <button type="button" onclick={onretry}>{t('retry')}</button>
    {/if}
  </div>
</div>

<style>
  .status {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .card {
    width: min(360px, 100%);
    display: grid;
    justify-items: center;
    gap: 16px;
    padding: 28px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    text-align: center;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  button {
    padding: 9px 18px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }

  button:hover {
    background: var(--accent-strong);
  }
</style>

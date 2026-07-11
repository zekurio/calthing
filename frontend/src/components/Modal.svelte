<script lang="ts">
  import type { Snippet } from 'svelte'

  let { onclose, children }: { onclose: () => void; children: Snippet } = $props()

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window {onkeydown} />

<div
  class="backdrop"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose()
  }}
  role="presentation"
>
  <div class="dialog" role="dialog" aria-modal="true" tabindex="-1">
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 10;
  }

  .dialog {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 20px;
    max-width: min(560px, 100%);
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.4);
  }

  .close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
</style>

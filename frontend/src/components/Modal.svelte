<script lang="ts">
  import type { Snippet } from 'svelte'
  import { t } from '../lib/i18n.svelte.ts'

  let {
    label,
    onclose,
    children,
  }: { label: string; onclose: () => void; children: Snippet } = $props()

  let dialog = $state<HTMLDialogElement>()

  $effect(() => {
    if (!dialog) return
    const previousFocus = document.activeElement
    dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  })
</script>

<dialog
  bind:this={dialog}
  aria-label={label}
  oncancel={(event) => {
    event.preventDefault()
    onclose()
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose()
  }}
>
  <div class="surface">
    <button class="close" onclick={onclose} aria-label={t('close')}>✕</button>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    max-width: calc(100vw - 32px);
    max-height: 85vh;
    margin: auto;
    padding: 0;
    overflow: visible;
    border: 0;
    background: transparent;
    color: inherit;
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
  }

  .surface {
    position: relative;
    max-width: min(560px, 100%);
    max-height: 85vh;
    padding: 20px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.4);
  }

  .close {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1;
    display: flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--muted);
  }

  .close:hover {
    background: var(--surface-2);
    color: var(--ink);
  }
</style>

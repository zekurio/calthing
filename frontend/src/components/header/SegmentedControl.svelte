<script lang="ts" generics="Value extends string">
  import type { SegmentOption } from './types.ts'

  let {
    options,
    value,
    label,
    onchange,
    variant = 'menu',
  }: {
    options: readonly SegmentOption<Value>[]
    value: Value
    label: string
    onchange: (value: Value) => void
    variant?: 'menu' | 'topbar'
  } = $props()
</script>

<div
  class="segmented"
  class:menu={variant === 'menu'}
  class:topbar={variant === 'topbar'}
  role="group"
  aria-label={label}
>
  {#each options as option (option.value)}
    <button
      type="button"
      class:active={value === option.value}
      aria-pressed={value === option.value}
      onclick={() => onchange(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    gap: 2px;
    border-radius: 99px;
    padding: 3px;
  }

  button {
    border-radius: 99px;
  }

  .menu {
    background: var(--surface-2);
  }

  .menu button {
    flex: 1;
    padding: 6px 0;
    color: var(--muted);
    font-size: 0.85rem;
    transition: background 120ms ease, color 120ms ease;
  }

  .menu button:hover {
    color: var(--ink);
  }

  .menu button.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 600;
  }

  .topbar {
    background: var(--topbar-tile);
  }

  .topbar button {
    padding: 4px 14px;
    font-size: 0.88rem;
    opacity: 0.75;
    transition: background 120ms ease, opacity 120ms ease;
  }

  .topbar button:hover {
    background: var(--topbar-hover);
    opacity: 1;
  }

  .topbar button.active {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    opacity: 1;
    box-shadow: var(--shadow-1);
  }

  @media (max-width: 800px) {
    .topbar {
      order: 3;
      width: 100%;
    }

    .topbar button {
      flex: 1;
    }
  }
</style>

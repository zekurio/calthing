<script lang="ts">
  import type { InstanceStatusDto } from '../../../../shared/api.ts'
  import { t } from '../../lib/i18n.svelte.ts'

  let {
    instances,
    hidden,
    instanceColors,
    ontoggleinstance,
  }: {
    instances: InstanceStatusDto[]
    hidden: Set<string>
    instanceColors: Record<string, string>
    ontoggleinstance: (name: string) => void
  } = $props()

  const radarrInstances = $derived(instances.filter((instance) => instance.type === 'radarr'))
  const sonarrInstances = $derived(instances.filter((instance) => instance.type === 'sonarr'))
  const sourceGroups = $derived(
    [
      { label: t('movies'), items: radarrInstances },
      { label: t('series'), items: sonarrInstances },
    ].filter((group) => group.items.length > 0),
  )
</script>

{#if sourceGroups.length > 0}
  <section>
    <span class="menu-label">{t('sources')}</span>
    {#each sourceGroups as group (group.label)}
      <span class="group-label">{group.label}</span>
      {#each group.items as instance (instance.name)}
        <button
          type="button"
          class="source-row"
          class:off={hidden.has(instance.name)}
          style:--instance-color={instanceColors[instance.name]}
          onclick={() => ontoggleinstance(instance.name)}
          aria-pressed={!hidden.has(instance.name)}
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="name">{instance.name}</span>
          {#if !instance.ok}
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

  .group-label {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 550;
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
    font-size: 0.88rem;
    text-align: left;
    transition: background 120ms ease;
  }

  .source-row:hover {
    background: var(--surface-2);
  }

  .dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--instance-color);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warn {
    flex-shrink: 0;
    color: var(--live);
    font-weight: 700;
  }

  .tick {
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
</style>

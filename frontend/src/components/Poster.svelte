<script lang="ts">
  let {
    url,
    source,
    size = 'thumb',
  }: {
    url: string
    source: 'radarr' | 'sonarr'
    size?: 'thumb' | 'full'
  } = $props()

  let failed = $state(false)
</script>

{#if url && !failed}
  <img class={size} src={url} alt="" loading="lazy" onerror={() => (failed = true)} />
{:else}
  <div class="fallback {source} {size}"></div>
{/if}

<style>
  img,
  .fallback {
    object-fit: cover;
    border-radius: 5px;
    flex-shrink: 0;
  }

  .thumb {
    width: 40px;
    height: 60px;
  }

  .full {
    width: 130px;
    height: 195px;
    border-radius: 10px;
  }

  .fallback.sonarr {
    background: linear-gradient(150deg, var(--surface-2), var(--sonarr) 300%);
  }

  .fallback.radarr {
    background: linear-gradient(150deg, var(--surface-2), var(--radarr) 300%);
  }
</style>

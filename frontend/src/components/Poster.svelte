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

  let failedUrl = $state<string | undefined>()
  const failed = $derived(failedUrl === url)
</script>

{#if url && !failed}
  <img
    class={size}
    src={url}
    alt=""
    width={size === 'thumb' ? 40 : 130}
    height={size === 'thumb' ? 60 : 195}
    loading={size === 'thumb' ? 'lazy' : 'eager'}
    decoding="async"
    onerror={() => (failedUrl = url)}
  />
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

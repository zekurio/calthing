<script lang="ts">
  import type { BrandingDto, InstanceStatusDto, MeDto } from '../../../shared/api.ts'
  import { DEFAULT_ICON_URL } from '../lib/branding.ts'
  import CalendarNavigation from './header/CalendarNavigation.svelte'
  import type { View } from './header/types.ts'
  import UserMenu from './header/UserMenu.svelte'
  import ViewSwitcher from './header/ViewSwitcher.svelte'

  let {
    view,
    viewDate,
    instances,
    hidden,
    loading,
    branding,
    instanceColors,
    me,
    onview,
    onnavigate,
    ontoggleinstance,
    onsignout,
  }: {
    view: View
    viewDate: Date
    instances: InstanceStatusDto[]
    hidden: Set<string>
    loading: boolean
    branding: BrandingDto
    instanceColors: Record<string, string>
    me: MeDto | null
    onview: (view: View) => void
    onnavigate: (date: Date) => void
    ontoggleinstance: (name: string) => void
    onsignout: () => void
  } = $props()

  let customBrandIconFailed = $state(false)
</script>

<header>
  <div class="brand">
    <span class="tile" aria-hidden="true">
      <img
        src={branding.iconUrl && !customBrandIconFailed ? branding.iconUrl : DEFAULT_ICON_URL}
        alt=""
        onerror={() => (customBrandIconFailed = true)}
      />
    </span>
    <h1 class="brand-name">{branding.name}</h1>
  </div>

  <CalendarNavigation {view} {viewDate} {loading} {onnavigate} />

  <div class="spacer"></div>

  <ViewSwitcher {view} {onview} />

  <UserMenu
    {instances}
    {hidden}
    {instanceColors}
    {me}
    {ontoggleinstance}
    {onsignout}
  />
</header>

<style>
  header {
    position: relative;
    z-index: 5;
    display: flex;
    width: 100%;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 10px 24px;
    border-bottom: 1px solid var(--topbar-border);
    background: var(--topbar-bg);
    color: var(--on-topbar);
    box-shadow: var(--shadow-1);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tile {
    display: grid;
    width: 30px;
    height: 30px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--topbar-tile);
    place-items: center;
  }

  .tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .brand-name {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .spacer {
    flex: 1;
  }

  @media (max-width: 800px) {
    header {
      padding: 8px 12px;
      row-gap: 10px;
    }
  }
</style>

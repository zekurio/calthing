<script lang="ts">
  import { t } from '../../lib/i18n.svelte.ts'
  import SegmentedControl from './SegmentedControl.svelte'
  import type { SegmentOption, View } from './types.ts'

  let { view, onview }: { view: View; onview: (view: View) => void } = $props()

  const options: readonly SegmentOption<View>[] = $derived([
    { value: 'month', label: t('viewMonth') },
    { value: 'week', label: t('viewWeek') },
    { value: 'agenda', label: t('viewAgenda') },
  ])
</script>

<SegmentedControl value={view} {options} label={t('view')} onchange={onview} variant="topbar" />

import type { BrandingDto } from '../../../shared/api.ts'
import { t } from './i18n.svelte.ts'

export const TICKET_OUTLINE =
  'M2 9a3 3 0 0 0 0 6v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a3 3 0 0 0 0-6V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z'
export const TICKET_NOTCHES = 'M13 5v2M13 17v2M13 11v2'

const defaultIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#29213f"/><g transform="translate(12 12)" fill="none" stroke="#f9f6ed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${TICKET_OUTLINE}"/><path d="${TICKET_NOTCHES}"/></g></svg>`

export const DEFAULT_ICON_URL = `data:image/svg+xml,${encodeURIComponent(defaultIconSvg)}`

export const DEFAULT_BRANDING: BrandingDto = {
  name: 'Jellyfin',
  iconUrl: '',
  pageTitle: '',
  description: '',
}

export function applyBrandingMetadata(branding: BrandingDto): void {
  document.title = branding.pageTitle || `${branding.name} · ${t('programme')}`

  let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (!description) {
    description = document.createElement('meta')
    description.name = 'description'
    document.head.append(description)
  }
  description.content = branding.description || t('defaultDescription')

  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!icon) {
    icon = document.createElement('link')
    icon.rel = 'icon'
    document.head.append(icon)
  }
  icon.href = branding.iconUrl || DEFAULT_ICON_URL
}

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'
const media = matchMedia('(prefers-color-scheme: dark)')

const stored = localStorage.getItem(STORAGE_KEY)

/** Reactive theme state; read `theme.mode` in reactive contexts, change it via `setTheme`. */
export const theme: { mode: ThemeMode } = $state({
  mode: stored === 'light' || stored === 'dark' ? stored : 'system',
})

/** Address-bar / PWA chrome color per resolved theme; keep in sync with --bg in app.css. */
const THEME_COLORS = { light: '#f6f6f8', dark: '#0f0f13' }

function apply(): void {
  const resolved = theme.mode === 'system' ? (media.matches ? 'dark' : 'light') : theme.mode
  document.documentElement.dataset.theme = resolved
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[resolved])
}

export function setTheme(mode: ThemeMode): void {
  theme.mode = mode
  localStorage.setItem(STORAGE_KEY, mode)
  apply()
}

media.addEventListener('change', () => {
  if (theme.mode === 'system') apply()
})
apply()

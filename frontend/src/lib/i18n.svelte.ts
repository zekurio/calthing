import type { Kind } from '../../../shared/api.ts'

export type Locale = 'de' | 'en'

const STORAGE_KEY = 'calthing.locale'

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'de' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** Reactive locale state; read `i18n.locale` in reactive contexts, change it via `setLocale`. */
export const i18n: { locale: Locale } = $state({ locale: initialLocale() })
document.documentElement.lang = i18n.locale

export function setLocale(locale: Locale): void {
  i18n.locale = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

/** BCP 47 tags used for all date/time formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { de: 'de-AT', en: 'en-GB' }

const messages = {
  de: {
    programme: 'Programm',
    defaultDescription: 'Das gemeinsame Film- und Serienprogramm.',
    today: 'Heute',
    prevMonth: 'Vorheriger Monat',
    nextMonth: 'Nächster Monat',
    prevWeek: 'Vorherige Woche',
    nextWeek: 'Nächste Woche',
    monthNav: 'Monat',
    next90: 'Nächste 90 Tage',
    view: 'Ansicht',
    viewMonth: 'Monat',
    viewWeek: 'Woche',
    viewAgenda: 'Agenda',
    settings: 'Einstellungen',
    menu: 'Menü',
    sources: 'Quellen',
    movies: 'Filme',
    series: 'Serien & Anime',
    unreachable: 'nicht erreichbar',
    language: 'Sprache',
    appearance: 'Erscheinungsbild',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeSystem: 'System',
    calendar: 'Kalender',
    copyLink: 'Kalender-Link kopieren',
    copied: 'Link kopiert',
    moreCount: '+{n} weitere',
    available: 'Verfügbar',
    pending: 'Ausstehend',
    watchOnJellyfin: 'Auf Jellyfin ansehen',
    close: 'Schließen',
    emptyAgenda: 'In den nächsten 90 Tagen ist nichts geplant.',
    emptyAgendaHint: 'Neue Start- und Sendetermine erscheinen hier, sobald sie angekündigt werden.',
    unreachableOne: '{names} ist nicht erreichbar — angezeigt werden die verfügbaren Quellen.',
    unreachableMany: '{names} sind nicht erreichbar — angezeigt werden die verfügbaren Quellen.',
    loadFailed: 'Termine konnten nicht geladen werden ({status})',
    signInHint: 'Melde dich mit deinem Jellyfin-Konto an.',
    username: 'Benutzername',
    password: 'Passwort',
    signIn: 'Anmelden',
    signingIn: 'einen Moment…',
    wrongCredentials: 'Falsche Zugangsdaten — noch einmal versuchen.',
    jellyfinUnreachable: 'Jellyfin ist gerade nicht erreichbar.',
    signInFailed: 'Etwas ist schiefgelaufen.',
    account: 'Konto',
    signOut: 'Abmelden',
  },
  en: {
    programme: 'Schedule',
    defaultDescription: 'The shared movie and series schedule.',
    today: 'Today',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    monthNav: 'Month',
    next90: 'Next 90 days',
    view: 'View',
    viewMonth: 'Month',
    viewWeek: 'Week',
    viewAgenda: 'Agenda',
    settings: 'Settings',
    menu: 'Menu',
    sources: 'Sources',
    movies: 'Movies',
    series: 'Series & anime',
    unreachable: 'unreachable',
    language: 'Language',
    appearance: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    calendar: 'Calendar',
    copyLink: 'Copy calendar link',
    copied: 'Link copied',
    moreCount: '+{n} more',
    available: 'Available',
    pending: 'Upcoming',
    watchOnJellyfin: 'Watch on Jellyfin',
    close: 'Close',
    emptyAgenda: 'Nothing is scheduled for the next 90 days.',
    emptyAgendaHint: 'New release and air dates appear here as soon as they are announced.',
    unreachableOne: '{names} is unreachable — showing the available sources.',
    unreachableMany: '{names} are unreachable — showing the available sources.',
    loadFailed: 'Loading events failed ({status})',
    signInHint: 'Sign in with your Jellyfin account.',
    username: 'Username',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'one moment…',
    wrongCredentials: 'Wrong username or password — try again.',
    jellyfinUnreachable: 'Jellyfin is unreachable right now.',
    signInFailed: 'Something went wrong.',
    account: 'Account',
    signOut: 'Sign out',
  },
} as const satisfies Record<Locale, Record<string, string>>

export type MessageKey = keyof typeof messages.de

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let out: string = messages[i18n.locale][key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replace(`{${name}}`, String(value))
    }
  }
  return out
}

const kindLabels: Record<Locale, Record<Kind, string>> = {
  de: {
    episode: 'Episode',
    'movie-cinema': 'Kinostart',
    'movie-digital': 'Digitalstart',
    'movie-physical': 'Heimkinostart',
  },
  en: {
    episode: 'Episode',
    'movie-cinema': 'In cinemas',
    'movie-digital': 'Digital release',
    'movie-physical': 'Physical release',
  },
}

export function kindLabel(kind: Kind): string {
  return kindLabels[i18n.locale][kind]
}

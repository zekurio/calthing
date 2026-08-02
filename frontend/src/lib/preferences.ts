export function readPreference(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writePreference(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Preferences are optional when storage is blocked or full.
  }
}

export function readStringArrayPreference(key: string): string[] {
  const stored = readPreference(key)
  if (stored === null) return []

  try {
    const value: unknown = JSON.parse(stored)
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
  } catch {
    return []
  }
}

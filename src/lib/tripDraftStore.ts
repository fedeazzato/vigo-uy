// Local-only autosave for an in-progress "new trip" form (NewTripLogPage),
// so a user can register charging stops as they reach them and pick up
// again later without losing anything -- see specs/trip-draft-autosave.md.
// Never touches Supabase: the draft only leaves the device once the trip is
// actually submitted, at which point the caller clears it.
//
// Same localStorage + try/catch pattern as UserPrefsContext: a full/blocked
// localStorage (quota, private browsing) degrades to "no draft" instead of
// throwing.

const STORAGE_KEY = 'vigo-trip-draft'
const VERSION = 1

export interface StoredDraft<T> {
  version: number
  savedAt: string // ISO timestamp
  state: T
}

/**
 * Returns the stored draft, or `null` if there isn't one, it's corrupt, or
 * it was written by an incompatible (older/newer) shape.
 */
export function loadDraft<T>(): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>
    if (parsed.version !== VERSION || parsed.state === undefined || !parsed.savedAt) return null
    return parsed as StoredDraft<T>
  } catch {
    return null
  }
}

/** Persists `state` as the current draft, stamped with now. */
export function saveDraft<T>(state: T): void {
  try {
    const draft: StoredDraft<T> = { version: VERSION, savedAt: new Date().toISOString(), state }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    /* quota exceeded, private browsing, etc. -- the draft just won't persist */
  }
}

/** Removes the stored draft, if any. */
export function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

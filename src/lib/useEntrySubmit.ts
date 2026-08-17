import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toFriendlyError } from './errors'
import { invalidateCommunityCache } from './communityData'

// What the entry forms put in location.state.saved; Mi actividad maps it to
// the confirmation toast.
export type SavedFlag = 'viaje' | 'service' | 'compra'

/**
 * The save boilerplate shared by the three entry forms (viaje, service,
 * compra): submitting/error state, friendly error mapping, community-cache
 * invalidation, and the redirect to Mi actividad with the saved toast.
 *
 * The page keeps the typed Supabase insert/update itself (passed as `run`)
 * so table names and payload shapes stay statically checked, and keeps using
 * `setError` for its own validation so FormError still scrolls into view.
 */
export function useEntrySubmit(saved: SavedFlag) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Returns whether the write actually went through, so callers that keep
  // their own local state (e.g. NewTripLogPage's draft autosave) know
  // whether it's now safe to discard it -- a failed submit (offline, RLS,
  // validation) must leave that state alone so the user can retry.
  async function submit(run: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
    setSubmitting(true)
    setError(null)
    const { error } = await run()
    setSubmitting(false)
    if (error) {
      setError(toFriendlyError(error))
      return false
    }
    invalidateCommunityCache()
    navigate('/mi-actividad', { state: { saved } })
    return true
  }

  return { submitting, error, setError, submit }
}

import { useEffect, useState } from 'react'
import { toFriendlyError } from './errors'
import { invalidateCommunityCache } from './communityData'

interface CatalogRow {
  slug: string
}

// Shared state machine for the moderator catalog editors
// (ChargingNetworksAdmin, InsuranceProvidersAdmin, InsuranceAddonsAdmin):
// load a list, edit one row in place, or add a new one. Each editor
// supplies its own typed Supabase load/insert/update calls (so table names
// and payload shapes stay statically checked, same reasoning as
// useEntrySubmit) -- this hook owns the load/loading/error/editing-vs-
// adding bookkeeping and the write-then-invalidate-then-reload cycle every
// save goes through, which is what actually varied by only a few tokens
// across all three editors before this was extracted.
export function useCatalogAdmin<Row extends CatalogRow>(
  load: () => Promise<{ data: Row[] | null; error: unknown }>
) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function reload() {
    setLoading(true)
    const { data, error } = await load()
    if (error) setError(toFriendlyError(error))
    else setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // Only ever reload automatically on mount -- `load` is expected to be a
    // fresh closure each render, not a dependency to re-run on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(slug: string) {
    setError(null)
    setAdding(false)
    setEditingSlug(slug)
  }

  function startAdd() {
    setError(null)
    setEditingSlug(null)
    setAdding(true)
  }

  function cancel() {
    setEditingSlug(null)
    setAdding(false)
  }

  // Runs an already-validated write (insert or update); on success, closes
  // whichever mode was open, runs the caller's own cleanup (e.g. resetting
  // "add new" draft state), and reloads the list so the moderator sees
  // their own change immediately.
  async function save(write: () => PromiseLike<{ error: unknown }>, onSuccess?: () => void): Promise<void> {
    setSaving(true)
    setError(null)
    const { error } = await write()
    setSaving(false)
    if (error) {
      setError(toFriendlyError(error))
      return
    }
    invalidateCommunityCache()
    cancel()
    onSuccess?.()
    await reload()
  }

  return { rows, loading, error, setError, saving, editingSlug, adding, startEdit, startAdd, cancel, save }
}

import { useState } from 'react'
import { Card } from './UI'
import CatalogAddButton from './CatalogAddButton'
import CatalogEditActions from './CatalogEditActions'
import CatalogSlugField from './CatalogSlugField'
import { supabase } from '../lib/supabaseClient'
import { useCatalogAdmin } from '../lib/useCatalogAdmin'
import formStyles from '../styles/formControls.module.css'
import listStyles from '../styles/listPatterns.module.css'
import type { ChargingNetwork, NetworkCountry } from '../types'

const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/
const COUNTRIES: NetworkCountry[] = ['UY', 'AR', 'BR', 'otro']

interface NetworkDraft {
  name: string
  country: NetworkCountry
  instructions: string
  sortOrder: string
}

const BLANK_DRAFT: NetworkDraft = { name: '', country: 'UY', instructions: '', sortOrder: '100' }

function validateDraft(draft: NetworkDraft): string | null {
  if (!draft.name.trim()) return 'El nombre no puede estar vacío.'
  if (!Number.isFinite(Number(draft.sortOrder))) return 'El orden debe ser un número.'
  return null
}

// Moderator-only catalog editor for charging_networks (0024) -- the
// original "providers become a table" migration this app's other catalog
// editors (InsuranceProvidersAdmin, InsuranceAddonsAdmin) followed the
// shape of. No delete policy by design, same reasoning as those two.
export default function ChargingNetworksAdmin() {
  const { rows, loading, error, setError, saving, editingSlug, adding, startEdit, startAdd, cancel, save } =
    useCatalogAdmin<ChargingNetwork>(async () => {
      if (!supabase) return { data: [], error: null }
      const result = await supabase.from('charging_networks').select('*').order('sort_order').order('name')
      return { data: result.data as ChargingNetwork[] | null, error: result.error }
    })

  const [editDraft, setEditDraft] = useState<NetworkDraft>(BLANK_DRAFT)
  const [newSlug, setNewSlug] = useState('')
  const [newDraft, setNewDraft] = useState<NetworkDraft>(BLANK_DRAFT)

  function handleStartEdit(n: ChargingNetwork) {
    setEditDraft({
      name: n.name,
      country: n.country,
      instructions: n.instructions ?? '',
      sortOrder: String(n.sort_order),
    })
    startEdit(n.slug)
  }

  function handleStartAdd() {
    setNewSlug('')
    setNewDraft(BLANK_DRAFT)
    startAdd()
  }

  function saveEdit(slug: string) {
    if (!supabase) return
    const validationError = validateDraft(editDraft)
    if (validationError) {
      setError(validationError)
      return
    }
    const client = supabase
    void save(() =>
      client
        .from('charging_networks')
        .update({
          name: editDraft.name.trim(),
          country: editDraft.country,
          instructions: editDraft.instructions.trim() || null,
          sort_order: Math.round(Number(editDraft.sortOrder)),
        })
        .eq('slug', slug)
    )
  }

  function saveNew() {
    if (!supabase) return
    if (!SLUG_PATTERN.test(newSlug)) {
      setError('El identificador debe tener 2 a 30 caracteres: minúsculas, números o guiones.')
      return
    }
    const validationError = validateDraft(newDraft)
    if (validationError) {
      setError(validationError)
      return
    }
    const client = supabase
    void save(
      () =>
        client.from('charging_networks').insert({
          slug: newSlug,
          name: newDraft.name.trim(),
          country: newDraft.country,
          instructions: newDraft.instructions.trim() || null,
          sort_order: Math.round(Number(newDraft.sortOrder)),
        }),
      () => {
        setNewSlug('')
        setNewDraft(BLANK_DRAFT)
      }
    )
  }

  function draftFields(draft: NetworkDraft, setDraft: (d: NetworkDraft) => void) {
    return (
      <>
        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label}>Nombre</label>
            <input
              className={formStyles.input}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="UTE"
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label}>País</label>
            <select
              className={formStyles.input}
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value as NetworkCountry })}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={formStyles.field}>
          <label className={formStyles.label}>Instrucciones de uso (opcional)</label>
          <textarea
            className={`${formStyles.input} ${formStyles.textarea}`}
            rows={3}
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            placeholder="App, tarjeta, cómo cargar..."
          />
        </div>
        <div className={formStyles.field}>
          <label className={formStyles.label}>Orden</label>
          <input
            className={formStyles.input}
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
          />
        </div>
      </>
    )
  }

  return (
    <Card>
      <h2 className={listStyles.sectionTitle}>🔌 Redes de carga</h2>
      {error && <p className={formStyles.hintWarning}>⚠️ {error}</p>}

      {loading ? (
        <p className={listStyles.empty}>Cargando…</p>
      ) : (
        <ul className={listStyles.list}>
          {rows.map((n) => (
            <li key={n.slug} className={listStyles.item}>
              {editingSlug === n.slug ? (
                <div className={formStyles.form}>
                  {draftFields(editDraft, setEditDraft)}
                  <CatalogEditActions saving={saving} onSave={() => saveEdit(n.slug)} onCancel={cancel} />
                </div>
              ) : (
                <>
                  <div>
                    <div className={listStyles.itemTitle}>{n.name}</div>
                    <div className={listStyles.itemMeta}>
                      {n.slug} · {n.country} · orden {n.sort_order}
                    </div>
                  </div>
                  <div className={listStyles.itemActions}>
                    <button className={listStyles.actionLink} onClick={() => handleStartEdit(n)}>
                      Editar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className={formStyles.form}>
          <CatalogSlugField value={newSlug} onChange={setNewSlug} placeholder="nueva-red" />
          {draftFields(newDraft, setNewDraft)}
          <CatalogEditActions saving={saving} onSave={saveNew} onCancel={cancel} />
        </div>
      ) : (
        <CatalogAddButton label="Agregar red de carga" onClick={handleStartAdd} />
      )}
    </Card>
  )
}

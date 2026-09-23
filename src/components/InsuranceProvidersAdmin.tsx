import { useState } from 'react'
import { Card } from './UI'
import CatalogAddButton from './CatalogAddButton'
import CatalogEditActions from './CatalogEditActions'
import CatalogSlugField from './CatalogSlugField'
import { supabase } from '../lib/supabaseClient'
import { useCatalogAdmin } from '../lib/useCatalogAdmin'
import formStyles from '../styles/formControls.module.css'
import listStyles from '../styles/listPatterns.module.css'
import type { InsuranceProvider } from '../types'

// slug ~ '^[a-z0-9-]{2,30}$', matching the insurance_providers CHECK
// constraint -- validated here too so a bad slug surfaces a friendly
// message instead of a generic "datos no válidos" from the DB.
const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/

// Moderator-only catalog editor for insurance_providers (0043). No delete
// policy on this table by design -- a moderator retires a provider by
// leaving it out of new quotes, not by removing the row (same as
// charging_networks). Queries Supabase directly (not the TTL-cached
// fetchInsuranceProviders) so a moderator's own edits show up immediately.
export default function InsuranceProvidersAdmin() {
  const { rows, loading, error, setError, saving, editingSlug, adding, startEdit, startAdd, cancel, save } =
    useCatalogAdmin<InsuranceProvider>(async () => {
      if (!supabase) return { data: [], error: null }
      return supabase.from('insurance_providers').select('*').order('sort_order').order('name')
    })

  const [editName, setEditName] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newName, setNewName] = useState('')
  const [newSortOrder, setNewSortOrder] = useState('100')

  function handleStartEdit(p: InsuranceProvider) {
    setEditName(p.name)
    setEditSortOrder(String(p.sort_order))
    startEdit(p.slug)
  }

  function handleStartAdd() {
    setNewSlug('')
    setNewName('')
    setNewSortOrder('100')
    startAdd()
  }

  function saveEdit(slug: string) {
    if (!supabase) return
    if (!editName.trim()) {
      setError('El nombre no puede estar vacío.')
      return
    }
    const sortOrder = Number(editSortOrder)
    if (!Number.isFinite(sortOrder)) {
      setError('El orden debe ser un número.')
      return
    }
    const client = supabase
    void save(() =>
      client
        .from('insurance_providers')
        .update({ name: editName.trim(), sort_order: Math.round(sortOrder) })
        .eq('slug', slug)
    )
  }

  function saveNew() {
    if (!supabase) return
    if (!SLUG_PATTERN.test(newSlug)) {
      setError('El identificador debe tener 2 a 30 caracteres: minúsculas, números o guiones.')
      return
    }
    if (!newName.trim()) {
      setError('El nombre no puede estar vacío.')
      return
    }
    const sortOrder = Number(newSortOrder)
    if (!Number.isFinite(sortOrder)) {
      setError('El orden debe ser un número.')
      return
    }
    const client = supabase
    void save(
      () => client.from('insurance_providers').insert({ slug: newSlug, name: newName.trim(), sort_order: Math.round(sortOrder) }),
      () => {
        setNewSlug('')
        setNewName('')
        setNewSortOrder('100')
      }
    )
  }

  return (
    <Card>
      <h2 className={listStyles.sectionTitle}>🏢 Aseguradoras</h2>
      {error && <p className={formStyles.hintWarning}>⚠️ {error}</p>}

      {loading ? (
        <p className={listStyles.empty}>Cargando…</p>
      ) : (
        <ul className={listStyles.list}>
          {rows.map((p) => (
            <li key={p.slug} className={listStyles.item}>
              {editingSlug === p.slug ? (
                <div className={formStyles.form}>
                  <div className={formStyles.row}>
                    <div className={formStyles.field}>
                      <label className={formStyles.label}>Nombre</label>
                      <input
                        className={formStyles.input}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div className={formStyles.field}>
                      <label className={formStyles.label}>Orden</label>
                      <input
                        className={formStyles.input}
                        inputMode="numeric"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                      />
                    </div>
                  </div>
                  <CatalogEditActions saving={saving} onSave={() => saveEdit(p.slug)} onCancel={cancel} />
                </div>
              ) : (
                <>
                  <div>
                    <div className={listStyles.itemTitle}>{p.name}</div>
                    <div className={listStyles.itemMeta}>
                      {p.slug} · orden {p.sort_order}
                    </div>
                  </div>
                  <div className={listStyles.itemActions}>
                    <button className={listStyles.actionLink} onClick={() => handleStartEdit(p)}>
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
          <CatalogSlugField value={newSlug} onChange={setNewSlug} placeholder="nueva-aseguradora" />
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label className={formStyles.label}>Nombre</label>
              <input
                className={formStyles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nueva Aseguradora"
              />
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label}>Orden</label>
              <input
                className={formStyles.input}
                inputMode="numeric"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(e.target.value)}
              />
            </div>
          </div>
          <CatalogEditActions saving={saving} onSave={saveNew} onCancel={cancel} />
        </div>
      ) : (
        <CatalogAddButton label="Agregar aseguradora" onClick={handleStartAdd} />
      )}
    </Card>
  )
}

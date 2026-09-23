import { useState } from 'react'
import { Card } from './UI'
import CatalogAddButton from './CatalogAddButton'
import CatalogEditActions from './CatalogEditActions'
import CatalogSlugField from './CatalogSlugField'
import { supabase } from '../lib/supabaseClient'
import { useCatalogAdmin } from '../lib/useCatalogAdmin'
import formStyles from '../styles/formControls.module.css'
import listStyles from '../styles/listPatterns.module.css'
import type { InsuranceAddon, InsuranceAddonLimitKind } from '../types'

const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/

const LIMIT_KIND_LABELS: Record<InsuranceAddonLimitKind, string> = {
  none: 'Sin límite (incluido sin más)',
  cost: 'Límite en $ por año',
  count: 'Límite de usos por año',
}

interface AddonDraft {
  icon: string
  checkboxLabel: string
  badgeLabel: string
  limitKind: InsuranceAddonLimitKind
  sortOrder: string
}

const BLANK_DRAFT: AddonDraft = { icon: '', checkboxLabel: '', badgeLabel: '', limitKind: 'none', sortOrder: '100' }

function validateDraft(draft: AddonDraft): string | null {
  if (!draft.icon.trim()) return 'El ícono no puede estar vacío.'
  if (!draft.checkboxLabel.trim()) return 'El texto del checkbox no puede estar vacío.'
  if (!draft.badgeLabel.trim()) return 'El nombre corto no puede estar vacío.'
  if (!Number.isFinite(Number(draft.sortOrder))) return 'El orden debe ser un número.'
  return null
}

// Moderator-only catalog editor for insurance_addons (0044) -- the whole
// point of that migration: a moderator adds a perk here and it appears in
// the quote form and on quote cards with no further deploy. No delete
// policy by design, same reasoning as InsuranceProvidersAdmin.
export default function InsuranceAddonsAdmin() {
  const { rows, loading, error, setError, saving, editingSlug, adding, startEdit, startAdd, cancel, save } =
    useCatalogAdmin<InsuranceAddon>(async () => {
      if (!supabase) return { data: [], error: null }
      const result = await supabase.from('insurance_addons').select('*').order('sort_order').order('badge_label')
      return { data: result.data as InsuranceAddon[] | null, error: result.error }
    })

  const [editDraft, setEditDraft] = useState<AddonDraft>(BLANK_DRAFT)
  const [newSlug, setNewSlug] = useState('')
  const [newDraft, setNewDraft] = useState<AddonDraft>(BLANK_DRAFT)

  function handleStartEdit(a: InsuranceAddon) {
    setEditDraft({
      icon: a.icon,
      checkboxLabel: a.checkbox_label,
      badgeLabel: a.badge_label,
      limitKind: a.limit_kind,
      sortOrder: String(a.sort_order),
    })
    startEdit(a.slug)
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
        .from('insurance_addons')
        .update({
          icon: editDraft.icon.trim(),
          checkbox_label: editDraft.checkboxLabel.trim(),
          badge_label: editDraft.badgeLabel.trim(),
          limit_kind: editDraft.limitKind,
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
        client.from('insurance_addons').insert({
          slug: newSlug,
          icon: newDraft.icon.trim(),
          checkbox_label: newDraft.checkboxLabel.trim(),
          badge_label: newDraft.badgeLabel.trim(),
          limit_kind: newDraft.limitKind,
          sort_order: Math.round(Number(newDraft.sortOrder)),
        }),
      () => {
        setNewSlug('')
        setNewDraft(BLANK_DRAFT)
      }
    )
  }

  function draftFields(draft: AddonDraft, setDraft: (d: AddonDraft) => void) {
    return (
      <>
        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label}>Ícono</label>
            <input
              className={formStyles.input}
              value={draft.icon}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              placeholder="🧊"
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label}>Nombre corto (badge)</label>
            <input
              className={formStyles.input}
              value={draft.badgeLabel}
              onChange={(e) => setDraft({ ...draft, badgeLabel: e.target.value })}
              placeholder="Granizo"
            />
          </div>
        </div>
        <div className={formStyles.field}>
          <label className={formStyles.label}>Texto del checkbox</label>
          <input
            className={formStyles.input}
            value={draft.checkboxLabel}
            onChange={(e) => setDraft({ ...draft, checkboxLabel: e.target.value })}
            placeholder="reparación de granizo sin cargo"
          />
          <span className={formStyles.hint}>Se muestra como "Incluye {'{'}esto{'}'}" en el formulario.</span>
        </div>
        <div className={formStyles.row}>
          <div className={formStyles.field}>
            <label className={formStyles.label}>Tipo de límite</label>
            <select
              className={formStyles.input}
              value={draft.limitKind}
              onChange={(e) => setDraft({ ...draft, limitKind: e.target.value as InsuranceAddonLimitKind })}
            >
              {(Object.keys(LIMIT_KIND_LABELS) as InsuranceAddonLimitKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {LIMIT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
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
        </div>
      </>
    )
  }

  return (
    <Card>
      <h2 className={listStyles.sectionTitle}>➕ Adicionales de seguro</h2>
      {error && <p className={formStyles.hintWarning}>⚠️ {error}</p>}

      {loading ? (
        <p className={listStyles.empty}>Cargando…</p>
      ) : (
        <ul className={listStyles.list}>
          {rows.map((a) => (
            <li key={a.slug} className={listStyles.item}>
              {editingSlug === a.slug ? (
                <div className={formStyles.form}>
                  {draftFields(editDraft, setEditDraft)}
                  <CatalogEditActions saving={saving} onSave={() => saveEdit(a.slug)} onCancel={cancel} />
                </div>
              ) : (
                <>
                  <div>
                    <div className={listStyles.itemTitle}>
                      {a.icon} {a.badge_label}
                    </div>
                    <div className={listStyles.itemMeta}>
                      {a.slug} · {LIMIT_KIND_LABELS[a.limit_kind]} · orden {a.sort_order}
                    </div>
                  </div>
                  <div className={listStyles.itemActions}>
                    <button className={listStyles.actionLink} onClick={() => handleStartEdit(a)}>
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
          <CatalogSlugField value={newSlug} onChange={setNewSlug} placeholder="nuevo-adicional" />
          {draftFields(newDraft, setNewDraft)}
          <CatalogEditActions saving={saving} onSave={saveNew} onCancel={cancel} />
        </div>
      ) : (
        <CatalogAddButton label="Agregar adicional" onClick={handleStartAdd} />
      )}
    </Card>
  )
}

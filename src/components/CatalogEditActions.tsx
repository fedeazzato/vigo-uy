import listStyles from '../styles/listPatterns.module.css'

interface CatalogEditActionsProps {
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

// The "Guardar / Cancelar" row shared by every moderator catalog editor
// (InsuranceProvidersAdmin, InsuranceAddonsAdmin, ChargingNetworksAdmin) --
// identical in each, both for an in-place row edit and for the "add new"
// form.
export default function CatalogEditActions({ saving, onSave, onCancel }: CatalogEditActionsProps) {
  return (
    <div className={listStyles.itemActions}>
      <button className={listStyles.actionLink} disabled={saving} onClick={onSave}>
        Guardar
      </button>
      <button className={listStyles.actionLink} disabled={saving} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

import formStyles from '../styles/formControls.module.css'

interface CatalogSlugFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

// The "Identificador (slug)" field shared by every moderator catalog
// editor's "add new" form -- identical wording/hint in each, since all
// three catalogs (insurance_providers, insurance_addons, charging_networks)
// use the same slug ~ '^[a-z0-9-]{2,30}$' convention as their primary key.
export default function CatalogSlugField({ value, onChange, placeholder }: CatalogSlugFieldProps) {
  return (
    <div className={formStyles.field}>
      <label className={formStyles.label}>Identificador (slug)</label>
      <input
        className={formStyles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <span className={formStyles.hint}>Minúsculas, números o guiones. No se puede cambiar después.</span>
    </div>
  )
}

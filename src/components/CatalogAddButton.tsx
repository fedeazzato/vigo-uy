import listStyles from '../styles/listPatterns.module.css'

interface CatalogAddButtonProps {
  label: string
  onClick: () => void
}

// The "+ Agregar X" toggle shared by every moderator catalog editor's
// closed (not-adding) state.
export default function CatalogAddButton({ label, onClick }: CatalogAddButtonProps) {
  return (
    <button className={listStyles.actionLink} onClick={onClick}>
      + {label}
    </button>
  )
}

import { ReactNode } from 'react'
import { PageHeader, Card, Skeleton, StarRating } from './UI'
import formStyles from '../styles/formControls.module.css'
import styles from './EntryFormShell.module.css'

interface EntryFormShellProps {
  title: string
  subtitle: string
  loading: boolean
  skeletonLines?: number
  submitting: boolean
  onCancel: () => void
  children: ReactNode
}

// The chrome shared by the service and repuesto entry forms: a skeleton
// while the edited row loads, otherwise "← Volver" + header + the form in a
// Card. The trip form keeps its own wizard chrome (step counter, per-step
// titles) and does not use this shell.
export default function EntryFormShell({
  title,
  subtitle,
  loading,
  skeletonLines = 6,
  submitting,
  onCancel,
  children,
}: EntryFormShellProps) {
  if (loading) {
    return (
      <div>
        <PageHeader title={title} subtitle={subtitle} />
        <Skeleton lines={skeletonLines} />
      </div>
    )
  }
  return (
    <div>
      <button
        type="button"
        className={`${formStyles.backBtn} ${styles.backSpacing}`}
        onClick={onCancel}
        disabled={submitting}
      >
        ← Volver
      </button>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>{children}</Card>
    </div>
  )
}

interface RatingFieldProps {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}

// A labelled star-rating row inside a form field.
export function RatingField({ label, value, onChange }: RatingFieldProps) {
  return (
    <div className={formStyles.field}>
      <span className={formStyles.label}>{label}</span>
      <StarRating value={value} onChange={onChange} />
    </div>
  )
}

interface NotesFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}

// The free-text "💬 Notas" field, identical in all three entry forms.
export function NotesField({ id, value, onChange, placeholder }: NotesFieldProps) {
  return (
    <div className={formStyles.field}>
      <label className={formStyles.label} htmlFor={id}>💬 Notas</label>
      <textarea
        id={id}
        rows={3}
        className={`${formStyles.input} ${formStyles.textarea}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

interface ShareCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

// The "share with the community" row, identical in all three entry forms.
export function ShareCheckbox({ checked, onChange }: ShareCheckboxProps) {
  return (
    <label className={formStyles.checkboxRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Compartir con la comunidad (se muestra sin tu email, solo tu nombre)
    </label>
  )
}

import { CSSProperties, KeyboardEvent, ReactNode, useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import styles from './UI.module.css'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import type { TipItem, StatItem, BadgeColor } from '../types'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  /** h2 when the page sits under a parent page title (tabbed pages). */
  as?: 'h1' | 'h2'
}

// Page titles start with a decorative emoji ("🚗 Mi Vigo"). Split it out so
// screen readers don't announce "automobile Mi Vigo" on every page.
// VS16 (️) and ZWJ (‍) keep multi-codepoint emoji sequences together.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s+/u

export function PageHeader({ title, subtitle, as: Heading = 'h1' }: PageHeaderProps) {
  const match = LEADING_EMOJI.exec(title)
  return (
    <div className={styles.pageHeader}>
      <Heading className={styles.pageTitle}>
        {match ? (
          <>
            <span aria-hidden="true">{match[1]} </span>
            {title.slice(match[0].length)}
          </>
        ) : (
          title
        )}
      </Heading>
      {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
    </div>
  )
}

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`${styles.card} ${className}`}>{children}</div>
}

interface CardTitleProps {
  icon?: string
  children: ReactNode
}

export function CardTitle({ icon, children }: CardTitleProps) {
  return (
    <div className={styles.cardTitle}>
      {icon && (
        <span className={styles.cardIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </div>
  )
}

interface TipListProps {
  items: TipItem[]
}

export function TipList({ items }: TipListProps) {
  return (
    <ul className={styles.tipList}>
      {items.map((item, i) => (
        <li key={i} className={styles.tip}>
          {item.bold && <strong>{item.bold}</strong>} {item.text}
        </li>
      ))}
    </ul>
  )
}

interface BadgeProps {
  children: ReactNode
  // 'community' = community-submitted content: always visually distinct from
  // curated/official ('blue'), see CLAUDE.md. 'external' = data from an
  // outside source (Open Charge Map), distinct from both.
  color?: BadgeColor | 'community' | 'external'
}

export function Badge({ children, color = 'gray' }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[`badge_${color}`]}`}>{children}</span>
}

type AlertType = 'warning' | 'danger' | 'info' | 'success'

const ALERT_ICON: Record<AlertType, IconName> = {
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  success: 'success',
}

interface AlertProps {
  children: ReactNode
  type?: AlertType
}

export function Alert({ children, type = 'warning' }: AlertProps) {
  return (
    // Problems interrupt the screen reader; info/success just get queued.
    <div
      className={`${styles.alert} ${styles[`alert_${type}`]}`}
      role={type === 'danger' || type === 'warning' ? 'alert' : 'status'}
    >
      <Icon name={ALERT_ICON[type]} size={18} className={styles.alertIcon} />
      <span>{children}</span>
    </div>
  )
}

interface FormErrorProps {
  children: ReactNode
}

// Submit-validation error for forms whose button sits below the fold: same
// look as a danger Alert, but scrolls itself into view so the user actually
// sees why nothing happened.
export function FormError({ children }: FormErrorProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [children])
  return (
    <div ref={ref}>
      <Alert type="danger">{children}</Alert>
    </div>
  )
}

interface StarRatingProps {
  value: number | null
  onChange: (value: number | null) => void
}

// 1–5 star picker used by the entry forms. Clicking the current value clears
// it, same as the "Quitar" link.
export function StarRating({ value, onChange }: StarRatingProps) {
  return (
    <div className={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`${styles.starBtn} ${value != null && n <= value ? styles.starFilled : ''}`}
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`${n} estrellas`}
          aria-pressed={value != null && n <= value}
        >
          ★
        </button>
      ))}
      {value != null && (
        <button type="button" className={styles.clearRating} onClick={() => onChange(null)}>
          Quitar
        </button>
      )}
    </div>
  )
}

interface StatGridProps {
  stats: StatItem[]
}

export function StatGrid({ stats }: StatGridProps) {
  return (
    <div className={styles.statGrid}>
      {stats.map((s, i) => (
        <div key={i} className={styles.stat}>
          <div className={styles.statValue}>{s.value}</div>
          <div className={styles.statLabel}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

interface SkeletonProps {
  lines?: number
}

// Loading placeholder: shimmer bars inside a card, shown instead of a blank
// area while Supabase-backed content is being fetched.
export function Skeleton({ lines = 3 }: SkeletonProps) {
  return (
    <div className={styles.card} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={styles.skeletonBar} />
      ))}
    </div>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

// The car's DFSwitch, recreated in CSS: a native checkbox exposed as
// role="switch" (Space toggles it, the label is the accessible name), the
// visual track first and the texts after it, like the car's option rows.
export function Switch({ checked, onChange, children, hint, disabled = false }: SwitchProps) {
  return (
    <label className={`${styles.switchRow} ${disabled ? styles.switchDisabled : ''}`}>
      <input
        type="checkbox"
        role="switch"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (!disabled) onChange(e.target.checked)
        }}
      />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchKnob} />
      </span>
      <span className={styles.switchText}>
        {children}
        {hint && <span className={styles.switchHint}>{hint}</span>}
      </span>
    </label>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T | null
  onChange: (value: T) => void
  // Accessible name of the group, e.g. "Modelo".
  label: string
  // Stretch to the container width instead of sizing to the widest option.
  block?: boolean
  className?: string
}

// The car's radio-group "pill" (SelectionRadioGroup): equal-width options on
// the secondary fill, the checked one under a selected-fill slider that moves
// to it. A WAI-ARIA radio group: one tab stop, arrow keys move and select.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  block = false,
  className = '',
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = options.findIndex((o) => o.value === value)

  function select(i: number) {
    const next = (i + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: options.length - 1,
    }
    if (e.key in moves) {
      e.preventDefault()
      select(moves[e.key])
    }
  }

  const style = { '--seg-count': options.length, '--seg-index': Math.max(index, 0) } as CSSProperties

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${styles.segmented} ${block ? styles.segmentedBlock : ''} ${className}`}
      style={style}
    >
      {index >= 0 && <span className={styles.segThumb} aria-hidden="true" />}
      {options.map((o, i) => {
        const checked = i === index
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (index < 0 && i === 0) ? 0 : -1}
            className={`${styles.segOption} ${checked ? styles.segChecked : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

interface SectionDividerProps {
  label: string
}

export function SectionDivider({ label }: SectionDividerProps) {
  return (
    <div className={styles.divider}>
      <span>{label}</span>
    </div>
  )
}

interface PageTabsProps {
  label: string
  tabs: { to: string; label: string; end?: boolean }[]
}

// Route-backed tabs (Mi Vigo, Cuidar tu Vigo): plain links, so the browser's back button, deep links and screen readers
// (aria-current="page") just work. The selected tab uses the car's amber "selected" underline.
export function PageTabs({ label, tabs }: PageTabsProps) {
  return (
    <nav aria-label={label} className={styles.pageTabs}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          replace
          className={({ isActive }) => `${styles.pageTab} ${isActive ? styles.pageTabActive : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

import { ReactNode, useEffect, useRef } from 'react'
import styles from './UI.module.css'
import type { TipItem, StatItem } from '../types'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
}

// Page titles start with a decorative emoji ("🚗 Mi Vigo"). Split it out so
// screen readers don't announce "automobile Mi Vigo" on every page.
// VS16 (️) and ZWJ (‍) keep multi-codepoint emoji sequences together.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s+/u

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  const match = LEADING_EMOJI.exec(title)
  return (
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>
        {match ? (
          <>
            <span aria-hidden="true">{match[1]} </span>
            {title.slice(match[0].length)}
          </>
        ) : (
          title
        )}
      </h1>
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
      {icon && <span className={styles.cardIcon} aria-hidden="true">{icon}</span>}
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
          {item.bold && <strong>{item.bold}</strong>}{' '}
          {item.text}
        </li>
      ))}
    </ul>
  )
}

interface BadgeProps {
  children: ReactNode
  color?: string
}

export function Badge({ children, color = 'green' }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[`badge_${color}`]}`}>{children}</span>
}

type AlertType = 'warning' | 'danger' | 'info' | 'success'

const ALERT_ICON: Record<AlertType, string> = {
  warning: '⚠️',
  danger: '🚨',
  info: 'ℹ️',
  success: '✅',
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
      <span className={styles.alertIcon} aria-hidden="true">{ALERT_ICON[type]}</span>
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

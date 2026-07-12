import { ReactNode } from 'react'
import styles from './UI.module.css'
import type { TipItem, StatItem } from '../types'

interface PageHeaderProps {
  title: string
  subtitle?: string
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>{title}</h1>
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
      {icon && <span className={styles.cardIcon}>{icon}</span>}
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

type AlertType = 'warning' | 'danger' | 'info'

interface AlertProps {
  children: ReactNode
  type?: AlertType
}

export function Alert({ children, type = 'warning' }: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[`alert_${type}`]}`}>
      <span className={styles.alertIcon}>
        {type === 'warning' ? '⚠️' : type === 'danger' ? '🚨' : 'ℹ️'}
      </span>
      <span>{children}</span>
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

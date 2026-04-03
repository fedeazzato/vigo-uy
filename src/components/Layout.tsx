import { NavLink, Outlet } from 'react-router-dom'
import styles from './Layout.module.css'
import { useUserPrefs, COLOR_HEX } from '../context/UserPrefsContext'
import type { Theme } from '../context/UserPrefsContext'

function nextTheme(current: Theme): Theme {
  if (current === null) return 'light'
  if (current === 'light') return 'dark'
  return null
}

const THEME_ICON: Record<NonNullable<Theme> | 'system', string> = {
  system: '⊙',
  light: '☀',
  dark: '☾',
}

const THEME_LABEL: Record<NonNullable<Theme> | 'system', string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Oscuro',
}

interface NavItem {
  to: string
  label: string
  icon: string
}

const NAV: NavItem[] = [
  { to: '/mi-vigo',    label: 'Mi Vigo',     icon: '🚗' },
  { to: '/carga',      label: 'Carga',       icon: '⚡' },
  { to: '/rutas',      label: 'Rutas',       icon: '🗺️' },
  { to: '/costos',     label: 'Costos',      icon: '💰' },
  { to: '/accesorios', label: 'Accesorios',  icon: '🔧' },
  { to: '/tecnologia', label: 'Tecnología',  icon: '📱' },
  { to: '/faq',        label: 'FAQ',         icon: '💬' },
]

export default function Layout() {
  const { model, color, theme, setTheme } = useUserPrefs()
  const themeKey = theme ?? 'system'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>⚡</div>
          <div>
            <div className={styles.brandName}>Wiki Vigo</div>
            <div className={styles.brandSub}>Uruguay 🇺🇾</div>
          </div>
        </div>

        {(model || color) && (
          <div className={styles.vigoTag}>
            {color && (
              <span
                className={styles.vigoTagDot}
                style={{
                  background: COLOR_HEX[color],
                  border: color === 'Blanco' ? '1.5px solid var(--border-strong)' : undefined,
                }}
              />
            )}
            <span>{[model, color].filter(Boolean).join(' ')}</span>
          </div>
        )}

        <nav className={styles.nav}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.themeToggle}
            onClick={() => setTheme(nextTheme(theme))}
            title={THEME_LABEL[themeKey]}
          >
            <span className={styles.themeIcon}>{THEME_ICON[themeKey]}</span>
            <span>{THEME_LABEL[themeKey]}</span>
          </button>
          <div className={styles.footerText}>
            Basado en el grupo de WhatsApp
          </div>
          <div className={styles.footerSub}>Amantes de la Vigo 🇺🇾</div>
        </div>
      </aside>

      <div className={styles.mobileHeader}>
        <div className={styles.mobileHeaderTop}>
          <div className={styles.brand} style={{ padding: '0 1rem' }}>
            <div className={styles.brandIcon}>⚡</div>
            <div>
              <div className={styles.brandName}>Wiki Vigo Uruguay</div>
            </div>
          </div>
          <button
            className={styles.themeToggleMobile}
            onClick={() => setTheme(nextTheme(theme))}
            title={THEME_LABEL[themeKey]}
          >
            {THEME_ICON[themeKey]}
          </button>
        </div>
        <nav className={styles.mobileNav}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.mobileNavLink} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon}>{icon}</span>
              <span className={styles.mobileNavLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}

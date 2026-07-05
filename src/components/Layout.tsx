import { NavLink, Outlet } from 'react-router-dom'
import styles from './Layout.module.css'
import { useUserPrefs, COLOR_HEX, COLOR_BORDER } from '../context/UserPrefsContext'
import type { EffectiveTheme } from '../context/UserPrefsContext'
import { useAuth } from '../context/AuthContext'

const THEME_ICON: Record<EffectiveTheme, string> = {
  light: '☀',
  dark: '☾',
}

const THEME_LABEL: Record<EffectiveTheme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
}

interface NavItem {
  to: string
  label: string
  icon: string
}

const NAV: NavItem[] = [
  { to: '/mi-vigo',        label: 'Mi Vigo',        icon: '🚗' },
  { to: '/ficha-tecnica',  label: 'Ficha técnica',  icon: '📋' },
  { to: '/carga',          label: 'Carga',          icon: '⚡' },
  { to: '/rutas',          label: 'Rutas',          icon: '🗺️' },
  { to: '/costos',         label: 'Costos',         icon: '💰' },
  { to: '/mantenimiento',  label: 'Mantenimiento',  icon: '🛠️' },
  { to: '/accesorios',     label: 'Accesorios',     icon: '🔧' },
  { to: '/tecnologia',     label: 'Tecnología',     icon: '📱' },
  { to: '/faq',            label: 'FAQ',            icon: '💬' },
  { to: '/mi-actividad',   label: 'Mi actividad',   icon: '📋' },
]

export default function Layout() {
  const { model, color, effectiveTheme, setTheme } = useUserPrefs()
  const { user, status, signOut } = useAuth()

  function toggleTheme() {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
  }

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
                  border: COLOR_BORDER[color] ? `1.5px solid ${COLOR_BORDER[color]}` : undefined,
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
          {status === 'signedIn' ? (
            <div className={styles.accountRow}>
              <span className={styles.accountEmail} title={user?.email}>{user?.email}</span>
              <button className={styles.footerLink} onClick={signOut}>Cerrar sesión</button>
            </div>
          ) : status !== 'loading' && (
            <NavLink to="/login" className={styles.footerLink}>Iniciar sesión</NavLink>
          )}
          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            title={THEME_LABEL[effectiveTheme]}
          >
            <span className={styles.themeIcon}>{THEME_ICON[effectiveTheme]}</span>
            <span>{THEME_LABEL[effectiveTheme]}</span>
          </button>
          <div className={styles.footerLinks}>
            <a
              href="https://forms.gle/SiNjQ77d71bUHvJ96"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerLink}
            >
              Sugerir info
            </a>
            <a
              href="https://github.com/fedeazzato/vigo-uy"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerLink}
            >
              Código en GitHub
            </a>
          </div>
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
          <div className={styles.mobileHeaderActions}>
            <a
              href="https://forms.gle/SiNjQ77d71bUHvJ96"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.suggestLinkMobile}
              title="Sugerir info"
            >
              💬
            </a>
            <button
              className={styles.themeToggleMobile}
              onClick={toggleTheme}
              title={THEME_LABEL[effectiveTheme]}
            >
              {THEME_ICON[effectiveTheme]}
            </button>
          </div>
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

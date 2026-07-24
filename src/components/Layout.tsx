import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'
import OfflineBanner from './OfflineBanner'
import SiteSearch from './SiteSearch'
import { GUIDE_LINKS } from './GuideLinks'
import { PRIMARY_NAV } from '../lib/primaryNav'
import type { NavItem } from '../lib/primaryNav'
import styles from './Layout.module.css'
import { useUserPrefs, COLOR_HEX, COLOR_BORDER } from '../context/UserPrefsContext'
import type { EffectiveTheme } from '../context/UserPrefsContext'
import { useAuth } from '../context/AuthContext'
import { RegisterSheetContext } from '../context/RegisterSheetContext'

const THEME_ICON: Record<EffectiveTheme, string> = {
  light: '☀️',
  dark: '🌙',
}

const THEME_LABEL: Record<EffectiveTheme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
}

const MODERATION_ITEM: NavItem = { to: '/moderacion', label: 'Moderación', icon: '🛡️' }

// One bottom-bar tab. The central "Registrar" control is a <button>, not a
// TabLink, because it opens the sheet instead of navigating.
function TabLink({
  to,
  end,
  icon,
  label,
  onClick,
}: {
  to: string
  end?: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `${styles.tabLink} ${isActive ? styles.tabActive : ''}`}
      onClick={onClick}
    >
      <span className={styles.tabIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.tabLabel}>{label}</span>
    </NavLink>
  )
}

export default function Layout() {
  const { model, color, effectiveTheme, setTheme } = useUserPrefs()
  const { user, profile, status, signOut } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  function toggleTheme() {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
  }

  function closeSheet() {
    setSheetOpen(false)
  }

  const registerSheet = useMemo(() => ({ openRegisterSheet: () => setSheetOpen(true) }), [])

  // The sheet doubles as a dialog on desktop — close it with Escape.
  useEffect(() => {
    if (!sheetOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sheetOpen])

  function renderNavLink({ to, label, icon, end }: NavItem, extraClass = '') {
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        className={({ isActive }) => `${styles.navLink} ${extraClass} ${isActive ? styles.active : ''}`}
      >
        <span className={styles.navIcon} aria-hidden="true">
          {icon}
        </span>
        <span>{label}</span>
      </NavLink>
    )
  }

  return (
    <RegisterSheetContext.Provider value={registerSheet}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <div className={styles.brandIcon} aria-hidden="true">
              ⚡
            </div>
            <div>
              <div className={styles.brandName}>Wiki Vigo</div>
              <div className={styles.brandSub}>Uruguay 🇺🇾</div>
            </div>
          </div>

          <button
            type="button"
            className={styles.searchTrigger}
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar en el sitio"
          >
            <span aria-hidden="true">🔍</span>
            <span>Buscar...</span>
          </button>

          {(model || color) && (
            <div className={styles.vigoTag}>
              {color && (
                <span
                  className={styles.vigoTagDot}
                  aria-hidden="true"
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
            {PRIMARY_NAV.map((item) => renderNavLink(item))}

            <div className={styles.navGroupLabel}>Guía</div>
            {GUIDE_LINKS.map((item) => renderNavLink(item, styles.navLinkGuide))}

            {profile?.is_moderator && renderNavLink(MODERATION_ITEM)}
          </nav>

          <div className={styles.sidebarFooter}>
            {status === 'signedIn' ? (
              <div className={styles.accountRow}>
                <span className={styles.accountEmail} title={user?.email}>
                  {user?.email}
                </span>
                <button className={styles.footerLink} onClick={signOut}>
                  Cerrar sesión
                </button>
              </div>
            ) : (
              status !== 'loading' && (
                <NavLink to="/login" className={styles.footerLink}>
                  Iniciar sesión
                </NavLink>
              )
            )}
            <button
              className={styles.themeToggle}
              onClick={toggleTheme}
              title={`Cambiar a tema ${effectiveTheme === 'dark' ? 'claro' : 'oscuro'}`}
              aria-label={`Tema actual: ${THEME_LABEL[effectiveTheme]}. Cambiar a tema ${effectiveTheme === 'dark' ? 'claro' : 'oscuro'}`}
            >
              <span className={styles.themeIcon} aria-hidden="true">
                {THEME_ICON[effectiveTheme]}
              </span>
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
            <div className={styles.footerText}>Basado en el grupo de WhatsApp</div>
            <div className={styles.footerSub}>Amantes de la Vigo 🇺🇾</div>
          </div>
        </aside>

        <div className={styles.mobileHeader}>
          <div className={styles.mobileHeaderTop}>
            <div className={styles.brand} style={{ padding: '0 1rem' }}>
              <div className={styles.brandIcon} aria-hidden="true">
                ⚡
              </div>
              <div>
                <div className={styles.brandName}>Wiki Vigo Uruguay</div>
              </div>
            </div>
            <div className={styles.mobileHeaderActions}>
              <button
                type="button"
                className={styles.searchButtonMobile}
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar en el sitio"
              >
                🔍
              </button>
              <a
                href="https://forms.gle/SiNjQ77d71bUHvJ96"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.suggestLinkMobile}
                title="Sugerir info"
                aria-label="Sugerir info (abre un formulario)"
              >
                💬
              </a>
              <button
                className={styles.themeToggleMobile}
                onClick={toggleTheme}
                title={`Cambiar a tema ${effectiveTheme === 'dark' ? 'claro' : 'oscuro'}`}
                aria-label={`Tema actual: ${THEME_LABEL[effectiveTheme]}. Cambiar a tema ${effectiveTheme === 'dark' ? 'claro' : 'oscuro'}`}
              >
                {THEME_ICON[effectiveTheme]}
              </button>
              {/* Always the car icon (a stable anchor for users); the selected
                vehicle color only tints the button background. */}
              <Link
                to="/mi-vigo"
                className={styles.miVigoLinkMobile}
                title="Mi Vigo"
                aria-label="Mi Vigo"
                style={
                  color
                    ? {
                        background: COLOR_HEX[color],
                        borderColor: COLOR_BORDER[color] ?? 'transparent',
                      }
                    : undefined
                }
              >
                🚗
              </Link>
            </div>
          </div>
        </div>

        <main className={styles.main}>
          <div className={styles.content}>
            {/* Inside the content area so the sidebar/header survive a page crash. */}
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>

        {/* Registrar sheet: bottom sheet on mobile, centered dialog on desktop. */}
        {sheetOpen && <div className={styles.sheetBackdrop} onClick={closeSheet} aria-hidden="true" />}
        {sheetOpen && (
          <div className={styles.sheet} role="dialog" aria-label="¿Qué querés registrar?">
            <div className={styles.sheetHeader}>¿Qué querés registrar?</div>
            {status === 'signedIn' ? (
              <>
                <Link to="/viajes/nuevo" className={styles.sheetLink} onClick={closeSheet}>
                  <span className={styles.sheetIcon} aria-hidden="true">
                    🗺️
                  </span>
                  <span>
                    <span className={styles.sheetTitle}>Un viaje</span>
                    <span className={styles.sheetDesc}>Cuánto recorriste y hacia dónde</span>
                  </span>
                </Link>
                <Link to="/costos/nuevo" className={styles.sheetLink} onClick={closeSheet}>
                  <span className={styles.sheetIcon} aria-hidden="true">
                    🛠️
                  </span>
                  <span>
                    <span className={styles.sheetTitle}>Un service</span>
                    <span className={styles.sheetDesc}>Qué le hiciste y cuánto costó</span>
                  </span>
                </Link>
                <Link to="/repuestos/nuevo" className={styles.sheetLink} onClick={closeSheet}>
                  <span className={styles.sheetIcon} aria-hidden="true">
                    🔩
                  </span>
                  <span>
                    <span className={styles.sheetTitle}>Un repuesto</span>
                    <span className={styles.sheetDesc}>Qué compraste y dónde lo conseguiste</span>
                  </span>
                </Link>
              </>
            ) : (
              <Link to="/login" className={styles.sheetLink} onClick={closeSheet}>
                <span className={styles.sheetIcon} aria-hidden="true">
                  🔑
                </span>
                <span>
                  <span className={styles.sheetTitle}>Iniciá sesión para registrar</span>
                  <span className={styles.sheetDesc}>Solo necesitás tu email, sin contraseña</span>
                </span>
              </Link>
            )}
          </div>
        )}
        <nav className={styles.tabBar}>
          <TabLink to="/" end icon="🏠" label="Inicio" onClick={closeSheet} />
          <TabLink to="/comunidad" icon="🌐" label="Comunidad" onClick={closeSheet} />
          <button
            type="button"
            className={styles.tabLink}
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
          >
            <span className={`${styles.tabIcon} ${styles.tabRegisterIcon}`} aria-hidden="true">
              ➕
            </span>
            <span className={styles.tabLabel}>Registrar</span>
          </button>
          <TabLink to="/mi-actividad" icon="🗒️" label="Mi actividad" onClick={closeSheet} />
          <TabLink to="/guia" icon="📖" label="Guía" onClick={closeSheet} />
        </nav>

        <SiteSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        <OfflineBanner />
      </div>
    </RegisterSheetContext.Provider>
  )
}

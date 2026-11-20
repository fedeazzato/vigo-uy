import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'
import OfflineBanner from './OfflineBanner'
import SiteSearch from './SiteSearch'
import { Segmented, Skeleton } from './UI'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { GUIDE_LINKS } from './GuideLinks'
import { PRIMARY_NAV } from '../lib/primaryNav'
import type { NavItem } from '../lib/primaryNav'
import styles from './Layout.module.css'
import { useUserPrefs, COLOR_HEX, COLOR_BORDER, COLOR_DARK_TEXT } from '../context/UserPrefsContext'
import type { EffectiveTheme } from '../context/UserPrefsContext'
import { useAuth } from '../context/AuthContext'
import { RegisterSheetContext } from '../context/RegisterSheetContext'

// The car launcher-tile brand mark (public/favicon.svg, made by scripts/make-brand-icon.cjs).
const BRAND_ICON = `${import.meta.env.BASE_URL}favicon.svg`

const THEME_ICON: Record<EffectiveTheme, IconName> = {
  light: 'sun',
  dark: 'moon',
}

const THEME_LABEL: Record<EffectiveTheme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
}

const THEME_OPTIONS = [
  { value: 'light', label: THEME_LABEL.light },
  { value: 'dark', label: THEME_LABEL.dark },
] as const

const MODERATION_ITEM: NavItem = { to: '/moderacion', label: 'Moderación', icon: 'shield' }

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
  icon: IconName
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
      <Icon name={icon} size={24} className={styles.tabIcon} />
      <span className={styles.tabLabel}>{label}</span>
    </NavLink>
  )
}

// One option of the Registrar sheet.
function SheetLink({
  to,
  icon,
  title,
  desc,
  onClick,
}: {
  to: string
  icon: IconName
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <Link to={to} className={styles.sheetLink} onClick={onClick}>
      <Icon name={icon} size={24} className={styles.sheetIcon} />
      <span>
        <span className={styles.sheetTitle}>{title}</span>
        <span className={styles.sheetDesc}>{desc}</span>
      </span>
    </Link>
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

  // Car left tab rail: full-width rows, the selected one highlighted with an
  // accent line on its right edge (see Layout.module.css).
  function renderNavLink({ to, label, icon, end }: NavItem, extraClass = '') {
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        className={({ isActive }) => `${styles.navLink} ${extraClass} ${isActive ? styles.active : ''}`}
      >
        <span className={styles.navIconBox}>
          <Icon name={icon} size={22} className={styles.navIcon} />
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
            <img src={BRAND_ICON} width={32} height={32} alt="" className={styles.brandIcon} />
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
            <Icon name="search" size={18} />
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
            {/* Claro / Oscuro as the car's radio-group pill; picking one is the
                same explicit choice the old toggle made (CLAUDE.md "Theme"). */}
            <Segmented
              label="Tema"
              options={THEME_OPTIONS}
              value={effectiveTheme}
              onChange={setTheme}
              block
              className={styles.themePicker}
            />
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
              <br />
              Amantes de la Vigo 🇺🇾
            </div>
          </div>
        </aside>

        <div className={styles.mobileHeader}>
          <div className={styles.mobileHeaderTop}>
            <div className={styles.brand}>
              <img src={BRAND_ICON} width={28} height={28} alt="" className={styles.brandIcon} />
              <div className={styles.brandName}>Wiki Vigo Uruguay</div>
            </div>
            <div className={styles.mobileHeaderActions}>
              <button
                type="button"
                className={styles.headerButton}
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar en el sitio"
              >
                <Icon name="search" size={22} />
              </button>
              <a
                href="https://forms.gle/SiNjQ77d71bUHvJ96"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.headerButton}
                title="Sugerir info"
                aria-label="Sugerir info (abre un formulario)"
              >
                <Icon name="chat" size={22} />
              </a>
              <button
                className={styles.headerButton}
                onClick={toggleTheme}
                title={`Cambiar a tema ${effectiveTheme === 'dark' ? 'claro' : 'oscuro'}`}
                aria-label={`Tema actual: ${THEME_LABEL[effectiveTheme]}. Cambiar a tema ${effectiveTheme === 'dark' ? 'claro' : 'oscuro'}`}
              >
                <Icon name={THEME_ICON[effectiveTheme]} size={22} />
              </button>
              {/* Always the car icon (a stable anchor for users); the selected
                vehicle color only tints the button background. */}
              <Link
                to="/mi-vigo"
                className={styles.headerButton}
                title="Mi Vigo"
                aria-label="Mi Vigo"
                style={
                  color
                    ? {
                        background: COLOR_HEX[color],
                        borderColor: COLOR_BORDER[color] ?? 'transparent',
                        color: COLOR_DARK_TEXT[color] ? '#1a1a18' : '#ffffff',
                      }
                    : undefined
                }
              >
                <Icon name="car" size={22} />
              </Link>
            </div>
          </div>
        </div>

        <main className={styles.main}>
          <div className={styles.content}>
            {/* Inside the content area so the sidebar/header survive a page crash.
                Suspense covers every lazy-loaded page route (App.tsx); a chunk that
                fails to fetch throws during render, which ErrorBoundary already
                catches with its "Recargar la página" UI. */}
            <ErrorBoundary>
              <Suspense fallback={<Skeleton lines={4} />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        {/* Registrar sheet: bottom sheet on mobile, centered dialog on desktop. */}
        {sheetOpen && <div className={styles.sheetBackdrop} onClick={closeSheet} aria-hidden="true" />}
        {sheetOpen && (
          <div className={styles.sheet} role="dialog" aria-label="¿Qué querés registrar?">
            <div className={styles.sheetHeader}>
              <button type="button" className={styles.sheetClose} onClick={closeSheet} aria-label="Cerrar">
                <Icon name="close" size={22} />
              </button>
              <span>¿Qué querés registrar?</span>
            </div>
            {status === 'signedIn' ? (
              <>
                <SheetLink
                  to="/viajes/nuevo"
                  icon="route"
                  title="Un viaje"
                  desc="Cuánto recorriste y hacia dónde"
                  onClick={closeSheet}
                />
                <SheetLink
                  to="/costos/nuevo"
                  icon="maintenance"
                  title="Un service"
                  desc="Qué le hiciste y cuánto costó"
                  onClick={closeSheet}
                />
                <SheetLink
                  to="/repuestos/nuevo"
                  icon="parts"
                  title="Un repuesto"
                  desc="Qué compraste y dónde lo conseguiste"
                  onClick={closeSheet}
                />
                <SheetLink
                  to="/costos/seguro/nuevo"
                  icon="shield"
                  title="Un seguro"
                  desc="Aseguradora, cobertura y costo anual"
                  onClick={closeSheet}
                />
              </>
            ) : (
              <SheetLink
                to="/login"
                icon="user"
                title="Iniciá sesión para registrar"
                desc="Solo necesitás tu email, sin contraseña"
                onClick={closeSheet}
              />
            )}
          </div>
        )}
        <nav className={styles.tabBar}>
          <TabLink to="/" end icon="home" label="Inicio" onClick={closeSheet} />
          <TabLink to="/comunidad" icon="community" label="Comunidad" onClick={closeSheet} />
          <button
            type="button"
            className={styles.tabLink}
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
          >
            <span className={styles.tabRegisterIcon} aria-hidden="true">
              <Icon name="plus" size={20} />
            </span>
            <span className={styles.tabLabel}>Registrar</span>
          </button>
          <TabLink to="/mi-actividad" icon="activity" label="Mi actividad" onClick={closeSheet} />
          <TabLink to="/guia" icon="guide" label="Guía" onClick={closeSheet} />
        </nav>

        <SiteSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        <OfflineBanner />
      </div>
    </RegisterSheetContext.Provider>
  )
}

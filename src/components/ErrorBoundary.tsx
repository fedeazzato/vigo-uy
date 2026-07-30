import { Component, ReactNode } from 'react'
import { Card } from './UI'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  isReloading: boolean
}

// Browsers' wording for a failed dynamic import() — this is the shape a
// stale tab's lazy route chunk (specs/route-code-splitting.md) throws in
// after a deploy replaces dist/assets/ with new content-hashed filenames.
const CHUNK_LOAD_ERROR_PATTERN = /dynamically imported module|importing a module script failed/i

const RELOAD_ATTEMPT_KEY = 'vigo-chunk-reload-at'
const RELOAD_COOLDOWN_MS = 10_000

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return CHUNK_LOAD_ERROR_PATTERN.test(message)
}

// Guards against reloading forever if the reload doesn't actually help
// (e.g. offline, or the deploy itself is broken) — only auto-reload if we
// haven't already tried within the last few seconds.
function shouldAutoReload(): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_ATTEMPT_KEY) ?? 0)
  return Date.now() - last > RELOAD_COOLDOWN_MS
}

// Error boundaries must be class components — there is no hook equivalent.
// Mounted inside Layout's content area so the sidebar/header survive a page
// crash and navigation stays usable.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, isReloading: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true, isReloading: false }
  }

  componentDidCatch(error: unknown) {
    console.error('Uncaught render error:', error)
    if (isChunkLoadError(error) && shouldAutoReload()) {
      sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(Date.now()))
      this.setState({ isReloading: true })
      location.reload()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.state.isReloading) {
      return (
        <div className={styles.wrapper}>
          <Card>
            <div className={styles.content}>
              <div className={styles.icon}>🔄</div>
              <h2 className={styles.title}>Hay una versión nueva</h2>
              <p className={styles.text}>Actualizando la página...</p>
            </div>
          </Card>
        </div>
      )
    }
    return (
      <div className={styles.wrapper}>
        <Card>
          <div className={styles.content}>
            <div className={styles.icon}>😵</div>
            <h2 className={styles.title}>Algo salió mal.</h2>
            <p className={styles.text}>Ocurrió un error inesperado al mostrar esta página.</p>
            <button className={styles.reloadBtn} onClick={() => location.reload()}>
              Recargar la página
            </button>
          </div>
        </Card>
      </div>
    )
  }
}

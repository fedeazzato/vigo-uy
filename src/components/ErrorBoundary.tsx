import { Component, ReactNode } from 'react'
import { Card } from './UI'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

// Error boundaries must be class components — there is no hook equivalent.
// Mounted inside Layout's content area so the sidebar/header survive a page
// crash and navigation stays usable.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Uncaught render error:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className={styles.wrapper}>
        <Card>
          <div className={styles.content}>
            <div className={styles.icon}>😵</div>
            <h2 className={styles.title}>Algo salió mal.</h2>
            <p className={styles.text}>
              Ocurrió un error inesperado al mostrar esta página.
            </p>
            <button className={styles.reloadBtn} onClick={() => location.reload()}>
              Recargar la página
            </button>
          </div>
        </Card>
      </div>
    )
  }
}

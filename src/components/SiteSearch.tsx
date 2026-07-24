// Site search overlay (specs/site-search.md). Trigger buttons live inline
// in Layout.tsx (sidebar + mobile header, same pattern as the Registrar
// sheet); this component owns the input, debounce, and both result sources.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCommunityContent } from '../lib/communityData'
import { searchCuratedContent } from '../lib/siteSearch'
import { isAccessoryCategory } from '../lib/purchaseCatalog'
import { Badge } from './UI'
import styles from './SiteSearch.module.css'
import type { CommunitySearchResult, CuratedSearchResult } from '../types'

const DEBOUNCE_MS = 300

const KIND_ICON: Record<CommunitySearchResult['kind'], string> = {
  service_entry: '🛠️',
  trip_log: '🗺️',
  part_purchase: '🔩',
}

function communityResultPath(result: CommunitySearchResult): string {
  switch (result.kind) {
    case 'service_entry':
      return '/costos'
    case 'trip_log':
      return '/rutas'
    case 'part_purchase':
      return isAccessoryCategory(result.category ?? '') ? '/accesorios' : '/repuestos'
  }
}

interface SiteSearchProps {
  open: boolean
  onClose: () => void
}

export default function SiteSearch({ open, onClose }: SiteSearchProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [curatedResults, setCuratedResults] = useState<CuratedSearchResult[]>([])
  const [communityResults, setCommunityResults] = useState<CommunitySearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setQuery('')
      setDebouncedQuery('')
      setCuratedResults([])
      setCommunityResults([])
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setCuratedResults(searchCuratedContent(debouncedQuery))

    if (debouncedQuery.trim() === '') {
      setCommunityResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void searchCommunityContent(debouncedQuery).then(({ results }) => {
      if (cancelled) return
      setCommunityResults(results)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  function goTo(path: string) {
    navigate(path)
    onClose()
  }

  if (!open) return null

  const hasQuery = debouncedQuery.trim() !== ''
  const noResults = hasQuery && !loading && curatedResults.length === 0 && communityResults.length === 0

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.panel} role="dialog" aria-label="Buscar en el sitio">
        <div className={styles.inputRow}>
          <span className={styles.inputIcon} aria-hidden="true">
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            className={styles.input}
            placeholder="Buscar páginas, viajes, costos, repuestos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Cerrar búsqueda">
            ✕
          </button>
        </div>

        <div className={styles.results}>
          {curatedResults.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupLabel}>Guía</div>
              {curatedResults.map((r, i) => (
                <button key={`${r.path}-${i}`} type="button" className={styles.resultRow} onClick={() => goTo(r.path)}>
                  <span className={styles.resultTitle}>{r.title}</span>
                  {r.subtitle && <span className={styles.resultSubtitle}>{r.subtitle}</span>}
                </button>
              ))}
            </div>
          )}

          {communityResults.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupLabel}>Comunidad</div>
              {communityResults.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  type="button"
                  className={styles.resultRow}
                  onClick={() => goTo(communityResultPath(r))}
                >
                  <span className={styles.resultIcon} aria-hidden="true">
                    {KIND_ICON[r.kind]}
                  </span>
                  <span className={styles.resultText}>
                    <span className={styles.resultTitle}>{r.title}</span>
                    <span className={styles.resultSubtitle}>{r.subtitle}</span>
                  </span>
                  <Badge color="blue">Comunidad</Badge>
                </button>
              ))}
            </div>
          )}

          {loading && <div className={styles.status}>Buscando...</div>}
          {noResults && <div className={styles.status}>No encontramos nada para "{debouncedQuery}".</div>}
          {!hasQuery && <div className={styles.status}>Escribí para buscar en toda la wiki.</div>}
        </div>
      </div>
    </>
  )
}

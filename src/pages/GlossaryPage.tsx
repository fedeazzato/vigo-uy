import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader, Card } from '../components/UI'
import { GLOSSARY } from '../lib/glossary'
import styles from './GlossaryPage.module.css'

// Glosario (owner decision 2026-11-24, proposal 8), under Aprender › Conocé tu Vigo. ?t=<id> scrolls to and highlights a term
// (HashRouter owns the URL hash, so no #anchors).
export default function GlossaryPage() {
  const [params] = useSearchParams()
  const target = params.get('t')

  useEffect(() => {
    if (!target) return
    const el = document.getElementById(`termino-${target}`)
    el?.scrollIntoView?.({ block: 'center' })
    el?.focus({ preventScroll: true })
  }, [target])

  return (
    <div>
      <PageHeader title="🔤 Glosario" subtitle="Las palabras raras del auto eléctrico, dichas simple." />
      <Card>
        <dl className={styles.list}>
          {GLOSSARY.map((t) => (
            <div
              key={t.id}
              id={`termino-${t.id}`}
              tabIndex={-1}
              className={`${styles.item} ${t.id === target ? styles.target : ''}`}
            >
              <dt className={styles.word}>{t.word}</dt>
              <dd className={styles.definition}>{t.definition}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <p>
        ¿Falta una palabra? Contanos en <Link to="/comunidad">Comunidad</Link>.
      </p>
    </div>
  )
}

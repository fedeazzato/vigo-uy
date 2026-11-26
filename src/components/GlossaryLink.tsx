import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { glossaryPath } from '../lib/glossary'

// A "palabra rara" linked to its Glosario entry (proposal 8), instead of re-explaining it on every page.
export default function GlossaryLink({ term, children }: { term: string; children: ReactNode }) {
  return (
    <Link to={glossaryPath(term)} title="¿Qué significa? Ver en el glosario">
      {children}
    </Link>
  )
}

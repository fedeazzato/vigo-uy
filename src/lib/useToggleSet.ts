import { useCallback, useState } from 'react'

/**
 * A Set of ids with a toggle, for rows that expand in place (trip cards on
 * Comunidad and Mi actividad). A Set so opening one doesn't close another.
 */
export function useToggleSet(): [Set<string>, (id: string) => void] {
  const [ids, setIds] = useState<Set<string>>(new Set())
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  return [ids, toggle]
}

import { useEffect, useState } from 'react'

// Live media-query hook. Drives the responsive variants that CSS alone can't
// express (e.g. the trip form renders as a 3-step wizard on phones but as a
// single page on desktop).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Single breakpoint shared with the CSS (@media (max-width: 700px) in
// Layout.module.css) so JS and CSS agree on what "mobile" means.
export const MOBILE_QUERY = '(max-width: 700px)'

import { useEffect, useState } from 'react'

// React hook around matchMedia. Returns true iff the query currently
// matches; re-renders on viewport changes. Server/SSR safe — defaults
// to false until the effect runs in the browser.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)

    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}

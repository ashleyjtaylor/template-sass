import { Home, PanelLeft, PanelLeftClose } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/modules/theme/ThemeToggle'
import { EnvBadge } from './EnvBadge'
import { NavItem } from './NavItem'
import { UserMenu } from './UserMenu'

// LocalStorage key for the user's expanded/collapsed preference at
// desktop sizes. Below the tablet breakpoint the preference is
// ignored — the sidebar always collapses to icons.
const STORAGE_KEY = 'sidebar:expanded'
// Tailwind `md:` breakpoint. Below this we force-collapse; above this
// the user's `STORAGE_KEY` preference wins.
const DESKTOP_QUERY = '(min-width: 768px)'

const readPreference = (): boolean => {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== 'false'
}

export function Sidebar() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [expandedPref, setExpandedPref] = useState(readPreference)

  // Persist the user's choice so it survives reloads. Stored as the
  // string 'true' / 'false' so a missing key reads as expanded.
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(expandedPref))
  }, [expandedPref])

  // Effective state: forced collapsed below the desktop breakpoint,
  // otherwise the user's preference.
  const expanded = isDesktop && expandedPref

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col overflow-hidden border-r bg-card/40 transition-[width] duration-200',
        expanded ? 'w-60' : 'w-14'
      )}
    >
      <div
        className={cn(
          'flex items-center px-3 py-4',
          expanded ? 'justify-between' : 'justify-center'
        )}
      >
        {expanded && (
          <div className="flex min-w-0 items-center gap-2">
            <div
              aria-hidden
              className="size-6 shrink-0 rounded-md bg-linear-to-br from-foreground to-foreground/50"
            />
            <span className="truncate text-sm font-semibold tracking-tight">App</span>
          </div>
        )}

        {isDesktop && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => setExpandedPref((v) => !v)}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
          </Button>
        )}
      </div>

      <nav className="mt-2 flex flex-col gap-0.5 px-2">
        <NavItem to="/dashboard" icon={Home} collapsed={!expanded}>
          Dashboard
        </NavItem>
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-3 pb-3">
        {expanded ? <EnvBadge /> : null}
        <div className={cn('flex items-center gap-1', !expanded && 'justify-center')}>
          <div className="min-w-0 flex-1">
            <UserMenu collapsed={!expanded} />
          </div>
          {expanded ? <ThemeToggle /> : null}
        </div>
      </div>
    </aside>
  )
}

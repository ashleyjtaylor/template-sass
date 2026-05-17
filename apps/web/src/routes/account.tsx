import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { useSession } from '@/modules/session/api'

// Layout for /account/*. Renders the page header + tab nav and an
// <Outlet/> for the child route (profile / security). The tab links
// are real routes (not query params) so each tab gets its own
// history entry, deep links work, and route-level code splitting
// kicks in per tab.
export const Route = createFileRoute('/account')({
  component: AccountLayout
})

function AccountLayout() {
  const { user } = useSession()

  if (!user) return null

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <div className="text-[10px] font-medium uppercase text-muted-foreground/70">Account</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Manage your profile and sign-in credentials.
        </p>
      </header>

      <nav
        aria-label="Account settings"
        className="inline-flex h-9 items-center gap-1 text-muted-foreground"
      >
        <TabLink to="/account/profile">Profile</TabLink>
        <TabLink to="/account/security">Security</TabLink>
      </nav>

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  )
}

interface TabLinkProps {
  to: '/account/profile' | '/account/security'
  children: React.ReactNode
}

function TabLink({ to, children }: TabLinkProps) {
  // TanStack's `activeProps` is applied when the current URL matches.
  // Visual treatment matches the shadcn Tabs primitive (`bg-muted` on
  // the active tab, hover brightens inactive) so swapping back to the
  // primitive later is trivial.
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
        'hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
      )}
      activeProps={{ className: 'bg-muted text-foreground' }}
    >
      {children}
    </Link>
  )
}

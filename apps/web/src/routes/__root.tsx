import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  Outlet,
  useNavigate,
  useRouterState
} from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/toaster'
import { safeRedirect } from '@/lib/redirect'
import { useSession } from '@/modules/session/api'

export interface RouterContext {
  queryClient: QueryClient
}

// Routes only useful while signed out. An authed user landing here is
// bounced to `/dashboard`.
const UNAUTHED_ONLY_PATHS: ReadonlySet<string> = new Set(['/login', '/signup'])

// Public routes — render for both authed and unauthed users with no
// gate. Pricing lives here so unauthed visitors can pick a plan.
// Password-reset routes are public because authed users can also
// trigger a reset from the user menu, and the email link they then
// click must work whether or not their session has been revoked.
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/', '/forgot-password', '/reset-password'])

// Routes that hide the sidebar shell (auth forms, pricing).
const SHELL_HIDDEN_PATHS: ReadonlySet<string> = new Set([
  '/login',
  '/signup',
  '/',
  '/forgot-password',
  '/reset-password'
])

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootRoute
})

function RootRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const search = useRouterState({ select: (s) => s.location.search })
  const isUnauthedOnly = UNAUTHED_ONLY_PATHS.has(pathname)
  const isPublic = PUBLIC_PATHS.has(pathname)
  const hidesShell = SHELL_HIDDEN_PATHS.has(pathname)
  // /signup?plan=… is a transient checkout-in-progress state: the page
  // is firing window.location.href to Stripe right now. If AuthGate sees
  // the new session and bounces to /dashboard first, the user lands on
  // the paywalled gate instead of Stripe. Suppress the bounce until the
  // page completes its hard navigation.
  const isMidCheckout = pathname === '/signup' && typeof search['plan'] === 'string'

  return (
    <>
      <AuthGate
        isUnauthedOnly={isUnauthedOnly}
        isPublic={isPublic}
        isMidCheckout={isMidCheckout}
        search={search}
      >
        {hidesShell ? (
          <Outlet />
        ) : (
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        )}
      </AuthGate>
      <Toaster />
    </>
  )
}

interface AuthGateProps {
  isUnauthedOnly: boolean
  isPublic: boolean
  isMidCheckout: boolean
  search: Record<string, unknown>
  children: ReactNode
}

function AuthGate({ isUnauthedOnly, isPublic, isMidCheckout, search, children }: AuthGateProps) {
  const navigate = useNavigate()
  const { isAuthed, isLoading } = useSession()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthed && !isUnauthedOnly && !isPublic) {
      navigate({ to: '/login' })
      return
    }

    if (isAuthed && isUnauthedOnly && !isMidCheckout) {
      const target = typeof search['redirect'] === 'string' ? search['redirect'] : undefined

      navigate({ to: safeRedirect(target) })
    }
  }, [isAuthed, isLoading, isUnauthedOnly, isPublic, isMidCheckout, search, navigate])

  if (isLoading) return null
  if (!isAuthed && !isUnauthedOnly && !isPublic) return null
  if (isAuthed && isUnauthedOnly && !isMidCheckout) return null

  return children
}

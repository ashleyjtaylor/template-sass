import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthCardLayout, AuthField } from '@/components/layout/AuthCardLayout'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { getLastAuthMethod } from '@/lib/last-auth-method'
import { safeRedirect } from '@/lib/redirect'
import { cn } from '@/lib/utils'
import { useAuthProviders, useSignIn } from '@/modules/session/api'
import { GoogleSignInButton, LastUsedPill } from '@/modules/session/GoogleSignInButton'

const searchSchema = z.object({
  redirect: z.string().optional(),
  // TanStack Router's default parser turns `?verified=1` into the number
  // 1; coerce so the value is always string-shaped downstream.
  verified: z.coerce.string().optional(),
  error: z.string().optional()
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage
})

const friendlyError = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Email or password is incorrect.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }

  return 'Could not sign you in. Try again.'
}

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const signIn = useSignIn()
  const providers = useAuthProviders()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Read once on mount — localStorage doesn't change reactively, and the
  // value only matters for the initial render.
  const lastUsed = useMemo(() => getLastAuthMethod(), [])

  // `?verified=1` lands here when the verify link was clicked on a device
  // without an active session — better-auth's GET /verify-email redirect
  // fires regardless of auth state. Show the same success toast as
  // /dashboard, strip the param so a refresh doesn't re-toast.
  useEffect(() => {
    if (search.verified !== '1') return

    toast.success('Email verified', {
      // Stable id dedupes when React StrictMode double-invokes in dev.
      id: 'email-verified',
      description: 'Sign in to continue.'
    })
    navigate({
      to: '/login',
      search: { ...search, verified: undefined },
      replace: true
    })
  }, [search, navigate])

  // OAuth failure round-trip — better-auth redirects back to this page
  // with ?error=<code> when the user cancels at Google or the token
  // exchange fails. Single generic toast covers every code; we don't
  // surface upstream codes (they're not actionable for the user).
  useEffect(() => {
    if (!search.error) return

    toast.error('Could not sign in with Google', {
      id: 'oauth-error',
      description: 'Try again, or sign in with your email and password.'
    })
    navigate({
      to: '/login',
      search: { ...search, error: undefined },
      replace: true
    })
  }, [search, navigate])

  // Computed at render time so the post-OAuth callback URL preserves
  // any ?plan param the user came in with. Dashboard then auto-bounces
  // them into Stripe Checkout. The `from=google` marker tells
  // /dashboard to record 'google' as the last-used method — set here
  // (vs at click time) so cancelled OAuth attempts don't pin the
  // badge to a method the user never actually used.
  const callbackURL = (() => {
    const url = new URL('/dashboard', window.location.origin)
    url.searchParams.set('from', 'google')
    const plan = new URLSearchParams(window.location.search).get('plan')
    if (plan) url.searchParams.set('plan', plan)
    return url.toString()
  })()
  const errorCallbackURL = `${window.location.origin}/login?error=oauth_failed`

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    signIn.mutate(
      { email, password },
      { onSuccess: () => navigate({ to: safeRedirect(search.redirect) }) }
    )
  }

  return (
    <AuthCardLayout
      eyebrow="App"
      title="Sign in"
      subtitle="Enter your account credentials."
      footer={
        <>
          New here?{' '}
          <Link
            to="/signup"
            search={{ redirect: search.redirect }}
            className="underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {signIn.isError && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          {friendlyError(signIn.error)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={setEmail}
          disabled={signIn.isPending}
        />
        <div className="space-y-1">
          <AuthField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            disabled={signIn.isPending}
          />
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <div className="relative mt-8">
          <Button
            type="submit"
            className={cn(
              'group w-full',
              // Blue ring when the user signed in with email last time,
              // matching the LastUsedPill. Solid (no alpha) so the
              // shade matches the pill exactly.
              lastUsed === 'email' && 'ring-4 ring-blue-500 ring-offset-2'
            )}
            disabled={signIn.isPending}
          >
            {signIn.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Sign in
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
          {lastUsed === 'email' ? <LastUsedPill /> : null}
        </div>
      </form>

      {providers.data?.google ? (
        <>
          <div className="my-5 flex items-center gap-3 text-[10px] uppercase text-muted-foreground/70">
            <div className="h-px flex-1 bg-border" />
            <span>Or continue with</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleSignInButton
            callbackURL={callbackURL}
            errorCallbackURL={errorCallbackURL}
            lastUsed={lastUsed === 'google'}
          />
        </>
      ) : null}
    </AuthCardLayout>
  )
}

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
import { useCreateCheckoutSession } from '@/modules/billing/api'
import { useAuthProviders, useSignUp } from '@/modules/session/api'
import { GoogleSignInButton, LastUsedPill } from '@/modules/session/GoogleSignInButton'

const searchSchema = z.object({
  redirect: z.string().optional(),
  plan: z.string().optional(),
  error: z.string().optional()
})

export const Route = createFileRoute('/signup')({
  validateSearch: searchSchema,
  component: SignUpPage
})

const friendlyError = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 422 || err.code === 'UNPROCESSABLE_ENTITY')
      return 'That email is already in use.'
    if (err.status === 400) return 'Please check the form for missing or invalid fields.'
    // Per-IP signup cap (5 / hour). Hit most often on shared wifi where
    // several genuine signups come from one egress IP. Bias the copy
    // toward "wait an hour" — that's the actual window.
    if (err.status === 429) return 'Too many signups from this device. Wait an hour and try again.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }

  return 'Could not create your account. Try again.'
}

function SignUpPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const signUp = useSignUp()
  const checkout = useCreateCheckoutSession()
  const providers = useAuthProviders()
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Read once on mount — localStorage doesn't change reactively.
  const lastUsed = useMemo(() => getLastAuthMethod(), [])

  // Mirror /login's OAuth-failure handler so the user lands back here
  // with a clear toast and a clean URL.
  useEffect(() => {
    if (!search.error) return

    toast.error('Could not sign in with Google', {
      id: 'oauth-error',
      description: 'Try again, or sign up with your email and password.'
    })
    navigate({
      to: '/signup',
      search: { ...search, error: undefined },
      replace: true
    })
  }, [search, navigate])

  // Preserve the ?plan param through the OAuth round-trip so /dashboard
  // can auto-bounce the user into Stripe Checkout post-sign-in. The
  // `from=google` marker tells /dashboard to record 'google' as the
  // last-used method only after a successful round trip.
  const callbackURL = (() => {
    const url = new URL('/dashboard', window.location.origin)
    url.searchParams.set('from', 'google')
    if (search.plan) url.searchParams.set('plan', search.plan)
    return url.toString()
  })()
  const errorParams = new URLSearchParams({ error: 'oauth_failed' })
  if (search.plan) errorParams.set('plan', search.plan)
  const errorCallbackURL = `${window.location.origin}/signup?${errorParams.toString()}`

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    signUp.mutate(
      { firstname, lastname, email, password },
      {
        onSuccess: () => {
          if (search.plan) {
            checkout.mutate(
              { plan: search.plan },
              {
                onSuccess: (data) => {
                  window.location.href = data.url
                },
                onError: () => navigate({ to: '/dashboard' })
              }
            )
            return
          }

          navigate({ to: safeRedirect(search.redirect) })
        }
      }
    )
  }

  const busy = signUp.isPending || checkout.isPending

  return (
    <AuthCardLayout
      eyebrow="App"
      title="Create account"
      subtitle={search.plan ? "We'll send you to checkout next." : 'Sign up with your email.'}
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            search={{ redirect: search.redirect }}
            className="text-foreground underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {signUp.isError && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          {friendlyError(signUp.error)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <AuthField
            id="firstname"
            label="First name"
            type="text"
            autoComplete="given-name"
            autoFocus
            value={firstname}
            onChange={setFirstname}
            disabled={busy}
          />
          <AuthField
            id="lastname"
            label="Last name"
            type="text"
            autoComplete="family-name"
            value={lastname}
            onChange={setLastname}
            disabled={busy}
          />
        </div>
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          disabled={busy}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          disabled={busy}
        />

        <div className="relative mt-8">
          <Button
            type="submit"
            className={cn(
              'group w-full',
              // Blue ring when the user signed up with email last time,
              // matching the LastUsedPill. Solid (no alpha) so the
              // shade matches the pill exactly.
              lastUsed === 'email' && 'ring-2 ring-blue-500 ring-offset-2'
            )}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {search.plan ? 'Create account & continue' : 'Create account'}
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

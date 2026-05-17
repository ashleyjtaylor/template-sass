import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthCardLayout, AuthField } from '@/components/layout/AuthCardLayout'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/redirect'
import { useSignIn } from '@/modules/session/api'

const searchSchema = z.object({
  redirect: z.string().optional(),
  // TanStack Router's default parser turns `?verified=1` into the number
  // 1; coerce so the value is always string-shaped downstream.
  verified: z.coerce.string().optional()
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

        <Button type="submit" className="group w-full" disabled={signIn.isPending}>
          {signIn.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Sign in
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </AuthCardLayout>
  )
}

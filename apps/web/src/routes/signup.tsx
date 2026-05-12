import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AuthCardLayout, AuthField } from '@/components/layout/AuthCardLayout'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/redirect'
import { useCreateCheckoutSession } from '@/modules/billing/api'
import { useSignUp } from '@/modules/session/api'

const searchSchema = z.object({
  redirect: z.string().optional(),
  plan: z.string().optional()
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
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }

  return 'Could not create your account. Try again.'
}

function SignUpPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const signUp = useSignUp()
  const checkout = useCreateCheckoutSession()
  const [firstname, setFirstname] = useState('')
  const [lastname, setLastname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

        <Button type="submit" className="group w-full" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {search.plan ? 'Create account & continue' : 'Create account'}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </AuthCardLayout>
  )
}

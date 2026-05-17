import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { z } from 'zod'
import { AuthCardLayout, AuthField } from '@/components/layout/AuthCardLayout'
import { Button, buttonVariants } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useResetPassword } from '@/modules/session/api'

// The /reset-password/:token API endpoint redirects here on success
// with `?token=` (validated, not yet consumed) or on failure with
// `?error=INVALID_TOKEN`. Either may be present, neither may be —
// the user might also have hit /reset-password directly with no params.
const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional()
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const reset = useResetPassword()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // No token (or upstream error from the redirect) → invalid-link view.
  // Errors thrown by the reset-password POST itself (expired, used,
  // weak password) collapse into the same view: we don't distinguish
  // expired vs used vs invalid to avoid leaking token state.
  //
  // 429 is the one exception — the token may still be perfectly valid,
  // the user just retried too fast. Falling into InvalidLinkView there
  // would tell them to "request a new link" when in fact the link is
  // fine and they should just wait. Render the form with an alert
  // instead so the next attempt re-submits the same (good) token.
  const token = search.token
  const isRateLimited = reset.error instanceof ApiError && reset.error.status === 429
  if (!token || search.error || (reset.isError && !isRateLimited)) {
    return <InvalidLinkView />
  }

  if (reset.isSuccess) {
    return <SuccessView onContinue={() => navigate({ to: '/login' })} />
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLocalError(null)

    if (password.length < 8) {
      setLocalError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setLocalError('Passwords don’t match.')
      return
    }

    reset.mutate({ token, newPassword: password })
  }

  return (
    <AuthCardLayout
      eyebrow="App"
      title="Choose a new password"
      subtitle="Pick something strong. You'll sign in with it after this step."
      footer={
        <>
          Decided not to reset?{' '}
          <Link to="/login" className="text-foreground underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {(localError || isRateLimited) && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          {localError ?? 'Too many attempts. Wait a few minutes and try again.'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={setPassword}
          disabled={reset.isPending}
        />
        <AuthField
          id="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          disabled={reset.isPending}
        />

        <Button type="submit" className="group w-full" disabled={reset.isPending}>
          {reset.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Update password
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </AuthCardLayout>
  )
}

function InvalidLinkView() {
  return (
    <AuthCardLayout
      eyebrow="App"
      title="Link is invalid or expired"
      subtitle="Reset links are good for 1 hour and can only be used once. Request a new one to continue."
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-5" />
        </div>
        <Link
          to="/forgot-password"
          className={cn(buttonVariants({ variant: 'default' }), 'group w-full')}
        >
          Request a new link
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link to="/login" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          Back to sign in
        </Link>
      </div>
    </AuthCardLayout>
  )
}

function SuccessView({ onContinue }: { onContinue: () => void }) {
  return (
    <AuthCardLayout
      eyebrow="App"
      title="Password updated"
      subtitle="Sign in with your new password to continue. Any other active sessions have been signed out."
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
        </div>
        <Button onClick={onContinue} className="group w-full">
          Sign in
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </AuthCardLayout>
  )
}

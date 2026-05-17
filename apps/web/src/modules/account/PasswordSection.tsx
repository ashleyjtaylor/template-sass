import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { AuthField } from '@/components/layout/AuthCardLayout'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import {
  PASSWORD_MIN_LENGTH,
  type PasswordValidationError,
  validatePassword
} from '@/lib/profile-validation'
import { useChangePassword, useForgotPassword } from '@/modules/session/api'

const errorMessageFor = (err: unknown): string => {
  if (err instanceof ApiError) {
    // better-auth's change-password throws BAD_REQUEST + INVALID_PASSWORD
    // when the supplied current password doesn't match. Surface a friendly
    // inline message rather than the raw "Invalid password" string.
    if (err.code === 'INVALID_PASSWORD') return 'That password is incorrect.'
    if (err.status === 429) return 'Too many attempts. Wait a few minutes and try again.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }
  return 'Could not update your password. Try again.'
}

const validationCopy = (code: PasswordValidationError): string => {
  switch (code) {
    case 'NEW_PASSWORD_TOO_SHORT':
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    case 'CONFIRM_MISMATCH':
      return "Passwords don't match."
    case 'SAME_AS_CURRENT':
      return 'New password must be different from your current one.'
  }
}

interface PasswordSectionProps {
  email: string
}

export function PasswordSection({ email }: PasswordSectionProps) {
  const change = useChangePassword()
  const forgot = useForgotPassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validation, setValidation] = useState<PasswordValidationError | null>(null)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setValidation(null)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setValidation(null)

    const result = validatePassword(currentPassword, newPassword, confirm)
    if (result) {
      setValidation(result)
      return
    }

    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          reset()
          toast.success('Password updated', {
            description: 'Other devices have been signed out.'
          })
        }
      }
    )
  }

  const handleForgot = () => {
    forgot.mutate(
      { email },
      {
        onSuccess: () =>
          toast.success('Reset link sent', {
            description: `Check ${email} for a link to choose a new password.`
          }),
        onError: () =>
          toast.error('Could not send reset link', {
            description: 'Try again in a few minutes.'
          })
      }
    )
  }

  const errorMessage = validation
    ? validationCopy(validation)
    : change.isError
      ? errorMessageFor(change.error)
      : null

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Password</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Change your password here. Updating it signs you out of every other device.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <AuthField
          id="current-password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          disabled={change.isPending}
        />
        <AuthField
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          disabled={change.isPending}
        />
        <AuthField
          id="confirm-password"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          disabled={change.isPending}
        />

        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Update password'}
        </Button>
      </form>

      <p className="mt-5 text-xs text-muted-foreground">
        Forgot your current password?{' '}
        <button
          type="button"
          onClick={handleForgot}
          disabled={forgot.isPending}
          className="text-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          {forgot.isPending ? 'Sending…' : `Send a reset link to ${email} instead`}
        </button>
        .
      </p>
    </section>
  )
}

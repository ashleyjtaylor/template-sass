import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AuthField } from '@/components/layout/AuthCardLayout'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import {
  type NameValidationError,
  PASSWORD_MIN_LENGTH,
  type PasswordValidationError,
  validateName,
  validatePassword
} from '@/lib/profile-validation'
import { useAccountMethods, useDeleteAccount } from '@/modules/account/api'
import { ConfirmDeleteModal } from '@/modules/account/ConfirmDeleteModal'
import {
  useChangePassword,
  useForgotPassword,
  useSession,
  useUpdateProfile
} from '@/modules/session/api'

export const Route = createFileRoute('/account')({
  component: AccountPage
})

const deleteErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.code === 'BadPassword') return 'That password is incorrect.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }
  return 'Could not delete your account. Try again.'
}

const profileErrorMessage = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many requests. Wait a few minutes and try again.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }
  return 'Could not update your profile. Try again.'
}

const passwordErrorMessage = (err: unknown): string => {
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

const nameValidationCopy = (code: NameValidationError): string => {
  switch (code) {
    case 'FIRSTNAME_REQUIRED':
      return 'First name is required.'
    case 'FIRSTNAME_TOO_LONG':
      return 'First name is too long.'
    case 'LASTNAME_REQUIRED':
      return 'Last name is required.'
    case 'LASTNAME_TOO_LONG':
      return 'Last name is too long.'
  }
}

const passwordValidationCopy = (code: PasswordValidationError): string => {
  switch (code) {
    case 'NEW_PASSWORD_TOO_SHORT':
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    case 'CONFIRM_MISMATCH':
      return "Passwords don't match."
    case 'SAME_AS_CURRENT':
      return 'New password must be different from your current one.'
  }
}

function AccountPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const methods = useAccountMethods()
  const deleteAccount = useDeleteAccount()
  const forgot = useForgotPassword()
  const [modalOpen, setModalOpen] = useState(false)

  if (!user) return null

  // Default to true while methods are loading — keeps the password input
  // visible (the safe fallback) until we know better. OAuth-only users
  // briefly see the field, then it disappears on first response.
  const hasPassword = methods.data?.hasPassword ?? true

  const handleConfirm = (input: { password?: string }) => {
    deleteAccount.mutate(input, {
      onSuccess: () => {
        setModalOpen(false)
        toast.success('Account deleted', {
          description: 'Your account and any active subscription have been removed.'
        })
        navigate({ to: '/login' })
      }
    })
  }

  const handleResetPassword = () => {
    forgot.mutate(
      { email: user.email },
      {
        onSuccess: () =>
          toast.success('Reset link sent', {
            description: `Check ${user.email} for a link to choose a new password.`
          }),
        onError: () =>
          toast.error('Could not send reset link', {
            description: 'Try again in a few minutes.'
          })
      }
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <div className="text-[10px] font-medium uppercase text-muted-foreground/70">Account</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Manage your profile, sign-in credentials, and destructive account actions. Subscription
          changes live on the Billing page.
        </p>
      </header>

      <ProfileSection
        initialFirstname={user.firstname ?? ''}
        initialLastname={user.lastname ?? ''}
      />

      {hasPassword ? (
        <PasswordSection
          email={user.email}
          onForgotPassword={handleResetPassword}
          forgotPending={forgot.isPending}
        />
      ) : null}

      <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="text-[10px] font-medium uppercase text-destructive/80">Danger zone</div>
        <h2 className="mt-1 text-lg font-semibold">Delete account</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Permanently deletes your account and cancels any active subscription. You won't be
          refunded for the remainder of your current billing period.
        </p>
        <Button variant="destructive" className="mt-5" onClick={() => setModalOpen(true)}>
          Delete account
        </Button>
      </section>

      <ConfirmDeleteModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        expectedEmail={user.email}
        hasPassword={hasPassword}
        pending={deleteAccount.isPending}
        errorMessage={deleteAccount.isError ? deleteErrorMessage(deleteAccount.error) : null}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

interface ProfileSectionProps {
  initialFirstname: string
  initialLastname: string
}

function ProfileSection({ initialFirstname, initialLastname }: ProfileSectionProps) {
  const update = useUpdateProfile()
  const [firstname, setFirstname] = useState(initialFirstname)
  const [lastname, setLastname] = useState(initialLastname)
  const [validation, setValidation] = useState<NameValidationError | null>(null)

  // useSession refetches after a successful update; sync the controlled
  // inputs back to the canonical values so a second edit starts from
  // what's actually on the server (e.g. trim applied server-side).
  useEffect(() => {
    setFirstname(initialFirstname)
    setLastname(initialLastname)
  }, [initialFirstname, initialLastname])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setValidation(null)

    const result = validateName(firstname, lastname)
    if (result) {
      setValidation(result)
      return
    }

    update.mutate(
      { firstname: firstname.trim(), lastname: lastname.trim() },
      {
        onSuccess: () => {
          toast.success('Profile updated')
        }
      }
    )
  }

  const errorMessage = validation
    ? nameValidationCopy(validation)
    : update.isError
      ? profileErrorMessage(update.error)
      : null

  return (
    <section className="mb-6 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Your name appears in the dashboard nav and on emails we send you.
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

        <div className="grid grid-cols-2 gap-3">
          <AuthField
            id="firstname"
            label="First name"
            type="text"
            autoComplete="given-name"
            value={firstname}
            onChange={setFirstname}
            disabled={update.isPending}
          />
          <AuthField
            id="lastname"
            label="Last name"
            type="text"
            autoComplete="family-name"
            value={lastname}
            onChange={setLastname}
            disabled={update.isPending}
          />
        </div>

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Save changes'}
        </Button>
      </form>
    </section>
  )
}

interface PasswordSectionProps {
  email: string
  onForgotPassword: () => void
  forgotPending: boolean
}

function PasswordSection({ email, onForgotPassword, forgotPending }: PasswordSectionProps) {
  const change = useChangePassword()
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

  const errorMessage = validation
    ? passwordValidationCopy(validation)
    : change.isError
      ? passwordErrorMessage(change.error)
      : null

  return (
    <section className="mb-6 rounded-lg border bg-card p-6">
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
          onClick={onForgotPassword}
          disabled={forgotPending}
          className="text-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          {forgotPending ? 'Sending…' : `Send a reset link to ${email} instead`}
        </button>
        .
      </p>
    </section>
  )
}

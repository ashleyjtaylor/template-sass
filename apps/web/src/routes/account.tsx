import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { useDeleteAccount } from '@/modules/account/api'
import { ConfirmDeleteModal } from '@/modules/account/ConfirmDeleteModal'
import { useForgotPassword, useSession } from '@/modules/session/api'

export const Route = createFileRoute('/account')({
  component: AccountPage
})

const friendlyError = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.code === 'BadPassword') return 'That password is incorrect.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }

  return 'Could not delete your account. Try again.'
}

function AccountPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const deleteAccount = useDeleteAccount()
  const forgot = useForgotPassword()
  const [modalOpen, setModalOpen] = useState(false)

  if (!user) return null

  const handleConfirm = (input: { password: string }) => {
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
          Manage your sign-in credentials and destructive account actions. Subscription changes live
          on the Billing page.
        </p>
      </header>

      <section className="mb-6 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Password</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          We'll email a single-use link to {user.email}. Opening it lets you choose a new password
          and signs you out of every other session.
        </p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={handleResetPassword}
          disabled={forgot.isPending}
        >
          {forgot.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Send reset link'}
        </Button>
      </section>

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
        pending={deleteAccount.isPending}
        errorMessage={deleteAccount.isError ? friendlyError(deleteAccount.error) : null}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

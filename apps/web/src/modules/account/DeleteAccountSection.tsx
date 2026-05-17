import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { useDeleteAccount } from './api'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'

const errorMessageFor = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.code === 'BadPassword') return 'That password is incorrect.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }
  return 'Could not delete your account. Try again.'
}

interface DeleteAccountSectionProps {
  email: string
  hasPassword: boolean
}

export function DeleteAccountSection({ email, hasPassword }: DeleteAccountSectionProps) {
  const navigate = useNavigate()
  const deleteAccount = useDeleteAccount()
  const [modalOpen, setModalOpen] = useState(false)

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

  // Renders inside an AccordionContent on /account/security — own
  // wrapper + heading live on the accordion shell. The destructive
  // treatment is applied to the AccordionItem itself, not here.
  return (
    <>
      <div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Permanently deletes your account and cancels any active subscription. You won't be
          refunded for the remainder of your current billing period.
        </p>
        <Button variant="destructive" className="mt-5" onClick={() => setModalOpen(true)}>
          Permanently delete account
        </Button>
      </div>

      <ConfirmDeleteModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        expectedEmail={email}
        hasPassword={hasPassword}
        pending={deleteAccount.isPending}
        errorMessage={deleteAccount.isError ? errorMessageFor(deleteAccount.error) : null}
        onConfirm={handleConfirm}
      />
    </>
  )
}

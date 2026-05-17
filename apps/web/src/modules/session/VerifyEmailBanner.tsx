import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useResendVerification, useSession } from './api'

export function VerifyEmailBanner() {
  const { user } = useSession()
  const resend = useResendVerification()

  if (!user || user.emailVerified) return null

  const handleResend = () => {
    resend.mutate(
      { email: user.email },
      {
        onSuccess: () =>
          toast.success('Verification email sent', {
            description: `Check ${user.email} for a link to verify your account.`
          }),
        onError: () =>
          toast.error('Could not send verification email', {
            description: 'Try again in a few minutes.'
          })
      }
    )
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <div className="flex items-start gap-2.5">
        <Mail className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-medium">Verify your email.</span>{' '}
          <span className="text-amber-900/80 dark:text-amber-100/80">
            We sent a link to {user.email}. It expires in 24 hours.
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:ml-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={resend.isPending}
        >
          {resend.isPending ? <Loader2 className="size-3.5 animate-spin" /> : 'Resend email'}
        </Button>
      </div>
    </div>
  )
}

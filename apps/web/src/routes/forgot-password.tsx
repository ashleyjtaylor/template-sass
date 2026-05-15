import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Loader2, MailCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { AuthCardLayout, AuthField } from '@/components/layout/AuthCardLayout'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useForgotPassword } from '@/modules/session/api'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage
})

function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const [email, setEmail] = useState('')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    forgot.mutate({ email })
  }

  // Rate-limit (429) is the only error worth showing — every other case
  // (unknown email, mailer down, validation) collapses to a generic 200
  // server-side to prevent enumeration. So success and most errors render
  // the same confirmation; only 429 surfaces.
  if (forgot.isSuccess) {
    return <ConfirmationView email={email} />
  }

  return (
    <AuthCardLayout
      eyebrow="App"
      title="Forgot password"
      subtitle="Enter your account email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="text-foreground underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {forgot.isError && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          Too many requests. Wait a few minutes and try again.
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
          disabled={forgot.isPending}
        />

        <Button type="submit" className="group w-full" disabled={forgot.isPending}>
          {forgot.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Send reset link
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </AuthCardLayout>
  )
}

function ConfirmationView({ email }: { email: string }) {
  return (
    <AuthCardLayout
      eyebrow="App"
      title="Check your inbox"
      subtitle={`If an account exists for ${email}, we've sent a link to reset the password. It expires in 1 hour.`}
      footer={
        <>
          Wrong email?{' '}
          <Link
            to="/forgot-password"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Try a different address
          </Link>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <MailCheck className="size-5" />
        </div>
        <p className="text-xs text-muted-foreground">
          Didn't get an email? Check spam, or wait a minute and request another link.
        </p>
        <Link to="/login" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          Back to sign in
        </Link>
      </div>
    </AuthCardLayout>
  )
}

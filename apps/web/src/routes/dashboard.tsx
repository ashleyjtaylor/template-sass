import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccessState } from '@/modules/billing/api'
import { PLANS, PlanCard } from '@/modules/billing/plans'
import { useSession } from '@/modules/session/api'
import { VerifyEmailBanner } from '@/modules/session/VerifyEmailBanner'

// TanStack Router's default search parser is JSON-aware, so `?verified=1`
// arrives as the number 1, not the string '1'. Coerce so the value is
// always a string regardless of what the URL serializer produced.
const searchSchema = z.object({
  verified: z.coerce.string().optional()
})

export const Route = createFileRoute('/dashboard')({
  validateSearch: searchSchema,
  component: DashboardPage
})

function DashboardPage() {
  const { user } = useSession()
  const access = useAccessState()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const firstname = user?.name.split(' ')[0] ?? 'there'

  // `?verified=1` is set by better-auth's GET /api/auth/verify-email
  // redirect (configured via the signup/resend callbackURL). Fire the
  // toast exactly once, then strip the param so a refresh doesn't re-
  // toast. The function form of `search` is the reliable way to clear
  // — passing `{}` directly can leave the param in place because the
  // route's validateSearch keeps the optional key.
  useEffect(() => {
    if (search.verified !== '1') return

    toast.success('Email verified', {
      // Stable id dedupes the toast when React StrictMode double-invokes
      // the effect in dev — Sonner reuses the existing toast rather
      // than rendering a second one.
      id: 'email-verified',
      description: 'Thanks — your email address is confirmed.'
    })
    navigate({ to: '/dashboard', search: () => ({}), replace: true })
  }, [search.verified, navigate])

  if (access.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    )
  }

  const isPaid = access.data?.state === 'paid' || access.data?.state === 'past_due'

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <VerifyEmailBanner />
      <header className="mb-8">
        <div className="text-[10px] font-medium uppercase text-muted-foreground/70">Dashboard</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome, {firstname}</h1>
      </header>

      {isPaid ? <PaidState /> : <PaywallState />}
    </div>
  )
}

function PaidState() {
  return (
    <section className="rounded-lg border bg-card/40 p-6">
      <h2 className="text-sm font-medium">Product</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Your real dashboard goes here. This is a placeholder. Subscription details live on the
        Billing page.
      </p>
    </section>
  )
}

function PaywallState() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-dashed bg-card/40 p-6 text-center">
        <h2 className="text-base font-semibold">Pick a plan to get started</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Your account is set up. Add a payment method to unlock the product.
        </p>
      </section>

      <div className="grid gap-6 sm:grid-cols-1">
        {PLANS.map((plan) => (
          <PlanCard key={plan.key} plan={plan} />
        ))}
      </div>
    </div>
  )
}

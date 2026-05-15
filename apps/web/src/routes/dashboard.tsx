import { createFileRoute } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccessState } from '@/modules/billing/api'
import { PLANS, PlanCard } from '@/modules/billing/plans'
import { useSession } from '@/modules/session/api'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage
})

function DashboardPage() {
  const { user } = useSession()
  const access = useAccessState()
  const firstname = user?.name.split(' ')[0] ?? 'there'

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

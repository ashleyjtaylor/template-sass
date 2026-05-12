import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAccessState,
  useCreateCheckoutSession,
  useCreatePortalSession
} from '@/modules/billing/api'
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
  const access = useAccessState()
  const portal = useCreatePortalSession()

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-foreground/70" />
          <span className="font-medium">You're subscribed</span>
        </div>
        {access.data?.subscription && (
          <p className="mt-1 text-xs text-muted-foreground">
            Plan: {access.data.subscription.planKey} · Status: {access.data.subscription.status} ·
            Renews{' '}
            {new Date(access.data.subscription.currentPeriodEnd).toLocaleDateString(undefined, {
              dateStyle: 'medium'
            })}
            {access.data.subscription.cancelAtPeriodEnd && ' (cancels at period end)'}
          </p>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={portal.isPending}
          onClick={() =>
            portal.mutate(undefined, {
              onSuccess: (data) => {
                window.location.href = data.url
              }
            })
          }
        >
          {portal.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <>
              Manage billing
              <ExternalLink className="ml-1 size-3" />
            </>
          )}
        </Button>
      </section>

      <section className="rounded-lg border bg-card/40 p-6">
        <h2 className="text-sm font-medium">Product</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your real dashboard goes here. This is a placeholder.
        </p>
      </section>
    </div>
  )
}

function PaywallState() {
  const navigate = useNavigate()
  const checkout = useCreateCheckoutSession()

  return (
    <section className="rounded-lg border border-dashed bg-card/40 p-8 text-center">
      <h2 className="text-lg font-semibold">Subscribe to access the dashboard</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Your account is set up. Add a payment method to start using the product.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3">
        <Button
          disabled={checkout.isPending}
          onClick={() =>
            checkout.mutate(
              { plan: 'pro' },
              {
                onSuccess: (data) => {
                  window.location.href = data.url
                }
              }
            )
          }
        >
          {checkout.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Subscribe to Pro
              <ArrowRight className="ml-1 size-4" />
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={() => navigate({ to: '/' })}>
          View plans
        </Button>
      </div>

      {checkout.isError && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          Could not start checkout. Try again.
        </p>
      )}
    </section>
  )
}

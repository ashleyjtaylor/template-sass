import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccessState, useCreatePortalSession } from '@/modules/billing/api'

export const Route = createFileRoute('/billing')({
  component: BillingPage
})

function BillingPage() {
  const access = useAccessState()
  const portal = useCreatePortalSession()

  const openPortal = () => {
    portal.mutate(undefined, {
      onSuccess: (data) => {
        window.location.href = data.url
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <div className="text-[10px] font-medium uppercase text-muted-foreground/70">Billing</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Subscription & payments</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Your current plan and renewal details. Card changes, invoices and cancellations are
          handled by Stripe.
        </p>
      </header>

      {access.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : access.data?.subscription ? (
        <SubscriptionCard
          subscription={access.data.subscription}
          onManage={openPortal}
          managePending={portal.isPending}
          manageError={portal.isError}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

interface SubscriptionCardProps {
  subscription: {
    planKey: string
    status: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
  }
  onManage: () => void
  managePending: boolean
  manageError: boolean
}

function SubscriptionCard({
  subscription,
  onManage,
  managePending,
  manageError
}: SubscriptionCardProps) {
  const renewLabel = subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase text-muted-foreground/70">
            Current plan
          </div>
          <h2 className="mt-1 text-lg font-semibold capitalize">{subscription.planKey}</h2>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase ${
            subscription.status === 'active'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted/40 text-muted-foreground'
          }`}
        >
          {subscription.status}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{renewLabel}</dt>
          <dd className="mt-1 font-medium">
            {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
              dateStyle: 'medium'
            })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Billing frequency</dt>
          <dd className="mt-1 font-medium">Monthly</dd>
        </div>
      </dl>

      {subscription.cancelAtPeriodEnd && (
        <div className="mt-5 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5 text-xs text-muted-foreground">
          Your subscription is set to cancel on{' '}
          {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
            dateStyle: 'medium'
          })}
          . Reactivate from the Stripe portal anytime before then to keep access.
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t pt-5">
        <div>
          <p className="text-sm font-medium">Manage your subscription</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Update card, view invoices, cancel — all handled by Stripe.
          </p>
        </div>
        <Button onClick={onManage} disabled={managePending}>
          {managePending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Manage on Stripe
              <ExternalLink className="size-3.5" />
            </>
          )}
        </Button>
      </div>

      {manageError && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          Could not open the Stripe portal. Try again.
        </p>
      )}
    </section>
  )
}

function EmptyState() {
  const navigate = useNavigate()

  return (
    <section className="rounded-lg border border-dashed bg-card/40 p-6">
      <h2 className="text-base font-semibold">You're not subscribed yet</h2>
      <p className="mt-1 max-w-lg text-xs text-muted-foreground">
        Pick a plan to unlock the product. You can manage and cancel anytime from this page.
      </p>
      <Button className="mt-4" onClick={() => navigate({ to: '/dashboard' })}>
        View plans
      </Button>
    </section>
  )
}

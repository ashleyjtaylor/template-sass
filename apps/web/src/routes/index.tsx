import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAccessState, useCreateCheckoutSession } from '@/modules/billing/api'
import { useSession } from '@/modules/session/api'

export const Route = createFileRoute('/')({
  component: PricingPage
})

interface Plan {
  key: string
  name: string
  price: string
  cadence: string
  blurb: string
  features: string[]
  featured?: boolean
}

const PLANS: Plan[] = [
  {
    key: 'pro',
    name: 'Pro',
    price: '$29',
    cadence: '/month',
    blurb: 'Everything you need to get started.',
    features: ['Full access to the product', 'Email support', 'Cancel anytime'],
    featured: true
  }
]

function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="size-6 rounded-md bg-linear-to-br from-foreground to-foreground/50"
          />
          <span className="text-sm font-semibold tracking-tight">App</span>
        </div>
        <HeaderActions />
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Simple pricing</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Pick a plan, create your account, and you're in.
          </p>
        </div>

        <div className="mx-auto grid max-w-xl gap-6 sm:grid-cols-1">
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      </main>
    </div>
  )
}

function HeaderActions() {
  const { isAuthed, isLoading } = useSession()
  const navigate = useNavigate()

  if (isLoading) return null

  if (isAuthed) {
    return (
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/dashboard' })}>
        Dashboard
        <ArrowRight className="ml-1 size-3" />
      </Button>
    )
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/login' })}>
      Sign in
    </Button>
  )
}

interface PlanCardProps {
  plan: Plan
}

function PlanCard({ plan }: PlanCardProps) {
  const navigate = useNavigate()
  const { isAuthed, isLoading: sessionLoading } = useSession()
  const access = useAccessState({ enabled: isAuthed })
  const checkout = useCreateCheckoutSession()

  const handleClick = () => {
    if (!isAuthed) {
      navigate({ to: '/signup', search: { plan: plan.key } })
      return
    }

    if (access.data?.state === 'paid' || access.data?.state === 'past_due') {
      navigate({ to: '/dashboard' })
      return
    }

    checkout.mutate(
      { plan: plan.key },
      {
        onSuccess: (data) => {
          window.location.href = data.url
        }
      }
    )
  }

  const busy = checkout.isPending || sessionLoading || (isAuthed && access.isLoading)
  const buttonLabel =
    isAuthed && (access.data?.state === 'paid' || access.data?.state === 'past_due')
      ? 'Go to dashboard'
      : isAuthed
        ? 'Subscribe'
        : 'Get started'

  return (
    <article
      className={`relative rounded-xl border p-8 ${
        plan.featured ? 'border-foreground/20 bg-card shadow-sm' : 'bg-card/40'
      }`}
    >
      {plan.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-background">
          Most popular
        </div>
      )}

      <h2 className="text-lg font-semibold">{plan.name}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{plan.blurb}</p>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
        <span className="text-sm text-muted-foreground">{plan.cadence}</span>
      </div>

      <ul className="mt-6 space-y-2 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button className="mt-8 w-full" disabled={busy} onClick={handleClick}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : buttonLabel}
      </Button>

      {checkout.isError && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          Could not start checkout. Try again.
        </p>
      )}
    </article>
  )
}

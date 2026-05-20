import { useNavigate } from '@tanstack/react-router'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAccessState, useCreateCheckoutSession } from '@/modules/billing/api'
import { useSession } from '@/modules/session/api'

export interface Plan {
  key: string
  name: string
  price: string
  cadence: string
  blurb: string
  features: string[]
  featured?: boolean
}

export const PLANS: Plan[] = [
  {
    key: 'pro',
    name: 'Pro',
    price: '£20',
    cadence: '/month',
    blurb: 'Everything you need to get started.',
    features: ['Full access to the product', 'Email support', 'Cancel anytime'],
    featured: true
  },
  {
    key: 'max',
    name: 'Max',
    price: '£40',
    cadence: '/month',
    blurb: 'For teams that need more headroom.',
    features: ['Everything in Pro', 'Higher usage limits', 'Priority support', 'Cancel anytime']
  }
]

interface PlanCardProps {
  plan: Plan
}

// Single card with context-aware click handling:
//  - unauthed → routes to /signup?plan=<key>
//  - authed + paid/past_due → "Go to dashboard" link
//  - authed + paywalled → kicks Stripe Checkout inline
export function PlanCard({ plan }: PlanCardProps) {
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

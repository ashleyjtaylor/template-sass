import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLANS, PlanCard } from '@/modules/billing/plans'
import { useSession } from '@/modules/session/api'

export const Route = createFileRoute('/')({
  component: PricingPage
})

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
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/login' })}>
        Log in
      </Button>
      <Button size="sm" onClick={() => navigate({ to: '/signup' })}>
        Create account
      </Button>
    </div>
  )
}

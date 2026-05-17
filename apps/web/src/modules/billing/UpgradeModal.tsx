import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { useChangePlan, usePreviewPlanChange } from './api'

const errorMessageFor = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.code === 'NoActiveSubscription') return 'Subscribe first to upgrade.'
    if (err.code === 'InvalidPlanChange') return "You're already on this plan."
    if (err.code === 'UnsupportedPlan') return 'That plan is not available.'
    if (err.status === 429) return 'Too many requests. Wait a few minutes and try again.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }
  return "Couldn't upgrade. Try again."
}

// ISO 4217 codes come back from Stripe lowercase. Intl.NumberFormat
// wants uppercase. Tiny helper to avoid sprinkling toUpperCase calls.
const formatMoney = (amountCents: number, currency: string): string =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(amountCents / 100)

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Plan keys come from the SubscriptionCard caller. Today this is
  // always 'max', but typing it as a string keeps the modal reusable
  // when a third tier lands.
  targetPlan: string
  targetPlanLabel: string
  // Fired after a successful change. The page uses this to start
  // polling access-state until the mirror reflects the new plan —
  // the webhook lags the API response by ~200ms-1s, so the
  // immediate cache invalidation from useChangePlan still sees the
  // old planKey.
  onUpgraded?: (targetPlan: string) => void
}

export function UpgradeModal({
  open,
  onOpenChange,
  targetPlan,
  targetPlanLabel,
  onUpgraded
}: UpgradeModalProps) {
  const preview = usePreviewPlanChange()
  const change = useChangePlan()

  // Fire the preview each time the modal opens. Reset state on close so
  // a re-open shows a fresh loading state rather than the stale amount.
  // The mutation methods (`mutate` / `reset`) are stable references from
  // TanStack Query, so including them in the dep array doesn't re-run.
  const previewMutate = preview.mutate
  const previewReset = preview.reset
  const changeReset = change.reset
  useEffect(() => {
    if (open) {
      previewMutate({ plan: targetPlan })
    } else {
      previewReset()
      changeReset()
    }
  }, [open, targetPlan, previewMutate, previewReset, changeReset])

  const handleConfirm = () => {
    if (!preview.data) return

    change.mutate(
      {
        plan: targetPlan,
        prorationDateUnix: preview.data.prorationDateUnix
      },
      {
        onSuccess: () => {
          toast.success(`Welcome to ${targetPlanLabel}`, {
            description: 'Your new plan is active.'
          })
          onOpenChange(false)
          onUpgraded?.(targetPlan)
        }
      }
    )
  }

  const previewError = preview.isError ? errorMessageFor(preview.error) : null
  const changeError = change.isError ? errorMessageFor(change.error) : null
  const errorMessage = previewError ?? changeError
  const busy = preview.isPending || change.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to {targetPlanLabel}</DialogTitle>
          <DialogDescription>
            Switch your subscription to {targetPlanLabel}, prorated for the rest of this billing
            period.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {preview.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Calculating prorated charge…
            </div>
          )}

          {preview.data && !preview.isPending && (
            <p className="text-sm">
              You'll be charged{' '}
              <strong>{formatMoney(preview.data.amountDueCents, preview.data.currency)}</strong>{' '}
              today, prorated for the remaining time in your current billing period. After that,
              your subscription continues at the {targetPlanLabel} price.
            </p>
          )}

          {errorMessage && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || !preview.data}>
            {change.isPending ? <Loader2 className="size-4 animate-spin" /> : `Confirm upgrade`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

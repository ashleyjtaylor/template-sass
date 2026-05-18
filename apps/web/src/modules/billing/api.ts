import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  accessStateSchema,
  changePlanResultSchema,
  previewPlanChangeSchema,
  sessionUrlSchema
} from './schemas'

const ACCESS_STATE_KEY = ['access-state'] as const

export const useAccessState = (opts: { enabled?: boolean; pollMs?: number } = {}) => {
  return useQuery({
    queryKey: ACCESS_STATE_KEY,
    queryFn: () => {
      return api('/api/billing/access-state', accessStateSchema)
    },
    enabled: opts.enabled ?? true,
    // Refetch on focus / mount so the webhook-driven state flip lands
    // without a manual reload.
    staleTime: 0,
    refetchOnWindowFocus: true,
    // checkout-success passes `pollMs` so it watches the flip from
    // `paywalled` to `paid` after Checkout completes.
    refetchInterval: opts.pollMs ?? false
  })
}

export const useCreateCheckoutSession = () => {
  return useMutation({
    mutationFn: (input: { plan: string }) => {
      return api('/api/billing/checkout-session', sessionUrlSchema, {
        method: 'POST',
        body: input
      })
    }
  })
}

export const useCreatePortalSession = () => {
  return useMutation({
    mutationFn: () => {
      return api('/api/billing/portal-session', sessionUrlSchema, {
        method: 'POST',
        body: {}
      })
    }
  })
}

export const usePreviewPlanChange = () => {
  return useMutation({
    mutationFn: (input: { plan: string }) => {
      return api('/api/billing/change-plan/preview', previewPlanChangeSchema, {
        method: 'POST',
        body: input
      })
    }
  })
}

export interface ChangePlanInput {
  plan: string
  // Forwarded from the preview call so the actual charge matches the
  // amount the user was shown. Omit for "charge what Stripe computes now".
  prorationDateUnix?: number
}

export const useChangePlan = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ChangePlanInput) => {
      return api('/api/billing/change-plan', changePlanResultSchema, {
        method: 'POST',
        body: input
      })
    },
    // The webhook updates the mirror within ~1s of Stripe firing the
    // event, but invalidating the access-state cache here makes the
    // SubscriptionCard re-render the new planKey on the very next
    // refetch — no manual reload.
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ACCESS_STATE_KEY })
    }
  })
}

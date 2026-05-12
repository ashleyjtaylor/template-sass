import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { accessStateSchema, sessionUrlSchema } from './schemas'

const ACCESS_STATE_KEY = ['access-state'] as const

export const useAccessState = (opts: { enabled?: boolean; pollMs?: number } = {}) =>
  useQuery({
    queryKey: ACCESS_STATE_KEY,
    queryFn: () => api('/api/billing/access-state', accessStateSchema),
    enabled: opts.enabled ?? true,
    // Refetch on focus / mount so the webhook-driven state flip lands
    // without a manual reload.
    staleTime: 0,
    refetchOnWindowFocus: true,
    // checkout-success passes `pollMs` so it watches the flip from
    // `paywalled` to `paid` after Checkout completes.
    refetchInterval: opts.pollMs ?? false
  })

export const useCreateCheckoutSession = () =>
  useMutation({
    mutationFn: (input: { plan: string }) =>
      api('/api/billing/checkout-session', sessionUrlSchema, {
        method: 'POST',
        body: input
      })
  })

export const useCreatePortalSession = () =>
  useMutation({
    mutationFn: () =>
      api('/api/billing/portal-session', sessionUrlSchema, {
        method: 'POST',
        body: {}
      })
  })

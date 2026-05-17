import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { clearLastAuthMethod } from '@/lib/last-auth-method'

const deleteResponseSchema = z.object({ status: z.literal('ok') })

export interface DeleteAccountInput {
  // Optional — OAuth-only users (no credential Account row) can delete
  // via the session cookie alone. The API enforces this server-side.
  password?: string
}

export const useDeleteAccount = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      api('/api/account/delete', deleteResponseSchema, { method: 'POST', body: input }),
    // After a successful delete the session row is gone server-side, so
    // every cached query (session, access-state, …) is stale. Clear the
    // cache, drop the per-device "last used" hint (the account is
    // gone — a stale marker would mislead a fresh signup on this
    // browser), and let the route boot fresh against /login.
    onSuccess: () => {
      clearLastAuthMethod()
      queryClient.clear()
    }
  })
}

const methodsSchema = z.object({
  hasPassword: z.boolean(),
  hasGoogle: z.boolean()
})

// Lists the sign-in methods the authenticated user has on file. Used
// to branch the /account UI (hide the Password section for OAuth-only
// users) and the delete-account modal (hide the password input).
// Per-user query — keyed by session refetch invalidation rather than
// time, since linking a new provider should reflect immediately.
export const useAccountMethods = () =>
  useQuery({
    queryKey: ['account', 'methods'] as const,
    queryFn: () => api('/api/account/methods', methodsSchema),
    staleTime: 60_000
  })

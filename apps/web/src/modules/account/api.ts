import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'

const deleteResponseSchema = z.object({ status: z.literal('ok') })

export interface DeleteAccountInput {
  password: string
}

export const useDeleteAccount = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      api('/api/account/delete', deleteResponseSchema, { method: 'POST', body: input }),
    // After a successful delete the session row is gone server-side, so
    // every cached query (session, access-state, …) is stale. Clear the
    // cache and let the route boot fresh against /login.
    onSuccess: () => queryClient.clear()
  })
}

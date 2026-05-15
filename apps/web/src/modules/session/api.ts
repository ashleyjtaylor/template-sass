import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { sessionSchema } from './schemas'

const SESSION_KEY = ['session'] as const

export const useSession = () => {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api('/api/auth/get-session', sessionSchema),
    staleTime: 60_000,
    refetchOnWindowFocus: true
  })

  return {
    session: query.data ?? null,
    user: query.data?.user ?? null,
    isAuthed: Boolean(query.data),
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error
  }
}

const invalidateAfterAuth = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: SESSION_KEY }),
    qc.invalidateQueries({ queryKey: ['access-state'] })
  ])

export interface SignInInput {
  email: string
  password: string
}

export const useSignIn = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SignInInput) =>
      api('/api/auth/sign-in/email', z.unknown(), { method: 'POST', body: input }),
    onSuccess: () => invalidateAfterAuth(queryClient)
  })
}

export interface SignUpInput {
  email: string
  password: string
  firstname: string
  lastname: string
}

export const useSignUp = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SignUpInput) =>
      api('/api/auth/sign-up/email', z.unknown(), {
        method: 'POST',
        body: { ...input, name: `${input.firstname} ${input.lastname}`.trim() }
      }),
    onSuccess: () => invalidateAfterAuth(queryClient)
  })
}

export const useSignOut = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api('/api/auth/sign-out', z.unknown(), { method: 'POST', body: {} }),
    onSettled: () => queryClient.clear()
  })
}

export interface ForgotPasswordInput {
  email: string
}

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      api('/api/auth/request-password-reset', z.unknown(), {
        method: 'POST',
        // The full origin is required — better-auth's `originCheck`
        // middleware compares it against `trustedOrigins` (CORS_ORIGINS).
        // It also becomes the SPA URL the API redirects to after the
        // /reset-password/<token> callback validates the token.
        body: { email: input.email, redirectTo: `${window.location.origin}/reset-password` }
      })
  })

export interface ResetPasswordInput {
  token: string
  newPassword: string
}

export const useResetPassword = () =>
  useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      api('/api/auth/reset-password', z.unknown(), {
        method: 'POST',
        body: { token: input.token, newPassword: input.newPassword }
      })
  })

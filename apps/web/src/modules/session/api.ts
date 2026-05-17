import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { setLastAuthMethod } from '@/lib/last-auth-method'
import { activeSessionsSchema, sessionSchema } from './schemas'

const SESSION_KEY = ['session'] as const
const ACTIVE_SESSIONS_KEY = ['session', 'list'] as const

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
    onSuccess: () => {
      setLastAuthMethod('email')
      return invalidateAfterAuth(queryClient)
    }
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
        // callbackURL is the post-verify redirect target embedded in the
        // verification email better-auth sends from this signup. Without
        // it the link redirects to better-auth's own baseURL (the API
        // origin) — landing the user on :3000 instead of the SPA.
        body: {
          ...input,
          name: `${input.firstname} ${input.lastname}`.trim(),
          callbackURL: `${window.location.origin}/dashboard?verified=1`
        }
      }),
    onSuccess: () => {
      setLastAuthMethod('email')
      return invalidateAfterAuth(queryClient)
    }
  })
}

export interface UpdateProfileInput {
  firstname: string
  lastname: string
}

// Updates name on the User row via better-auth's /update-user route.
// firstname/lastname are declared as input-true additionalFields in
// apps/api/src/lib/auth.ts so they survive the Prisma adapter strip;
// the api-side databaseHooks.user.update.before then recomposes the
// derived `name` from the pair. On success we invalidate ['session']
// so the nav/header reflects the new name immediately.
export const useUpdateProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api('/api/auth/update-user', z.unknown(), { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY })
  })
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

// In-place password change via better-auth's /change-password route.
// `revokeOtherSessions: true` matches the reset-password posture
// (revokeSessionsOnPasswordReset in lib/auth.ts) — a successful
// change evicts every other device. Current device keeps its
// session; we still invalidate the session query so any cached
// metadata refreshes.
export const useChangePassword = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api('/api/auth/change-password', z.unknown(), {
        method: 'POST',
        body: { ...input, revokeOtherSessions: true }
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY })
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

export interface ResendVerificationInput {
  email: string
}

export const useResendVerification = () =>
  useMutation({
    mutationFn: (input: ResendVerificationInput) =>
      api('/api/auth/send-verification-email', z.unknown(), {
        method: 'POST',
        // callbackURL is where better-auth redirects after the GET
        // /verify-email handler flips emailVerified=true. The ?verified=1
        // search param is read by /dashboard (and /login, in the
        // signed-out clicker case) to fire a success toast.
        body: { email: input.email, callbackURL: `${window.location.origin}/dashboard?verified=1` }
      })
  })

const providersSchema = z.object({ google: z.boolean() })

// Lists the auth providers the API can serve. The SPA renders the
// Google button conditionally on `data?.google === true`. Cached
// aggressively — this is effectively static config that only changes
// on a deploy.
export const useAuthProviders = () =>
  useQuery({
    queryKey: ['auth', 'providers'] as const,
    queryFn: () => api('/api/auth/providers', providersSchema),
    staleTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })

export interface SignInWithGoogleInput {
  callbackURL: string
  errorCallbackURL: string
}

const socialSignInResponse = z.object({
  url: z.string().url().optional(),
  redirect: z.boolean().optional()
})

// Kicks off the OAuth handshake. better-auth returns a `url` to
// Google's consent screen; the caller hard-navigates to it. We do NOT
// set the last-used marker here — clicking the button doesn't mean
// the user actually completes OAuth. Instead, the caller appends
// `?from=google` to the callbackURL so /dashboard can set the marker
// only on the successful-return path.
export const useSignInWithGoogle = () =>
  useMutation({
    mutationFn: async (input: SignInWithGoogleInput) => {
      const result = await api('/api/auth/sign-in/social', socialSignInResponse, {
        method: 'POST',
        body: {
          provider: 'google',
          callbackURL: input.callbackURL,
          errorCallbackURL: input.errorCallbackURL
        }
      })
      if (result.url) {
        window.location.href = result.url
      }
      return result
    }
  })

// Active sessions for the signed-in user. Better-auth's /list-sessions
// returns every non-expired Session row (one per device). The /account
// Security tab matches the current session by entityId so 'this device'
// can be flagged without an extra fetch.
export const useActiveSessions = () =>
  useQuery({
    queryKey: ACTIVE_SESSIONS_KEY,
    queryFn: () => api('/api/auth/list-sessions', activeSessionsSchema),
    staleTime: 30_000,
    refetchOnWindowFocus: true
  })

export const useRevokeSession = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (token: string) =>
      api('/api/auth/revoke-session', z.unknown(), { method: 'POST', body: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACTIVE_SESSIONS_KEY })
  })
}

export const useRevokeOtherSessions = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      api('/api/auth/revoke-other-sessions', z.unknown(), { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACTIVE_SESSIONS_KEY })
  })
}

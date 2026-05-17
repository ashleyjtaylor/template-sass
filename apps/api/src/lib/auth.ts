import { prisma } from '@template-sass/db'
import { isMailerConfigured, sendEmailVerification, sendPasswordReset } from '@template-sass/mailer'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { env, isGoogleConfigured } from '@/env.js'
import { getRequestId, logger } from '@/lib/logger.js'

const entityId = (prefix: string) => () => `${prefix}${crypto.randomUUID()}`

// Additional fields beyond better-auth's built-in schema. The Prisma adapter
// strips fields not declared here before insert, so `entityId` must be
// registered via additionalFields (with `input: false` so it can't be set
// by callers).
const sharedEntityIdField = (prefix: string) => ({
  type: 'string' as const,
  required: true,
  input: false,
  defaultValue: entityId(prefix)
})

// Captures the X-Request-Id of the HTTP request that created the row, read
// from the AsyncLocalStorage context seeded by middleware/request-id.ts.
const sharedRequestIdField = {
  type: 'string' as const,
  required: false,
  input: false,
  defaultValue: () => getRequestId() ?? null
}

type UserCreatePayload = { name?: string | null; firstname?: string; lastname?: string }

// Prefix better-auth uses for password-reset Verification rows
// (`reset-password:<token>`). Used to scope our per-email rate limit and
// prior-token cleanup. Verified by reading better-auth's password.mjs.
const RESET_IDENTIFIER_PREFIX = 'reset-password:'
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RESET_RATE_LIMIT_MAX_PER_EMAIL = 3
const RESET_TOKEN_TTL_SECONDS = 60 * 60

// Prefix better-auth uses for email-verification Verification rows
// (`email-verification:<token>`). Scopes per-email rate limit and
// prior-token cleanup, mirroring the reset-password convention.
const VERIFICATION_IDENTIFIER_PREFIX = 'email-verification:'
const VERIFICATION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const VERIFICATION_RATE_LIMIT_MAX_PER_EMAIL = 3
// 24h, not 1h like reset: verification links are commonly opened from a
// different device than the one used to sign up, with arbitrary delay.
const VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60 * 24

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: env.CORS_ORIGINS,
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
    // Reset is unauthenticated, so there is no "current device" to spare —
    // wiping all sessions on success means any stolen sessions on other
    // devices are evicted. The resetting user signs in fresh on /login
    // afterward (frontend redirects there with a success toast).
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // The mailer not being configured (e.g. fresh fork with no MAIL_FROM)
      // shouldn't crash the request — the frontend response stays a generic
      // 200, so we'd just be leaking misconfiguration. Log and move on.
      if (!isMailerConfigured()) {
        logger.warn(
          { userId: user.id, email: user.email },
          'sendResetPassword called but mailer is not configured (MAIL_FROM empty) — skipping email send'
        )
        return
      }

      try {
        await sendPasswordReset({
          to: user.email,
          firstname: (user as { firstname?: string }).firstname,
          resetUrl: url
        })
      } catch (err) {
        // Same enumeration-avoidance reasoning: never let mailer errors
        // surface to the caller. Log loudly so ops sees it.
        logger.error({ err, userId: user.id }, 'Failed to send password-reset email')
      }
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
    sendVerificationEmail: async ({ user, url }) => {
      if (!isMailerConfigured()) {
        logger.warn(
          { userId: user.id, email: user.email },
          'sendVerificationEmail called but mailer is not configured (MAIL_FROM empty) — skipping email send'
        )
        return
      }

      try {
        await sendEmailVerification({
          to: user.email,
          firstname: (user as { firstname?: string }).firstname,
          verifyUrl: url
        })
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to send email-verification email')
      }
    }
  },
  // Google OAuth — only registered when both credentials are populated.
  // Fresh forks without Google creds boot cleanly; the providers
  // endpoint reports `google: false` and the SPA hides the button.
  // `mapProfileToUser` populates our additional firstname/lastname
  // fields from Google's given_name/family_name, plus the existing
  // User.image column from the profile picture.
  ...(isGoogleConfigured()
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            mapProfileToUser: (profile: {
              given_name?: string
              family_name?: string
              picture?: string
            }) => ({
              firstname: profile.given_name ?? '',
              lastname: profile.family_name ?? '',
              // Spread the optional `image` key only when Google supplied
              // one. Under exactOptionalPropertyTypes, returning
              // `image: undefined` is not the same as omitting the key.
              ...(profile.picture ? { image: profile.picture } : {})
            })
          }
        }
      }
    : {}),
  // Per-IP global rate limit on /request-password-reset (memory-backed,
  // fine for a single API task). Per-email throttling is enforced in
  // the `before` hook below.
  //
  // Disabled outside production: better-auth's defaults are aggressive
  // (sign-up/sign-in: max 3 per 10s per IP) and hit local dev + e2e
  // suite hard since everything originates from 127.0.0.1. Production
  // reinstates them — abuse pressure is real there.
  rateLimit: {
    enabled: env.NODE_ENV === 'production',
    storage: 'memory',
    customRules: {
      '/request-password-reset': { window: 3600, max: 10 },
      '/send-verification-email': { window: 3600, max: 10 }
    }
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/request-password-reset') {
        const body = ctx.body as { email?: string } | undefined
        const email = body?.email?.toLowerCase()

        if (!email) return

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            accounts: {
              where: { providerId: 'credential' },
              select: { id: true },
              take: 1
            }
          }
        })

        // No user → don't run cleanup or rate-limit. better-auth's normal
        // flow handles the unknown-email case as a silent 200.
        if (!user) return

        // OAuth-only user (no credential Account row). better-auth's
        // downstream resetPassword would silently create a credential
        // Account on token-redeem, giving the user a password they
        // never asked for. Short-circuit with a silent 200 instead —
        // same shape as the unknown-email path, preserving anti-
        // enumeration.
        if (user.accounts.length === 0) {
          return { status: true }
        }

        // Per-email rate limit: max 3 reset requests per user per hour.
        // Counts Verification rows created in the window — these get deleted
        // immediately below, so the count effectively measures "attempts that
        // have not yet been superseded by the next attempt." A request that
        // succeeded the rate-limit check writes a new Verification row; the
        // count one second later sees 1 row, which is correct.
        const since = new Date(Date.now() - RESET_RATE_LIMIT_WINDOW_MS)
        const recent = await prisma.verification.count({
          where: {
            identifier: { startsWith: RESET_IDENTIFIER_PREFIX },
            value: user.id,
            createdAt: { gte: since }
          }
        })

        if (recent >= RESET_RATE_LIMIT_MAX_PER_EMAIL) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: 'Too many reset requests. Try again later.'
          })
        }

        // Invalidate prior reset tokens for this user so only the most recent
        // email's link works. Cleans up the active-token surface.
        await prisma.verification.deleteMany({
          where: {
            identifier: { startsWith: RESET_IDENTIFIER_PREFIX },
            value: user.id
          }
        })
        return
      }

      if (ctx.path === '/send-verification-email') {
        // Authenticated-only resend: only a signed-in user can request a
        // (re)send of their own verification link. Stops the endpoint
        // being used to probe whether an arbitrary email exists.
        const sessionResult = await getSessionFromCtx(ctx)
        if (!sessionResult) {
          throw new APIError('UNAUTHORIZED', {
            message: 'Authentication required'
          })
        }
        const sessionUser = sessionResult.user as {
          id: string
          email: string
          emailVerified: boolean
        }

        const body = ctx.body as { email?: string } | undefined
        const bodyEmail = body?.email?.toLowerCase()

        // Body email mismatch is treated as 401 (vs better-auth's downstream
        // BAD_REQUEST EMAIL_MISMATCH). Matches password-reset's no-leak
        // posture: a signed-in caller probing other accounts via this
        // endpoint gets the same response as an unauthenticated caller.
        if (bodyEmail && bodyEmail !== sessionUser.email.toLowerCase()) {
          throw new APIError('UNAUTHORIZED', {
            message: 'Authentication required'
          })
        }

        // Idempotent: already-verified resend gets a silent 200. Returning
        // a plain object from this `before` hook short-circuits the
        // endpoint chain with that body — see runBeforeHooks in
        // better-auth's to-auth-endpoints.mjs. Saves a token write + email
        // send, and avoids better-auth's downstream EMAIL_ALREADY_VERIFIED
        // 400 which would surface as a confusing error toast in the rare
        // race where the user verifies in another tab.
        if (sessionUser.emailVerified) {
          return { status: true }
        }

        // Per-email rate limit: same shape as the reset-password branch.
        const since = new Date(Date.now() - VERIFICATION_RATE_LIMIT_WINDOW_MS)
        const recent = await prisma.verification.count({
          where: {
            identifier: { startsWith: VERIFICATION_IDENTIFIER_PREFIX },
            value: sessionUser.id,
            createdAt: { gte: since }
          }
        })

        if (recent >= VERIFICATION_RATE_LIMIT_MAX_PER_EMAIL) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: 'Too many verification requests. Try again later.'
          })
        }

        // Invalidate prior verification tokens so only the latest link works.
        await prisma.verification.deleteMany({
          where: {
            identifier: { startsWith: VERIFICATION_IDENTIFIER_PREFIX },
            value: sessionUser.id
          }
        })
        return
      }
    })
  },
  user: {
    additionalFields: {
      firstname: { type: 'string', required: true, input: true },
      lastname: { type: 'string', required: true, input: true },
      entityId: sharedEntityIdField('usr_'),
      requestId: sharedRequestIdField
    }
  },
  session: {
    additionalFields: {
      entityId: sharedEntityIdField('sess_'),
      requestId: sharedRequestIdField
    }
  },
  account: {
    additionalFields: {
      entityId: sharedEntityIdField('acct_'),
      requestId: sharedRequestIdField
    },
    // Auto-link a new Google sign-in to an existing email+password user
    // when the email matches. Google is trusted because they already
    // verified the email — accepting their verification means no
    // duplicate User rows on the same email and no enumeration error
    // when an existing email signs in with Google the first time.
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      // Backfill the User row with values from Google's userinfo when an
      // existing email+password user links Google for the first time.
      // Picks up name / image so a previously-unset avatar shows up
      // after the link without the user having to edit anything.
      updateUserInfoOnLink: true
    }
  },
  verification: {
    additionalFields: {
      entityId: sharedEntityIdField('veri_'),
      requestId: sharedRequestIdField
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const { name, firstname, lastname } = user as UserCreatePayload
          if (name) return undefined
          return {
            data: {
              ...user,
              name: `${firstname ?? ''} ${lastname ?? ''}`.trim()
            }
          }
        }
      }
    }
  }
})

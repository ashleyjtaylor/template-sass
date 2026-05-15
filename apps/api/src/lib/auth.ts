import { prisma } from '@template/db'
import { isMailerConfigured, sendPasswordReset } from '@template/mailer'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { env } from '@/env.js'
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
  // Per-IP global rate limit on /request-password-reset (memory-backed,
  // fine for a single API task). Per-email throttling is enforced in
  // the `before` hook below.
  rateLimit: {
    enabled: true,
    storage: 'memory',
    customRules: {
      '/request-password-reset': { window: 3600, max: 10 }
    }
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/request-password-reset') return

      const body = ctx.body as { email?: string } | undefined
      const email = body?.email?.toLowerCase()

      if (!email) return

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
      })

      // No user → don't run cleanup or rate-limit. better-auth's normal
      // flow handles the unknown-email case as a silent 200.
      if (!user) return

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

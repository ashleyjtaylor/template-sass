import { prisma } from '@template/db'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { env } from '@/env.js'
import { getRequestId } from '@/lib/logger.js'

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

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: env.CORS_ORIGINS,
  emailAndPassword: {
    enabled: true
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

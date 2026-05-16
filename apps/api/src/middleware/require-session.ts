import { UnauthorizedError } from '@template-sass/errors'
import { createMiddleware } from 'hono/factory'
import { auth } from '@/lib/auth.js'

// `userId` is better-auth's internal `user.id` (used as FK on Subscription);
// `userEntityId` is the public `usr_<uuid>` used in webhook metadata and
// API responses.
export interface AuthSession {
  userId: string
  userEntityId: string
  email: string
}

export const getAuthSession = async (headers: Headers): Promise<AuthSession> => {
  const result = await auth.api.getSession({ headers })

  if (!result) throw new UnauthorizedError('Authentication required')

  const user = result.user as { id: string; entityId: string; email: string }

  return { userId: user.id, userEntityId: user.entityId, email: user.email }
}

export const requireSession = createMiddleware<{ Variables: { authSession: AuthSession } }>(
  async (c, next) => {
    const session = await getAuthSession(c.req.raw.headers)

    c.set('authSession', session)

    await next()
  }
)

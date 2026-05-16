import { ValidationError } from '@template-sass/errors'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireSession } from '@/middleware/require-session.js'
import { deleteAccountController } from './controllers.js'

const deleteBody = z.object({
  password: z.string().min(1)
})

export const accountRoutes = new Hono()

// Hard-deletes the authenticated user. Verifies the current password
// inline so a stolen session cookie can't unilaterally nuke the account.
// The session row cascades on user delete, so the SPA's next session
// fetch returns null and AuthGate kicks the user to /login.
accountRoutes.post('/delete', requireSession, async (c) => {
  const parsed = deleteBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    throw new ValidationError('Password is required', { reason: 'MissingPassword' })
  }

  const result = await deleteAccountController({
    password: parsed.data.password,
    authSession: c.get('authSession')
  })

  return c.json(result)
})

import { Hono } from 'hono'
import { z } from 'zod'
import { requireSession } from '@/middleware/require-session.js'
import { deleteAccountController, getAccountMethodsController } from './controllers.js'

// Password is optional so OAuth-only users (no credential Account row)
// can delete via the session cookie alone. The service layer enforces
// that a credential user MUST send a password — never trusts the empty
// body to bypass auth.
const deleteBody = z.object({
  password: z.string().min(1).optional()
})

export const accountRoutes = new Hono()

// Hard-deletes the authenticated user. Email+password users must send
// their current password (so a stolen session cookie can't unilaterally
// nuke the account). OAuth-only users — who have no password to verify
// against — are accepted on session alone, since the SPA can't ask for
// what doesn't exist. The session row cascades on user delete, so the
// SPA's next session fetch returns null and AuthGate kicks to /login.
accountRoutes.post('/delete', requireSession, async (c) => {
  const parsed = deleteBody.safeParse(await c.req.json().catch(() => ({})))

  const result = await deleteAccountController({
    password: parsed.success ? parsed.data.password : undefined,
    authSession: c.get('authSession')
  })

  return c.json(result)
})

// Reports which sign-in methods the authenticated user has on file.
// SPA reads this to (a) hide the Password section on /account for
// OAuth-only users and (b) hide the password input in the delete
// confirmation modal.
accountRoutes.get('/methods', requireSession, async (c) => {
  const result = await getAccountMethodsController(c.get('authSession'))

  return c.json(result)
})

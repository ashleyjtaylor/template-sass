import { Hono } from 'hono'
import { z } from 'zod'
import { requireSession } from '@/middleware/require-session.js'
import {
  createCheckoutSessionController,
  createPortalSessionController,
  getAccessStateController
} from './controllers.js'

const checkoutBody = z.object({
  plan: z.string().min(1)
})

export const billingRoutes = new Hono()

billingRoutes.post('/checkout-session', requireSession, async (c) => {
  const parsed = checkoutBody.safeParse(await c.req.json().catch(() => ({})))
  const plan = parsed.success ? parsed.data.plan : 'pro'

  const result = await createCheckoutSessionController({
    plan,
    authSession: c.get('authSession')
  })

  return c.json(result)
})

billingRoutes.post('/portal-session', requireSession, async (c) => {
  const result = await createPortalSessionController(c.get('authSession'))

  return c.json(result)
})

billingRoutes.get('/access-state', requireSession, async (c) => {
  const result = await getAccessStateController(c.get('authSession'))

  return c.json(result)
})

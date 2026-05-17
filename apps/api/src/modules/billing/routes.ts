import { Hono } from 'hono'
import { z } from 'zod'
import { requireSession } from '@/middleware/require-session.js'
import {
  changePlanController,
  createCheckoutSessionController,
  createPortalSessionController,
  getAccessStateController,
  previewPlanChangeController
} from './controllers.js'

const checkoutBody = z.object({
  plan: z.string().min(1)
})

const previewPlanChangeBody = z.object({
  plan: z.string().min(1)
})

const changePlanBody = z.object({
  plan: z.string().min(1),
  // Pass through the value returned by /change-plan/preview so the
  // actual charge matches what the user was shown. Optional — Stripe
  // recomputes against `now()` if omitted (small drift in pennies).
  prorationDateUnix: z.number().int().positive().optional()
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

billingRoutes.post('/change-plan/preview', requireSession, async (c) => {
  const parsed = previewPlanChangeBody.safeParse(await c.req.json().catch(() => ({})))

  if (!parsed.success) {
    return c.json({ code: 'ValidationError', message: 'Invalid request body' }, 400)
  }

  const result = await previewPlanChangeController({
    plan: parsed.data.plan,
    authSession: c.get('authSession')
  })

  return c.json(result)
})

billingRoutes.post('/change-plan', requireSession, async (c) => {
  const parsed = changePlanBody.safeParse(await c.req.json().catch(() => ({})))

  if (!parsed.success) {
    return c.json({ code: 'ValidationError', message: 'Invalid request body' }, 400)
  }

  const result = await changePlanController({
    plan: parsed.data.plan,
    ...(parsed.data.prorationDateUnix !== undefined && {
      prorationDateUnix: parsed.data.prorationDateUnix
    }),
    authSession: c.get('authSession')
  })

  return c.json(result)
})

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { env } from '@/env.js'
import { auth } from '@/lib/auth.js'
import { errorHandler } from '@/middleware/error-handler.js'
import { healthReady } from '@/middleware/health-ready.js'
import { requestId } from '@/middleware/request-id.js'
import { requestLogger } from '@/middleware/request-logger.js'
import { accountRoutes } from '@/modules/account/routes.js'
import { authRoutes } from '@/modules/auth/routes.js'
import { billingRoutes } from '@/modules/billing/routes.js'
import { stripeWebhookRoutes } from '@/modules/webhooks/stripe.js'

export interface AppOptions {
  gitSha: string
  appEnv: 'local' | 'staging' | 'production'
  corsOrigins?: string[]
  bodyLimitBytes?: number
}

export function createApp({
  gitSha,
  appEnv,
  corsOrigins = env.CORS_ORIGINS,
  bodyLimitBytes = env.BODY_LIMIT_BYTES
}: AppOptions) {
  const startedAt = Date.now()
  const app = new Hono()

  app.use('*', requestId())
  app.use('*', requestLogger())
  app.use('*', secureHeaders())
  app.use('*', cors({ origin: corsOrigins, credentials: true }))
  app.use('*', bodyLimit({ maxSize: bodyLimitBytes }))
  app.use('*', trimTrailingSlash())

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      version: gitSha,
      env: appEnv,
      uptime: Math.floor((Date.now() - startedAt) / 1000)
    })
  )

  app.get('/health/ready', healthReady)

  // Mount auth metadata routes BEFORE the better-auth wildcard so
  // /api/auth/providers (and any future SPA-facing helpers) aren't
  // swallowed by better-auth's catch-all 404.
  app.route('/api/auth', authRoutes)
  app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
    const res = await auth.handler(c.req.raw)
    if (res.status !== 429) return res

    // Better-auth's 429 body is `{ message }` only — no `code`. Our SPA's
    // ApiError expects `{ code, message, details? }`. Without `code` the
    // SPA renders the unhelpful fallback "HTTP 429". Inject the missing
    // field so a rate-limit 429 surfaces with the same envelope and toast
    // copy as the rest of the API.
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || 'code' in body) return res

    return new Response(JSON.stringify({ code: 'TOO_MANY_REQUESTS', ...body }), {
      status: 429,
      headers: res.headers
    })
  })

  app.route('/api/account', accountRoutes)
  app.route('/api/billing', billingRoutes)
  app.route('/api/webhooks', stripeWebhookRoutes)

  app.onError(errorHandler)

  return app
}

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

  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  app.route('/api/account', accountRoutes)
  app.route('/api/billing', billingRoutes)
  app.route('/api/webhooks', stripeWebhookRoutes)

  app.onError(errorHandler)

  return app
}

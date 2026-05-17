import { Hono } from 'hono'
import { isGoogleConfigured } from '@/env.js'

// Routes for SPA-facing auth metadata that live OUTSIDE better-auth's
// own handler. Mounted before the `/api/auth/*` wildcard in app.ts so
// these win over better-auth's fall-through.

export const authRoutes = new Hono()

// Reports which auth providers the API can serve. The SPA reads this
// to decide whether to render the Google sign-in button. Source of
// truth lives in env (see isGoogleConfigured in env.ts).
authRoutes.get('/providers', (c) => c.json({ google: isGoogleConfigured() }))

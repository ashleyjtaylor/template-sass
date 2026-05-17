import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The route reads `isGoogleConfigured` at request time. Mocking the
// module import path lets each test toggle the answer without
// rebuilding the Hono app or rewriting process.env (which env.ts
// captures at module load).

describe('GET /api/auth/providers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@/env.js')
  })

  it('reports google: false when Google credentials are not configured', async () => {
    vi.doMock('@/env.js', async () => {
      const actual = await vi.importActual<typeof import('@/env.js')>('@/env.js')
      return { ...actual, isGoogleConfigured: () => false }
    })

    const { authRoutes } = await import('@/modules/auth/routes.js')
    const res = await authRoutes.request('/providers')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ google: false })
  })

  it('reports google: true when both credentials are populated', async () => {
    vi.doMock('@/env.js', async () => {
      const actual = await vi.importActual<typeof import('@/env.js')>('@/env.js')
      return { ...actual, isGoogleConfigured: () => true }
    })

    const { authRoutes } = await import('@/modules/auth/routes.js')
    const res = await authRoutes.request('/providers')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ google: true })
  })
})

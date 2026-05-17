import { NotFoundError } from '@template-sass/errors'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '@/app.js'
import { logger } from '@/lib/logger.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /health', () => {
  it('should return 200 with status, the configured version, the env, and a numeric uptime', async () => {
    const app = createApp({ gitSha: 'test-sha', appEnv: 'local' })

    const res = await app.request('/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'ok',
      version: 'test-sha',
      env: 'local',
      uptime: expect.any(Number)
    })
  })

  it('should echo whatever gitSha the factory is given', async () => {
    const app = createApp({ gitSha: 'unknown', appEnv: 'local' })

    const res = await app.request('/health')
    const body = (await res.json()) as { version: string }

    expect(body.version).toBe('unknown')
  })

  it('should echo whatever appEnv the factory is given', async () => {
    const app = createApp({ gitSha: 'test-sha', appEnv: 'staging' })

    const res = await app.request('/health')
    const body = (await res.json()) as { env: string }

    expect(body.env).toBe('staging')
  })
})

describe('error handling', () => {
  it('should format HttpError subclasses with the right status and code', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local' })
    app.get('/test/not-found', () => {
      throw new NotFoundError('user missing')
    })

    const res = await app.request('/test/not-found')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      code: 'NotFoundError',
      message: 'user missing'
    })
  })

  it('should scrub unhandled error messages and return 500', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local' })
    app.get('/test/boom', () => {
      throw new Error('secret database url leak')
    })
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger)

    const res = await app.request('/test/boom')

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      code: 'InternalError',
      message: 'Internal server error'
    })
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('request id', () => {
  it('should set X-Request-Id with a req_ prefix on every response', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local' })

    const res = await app.request('/health')
    const id = res.headers.get('x-request-id')

    expect(id).toMatch(/^req_[0-9a-f-]{36}$/i)
  })
})

describe('security headers', () => {
  it('should set sane defaults on every response', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local' })

    const res = await app.request('/health')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBeTruthy()
  })
})

describe('cors', () => {
  it('should allow preflight from a configured origin', async () => {
    const app = createApp({
      gitSha: 'test',
      appEnv: 'local',
      corsOrigins: ['https://app.example.com']
    })

    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.com',
        'Access-Control-Request-Method': 'GET'
      }
    })

    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
  })

  it('should omit CORS headers from disallowed origins', async () => {
    const app = createApp({
      gitSha: 'test',
      appEnv: 'local',
      corsOrigins: ['https://app.example.com']
    })

    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'GET'
      }
    })

    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('body limit', () => {
  it('should reject oversized bodies with 413', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local', bodyLimitBytes: 100 })
    app.post('/test/echo', (c) => c.json({ ok: true }))

    const body = 'x'.repeat(200)
    const res = await app.request('/test/echo', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': String(body.length)
      }
    })

    expect(res.status).toBe(413)
    const json = (await res.json()) as { code: string }
    expect(json.code).toBe('PayloadTooLarge')
  })
})

describe('better-auth 429 envelope wrapper', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@/lib/auth.js')
  })

  // Helper: rebuild createApp with a stubbed better-auth handler so the
  // wrapper can be exercised in isolation. Each case supplies the
  // Response that the stubbed auth.handler returns.
  const appWithStubbedAuth = async (stub: () => Response | Promise<Response>) => {
    vi.resetModules()
    vi.doMock('@/lib/auth.js', () => ({
      auth: { handler: vi.fn(stub) }
    }))
    const { createApp: createAppFresh } = await import('@/app.js')
    return createAppFresh({ gitSha: 'test', appEnv: 'local' })
  }

  it('injects a TOO_MANY_REQUESTS code on a 429 body that only has a message', async () => {
    const app = await appWithStubbedAuth(
      () =>
        new Response(JSON.stringify({ message: 'Too many requests. Please try again later.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'X-Retry-After': '60' }
        })
    )

    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5174', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'x' })
    })

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again later.'
    })
  })

  it('passes through a 429 that already carries a code untouched', async () => {
    const app = await appWithStubbedAuth(
      () =>
        new Response(
          JSON.stringify({ code: 'CUSTOM_LIMIT', message: 'Too many sign-in attempts.' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
    )

    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5174', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'x' })
    })

    expect(await res.json()).toEqual({
      code: 'CUSTOM_LIMIT',
      message: 'Too many sign-in attempts.'
    })
  })

  it('does not touch non-429 responses', async () => {
    const app = await appWithStubbedAuth(
      () =>
        new Response(JSON.stringify({ user: { id: 'u_1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
    )

    const res = await app.request('/api/auth/get-session', {
      headers: { Origin: 'http://localhost:5174' }
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: { id: 'u_1' } })
  })
})

describe('request logger', () => {
  it('should not log /health requests', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local' })
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger)

    await app.request('/health')

    const requestCalls = infoSpy.mock.calls.filter((args) => args[1] === 'request')
    expect(requestCalls).toHaveLength(0)
  })

  it('should log non-/health requests with method, path, status, and duration', async () => {
    const app = createApp({ gitSha: 'test', appEnv: 'local' })
    app.get('/test/anything', (c) => c.json({}))
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger)

    await app.request('/test/anything')

    const requestLog = infoSpy.mock.calls.find((args) => args[1] === 'request')
    expect(requestLog).toBeDefined()
    expect(requestLog?.[0]).toMatchObject({
      method: 'GET',
      path: '/test/anything',
      status: 200,
      durationMs: expect.any(Number)
    })
  })
})

import { type APIRequestContext, type BrowserContext, request } from '@playwright/test'

const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3000'
const WEB_URL = process.env['E2E_WEB_URL'] ?? 'http://localhost:5174'

export interface NewUser {
  email: string
  password: string
  firstname: string
  lastname: string
}

// Generates a unique-per-test user so concurrent runs (and accidental
// state leakage between tests) don't collide on the User.email unique.
export function makeUser(overrides: Partial<NewUser> = {}): NewUser {
  const id = crypto.randomUUID().slice(0, 8)

  return {
    email: `e2e-${id}@example.com`,
    password: 'CorrectHorseBattery9!',
    firstname: 'Test',
    lastname: 'User',
    ...overrides
  }
}

// Programmatic signup that bypasses the SPA — used by tests that need a
// pre-existing authed user as a starting point. Returns both the user
// and a fresh storageState the caller can pass to browser.newContext().
//
// We hit the same /api/auth/sign-up/email better-auth uses; the response
// Set-Cookie carries the session cookie, which we transfer onto the
// returned BrowserContext (or storageState) so subsequent navigation is
// already authed.
export async function signUpProgrammatic(user: NewUser): Promise<{
  user: NewUser
  storageState: Awaited<ReturnType<APIRequestContext['storageState']>>
}> {
  const ctx = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Origin: WEB_URL }
  })

  const res = await ctx.post('/api/auth/sign-up/email', {
    data: {
      email: user.email,
      password: user.password,
      firstname: user.firstname,
      lastname: user.lastname,
      name: `${user.firstname} ${user.lastname}`,
      // Mirrors useSignUp's body in apps/web — without this the
      // verification email's link would redirect to the API origin
      // after verification instead of the SPA's /dashboard.
      callbackURL: `${WEB_URL}/dashboard?verified=1`
    }
  })

  if (!res.ok()) {
    throw new Error(`signUpProgrammatic failed: ${res.status()} ${await res.text()}`)
  }

  const storageState = await ctx.storageState()
  await ctx.dispose()

  return { user, storageState }
}

// Attaches the signup-captured storageState to an existing
// BrowserContext. Use this in tests that opened their own context with
// `browser.newContext()` and now want to make it authed.
export async function applyStorageState(
  context: BrowserContext,
  storageState: Awaited<ReturnType<APIRequestContext['storageState']>>
): Promise<void> {
  await context.addCookies(storageState.cookies)
}

import * as mailer from '@template-sass/mailer'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

// The shape we pass to sendResetPassword in tests. We don't construct a
// full better-auth User (createdAt/updatedAt/emailVerified/name/etc.);
// the callback only reads `email` and our `firstname` additional field,
// so a structural cast through `unknown` is honest.
type FakeUser = { id: string; email: string; firstname?: string }

describe('better-auth sendResetPassword wiring', () => {
  it('forwards the user email, firstname, and reset URL to the mailer', async () => {
    const sendSpy = vi.spyOn(mailer, 'sendPasswordReset').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true)

    const { auth } = await import('@/lib/auth.js')
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword

    expect(sendResetPassword).toBeDefined()

    const fakeUser: FakeUser = { id: 'user-123', email: 'sam@example.com', firstname: 'Sam' }

    await sendResetPassword?.({
      user: fakeUser as unknown as Parameters<NonNullable<typeof sendResetPassword>>[0]['user'],
      url: 'http://localhost:3000/api/auth/reset-password/abc?callbackURL=foo',
      token: 'abc'
    })

    expect(sendSpy).toHaveBeenCalledWith({
      to: 'sam@example.com',
      firstname: 'Sam',
      resetUrl: 'http://localhost:3000/api/auth/reset-password/abc?callbackURL=foo'
    })
  })

  it('skips sending and logs when MAIL_FROM is unset (mailer not configured)', async () => {
    const sendSpy = vi.spyOn(mailer, 'sendPasswordReset').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(false)

    const { auth } = await import('@/lib/auth.js')
    const sendResetPassword = auth.options.emailAndPassword?.sendResetPassword

    const fakeUser: FakeUser = { id: 'user-123', email: 'sam@example.com' }

    await sendResetPassword?.({
      user: fakeUser as unknown as Parameters<NonNullable<typeof sendResetPassword>>[0]['user'],
      url: 'http://localhost:3000/api/auth/reset-password/abc',
      token: 'abc'
    })

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('configures a 1-hour reset token TTL and revokes sessions on reset', async () => {
    const { auth } = await import('@/lib/auth.js')

    expect(auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(60 * 60)
    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true)
  })
})

describe('better-auth sendVerificationEmail wiring', () => {
  it('forwards the user email, firstname, and verify URL to the mailer', async () => {
    const sendSpy = vi.spyOn(mailer, 'sendEmailVerification').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true)

    const { auth } = await import('@/lib/auth.js')
    const sendVerificationEmail = auth.options.emailVerification?.sendVerificationEmail

    expect(sendVerificationEmail).toBeDefined()

    const fakeUser: FakeUser = { id: 'user-123', email: 'sam@example.com', firstname: 'Sam' }

    await sendVerificationEmail?.({
      user: fakeUser as unknown as Parameters<NonNullable<typeof sendVerificationEmail>>[0]['user'],
      url: 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=foo',
      token: 'abc'
    })

    expect(sendSpy).toHaveBeenCalledWith({
      to: 'sam@example.com',
      firstname: 'Sam',
      verifyUrl: 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=foo'
    })
  })

  it('skips sending and logs when MAIL_FROM is unset (mailer not configured)', async () => {
    const sendSpy = vi.spyOn(mailer, 'sendEmailVerification').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(false)

    const { auth } = await import('@/lib/auth.js')
    const sendVerificationEmail = auth.options.emailVerification?.sendVerificationEmail

    const fakeUser: FakeUser = { id: 'user-123', email: 'sam@example.com' }

    await sendVerificationEmail?.({
      user: fakeUser as unknown as Parameters<NonNullable<typeof sendVerificationEmail>>[0]['user'],
      url: 'http://localhost:3000/api/auth/verify-email?token=abc',
      token: 'abc'
    })

    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('configures send-on-signup with a 24-hour TTL', async () => {
    const { auth } = await import('@/lib/auth.js')

    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true)
    expect(auth.options.emailVerification?.expiresIn).toBe(60 * 60 * 24)
  })
})

describe('databaseHooks.user.update.before', () => {
  it('recomposes `name` when firstname and lastname change without an explicit name', async () => {
    const { auth } = await import('@/lib/auth.js')
    const hook = auth.options.databaseHooks?.user?.update?.before
    expect(hook).toBeDefined()

    const result = await hook?.({ firstname: 'Sam', lastname: 'Lee' } as unknown as Parameters<
      NonNullable<typeof hook>
    >[0])

    expect(result).toEqual({ data: { firstname: 'Sam', lastname: 'Lee', name: 'Sam Lee' } })
  })

  it('leaves the payload alone when name is explicitly supplied', async () => {
    const { auth } = await import('@/lib/auth.js')
    const hook = auth.options.databaseHooks?.user?.update?.before

    const result = await hook?.({
      firstname: 'Sam',
      lastname: 'Lee',
      name: 'Mx Sam Lee'
    } as unknown as Parameters<NonNullable<typeof hook>>[0])

    expect(result).toBeUndefined()
  })

  it('skips composition on partial updates so the missing half does not clobber', async () => {
    const { auth } = await import('@/lib/auth.js')
    const hook = auth.options.databaseHooks?.user?.update?.before

    // firstname-only update (e.g. an unrelated email-change flow).
    // Composing name with an empty lastname would overwrite the existing
    // lastname half — skip instead.
    const firstOnly = await hook?.({ firstname: 'Sam' } as unknown as Parameters<
      NonNullable<typeof hook>
    >[0])
    expect(firstOnly).toBeUndefined()

    // Updates that touch neither name field (e.g. email-only) are also skipped.
    const noNameFields = await hook?.({ email: 'new@example.com' } as unknown as Parameters<
      NonNullable<typeof hook>
    >[0])
    expect(noNameFields).toBeUndefined()
  })
})

describe('better-auth account-linking config', () => {
  it('enables account linking with google as a trusted provider', async () => {
    const { auth } = await import('@/lib/auth.js')

    expect(auth.options.account?.accountLinking?.enabled).toBe(true)
    expect(auth.options.account?.accountLinking?.trustedProviders).toContain('google')
  })
})

describe('better-auth rate-limit config', () => {
  it('uses database storage backed by the RateLimit Prisma model', async () => {
    const { auth } = await import('@/lib/auth.js')

    expect(auth.options.rateLimit?.storage).toBe('database')
  })

  it('disables the limiter in local + test, leaving the e2e + dev paths unimpeded', async () => {
    // APP_ENV defaults to 'local' under vitest (env block in vitest.config.ts).
    // Production / staging flip the gate; this test guards the local carve-out.
    const { auth } = await import('@/lib/auth.js')

    expect(auth.options.rateLimit?.enabled).toBe(false)
  })

  it('declares per-route custom rules covering every limited auth endpoint', async () => {
    const { auth } = await import('@/lib/auth.js')
    const rules = auth.options.rateLimit?.customRules ?? {}

    expect(rules['/sign-in/email']).toEqual({ window: 600, max: 20 })
    expect(rules['/sign-up/email']).toEqual({ window: 3600, max: 5 })
    expect(rules['/sign-in/social/*']).toEqual({ window: 600, max: 20 })
    expect(rules['/change-password']).toEqual({ window: 3600, max: 10 })
    expect(rules['/request-password-reset']).toEqual({ window: 3600, max: 10 })
    expect(rules['/send-verification-email']).toEqual({ window: 3600, max: 10 })
  })
})

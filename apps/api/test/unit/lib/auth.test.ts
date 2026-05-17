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

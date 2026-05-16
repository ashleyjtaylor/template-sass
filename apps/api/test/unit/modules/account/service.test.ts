import { setStripeClient } from '@template-sass/billing'
import { prisma } from '@template-sass/db'
import * as mailer from '@template-sass/mailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger.js'

// `verifyPassword` is the only thing the service imports from better-auth's
// crypto module; stub it so tests don't need to seed real Argon2 hashes.
vi.mock('better-auth/crypto', () => ({
  verifyPassword: vi.fn()
}))

// Lazy import after the mocks so the service picks up the stubbed
// verifyPassword reference.
const importService = async () => import('@/modules/account/service.js')

interface UserRow {
  id: string
  email: string
  firstname: string
  subscription: { stripeSubscriptionId: string; status: string } | null
}

const userRow = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: 'user-1',
  email: 'sam@example.com',
  firstname: 'Sam',
  subscription: null,
  ...overrides
})

interface StubStripeOptions {
  cancel?: ReturnType<typeof vi.fn>
}

const stubStripeClient = ({ cancel }: StubStripeOptions = {}) => {
  const cancelFn = cancel ?? vi.fn().mockResolvedValue({})
  setStripeClient({
    subscriptions: { cancel: cancelFn }
  } as unknown as Parameters<typeof setStripeClient>[0])

  return { cancel: cancelFn }
}

// Verification has no FK on User. The service deletes verification rows
// for the user by `value` match before calling user.delete to avoid
// orphaning password-reset tokens. Every happy-path test needs this
// stub so it doesn't fall through to the real DB.
const stubVerificationDelete = () =>
  vi.spyOn(prisma.verification, 'deleteMany').mockResolvedValue({ count: 0 } as never)

beforeEach(() => {
  vi.spyOn(logger, 'error').mockImplementation(() => logger)
  vi.spyOn(logger, 'warn').mockImplementation(() => logger)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deleteAccount', () => {
  it('cancels the Stripe sub, deletes the user, and sends the account-deleted email', async () => {
    const { deleteAccount } = await importService()
    const { verifyPassword } = await import('better-auth/crypto')
    vi.mocked(verifyPassword).mockResolvedValue(true)

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      userRow({
        subscription: { stripeSubscriptionId: 'sub_live_123', status: 'active' }
      }) as never
    )
    vi.spyOn(prisma.account, 'findFirst').mockResolvedValue({ password: 'hash' } as never)
    const verificationDelete = stubVerificationDelete()
    const userDelete = vi.spyOn(prisma.user, 'delete').mockResolvedValue({} as never)
    const stripe = stubStripeClient()
    const send = vi.spyOn(mailer, 'sendAccountDeleted').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true)

    await deleteAccount({ userId: 'user-1', password: 'correct-horse' })

    expect(stripe.cancel).toHaveBeenCalledWith('sub_live_123')
    expect(verificationDelete).toHaveBeenCalledWith({ where: { value: 'user-1' } })
    expect(userDelete).toHaveBeenCalledWith({ where: { id: 'user-1' } })
    expect(send).toHaveBeenCalledWith({ to: 'sam@example.com', firstname: 'Sam' })
  })

  it('skips the Stripe call when the user has no subscription', async () => {
    const { deleteAccount } = await importService()
    const { verifyPassword } = await import('better-auth/crypto')
    vi.mocked(verifyPassword).mockResolvedValue(true)

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userRow() as never)
    vi.spyOn(prisma.account, 'findFirst').mockResolvedValue({ password: 'hash' } as never)
    stubVerificationDelete()
    const userDelete = vi.spyOn(prisma.user, 'delete').mockResolvedValue({} as never)
    const stripe = stubStripeClient()
    vi.spyOn(mailer, 'sendAccountDeleted').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true)

    await deleteAccount({ userId: 'user-1', password: 'correct-horse' })

    expect(stripe.cancel).not.toHaveBeenCalled()
    expect(userDelete).toHaveBeenCalled()
  })

  it('skips the Stripe call when the subscription is already terminal', async () => {
    const { deleteAccount } = await importService()
    const { verifyPassword } = await import('better-auth/crypto')
    vi.mocked(verifyPassword).mockResolvedValue(true)

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      userRow({
        subscription: { stripeSubscriptionId: 'sub_dead_1', status: 'canceled' }
      }) as never
    )
    vi.spyOn(prisma.account, 'findFirst').mockResolvedValue({ password: 'hash' } as never)
    stubVerificationDelete()
    vi.spyOn(prisma.user, 'delete').mockResolvedValue({} as never)
    const stripe = stubStripeClient()
    vi.spyOn(mailer, 'sendAccountDeleted').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true)

    await deleteAccount({ userId: 'user-1', password: 'correct-horse' })

    expect(stripe.cancel).not.toHaveBeenCalled()
  })

  it('proceeds with the hard delete even if Stripe cancellation throws', async () => {
    const { deleteAccount } = await importService()
    const { verifyPassword } = await import('better-auth/crypto')
    vi.mocked(verifyPassword).mockResolvedValue(true)

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      userRow({
        subscription: { stripeSubscriptionId: 'sub_live_123', status: 'active' }
      }) as never
    )
    vi.spyOn(prisma.account, 'findFirst').mockResolvedValue({ password: 'hash' } as never)
    stubVerificationDelete()
    const userDelete = vi.spyOn(prisma.user, 'delete').mockResolvedValue({} as never)
    const stripe = stubStripeClient({
      cancel: vi.fn().mockRejectedValue(new Error('stripe is down'))
    })
    vi.spyOn(mailer, 'sendAccountDeleted').mockResolvedValue(undefined)
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true)

    await deleteAccount({ userId: 'user-1', password: 'correct-horse' })

    expect(stripe.cancel).toHaveBeenCalled()
    expect(userDelete).toHaveBeenCalled()
  })

  it('rejects with BadPassword and does not mutate when verifyPassword returns false', async () => {
    const { deleteAccount } = await importService()
    const { verifyPassword } = await import('better-auth/crypto')
    vi.mocked(verifyPassword).mockResolvedValue(false)

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(
      userRow({
        subscription: { stripeSubscriptionId: 'sub_live_123', status: 'active' }
      }) as never
    )
    vi.spyOn(prisma.account, 'findFirst').mockResolvedValue({ password: 'hash' } as never)
    const userDelete = vi.spyOn(prisma.user, 'delete').mockResolvedValue({} as never)
    const stripe = stubStripeClient()
    const send = vi.spyOn(mailer, 'sendAccountDeleted').mockResolvedValue(undefined)

    await expect(deleteAccount({ userId: 'user-1', password: 'wrong' })).rejects.toMatchObject({
      status: 400,
      details: { reason: 'BadPassword' }
    })
    expect(stripe.cancel).not.toHaveBeenCalled()
    expect(userDelete).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects with NoCredentialAccount when the credential row is missing or unhashed', async () => {
    const { deleteAccount } = await importService()

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(userRow() as never)
    vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null)
    const userDelete = vi.spyOn(prisma.user, 'delete').mockResolvedValue({} as never)

    await expect(deleteAccount({ userId: 'user-1', password: 'anything' })).rejects.toMatchObject({
      status: 400,
      details: { reason: 'NoCredentialAccount' }
    })
    expect(userDelete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the user does not exist', async () => {
    const { deleteAccount } = await importService()

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)

    await expect(deleteAccount({ userId: 'ghost', password: 'x' })).rejects.toMatchObject({
      status: 404
    })
  })
})

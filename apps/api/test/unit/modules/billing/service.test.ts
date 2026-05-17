import * as billing from '@template-sass/billing'
import { prisma } from '@template-sass/db'
import { ConflictError, NotFoundError, ValidationError } from '@template-sass/errors'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeUpgrade, previewUpgrade } from '@/modules/billing/service.js'

const subRow = (overrides: Partial<{ status: string; planKey: string }> = {}) => ({
  subscription: {
    stripeSubscriptionId: 'sub_test',
    status: 'active',
    planKey: 'pro',
    ...overrides
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('previewUpgrade', () => {
  it('throws NotFoundError when the user does not exist', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)

    await expect(previewUpgrade('missing-user', 'max')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NoActiveSubscription when the user has no subscription row', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ subscription: null } as never)

    await expect(previewUpgrade('user-1', 'max')).rejects.toMatchObject({
      details: { reason: 'NoActiveSubscription' }
    })
  })

  it('throws NoActiveSubscription when the subscription is canceled', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow({ status: 'canceled' }) as never)

    await expect(previewUpgrade('user-1', 'max')).rejects.toBeInstanceOf(ConflictError)
  })

  it('throws InvalidPlanChange when the target equals the current plan', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow({ planKey: 'max' }) as never)

    await expect(previewUpgrade('user-1', 'max')).rejects.toMatchObject({
      details: { reason: 'InvalidPlanChange' }
    })
  })

  it('returns the billing-package result on the happy path', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow() as never)
    vi.spyOn(billing, 'previewPlanChange').mockResolvedValue({
      amountDueCents: 1234,
      currency: 'gbp',
      prorationDateUnix: 1779019200
    })

    const result = await previewUpgrade('user-1', 'max')

    expect(result).toEqual({
      amountDueCents: 1234,
      currency: 'gbp',
      prorationDateUnix: 1779019200
    })
  })

  it('maps an unknown-plan billing error to UnsupportedPlan (ValidationError)', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow() as never)
    vi.spyOn(billing, 'previewPlanChange').mockRejectedValue(
      new Error('Unknown or unconfigured plan: enterprise')
    )

    await expect(previewUpgrade('user-1', 'enterprise')).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('executeUpgrade', () => {
  it('throws NotFoundError when the user does not exist', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)

    await expect(executeUpgrade('missing-user', 'max')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws InvalidPlanChange when the target equals the current plan', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow({ planKey: 'max' }) as never)

    await expect(executeUpgrade('user-1', 'max')).rejects.toMatchObject({
      details: { reason: 'InvalidPlanChange' }
    })
  })

  it('forwards prorationDateUnix to the billing helper on the happy path', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow() as never)
    const changeSpy = vi.spyOn(billing, 'changeSubscriptionPlan').mockResolvedValue(undefined)

    await executeUpgrade('user-1', 'max', 1779019200)

    expect(changeSpy).toHaveBeenCalledWith({
      subscriptionId: 'sub_test',
      newPlan: 'max',
      prorationDateUnix: 1779019200
    })
  })

  it('omits prorationDateUnix when the caller does not supply one', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(subRow() as never)
    const changeSpy = vi.spyOn(billing, 'changeSubscriptionPlan').mockResolvedValue(undefined)

    await executeUpgrade('user-1', 'max')

    expect(changeSpy).toHaveBeenCalledWith({
      subscriptionId: 'sub_test',
      newPlan: 'max'
    })
  })
})

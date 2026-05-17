import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStripeClient, setStripeClient } from '../../src/client.js'
import { changeSubscriptionPlan, previewPlanChange } from '../../src/upgrade.js'

// Minimal Stripe client stub — just the three methods the upgrade
// helpers touch. Typed as `any` because the SDK's surface is huge and
// we only need the structural overlap for these tests.
function makeStubStripe(overrides: {
  retrieve?: ReturnType<typeof vi.fn>
  createPreview?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
}) {
  return {
    subscriptions: {
      retrieve: overrides.retrieve ?? vi.fn(),
      update: overrides.update ?? vi.fn()
    },
    invoices: {
      createPreview: overrides.createPreview ?? vi.fn()
    }
    // biome-ignore lint/suspicious/noExplicitAny: structural Stripe stub for unit tests
  } as any
}

const subWithItem = (id: string) => ({
  id,
  items: { data: [{ id: 'si_test_existing' }] }
})

beforeEach(() => {
  vi.useFakeTimers()
  // Pin time so prorationDateUnix is deterministic in assertions.
  vi.setSystemTime(new Date('2026-05-17T12:00:00Z'))
})

afterEach(() => {
  resetStripeClient()
  vi.useRealTimers()
})

describe('previewPlanChange', () => {
  it('retrieves the subscription then calls createPreview with the swapped price', async () => {
    const retrieve = vi.fn().mockResolvedValue(subWithItem('sub_test_1'))
    const createPreview = vi.fn().mockResolvedValue({
      amount_due: 1234,
      currency: 'gbp'
    })
    setStripeClient(makeStubStripe({ retrieve, createPreview }))

    const result = await previewPlanChange({
      subscriptionId: 'sub_test_1',
      newPlan: 'pro'
    })

    expect(retrieve).toHaveBeenCalledWith('sub_test_1')
    expect(createPreview).toHaveBeenCalledWith({
      subscription: 'sub_test_1',
      subscription_details: {
        items: [{ id: 'si_test_existing', price: 'price_billing_unit_tests' }],
        // 2026-05-17T12:00:00Z → 1779019200 seconds
        proration_date: 1779019200
      }
    })

    expect(result).toEqual({
      amountDueCents: 1234,
      currency: 'gbp',
      prorationDateUnix: 1779019200
    })
  })

  it('throws when priceIdForPlan rejects an unconfigured plan key', async () => {
    setStripeClient(makeStubStripe({}))

    await expect(
      previewPlanChange({ subscriptionId: 'sub_x', newPlan: 'enterprise' })
    ).rejects.toThrow(/Unknown or unconfigured plan/)
  })

  it('throws when the subscription has no items', async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: 'sub_empty', items: { data: [] } })
    setStripeClient(makeStubStripe({ retrieve }))

    await expect(
      previewPlanChange({ subscriptionId: 'sub_empty', newPlan: 'pro' })
    ).rejects.toThrow(/has no items/)
  })
})

describe('changeSubscriptionPlan', () => {
  it('calls subscriptions.update with create_prorations + the supplied prorationDate', async () => {
    const retrieve = vi.fn().mockResolvedValue(subWithItem('sub_test_2'))
    const update = vi.fn().mockResolvedValue({})
    setStripeClient(makeStubStripe({ retrieve, update }))

    await changeSubscriptionPlan({
      subscriptionId: 'sub_test_2',
      newPlan: 'pro',
      prorationDateUnix: 1779019200
    })

    expect(update).toHaveBeenCalledWith('sub_test_2', {
      items: [{ id: 'si_test_existing', price: 'price_billing_unit_tests' }],
      proration_behavior: 'create_prorations',
      proration_date: 1779019200
    })
  })

  it('omits proration_date when not supplied so Stripe recomputes from now', async () => {
    const retrieve = vi.fn().mockResolvedValue(subWithItem('sub_test_3'))
    const update = vi.fn().mockResolvedValue({})
    setStripeClient(makeStubStripe({ retrieve, update }))

    await changeSubscriptionPlan({ subscriptionId: 'sub_test_3', newPlan: 'pro' })

    expect(update).toHaveBeenCalledWith('sub_test_3', {
      items: [{ id: 'si_test_existing', price: 'price_billing_unit_tests' }],
      proration_behavior: 'create_prorations'
    })
  })

  it('throws when priceIdForPlan rejects an unconfigured plan key', async () => {
    setStripeClient(makeStubStripe({}))

    await expect(
      changeSubscriptionPlan({ subscriptionId: 'sub_x', newPlan: 'enterprise' })
    ).rejects.toThrow(/Unknown or unconfigured plan/)
  })
})

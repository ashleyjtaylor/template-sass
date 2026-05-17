import { describe, expect, it } from 'vitest'
import { planKeyForPriceId, priceIdForPlan } from '../../src/env.js'

// vitest.config.ts seeds STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_MAX
// to deterministic placeholders — the assertions below match those.
const PRICE_PRO = 'price_billing_unit_tests'
const PRICE_MAX = 'price_billing_unit_tests'

describe('priceIdForPlan', () => {
  it('returns the configured price id for a known plan', () => {
    expect(priceIdForPlan('pro')).toBe(PRICE_PRO)
    expect(priceIdForPlan('max')).toBe(PRICE_MAX)
  })

  it('throws for an unknown plan key', () => {
    expect(() => priceIdForPlan('enterprise')).toThrow(/Unknown or unconfigured plan/)
  })
})

describe('planKeyForPriceId', () => {
  // The vitest config gives both plans the same placeholder value, so a
  // lookup for that placeholder resolves to whichever plan iterates
  // first ('pro'). The webhook only cares that a non-null value comes
  // back — picking 'pro' over 'max' for a colliding test fixture is
  // fine.
  it('reverses the lookup for a configured price id', () => {
    const result = planKeyForPriceId(PRICE_PRO)
    expect(result).not.toBeNull()
    expect(['pro', 'max']).toContain(result)
  })

  it('returns null for a price id that is not in PLAN_PRICE_IDS', () => {
    expect(planKeyForPriceId('price_unknown_xyz')).toBeNull()
  })

  it('returns null for an empty string (defensive — unconfigured fork)', () => {
    expect(planKeyForPriceId('')).toBeNull()
  })
})

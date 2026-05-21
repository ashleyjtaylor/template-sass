import type { Entitlements } from './types.js'

// Every plan key surfaced in pricing/checkout must have an entry here, or
// entitlementsForPlan throws for that plan. No feature variance between
// the tiers yet — add capability strings to `features` when one ships.
const PLANS: Record<string, Entitlements> = {
  pro: {
    features: new Set<string>()
  },
  max: {
    features: new Set<string>()
  }
}

export function entitlementsForPlan(planKey: string): Entitlements {
  const plan = PLANS[planKey]

  if (!plan) throw new Error(`Unknown plan key: ${planKey}`)

  return plan
}

export function knownPlanKeys(): readonly string[] {
  return Object.keys(PLANS)
}

import { getStripeClient } from './client.js'
import { priceIdForPlan } from './env.js'

export interface PreviewPlanChangeInput {
  // The customer's existing Stripe subscription id (from the
  // `Subscription.stripeSubscriptionId` mirror column).
  subscriptionId: string
  // Plan key the user wants to switch to. Must be in PLAN_PRICE_IDS;
  // priceIdForPlan throws otherwise.
  newPlan: string
}

export interface PreviewPlanChangeResult {
  // Prorated amount due immediately if the customer confirms the change.
  // Stripe returns this in the smallest currency unit (e.g. pence for GBP).
  amountDueCents: number
  // ISO 4217 lowercase currency code, e.g. 'gbp'.
  currency: string
  // Unix seconds of the proration point. Pass this through to
  // `changeSubscriptionPlan` so the actual charge matches what the
  // preview quoted — Stripe recomputes from `now` otherwise, which
  // drifts if the user pauses on the confirm screen.
  prorationDateUnix: number
}

// Quotes what the customer would be charged today if they switched to
// `newPlan`. Two Stripe calls: retrieve the subscription (to read the
// current line-item id) then retrieveUpcoming with the swapped price.
// Doesn't mutate anything — pair with `changeSubscriptionPlan` to
// actually perform the switch.
export async function previewPlanChange(
  input: PreviewPlanChangeInput
): Promise<PreviewPlanChangeResult> {
  const stripe = getStripeClient()
  const newPriceId = priceIdForPlan(input.newPlan)

  const subscription = await stripe.subscriptions.retrieve(input.subscriptionId)
  const existingItem = subscription.items.data[0]

  if (!existingItem) {
    throw new Error(`Subscription ${input.subscriptionId} has no items`)
  }

  // Pin the proration moment so the subsequent execute() call uses the
  // exact same boundary — otherwise the quoted amount and the charged
  // amount can differ by the seconds the user spent on the modal.
  const prorationDateUnix = Math.floor(Date.now() / 1000)

  // Stripe replaced the v1 `invoices.retrieveUpcoming` with
  // `invoices.createPreview` (the params moved under `subscription_details`).
  // Same semantics — quotes the next invoice without writing anything.
  const upcoming = await stripe.invoices.createPreview({
    subscription: input.subscriptionId,
    subscription_details: {
      items: [{ id: existingItem.id, price: newPriceId }],
      proration_date: prorationDateUnix
    }
  })

  return {
    amountDueCents: upcoming.amount_due,
    currency: upcoming.currency,
    prorationDateUnix
  }
}

export interface ChangeSubscriptionPlanInput {
  subscriptionId: string
  newPlan: string
  // Pass through the value returned from `previewPlanChange` so the
  // actual charge matches what the user was shown. Omit to let Stripe
  // recompute against `now()` (the divergence is usually pennies but
  // visible).
  prorationDateUnix?: number
}

// Switches the subscription to `newPlan` with prorated billing. Doesn't
// touch the local DB — the `customer.subscription.updated` webhook
// handler mirrors the change via `planKeyForPriceId`.
export async function changeSubscriptionPlan(input: ChangeSubscriptionPlanInput): Promise<void> {
  const stripe = getStripeClient()
  const newPriceId = priceIdForPlan(input.newPlan)

  const subscription = await stripe.subscriptions.retrieve(input.subscriptionId)
  const existingItem = subscription.items.data[0]

  if (!existingItem) {
    throw new Error(`Subscription ${input.subscriptionId} has no items`)
  }

  await stripe.subscriptions.update(input.subscriptionId, {
    items: [{ id: existingItem.id, price: newPriceId }],
    proration_behavior: 'create_prorations',
    ...(input.prorationDateUnix !== undefined && {
      proration_date: input.prorationDateUnix
    })
  })
}

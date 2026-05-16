import { getStripeClient } from './client.js'
import { priceIdForPlan } from './env.js'

export interface CreateCheckoutSessionInput {
  // The user we're subscribing. Recorded as Checkout client_reference_id
  // and on subscription metadata so the webhook handler can resolve the
  // user when `customer.subscription.*` events arrive.
  userEntityId: string
  // Plan key the user selected on the pricing page (e.g. `pro`). Maps to
  // a Stripe price id via `priceIdForPlan`.
  plan: string
  // If the user has previously subscribed, we already know the Stripe
  // customer id and pass it through so Stripe attaches the new
  // subscription to the same customer rather than creating a duplicate.
  customerId: string | undefined
  // First-checkout fallback — Stripe creates the customer during the
  // session. We supply the user's email so receipts and invoices have
  // a recognisable address; the value is also pre-filled on the
  // Checkout page.
  customerEmail: string | undefined
  successUrl: string
  cancelUrl: string
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<{ url: string }> {
  const stripe = getStripeClient()
  const priceId = priceIdForPlan(input.plan)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    // Card-only Checkout. Without this, Stripe surfaces every payment
    // method enabled at the account level (Klarna, Revolut Pay, Amazon
    // Pay, Link, etc.) behind an accordion. Card-only is the standard
    // SaaS default and keeps the e2e flow deterministic. Forks that
    // want multi-method checkout can remove this line.
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userEntityId,
    // `customer` and `customer_email` are mutually exclusive — Stripe
    // 400s if both are sent. Prefer the existing customer if present.
    ...(input.customerId
      ? { customer: input.customerId }
      : input.customerEmail
        ? { customer_email: input.customerEmail }
        : {}),
    subscription_data: {
      metadata: { userEntityId: input.userEntityId, plan: input.plan }
    },
    metadata: { userEntityId: input.userEntityId, plan: input.plan }
  })

  if (!session.url) {
    throw new Error('Stripe Checkout session returned without a URL')
  }

  return { url: session.url }
}

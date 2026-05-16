import Stripe from 'stripe'

// Matches the email pattern produced by fixtures/auth.ts#makeUser:
//   `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`
// Tight regex so we never delete a customer the user created by hand.
const E2E_EMAIL_PATTERN = /^e2e-[a-f0-9]{8}@example\.com$/

// Removes any Stripe test-mode customers (and their cascaded subscriptions)
// that the e2e suite created. Runs once after the whole suite finishes —
// failures here log but don't fail the suite, since by definition all
// tests have already passed/failed by this point.
//
// Skipped if STRIPE_API_KEY is unset (e.g. local dev without billing
// configured) — the suite simply leaves no Stripe state to clean.
export default async function globalTeardown(): Promise<void> {
  const apiKey = process.env['STRIPE_API_KEY']

  if (!apiKey || apiKey.length === 0) {
    console.log('[e2e teardown] STRIPE_API_KEY not set, skipping Stripe cleanup')
    return
  }

  const stripe = new Stripe(apiKey, { apiVersion: '2026-04-22.dahlia' })

  let deleted = 0
  let scanned = 0
  let cursor: string | undefined

  try {
    // Paginate through all customers — Stripe's list API caps at 100/page.
    // The e2e suite runs ~10 customers per pass; even with months of
    // accumulated state this should terminate quickly.
    do {
      const page = await stripe.customers.list({
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {})
      })

      for (const customer of page.data) {
        scanned++

        if (customer.email && E2E_EMAIL_PATTERN.test(customer.email)) {
          await stripe.customers.del(customer.id)
          deleted++
        }
      }

      const last = page.data[page.data.length - 1]
      cursor = page.has_more && last ? last.id : undefined
    } while (cursor)

    console.log(
      `[e2e teardown] scanned ${scanned} stripe customers, deleted ${deleted} e2e leftovers`
    )
  } catch (err) {
    console.error('[e2e teardown] stripe cleanup failed (non-fatal):', err)
  }
}

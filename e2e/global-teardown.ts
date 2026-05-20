import Stripe from 'stripe'
import { deleteE2eUsers, disconnect } from './fixtures/db.js'

// Matches the email pattern produced by fixtures/auth.ts#makeUser:
//   `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`
// Tight regex so we never delete a customer the user created by hand.
const E2E_EMAIL_PATTERN = /^e2e-[a-f0-9]{8}@example\.com$/

// Runs once after the whole suite finishes. Two cleanup passes:
//   1. Stripe test-mode customers (with their cascaded subscriptions)
//      created during signup-paywall.
//   2. User rows + better-auth verification rows in the local DB,
//      scoped by the same e2e- email prefix so we never touch a real
//      account on the developer's dev DB.
// Failures in either pass log but don't fail the suite — by this point
// all tests have already passed or failed.
export default async function globalTeardown(): Promise<void> {
  await cleanupStripeCustomers()
  await cleanupDbUsers()
}

async function cleanupStripeCustomers(): Promise<void> {
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

async function cleanupDbUsers(): Promise<void> {
  try {
    const { users, verifications } = await deleteE2eUsers()
    console.log(
      `[e2e teardown] deleted ${users} user row(s) and ${verifications} verification row(s)`
    )
  } catch (err) {
    console.error('[e2e teardown] db cleanup failed (non-fatal):', err)
  } finally {
    await disconnect()
  }
}

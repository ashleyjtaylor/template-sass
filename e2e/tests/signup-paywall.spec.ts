import { expect, test } from '@playwright/test'
import { makeUser } from '../fixtures/auth.js'
import { disconnect, prisma, truncateAll } from '../fixtures/db.js'
import { fillTestCardAndPay } from '../fixtures/stripe.js'

test.beforeEach(async () => {
  await truncateAll()
})

test.afterAll(async () => {
  await disconnect()
})

// The full happy-path: pricing → signup → Stripe Checkout → webhook
// flips Subscription.status → user lands on /dashboard. Slowest test in
// the suite (real Stripe redirect + CLI webhook) — uses a longer
// timeout to absorb both the Stripe page render and the webhook RTT.
test('signs up, pays via Stripe checkout, and lands on /dashboard', async ({ page }) => {
  test.setTimeout(180_000)

  const user = makeUser()

  await page.goto('/')

  await page.getByRole('button', { name: /get started/i }).click()
  await expect(page).toHaveURL(/\/signup\?plan=pro/)

  await page.getByLabel('First name').fill(user.firstname)
  await page.getByLabel('Last name').fill(user.lastname)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: /create account & continue/i }).click()

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
  await fillTestCardAndPay(page)

  // After successful payment Stripe redirects back to our success URL,
  // which the SPA resolves to /dashboard once the auth-gated route loads.
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })

  // The webhook may land slightly after the redirect — poll the mirror
  // row until it's present and active.
  await expect
    .poll(
      async () => {
        const u = await prisma.user.findUnique({
          where: { email: user.email },
          include: { subscription: true }
        })

        return u?.subscription?.status ?? null
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] }
    )
    .toBe('active')
})

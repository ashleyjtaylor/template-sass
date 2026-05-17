import { expect, type Page } from '@playwright/test'

// Page-object helper for the Stripe-hosted Checkout page. Selectors
// target Stripe's stable test attributes (role+name); when Stripe shifts
// the breakage is localised to this file.
//
// Test card from https://stripe.com/docs/testing — always succeeds in
// test mode, no 3DS challenge.
export async function fillTestCardAndPay(page: Page): Promise<void> {
  // Card-only Checkout (set in packages/billing/src/checkout.ts) means
  // Stripe renders the card form directly with no payment-method
  // accordion to expand. Wait for the card-number field rather than a
  // fixed delay — Stripe's first paint can take a beat.
  const cardNumber = page.getByRole('textbox', { name: /card number/i })

  await expect(cardNumber).toBeVisible({ timeout: 30_000 })
  await cardNumber.fill('4242 4242 4242 4242')

  await page.getByRole('textbox', { name: /expiration|expiry/i }).fill('12 / 34')
  await page.getByRole('textbox', { name: /cvc|security code/i }).fill('123')

  // Cardholder name + postal code depend on the account's billing
  // address collection setting — fill if present.
  const nameField = page.getByRole('textbox', { name: /(cardholder )?name/i })

  if (await nameField.count()) {
    await nameField.first().fill('E2E Test')
  }

  const postal = page.getByRole('textbox', { name: /(zip|postal)/i })

  if (await postal.count()) {
    await postal.first().fill('12345')
  }

  // Phone is only rendered when the account's Checkout settings have
  // "Phone number" enabled and the API didn't override with
  // phone_number_collection: { enabled: false }. The template now sets
  // that override (see packages/billing/src/checkout.ts), but the fill
  // stays as a defensive fallback for forks that want phone collection.
  const phone = page.getByRole('textbox', { name: /phone/i })

  if (await phone.count()) {
    await phone.first().fill('5555550123')
  }

  await page.getByRole('button', { name: /(pay|subscribe|start trial)/i }).click()
}

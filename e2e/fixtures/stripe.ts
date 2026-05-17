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

  // Stripe Checkout defaults the billing-country to the Stripe account's
  // country (often US for test accounts), which makes the postcode field
  // strip non-numeric characters. That turns "SW1A 1AA" into "11" and
  // fails validation. Switch the country to United Kingdom first so the
  // form accepts the UK postcode that matches our en-GB / GBP pricing.
  const country = page.getByLabel(/country( or region)?/i)

  if (await country.count()) {
    await country.first().selectOption({ label: 'United Kingdom' })
  }

  // UK postcode — SW1A 1AA is the government's published example
  // (10 Downing Street) and always passes Stripe's UK postcode validator.
  const postal = page.getByRole('textbox', { name: /(post(al)?( ?code)?|postcode|zip)/i })

  if (await postal.count()) {
    await postal.first().fill('SW1A 1AA')
  }

  // Stripe Link's "Save my information for faster checkout" checkbox is
  // ticked by default. Ticked → Link asks for a phone number to
  // associate with the saved card → e2e hangs waiting for a field it
  // can't realistically populate. Untick it so the flow stays
  // card-only. The checkbox is technically optional and not always
  // present (Stripe gates Link availability on geo/account); guard
  // with a count check.
  const saveInfo = page.getByLabel(/save (my )?(info|information)/i)

  if (await saveInfo.count()) {
    const box = saveInfo.first()
    if (await box.isChecked()) {
      await box.uncheck()
    }
  }

  await page.getByRole('button', { name: /(pay|subscribe|start trial)/i }).click()
}

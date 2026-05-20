import { expect, test } from '@playwright/test'
import { makeUser, signUpProgrammatic } from '../fixtures/auth.js'
import { disconnect } from '../fixtures/db.js'
import { extractResetUrl, flushMessages, waitForMessage } from '../fixtures/mailpit.js'

// See note in auth.spec.ts: cleanup is suite-end + e2e- prefix scoped.
// Mailpit still needs flushing per test so cross-test message lookups
// don't pick up the previous test's reset email.
test.beforeEach(async () => {
  await flushMessages()
})

test.afterAll(async () => {
  await disconnect()
})

test('forgot → email link → reset → sign in with the new password', async ({ page }) => {
  const user = makeUser()
  await signUpProgrammatic(user)

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(user.email)
  await page.getByRole('button', { name: /send reset link/i }).click()

  await expect(page.getByRole('heading', { name: /check your inbox/i })).toBeVisible()

  // Pull the reset URL out of mailpit. The email link points at the API
  // (/api/auth/reset-password/<token>?callbackURL=…/reset-password) which
  // validates the token and 302s to the SPA's /reset-password?token=…
  const message = await waitForMessage({ to: user.email })
  const resetUrl = extractResetUrl(message)

  await page.goto(resetUrl)
  await expect(page).toHaveURL(/\/reset-password\?token=/)

  const newPassword = 'NewPassw0rd!Reset'
  await page.getByLabel('New password').fill(newPassword)
  await page.getByLabel('Confirm password').fill(newPassword)
  await page.getByRole('button', { name: /update password/i }).click()

  await expect(page.getByRole('heading', { name: /password updated/i })).toBeVisible()
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/login(\?|$)/)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
})

test('reset attempt with a bad token shows the invalid-link view', async ({ page }) => {
  // Navigating with a token argument renders the form (the SPA doesn't
  // pre-validate the token server-side). The invalid-link view appears
  // after submit, when the API rejects the token. Both paths are user-
  // observable; this asserts the post-submit one.
  await page.goto('/reset-password?token=this-token-does-not-exist')

  const newPassword = 'AnyPassword1!'
  await page.getByLabel('New password').fill(newPassword)
  await page.getByLabel('Confirm password').fill(newPassword)
  await page.getByRole('button', { name: /update password/i }).click()

  await expect(page.getByRole('heading', { name: /link is invalid or expired/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /request a new link/i })).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { applyStorageState, makeUser, signUpProgrammatic } from '../fixtures/auth.js'
import { disconnect, prisma } from '../fixtures/db.js'
import { extractVerifyUrl, flushMessages, waitForMessage } from '../fixtures/mailpit.js'

// See note in auth.spec.ts: cleanup is suite-end + e2e- prefix scoped.
// Mailpit still needs flushing per test so cross-test message lookups
// don't pick up the previous test's verify email.
test.beforeEach(async () => {
  await flushMessages()
})

test.afterAll(async () => {
  await disconnect()
})

test('signup sends a verify email; clicking the link verifies and shows success on /dashboard', async ({
  browser
}) => {
  const user = makeUser()
  const { storageState } = await signUpProgrammatic(user)

  // signup fires emailVerification.sendVerificationEmail inline — wait for
  // the message in mailpit before we touch the UI.
  const signupMessage = await waitForMessage({ to: user.email })

  expect(signupMessage.Text).toContain('Verify your email')
  const verifyUrl = extractVerifyUrl(signupMessage)

  // Authed user lands on /dashboard; banner is visible because
  // emailVerified is still false.
  const context = await browser.newContext()
  await applyStorageState(context, storageState)
  const page = await context.newPage()

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('status').filter({ hasText: /verify your email/i })).toBeVisible()

  // Click the link from the email. better-auth's GET /verify-email flips
  // the flag and 302s to callbackURL=/dashboard?verified=1.
  await page.goto(verifyUrl)
  await expect(page).toHaveURL(/\/dashboard/)
  // The toast firing is the user-facing assertion; the ?verified=1
  // param-strip is a nicety so a hard refresh doesn't re-toast.
  await expect(page.getByText(/email verified/i).first()).toBeVisible()

  // Banner gone after the session refetch picks up emailVerified=true.
  await expect(page.getByRole('status').filter({ hasText: /verify your email/i })).toHaveCount(0, {
    timeout: 5_000
  })

  // DB confirms the flag flipped.
  const dbUser = await prisma.user.findUnique({ where: { email: user.email } })
  expect(dbUser?.emailVerified).toBe(true)

  await context.close()
})

test('banner resend dispatches a fresh email; reusing the consumed first link is rejected', async ({
  browser
}) => {
  const user = makeUser()
  const { storageState } = await signUpProgrammatic(user)

  // Capture the signup email so it doesn't get matched as the "resend" one.
  await waitForMessage({ to: user.email })
  await flushMessages()

  const context = await browser.newContext()
  await applyStorageState(context, storageState)
  const page = await context.newPage()

  await page.goto('/dashboard')
  await page.getByRole('button', { name: /resend email/i }).click()

  const resendMessage = await waitForMessage({ to: user.email })
  const verifyUrl = extractVerifyUrl(resendMessage)

  await page.goto(verifyUrl)
  await expect(page).toHaveURL(/\/dashboard(\?|$)/)
  await expect(page.getByText(/email verified/i).first()).toBeVisible()

  // Reusing the same link is now rejected — better-auth deletes the
  // Verification row on success, so the token lookup misses.
  await page.goto(verifyUrl)
  // The handler redirects to the SPA with an error indicator in the
  // search params; assert we end up on a route that isn't /dashboard?verified=1.
  await expect(page).not.toHaveURL(/verified=1/)

  await context.close()
})

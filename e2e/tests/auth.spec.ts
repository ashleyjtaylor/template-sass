import { expect, test } from '@playwright/test'
import { applyStorageState, makeUser, signUpProgrammatic } from '../fixtures/auth.js'
import { disconnect, truncateAll } from '../fixtures/db.js'

test.beforeEach(async () => {
  await truncateAll()
})

test.afterAll(async () => {
  await disconnect()
})

test('signs in via the UI and lands on /dashboard', async ({ page, context }) => {
  const user = makeUser()
  await signUpProgrammatic(user)

  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/dashboard$/)

  // The signup-programmatic helper wrote a session cookie to its own
  // request context — confirm the UI sign-in created one too.
  const cookies = await context.cookies()

  expect(cookies.find((c) => c.name === 'better-auth.session_token')).toBeTruthy()
})

test('shows a friendly error on bad password', async ({ page }) => {
  const user = makeUser()
  await signUpProgrammatic(user)

  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('wrong-password-here')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByRole('alert')).toContainText(/email or password is incorrect/i)
  await expect(page).toHaveURL(/\/login$/)
})

test('unauthed user hitting /dashboard is redirected to /login', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/login(\?|$)/)
})

test('authed user hitting /login is redirected to /dashboard', async ({ browser }) => {
  const user = makeUser()
  const { storageState } = await signUpProgrammatic(user)

  const context = await browser.newContext()
  await applyStorageState(context, storageState)

  const page = await context.newPage()
  await page.goto('/login')

  await expect(page).toHaveURL(/\/dashboard$/)
  await context.close()
})

test('signs out from the user menu and bounces back to /login', async ({ browser }) => {
  const user = makeUser()
  const { storageState } = await signUpProgrammatic(user)

  const context = await browser.newContext()
  await applyStorageState(context, storageState)

  const page = await context.newPage()
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)

  // The dropdown trigger has no accessible name beyond the email — open
  // it by clicking the avatar/email element, then pick "Sign out".
  await page.getByText(user.email).first().click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()

  await expect(page).toHaveURL(/\/login(\?|$)/)

  const cookies = await context.cookies()

  expect(cookies.find((c) => c.name === 'better-auth.session_token')).toBeFalsy()

  await context.close()
})

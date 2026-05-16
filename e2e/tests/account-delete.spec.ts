import { expect, test } from '@playwright/test'
import { applyStorageState, makeUser, signUpProgrammatic } from '../fixtures/auth.js'
import { disconnect, prisma, truncateAll } from '../fixtures/db.js'

test.beforeEach(async () => {
  await truncateAll()
})

test.afterAll(async () => {
  await disconnect()
})

test('deletes the account from /account and bounces to /login', async ({ browser }) => {
  const user = makeUser()
  const { storageState } = await signUpProgrammatic(user)

  const context = await browser.newContext()
  await applyStorageState(context, storageState)
  const page = await context.newPage()

  await page.goto('/account')
  await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible()
  await page.getByRole('button', { name: /^delete account$/i }).click()

  // Modal: must type the email exactly + supply the current password
  // before the destructive submit unlocks.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: /delete your account/i })).toBeVisible()
  await dialog.getByLabel(/type your email to confirm/i).fill(user.email)
  await dialog.getByLabel(/current password/i).fill(user.password)

  await dialog.getByRole('button', { name: /^delete account$/i }).click()

  await expect(page).toHaveURL(/\/login(\?|$)/)

  // The user row is gone — re-signin with the same credentials fails.
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByRole('alert')).toContainText(/email or password is incorrect/i)

  // And the DB no longer carries the row.
  const row = await prisma.user.findUnique({ where: { email: user.email } })
  expect(row).toBeNull()

  await context.close()
})

test('blocks the submit until the typed email matches the signed-in email', async ({ browser }) => {
  const user = makeUser()
  const { storageState } = await signUpProgrammatic(user)

  const context = await browser.newContext()
  await applyStorageState(context, storageState)
  const page = await context.newPage()

  await page.goto('/account')
  await page.getByRole('button', { name: /^delete account$/i }).click()

  const dialog = page.getByRole('dialog')
  const submit = dialog.getByRole('button', { name: /^delete account$/i })

  // Empty fields → disabled.
  await expect(submit).toBeDisabled()

  await dialog.getByLabel(/type your email to confirm/i).fill('wrong@example.com')
  await dialog.getByLabel(/current password/i).fill(user.password)
  await expect(submit).toBeDisabled()

  // Type the right email → unlocked.
  await dialog.getByLabel(/type your email to confirm/i).fill(user.email)
  await expect(submit).toBeEnabled()

  await context.close()
})

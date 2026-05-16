import { getStripeClient, isBillingConfigured } from '@template-sass/billing'
import { prisma } from '@template-sass/db'
import { NotFoundError, ValidationError } from '@template-sass/errors'
import { isMailerConfigured, sendAccountDeleted } from '@template-sass/mailer'
import { verifyPassword } from 'better-auth/crypto'
import { logger } from '@/lib/logger.js'

const log = logger.child({ module: 'account' })

export interface DeleteAccountInput {
  userId: string
  password: string
}

// Verifies the current password, cancels any live Stripe subscription
// (no proration — the user forfeits remaining paid time), hard-deletes
// the user row, then fires the account-deleted email best-effort. The
// Stripe customer record is intentionally retained: keeping the
// receipts/invoices side intact is Stripe's recommendation for
// chargeback and tax-audit reasons.
//
// Prisma cascade rules wipe Session, Account, and Subscription rows.
// The eventual `customer.subscription.deleted` webhook from Stripe
// then no-ops in our handler (P2025 — row already gone), which is
// already the documented behaviour.
export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      firstname: true,
      subscription: {
        select: { stripeSubscriptionId: true, status: true }
      }
    }
  })

  if (!user) throw new NotFoundError('User not found')

  await verifyCurrentPassword(input.userId, input.password)

  // Cancel Stripe sub before deleting the user so we have access to the
  // stripeSubscriptionId. Cancellation is best-effort: a Stripe outage
  // shouldn't block the user's deletion request. If Stripe still has a
  // live sub afterwards, the customer record persists and ops can
  // reconcile manually.
  if (user.subscription && isBillingConfigured()) {
    const status = user.subscription.status
    // `canceled` / `incomplete_expired` are terminal — calling cancel
    // again would 404 / no-op. Skip.
    if (status !== 'canceled' && status !== 'incomplete_expired') {
      try {
        await getStripeClient().subscriptions.cancel(user.subscription.stripeSubscriptionId)
      } catch (err) {
        log.error(
          { err, userId: user.id, subId: user.subscription.stripeSubscriptionId },
          'failed to cancel Stripe subscription during account delete — proceeding with hard delete'
        )
      }
    }
  }

  await prisma.user.delete({ where: { id: user.id } })

  if (isMailerConfigured()) {
    try {
      await sendAccountDeleted({ to: user.email, firstname: user.firstname })
    } catch (err) {
      log.error({ err, userId: user.id }, 'failed to send account-deleted email')
    }
  }
}

async function verifyCurrentPassword(userId: string, password: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
    select: { password: true }
  })

  if (!account?.password) {
    // Either the row is missing (shouldn't happen for email/password
    // users) or it has no hash (OAuth-only — not possible today but #4
    // adds Google login). Surface as 400: the caller is authenticated
    // but the verification input doesn't apply.
    throw new ValidationError('No credential account on file to verify against', {
      reason: 'NoCredentialAccount'
    })
  }

  const ok = await verifyPassword({ hash: account.password, password })
  if (!ok) {
    throw new ValidationError('Incorrect password', { reason: 'BadPassword' })
  }
}

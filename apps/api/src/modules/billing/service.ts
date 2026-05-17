import {
  changeSubscriptionPlan,
  createCheckoutSession as createStripeCheckout,
  createPortalSession as createStripePortal,
  getUserAccessState,
  type PreviewPlanChangeResult,
  previewPlanChange
} from '@template-sass/billing'
import { prisma } from '@template-sass/db'
import { ConflictError, NotFoundError, ValidationError } from '@template-sass/errors'
import { env } from '@/env.js'

const webBaseUrl = () => env.WEB_BASE_URL.replace(/\/$/, '')

interface CheckoutSessionParams {
  userId: string
  userEntityId: string
  email: string
  plan: string
}

export async function buildCheckoutSession(params: CheckoutSessionParams) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { stripeCustomerId: true, subscription: { select: { status: true } } }
  })

  if (!user) throw new NotFoundError('User not found')

  // Block double-subscribing — the Customer Portal handles plan changes on
  // an existing subscription.
  if (
    user.subscription &&
    (user.subscription.status === 'active' ||
      user.subscription.status === 'trialing' ||
      user.subscription.status === 'past_due')
  ) {
    throw new ConflictError('User already has an active subscription', {
      reason: 'AlreadySubscribed'
    })
  }

  const successUrl = `${webBaseUrl()}/dashboard?session_id={CHECKOUT_SESSION_ID}`
  // Cancel lands the (signed-in) user back on /dashboard, not the
  // public pricing page. The dashboard's paywall state already shows
  // the plan cards so they can retry without leaving the app.
  const cancelUrl = `${webBaseUrl()}/dashboard`

  return createStripeCheckout({
    userEntityId: params.userEntityId,
    plan: params.plan,
    customerId: user.stripeCustomerId ?? undefined,
    customerEmail: user.stripeCustomerId ? undefined : params.email,
    successUrl,
    cancelUrl
  })
}

export async function buildPortalSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true }
  })

  if (!user) throw new NotFoundError('User not found')

  if (!user.stripeCustomerId) {
    throw new ConflictError('User has not subscribed yet', { reason: 'NoStripeCustomer' })
  }

  return createStripePortal({
    customerId: user.stripeCustomerId,
    returnUrl: `${webBaseUrl()}/dashboard`
  })
}

export async function readAccessState(userId: string) {
  return getUserAccessState(userId)
}

// Loads + validates the in-flight subscription for a plan change. Both
// preview and execute go through this so the error surface is identical
// and the validation rules can't drift between them.
async function loadSubscriptionForPlanChange(userId: string, targetPlan: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscription: {
        select: { stripeSubscriptionId: true, status: true, planKey: true }
      }
    }
  })

  if (!user) throw new NotFoundError('User not found')

  const sub = user.subscription

  // Plan change only applies to live subs — first-time buyers hit
  // /checkout-session instead. We accept both `active` and `trialing`
  // (a trialing user upgrading immediately is fine; Stripe handles the
  // proration).
  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) {
    throw new ConflictError('User has no active subscription', {
      reason: 'NoActiveSubscription'
    })
  }

  // No-op switch is a 409, not a silent success — the SPA shouldn't
  // have surfaced the upgrade button in this case.
  if (sub.planKey === targetPlan) {
    throw new ConflictError('Already on the requested plan', {
      reason: 'InvalidPlanChange'
    })
  }

  return sub
}

export interface PreviewUpgradeResult {
  amountDueCents: number
  currency: string
  prorationDateUnix: number
}

// Quotes the prorated charge for switching `userId` to `targetPlan`.
// Pure read — doesn't mutate Stripe or the local DB.
export async function previewUpgrade(
  userId: string,
  targetPlan: string
): Promise<PreviewUpgradeResult> {
  const sub = await loadSubscriptionForPlanChange(userId, targetPlan)

  try {
    const result: PreviewPlanChangeResult = await previewPlanChange({
      subscriptionId: sub.stripeSubscriptionId,
      newPlan: targetPlan
    })
    return result
  } catch (err) {
    // `priceIdForPlan` throws for plan keys not in PLAN_PRICE_IDS —
    // surface that as 422 so the SPA can branch (vs a 500 we'd
    // otherwise treat as transient).
    if (err instanceof Error && /Unknown or unconfigured plan/.test(err.message)) {
      throw new ValidationError(err.message, { reason: 'UnsupportedPlan' })
    }
    throw err
  }
}

// Performs the plan switch. Webhook handles the mirror update.
export async function executeUpgrade(
  userId: string,
  targetPlan: string,
  prorationDateUnix?: number
): Promise<void> {
  const sub = await loadSubscriptionForPlanChange(userId, targetPlan)

  try {
    await changeSubscriptionPlan({
      subscriptionId: sub.stripeSubscriptionId,
      newPlan: targetPlan,
      ...(prorationDateUnix !== undefined && { prorationDateUnix })
    })
  } catch (err) {
    if (err instanceof Error && /Unknown or unconfigured plan/.test(err.message)) {
      throw new ValidationError(err.message, { reason: 'UnsupportedPlan' })
    }
    throw err
  }
}

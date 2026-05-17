import {
  createCheckoutSession as createStripeCheckout,
  createPortalSession as createStripePortal,
  getUserAccessState
} from '@template-sass/billing'
import { prisma } from '@template-sass/db'
import { ConflictError, NotFoundError } from '@template-sass/errors'
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

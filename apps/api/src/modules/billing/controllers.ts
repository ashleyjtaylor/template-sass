import { isBillingConfigured } from '@template/billing'
import { InternalError } from '@template/errors'
import type { AuthSession } from '@/middleware/require-session.js'
import { buildCheckoutSession, buildPortalSession, readAccessState } from './service.js'

const requireBillingConfigured = () => {
  if (!isBillingConfigured()) {
    throw new InternalError('Billing is not configured for this environment', {
      reason: 'BillingNotConfigured'
    })
  }
}

export interface CreateCheckoutInput {
  plan: string
  authSession: AuthSession
}

export const createCheckoutSessionController = async (input: CreateCheckoutInput) => {
  requireBillingConfigured()

  return buildCheckoutSession({
    userId: input.authSession.userId,
    userEntityId: input.authSession.userEntityId,
    email: input.authSession.email,
    plan: input.plan
  })
}

export const createPortalSessionController = async (session: AuthSession) => {
  requireBillingConfigured()

  return buildPortalSession(session.userId)
}

export const getAccessStateController = async (session: AuthSession) =>
  readAccessState(session.userId)

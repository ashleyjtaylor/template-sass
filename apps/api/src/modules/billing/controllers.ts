import { isBillingConfigured } from '@template-sass/billing'
import { InternalError } from '@template-sass/errors'
import type { AuthSession } from '@/middleware/require-session.js'
import {
  buildCheckoutSession,
  buildPortalSession,
  executeUpgrade,
  previewUpgrade,
  readAccessState
} from './service.js'

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

export const getAccessStateController = async (session: AuthSession) => {
  return readAccessState(session.userId)
}

export interface PreviewPlanChangeControllerInput {
  plan: string
  authSession: AuthSession
}

export const previewPlanChangeController = async (input: PreviewPlanChangeControllerInput) => {
  requireBillingConfigured()

  return previewUpgrade(input.authSession.userId, input.plan)
}

export interface ChangePlanControllerInput {
  plan: string
  prorationDateUnix?: number
  authSession: AuthSession
}

export const changePlanController = async (input: ChangePlanControllerInput) => {
  requireBillingConfigured()

  await executeUpgrade(input.authSession.userId, input.plan, input.prorationDateUnix)

  return { status: 'ok' as const }
}

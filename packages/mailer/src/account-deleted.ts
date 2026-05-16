import { env } from './env.js'
import { renderAccountDeleted } from './templates/account-deleted.js'
import { getTransport } from './transport.js'

export interface SendAccountDeletedInput {
  to: string
  firstname?: string | undefined
  supportEmail?: string | undefined
}

// Dispatched from the Stripe webhook (after a scheduled hard-delete) and
// inline from POST /api/account/schedule-deletion (for users with no
// active subscription). Mirrors `sendPasswordReset`: throws on missing
// MAIL_FROM so the caller can decide whether to swallow.
export async function sendAccountDeleted({
  to,
  firstname,
  supportEmail
}: SendAccountDeletedInput): Promise<void> {
  if (env.MAIL_FROM.length === 0) {
    throw new Error('Mailer not configured: MAIL_FROM is required to send email.')
  }

  const rendered = renderAccountDeleted({ firstname, supportEmail })

  await getTransport().send({
    to,
    from: env.MAIL_FROM,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text
  })
}

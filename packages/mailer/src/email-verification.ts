import { env } from './env.js'
import { renderEmailVerification } from './templates/email-verification.js'
import { getTransport } from './transport.js'

export interface SendEmailVerificationInput {
  to: string
  firstname?: string | undefined
  verifyUrl: string
}

// Renders the email-verification template and dispatches via the configured
// transport. Throws if MAIL_FROM is unset — caller (better-auth's
// sendVerificationEmail callback) is expected to catch and log, so a
// misconfigured fork still boots and the user-facing signup response
// stays a generic 200.
export async function sendEmailVerification({
  to,
  firstname,
  verifyUrl
}: SendEmailVerificationInput): Promise<void> {
  if (env.MAIL_FROM.length === 0) {
    throw new Error('Mailer not configured: MAIL_FROM is required to send email.')
  }

  const rendered = renderEmailVerification({ firstname, verifyUrl })

  await getTransport().send({
    to,
    from: env.MAIL_FROM,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text
  })
}

import { env } from './env.js'
import { renderPasswordReset } from './templates/password-reset.js'
import { getTransport } from './transport.js'

export interface SendPasswordResetInput {
  to: string
  firstname?: string | undefined
  resetUrl: string
}

// Renders the password-reset template and dispatches via the configured
// transport. Throws if MAIL_FROM is unset — caller (better-auth's
// sendResetPassword callback) is expected to catch and log, so the
// user-facing response remains a generic 200.
export async function sendPasswordReset({
  to,
  firstname,
  resetUrl
}: SendPasswordResetInput): Promise<void> {
  if (env.MAIL_FROM.length === 0) {
    throw new Error('Mailer not configured: MAIL_FROM is required to send email.')
  }

  const rendered = renderPasswordReset({ firstname, resetUrl })

  await getTransport().send({
    to,
    from: env.MAIL_FROM,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text
  })
}

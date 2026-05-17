import { env } from './env.js'
import { renderWelcome } from './templates/welcome.js'
import { getTransport } from './transport.js'

export interface SendWelcomeInput {
  to: string
  firstname?: string | undefined
  dashboardUrl: string
}

// Renders the welcome template and dispatches via the configured
// transport. Throws if MAIL_FROM is unset — caller (the auth-side
// `sendWelcomeSafely` wrapper) is expected to catch and log, so a
// misconfigured fork still completes signup / verification cleanly
// without the welcome bonus.
export async function sendWelcome({
  to,
  firstname,
  dashboardUrl
}: SendWelcomeInput): Promise<void> {
  if (env.MAIL_FROM.length === 0) {
    throw new Error('Mailer not configured: MAIL_FROM is required to send email.')
  }

  const rendered = renderWelcome({ firstname, dashboardUrl })

  await getTransport().send({
    to,
    from: env.MAIL_FROM,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text
  })
}

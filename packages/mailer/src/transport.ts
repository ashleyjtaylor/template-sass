import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { createTransport, type Transporter } from 'nodemailer'
import { env } from './env.js'

export interface SendInput {
  to: string
  from: string
  subject: string
  html: string
  text: string
}

export interface MailTransport {
  send(input: SendInput): Promise<void>
}

class SesTransport implements MailTransport {
  private client: SESv2Client

  constructor() {
    // AWS_REGION is provided by the ECS task environment in deployed envs.
    // The SDK falls back to its default credential chain (task role).
    this.client = new SESv2Client({})
  }

  async send(input: SendInput): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: input.from,
        Destination: { ToAddresses: [input.to] },
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: input.html, Charset: 'UTF-8' },
              Text: { Data: input.text, Charset: 'UTF-8' }
            }
          }
        }
      })
    )
  }
}

class SmtpTransport implements MailTransport {
  private transporter: Transporter

  constructor() {
    // Defaults target the Mailpit container in docker-compose.yml. No
    // auth — Mailpit accepts every connection on :1025 unencrypted.
    this.transporter = createTransport({
      host: env.MAIL_SMTP_HOST,
      port: env.MAIL_SMTP_PORT,
      secure: false,
      ignoreTLS: true
    })
  }

  async send(input: SendInput): Promise<void> {
    await this.transporter.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  }
}

// Lazily-initialised transport singleton. Tests swap this via
// `setTransport` so they never reach SES or a real SMTP server.
let cached: MailTransport | undefined

export function getTransport(): MailTransport {
  if (cached) return cached

  // Local dev → Mailpit over SMTP. Deployed envs (staging, production)
  // → SES. See code-style skill, "Environment Variables".
  cached = env.APP_ENV === 'local' ? new SmtpTransport() : new SesTransport()

  return cached
}

// Test seam — pass a stub transport to bypass the network.
export function setTransport(transport: MailTransport): void {
  cached = transport
}

export function resetTransport(): void {
  cached = undefined
}

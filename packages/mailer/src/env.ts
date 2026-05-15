import { z } from 'zod'

// Mailer env vars. Transport selection branches on APP_ENV (the same
// `local | staging | production` the API uses) — see code-style skill,
// "Environment Variables": don't invent a transport flag, just fork on
// the env we already have.
//
// Why MAIL_FROM tolerates an empty default: a freshly-bootstrapped
// staging that hasn't been wired to an SES identity should still boot.
// `sendPasswordReset` throws at call time (caught + logged by the
// better-auth callback) so the user-facing flow still 200s without
// leaking misconfiguration.
const schema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  MAIL_FROM: z.string().default(''),
  // SMTP host/port are only consulted in `local` (Mailpit). Defaults
  // match docker-compose.yml.
  MAIL_SMTP_HOST: z.string().default('localhost'),
  MAIL_SMTP_PORT: z.coerce.number().int().positive().default(1025)
})

export const env = schema.parse(process.env)

// True iff a fork has configured a From address. The forget-password
// callback calls this before invoking sendPasswordReset; if false, the
// callback logs and returns void so the user-facing response is still
// the generic "check your inbox" 200.
export function isMailerConfigured(): boolean {
  return env.MAIL_FROM.length > 0
}

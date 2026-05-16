import { request } from '@playwright/test'

const MAILPIT_URL = process.env['E2E_MAILPIT_URL'] ?? 'http://localhost:8025'

interface MailpitMessage {
  ID: string
  To: { Address: string }[]
  From: { Address: string }
  Subject: string
}

interface MailpitMessageBody {
  Text: string
  HTML: string
}

export async function flushMessages(): Promise<void> {
  const ctx = await request.newContext({ baseURL: MAILPIT_URL })

  await ctx.delete('/api/v1/messages')
  await ctx.dispose()
}

// Polls Mailpit's HTTP API until a message addressed to `to` shows up,
// or `timeoutMs` elapses. Returns the message body so callers can pull
// the reset URL out of it.
export async function waitForMessage({
  to,
  timeoutMs = 10_000
}: {
  to: string
  timeoutMs?: number
}): Promise<MailpitMessageBody> {
  const ctx = await request.newContext({ baseURL: MAILPIT_URL })
  const deadline = Date.now() + timeoutMs

  try {
    while (Date.now() < deadline) {
      const res = await ctx.get('/api/v1/messages')

      if (res.ok()) {
        const data = (await res.json()) as { messages: MailpitMessage[] }
        const match = data.messages.find((m) => m.To.some((addr) => addr.Address === to))

        if (match) {
          const bodyRes = await ctx.get(`/api/v1/message/${match.ID}`)

          if (!bodyRes.ok()) {
            throw new Error(`Mailpit message body fetch failed: ${bodyRes.status()}`)
          }

          return (await bodyRes.json()) as MailpitMessageBody
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    throw new Error(
      `No mailpit message to ${to} within ${timeoutMs}ms — check that mailpit is up on ${MAILPIT_URL} and that sendResetPassword is firing`
    )
  } finally {
    await ctx.dispose()
  }
}

// The reset URL better-auth generates is
//   <BETTER_AUTH_URL>/api/auth/reset-password/<token>?callbackURL=<spa>/reset-password
// We extract it from the plaintext body — the HTML body wraps the same
// URL in an <a href> but the text version is a stable, single line.
export function extractResetUrl(body: MailpitMessageBody): string {
  const match = body.Text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/)

  if (!match) {
    throw new Error(
      `Could not find a reset URL in the email body. First 300 chars:\n${body.Text.slice(0, 300)}`
    )
  }

  return match[0]
}

export interface RenderPasswordResetInput {
  firstname?: string | undefined
  resetUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

// Plain inline template. No JSX, no MJML — kept readable so visual
// changes don't need a render pipeline. When a second email type
// arrives, factor a tiny shared layout helper; until then, two strings
// is less code than two layers.
export function renderPasswordReset({
  firstname,
  resetUrl
}: RenderPasswordResetInput): RenderedEmail {
  const greeting = firstname ? `Hi ${firstname},` : 'Hi,'

  const text = `${greeting}

We received a request to reset your password. Open the link below to choose a new one. It expires in 1 hour.

${resetUrl}

If you didn't request this, you can safely ignore this email — your password won't change.
`

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:14px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 16px;font-size:14px;">We received a request to reset your password. Click the button below to choose a new one. The link expires in 1 hour.</p>
          <p style="margin:24px 0;">
            <a href="${escapeAttr(resetUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:6px;">Reset password</a>
          </p>
          <p style="margin:0 0 16px;font-size:12px;color:#666;">Or paste this URL into your browser:<br><span style="word-break:break-all;">${escapeHtml(resetUrl)}</span></p>
          <p style="margin:24px 0 0;font-size:12px;color:#666;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject: 'Reset your password',
    html,
    text
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value)
}

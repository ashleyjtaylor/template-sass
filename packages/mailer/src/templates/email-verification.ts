export interface RenderEmailVerificationInput {
  firstname?: string | undefined
  verifyUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderEmailVerification({
  firstname,
  verifyUrl
}: RenderEmailVerificationInput): RenderedEmail {
  const greeting = firstname ? `Hi ${firstname},` : 'Hi,'

  const text = `${greeting}

Thanks for signing up. Verify your email address by opening the link below. It expires in 24 hours.

${verifyUrl}

If you didn't sign up, you can safely ignore this email.
`

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:14px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 16px;font-size:14px;">Thanks for signing up. Click the button below to verify your email address. The link expires in 24 hours.</p>
          <p style="margin:24px 0;">
            <a href="${escapeAttr(verifyUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:6px;">Verify email</a>
          </p>
          <p style="margin:0 0 16px;font-size:12px;color:#666;">Or paste this URL into your browser:<br><span style="word-break:break-all;">${escapeHtml(verifyUrl)}</span></p>
          <p style="margin:24px 0 0;font-size:12px;color:#666;">If you didn't sign up, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject: 'Verify your email',
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

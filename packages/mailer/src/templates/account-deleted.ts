export interface RenderAccountDeletedInput {
  firstname?: string | undefined
  supportEmail?: string | undefined
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderAccountDeleted({
  firstname,
  supportEmail
}: RenderAccountDeletedInput): RenderedEmail {
  const greeting = firstname ? `Hi ${firstname},` : 'Hi,'
  const supportLine = supportEmail
    ? `If this wasn't you or you have questions, contact ${supportEmail}.`
    : "If this wasn't you or you have questions, get in touch with support."
  const deletedAt = new Date().toISOString()

  const text = `${greeting}

Your account has been deleted. All personal data tied to your profile has been removed from our systems.

Deletion completed: ${deletedAt}

${supportLine}
`

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;line-height:1.5;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:14px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 16px;font-size:14px;">Your account has been deleted. All personal data tied to your profile has been removed from our systems.</p>
          <p style="margin:0 0 16px;font-size:12px;color:#666;">Deletion completed: <span style="color:#111;">${escapeHtml(deletedAt)}</span></p>
          <p style="margin:24px 0 0;font-size:12px;color:#666;">${escapeHtml(supportLine)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject: 'Your account has been deleted',
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

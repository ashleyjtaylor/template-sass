import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendAccountDeleted } from '../../src/account-deleted.js'
import { renderAccountDeleted } from '../../src/templates/account-deleted.js'
import {
  type MailTransport,
  resetTransport,
  type SendInput,
  setTransport
} from '../../src/transport.js'

class CapturingTransport implements MailTransport {
  sent: SendInput[] = []

  async send(input: SendInput): Promise<void> {
    this.sent.push(input)
  }
}

describe('renderAccountDeleted', () => {
  it('renders both HTML and text bodies with a personalised greeting', () => {
    const result = renderAccountDeleted({ firstname: 'Alex' })

    expect(result.subject).toBe('Your account has been deleted')
    expect(result.text).toContain('Hi Alex,')
    expect(result.html).toContain('Hi Alex,')
  })

  it('falls back to a neutral greeting when firstname is missing', () => {
    const result = renderAccountDeleted({})

    expect(result.text).toContain('Hi,')
    expect(result.html).toContain('Hi,')
  })

  it('includes a deletion timestamp', () => {
    const result = renderAccountDeleted({ firstname: 'Sam' })

    expect(result.text).toMatch(/Deletion completed: \d{4}-\d{2}-\d{2}T/)
    expect(result.html).toMatch(/Deletion completed/)
  })

  it('mentions the configured support email when provided', () => {
    const result = renderAccountDeleted({
      firstname: 'Sam',
      supportEmail: 'help@example.com'
    })

    expect(result.text).toContain('help@example.com')
    expect(result.html).toContain('help@example.com')
  })

  it('escapes HTML in the firstname to prevent injection', () => {
    const result = renderAccountDeleted({ firstname: '<script>alert(1)</script>' })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})

describe('sendAccountDeleted', () => {
  let transport: CapturingTransport

  beforeEach(() => {
    transport = new CapturingTransport()
    setTransport(transport)
  })

  afterEach(() => {
    resetTransport()
    vi.unstubAllEnvs()
  })

  it('dispatches via the configured transport with the env MAIL_FROM address', async () => {
    await sendAccountDeleted({ to: 'user@example.com', firstname: 'Sam' })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: 'user@example.com',
      from: 'test@example.com',
      subject: 'Your account has been deleted'
    })
  })

  it('throws when MAIL_FROM is unset, so the caller can log without leaking', async () => {
    const envModule = await import('../../src/env.js')
    const original = envModule.env.MAIL_FROM

    Object.assign(envModule.env, { MAIL_FROM: '' })

    try {
      await expect(
        sendAccountDeleted({ to: 'user@example.com', firstname: 'Sam' })
      ).rejects.toThrow(/MAIL_FROM is required/)
      expect(transport.sent).toHaveLength(0)
    } finally {
      Object.assign(envModule.env, { MAIL_FROM: original })
    }
  })
})

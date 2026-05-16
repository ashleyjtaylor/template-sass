import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmailVerification } from '../../src/email-verification.js'
import { renderEmailVerification } from '../../src/templates/email-verification.js'
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

describe('renderEmailVerification', () => {
  it('renders both HTML and text bodies with the verify URL', () => {
    const result = renderEmailVerification({
      firstname: 'Alex',
      verifyUrl: 'https://app.example/verify?token=abc'
    })

    expect(result.subject).toBe('Verify your email')
    expect(result.text).toContain('Hi Alex,')
    expect(result.text).toContain('https://app.example/verify?token=abc')
    expect(result.html).toContain('Hi Alex,')
    expect(result.html).toContain('https://app.example/verify?token=abc')
  })

  it('falls back to a neutral greeting when firstname is missing', () => {
    const result = renderEmailVerification({ verifyUrl: 'https://app.example/verify?token=abc' })

    expect(result.text).toContain('Hi,')
    expect(result.html).toContain('Hi,')
  })

  it('escapes HTML in the firstname to prevent injection', () => {
    const result = renderEmailVerification({
      firstname: '<script>alert(1)</script>',
      verifyUrl: 'https://app.example/verify?token=abc'
    })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})

describe('sendEmailVerification', () => {
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
    await sendEmailVerification({
      to: 'user@example.com',
      firstname: 'Sam',
      verifyUrl: 'https://app.example/verify?token=xyz'
    })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: 'user@example.com',
      from: 'test@example.com',
      subject: 'Verify your email'
    })
    expect(transport.sent[0]?.html).toContain('https://app.example/verify?token=xyz')
    expect(transport.sent[0]?.text).toContain('https://app.example/verify?token=xyz')
  })

  it('throws when MAIL_FROM is unset, so the better-auth callback can log without leaking', async () => {
    const envModule = await import('../../src/env.js')
    const original = envModule.env.MAIL_FROM

    Object.assign(envModule.env, { MAIL_FROM: '' })

    try {
      await expect(
        sendEmailVerification({
          to: 'user@example.com',
          verifyUrl: 'https://app.example/verify?token=xyz'
        })
      ).rejects.toThrow(/MAIL_FROM is required/)
      expect(transport.sent).toHaveLength(0)
    } finally {
      Object.assign(envModule.env, { MAIL_FROM: original })
    }
  })
})

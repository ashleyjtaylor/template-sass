import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPasswordReset } from '../../src/password-reset.js'
import { renderPasswordReset } from '../../src/templates/password-reset.js'
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

describe('renderPasswordReset', () => {
  it('renders both HTML and text bodies with the reset URL', () => {
    const result = renderPasswordReset({
      firstname: 'Alex',
      resetUrl: 'https://app.example/reset?token=abc'
    })

    expect(result.subject).toBe('Reset your password')
    expect(result.text).toContain('Hi Alex,')
    expect(result.text).toContain('https://app.example/reset?token=abc')
    expect(result.html).toContain('Hi Alex,')
    expect(result.html).toContain('https://app.example/reset?token=abc')
  })

  it('falls back to a neutral greeting when firstname is missing', () => {
    const result = renderPasswordReset({ resetUrl: 'https://app.example/reset?token=abc' })

    expect(result.text).toContain('Hi,')
    expect(result.html).toContain('Hi,')
  })

  it('escapes HTML in the firstname to prevent injection', () => {
    const result = renderPasswordReset({
      firstname: '<script>alert(1)</script>',
      resetUrl: 'https://app.example/reset?token=abc'
    })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})

describe('sendPasswordReset', () => {
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
    await sendPasswordReset({
      to: 'user@example.com',
      firstname: 'Sam',
      resetUrl: 'https://app.example/reset?token=xyz'
    })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: 'user@example.com',
      from: 'test@example.com',
      subject: 'Reset your password'
    })
    expect(transport.sent[0]?.html).toContain('https://app.example/reset?token=xyz')
    expect(transport.sent[0]?.text).toContain('https://app.example/reset?token=xyz')
  })

  it('throws when MAIL_FROM is unset, so the better-auth callback can log without leaking', async () => {
    // env.ts captured MAIL_FROM at module-load time; reach in and override
    // the cached value to exercise the guard.
    const envModule = await import('../../src/env.js')
    const original = envModule.env.MAIL_FROM

    Object.assign(envModule.env, { MAIL_FROM: '' })

    try {
      await expect(
        sendPasswordReset({
          to: 'user@example.com',
          resetUrl: 'https://app.example/reset?token=xyz'
        })
      ).rejects.toThrow(/MAIL_FROM is required/)
      expect(transport.sent).toHaveLength(0)
    } finally {
      Object.assign(envModule.env, { MAIL_FROM: original })
    }
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWelcome } from '../../src/templates/welcome.js'
import {
  type MailTransport,
  resetTransport,
  type SendInput,
  setTransport
} from '../../src/transport.js'
import { sendWelcome } from '../../src/welcome.js'

class CapturingTransport implements MailTransport {
  sent: SendInput[] = []

  async send(input: SendInput): Promise<void> {
    this.sent.push(input)
  }
}

describe('renderWelcome', () => {
  it('renders both HTML and text bodies with the dashboard URL', () => {
    const result = renderWelcome({
      firstname: 'Alex',
      dashboardUrl: 'https://app.example/dashboard'
    })

    expect(result.subject).toBe('Welcome')
    expect(result.text).toContain('Hi Alex,')
    expect(result.text).toContain('https://app.example/dashboard')
    expect(result.html).toContain('Hi Alex,')
    expect(result.html).toContain('https://app.example/dashboard')
  })

  it('falls back to a neutral greeting when firstname is missing', () => {
    const result = renderWelcome({ dashboardUrl: 'https://app.example/dashboard' })

    expect(result.text).toContain('Hi,')
    expect(result.html).toContain('Hi,')
  })

  it('escapes HTML in the firstname to prevent injection', () => {
    const result = renderWelcome({
      firstname: '<script>alert(1)</script>',
      dashboardUrl: 'https://app.example/dashboard'
    })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})

describe('sendWelcome', () => {
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
    await sendWelcome({
      to: 'user@example.com',
      firstname: 'Sam',
      dashboardUrl: 'https://app.example/dashboard'
    })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]).toMatchObject({
      to: 'user@example.com',
      from: 'test@example.com',
      subject: 'Welcome'
    })
    expect(transport.sent[0]?.html).toContain('https://app.example/dashboard')
    expect(transport.sent[0]?.text).toContain('https://app.example/dashboard')
  })

  it('throws when MAIL_FROM is unset, so the auth-side wrapper can log without leaking', async () => {
    const envModule = await import('../../src/env.js')
    const original = envModule.env.MAIL_FROM

    Object.assign(envModule.env, { MAIL_FROM: '' })

    try {
      await expect(
        sendWelcome({
          to: 'user@example.com',
          dashboardUrl: 'https://app.example/dashboard'
        })
      ).rejects.toThrow(/MAIL_FROM is required/)
      expect(transport.sent).toHaveLength(0)
    } finally {
      Object.assign(envModule.env, { MAIL_FROM: original })
    }
  })
})

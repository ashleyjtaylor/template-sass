import { afterEach, describe, expect, it } from 'vitest'
import { getTransport, resetTransport } from '../../src/transport.js'

describe('getTransport', () => {
  afterEach(() => resetTransport())

  it('returns a singleton across calls', () => {
    const first = getTransport()
    const second = getTransport()

    expect(first).toBe(second)
  })

  it('returns an SMTP transport when APP_ENV=local (the vitest default)', () => {
    const transport = getTransport()

    // We can't introspect the nodemailer instance directly without
    // attempting a connection, but the class name is stable.
    expect(transport.constructor.name).toBe('SmtpTransport')
  })
})

describe('isMailerConfigured', () => {
  it('is true when MAIL_FROM is set (vitest env supplies test@example.com)', async () => {
    const { isMailerConfigured } = await import('../../src/env.js')

    expect(isMailerConfigured()).toBe(true)
  })
})

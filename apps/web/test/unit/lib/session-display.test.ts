import { describe, expect, it } from 'vitest'
import { describeLastActive, describeUserAgent } from '@/lib/session-display'

describe('describeUserAgent', () => {
  it('parses Chrome on macOS into a friendly label', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    expect(describeUserAgent(ua)).toBe('Chrome on macOS')
  })

  it('parses Safari on iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'

    expect(describeUserAgent(ua)).toBe('Mobile Safari on iOS')
  })

  it('falls back to "Unknown device" when the UA is null/undefined', () => {
    expect(describeUserAgent(null)).toBe('Unknown device')
    expect(describeUserAgent(undefined)).toBe('Unknown device')
  })

  it('falls back to "Unknown device" for unparseable strings', () => {
    expect(describeUserAgent('something-not-a-ua')).toBe('Unknown device')
  })
})

describe('describeLastActive', () => {
  const now = new Date('2026-05-17T12:00:00Z')

  it('returns "Active now" within the first minute', () => {
    expect(describeLastActive(new Date('2026-05-17T11:59:30Z'), now)).toBe('Active now')
  })

  it('returns minutes when under an hour', () => {
    expect(describeLastActive(new Date('2026-05-17T11:55:00Z'), now)).toBe('5 minutes ago')
    expect(describeLastActive(new Date('2026-05-17T11:59:00Z'), now)).toBe('1 minute ago')
  })

  it('returns hours when under a day', () => {
    expect(describeLastActive(new Date('2026-05-17T10:00:00Z'), now)).toBe('2 hours ago')
    expect(describeLastActive(new Date('2026-05-17T11:00:00Z'), now)).toBe('1 hour ago')
  })

  it('returns days when under a month', () => {
    expect(describeLastActive(new Date('2026-05-14T12:00:00Z'), now)).toBe('3 days ago')
    expect(describeLastActive(new Date('2026-05-16T12:00:00Z'), now)).toBe('1 day ago')
  })

  it('returns months for older sessions', () => {
    expect(describeLastActive(new Date('2026-03-17T12:00:00Z'), now)).toBe('2 months ago')
  })
})

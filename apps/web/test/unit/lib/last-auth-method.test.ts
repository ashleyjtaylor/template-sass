import { describe, expect, it } from 'vitest'
import { clearLastAuthMethod, getLastAuthMethod, setLastAuthMethod } from '@/lib/last-auth-method'

describe('last-auth-method', () => {
  it('returns null when no value has been stored', () => {
    expect(getLastAuthMethod()).toBeNull()
  })

  it('round-trips an email choice', () => {
    setLastAuthMethod('email')
    expect(getLastAuthMethod()).toBe('email')
  })

  it('round-trips a google choice', () => {
    setLastAuthMethod('google')
    expect(getLastAuthMethod()).toBe('google')
  })

  it('overwrites the prior value', () => {
    setLastAuthMethod('email')
    setLastAuthMethod('google')
    expect(getLastAuthMethod()).toBe('google')
  })

  it('returns null when localStorage holds an unrecognised value', () => {
    window.localStorage.setItem('lastAuthMethod', 'sms')
    expect(getLastAuthMethod()).toBeNull()
  })

  it('clear() removes the stored value', () => {
    setLastAuthMethod('google')
    expect(getLastAuthMethod()).toBe('google')

    clearLastAuthMethod()
    expect(getLastAuthMethod()).toBeNull()
  })
})

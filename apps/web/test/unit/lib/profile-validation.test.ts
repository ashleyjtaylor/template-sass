import { describe, expect, it } from 'vitest'
import {
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateName,
  validatePassword
} from '@/lib/profile-validation'

describe('validateName', () => {
  it('returns null for normal first + last names', () => {
    expect(validateName('Sam', 'Lee')).toBeNull()
  })

  it('trims before checking length so whitespace-only inputs are rejected', () => {
    expect(validateName('   ', 'Lee')).toBe('FIRSTNAME_REQUIRED')
    expect(validateName('Sam', '\t\t')).toBe('LASTNAME_REQUIRED')
  })

  it('rejects empty inputs', () => {
    expect(validateName('', 'Lee')).toBe('FIRSTNAME_REQUIRED')
    expect(validateName('Sam', '')).toBe('LASTNAME_REQUIRED')
  })

  it('enforces the max length cap on each field', () => {
    const tooLong = 'x'.repeat(NAME_MAX_LENGTH + 1)
    expect(validateName(tooLong, 'Lee')).toBe('FIRSTNAME_TOO_LONG')
    expect(validateName('Sam', tooLong)).toBe('LASTNAME_TOO_LONG')
  })

  it('accepts names exactly at the max length', () => {
    const justRight = 'x'.repeat(NAME_MAX_LENGTH)
    expect(validateName(justRight, justRight)).toBeNull()
  })
})

describe('validatePassword', () => {
  it('returns null for a valid current/new/confirm trio', () => {
    expect(validatePassword('oldpass1', 'newpass1', 'newpass1')).toBeNull()
  })

  it('rejects a new password shorter than the floor', () => {
    const tooShort = 'x'.repeat(PASSWORD_MIN_LENGTH - 1)
    expect(validatePassword('oldpass1', tooShort, tooShort)).toBe('NEW_PASSWORD_TOO_SHORT')
  })

  it('rejects a confirm that does not match the new password', () => {
    expect(validatePassword('oldpass1', 'newpass1', 'newpass2')).toBe('CONFIRM_MISMATCH')
  })

  it('rejects a new password identical to the current one', () => {
    expect(validatePassword('samepass', 'samepass', 'samepass')).toBe('SAME_AS_CURRENT')
  })
})

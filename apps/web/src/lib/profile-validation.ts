// Client-side validation for the account page. Cheap pre-flight checks
// that catch obvious mistakes without the API round-trip. The server is
// still authoritative — better-auth enforces password rules + the
// additionalFields `required: true` on firstname/lastname.

export const NAME_MAX_LENGTH = 50
export const PASSWORD_MIN_LENGTH = 8

export type NameValidationError =
  | 'FIRSTNAME_REQUIRED'
  | 'FIRSTNAME_TOO_LONG'
  | 'LASTNAME_REQUIRED'
  | 'LASTNAME_TOO_LONG'

export function validateName(firstname: string, lastname: string): NameValidationError | null {
  const f = firstname.trim()
  const l = lastname.trim()

  if (f.length === 0) {
    return 'FIRSTNAME_REQUIRED'
  }

  if (f.length > NAME_MAX_LENGTH) {
    return 'FIRSTNAME_TOO_LONG'
  }

  if (l.length === 0) {
    return 'LASTNAME_REQUIRED'
  }

  if (l.length > NAME_MAX_LENGTH) {
    return 'LASTNAME_TOO_LONG'
  }

  return null
}

export type PasswordValidationError =
  | 'NEW_PASSWORD_TOO_SHORT'
  | 'CONFIRM_MISMATCH'
  | 'SAME_AS_CURRENT'

export function validatePassword(
  currentPassword: string,
  newPassword: string,
  confirm: string
): PasswordValidationError | null {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return 'NEW_PASSWORD_TOO_SHORT'
  }

  if (newPassword !== confirm) {
    return 'CONFIRM_MISMATCH'
  }

  if (currentPassword === newPassword) {
    return 'SAME_AS_CURRENT'
  }

  return null
}

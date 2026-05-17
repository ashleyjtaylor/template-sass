// Per-device hint stored in localStorage so a returning visitor's
// /login (and /signup) renders a small "Last used" pill next to the
// auth method they used most recently. Cleared on neither sign-out
// nor session expiry — the audience this serves is precisely the
// signed-out returner who's forgotten which method they used.

const STORAGE_KEY = 'lastAuthMethod'

export type AuthMethod = 'email' | 'google'

const isAuthMethod = (value: unknown): value is AuthMethod =>
  value === 'email' || value === 'google'

export function getLastAuthMethod(): AuthMethod | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isAuthMethod(raw) ? raw : null
  } catch {
    // localStorage access can throw in Safari private mode and inside
    // sandboxed iframes. A missing hint is the harmless default.
    return null
  }
}

export function setLastAuthMethod(method: AuthMethod): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, method)
  } catch {
    // Same swallow rationale as the read path. The badge just won't
    // render on the next visit if storage isn't writable.
  }
}

// Called on account delete — once the user is gone, a stale marker
// would mislead a fresh signup on the same device (the new user might
// pick a different method but see the prior owner's hint). NOT called
// on sign-out, where the marker is what we want a returner to see.
export function clearLastAuthMethod(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Swallow per the read/write paths.
  }
}

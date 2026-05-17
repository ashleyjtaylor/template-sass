import { UAParser } from 'ua-parser-js'

// Parses a raw User-Agent string into a friendly label like
// "Chrome on macOS". Returns "Unknown device" when the UA is missing
// or unparseable so the UI always has something to render.
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'

  const parsed = new UAParser(userAgent).getResult()
  const browser = parsed.browser.name
  const os = parsed.os.name

  if (browser && os) return `${browser} on ${os}`
  if (browser) return browser
  if (os) return os

  return 'Unknown device'
}

// Friendly relative-time label for the "last active" / "created at"
// column. Buckets that read naturally without pulling in a full date
// library — the session list never shows precision below a minute.
export function describeLastActive(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'Active now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`

  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

import { prisma } from '@template-sass/db'

// Deletes only the user rows the e2e suite created this session, plus
// the better-auth verification rows keyed to those emails. Session,
// account, and subscription cascade off user (see schema). stripe_event
// is webhook-dedup data, not user-scoped — left alone.
//
// Email shape comes from fixtures/auth.ts#makeUser:
//   `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`
// Targeted by prefix + domain rather than a blanket TRUNCATE so the
// suite is safe to run against any database, including the developer's
// local dev DB. Called once from global-teardown.ts at suite end.
export async function deleteE2eUsers(): Promise<{ users: number; verifications: number }> {
  const users = await prisma.user.deleteMany({
    where: { email: { startsWith: 'e2e-', endsWith: '@example.com' } }
  })

  // better-auth's verification rows are keyed by `identifier` (the email
  // being verified / reset). Delete by the same pattern so password-reset
  // / email-verification specs don't leave pending-token rows behind.
  const verifications = await prisma.verification.deleteMany({
    where: { identifier: { startsWith: 'e2e-', endsWith: '@example.com' } }
  })

  return { users: users.count, verifications: verifications.count }
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

export { prisma }

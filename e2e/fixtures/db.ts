import { prisma } from '@template-sass/db'

// Truncates every table the smoke suite writes to, in dependency order.
// CASCADE handles the rest (Session/Account/Subscription cascade off User).
// Run from `beforeEach` in every spec — a 30 s suite cleaning up a few rows
// is cheap, and starting from a known state makes failures debuggable.
export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "verification", "session", "account", "subscription", "stripe_event", "user" RESTART IDENTITY CASCADE'
  )
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

export { prisma }

import { deleteE2eUsers, disconnect } from './fixtures/db.js'

// Pre-run sweep. global-teardown.ts cleans up e2e rows after a normal
// run, but an interrupted run (Ctrl-C) or UI-mode session that's just
// closed never fires teardown, leaving e2e- users behind. Sweeping the
// same e2e-scoped rows here means the next run always starts clean, so
// accumulation is bounded to at most one aborted run's worth.
export default async function globalSetup(): Promise<void> {
  try {
    const { users, verifications } = await deleteE2eUsers()
    if (users > 0 || verifications > 0) {
      console.log(
        `[e2e setup] swept ${users} leftover user row(s) and ${verifications} verification row(s)`
      )
    }
  } catch (err) {
    console.error('[e2e setup] pre-run sweep failed (non-fatal):', err)
  } finally {
    await disconnect()
  }
}

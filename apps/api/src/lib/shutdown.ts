import { logger } from '@/lib/logger.js'

export interface ShutdownOptions {
  timeoutMs: number
  // Resource cleanup that runs *after* the HTTP server has drained
  // in-flight requests but *before* the process exits. Each hook is awaited
  // in order; failures are logged but do not block exit. Use this for
  // closing DB connection pools, queue clients, etc.
  beforeExit?: (() => Promise<void> | void)[]
}

// Structural type so this works with both node:http's Server and whatever
// @hono/node-server's `serve()` returns (HttpServer | Http2Server | ...).
export interface ClosableServer {
  close(callback?: (err?: Error) => void): void
}

export function registerShutdown(
  server: ClosableServer,
  { timeoutMs, beforeExit = [] }: ShutdownOptions
): () => void {
  let shuttingDown = false

  const runBeforeExit = async () => {
    for (const hook of beforeExit) {
      try {
        await hook()
      } catch (err) {
        logger.error({ err }, 'shutdown: beforeExit hook failed')
      }
    }
  }

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return

    shuttingDown = true

    logger.info({ signal, timeoutMs }, 'shutdown: draining in-flight requests')

    const force = setTimeout(() => {
      logger.warn({ timeoutMs }, 'shutdown: drain timed out, exiting')

      process.exit(0)
    }, timeoutMs)

    force.unref()

    server.close(async (err) => {
      if (err) {
        clearTimeout(force)
        logger.error({ err }, 'shutdown: server.close errored, exiting non-zero')

        process.exit(1)
      }

      await runBeforeExit()
      clearTimeout(force)
      logger.info('shutdown: drain complete')

      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Dev-only orphan watchdog: in `pnpm dev`, turbo's TUI / tsx watch
  // occasionally fails to forward SIGINT down the process tree, leaving the
  // API node process alive after Ctrl-C and squatting on port 3000. When the
  // parent dies, this process is reparented to PID 1 — detect that and exit
  // ourselves. Skipped in production where ECS owns the lifecycle.
  let orphanWatchdog: NodeJS.Timeout | undefined
  if (process.env['NODE_ENV'] !== 'production') {
    orphanWatchdog = setInterval(() => {
      if (process.ppid === 1) {
        logger.info('parent process gone — exiting (dev orphan watchdog)')
        process.exit(0)
      }
    }, 1000)
    orphanWatchdog.unref()
  }

  return () => {
    process.off('SIGTERM', shutdown)
    process.off('SIGINT', shutdown)
    if (orphanWatchdog) clearInterval(orphanWatchdog)
  }
}

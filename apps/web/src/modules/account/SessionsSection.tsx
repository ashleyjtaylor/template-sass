import { LogOut, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeLastActive, describeUserAgent } from '@/lib/session-display'
import {
  useActiveSessions,
  useRevokeOtherSessions,
  useRevokeSession,
  useSession
} from '@/modules/session/api'
import type { ActiveSession } from '@/modules/session/schemas'

export function SessionsSection() {
  const { session: currentSession } = useSession()
  const sessions = useActiveSessions()
  const revoke = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()

  const handleRevoke = (token: string) => {
    revoke.mutate(token, {
      onSuccess: () => toast.success('Session signed out'),
      onError: () => toast.error('Could not sign out that session. Try again.')
    })
  }

  const handleRevokeOthers = () => {
    revokeOthers.mutate(undefined, {
      onSuccess: () => toast.success('All other devices signed out'),
      onError: () => toast.error('Could not sign out other devices. Try again.')
    })
  }

  const currentEntityId = currentSession?.session.entityId
  // Sort current session first so it always anchors the top of the list.
  const ordered = (sessions.data ?? []).slice().sort((a, b) => {
    if (a.entityId === currentEntityId) return -1
    if (b.entityId === currentEntityId) return 1
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })

  const hasOthers = ordered.some((s) => s.entityId !== currentEntityId)

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Active sessions</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Devices currently signed in to your account. Sign out of any you don't recognise.
      </p>

      <div className="mt-5 divide-y rounded-md border">
        {sessions.isLoading ? (
          <>
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-16 w-full rounded-none" />
          </>
        ) : sessions.isError ? (
          <p className="px-4 py-4 text-xs text-destructive" role="alert">
            Could not load your sessions. Refresh the page to try again.
          </p>
        ) : ordered.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">No active sessions.</p>
        ) : (
          ordered.map((s) => (
            <SessionRow
              key={s.entityId}
              session={s}
              isCurrent={s.entityId === currentEntityId}
              onRevoke={() => handleRevoke(s.token)}
              revokePending={revoke.isPending && revoke.variables === s.token}
            />
          ))
        )}
      </div>

      {hasOthers && (
        <Button
          variant="outline"
          className="mt-5"
          onClick={handleRevokeOthers}
          disabled={revokeOthers.isPending}
        >
          {revokeOthers.isPending ? 'Signing out…' : 'Sign out all other devices'}
        </Button>
      )}
    </section>
  )
}

interface SessionRowProps {
  session: ActiveSession
  isCurrent: boolean
  onRevoke: () => void
  revokePending: boolean
}

function SessionRow({ session, isCurrent, onRevoke, revokePending }: SessionRowProps) {
  const device = describeUserAgent(session.userAgent)
  const lastActive = describeLastActive(session.updatedAt)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{device}</span>
          {isCurrent && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-600 dark:text-emerald-400">
              This device
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {session.ipAddress ? `${session.ipAddress} · ` : ''}
          {isCurrent ? 'Active now' : lastActive}
        </p>
      </div>
      {!isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={revokePending}
          aria-label={`Sign out ${device}`}
        >
          <LogOut className="size-3.5" />
          {revokePending ? 'Signing out…' : 'Sign out'}
        </Button>
      )}
    </div>
  )
}

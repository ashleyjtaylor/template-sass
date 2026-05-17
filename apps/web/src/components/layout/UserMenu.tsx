import { useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, CreditCard, LogOut, UserCog } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useSession, useSignOut } from '@/modules/session/api'

interface UserMenuProps {
  // When true, render just the avatar (no email, no chevron). The
  // dropdown still opens on click — only the trigger visual collapses.
  collapsed?: boolean
}

export function UserMenu({ collapsed = false }: UserMenuProps = {}) {
  const { user } = useSession()
  const signOut = useSignOut()
  const navigate = useNavigate()

  if (!user) return null

  const localPart = user.email.split('@')[0] ?? user.email
  const initials =
    localPart
      .split(/[._-]/)
      .map((s) => s.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || '?'

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSettled: () => navigate({ to: '/login' })
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={collapsed ? user.email : undefined}
        aria-label={collapsed ? user.email : undefined}
        className={cn(
          'flex items-center rounded-md text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
          collapsed ? 'justify-center p-1' : 'w-full gap-2 px-2 py-1.5'
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
          {initials}
        </span>
        {collapsed ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <DropdownMenuItem disabled className="text-xs">
          <span className="truncate">{user.email}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: '/billing' })}>
          <CreditCard className="size-3.5" />
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: '/account/profile' })}>
          <UserCog className="size-3.5" />
          Account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

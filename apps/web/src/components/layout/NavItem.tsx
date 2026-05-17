import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface NavItemProps {
  to: string
  icon: LucideIcon
  children: ReactNode
  // When true, render icon-only and centre it. Sidebar passes this
  // through based on its collapsed state. Default false so unrelated
  // call sites don't have to plumb it.
  collapsed?: boolean
}

// One sidebar nav link. TanStack Router's Link sets `data-status="active"`
// on the rendered anchor when the current URL matches `to`; styling hangs
// off that attribute so we don't need to thread isActive through props.
export function NavItem({ to, icon: Icon, children, collapsed = false }: NavItemProps) {
  return (
    <Link
      to={to}
      title={collapsed ? String(children) : undefined}
      aria-label={collapsed ? String(children) : undefined}
      className={cn(
        'flex items-center rounded-md py-1.5 text-sm text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none',
        'data-[status=active]:bg-accent data-[status=active]:text-foreground data-[status=active]:font-medium',
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'
      )}
    >
      <Icon className="size-4" />
      {collapsed ? null : children}
    </Link>
  )
}

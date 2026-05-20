import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

// Standard width + padding for every signed-in screen (dashboard,
// account, billing, …). Centralised so the shell stays visually
// consistent — new authed screens should wrap their content in this
// rather than re-deriving the max-width. Public/marketing pages
// (pricing, auth forms) set their own widths and don't use this.
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn('mx-auto max-w-5xl px-6 py-12', className)}>{children}</div>
}

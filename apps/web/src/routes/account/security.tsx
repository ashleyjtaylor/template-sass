import { createFileRoute } from '@tanstack/react-router'
import { useAccountMethods } from '@/modules/account/api'
import { DeleteAccountSection } from '@/modules/account/DeleteAccountSection'
import { PasswordSection } from '@/modules/account/PasswordSection'
import { SessionsSection } from '@/modules/account/SessionsSection'
import { useSession } from '@/modules/session/api'

export const Route = createFileRoute('/account/security')({
  component: SecurityTab
})

function SecurityTab() {
  const { user } = useSession()
  const methods = useAccountMethods()

  if (!user) {
    return null
  }

  // Default to true while methods are loading so the password section
  // doesn't flash off-then-on for the common email+password case.
  const hasPassword = methods.data?.hasPassword ?? true

  return (
    <div className="space-y-6">
      {hasPassword && <PasswordSection email={user.email} />}
      <SessionsSection />
      <DeleteAccountSection email={user.email} hasPassword={hasPassword} />
    </div>
  )
}

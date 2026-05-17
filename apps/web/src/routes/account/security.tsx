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

  if (!user) return null

  // Default to true while methods are loading so the password form
  // doesn't flash off-then-on for the common email+password case.
  // OAuth-only users briefly see the form, then it disappears on the
  // first response.
  const hasPassword = methods.data?.hasPassword ?? true

  return (
    <>
      {hasPassword ? <PasswordSection email={user.email} /> : null}
      <SessionsSection />
      <DeleteAccountSection email={user.email} hasPassword={hasPassword} />
    </>
  )
}

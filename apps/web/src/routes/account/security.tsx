import { createFileRoute } from '@tanstack/react-router'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
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

  // Default to true while methods are loading so the password section
  // doesn't flash off-then-on for the common email+password case.
  const hasPassword = methods.data?.hasPassword ?? true

  // `type='multiple'` lets the user open more than one section at a
  // time — useful when reviewing sessions while also drafting a
  // password change. All collapsed by default; the user opens what
  // they need.
  return (
    <>
      <Accordion type="multiple" className="space-y-3">
        {hasPassword && (
          <AccordionItem value="password">
            <AccordionTrigger>Password</AccordionTrigger>
            <AccordionContent>
              <PasswordSection email={user.email} />
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="sessions">
          <AccordionTrigger>Active sessions</AccordionTrigger>
          <AccordionContent>
            <SessionsSection />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-6">
        <DeleteAccountSection email={user.email} hasPassword={hasPassword} />
      </div>
    </>
  )
}

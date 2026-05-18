import { createFileRoute } from '@tanstack/react-router'
import { ProfileSection } from '@/modules/account/ProfileSection'
import { useSession } from '@/modules/session/api'

export const Route = createFileRoute('/account/profile')({
  component: ProfileTab
})

function ProfileTab() {
  const { user } = useSession()
  if (!user) {
    return null
  }

  return (
    <ProfileSection initialFirstname={user.firstname ?? ''} initialLastname={user.lastname ?? ''} />
  )
}

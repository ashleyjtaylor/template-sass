import { createFileRoute, redirect } from '@tanstack/react-router'

// Bare /account → redirect to the first tab. `throw redirect` from
// `beforeLoad` runs before the component, so the user never sees a
// flash of empty content.
export const Route = createFileRoute('/account/')({
  beforeLoad: () => {
    throw redirect({ to: '/account/profile' })
  }
})

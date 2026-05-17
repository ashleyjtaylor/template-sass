import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSignInWithGoogle } from './api'

interface GoogleSignInButtonProps {
  // Where better-auth should redirect after a successful OAuth callback.
  // Computed by the caller because it varies with the ?plan param on the
  // current page (so a Stripe checkout bounce can fire from /dashboard).
  callbackURL: string
  // Where to land if the user cancels at Google or any step errors. The
  // SPA reads ?error= on that page and toasts. Usually the caller passes
  // the current page's URL (with no plan param) so the user can retry.
  errorCallbackURL: string
  // Whether to render the "Last used" pill on this button. Driven by
  // lib/last-auth-method on the calling route.
  lastUsed: boolean
}

export function GoogleSignInButton({
  callbackURL,
  errorCallbackURL,
  lastUsed
}: GoogleSignInButtonProps) {
  const mutation = useSignInWithGoogle()

  const handleClick = () => {
    mutation.mutate({ callbackURL, errorCallbackURL })
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className={cn(
          'w-full gap-2 font-medium',
          // Blue ring when this is the user's last-used method, pairing
          // with the LastUsedPill so the eye lands on this option first.
          // Solid blue-500 (no alpha) so the ring matches the pill colour
          // exactly — alpha rings read as a different shade against
          // light/dark backgrounds.
          lastUsed && 'border-blue-500 ring-4 ring-blue-500'
        )}
        onClick={handleClick}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <GoogleLogo />
            Continue with Google
          </>
        )}
      </Button>
      {lastUsed ? <LastUsedPill /> : null}
    </div>
  )
}

// Google's brand mark in inline SVG so the bundle has no extra request
// and the colours don't drift if the file is overridden in dark mode.
function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.35 11.1H12v3.83h5.4c-.23 1.4-1.66 4.11-5.4 4.11-3.25 0-5.9-2.69-5.9-6t2.65-6c1.85 0 3.09.79 3.8 1.47l2.59-2.49C13.46 4.58 11.83 4 12 4 6.48 4 2 8.48 2 14s4.48 10 10 10c5.77 0 9.59-4.06 9.59-9.78 0-.66-.07-1.16-.17-1.62z"
        fill="#4285F4"
      />
    </svg>
  )
}

export function LastUsedPill() {
  return (
    <span className="absolute -top-3 right-3 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
      Last used
    </span>
  )
}

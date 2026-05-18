import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface ConfirmDeleteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The signed-in user's email — the typed value must match it before
  // we'll let the user submit. Forces a deliberate, non-mis-click action.
  expectedEmail: string
  // True for users with a credential Account (email+password). False
  // for OAuth-only users — the modal then hides the password input and
  // gates submission on the email match alone.
  hasPassword: boolean
  pending: boolean
  errorMessage: string | null
  onConfirm: (input: { password?: string }) => void
}

export function ConfirmDeleteModal({
  open,
  onOpenChange,
  expectedEmail,
  hasPassword,
  pending,
  errorMessage,
  onConfirm
}: ConfirmDeleteModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Reset on close so a re-open starts clean.
      setEmail('')
      setPassword('')
    }
    onOpenChange(next)
  }

  const emailMatches = email.trim().toLowerCase() === expectedEmail.toLowerCase()
  const passwordOk = hasPassword ? password.length > 0 : true
  const canSubmit = emailMatches && passwordOk && !pending

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!canSubmit) {
      return
    }

    onConfirm(hasPassword ? { password } : {})
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account</DialogTitle>
          <DialogDescription>
            This is permanent. Your data and any active subscription will be removed immediately.
            You won't be refunded for the remainder of your current billing period.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="confirm-email" className="text-xs font-medium text-muted-foreground">
              Type your email to confirm
            </label>
            <Input
              id="confirm-email"
              type="email"
              autoComplete="off"
              placeholder={expectedEmail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
            />
          </div>

          {hasPassword ? (
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-password"
                className="text-xs font-medium text-muted-foreground"
              >
                Current password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
              />
            </div>
          ) : null}

          {errorMessage && (
            <p role="alert" className="text-xs text-destructive">
              {errorMessage}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!canSubmit}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : 'Delete account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

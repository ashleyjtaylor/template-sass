import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AuthField } from '@/components/layout/AuthCardLayout'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { type NameValidationError, validateName } from '@/lib/profile-validation'
import { useUpdateProfile } from '@/modules/session/api'

const errorMessageFor = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many requests. Wait a few minutes and try again.'
    if (err.status >= 500) return 'Something went wrong on our end. Try again in a moment.'
  }
  return 'Could not update your profile. Try again.'
}

const validationCopy = (code: NameValidationError): string => {
  switch (code) {
    case 'FIRSTNAME_REQUIRED':
      return 'First name is required.'
    case 'FIRSTNAME_TOO_LONG':
      return 'First name is too long.'
    case 'LASTNAME_REQUIRED':
      return 'Last name is required.'
    case 'LASTNAME_TOO_LONG':
      return 'Last name is too long.'
  }
}

interface ProfileSectionProps {
  initialFirstname: string
  initialLastname: string
}

export function ProfileSection({ initialFirstname, initialLastname }: ProfileSectionProps) {
  const update = useUpdateProfile()
  const [firstname, setFirstname] = useState(initialFirstname)
  const [lastname, setLastname] = useState(initialLastname)
  const [validation, setValidation] = useState<NameValidationError | null>(null)

  // useSession refetches after a successful update; sync the controlled
  // inputs back to the canonical values so a second edit starts from
  // what's actually on the server (e.g. trim applied server-side).
  useEffect(() => {
    setFirstname(initialFirstname)
    setLastname(initialLastname)
  }, [initialFirstname, initialLastname])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setValidation(null)

    const result = validateName(firstname, lastname)
    if (result) {
      setValidation(result)
      return
    }

    update.mutate(
      { firstname: firstname.trim(), lastname: lastname.trim() },
      {
        onSuccess: () => {
          toast.success('Profile updated')
        }
      }
    )
  }

  const errorMessage = validation
    ? validationCopy(validation)
    : update.isError
      ? errorMessageFor(update.error)
      : null

  return (
    <section>
      <h2 className="text-lg font-semibold">Profile</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Your name appears in the dashboard nav and on emails we send you.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <AuthField
            id="firstname"
            label="First name"
            type="text"
            autoComplete="given-name"
            value={firstname}
            onChange={setFirstname}
            disabled={update.isPending}
          />
          <AuthField
            id="lastname"
            label="Last name"
            type="text"
            autoComplete="family-name"
            value={lastname}
            onChange={setLastname}
            disabled={update.isPending}
          />
        </div>

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Save changes'}
        </Button>
      </form>
    </section>
  )
}

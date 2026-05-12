import { z } from 'zod'

// Wire shape returned by GET /api/auth/get-session — null when there is no
// valid cookie, otherwise { user, session }.
export const sessionUserSchema = z.object({
  entityId: z.string(),
  email: z.string(),
  name: z.string()
})

export type SessionUser = z.infer<typeof sessionUserSchema>

export const sessionSchema = z
  .object({
    user: sessionUserSchema,
    session: z.object({ entityId: z.string() })
  })
  .nullable()

export type Session = z.infer<typeof sessionSchema>

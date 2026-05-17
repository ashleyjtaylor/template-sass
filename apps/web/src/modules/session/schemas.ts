import { z } from 'zod'

// Wire shape returned by GET /api/auth/get-session — null when there is no
// valid cookie, otherwise { user, session }.
export const sessionUserSchema = z.object({
  entityId: z.string(),
  email: z.string(),
  name: z.string(),
  // additionalFields surfaced via better-auth's get-session response.
  // Used to pre-populate the /account Profile form. Nullish to tolerate
  // older sessions written before the additionalFields existed; once
  // those expire the schema can tighten.
  firstname: z.string().nullish(),
  lastname: z.string().nullish(),
  emailVerified: z.boolean()
})

export type SessionUser = z.infer<typeof sessionUserSchema>

export const sessionSchema = z
  .object({
    user: sessionUserSchema,
    session: z.object({ entityId: z.string() })
  })
  .nullable()

export type Session = z.infer<typeof sessionSchema>

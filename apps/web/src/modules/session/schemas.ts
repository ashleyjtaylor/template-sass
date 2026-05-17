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

// One row in /api/auth/list-sessions. Better-auth surfaces our
// additionalFields (entityId) alongside its own — we match the
// current session by entityId to flag "this device" in the UI.
export const activeSessionSchema = z.object({
  entityId: z.string(),
  token: z.string(),
  ipAddress: z.string().nullish(),
  userAgent: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date()
})

export type ActiveSession = z.infer<typeof activeSessionSchema>

export const activeSessionsSchema = z.array(activeSessionSchema)

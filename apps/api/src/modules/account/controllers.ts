import type { AuthSession } from '@/middleware/require-session.js'
import { deleteAccount, listAccountMethods } from './service.js'

export interface DeleteAccountRequest {
  password: string | undefined
  authSession: AuthSession
}

export const deleteAccountController = async (input: DeleteAccountRequest) => {
  await deleteAccount({ userId: input.authSession.userId, password: input.password })

  return { status: 'ok' as const }
}

export const getAccountMethodsController = async (session: AuthSession) =>
  listAccountMethods(session.userId)

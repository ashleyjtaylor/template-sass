export { type SendAccountDeletedInput, sendAccountDeleted } from './account-deleted.js'
export { type SendEmailVerificationInput, sendEmailVerification } from './email-verification.js'
export { env as mailerEnv, isMailerConfigured } from './env.js'
export { type SendPasswordResetInput, sendPasswordReset } from './password-reset.js'
export { renderAccountDeleted } from './templates/account-deleted.js'
export { renderEmailVerification } from './templates/email-verification.js'
export { type RenderedEmail, renderPasswordReset } from './templates/password-reset.js'
export {
  getTransport,
  type MailTransport,
  resetTransport,
  type SendInput,
  setTransport
} from './transport.js'

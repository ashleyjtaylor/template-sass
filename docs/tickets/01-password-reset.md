# 01 — Password reset (forget → email → reset)

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## User flow

1. `/login` carries a small "Forgot your password?" link under the password input.
2. `/forgot-password` — single email field. Submits to `POST /api/auth/forget-password`. UI always shows "If an account exists, you'll receive an email" (no enumeration).
3. Email arrives via SES with a 1-hour link to `/reset-password?token=…`.
4. `/reset-password` — new password + confirm. Submits to `POST /api/auth/reset-password`. On success, all other sessions are revoked, the device that completed reset is auto-signed-in, redirect to `/dashboard`.
5. Expired / used / invalid token → generic "link is invalid or expired" view with "request a new link" → back to `/forgot-password`.

## Data model

- **No new tables.** better-auth's existing `Verification` table holds reset tokens. `entityId` / `requestId` are already wired via `additionalFields`.
- Token TTL: 1 hour (`resetPasswordTokenExpiresIn: 3600`).
- On every new reset request: delete prior `Verification` rows for that identifier so only the latest link works (better-auth hook).

## API (all mounted by the better-auth handler — no new Hono routes)

- `POST /api/auth/forget-password` — body `{ email, redirectTo: '/reset-password' }` → always 200, 429 if rate-limited.
- `POST /api/auth/reset-password` — body `{ newPassword, token }` → 200 + session cookie on success; 400 on invalid/expired/used token; 422 on weak password.

## Auth config changes (`apps/api/src/lib/auth.ts`)

- `emailAndPassword.sendResetPassword({ user, url })` → calls `mailer.sendPasswordReset`.
- `emailAndPassword.resetPasswordTokenExpiresIn: 3600`.
- `emailAndPassword.onPasswordReset({ user })` → `prisma.session.deleteMany({ where: { userId } })` (all sessions go; auto-sign-in then mints a fresh one for the resetting device).
- `databaseHooks.verification.create.before` → if identifier is the reset-password identifier, delete prior rows for the same user.
- Enable better-auth rate limiter: 3 reset requests / email / hour, 10 / IP / hour, in-memory.

## Frontend (`apps/web/src/`)

- `routes/forgot-password.tsx` — form, calls `authClient.forgetPassword(...)`, "check your inbox" confirmation. Reuses `AuthCardLayout`.
- `routes/reset-password.tsx` — reads `?token=` from search params, validates with Zod via TanStack Router. Submits via `authClient.resetPassword(...)`. Maps any error → "invalid or expired" view.
- `routes/login.tsx` — append "Forgot your password?" link.

## New package: `packages/mailer`

- Exports `mailer.sendPasswordReset({ to, firstname, resetUrl })`.
- Transport selected by the existing `APP_ENV`: `local` → SMTP/nodemailer against Mailpit; `staging`/`production` → SES via `@aws-sdk/client-sesv2`. Per the code-style skill, no new transport env var is introduced.
- Templates: `packages/mailer/src/templates/password-reset.ts` — inline HTML + text strings, no JSX.
- From address: `MAIL_FROM` env var.
- `isMailerConfigured()` helper mirroring `isBillingConfigured()` so the API can boot without email configured (returns a clear error if `sendResetPassword` fires unconfigured).

## Errors

- Validation (400): missing/short email, missing/short password.
- Rate limit (429): too many forget-password attempts.
- Invalid token (400): expired, used, malformed — all collapsed to one UI state on the client.
- Mailer not configured (500-class): logged; user sees the generic confirmation regardless (we don't want to leak misconfiguration).

## Testing

- `packages/mailer/test/unit/` — transport selection respects env, template renders both HTML and text, `From` comes from env, missing env throws a clear error.
- `apps/api/test/unit/auth.test.ts` (new) — `sendResetPassword` callback shape: passes the user's email, name, and reset URL through to mailer.
- No DB-backed integration test added in this slice.
- Manual smoke: forget → open Mailpit at `:8025` → click link → reset → land on `/dashboard`.

## Infrastructure / system design

- **CDK `data-stack` additions** (per env): SES `EmailIdentity` for `staging.<domain>` / `<domain>` with DKIM, IAM permission on the API task role for `ses:SendEmail` scoped to that identity, CFN outputs for the DKIM/verification DNS records.
- **`docker-compose.yml`**: add a `mailpit` service (`axllent/mailpit:latest`, ports `1025` and `8025`).
- **Env vars on api**: `MAIL_FROM`, `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`. Transport branches on the existing `APP_ENV`. AWS SDK picks up the task role for SES creds — no key in env.
- **Redis**: not viable / not needed. In-memory rate limiter suffices for a single API task.
- **Cost**: SES ~$0.10 / 1k emails — negligible.
- **Async / events**: no. Reset email is sent inline from the forget-password request; latency is fine and Stripe-style mirror tables aren't relevant here.

## CI/CD

- `ci.yml`: zero changes — Turbo picks up the new `packages/mailer` workspace for typecheck/test automatically.
- `deploy-staging.yml`: zero pipeline changes. SES sandbox-mode is opted-out **manually** in the AWS console once per env (one-time runbook step). DNS records (CNAMEs from CDK output) added to the DNS provider out-of-band, same pattern as Stripe.
- No new GH Actions secrets — SES auth via task role IAM, MAIL_FROM via env file in the task definition.
- Dockerfile: unchanged.

## Out of scope (deliberately)

- Email verification on signup (separate slice; same mailer will service it).
- DB-backed rate limiting (revisit when we run >1 API task).
- Other transactional emails (welcome, receipts) — mailer is built generically so they're cheap to add later.

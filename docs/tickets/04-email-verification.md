# 04 — Email verification (signup)

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## User flow

1. User signs up at `/signup`. better-auth fires `sendVerificationEmail` from the create-user hook; SES delivers a 24-hour link.
2. New user lands on `/dashboard` (or wherever the post-signup redirect points). A dismissible **"Verify your email"** banner is rendered while `session.user.emailVerified === false`. Banner has two actions: dismiss (session-local) and **Resend email**.
3. User opens the email on any device, clicks the link → `GET /api/auth/verify-email?token=…&callbackURL=…` flips `emailVerified = true` and redirects to `callbackURL`.
4. If the clicking device is signed-in → `/dashboard?verified=1` with a success toast, banner gone.
5. If the clicking device is signed-out → `/login?verified=1` with the same toast; the user signs in and the banner is already gone.
6. Expired / used / malformed token → generic "link invalid or expired" view with a CTA back to the dashboard banner.

**Gating model: pure soft-gate.** Nothing is blocked behind verification — not the dashboard, not Stripe checkout, not the portal. Banner-only nudge. The cost is that a user with a typo'd email can still pay; the win is one less rule to maintain and zero conversion friction. Revisit if support volume from "I can't get my receipt" becomes real.

## Data model

- **No schema changes.** `User.emailVerified` already exists (better-auth default). Verification tokens go in the existing `Verification` table; `entityId` / `requestId` already wired via `additionalFields`.
- Token TTL: 24h (`emailVerification.expiresIn = 86_400`). Longer than password-reset (1h) because verification links are commonly opened from a different device than the one used to sign up, with arbitrary delay.

## API (no new Hono routes)

All under the better-auth handler:

- `POST /api/auth/send-verification-email` — body `{ email, callbackURL }`. Used for **resend**. Extended via the existing `hooks.before` in `apps/api/src/lib/auth.ts`:
  - Session required (401 otherwise — resend is authenticated-only, no /login link).
  - Body email must match session email (401 otherwise — can't probe other accounts).
  - If `emailVerified === true` → silent 200 (idempotent, no mail sent).
  - Per-email rate limit: 3 / hour, counting `Verification` rows with the `email-verification:` identifier prefix.
  - Prior verification rows for the user are deleted before better-auth writes the new one — only the latest link works.
- `GET /api/auth/verify-email?token=…&callbackURL=…` — flips the flag, redirects.
- `rateLimit.customRules['/send-verification-email'] = { window: 3600, max: 10 }` (per-IP, production-only — same convention as `/request-password-reset`).

## Auth config changes (`apps/api/src/lib/auth.ts`)

- New `emailVerification` block:
  - `sendOnSignUp: true`
  - `expiresIn: 60 * 60 * 24`
  - `sendVerificationEmail({ user, url })` → calls `mailer.sendEmailVerification(...)`, wrapped in `isMailerConfigured()` guard + try/catch. Errors are logged and swallowed (mirror of `sendResetPassword`).
- Constants `VERIFICATION_IDENTIFIER_PREFIX = 'email-verification:'`, `VERIFICATION_RATE_LIMIT_WINDOW_MS`, `VERIFICATION_RATE_LIMIT_MAX_PER_EMAIL`, `VERIFICATION_TOKEN_TTL_SECONDS` defined alongside the existing reset-password constants.
- `hooks.before` extended: in addition to the `/request-password-reset` branch, also handle `/send-verification-email` (session check, email-match check, idempotency short-circuit, per-email rate limit, prior-token cleanup).

## Frontend (`apps/web/src/`)

- New banner component: rendered when `session.user.emailVerified === false`. Lives in the dashboard layout (or `__root.tsx` — pick at implementation time depending on what feels least invasive). Dismiss = session-storage flag so it doesn't reappear within the same tab. Resend = `authClient.sendVerificationEmail({ email: session.user.email, callbackURL: '/dashboard?verified=1' })` with success/error toasts.
- `routes/dashboard.tsx` — reads `?verified=1` on mount, fires success toast, clears the search param. The session refetch (already wired) picks up `emailVerified = true` and the banner disappears.
- `routes/login.tsx` — reads `?verified=1`, fires the same success toast. Covers the signed-out clicker case.
- No new routes.

## Mailer (`packages/mailer`)

- `templates/email-verification.ts` — inline HTML + text, mirrors `templates/password-reset.ts` shape. Subject: "Verify your email".
- `email-verification.ts` — `sendEmailVerification({ to, firstname, verifyUrl })`, structure identical to `sendPasswordReset`.
- Re-exported from `index.ts` alongside the existing exports.

## Errors

- 401 — resend with no session, or session email ≠ body email.
- 429 — per-email (3/h) or per-IP (10/h) limit hit.
- 400 — verify link expired / used / malformed. Collapsed to a single "invalid or expired" UI state on the client.
- silent 200 — already-verified resend (idempotent, no mail sent).
- Mailer failure (500-class internally) — logged via `logger.error`, generic 200 to the caller (mirror of password-reset).

## Testing

- **Unit** — `packages/mailer/test/unit/email-verification.test.ts`: template renders HTML + text, subject is correct, verify URL appears in body, missing `MAIL_FROM` throws.
- **Unit** — `apps/api/test/unit/auth.test.ts` (extend): `sendVerificationEmail` callback passes user email / firstname / url through to mailer; already-verified path skips send; per-email rate-limit hook rejects the 4th attempt within an hour; session-mismatch throws 401.
- **E2E** — new `e2e/tests/email-verification.spec.ts` using existing `fixtures/mailpit.ts`:
  1. Signup → verification email arrives in Mailpit.
  2. `/dashboard` shows the banner.
  3. Resend → second email arrives.
  4. Open the latest verify link → lands on `/dashboard?verified=1`, banner gone, toast shown, DB row has `emailVerified = true`.
  5. Reuse the consumed link → "invalid or expired" view.
- No DB-backed Vitest integration test (consistent with the template's broader convention).
- Manual smoke: signup → Mailpit UI at `:8025` → click link → dashboard.

## Infrastructure / system design

- **No new CDK resources.** SES identity + IAM `ses:SendEmail` already provisioned in `data-stack` for password-reset; SES permissions are per-identity, not per-template.
- **No new env vars.** Reuses `MAIL_FROM`, `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `APP_ENV`.
- **Redis**: not viable / not needed. In-memory rate limiter still adequate for a single API task.
- **Async / events**: no. Verification email sends inline from the signup request; latency is fine.
- **Cost**: SES ~$0.10 / 1k emails — negligible.

## CI/CD

- **Re-enable the e2e workflow** (`.github/workflows/e2e.yml`):
  - `on:` becomes `push: { branches: [main] }` + `workflow_dispatch:`. **No `pull_request:` trigger** — manual dispatch covers PR validation when needed.
  - Replace the workflow's `${{ secrets.STRIPE_TEST_API_KEY }}` / `${{ secrets.STRIPE_TEST_PRICE_ID_PRO }}` references with `STRIPE_API_KEY` / `STRIPE_PRICE_ID_PRO` to match the secrets already added to the repo (and the local `.env` naming).
  - Drop the "paused" comment block at the top of the file.
- `ci.yml`: zero changes — Turbo picks up the new mailer and auth unit tests automatically.
- No new GitHub Actions secrets, no Dockerfile changes, no deploy DAG changes.

## Out of scope (deliberately)

- Email-change flow (re-verification on email update).
- Hard-gating any route on `emailVerified` (checkout, dashboard, etc).
- DB-backed rate limiting (revisit when running >1 API task).
- Auto-resending verification on every login.
- A dedicated "/verify-email/resend" public page.

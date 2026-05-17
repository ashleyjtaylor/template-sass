# 07 — Welcome email after signup

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## Trigger

Two hooks in `apps/api/src/lib/auth.ts`, both calling the same `sendWelcomeSafely(user)` helper.

- **Email+password path** — `emailVerification.afterEmailVerification(user, request)`. Fires after the user clicks the verify link and `emailVerified` flips to true.
- **Google OAuth path** — `databaseHooks.user.create.after(user, ctx)`. Fires when the `User` row is inserted. Gate on `user.emailVerified === true` so the email+password initial-create (which starts with `emailVerified=false`) doesn't double-trigger — only trusted-provider OAuth creates land with verified=true.

Single helper, mirrors the existing `sendResetPassword` / `sendVerificationEmail` wrapping pattern:

```ts
const sendWelcomeSafely = async (user: { id: string; email: string; firstname?: string }) => {
  if (!isMailerConfigured()) {
    logger.warn({ userId: user.id }, 'sendWelcome called but mailer is not configured — skipping')
    return
  }
  try {
    await sendWelcome({
      to: user.email,
      firstname: user.firstname,
      dashboardUrl: `${env.WEB_BASE_URL}/dashboard`
    })
  } catch (err) {
    logger.error({ err, userId: user.id }, 'Failed to send welcome email')
  }
}
```

Failure mode: log + continue. Verification (or Google OAuth) already succeeded; the welcome is a bonus, never blocks the user.

## Mailer package additions

- **`packages/mailer/src/templates/welcome.ts`** — `renderWelcome({ firstname, dashboardUrl }) → { subject, html, text }`. Matches existing template tone: plain greeting, no signature, no `{Product}` placeholder. Forks customise by editing the template file directly.
- **`packages/mailer/src/welcome.ts`** — `sendWelcome({ to, firstname, dashboardUrl })`. Mirrors `sendEmailVerification`: throws if `MAIL_FROM` unset, calls transport, returns void.
- **`packages/mailer/src/index.ts`** — export `sendWelcome`, `renderWelcome`, `SendWelcomeInput`.

## Template content

Subject: `Welcome`

Plain text:
```
Hi {firstname},

Your account is ready — thanks for signing up.

Open your dashboard:
{dashboardUrl}

Questions? Just reply to this email.
```

HTML mirrors `email-verification.ts` styling: same `<table>` shell, same dark CTA button (`Open dashboard`), plain-URL fallback below.

## Data model

**None.** No new tables, columns, or migrations.

## API

**None.** No new routes. Triggered internally by better-auth lifecycle hooks.

## Errors

Welcome failures never surface to the user. Logged at `error` level (mailer error) or `warn` (mailer unconfigured) for ops visibility.

## Testing

**Unit** (`packages/mailer/test/unit/welcome.test.ts`, new):
- `renderWelcome` — subject is `Welcome`, greeting uses firstname when present and falls back to `Hi,` otherwise, HTML escapes user-controlled values, text + html both include the dashboard URL.
- `sendWelcome` — throws when `MAIL_FROM` is empty, passes the right `{to, from, subject, html, text}` to a transport mock when configured.

**Unit** (`apps/api/test/unit/lib/auth.test.ts`, extend):
- `afterEmailVerification` calls `sendWelcome` with the user's email/firstname and the env-driven dashboard URL.
- `afterEmailVerification` swallows mailer errors (no throw) and logs.
- `databaseHooks.user.create.after` calls `sendWelcome` when `emailVerified === true`, skips when `false`.
- Both paths skip cleanly when `isMailerConfigured()` is `false`.

**E2E**: no new Playwright case. The existing email-verification e2e covers the verify-click path; asserting Mailpit receives a second message is brittle and adds little. Manual smoke against staging after deploy instead.

## Infrastructure

**No changes.** Mailer is already wired — SES in deployed envs (out-of-band Secrets), Mailpit locally via docker-compose.

## CI/CD

Zero changes. New unit tests pick up via Turbo. Dockerfile unchanged. No new env vars.

## Docs

- This ticket file is the durable plan record.
- No skill / runbook / overview updates needed — the mailer package was already documented in `project_overview.md`; adding one more template doesn't change the shape of anything.

## Out of scope (deliberately)

- Onboarding checklist content — forks customise the template body when their product has real next-steps to surface.
- Welcome email A/B testing.
- Queueing / retries — mailer is inline today; revisit when a worker exists.
- Re-send-welcome admin action.
- Localisation — copy is hardcoded English, matching every other template in the package.

# 08 — Profile editing (name + in-place password change)

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## Scope

- Edit **firstname + lastname** in a new "Profile" section on `/account`.
- Change password in-place (`currentPassword` / `newPassword` / `confirm`) as the primary Password action; a secondary "Forgot your current password?" link routes to `/forgot-password`.
- **Email change** is deferred (separate slice — requires `user.changeEmail.enabled: true` + a confirmation-email template).
- **Avatar / image** is deferred (depends on file uploads + S3).
- **2FA / recovery codes / account merging** are out of scope.

## API

No new routes. Use better-auth's vendor endpoints:

- `POST /api/auth/update-user` — body `{ firstname, lastname }`. Our `additionalFields` declare both with `input: true`, so they survive the Prisma adapter's strip.
- `POST /api/auth/change-password` — body `{ currentPassword, newPassword, revokeOtherSessions: true }`. Matches the reset-password posture (existing `revokeSessionsOnPasswordReset: true`) so a successful change evicts every other device.

## Auth config (`apps/api/src/lib/auth.ts`)

- Add `databaseHooks.user.update.before` mirroring the existing `create.before`: if the payload includes `firstname`/`lastname` but no `name`, recompose `name` from the two. Keeps the derived `name` consistent without making callers send it.
- No new env vars, no new mailer templates. The rate-limit `customRules` table already covers `/change-password` (10/hour/IP).

## Frontend (`apps/web/src/`)

**New section** in `routes/account.tsx`, rendered above Password:

```
┌─ Profile ───────────────┐
│ First name   [Sam     ] │
│ Last name    [Lee     ] │
│ [ Save changes ]        │
└─────────────────────────┘
```

Pre-populated from `useSession()`. Save → `useUpdateProfile.mutate(...)` → toast "Profile updated" → invalidate `['session']` so the nav reflects the new name.

**Refactored Password section** (still gated on `hasPassword`):

- Primary: `currentPassword` / `newPassword` / `confirm` form → `useChangePassword.mutate(...)`. On success: toast "Password updated. Other sessions signed out.", clear the form.
- Secondary: small link "Forgot your current password? Send a reset link instead." — triggers the existing `useForgotPassword` mutation.

**New hooks** in `modules/session/api.ts`:

```ts
useUpdateProfile()   // POST /api/auth/update-user  body: { firstname, lastname }
useChangePassword()  // POST /api/auth/change-password  body: { currentPassword, newPassword, revokeOtherSessions: true }
```

Both invalidate `['session']` on success.

**Friendly error mapping** in `account.tsx`:

| API error | Surface |
|---|---|
| 401 `INVALID_PASSWORD` on change-password | Inline alert: "That password is incorrect." |
| 400 (password too short / weak) | Inline alert: "Password must be at least 8 characters." |
| 429 | "Too many attempts. Wait a few minutes and try again." (consistent with the auth-rate-limit slice) |
| 5xx | "Something went wrong. Try again." |

## Validation

**Client-side** (avoid round-trip for trivial cases) — pure helpers in `apps/web/src/lib/profile-validation.ts`:

- `validateName(firstname, lastname)` → trimmed length ≥ 1 and ≤ 50 for each.
- `validatePassword(newPassword, confirm)` → newPassword length ≥ 8; confirm must equal newPassword.

**Server-side**: better-auth handles password rules + length; our `update-user` just trusts the strings (already `required: true` on the additionalFields).

## Data model

**None.** No tables, columns, or migrations. `firstname` / `lastname` already exist on `User`.

## Errors

| Code | When | Status |
|---|---|---|
| `INVALID_PASSWORD` | Wrong current password on change-password | 401 |
| `PASSWORD_TOO_SHORT` (or similar from better-auth) | newPassword below min length | 400 |
| `TOO_MANY_REQUESTS` | Rate limit hit (covered by existing slice) | 429 |
| Anything else | Generic toast | — |

## Testing

**Unit** (`apps/web/test/unit/lib/profile-validation.test.ts`, new):
- `validateName` — both required, trim before length check, empty / too-long rejected, normal accepted.
- `validatePassword` — length floor of 8, confirm mismatch rejected, matching accepted.

**Unit** (`apps/api/test/unit/lib/auth.test.ts`, extend):
- `databaseHooks.user.update.before` recomposes `name` when firstname/lastname change but `name` is absent in the payload.
- `databaseHooks.user.update.before` leaves the payload alone when `name` is explicitly supplied.

**E2E**: no new Playwright case. Existing account specs cover delete + sign-out; profile editing is small enough that the smoke below carries it.

**Manual smoke after staging deploy**:
1. Sign in → `/account` → change firstname → save → toast → header / nav updates → reload → new name persists.
2. `/account` → enter wrong current password → inline "That password is incorrect."
3. `/account` → enter correct current + valid new password → toast → in a second browser, signed-in session is dead.
4. OAuth-only user signs in → `/account` → Profile section visible, Password section hidden.

## Infrastructure

No CDK changes. No new env vars. Dockerfile unchanged.

## CI/CD

Zero pipeline changes.

## Docs

- This ticket file is the durable plan record.
- No skill / overview / runbook updates needed — the change is additive UI plus a vendor-route call.

## Out of scope (deliberately)

- Email change.
- Avatar / profile image.
- 2FA, recovery codes, account merging.
- Activity log / "you changed your password on X device".
- Per-section unsaved-changes detection / browser-leave warning.

# 03 — Account delete (instant)

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## Behaviour

- User dropdown gets an "Account" link → new `/account` route → "Danger Zone" → Delete Account button → modal (type email + re-enter password) → submit.
- Deletion is **always instant**, regardless of subscription state. The Stripe subscription (if any) is canceled with no proration — the user forfeits remaining paid time. This is communicated up-front in the confirmation modal.
- The Stripe customer record is **kept** (Stripe best practice for tax / chargeback / audit). Receipts and invoices remain accessible to the Stripe owner.
- On success: the SPA's session cookie still exists on the client but the corresponding row is gone (Prisma cascade on `Session.userId`). The cache is cleared and the user is redirected to `/login`.

This is intentionally simpler than the scheduled-deletion pattern Stripe / Notion / Linear use. We accept the "I paid and got nothing back" complaint in exchange for one route, no banner, no undo flow, and no webhook-driven hard delete. If we want refunds later, switch to `subscriptions.cancel({ prorate: true, invoice_now: true })` in `apps/api/src/modules/account/service.ts` — same shape, single line change.

## Data model

No schema changes. The existing cascades on `Session.userId`, `Account.userId`, and `Subscription.userId` are what makes single-row `prisma.user.delete()` sufficient.

## API

- `POST /api/account/delete` — body `{ password }`. Verifies password against the credential account using better-auth's `verifyPassword`. Cancels Stripe subscription (best-effort — a Stripe outage doesn't block the delete). Hard-deletes the user. Fires the account-deleted email best-effort. Returns `{ status: 'ok' }`.
- **Status codes**: 401 (no session — `requireSession` enforces), 400 (`MissingPassword` / `BadPassword` / `NoCredentialAccount`), 404 (user not found), 500 (DB failure).

Custom route — better-auth's `/delete-user` can't co-ordinate the Stripe cancel + mailer step from `beforeDelete`, so we own the endpoint.

## Stripe webhook (`apps/api/src/modules/webhooks/stripe.ts`)

No changes. The `subscriptions.cancel()` call fires a `customer.subscription.deleted` webhook a moment later; by then the user is gone and the cascade has wiped the local `subscription` row. The handler's existing P2025 path ("cancel webhook for unknown subscription") swallows the no-op, which is the documented and tested behaviour.

## Mailer

- New template `packages/mailer/src/templates/account-deleted.ts` — subject "Your account has been deleted", short body with deletion timestamp + optional support contact line.
- New export `mailer.sendAccountDeleted({ to, firstname, supportEmail? })`.

## Frontend (`apps/web/src/`)

- `routes/account.tsx` — new route, sits behind the same AuthGate as `/dashboard`. Shows a single "Danger Zone" card with "Delete Account" button → modal.
- `modules/account/ConfirmDeleteModal.tsx` — Radix Dialog with type-email + password fields; submit disabled until the typed email matches the signed-in email (case-insensitive).
- `modules/account/api.ts` — `useDeleteAccount` mutation; on success clears the React Query cache so no stale `useSession` / `useAccessState` data survives the navigate.
- `components/layout/UserMenu.tsx` — adds "Account" item between Billing and Reset password.

## Tests

- **Unit (service)**: `apps/api/test/unit/modules/account/...`
  - Valid password + active sub → cancels Stripe + deletes user + sends email
  - Valid password + no sub → deletes user + sends email + no Stripe call
  - Valid password + terminal sub (`canceled` / `incomplete_expired`) → deletes user, **no** Stripe cancel call
  - Bad password → `ValidationError` `BadPassword`, no DB or Stripe mutation
  - Missing credential account → `ValidationError` `NoCredentialAccount`
  - User not found → `NotFoundError`
  - Stripe cancel throws → still deletes user (best-effort)
- **Mailer unit**: `account-deleted` template renders with/without firstname, escapes HTML in firstname, includes the deletion timestamp.
- **E2E**: sign up → pay → `/account` → click Delete → fill modal with email + password → confirm → assert toast + redirect to `/login` → assert old credentials no longer work.

## Errors / edge cases

- OAuth-only user (no credential account row) → `NoCredentialAccount` 400. Re-evaluate when Google OAuth lands (#4) — we'll need a confirm-by-re-auth flow instead of password verify.
- Re-signup with the same email immediately after delete → allowed, since the unique constraint row is gone.
- Stripe down at delete time → user row is still deleted, sub remains live in Stripe (eventually catches up via portal cancellation or manual ops reconciliation). Tradeoff: never block the user's deletion request on a third-party outage.

## Out of scope

- Refunds / prorated credits.
- Admin recovery flow ("undelete").
- Per-table data export ("download my data") — separate ticket if needed.

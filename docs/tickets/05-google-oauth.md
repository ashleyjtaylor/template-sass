# 05 — Google OAuth sign-in

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## User flow

1. `/login` and `/signup` both render an "Or continue with" divider followed by a **Sign in with Google** button — only when the API reports Google is configured (env vars set).
2. Click → `authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL })` → browser hard-navigates to Google's consent screen.
3. Google → API callback (`GET /api/auth/callback/google`) → better-auth exchanges code for tokens, creates or links the `Account` row, mints a session cookie, 302s to `callbackURL`.
4. **callbackURL** is computed at click-time on the SPA:
   - If the current URL has `?plan=<key>` → `/dashboard?plan=<key>`.
   - Otherwise → `/dashboard`.
5. `/dashboard` mount-effect (already exists for `?verified=1`): if `?plan` is present and access state is unpaid → POST `/api/billing/checkout-session` and `window.location.href = url`. Mirrors the existing pricing → signup → Stripe flow.
6. Failure (`access_denied`, network, token exchange errors) → `errorCallbackURL` returns to the originating page with `?error=<code>`. SPA fires a single `toast.error('Could not sign in with Google')`.

**Account linking**: if Google's email matches an existing email+password `User`, the new `Account` row is attached to that user and they're signed in. No duplicate `User` row, no enumeration error. Configured via better-auth's `account.accountLinking.enabled: true` + `trustedProviders: ['google']`. Trusting Google means we accept their `emailVerified=true` as proof of ownership.

**No verification email** is sent for Google-originated signups — `emailVerified=true` is set on the `User` row from Google's userinfo, the dashboard banner never shows.

**"Last used" hint** on returning visits: a small muted pill rendered next to whichever button was used most recently (per-device, `localStorage`-backed). Cleared on neither sign-out nor session expiry — the whole point is to help signed-out returners.

## Data model

- **No schema changes.** Reuses `User` (existing `image` column gets populated for the first time, from Google's `picture`), `Account` (better-auth manages — `providerId='google'`, `accountId=<Google sub>`, `accessToken`/`refreshToken`/`idToken` populated automatically), `Session`. `entityId` + `requestId` already wired via `additionalFields`.

## API

- `POST /api/auth/sign-in/social` — better-auth route. Body `{ provider: 'google', callbackURL, errorCallbackURL }` → `{ url }`.
- `GET /api/auth/callback/google` — better-auth route. Token exchange + account link/create + session cookie + redirect.
- **New tiny Hono route**: `GET /api/auth/providers` → `{ google: boolean }`. Source of truth for whether the SPA renders the Google button. Returns `google: true` only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty. No auth required.

## Auth config (`apps/api/src/lib/auth.ts`)

- New `socialProviders.google` block:
  - `{ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, mapProfileToUser: ({ given_name, family_name, picture }) => ({ firstname: given_name ?? '', lastname: family_name ?? '', image: picture ?? null }) }`.
  - Only registered when both env vars are non-empty (mirrors `isBillingConfigured()`).
- New `account.accountLinking`: `{ enabled: true, trustedProviders: ['google'] }`.
- New helper `isGoogleConfigured(): boolean` exported for the providers endpoint to consume.
- `env.ts` gains `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (both `z.string().default('')`).

## Frontend (`apps/web/src/`)

- `lib/last-auth-method.ts` — `getLastAuthMethod()` / `setLastAuthMethod('email' | 'google')` wrapping `localStorage`. Returns `null` when absent or invalid.
- `modules/session/GoogleSignInButton.tsx` — Google-brand-compliant button. On click: `setLastAuthMethod('google')` → `authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL })`. Accepts a `lastUsed` prop that renders the muted "Last used" pill.
- `modules/session/api.ts` — `useAuthProviders()` (TanStack Query against `/api/auth/providers`, `staleTime: 24h`). `useSignIn` + `useSignUp` get `onSuccess: () => setLastAuthMethod('email')`.
- `routes/login.tsx` — add divider + `<GoogleSignInButton lastUsed={lastUsed === 'google'} />` rendered conditionally on `providers.google === true`. Email form gets `lastUsed === 'email'` pill. Read `?error` and toast.
- `routes/signup.tsx` — same shape as login.
- `routes/dashboard.tsx` mount-effect — extend the existing `?verified=1` handler to also handle `?plan=<key>`: if access is unpaid, POST checkout-session → `window.location.href = url`. Strip the param after firing.

## Errors

- 400 — better-auth handles invalid `provider` / untrusted `callbackURL`.
- 401 — Google `access_denied` (user cancelled) → redirected to `errorCallbackURL?error=access_denied`.
- 500-class — token exchange failure → same redirect path, generic toast.
- Linking edge case — Google email matches existing user → silent link, no error.

## Testing

- **Unit** — `apps/api/test/unit/lib/auth.test.ts` (extend): `socialProviders.google` is registered when env is set, absent when blank; `account.accountLinking.enabled === true` with `trustedProviders` containing `'google'`.
- **Unit** — `apps/api/test/unit/modules/auth/providers.test.ts` (new): `GET /api/auth/providers` returns `{ google: false }` when env blank, `{ google: true }` when both vars set.
- **Unit** — `apps/web/test/unit/lib/last-auth-method.test.ts` (new): round-trip get/set, returns `null` when key absent, ignores invalid values.
- **No Playwright e2e** for Google OAuth in this slice. Headless Google consent is impractical and better-auth's OAuth behavior is upstream's responsibility.
- **Manual smoke**: `/login` → click Google → consent → land on `/dashboard`; from `/signup?plan=pro` → click Google → land on Stripe Checkout.

## Infrastructure

- **No new CDK resources.** Add a Secrets Manager entry `google-oauth-secrets` (two fields: `clientId`, `clientSecret`). API task definition reads from it via the existing Stripe-secrets pattern.
- **Env vars**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Local goes in `apps/api/.env`; CI/CD picks from Secrets Manager via CDK.
- **No Redis, no async, no event work.**
- **Cost**: zero. Google OAuth is free.
- **One-time Google Console setup** (documented in new `docs/runbooks/google-oauth.md`): create OAuth 2.0 Client ID; authorized redirect URIs `http://localhost:3000/api/auth/callback/google` + per-env API origins; scopes `openid email profile`.

## CI/CD

- `ci.yml` — zero pipeline changes. New unit tests pick up via Turbo.
- `e2e.yml` — zero changes. No OAuth e2e in this slice.
- No new GH Actions secrets required for CI to pass (Google env vars are blank in CI; the providers endpoint reports `google: false` and the test asserts both branches).
- Dockerfile — unchanged.
- Deploy DAG — unchanged.

## Out of scope (deliberately)

- Settings page to unlink Google from an account.
- Other OAuth providers (Apple, GitHub, Microsoft).
- Avatar rendering UI (we populate `User.image` but don't display it yet).
- E2E mocking the Google OAuth handshake.
- Server-side "last used" derived from Session/Account history.

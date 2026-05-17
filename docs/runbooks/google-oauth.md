# Google OAuth setup (one-time per env)

Walkthrough for issuing a Google OAuth 2.0 Client ID + Secret and wiring them into local dev / staging / production. The SPA hides the **Continue with Google** button until both env vars are populated, so a fresh fork can run without any of this — come back when you actually want the button.

## Prerequisites

- A Google Cloud project. Either reuse an existing one or create a fresh one at https://console.cloud.google.com.
- Owner / editor role on that project.

## Step 1 — OAuth consent screen

Console → **APIs & Services** → **OAuth consent screen**.

1. **User type**: External (unless you're on Google Workspace and want to scope to your domain).
2. **App information**: name, support email, app logo (optional).
3. **App domain**: production SPA origin (e.g. `https://app.example.com`).
4. **Authorized domains**: the bare domain (e.g. `example.com`). Google won't accept localhost here — that's fine, localhost works as a redirect URI in test mode without being an authorized domain.
5. **Scopes**: add the three OpenID basics:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
6. **Test users** (while the app is in Testing mode): add the Google accounts you'll use for manual smoke. In Production mode this isn't needed.

Save. Leave the app in **Testing** mode for local + staging; only **Publish** when going to prod.

## Step 2 — OAuth 2.0 Client ID

Console → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.

- **Application type**: Web application.
- **Name**: anything descriptive, e.g. `template-sass-<env>`.
- **Authorized JavaScript origins** (the SPA origins that can initiate the handshake):
  - `http://localhost:5174` (local dev)
  - `https://<staging-spa>` (CloudFront URL or eventually `https://app.staging.example.com`)
  - `https://<prod-spa>`
- **Authorized redirect URIs** (the API callback better-auth handles):
  - `http://localhost:3000/api/auth/callback/google`
  - `https://<staging-api>/api/auth/callback/google`
  - `https://<prod-api>/api/auth/callback/google`

Create. Copy the **Client ID** and **Client secret** — the secret is shown only once.

You can have a single OAuth client with all envs' origins listed, or a separate client per env. One client is simpler and matches how the Stripe test-mode key works for the template.

## Step 3 — local env

Add to `apps/api/.env`:

```
GOOGLE_CLIENT_ID=<paste client id>
GOOGLE_CLIENT_SECRET=<paste client secret>
```

Restart `pnpm dev`. Visit `/login` — the **Continue with Google** button should now render under the "Or continue with" divider. Verify the providers endpoint reports correctly:

```
curl http://localhost:3000/api/auth/providers
# → {"google":true}
```

## Step 4 — deployed envs

Production values live in AWS Secrets Manager. Add a new secret named `template-${env}-google-oauth-secrets` with two fields:

```json
{
  "clientId": "...",
  "clientSecret": "..."
}
```

The API task definition's env block (CDK in `infra/cdk/lib/app-stack.ts`) reads these via the existing Stripe pattern. No new CDK resources; just the secret entry. Forks that don't want Google can leave the secret absent — `isGoogleConfigured()` returns false, the button is hidden, no boot failure.

## Smoke test

1. Sign in with Google from `/login` — should land on `/dashboard`, banner-less, with a Google avatar populated in `User.image`.
2. From `/signup?plan=pro` — should land on Stripe Checkout (the dashboard auto-bounces unpaid users with a `?plan` param).
3. Account linking: sign up with email+password, sign out, then sign in with Google on the same email — should reuse the existing `User` row (no duplicate). Check with `select id, email, "emailVerified" from "user"`.

## Troubleshooting

- **`redirect_uri_mismatch`**: the API origin where the user landed doesn't match any URI in the Authorized redirect URIs list. Add it in the Console. Note: `http://localhost` vs `https://localhost` and trailing slashes count.
- **Button not rendering**: `curl /api/auth/providers` returns `{google: false}` → env vars aren't set or the API hasn't restarted. Check `.env`, then bounce the dev process.
- **"This app isn't verified"**: the consent screen is still in Testing mode and the signing-in account isn't in the Test users list. Either add them or move to Production.

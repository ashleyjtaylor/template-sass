# 06 — Auth rate limiting

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## Threat model

Defends against four classes:

- **Per-IP abuse** — single attacker hammering an endpoint from one IP. Already partially covered by better-auth defaults; this slice tightens per-route.
- **Credential stuffing** — botnets trying leaked password lists against `/sign-in/email` from many IPs at one email. Per-IP limits don't help here; defense is a **per-email lockout**.
- **Mass signup** — scripts creating fake accounts in bulk. Defense is a tighter per-IP signup limit.
- **Account enumeration** — probing which emails exist via response shape/timing. Already mostly mitigated by silent-200 patterns in reset/verify; this slice preserves that by **always** incrementing per-email counters even for unknown emails.

## Storage

**Postgres via better-auth's `storage: 'database'`.** No new infrastructure.

- Better-auth manages a `RateLimit` model — declared in `packages/db/prisma/schema.prisma` with our `entityId` (`rl_` prefix) + `requestId` to match table conventions.
- Per-email sign-in counter reuses the same `RateLimit` table, keyed `signin:fail:<sha256(email).slice(0,16)>`. No second table.
- Adds ~1ms per limited request. Negligible at MVP traffic.
- Upgrade path if a fork outgrows it: swap `storage: 'database'` → `storage: 'secondary-storage'` and wire Redis. One-line change.

Why not Redis: zero new CDK resources, zero new env vars, zero monthly cost, and the per-email lockout works just as well as a row with `expiresAt`.

## Per-route policy

| Endpoint | Per-IP | Per-identifier |
|---|---|---|
| `POST /api/auth/sign-in/email` | 20 / 10 min | **5 fails / 15 min per email**, reset on success |
| `POST /api/auth/sign-up/email` | 5 / hour | — |
| `POST /api/auth/request-password-reset` | 10 / hour (existing) | 3 / hour per email (existing) |
| `POST /api/auth/send-verification-email` | 10 / hour (existing) | 3 / hour per email (existing) |
| `POST /api/auth/change-password` (authed) | 10 / hour | — |
| `POST /api/auth/sign-out` | unlimited | — |
| `GET /api/auth/get-session` | unlimited | — |
| `GET /api/auth/sign-in/social/google` | 20 / 10 min | — |

Identifier keys are hashed (`sha256(email.toLowerCase()).slice(0,16)`) so the `RateLimit` table never stores raw emails. Per-email sign-in counter increments for unknown emails too — preserves enumeration resistance.

## Where active

Staging + production only. Local + test keep the current carve-out so the e2e suite and integration tests don't flake on shared 127.0.0.1. Targeted integration tests in this slice build a dedicated app instance with the limiter enabled.

Gate switches from `NODE_ENV === 'production'` to `APP_ENV in {staging, production}` so staging exercises the real path.

## Data model

- New Prisma model `RateLimit` in `packages/db/prisma/schema.prisma`. Fields per better-auth's expected shape (`key`, `count`, `lastRequest`) plus our standard `id`, `entityId` (`rl_` prefix), `createdAt`, `updatedAt`, `requestId`. Index on `key`.
- Migration: additive, no backfill.
- No other schema changes.

## API

- **No new routes.** All behaviour is hooked into existing better-auth endpoints.
- Rate-limit responses use existing `429 TOO_MANY_REQUESTS` shape: `{ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later', retryAfterSec?: number }`. Verify our `errorHandler` middleware serialises better-auth's `APIError('TOO_MANY_REQUESTS')` through our envelope; add a mapping if it doesn't.

## Auth config (`apps/api/src/lib/auth.ts`)

- Change `rateLimit.storage` from `'memory'` to `'database'`.
- Change enable gate from `env.NODE_ENV === 'production'` to `env.APP_ENV === 'staging' || env.APP_ENV === 'production'`.
- Add `customRules` for the new per-IP limits in the table above (existing two rules stay).
- New `before` hook on `/sign-in/email`: hash email → query `RateLimit` for `signin:fail:<hash>` → throw `APIError('TOO_MANY_REQUESTS')` when `count >= 5` and not yet expired.
- New `after` hook on `/sign-in/email`: success → delete the counter row; 401 → upsert (increment count, set/extend `expiresAt = now + 15min` on first miss).
- New helper `logRateLimitExceeded({ route, ipHash, identifierHash, limit, windowSec })` called from both the custom-rule trip (via better-auth's `onLimitReached` if available, else wrap the response) and the per-email hook. Emits one Pino line with `event: 'rate_limit_exceeded'`. No raw IP / email — hashed only.
- New small helper `hashIdentifier(value: string): string` (sha256, 16-char hex).

## Frontend (`apps/web/src/`)

No new components or routes.

- `lib/api.ts` `ApiError` handling already surfaces 429s as toasts via the existing path. Verify the user-facing copy reads sensibly when `TOO_MANY_REQUESTS` arrives on sign-in / sign-up — adjust the toast message if needed.
- `routes/login.tsx` / `routes/signup.tsx` — no structural change. If toast copy needs tweaking it lives here.

## Errors

- **429 TOO_MANY_REQUESTS** — emitted by better-auth's built-in limiter (per-IP custom rules) and by the per-email sign-in hook. Single shape, single error code. Optional `retryAfterSec` on the response when computable.
- No new auth/permission errors. No new business-rule violations.

## Integration points

- **No external services.** Postgres is already a hard dependency.
- **Failure mode**: if the Postgres rate-limit query fails (transient DB blip), better-auth's database storage falls back to allowing the request (fail-open). Acceptable for an MVP — the alternative (fail-closed) would lock everyone out during a DB hiccup. Documented in the new runbook.
- **Touches existing modules**: `lib/auth.ts` only. The two existing `before` hooks (`/request-password-reset`, `/send-verification-email`) are unchanged. The new sign-in hooks coexist in the same `createAuthMiddleware` block.

## Testing

**Unit** (`apps/api/test/unit/lib/`):
- `rate-limit-hash.test.ts` (new) — `hashIdentifier` is deterministic, lowercases before hashing, returns 16 chars.
- Extend `apps/api/test/unit/lib/auth.test.ts` — `rateLimit.storage === 'database'`, enable gate flips on `APP_ENV`, custom rules present for the routes in the table.

**Integration** (`apps/api/test/integration/auth-rate-limit.test.ts`, new):
- Builds a dedicated app instance with the limiter enabled (override `APP_ENV` for the test) against the existing test Postgres.
- Truncates `RateLimit` between tests (fits the existing per-test transactional rollback pattern; if not, `prisma.rateLimit.deleteMany()` in `beforeEach`).
- Cases:
  - 6th sign-in attempt with wrong password 429s.
  - Successful sign-in clears the per-email counter (a 6th attempt after success succeeds).
  - 6th signup from same IP within an hour 429s.
  - Unknown-email sign-in attempts increment the per-email counter (anti-enumeration).
  - Reset-password existing limits unaffected (regression).
  - 429 response carries our error envelope shape.

**E2E**: no changes. Staging exercises the real path post-deploy.

## Infrastructure

- **No CDK changes.** No ElastiCache, no new SG, no new secret, no docker-compose change.
- **No new env vars.** Existing `APP_ENV` already drives the enable gate.
- **No deploy-order changes.** Existing migrator task runs `prisma migrate deploy` before the API rolls — the new `RateLimit` migration ships through the same path.
- **Cost**: $0 incremental.

## CI/CD

- `ci.yml` — zero pipeline changes. Existing Postgres service container covers the new integration tests. New migration runs automatically via the existing `prisma migrate dev` in the test setup.
- `deploy-staging.yml` — zero DAG changes. Migrator task picks up the new migration.
- Dockerfile — unchanged.
- No new GH Actions secrets.

## Docs

- Update `.claude/memory/project_overview.md` — note Postgres-backed rate limiting alongside the existing auth wiring. Do NOT list Redis as added; it stays deferred.
- Update `.claude/skills/auth/SKILL.md` — remove "Rate limiting" from the "What's deferred" list; add a new "Rate limiting" section summarising the per-route table, the per-email lockout, and the `APP_ENV` gate.
- New runbook `docs/runbooks/rate-limiting.md` — querying 429 events in CloudWatch Logs Insights (filter on `event=rate_limit_exceeded`), clearing a lockout manually with `prisma.rateLimit.deleteMany({ where: { key: ... } })`, fail-open behaviour on DB blips.
- No `docs/system-design.md` change (no new AWS resource).
- No `docs/endpoints.md` change (no new routes).

## Out of scope (deliberately)

- CAPTCHA on signup (separate slice; meaningful only if abuse pressure shows up).
- Redis / `secondaryStorage` (upgrade path documented in the auth skill; pull the trigger when sustained >100 req/s on auth or when a job queue / session cache need lands).
- CloudWatch metric filter + alarm on 429 rate (defer until the broader observability slice — Sentry or CloudWatch dashboards).
- 2FA / TOTP.
- Account lockout escalation (e.g. require email re-verification after N lockouts).
- Per-route limit tuning UI / runtime config.

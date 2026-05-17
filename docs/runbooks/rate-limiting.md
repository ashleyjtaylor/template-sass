# Rate limiting runbook

Operator-facing guide for the auth rate limiter (planned in [`docs/tickets/06-auth-rate-limiting.md`](../tickets/06-auth-rate-limiting.md), implementation details in [`.claude/skills/auth/SKILL.md`](../../.claude/skills/auth/SKILL.md)).

## What's wired

- Better-auth's per-IP limiter on every auth route, backed by the `RateLimit` Prisma table (`storage: 'database'`).
- Per-email sign-in lockout in `hooks.before` / `hooks.after` on `/sign-in/email`: 5 failures within 15 min → 429. Counter cleared on successful sign-in.
- Active only in staging + production. Local + test are gated off so `pnpm dev` and the e2e suite don't 429 against themselves.

## Investigating 429s

A user reports they can't sign in. Two paths.

### Per-email lockout suspected

Every lockout trip writes one structured log line:

```
{ event: 'rate_limit_exceeded', route: '/sign-in/email', identifierHash, limit: 5, windowSec: 900 }
```

`identifierHash` is the first 16 chars of `sha256(email.toLowerCase())` — derive it locally to match against logs without sending the raw email to a log query:

```bash
echo -n 'user@example.com' | shasum -a 256 | cut -c1-16
```

CloudWatch Logs Insights — find recent lockouts:

```
fields @timestamp, route, identifierHash, limit, windowSec
| filter event = 'rate_limit_exceeded'
| sort @timestamp desc
| limit 50
```

Clear a single user's lockout (run from a shell with `DATABASE_URL` set to the right env):

```ts
await prisma.rateLimit.deleteMany({
  where: { key: `signin:fail:${hashIdentifier(email)}` }
})
```

Or via psql, computing the hash inline:

```sql
DELETE FROM rate_limit
WHERE key = 'signin:fail:' || substring(encode(digest(lower('user@example.com'), 'sha256'), 'hex') from 1 for 16);
```

(Requires `pgcrypto`; not enabled by default in our schema, so prefer the Prisma path.)

### Per-IP limit suspected

Better-auth's built-in per-IP trips don't currently emit a log line — the limiter returns a `Response` directly from inside its own code path. The envelope wrapper in `apps/api/src/app.ts` sees the 429 but only rewrites the body.

To diagnose, query the table directly:

```sql
SELECT key, count, to_timestamp("lastRequest" / 1000) AS last_at
FROM rate_limit
WHERE key NOT LIKE 'signin:fail:%'
ORDER BY "lastRequest" DESC
LIMIT 50;
```

Better-auth's keys look like `<ip>:<path>` — find the affected IP and route there. Clear by `key`:

```sql
DELETE FROM rate_limit WHERE key = '203.0.113.10:/sign-up/email';
```

## Failure mode

If a `RateLimit` query fails (DB blip), better-auth logs an internal error and **fails open** — the request is allowed through. This is deliberate: fail-closed would lock everyone out during a DB hiccup. Watch for `ctx.logger.error('Error setting rate limit', ...)` lines in the API log if you suspect the limiter is silently no-op'ing.

## When to revisit the design

- Sustained >100 auth req/s starts showing up in DB metrics → migrate to Redis (`storage: 'secondary-storage'` + ioredis as `secondaryStorage`). One-line swap in `lib/auth.ts` plus the new infra.
- You want alerting on 429 spikes → add a CloudWatch metric filter on `event=rate_limit_exceeded`, alarm on count over a 5-minute window. Currently logs only — defer until Sentry/observability lands.
- A legitimate user-flow keeps hitting per-IP signup at 5/hour (shared office wifi) → loosen `customRules['/sign-up/email']` in `lib/auth.ts`, document the new value here.

## Coverage gaps

Unit tests verify the config statics + the 429 envelope wrapper. There is **no integration coverage of the lockout flow against a real DB** — the project doesn't ship an integration-test harness yet. Reach the lockout via a manual smoke after the next staging deploy:

1. Sign in to the SPA with a known email + a wrong password 6 times in a row.
2. Expect a 429 toast on attempt 6 ("Too many sign-in attempts. Try again later.").
3. Wait 15 minutes (or `DELETE FROM rate_limit WHERE key LIKE 'signin:fail:%'` to skip the wait).
4. Sign in with the correct password — should succeed cleanly.

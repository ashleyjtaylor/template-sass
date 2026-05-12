# Local development

End-to-end setup — Postgres, env vars, the dev server, and tests.

## Prerequisites

- **Node + pnpm** — pinned versions in `package.json`'s `engines` and `packageManager`. With Volta installed, `cd` into the repo and Volta auto-uses them.
- **Docker** — for the local Postgres container.
- A POSIX shell (zsh, bash). All commands assume you're at the repo root.

## First-time setup

```bash
pnpm install
docker compose up -d                       # starts postgres
cp apps/api/.env.example apps/api/.env
```

`.env` is gitignored. The example values work as-is; only swap `BETTER_AUTH_SECRET` if you want a deterministic dev secret.

Apply Prisma migrations to **both** local databases:

```bash
pnpm --filter @template/db exec prisma migrate deploy
DB_NAME=template_test pnpm --filter @template/db exec prisma migrate deploy
```

After this, `pnpm dev` and `pnpm test` both work.

## Env vars

| Var | Purpose |
|---|---|
| `NODE_ENV=development` | Lets libraries that read `process.env.NODE_ENV` know we're not in prod |
| `APP_ENV=local` | Which deployed environment we are — drives any conditional logic in facade packages |
| `BETTER_AUTH_SECRET` | Signs better-auth session cookies — any 32+ char string locally |
| `BETTER_AUTH_URL=http://localhost:3000` | Canonical base URL better-auth uses for callbacks and CSRF |
| `CORS_ORIGINS=http://localhost:5174` | Origin allowed for both Hono CORS and better-auth's CSRF check |
| `WEB_BASE_URL=http://localhost:5174` | Used to build Checkout success / cancel URLs |

In production these come from Secrets Manager (`BETTER_AUTH_SECRET`) and CDK-injected env (`BETTER_AUTH_URL`, `CORS_ORIGINS`, `WEB_BASE_URL`). DB connection vars come from RDS's auto-generated secret.

## Running the dev server

```bash
pnpm dev
```

Spawns the API at `http://localhost:3000` and the web SPA at `http://localhost:5174`, both with hot-reload. The SPA's Vite proxy forwards `/api/*` to `localhost:3000`.

Smoke from another terminal:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

For auth requests via curl, send an `Origin` header matching `CORS_ORIGINS`:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:5174' \
  -d '{"email":"x@y.com","password":"abcd1234","firstname":"X","lastname":"Y","name":"X Y"}'
```

Browsers set `Origin` automatically; only manual tools need to specify it.

## Stripe (local billing flow)

Stripe is a fork-opt-in surface. Without configuration, `apps/api`'s billing routes return a clean 500 (`BillingNotConfigured`). To exercise the full flow locally, see [`billing-smoke.md`](./billing-smoke.md). Short version:

```bash
brew install stripe/stripe-cli/stripe
stripe login                                                    # one-time
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # leave running
```

Then populate `apps/api/.env` from the test-mode dashboard:

- `STRIPE_API_KEY=sk_test_…` — Developers → API keys
- `STRIPE_WEBHOOK_SECRET=whsec_…` — printed by `stripe listen` on startup
- `STRIPE_PRICE_ID_PRO=price_…` — Products → Add a recurring "Pro" product → copy the price id
- `STRIPE_PORTAL_RETURN_URL=http://localhost:5174`
- `WEB_BASE_URL=http://localhost:5174`

Restart the API after editing `.env`. Subscribe via the SPA's pricing page (`/`) → click "Get started" → fill out signup → land at Stripe Checkout. Test card `4242 4242 4242 4242`, any future date, any CVC. The `stripe listen` window will print the forwarded events; the `subscription` table should land a row within ~1s.

## Running tests

```bash
pnpm test
```

Runs unit tests across every workspace package. Tests use `template_test` (per each package's `vitest.config.ts`).

## Adding a new migration

1. Edit `packages/db/prisma/schema.prisma` with the new model / column / index.
2. Generate the migration **against the dev database**:
   ```bash
   pnpm --filter @template/db exec prisma migrate dev --name <kebab-slug>
   ```
3. Inspect the generated SQL before committing.
4. Apply the same migration to the test database:
   ```bash
   DB_NAME=template_test pnpm --filter @template/db exec prisma migrate deploy
   ```
5. Commit the new migration directory plus the schema change.

In CI, the `migrate-db` job applies the same committed migrations to the staging RDS via the migrator ECS one-off task.

## Resetting local data

```bash
docker compose down -v              # destroys the postgres volume
docker compose up -d postgres       # fresh Postgres with init script re-run
# then re-apply migrations as above
```

`prisma migrate reset` is blocked when invoked from an AI agent (Prisma's safeguard); run it directly.

## Connecting from a SQL client

```
host:     localhost
port:     5432
user:     postgres
password: postgres
database: template_dev   (or template_test)
```

Two databases by design: `template_dev` holds whatever you're poking at; `template_test` is the integration-test target. The Postgres init script at `docker/postgres-init.sql` creates both on container start.

## Stopping containers

```bash
docker compose stop            # keeps containers, keeps volumes
docker compose down            # removes containers, keeps volumes
docker compose down -v         # removes containers AND data
```

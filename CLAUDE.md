# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A stripped-down monorepo template for a single-product SaaS. The user flow is:

1. Land on `/` (pricing page)
2. Pick a plan → `/signup?plan=<key>`
3. Create account (email + password via better-auth)
4. Stripe Checkout
5. `/dashboard` (paywalled — gated by subscription state)

**Read the project overview first.** [`.claude/memory/project_overview.md`](.claude/memory/project_overview.md) is the source of truth for stack, architecture, schema, and load-bearing decisions.

Stack at a glance: TypeScript + pnpm workspaces + Turborepo + Biome. Backend = Hono + Prisma + Postgres on ECS Fargate. Frontend = Vite + TanStack Router + Tailwind + shadcn/ui (single SPA: `apps/web`). Auth = self-hosted better-auth (email + password). Billing = Stripe Checkout + Customer Portal, per-user subscription. Infra = AWS CDK (3 stacks: network/data/app, 2 envs: staging/prod). CI/CD = GitHub Actions with OIDC, promote-by-image.

No orgs, no worker, no Redis, no BullMQ, no email service, no audit log, no staff/admin app.

## Layout

```
apps/
  api/        Hono on Node — better-auth + billing routes + Stripe webhook
  web/        Vite SPA — pricing / signup / login / dashboard

packages/
  billing/    Stripe SDK wrapper, checkout, portal, access-state resolver
  db/         Prisma client + schema (User, Session, Account, Verification, Subscription, StripeEvent)
  errors/     typed HttpError classes

infra/cdk/
  bin/app.ts
  lib/{network,data,app}-stack.ts
```

## Common commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint` — all turbo-orchestrated.

Local dev needs Postgres (`docker compose up postgres`) and Stripe test keys in `apps/api/.env`. See [`docs/runbooks/local-dev.md`](docs/runbooks/local-dev.md).

## Other documentation

- [`docs/system-design.md`](docs/system-design.md) — deployed AWS topology
- [`docs/endpoints.md`](docs/endpoints.md) — API routes
- [`docs/runbooks/`](docs/runbooks/) — operational procedures

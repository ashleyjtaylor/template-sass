# Template

A stripped-down SaaS template. User picks a plan → creates account → Stripe Checkout → paywalled dashboard.

## Getting started

For local dev setup (prereqs, Postgres, env vars, dev server, tests, migrations) see [`docs/runbooks/local-dev.md`](docs/runbooks/local-dev.md).

## Common scripts

| Command | What |
| --- | --- |
| `pnpm dev` | Start API + web SPA in dev mode |
| `pnpm build` | Production build |
| `pnpm lint` | Biome check (lint + format) |
| `pnpm lint:fix` | Biome check + auto-fix |
| `pnpm format` | Biome format |
| `pnpm typecheck` | TypeScript across all workspaces |
| `pnpm test` | Run all tests |

## Where things live

- [`.claude/memory/project_overview.md`](.claude/memory/project_overview.md) — stack, architecture, load-bearing decisions
- [`docs/system-design.md`](docs/system-design.md) — deployed AWS topology
- [`docs/endpoints.md`](docs/endpoints.md) — API routes
- [`docs/runbooks/`](docs/runbooks/) — operational procedures
- [`.claude/skills/`](.claude/skills/) — process skills invoked via `/<skill>` in Claude Code

## Conventions

- Conventional Commits enforced via commitlint (commit-msg hook).
- Biome auto-fixes formatting on `git commit` via lefthook (pre-commit hook).
- Trunk-based: feature branches merge into `main`.
- Node + pnpm versions pinned in `package.json` (`engines`, `packageManager`); managed via [Volta](https://volta.sh).

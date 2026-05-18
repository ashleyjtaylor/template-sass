---
name: node
description: Apply Node.js + TypeScript conventions — async patterns, error handling, ES modules, logging (Pino), and environment configuration (Zod + APP_ENV). Use when writing or reviewing any backend code.
metadata:
  tags: node, nodejs, typescript, backend, server
---

Apply to any Node.js code. Domain-specific guidance lives in the rule files below — open the relevant one for detail.

- [rules/error-handling.md](rules/error-handling.md) — typed errors, never swallow, error-cause chains
- [rules/async.md](rules/async.md) — async/await over chained promises, Promise.all / allSettled, AbortController
- [rules/modules.md](rules/modules.md) — ESM, explicit `.js` extensions, named exports, `import.meta.dirname`
- [rules/logging.md](rules/logging.md) — Pino, child loggers, redaction, level conventions
- [rules/environment.md](rules/environment.md) — Zod-validated env at startup, `APP_ENV` for transport selection, secrets via Secrets Manager (not env files)

---
name: node
description: Provides domain-specific best practices for Node.js development with TypeScript, covering type stripping, async patterns, error handling, streams, modules, testing, performance, caching, logging, and more. Use when setting up Node.js projects with native TypeScript support, configuring type stripping (--experimental-strip-types), writing Node 22+ TypeScript without a build step, or when the user mentions 'native TypeScript in Node', 'strip types', 'Node 22 TypeScript', '.ts files without compilation', 'ts-node alternative', or needs guidance on error handling, graceful shutdown, flaky tests, profiling, or environment configuration in Node.js. Helps configure tsconfig.json for type stripping, set up package.json scripts, handle module resolution and import extensions, and apply robust patterns across the full Node.js stack.
metadata:
  tags: node, nodejs, javascript, typescript, type-stripping, backend, server
---

## When to use

Use this skill whenever you are dealing with Node.js code to obtain domain-specific knowledge for building robust, performant, and maintainable Node.js applications.

## Common Workflows

For multi-step processes, follow these high-level sequences before consulting the relevant rule file:

**Error handling**: Define a shared error base class → classify errors (operational vs programmer) → add async boundary handlers (`process.on('unhandledRejection')`) → propagate typed errors through the call stack → log with context before responding or crashing. See [rules/error-handling.md](rules/error-handling.md).

## How to use

Read individual rule files for detailed explanations and code examples:

- [rules/error-handling.md](rules/error-handling.md) - Error handling patterns in Node.js
- [rules/async.md](rules/async.md) - Async/await and Promise patterns
- [rules/modules.md](rules/modules.md) - ES Modules and CommonJS patterns
- [rules/logging.md](rules/logging.md) - Logging and debugging patterns
- [rules/environment.md](rules/environment.md) - Environment configuration and secrets management

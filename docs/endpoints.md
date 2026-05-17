# Endpoints

Per-route documentation for everything the API exposes.

Read alongside `system-design.md` (the deployed topology) and `.claude/memory/project_overview.md` (the design intent).

## Path conventions

- All application routes live under `/api/*`. CloudFront forwards only that prefix to the ALB; the SPA bundle is served from the same distribution at `/`.
- Health checks stay un-prefixed — `/health` and `/health/ready` — because the ALB target-group health check hits the ALB DNS directly.

## `/health`

Liveness probe used by the ALB. No DB dependency. Returns `200 { status, version, env, uptime }`.

`version` is the git SHA the running container was built from. `env` is `'local' | 'staging' | 'production'`. `uptime` is process uptime in whole seconds.

## `/health/ready`

Readiness probe used by internal monitoring. Probes the DB with a 2-second timeout. Returns `200 { status: 'ok', checks: { db: 'ok' } }` when reachable, `503 { status: 'unavailable', checks: { db: 'down' } }` otherwise. Failures here do **not** pull tasks out of rotation — that's `/health`'s job.

## `/api/auth/*`

Better-auth-mounted routes. Email + password auth with DB-backed cookie sessions.

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/sign-up/email` | POST | Create user, set session cookie. Body: `{ email, password, name, firstname, lastname }`. |
| `/api/auth/sign-in/email` | POST | Validate credentials, set session cookie. |
| `/api/auth/sign-out` | POST | Delete session row, clear cookie (requires `Origin` header — better-auth's CSRF check). |
| `/api/auth/get-session` | GET | Return `{ user, session }` if cookie valid, else `null` (always 200). |

Each row in `user` / `session` / `account` / `verification` carries a prefixed `entityId` (`usr_`, `sess_`, `acct_`, `veri_`) and the `requestId` of the HTTP request that created it. Both fields are populated by better-auth's `additionalFields` config in `apps/api/src/lib/auth.ts` — `entityId` from a per-prefix UUID factory and `requestId` from request-scoped AsyncLocalStorage.

### Status code deviations

| Flow | Expected | Actual |
|---|---|---|
| Duplicate-email signup | 409 | **422** (`FAILED_TO_CREATE_USER` — better-auth's response is forwarded verbatim) |
| Sign-out success | 204 | **200** |
| Sign-out without `Origin` header | — | **403** (`MISSING_OR_NULL_ORIGIN`) |
| Get-session without cookie | — | **200 `null`** (deliberate convention, not 401) |

## `/api/billing/*`

Stripe Checkout + Customer Portal + access-state resolver. **Per-user subscription** — one `Subscription` row per `User`. The Stripe customer is created lazily during Checkout; the webhook handler links it to the user via the `userEntityId` carried in `metadata`.

The billing routes are fork-opt-in: until `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, and `STRIPE_PRICE_ID_MAX` are populated, `POST /billing/checkout-session` and `POST /billing/portal-session` return **500** with `details.reason: 'BillingNotConfigured'`. `GET /billing/access-state` always works (reads only the local DB).

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/billing/checkout-session` | POST | session | Body: `{ plan: string }` (`'pro'` or `'max'`). Maps to a Stripe price id via `PLAN_PRICE_IDS` in `packages/billing/src/env.ts`. Response: `{ url }`. **409** `AlreadySubscribed` if the user already has an active / trialing / past_due subscription. |
| `/api/billing/portal-session` | POST | session | Mint a Stripe Customer Portal session. Response: `{ url }`. **409** `NoStripeCustomer` if the user has never completed a Checkout. |
| `/api/billing/access-state` | GET | session | Returns `{ state: 'paid' \| 'past_due' \| 'paywalled', subscription?: { planKey, status, currentPeriodEnd, cancelAtPeriodEnd } }`. Used by the `/dashboard` route to render the paywall vs the product. |
| `/api/billing/change-plan/preview` | POST | session | Body: `{ plan: string }`. Pure read — quotes the prorated charge for switching to `plan` via `stripe.invoices.createPreview`. Response: `{ amountDueCents, currency, prorationDateUnix }`. **409** `NoActiveSubscription` if the user has no active/trialing sub; **409** `InvalidPlanChange` if `plan` matches the current plan; **422** `UnsupportedPlan` if `plan` is not in `PLAN_PRICE_IDS`. |
| `/api/billing/change-plan` | POST | session | Body: `{ plan: string, prorationDateUnix?: number }`. Executes the switch via `stripe.subscriptions.update` with `proration_behavior: 'create_prorations'`. Pass `prorationDateUnix` from the preview call so the actual charge matches the quote. Response: `{ status: 'ok' }`. The mirror updates asynchronously via the `customer.subscription.updated` webhook. Same error classes as the preview route. |

## `/api/webhooks/stripe`

Stripe → API. Raw-body signature verification via `STRIPE_WEBHOOK_SECRET`. Processed **inline** (no worker, no queue):

1. Verify signature
2. Insert into `stripe_event` (idempotency: `id` is the Stripe event id, P2002 conflict → 200 `replay: true`)
3. Dispatch by event type:
   - `checkout.session.completed` — set `User.stripeCustomerId` from `session.customer`, resolved by `client_reference_id` / `metadata.userEntityId`
   - `customer.subscription.created` / `.updated` — UPSERT the `Subscription` mirror row keyed by `userId`
   - `customer.subscription.deleted` — mark canceled
   - unknown — log at debug, 200
4. If the dispatch throws, delete the `stripe_event` row so Stripe's retry will be processed (rather than treated as a replay) and re-throw → 500

### Status code deviations

| Flow | Expected | Actual |
|---|---|---|
| Bad signature | 401 | **401** with `{ error: 'Invalid signature' }` |
| Billing routes on an unconfigured fork | 503 | **500** with `details.reason: 'BillingNotConfigured'` |

## Convention for new endpoints

When adding a route:

1. Add a section here (alphabetical-ish; group related routes under one heading).
2. Document status-code deviations from typical REST in a table at the end of the section.
3. Cross-reference `project_overview.md` rather than duplicating its content.

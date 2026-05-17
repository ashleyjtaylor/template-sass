# 09 — In-app plan upgrade (Pro → Max)

Plan agreed before implementation. Captures intent so future readers can compare what shipped against what was decided.

## Scope

- **Upgrade only** (Pro → Max). Downgrade and all other subscription management (cancel, card, invoices) stays via Stripe Customer Portal.
- **Proration preview** before confirm: modal shows the prorated charge ("You'll be charged £X today") before the user submits.
- Entry point: SubscriptionCard on `/billing`. When `planKey === 'pro'`, render an "Upgrade to Max" button alongside the existing "Manage on Stripe". When `planKey === 'max'`, no upgrade affordance.

## Operator action required after merging

Configure the Stripe Customer Portal so it surfaces downgrades but not upgrades — list **only Pro** in the Portal's "Subscription updates → Products" section. Effect:

| Portal products list | Pro user sees | Max user sees |
|---|---|---|
| **Pro only** (recommended) | Nothing — they upgrade in-app | Switch to Pro (downgrade) |

Full step-by-step lands in `docs/runbooks/in-app-upgrades.md`.

## API

Two new routes on the existing billing router (`/api/billing`):

```
POST /api/billing/change-plan/preview   body: { plan: string }
  200 → { amountDueCents: number, currency: string, prorationDateUnix: number }

POST /api/billing/change-plan           body: { plan: string }
  200 → { status: 'ok' }
```

Both require an authed session. Both use the user's existing `stripeSubscriptionId` from the `Subscription` mirror — no `customerId` round-trip.

## Billing module (`packages/billing/src/upgrade.ts`)

New module exposing:

```ts
previewPlanChange({ subscriptionId, newPlan }) → Promise<{
  amountDueCents: number
  currency: string
  prorationDateUnix: number
}>
// 1. stripe.subscriptions.retrieve(subscriptionId) → grab existing line-item id
// 2. stripe.invoices.retrieveUpcoming({ subscription, subscription_items: [{ id, price: newPriceId }], subscription_proration_date }) → read amount_due
// Returns the prorated charge for the immediate switch.

changeSubscriptionPlan({ subscriptionId, newPlan, prorationDateUnix }) → Promise<void>
// stripe.subscriptions.update(subscriptionId, {
//   items: [{ id, price: newPriceId }],
//   proration_behavior: 'create_prorations',
//   proration_date: prorationDateUnix
// })
// The webhook's customer.subscription.updated handler mirrors the change.
```

Export both from `packages/billing/src/index.ts`.

## Service (`apps/api/src/modules/billing/service.ts`)

Two new functions, both following the same validation pattern:

```ts
previewUpgrade(userId, targetPlan) → preview shape
executeUpgrade(userId, targetPlan, prorationDateUnix) → void
```

Validation chain (shared helper):
1. `NotFoundError` if user missing.
2. `ConflictError('NoActiveSubscription')` if no subscription row or status not in `{ active, trialing }`.
3. `ConflictError('InvalidPlanChange')` if `targetPlan === subscription.planKey`.
4. `ValidationError('UnsupportedPlan')` if `targetPlan` is not in `PLAN_PRICE_IDS` (existing `priceIdForPlan` already throws).

## Frontend (`apps/web/src/`)

**New hooks** in `modules/billing/api.ts`:

```ts
usePreviewPlanChange()   // mutation; called when "Upgrade to Max" is clicked
useChangePlan()          // mutation; called from the confirm button in the modal
```

Both invalidate `['access-state']` on success so SubscriptionCard re-renders with the new plan.

**New component** `modules/billing/UpgradeModal.tsx`:
- Opens on "Upgrade to Max" → fires `previewPlanChange.mutate({ plan: 'max' })` → renders amount.
- Body: "Upgrade to Max — You'll be charged **£X.XX** today, prorated for the remaining N days of this billing period. Then **£Y/month** going forward."
- Loading state during preview; inline error if preview fails.
- Confirm → `changePlan.mutate({ plan: 'max', prorationDateUnix })` → close modal + toast "Welcome to Max" + invalidate access-state.

**`routes/billing.tsx`**:
- Within `SubscriptionCard`, when `subscription.planKey === 'pro'`, render an "Upgrade to Max" button alongside (or above) the existing "Manage on Stripe" button.
- Mount `<UpgradeModal />` and toggle via local state.

## Errors

| Code | When | Status |
|---|---|---|
| `NoActiveSubscription` | User has no sub or status not active/trialing | 409 |
| `InvalidPlanChange` | Target == current plan | 409 |
| `UnsupportedPlan` | Target plan not in `PLAN_PRICE_IDS` | 422 |
| `BillingNotConfigured` | Stripe credentials missing (existing 503 path) | 503 |
| Generic 5xx | Stripe API failure — propagates | 500 |

SPA error mapping: `NoActiveSubscription` → "Subscribe first to upgrade.", `InvalidPlanChange` → "You're already on this plan.", others → "Couldn't upgrade. Try again."

## Validation

Both routes accept `{ plan: string }` validated against `priceIdForPlan` (existing helper throws on unknown). No client-side validation needed — the SPA only sends `'max'` for the upgrade button.

## Data model

**None.** No tables, columns, or migrations. The webhook's `customer.subscription.updated` handler (with `planKeyForPriceId` from PR #8) already mirrors plan changes.

## Tests

**Unit `packages/billing/test/unit/upgrade.test.ts`** (new):
- `previewPlanChange` retrieves subscription, then retrieves upcoming invoice with the right shape, returns parsed `{ amountDueCents, currency, prorationDateUnix }`.
- `changeSubscriptionPlan` calls `stripe.subscriptions.update` with `proration_behavior: 'create_prorations'` and the supplied proration date.
- Both throw via `priceIdForPlan` for unconfigured plan keys.

**Unit `apps/api/test/unit/modules/billing/service.test.ts`** (new — or extend existing):
- `previewUpgrade` / `executeUpgrade` throw `NotFoundError` when user missing.
- Throw `ConflictError('NoActiveSubscription')` for canceled / unpaid / missing sub.
- Throw `ConflictError('InvalidPlanChange')` when current === target.
- Happy paths return the expected shapes.

**Unit `apps/api/test/unit/modules/billing/routes.test.ts`** (extend or add):
- `POST /api/billing/change-plan/preview` returns 200 + preview shape.
- `POST /api/billing/change-plan` returns 200.
- Both: 401 without session; 409 / 422 for the error classes above.

**E2E**: skipped. Stripe preview + update aren't deterministic enough for CI Playwright. Manual smoke against staging covers the path.

**Manual smoke** (against staging):
1. Sign up + subscribe to Pro.
2. `/billing` → click **Upgrade to Max** → modal renders with a prorated £ amount → confirm.
3. Within ~1s SubscriptionCard re-renders showing "Max".
4. DB: `subscription.plan_key = 'max'`, `stripe_price_id` matches `STRIPE_PRICE_ID_MAX`.
5. Stripe Dashboard shows the proration invoice line items matching what the modal previewed.

## Infrastructure

No CDK changes. No new env vars (uses existing `STRIPE_PRICE_ID_PRO` + `STRIPE_PRICE_ID_MAX`).

## CI/CD

Zero pipeline changes. New unit tests pick up via Turbo. Dockerfile unchanged.

## Docs

- This ticket — durable plan record.
- `docs/endpoints.md` — add the two new routes.
- `docs/runbooks/in-app-upgrades.md` — operator runbook covering the in-app flow, the proration math, the **"list only Pro in Portal products" setup step**, and troubleshooting (preview vs charge mismatch, scaling to 3+ plans via dynamic portal configuration).
- `.claude/memory/project_overview.md` — Billing section: note that upgrades happen in-app, everything else (cancel/card/invoices/downgrade) via Portal.

## Out of scope (deliberately)

- Downgrade in-app (Portal handles it).
- Multi-tier upgrades (only Pro → Max in the two-plan template).
- Scheduled / end-of-period plan changes.
- Coupon / promo code injection during upgrade.
- Trial conversion handling (upgrade-from-trial uses the same path; no special UX yet).
- Email notification on upgrade — Stripe already sends a payment receipt.
- Dynamically-constructed per-session Portal configuration for 3+ plans — documented as the upgrade path in the runbook.

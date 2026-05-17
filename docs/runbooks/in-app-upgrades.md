# In-app plan upgrades

How subscribers upgrade (Pro → Max today) without leaving the app, while downgrades continue to flow through Stripe's Customer Portal.

## Architecture in one paragraph

The `/billing` SubscriptionCard shows an **Upgrade** button when the user is on a tier that has a higher plan defined in `UPGRADE_TARGETS` (see `apps/web/src/routes/billing.tsx`). Clicking it opens a modal that fires `POST /api/billing/change-plan/preview` → renders the prorated charge → on confirm fires `POST /api/billing/change-plan` with the same `prorationDateUnix` so the actual charge matches the quote. Stripe's `subscriptions.update` runs with `proration_behavior: 'create_prorations'`, fires `customer.subscription.updated`, and our existing webhook handler mirrors the change via `planKeyForPriceId`. No new tables, no new workers, no new env vars.

## Stripe Dashboard setup (one-time, per environment)

### 1. Both Products tagged with `metadata.planKey`

Already documented in [`plan-switching.md`](./plan-switching.md). Stripe Dashboard → **Products** → open each subscription product → set `metadata.planKey` = `pro` or `max`. The in-app webhook uses `planKeyForPriceId` (env-driven reverse map) as the primary resolver, but the metadata fallback exists in the same chain.

### 2. Configure the Customer Portal to allow **downgrades only**

This is the key step for keeping the upgrade path in-app while still letting Portal handle downgrades cleanly.

Stripe Dashboard → **Settings** → **Billing** → **Customer portal** → **Subscriptions** tab.

- ✅ **Customers can switch plans** — required for the downgrade flow to appear.
- ✅ **Prorate subscription changes** (recommended) — matches the in-app upgrade's `create_prorations` behaviour.
- Under **Products**, list **only Pro**. Effect:

| Portal products list | Pro user sees in Portal | Max user sees in Portal |
|---|---|---|
| Pro + Max | "Switch to Max" *(competes with our in-app upgrade)* | "Switch to Pro" *(downgrade — wanted)* |
| **Pro only** *(recommended)* | Nothing — they upgrade in-app | **"Switch to Pro"** *(downgrade — wanted)* |
| Max only | "Switch to Max" *(competes with in-app)* | Nothing |

Save. Repeat in each Stripe account / mode (test vs live) you target.

### 3. Webhook events selected

`customer.subscription.updated` must be in the endpoint's events list (already required by the plan-switching slice; double-checking it here saves a debugging session).

## How the in-app flow handles each error

| Server response | Modal shows | When |
|---|---|---|
| `200` | "You'll be charged £X today…" → confirm button | Happy path |
| `409 NoActiveSubscription` | "Subscribe first to upgrade." | User has no live sub — UI button shouldn't have rendered, but defensive |
| `409 InvalidPlanChange` | "You're already on this plan." | Defensive — UI button shouldn't have rendered |
| `422 UnsupportedPlan` | "That plan is not available." | Fork hasn't populated the target plan's price id env var |
| `429` | "Too many requests. Wait a few minutes and try again." | Rate-limit hit (not yet wired for billing routes; future) |
| `5xx` | "Something went wrong on our end. Try again in a moment." | Stripe API failure |

## Smoke test (staging)

1. Sign up + subscribe to **Pro** through the normal flow (`/` → `/signup?plan=pro` → Checkout).
2. Wait for the webhook to land the mirror row (≤1s).
3. Sign in → `/billing` → confirm the SubscriptionCard shows **Pro** with an **Upgrade** section.
4. Click **Upgrade** → modal renders with a prorated £ amount within ~500ms.
5. Confirm → toast "Welcome to Max" → modal closes → SubscriptionCard re-renders showing **Max** within ~1s.
6. Stripe Dashboard: confirm a proration invoice with line items matching the quoted amount.
7. DB: `SELECT plan_key, stripe_price_id FROM subscription WHERE user_id = '<u>'` returns `max` + the Max price id.
8. Open the Customer Portal from "Manage on Stripe" — verify it now shows **Switch to Pro** (downgrade) and no other plan options.

## Proration math (Stripe semantics)

With `proration_behavior: 'create_prorations'`:
- Stripe credits the unused portion of the **current** plan against the user's next invoice.
- Charges the prorated cost of the **new** plan for the remainder of the current billing period **immediately**.
- The billing-period end date doesn't change; the next full charge at the new plan's price happens then.
- `proration_date` is the moment used for both calculations. The preview endpoint pins this to `Date.now()` and returns it; the SPA passes it through to the execute endpoint so the actual charge matches the quote down to the second.

## Troubleshooting

**Preview shows £X, Stripe charged £Y.** The SPA should be forwarding `prorationDateUnix` from preview → execute. If it isn't (manual API calls, custom forks), Stripe recomputes against `now()` when the execute call lands — usually pennies of drift but visible. Check the network panel: the `/change-plan` POST body should include `prorationDateUnix`.

**Upgrade succeeds in Stripe but `plan_key` stays on `pro`.** The webhook resolved `planKey` via the fallback chain (product metadata or sub metadata) and didn't find Max. Ensure `STRIPE_PRICE_ID_MAX` is populated in the API container's env. The reverse map (`planKeyForPriceId`) is the primary resolver; without the env var it's empty and the fallback chain takes over.

**Customer Portal still shows "Switch to Max".** The Portal config's products list still includes Max. Re-check step 2 above; remove Max from the list and save.

**"Could not upgrade" toast immediately on click.** Open browser devtools network panel. Most common: `BillingNotConfigured` (503) — verify all four Stripe env vars are set in the API container. Less common: `NoActiveSubscription` — the user's mirror row is stale or canceled; check Stripe Dashboard against the local `subscription` table.

## Scaling to 3+ plans

The two-plan template uses a static `UPGRADE_TARGETS` map (`pro → max`). For a third tier (e.g. `enterprise`), extend the map: `pro → max`, `max → enterprise`. The same UI / endpoints handle it.

The **Portal config problem** becomes harder once a third plan exists, because the global products list can't simultaneously hide the upgrade for Pro users and allow the downgrade for Enterprise users. At that point you'd dynamically construct a per-session Portal configuration via `stripe.billingPortal.configurations.create({ features: { subscription_update: { products: [...] } } })`, filtered to plans ≤ the user's current. Adds ~20 LOC in `packages/billing/src/portal.ts`; the SPA contract doesn't change.

## What's deliberately not built

- **Downgrade in-app.** Portal handles it cleanly — refund-credit math, retention copy, scheduling at period end.
- **Coupon / promo code application during upgrade.** Stripe Checkout handles this for new subs; in-app upgrade keeps the same pricing the user signed up at.
- **Email notification on upgrade.** Stripe sends the payment receipt automatically.
- **Trial conversion banner.** Upgrading from a `trialing` sub uses the same path; no special UX yet.
- **Scheduled / end-of-period upgrades.** All upgrades are immediate (better conversion).

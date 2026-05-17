# Plan switching via Stripe Customer Portal

How existing subscribers move between Pro and Max (and any future plans). The template **doesn't build a custom plan-switch UI** — Stripe's hosted Customer Portal handles the entire flow (proration math, confirmation, receipt). Forks just need to configure the portal correctly and tag each Stripe Product with a `planKey`.

## Architecture in one paragraph

The SPA's `/billing` page already has a "Manage on Stripe" button that mints a Customer Portal session via `POST /api/billing/portal-session`. With the portal configured to allow subscription updates, the same button surfaces a "Change plan" affordance to the user. When they pick a different plan, Stripe fires `customer.subscription.updated` — our existing webhook handler (`apps/api/src/modules/webhooks/stripe.ts`) calls `planKeyForPriceId(item.price.id)` to look the new plan up in `PLAN_PRICE_IDS`, and upserts the `Subscription` mirror with the new `planKey` + `stripePriceId`. No new endpoints, no new SPA components.

## Stripe Dashboard setup (one-time, per environment)

### 1. Tag each Product with `planKey`

The webhook's primary resolution is the env-var reverse map. If for any reason that lookup misses (e.g. a fork using a Stripe product that isn't in `PLAN_PRICE_IDS`), the fallback chain reads `product.metadata.planKey`. Setting it costs nothing and keeps the fallback honest.

In the Stripe Dashboard → **Products** → open each subscription product:

- "Pro" → click "Edit metadata" → add `planKey = pro`
- "Max" → click "Edit metadata" → add `planKey = max`

Save. Do this in the same Stripe account / mode (test vs live) you're targeting.

### 2. Enable subscription updates in the Portal config

Stripe Dashboard → **Settings** → **Billing** → **Customer portal** → **Subscriptions** tab.

Enable:
- ✅ **Customers can switch plans** — required for the change-plan flow to appear.
- ✅ **Prorate subscription changes** (recommended) — Stripe credits the unused portion of the current plan toward the new one.

Under **Products**, add both Pro and Max as available plans the user can switch between. Don't list any product you don't want them to be able to pick.

Under **Cancellation** (still relevant — keep what you had):
- ✅ **Customers can cancel subscriptions** — already required for the existing cancel-via-portal flow.

Hit **Save**.

### 3. Verify the webhook event is selected on your endpoint

Stripe Dashboard → **Developers** → **Webhooks** → the endpoint pointed at `https://<your-app>/api/webhooks/stripe`.

Ensure `customer.subscription.updated` is in the events list. (`customer.subscription.created` and `customer.subscription.deleted` are also needed, but they're already configured if the rest of billing works.)

## Smoke test

1. Sign up and subscribe to **Pro** through the normal flow (`/` → `/signup?plan=pro` → Stripe Checkout). Confirm `subscription.plan_key = 'pro'` in the DB.
2. Sign in → navigate to `/billing` → click **Manage on Stripe**.
3. In the portal, click **Update plan** → pick **Max** → confirm the proration amount → submit.
4. Stripe redirects you back to `/billing`. Within ~1 second the webhook should fire.
5. Refresh the page (or wait for the access-state query to refetch on focus). The plan label updates to **Max**.
6. Confirm in the DB: `SELECT plan_key, stripe_price_id FROM subscription WHERE user_id = '<u>'` shows the new price id and `plan_key = 'max'`.

If the plan label updates but `plan_key` is still `'pro'` — check that `STRIPE_PRICE_ID_MAX` is set in the API container's environment. The webhook's reverse map needs it; without it, the resolver falls through to product metadata (which works only if you completed step 1 above) and eventually defaults to `'pro'`.

## Local development

`stripe listen --forward-to localhost:3000/api/webhooks/stripe` will forward portal-driven `customer.subscription.updated` events the same way it forwards checkout events. Run the smoke test above against `localhost:5174` once both `STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_MAX` are populated in `apps/api/.env`.

## What's deliberately not built

- A native in-app plan-switch UI (would need a `POST /api/billing/change-plan` endpoint that calls `stripe.subscriptions.update`, plus a confirmation modal handling proration disclosure). Stripe's hosted Portal does all of this for free.
- Plan-comparison UI on `/billing` — the pricing page at `/` already serves that purpose for first-time signups.
- Downgrade-specific UX (warnings, retention copy) — Stripe Portal exposes a flat list of plans; richer messaging would be a custom build.

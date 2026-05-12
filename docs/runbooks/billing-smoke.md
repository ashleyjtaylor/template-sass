# Billing smoke test (manual playbook)

End-to-end walkthrough for verifying the Stripe billing surface before merging anything that touches `apps/api`'s billing module, `packages/billing`, or the SPA's pricing / dashboard. CI uses a stubbed Stripe SDK; this runbook covers the real-Stripe path that no automated suite hits.

The playbook assumes a freshly-checked-out branch with the local Compose services running.

## Prerequisites

- A Stripe test-mode account. The dashboard's **Test mode** toggle (top-right) must be on for every step below.
- Stripe CLI installed (`brew install stripe/stripe-cli/stripe`, then `stripe login` once).
- Local Compose up: `docker compose up -d`.

## One-time Stripe test-mode setup

1. **Test API key**. Stripe dashboard → Developers → API keys → copy the **Secret key** (`sk_test_…`).
2. **Pro product**. Products → **Add product**. Name `Pro`. Pricing model: recurring, monthly, $29 USD (any amount works). Save. Copy the price's `price_…` id.
3. **Webhook signing secret**. In a dedicated terminal:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   The CLI prints `Your webhook signing secret is whsec_…` — copy it. Leave this terminal running.

## Local env

Populate `apps/api/.env`:

```
WEB_BASE_URL=http://localhost:5174
STRIPE_API_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_ID_PRO=price_…
STRIPE_PORTAL_RETURN_URL=http://localhost:5174
```

Restart `apps/api`'s dev server so the new env loads.

## Smoke path

1. **Visit `http://localhost:5174/`.** Pricing page renders with the Pro plan card.
2. **Click "Get started".** Routes to `/signup?plan=pro`. Fill out the form and submit.
3. **Signup succeeds.** The web client then auto-calls `POST /api/billing/checkout-session { plan: 'pro' }` → returns a Stripe-hosted URL → `window.location = url`.
4. **Complete Checkout in the Stripe tab.** Test card: `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Submit.
5. **Stripe redirects to `/dashboard`.** Within ~1-2s the `stripe listen` terminal prints:
   ```
   checkout.session.completed   [200 OK]
   customer.subscription.created [200 OK]
   ```
   The dashboard's access-state query refetches on window focus / mount, flipping `paywalled` → `paid` (a hard refresh forces an immediate refetch).
6. **Verify DB state.**
   ```bash
   docker exec template-postgres psql -U postgres -d template_dev -c \
     "SELECT status, plan_key, current_period_end FROM subscription;"
   docker exec template-postgres psql -U postgres -d template_dev -c \
     "SELECT email, stripe_customer_id FROM \"user\" WHERE stripe_customer_id IS NOT NULL;"
   ```
   The subscription row has `status=active`, `plan_key=pro`. The user row has a non-null `stripe_customer_id`.
7. **Click "Manage billing"** in the dashboard sidebar UserMenu or PaidState section. `POST /api/billing/portal-session` returns a Customer Portal URL. Stripe portal opens. Try "Cancel plan". Confirm.
8. **Return to the web SPA.** The `stripe listen` terminal prints `customer.subscription.updated`. Within ~1s, the dashboard shows `cancelAtPeriodEnd: true` on next refetch.

## Idempotency check (replay)

```bash
# In a third terminal:
stripe events resend <event_id>      # event id printed in the `stripe listen` output
```

`stripe listen` prints `[200 OK]` with `replay: true` in the body. The DB is unchanged (the second event is a no-op because `stripe_event` already has the id).

## Failure modes to test

- **Bad signature**: temporarily set `STRIPE_WEBHOOK_SECRET=whsec_wrong` in `apps/api/.env`, restart API, send another event. The API returns 401; the `stripe_event` table is unchanged.
- **Unconfigured fork**: blank `STRIPE_API_KEY` in `apps/api/.env`, restart. `POST /api/billing/checkout-session` returns 500 with `details.reason: 'BillingNotConfigured'`. `GET /api/billing/access-state` still returns 200 (reads local DB only).
- **Already subscribed**: trigger Checkout twice in a row for the same user. The second request returns 409 `AlreadySubscribed` from `buildCheckoutSession`'s pre-check.

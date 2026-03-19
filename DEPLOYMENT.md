# Deployment Guide — DrMobilePhone

## Required Environment Variables (Netlify)

Set all of the following in **Netlify → Site configuration → Environment variables** before going live.

| Variable | Description | Where to find it |
|----------|-------------|-----------------|
| `ALLOWED_ORIGIN` | Your production domain — **must match exactly** | `https://www.drmobilephone.ie` |
| `STRIPE_SECRET_KEY` | Stripe secret key | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Stripe Dashboard → Developers → Webhooks → your endpoint |
| `SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (keep secret) | Supabase Dashboard → Settings → API |
| `RESEND_API_KEY` | Resend API key for email sending | Resend Dashboard → API Keys |
| `SITE_URL` | Public site URL used in email links | `https://www.drmobilephone.ie` |

> ⚠️ Never commit real secret values to git. This file documents key names only.

---

## Pre-Launch Checklist

### Stripe
- [ ] Switch `STRIPE_SECRET_KEY` from `sk_test_...` to `sk_live_...`
- [ ] Create a production webhook endpoint in Stripe pointing to `https://www.drmobilephone.ie/.netlify/functions/stripe-webhook`
- [ ] Enable events: `checkout.session.completed`, `checkout.session.expired`
- [ ] Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

### Resend (Email)
- [ ] Verify domain `drmobilephone.ie` in Resend → Domains (DNS records needed — see DNS developer)
- [ ] Confirm sending from `orders@drmobilephone.ie` works
- [ ] Set `RESEND_API_KEY` in Netlify

### Supabase
- [ ] Verify RLS is enabled on `orders` table with policy: `SELECT WHERE user_id = auth.uid()`
- [ ] Verify RLS is enabled on `order_items` table
- [ ] Run: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;`
- [ ] Run: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_version TEXT;`
- [ ] Run: `ALTER TABLE repair_tickets ADD COLUMN IF NOT EXISTS pattern_lock TEXT;`
- [ ] Create `restore_stock` function:
  ```sql
  CREATE OR REPLACE FUNCTION restore_stock(p_product_id uuid, p_quantity integer)
  RETURNS void AS $$
  BEGIN
    UPDATE products SET stock = stock + p_quantity WHERE id = p_product_id;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
- [ ] Enable Point-in-Time Recovery (PITR) in Supabase Dashboard → Settings → Backups

### Netlify
- [ ] Set `ALLOWED_ORIGIN=https://www.drmobilephone.ie`
- [ ] Set `SITE_URL=https://www.drmobilephone.ie`
- [ ] Confirm all other env vars above are set
- [ ] Confirm custom domain `drmobilephone.ie` is configured and SSL is active

---

## Post-Launch (Within 30 days)
- [ ] Set up cron monitoring (Healthchecks.io — free) to alert if `cleanup-pending-orders` stops running
- [ ] Set up Sentry (free tier) for frontend error tracking
- [ ] Test the full order flow end-to-end with a real card in live mode
- [ ] Confirm order confirmation email arrives from `orders@drmobilephone.ie`

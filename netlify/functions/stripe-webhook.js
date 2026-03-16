const crypto = require('crypto');
const { sendConfirmation } = require('./send-order-confirmation');

const STRIPE_WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL            = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Stripe signature verification (no npm package needed) ────────────────────
function verifySignature(rawBody, header, secret) {
    if (!header || !secret) return false;

    let timestamp = null;
    const v1Sigs = [];
    for (const part of header.split(',')) {
        const eq = part.indexOf('=');
        const key = part.slice(0, eq);
        const val = part.slice(eq + 1);
        if (key === 't') timestamp = val;
        if (key === 'v1') v1Sigs.push(val);
    }

    if (!timestamp || v1Sigs.length === 0) return false;

    // Reject payloads older than 5 minutes
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`, 'utf8')
        .digest('hex');

    return v1Sigs.some(sig => {
        try {
            return crypto.timingSafeEqual(
                Buffer.from(sig,      'hex'),
                Buffer.from(expected, 'hex')
            );
        } catch {
            return false;
        }
    });
}

// ── Update order in Supabase (service role key bypasses RLS) ─────────────────
async function updateOrder(orderId, fields) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type':  'application/json',
                'apikey':         SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Prefer':         'return=minimal',
            },
            body: JSON.stringify(fields),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase PATCH failed (${res.status}): ${text}`);
    }
}

// ── Fetch order items from Supabase ──────────────────────────────────────────
async function fetchOrderItems(orderId) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_id,quantity`,
        {
            headers: {
                'apikey':        SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase order_items fetch failed (${res.status}): ${text}`);
    }
    return res.json();
}

// ── Restore stock via Supabase RPC ────────────────────────────────────────────
async function restoreStock(productId, quantity) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/restore_stock`,
        {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':         SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({ p_product_id: productId, p_quantity: quantity }),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`restore_stock RPC failed (${res.status}): ${text}`);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    // Netlify may base64-encode the body for binary safety
    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;

    const signature = event.headers['stripe-signature'];

    if (!verifySignature(rawBody, signature, STRIPE_WEBHOOK_SECRET)) {
        console.error('Stripe webhook: invalid signature');
        return { statusCode: 400, body: 'Invalid signature' };
    }

    let stripeEvent;
    try {
        stripeEvent = JSON.parse(rawBody);
    } catch (e) {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const eventType = stripeEvent.type;
    const session   = stripeEvent.data?.object;

    console.log(`Stripe webhook received: ${eventType}`);

    try {
        if (eventType === 'checkout.session.completed') {
            const orderId = session.client_reference_id;
            if (!orderId) {
                console.warn('checkout.session.completed: no client_reference_id');
                return { statusCode: 200, body: JSON.stringify({ received: true }) };
            }

            await updateOrder(orderId, {
                status:             'paid',
                stripe_session_id:  session.id,
            });

            console.log(`Order ${orderId} marked as paid via webhook`);

            // Send order confirmation email
            try {
                const emailResult = await sendConfirmation(orderId);
                console.log(`Confirmation email result for ${orderId}:`, emailResult);
            } catch (emailErr) {
                // Log but do not fail the webhook — Stripe must get a 200
                console.error(`Confirmation email failed for ${orderId}:`, emailErr.message);
            }

        } else if (eventType === 'checkout.session.expired') {
            const orderId = session.client_reference_id;
            if (orderId) {
                // Restore stock for each item then cancel the order
                const items = await fetchOrderItems(orderId);
                for (const item of items) {
                    if (item.product_id) {
                        await restoreStock(item.product_id, item.quantity);
                    }
                }
                await updateOrder(orderId, { status: 'cancelled' });
                console.log(`Order ${orderId} cancelled and stock restored (Stripe session expired)`);
            }

        } else {
            // Acknowledge all other event types without acting on them
            console.log(`Unhandled event type: ${eventType}`);
        }
    } catch (err) {
        console.error(`Webhook handler error: ${err.message}`);
        // Return 500 so Stripe retries the event
        return { statusCode: 500, body: err.message };
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

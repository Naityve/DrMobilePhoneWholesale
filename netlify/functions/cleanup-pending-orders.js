// cleanup-pending-orders.js
// Scheduled Netlify function — runs daily.
// Finds orders that have been 'pending' for more than 24 hours,
// restores stock for each item, then marks the order as 'cancelled'.
//
// This acts as a safety net for orders where the customer never reached
// Stripe (e.g. closed the tab before redirect), so no webhook will fire.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseHeaders = {
    'Content-Type':  'application/json',
    'apikey':         SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

// ── Fetch stale pending orders with their items ───────────────────────────────
async function fetchStaleOrders() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${SUPABASE_URL}/rest/v1/orders?status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}&select=id,order_items(product_id,quantity)`;
    const res = await fetch(url, { headers: supabaseHeaders });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch stale orders (${res.status}): ${text}`);
    }
    return res.json();
}

// ── Restore stock via Supabase RPC ────────────────────────────────────────────
async function restoreStock(productId, quantity) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/restore_stock`,
        {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify({ p_product_id: productId, p_quantity: quantity }),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`restore_stock RPC failed (${res.status}): ${text}`);
    }
}

// ── Cancel order ──────────────────────────────────────────────────────────────
async function cancelOrder(orderId) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
        {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ status: 'cancelled' }),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to cancel order ${orderId} (${res.status}): ${text}`);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async () => {
    console.log('cleanup-pending-orders: starting');

    let orders;
    try {
        orders = await fetchStaleOrders();
    } catch (err) {
        console.error('cleanup-pending-orders: failed to fetch orders —', err.message);
        return { statusCode: 500, body: err.message };
    }

    if (!orders.length) {
        console.log('cleanup-pending-orders: no stale orders found');
        return { statusCode: 200, body: JSON.stringify({ cancelled: 0 }) };
    }

    console.log(`cleanup-pending-orders: found ${orders.length} stale order(s)`);

    let cancelled = 0;
    for (const order of orders) {
        try {
            const items = order.order_items || [];
            for (const item of items) {
                if (item.product_id) {
                    await restoreStock(item.product_id, item.quantity);
                }
            }
            await cancelOrder(order.id);
            console.log(`cleanup-pending-orders: cancelled order ${order.id} (${items.length} item(s) restocked)`);
            cancelled++;
        } catch (err) {
            // Log but continue processing remaining orders
            console.error(`cleanup-pending-orders: failed to cancel order ${order.id} —`, err.message);
        }
    }

    console.log(`cleanup-pending-orders: done — ${cancelled}/${orders.length} orders cancelled`);
    return { statusCode: 200, body: JSON.stringify({ cancelled, total: orders.length }) };
};

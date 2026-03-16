const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ALLOWED_ORIGIN    = process.env.ALLOWED_ORIGIN || 'https://resonant-bavarois-13f2f9.netlify.app';
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fetch order + items from Supabase using the service role key (bypasses RLS)
async function fetchOrder(orderId) {
    const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,status,total,subtotal,guest_email,order_items(product_name,unit_price,quantity)`;
    const res = await fetch(url, {
        headers: {
            'apikey':         SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    if (!res.ok) throw new Error(`Supabase fetch failed (${res.status})`);
    const rows = await res.json();
    return rows[0] || null;
}

exports.handler = async (event) => {
    const requestOrigin = event.headers.origin || '';
    const corsOrigin = requestOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : '';

    const headers = {
        'Access-Control-Allow-Origin':  corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod !== 'OPTIONS' && !corsOrigin) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { order_id, customer_email, success_url, cancel_url } = JSON.parse(event.body);

        if (!order_id || !success_url || !cancel_url) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        // ── Fetch and verify order from database ──────────────────────────────
        const order = await fetchOrder(order_id);

        if (!order) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order not found' }) };
        }

        if (order.status !== 'pending') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Order is not in a payable state' }) };
        }

        const items = order.order_items || [];
        if (items.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Order has no items' }) };
        }

        // ── Build line items from DB prices (never trust client-supplied prices) ─
        const lineItems = items.map(item => ({
            name:       item.product_name,
            unit_amount: Math.round(Number(item.unit_price) * 100), // cents
            quantity:   item.quantity,
        }));

        // Add shipping if present (derived from stored totals)
        const subtotal = Number(order.subtotal) || 0;
        const total    = Number(order.total)    || 0;
        const shipping = Math.round((total - subtotal) * 100) / 100;
        if (shipping > 0) {
            lineItems.push({
                name:        'Shipping',
                unit_amount: Math.round(shipping * 100),
                quantity:    1,
            });
        }

        // ── Create Stripe Checkout Session ────────────────────────────────────
        const params = new URLSearchParams();
        params.append('mode',                  'payment');
        params.append('success_url',           success_url);
        params.append('cancel_url',            cancel_url);
        params.append('client_reference_id',   order_id);

        const email = customer_email || order.guest_email || '';
        if (email) params.append('customer_email', email);

        lineItems.forEach((item, i) => {
            params.append(`line_items[${i}][price_data][currency]`,                'eur');
            params.append(`line_items[${i}][price_data][product_data][name]`,      item.name);
            params.append(`line_items[${i}][price_data][unit_amount]`,             item.unit_amount);
            params.append(`line_items[${i}][quantity]`,                            item.quantity);
        });

        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Content-Type':  'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const session = await stripeResponse.json();

        if (session.error) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: session.error.message }) };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ url: session.url, session_id: session.id }),
        };

    } catch (error) {
        console.error('create-checkout error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};

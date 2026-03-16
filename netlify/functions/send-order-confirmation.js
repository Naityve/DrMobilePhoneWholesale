// send-order-confirmation.js
// Fetches the full order from Supabase and sends an HTML confirmation email
// via the Resend API. Called from consumer-success.html and stripe-webhook.js.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
// Optional env vars:
//   SITE_URL  (defaults to https://drmobilephone.ie)

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const ALLOWED_ORIGIN    = process.env.ALLOWED_ORIGIN || 'https://resonant-bavarois-13f2f9.netlify.app';
const SITE_URL          = process.env.SITE_URL       || 'https://drmobilephone.ie';

async function fetchOrder(orderId) {
    const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*,order_items(*)`;
    const res = await fetch(url, {
        headers: {
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
    });
    if (!res.ok) throw new Error(`Supabase fetch failed (${res.status})`);
    const rows = await res.json();
    return rows[0] || null;
}

function buildEmailHtml(order) {
    const items    = order.order_items || [];
    const ref      = order.id.slice(0, 8).toUpperCase();
    const name     = order.guest_name  || 'Customer';
    const subtotal = Number(order.subtotal || 0).toFixed(2);
    const total    = Number(order.total    || 0).toFixed(2);
    const shipping = (Number(order.total || 0) - Number(order.subtotal || 0));

    const itemRows = items.map(i => `
        <tr>
            <td style="padding:0.6rem 0;border-bottom:1px solid #F3F4F6;font-size:0.9rem;">${escHtml(i.product_name)}</td>
            <td style="padding:0.6rem 0;border-bottom:1px solid #F3F4F6;font-size:0.9rem;text-align:center;">${i.quantity}</td>
            <td style="padding:0.6rem 0;border-bottom:1px solid #F3F4F6;font-size:0.9rem;text-align:right;font-weight:600;">€${(Number(i.unit_price) * i.quantity).toFixed(2)}</td>
        </tr>`).join('');

    const shippingRow = shipping > 0
        ? `<tr><td style="padding:0.35rem 0;font-size:0.85rem;color:#6B7280;">Shipping</td><td></td><td style="padding:0.35rem 0;font-size:0.85rem;text-align:right;">€${shipping.toFixed(2)}</td></tr>`
        : `<tr><td style="padding:0.35rem 0;font-size:0.85rem;color:#6B7280;">Shipping</td><td></td><td style="padding:0.35rem 0;font-size:0.85rem;text-align:right;color:#15803D;">Free</td></tr>`;

    const addressBlock = (order.shipping_address_1) ? `
        <h2 style="font-size:1rem;font-weight:600;margin:1.5rem 0 0.5rem;color:#111827;">Delivery Address</h2>
        <div style="background:#F9FAFB;border-radius:8px;padding:1rem;font-size:0.88rem;color:#374151;line-height:1.6;">
            ${escHtml(order.guest_name || '')}<br>
            ${escHtml(order.shipping_address_1 || '')}${order.shipping_address_2 ? '<br>' + escHtml(order.shipping_address_2) : ''}<br>
            ${escHtml(order.shipping_city || '')}${order.shipping_county ? ', ' + escHtml(order.shipping_county) : ''}${order.shipping_eircode ? ' ' + escHtml(order.shipping_eircode) : ''}
        </div>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Order Confirmed — DrMobilePhone</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:2rem 1rem;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:white;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#0D0D0D;padding:1.5rem 2rem;text-align:center;">
    <span style="font-size:1.5rem;font-weight:300;color:white;letter-spacing:-0.02em;">DrMobile<span style="color:#E8611A;">Phone</span></span>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:2rem;">

    <p style="font-size:1rem;color:#374151;margin:0 0 1.25rem;line-height:1.6;">Hi ${escHtml(name)},<br><br>
    Thank you for your order — your payment has been received and we'll get your items packed and on their way as soon as possible.</p>

    <!-- Order reference -->
    <div style="background:#FFF7ED;border:1.5px solid #E8611A;border-radius:10px;padding:1rem;text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280;margin-bottom:0.3rem;">Order Reference</div>
        <div style="font-size:1.3rem;font-weight:700;color:#0D0D0D;">#${ref}</div>
    </div>

    <!-- Items -->
    <h2 style="font-size:1rem;font-weight:600;margin:0 0 0.5rem;color:#111827;">Items Ordered</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
            <th style="text-align:left;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;padding-bottom:0.5rem;border-bottom:1px solid #E5E7EB;">Item</th>
            <th style="text-align:center;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;padding-bottom:0.5rem;border-bottom:1px solid #E5E7EB;">Qty</th>
            <th style="text-align:right;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;padding-bottom:0.5rem;border-bottom:1px solid #E5E7EB;">Price</th>
        </tr>
        ${itemRows}
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:0.5rem;">
        <tr><td style="padding:0.35rem 0;font-size:0.85rem;color:#6B7280;">Subtotal</td><td></td><td style="padding:0.35rem 0;font-size:0.85rem;text-align:right;">€${subtotal}</td></tr>
        ${shippingRow}
        <tr style="border-top:2px solid #111827;">
            <td style="padding:0.6rem 0 0;font-weight:700;font-size:1rem;">Total Paid</td>
            <td></td>
            <td style="padding:0.6rem 0 0;font-weight:700;font-size:1rem;text-align:right;">€${total}</td>
        </tr>
    </table>

    ${addressBlock}

    <!-- Delivery info -->
    <div style="background:#F9FAFB;border-radius:8px;padding:1rem;margin-top:1.5rem;font-size:0.85rem;color:#374151;line-height:1.65;">
        <strong style="color:#111827;">Estimated Delivery:</strong> 3–7 working days within Ireland.<br>
        <strong style="color:#111827;">Right to Cancel:</strong> You have 14 days from delivery to cancel your order for any reason and receive a full refund. Email us at <a href="mailto:info@drmobilephone.ie" style="color:#E8611A;">info@drmobilephone.ie</a> to start a return.<br>
        <strong style="color:#111827;">View your order:</strong> <a href="${SITE_URL}/consumer-orders.html" style="color:#E8611A;">My Orders</a>
    </div>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#F9FAFB;padding:1.25rem 2rem;text-align:center;font-size:0.78rem;color:#6B7280;line-height:1.7;">
    <strong style="color:#374151;">DrMobilePhone</strong><br>
    Unit 1 College Way, Kilcock Road, Clane, Co. Kildare, Ireland<br>
    045 949 611 &nbsp;·&nbsp; 089 989 9550 &nbsp;·&nbsp; <a href="mailto:info@drmobilephone.ie" style="color:#E8611A;">info@drmobilephone.ie</a><br>
    <a href="${SITE_URL}/returns.html" style="color:#E8611A;">Returns Policy</a> &nbsp;·&nbsp;
    <a href="${SITE_URL}/terms.html" style="color:#E8611A;">Terms &amp; Conditions</a> &nbsp;·&nbsp;
    <a href="${SITE_URL}/complaints.html" style="color:#E8611A;">Complaints</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Exported send helper (also used by stripe-webhook.js) ─────────────────────
async function sendConfirmation(orderId) {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const order = await fetchOrder(orderId);
    if (!order) throw new Error('Order not found');

    const to = order.guest_email;
    if (!to || to === '[deleted]') return { skipped: true, reason: 'no email address' };

    const html = buildEmailHtml(order);
    const ref  = order.id.slice(0, 8).toUpperCase();

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type':  'application/json'
        },
        body: JSON.stringify({
            from:    'DrMobilePhone <orders@drmobilephone.ie>',
            to:      [to],
            subject: `Order Confirmed — #${ref}`,
            html
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Resend API error (${res.status})`);
    }

    return { sent: true, to, ref };
}

// ── Netlify handler (called directly from consumer-success.html) ───────────────
exports.handler = async (event) => {
    const origin = event.headers.origin || '';
    const corsHeaders = {
        'Access-Control-Allow-Origin':  origin === ALLOWED_ORIGIN ? origin : '',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }
    if (origin !== ALLOWED_ORIGIN) {
        return { statusCode: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let order_id;
    try { ({ order_id } = JSON.parse(event.body || '{}')); } catch { /* ignore */ }
    if (!order_id) {
        return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'order_id required' }) };
    }

    try {
        const result = await sendConfirmation(order_id);
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch (err) {
        console.error('send-order-confirmation error:', err.message);
        // Return 200 so the success page is not affected by email failures
        return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
    }
};

module.exports.sendConfirmation = sendConfirmation;

const STRIPE_SECRET_KEY = 'sk_test_51T4o166PMMzq9TzLzzi12URlbvtWXfkyQX7qC9ZYji3iwluCOaB8CD8xzJycyPGX01KtuIC8DqAYPF98HsLGKIFX00uvJLNVp4';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { items, order_id, customer_email, success_url, cancel_url } = JSON.parse(event.body);

        if (!items || !items.length || !order_id) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        // Build Stripe line items
        const line_items = items.map(item => ({
            price_data: {
                currency: 'eur',
                product_data: {
                    name: item.name,
                },
                unit_amount: Math.round(item.price * 100), // Stripe uses cents
            },
            quantity: item.quantity,
        }));

        // Create Checkout Session via Stripe API
        const params = new URLSearchParams();
        params.append('mode', 'payment');
        params.append('success_url', success_url);
        params.append('cancel_url', cancel_url);
        params.append('client_reference_id', order_id);
        if (customer_email) params.append('customer_email', customer_email);

        line_items.forEach((item, i) => {
            params.append(`line_items[${i}][price_data][currency]`, item.price_data.currency);
            params.append(`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name);
            params.append(`line_items[${i}][price_data][unit_amount]`, item.price_data.unit_amount);
            params.append(`line_items[${i}][quantity]`, item.quantity);
        });

        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
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
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message }),
        };
    }
};

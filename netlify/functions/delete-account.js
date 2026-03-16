// delete-account.js — server-side consumer account deletion
// Verifies the caller's JWT, then permanently deletes their Supabase Auth user.
// Order records are retained for the statutory 6-year period but the personal
// data fields (name, email, phone) on orphaned orders are anonymised first.

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ALLOWED_ORIGIN       = process.env.ALLOWED_ORIGIN || 'https://resonant-bavarois-13f2f9.netlify.app';

exports.handler = async (event) => {
    const origin = event.headers.origin || '';
    const corsHeaders = {
        'Access-Control-Allow-Origin':  origin === ALLOWED_ORIGIN ? origin : '',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    // Extract the user's JWT from the Authorization header
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
        return { statusCode: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    // Verify the token by fetching the user record from Supabase
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${token}`
        }
    });

    if (!userRes.ok) {
        return { statusCode: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    const userData = await userRes.json();
    const userId = userData.id;
    if (!userId) {
        return { statusCode: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorised' }) };
    }

    // Anonymise personal data on any orders belonging to this user before deletion.
    // Orders themselves must be retained for 6 years (Irish tax law) but the
    // identifying fields can be scrubbed.
    const anonRes = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?user_id=eq.${encodeURIComponent(userId)}`,
        {
            method: 'PATCH',
            headers: {
                'apikey':        SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type':  'application/json',
                'Prefer':        'return=minimal'
            },
            body: JSON.stringify({
                user_id:      null,
                guest_name:   '[deleted]',
                guest_email:  '[deleted]',
                guest_phone:  null
            })
        }
    );

    if (!anonRes.ok) {
        const err = await anonRes.json().catch(() => ({}));
        return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || 'Failed to anonymise order data' }) };
    }

    // Delete the Supabase Auth user (cascades to all auth data)
    const deleteRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
            method: 'DELETE',
            headers: {
                'apikey':        SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
            }
        }
    );

    if (!deleteRes.ok) {
        const err = await deleteRes.json().catch(() => ({}));
        return { statusCode: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message || 'Failed to delete account' }) };
    }

    return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
    };
};

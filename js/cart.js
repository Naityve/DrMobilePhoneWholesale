// ══════════════════════════════════════════
// DrMobilePhone — Cart Helpers
// ══════════════════════════════════════════

let _cartCount = 0;

// Get all cart items with product details
async function getCartItems() {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await db
        .from('cart_items')
        .select('*, product:products(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) { console.error('Cart fetch error:', error); return []; }
    return data || [];
}

// Get cart count
async function getCartCount() {
    const user = await getCurrentUser();
    if (!user) return 0;

    const { data, error } = await db
        .from('cart_items')
        .select('quantity')
        .eq('user_id', user.id);

    if (error) return 0;
    const count = (data || []).reduce((sum, item) => sum + item.quantity, 0);
    _cartCount = count;
    return count;
}

// Add item to cart (or increment quantity if already there)
async function addToCart(productId, quantity = 1) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    // Check if item already in cart
    const { data: existing } = await db
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .single();

    let error;

    if (existing) {
        // Update quantity
        ({ error } = await db
            .from('cart_items')
            .update({ quantity: existing.quantity + quantity })
            .eq('id', existing.id));
    } else {
        // Insert new
        ({ error } = await db
            .from('cart_items')
            .insert({
                user_id: user.id,
                product_id: productId,
                quantity: quantity
            }));
    }

    if (!error) await updateCartBadge();
    return { error };
}

// Update item quantity
async function updateCartQuantity(cartItemId, newQuantity) {
    if (newQuantity <= 0) {
        return removeFromCart(cartItemId);
    }

    const { error } = await db
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('id', cartItemId);

    if (!error) await updateCartBadge();
    return { error };
}

// Remove item from cart
async function removeFromCart(cartItemId) {
    const { error } = await db
        .from('cart_items')
        .delete()
        .eq('id', cartItemId);

    if (!error) await updateCartBadge();
    return { error };
}

// Clear entire cart
async function clearCart() {
    const user = await getCurrentUser();
    if (!user) return;

    await db
        .from('cart_items')
        .delete()
        .eq('user_id', user.id);

    await updateCartBadge();
}

// Update the cart badge in the nav
async function updateCartBadge() {
    const count = await getCartCount();
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach(badge => {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    });
}

// Calculate cart total
function calculateCartTotal(cartItems) {
    return cartItems.reduce((total, item) => {
        const price = (item.product.is_on_sale && item.product.sale_price)
            ? Number(item.product.sale_price)
            : Number(item.product.price);
        return total + (price * item.quantity);
    }, 0);
}

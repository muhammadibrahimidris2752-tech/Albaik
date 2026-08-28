import { updateCartBadge, renderCartView } from './ui.js';
import { renderMenuList } from './menu-render.js';
import { refreshProductModalIfOpen } from './product-modal.js';

/* ============ STORE ============================================
   Single owner of the state that drives re-renders. setState() is
   the only way to mutate it, and it's also the only place that
   decides what needs to redraw — individual actions (addToCart,
   setFulfilmentType, ...) don't need to remember which render
   functions to call afterwards.

   What's deliberately NOT in here: which order-modal view (menu /
   cart / payment / tracking) is showing, and whether the modal or
   contact sheet is open. Those stay exactly what they already were
   in the original markup — CSS classes toggled directly by ui.js
   (.open on the overlay, .active on the current .order-view) — since
   they're transient UI state, not data. See js/ui.js's showView()/
   openOrderModal(). Favorites (js/favorites.js) and auth
   (js/auth.js) are the same story: their own module-level state,
   not Store fields, each for the reason its own file explains.

   PHASE 3: cart now round-trips through localStorage — restored here
   at module load (BEFORE loadMenu() resolves in app.js's init(), see
   js/cart.js's pruneCartToExistingItems() for why that ordering is
   safe) and re-saved on every setState() call, not just cart-touching
   ones; that's simpler than tracking which patches touched cart and
   costs nothing measurable. render() now also refreshes the product
   modal's own qty stepper (js/product-modal.js) if it happens to be
   open, the same unconditional-and-cheap way it already refreshes the
   menu grid and cart view regardless of which view is currently active.
   ================================================================ */

const CART_STORAGE_KEY = 'albaik:cart';

function loadCartFromStorage(){
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch(e){
    return {};
  }
}
function saveCartToStorage(cart){
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch(e){ /* storage full/unavailable — cart still works for this session, just won't survive a reload */ }
}

export const Store = {
  state: {
    cart: loadCartFromStorage(),   // { itemId: qty } — seeded from localStorage, see header comment
    fulfilmentType: 'delivery',    // 'delivery' | 'pickup'
    paymentMethod: 'transfer',     // 'transfer' | 'cash'
    currentOrder: null             // the order object being tracked, once one is placed
  }
};

export function setState(patch){
  Object.assign(Store.state, patch);
  saveCartToStorage(Store.state.cart);
  render();
}

/** Single re-render dispatcher — the one place that knows what depends
    on Store.state. Menu grid + cart view (which bundles its own totals)
    both always re-render together on any state change, matching the
    original inline script's behaviour of calling renderMenu()+renderCart()
    as a pair after every cart mutation. Payment/tracking views are
    rendered explicitly at their own transition points instead (see
    js/order.js) since they don't react to arbitrary state changes the
    way the menu and cart do. */
export function render(){
  updateCartBadge();
  renderMenuList();
  renderCartView();
  refreshProductModalIfOpen();
}

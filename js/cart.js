import { Store, setState } from './store.js';
import { getMenuItemById } from './menu-data.js';

/* ============ CART ============
   Both core actions funnel through setState(), so the menu grid, cart
   view, and badge count all stay in sync automatically (see store.js's
   render() dispatcher) — no call site here needs to remember which UI
   pieces depend on the cart. Adding a new item reuses changeQty(id,1)
   rather than a separate addToCart, matching the original code. */

export function changeQty(id, delta){
  const cart = { ...Store.state.cart };
  const next = (cart[id] || 0) + delta;
  if(next <= 0) delete cart[id]; else cart[id] = next;
  setState({ cart });
}

export function removeFromCart(id){
  const cart = { ...Store.state.cart };
  delete cart[id];
  setState({ cart });
}

export function getCartLines(){
  return Object.entries(Store.state.cart)
    .map(([id, qty]) => {
      const item = getMenuItemById(id);
      if(!item) return null;
      return { ...item, qty, lineTotal: item.price * qty };
    })
    .filter(Boolean);
}

export function getCartCount(){
  return Object.values(Store.state.cart).reduce((a, b) => a + b, 0);
}

export function getCartSubtotal(){
  return getCartLines().reduce((sum, line) => sum + line.lineTotal, 0);
}

/** PHASE 3. Store.state.cart now starts life restored from localStorage
    (see js/store.js) rather than always starting empty, which opens a
    new edge case that couldn't happen before: a persisted cart can
    reference an item id that no longer exists by the time the REAL menu
    finishes loading (staff removed/renamed it since the cart was saved
    — previously impossible since a cart never survived past a single
    page load at all). getCartLines() already drops unmatched ids
    silently, so nothing crashes either way, but getCartCount()/
    getCartSubtotal() would still count a phantom line since they don't
    all go through getCartLines(). app.js's init() calls this once,
    right after loadMenu() resolves, specifically to close that gap —
    a no-op on every normal run where nothing is actually stale. */
export function pruneCartToExistingItems(){
  const cart = Store.state.cart;
  const staleIds = Object.keys(cart).filter(id => !getMenuItemById(id));
  if(!staleIds.length) return;
  const next = { ...cart };
  staleIds.forEach(id => delete next[id]);
  setState({ cart: next });
}

/** PHASE 3 "Order Again" prep (spec section 9). Adds a past order's
    items back onto whatever's currently in the cart — additive, not a
    replace, so it's safe to call even if the cart isn't actually empty
    (in its one current call site, js/order-tracking.js's "Order Again"
    button, it always IS empty: it only ever shows right after a
    successful checkout, which already cleared the cart). Silently
    skips any line whose item no longer exists in the current menu
    rather than adding a phantom entry — same defensive spirit as
    pruneCartToExistingItems() above. Real "reorder from my order
    history" (Phase 4/5, once orders are a browsable list) is just
    this same function called with a different order object; nothing
    about it is checkout-specific. */
export function reorderFromOrder(order){
  if(!order || !Array.isArray(order.items)) return;
  order.items.forEach(line => {
    if(line && line.id && getMenuItemById(line.id)) changeQty(line.id, line.qty || 1);
  });
}

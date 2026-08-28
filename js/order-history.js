import { onAuthStateChangedListener } from './auth.js';
import { isFirebaseConfigured } from './firebase.js';
import { subscribeToUserOrders } from './firestore.js';

/* ============================================================
   PHASE 4 (spec sections 7-8 — Orders, Order History). Data layer for
   "My Orders" — same subscribe-on-sign-in, cache-and-notify shape as
   js/favorites.js and js/addresses.js, backed by
   subscribeToUserOrders() in js/firestore.js (already built, unused
   until now) instead of subscribeToUserProfile().

   Unlike favorites/addresses, there is deliberately NO localStorage
   mirror here: order history is inherently server-side data — a guest
   with no account has no orders to show in the first place, since
   checkout already requires sign-in once Firebase is configured (see
   js/order.js's placeOrder) — so there's no "keep working
   offline/unconfigured" case to support the way favorites/reviews
   deliberately support a local-only guest mode for browsing/reviewing
   without an account.

   PHASE 6 (Order Management) addition: an error state. Before this,
   a subscription failure left hasLoadedOnce permanently false, so
   js/order-history-ui.js would show its loading skeleton forever with
   no way out. hasOrdersError() below lets the UI distinguish that
   real failure from "still loading" and "loaded, zero orders" —
   three genuinely different states now, matching this phase's
   explicit "Error state" + "Empty state" + "Loading skeletons"
   requirements as three separate things rather than collapsing any
   two of them together.

   Detecting the failure without touching js/firestore.js at all
   (this phase's own instruction: the existing helpers "must remain
   the single source of truth", and every subscribeToX function in
   that file shares one deliberate, consistent shape — an attach
   failure OR a live onSnapshot error both just console.error()
   internally and never reach this callback, by design, matching
   subscribeToOrder/subscribeToAllOrders/subscribeToUserProfile's
   identical shape). So this can't tell "still slow" from "actually
   failed" by inspecting subscribeToUserOrders()'s own return value —
   its promise resolves the same way (a working unsubscribe function)
   whether the listener attached successfully or came back a no-op.
   What it CAN safely do at the application layer: start a plain
   timeout the moment a subscription attempt begins, and treat "no
   snapshot arrived within it" as an error. ORDERS_TIMEOUT_MS is
   generous (real Firestore reads normally resolve in well under a
   second) specifically so a merely-slow connection is never
   misreported as failed — it exists to catch a genuinely stuck
   attempt (Firestore unreachable, listener silently never firing),
   not to add a tight budget. Cleared the instant a real snapshot
   does arrive, and reset on every new sign-in/sign-out so a stale
   timer from a previous attempt can never fire against a
   already-successful new one. */
const ORDERS_TIMEOUT_MS = 12000;
let orders = [];
let unsubscribeOrders = null;
let hasLoadedOnce = false;
let loadError = false;
let loadTimeoutId = null;
const listeners = [];

export function getOrdersCache(){
  return orders;
}
/** False while the first snapshot for the currently signed-in user is
    still in flight — js/order-history-ui.js shows a loading state
    until this flips true, distinct from "true and the list is just
    empty" (spec section 14: loading states for Orders). */
export function hasOrdersLoaded(){
  return hasLoadedOnce;
}
/** True if no snapshot arrived within ORDERS_TIMEOUT_MS of the
    current subscription attempt starting. Cleared the moment a real
    snapshot (even an empty one) does arrive — a transient failure
    followed by a real reconnect should never leave a stale error
    showing over a working list. */
export function hasOrdersError(){
  return loadError;
}
export function getOrderById(id){
  return orders.find(o => o.id === id) || null;
}

export function onOrdersChanged(cb){
  listeners.push(cb);
}
function notify(){
  listeners.forEach(cb => cb());
}

function clearLoadTimeout(){
  if(loadTimeoutId !== null){ clearTimeout(loadTimeoutId); loadTimeoutId = null; }
}

export function initOrderHistory(){
  onAuthStateChangedListener(user => {
    if(unsubscribeOrders){ unsubscribeOrders(); unsubscribeOrders = null; }
    clearLoadTimeout();
    if(!user || !isFirebaseConfigured()){
      orders = [];
      hasLoadedOnce = true; // "loaded" as in "resolved" — an empty, known state, not still pending
      loadError = false;
      notify();
      return;
    }
    hasLoadedOnce = false;
    loadError = false;
    notify(); // let the UI show its own loading state immediately, before the first snapshot arrives

    loadTimeoutId = setTimeout(() => {
      loadTimeoutId = null;
      if(hasLoadedOnce) return; // a real snapshot already won the race
      hasLoadedOnce = true;
      loadError = true;
      notify();
    }, ORDERS_TIMEOUT_MS);

    subscribeToUserOrders(user.uid, list => {
      clearLoadTimeout();
      orders = list;
      hasLoadedOnce = true;
      loadError = false;
      notify();
    }).then(unsub => { unsubscribeOrders = unsub; });
  });
}

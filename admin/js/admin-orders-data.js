import { subscribeToAllOrders, updateOrderStatus } from '../../js/firestore.js';
import { isFirebaseConfigured } from '../../js/firebase.js';
import { getAdminFirebaseApp } from './admin-session.js';

/* ============================================================
   ADMIN ORDERS DASHBOARD — data layer. Reuses js/firestore.js's
   existing subscribeToAllOrders()/updateOrderStatus() exactly as they
   already exist — this file has zero Firestore logic of its own,
   matching this phase's explicit "these must remain the single
   source of truth" instruction.

   This file has NO optimistic local-cache patching after a write —
   updateOrderStatus() below just calls straight through. Orders are
   read via a LIVE subscribeToAllOrders() listener: the moment
   updateOrderStatus() actually writes, that same listener receives the
   updated snapshot and notify()s on its own, moments later, with the
   real server-confirmed state. Adding an optimistic patch on top would
   only risk this file's local cache briefly disagreeing with what the
   listener is about to deliver anyway, for no real benefit — the live
   subscription already is the read model. PHASE 4 (Admin Dashboard):
   admin-data.js (the Menu Manager's data layer) now follows this exact
   same shape for menuItems — see that file's own header comment; this
   was the only admin data source still using a one-shot fetch, and
   isn't anymore. */

const ORDERS_TIMEOUT_MS = 12000; // same honest-timeout reasoning as js/order-history.js's identical constant — a subscribeToX() promise resolving with a working unsubscribe tells you nothing about whether the listener itself ever actually fires

let allOrders = [];
let isLoading = true;
let loadError = null;   // null | 'not-configured' | 'subscription-failed'
let unsubscribe = null;
let timeoutId = null;
const listeners = [];

export function getAllOrders(){
  return allOrders;
}
export function getOrderById(id){
  return allOrders.find(order => order.id === id);
}
export function isOrdersLoading(){
  return isLoading;
}
export function getOrdersLoadError(){
  return loadError;
}

/** Registered by admin-orders-render.js to re-render on every data
    change — initial load, every live snapshot, or a manual restart.
    Same subscribe-and-notify shape as admin-data.js's
    onMenuDataChanged. */
export function onOrdersDataChanged(cb){
  listeners.push(cb);
}
function notify(){
  listeners.forEach(cb => cb());
}

function clearOrdersTimeout(){
  if(timeoutId !== null){ clearTimeout(timeoutId); timeoutId = null; }
}

/** Starts (or restarts) the live orders subscription. Called once
    from admin-app.js's init() once staff sign-in is confirmed — same
    "only fetch once we know we're allowed to see it" reasoning
    admin-app.js's own header comment already gives for the Menu
    Manager's equivalent call, and orders reads ARE gated by
    firestore.rules (unlike public menuItems reads), so this one
    actually is a security-relevant reason to wait, not just a
    courtesy. */
export function startOrdersSubscription(){
  if(unsubscribe){ unsubscribe(); unsubscribe = null; }
  clearOrdersTimeout();

  if(!isFirebaseConfigured()){
    allOrders = [];
    isLoading = false;
    loadError = 'not-configured';
    notify();
    return;
  }

  isLoading = true;
  loadError = null;
  notify();

  timeoutId = setTimeout(() => {
    timeoutId = null;
    if(!isLoading) return; // a real snapshot already won the race
    isLoading = false;
    loadError = 'subscription-failed';
    notify();
  }, ORDERS_TIMEOUT_MS);

  getAdminFirebaseApp().then(app => subscribeToAllOrders(list => {
    clearOrdersTimeout();
    allOrders = list;
    isLoading = false;
    loadError = null;
    notify();
  }, app)).then(unsub => { unsubscribe = unsub; }).catch(() => {
    clearOrdersTimeout();
    isLoading = false;
    loadError = 'subscription-failed';
    notify();
  });
}

/** Thin wrapper so admin-orders-render.js and admin-order-detail.js
    don't each import updateOrderStatus() directly — not because this
    adds any logic of its own (it doesn't: same call, same return
    value), just one named place both callers go through, matching
    admin-data.js's setItemAvailability()/setItemDisplayOrder()
    wrappers' same role for the Menu Manager. */
export async function setOrderStatus(orderId, status){
  return updateOrderStatus(orderId, status, await getAdminFirebaseApp());
}

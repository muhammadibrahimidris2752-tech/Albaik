import { getTimelineFor, getStatusIndex, isCancelled, isTerminalStatus } from './order-status.js';
import { reorderFromOrder } from './cart.js';
import { goToCart } from './ui.js';
import { isFirebaseConfigured } from './firebase.js';
import { subscribeToOrder } from './firestore.js';

/* ============================================================
   Renders the live tracking view once an order has been placed, OR
   once a past order is reopened from My Orders (js/order-history-ui.js's
   "Track" button) — openTrackingForOrder() below is the one entry
   point for both.

   PHASE 4 (spec section 9 — Live Order Tracking): the stage-by-stage
   progression used to be simulated purely with setTimeout, driving
   the DOM directly. It's now real: renderFromOrder() derives every
   stage's pending/active/done class from the order's ACTUAL status
   (via js/order-status.js's getStatusIndex) rather than a timer
   offset, and — when Firebase is configured and the order has a real
   Firestore id — a live subscribeToOrder() listener means the view
   updates automatically on any real status change, from anywhere
   ("read real order status from Firestore... update automatically").

   PHASE 6 (Order Management) update: the stand-in scheduler this
   comment used to describe here — scheduleAutoAdvance(), which wrote
   fake staff-paced status transitions for the one order a tab just
   placed, since there was no real admin dashboard yet to do that for
   real — has been REMOVED. The admin Orders Dashboard
   (admin/js/admin-orders-render.js) now does exactly what this file's
   own prior comment already named as the intended replacement: real
   staff calling updateOrderStatus() from a real UI. Nothing in this
   file's rendering changed to make that swap — renderFromOrder() and
   the subscription below already just react to whatever status is
   actually in Firestore, regardless of who wrote it, exactly as
   previously documented here. The only things removed were the timer
   scheduler itself, the advancedOrderIds double-schedule guard it
   needed, and the justPlaced option that gated it — openTrackingForOrder()
   no longer takes a second argument at all. A newly-placed order now
   sits at RECEIVED, genuinely, until a real staff member advances it
   from the admin dashboard — matching "Orders must update immediately
   when the admin changes their status" (this phase's own brief) rather
   than racing a fake timer that would otherwise auto-complete every
   order in ~12 seconds regardless of what staff actually do.

   When Firebase isn't configured, or a particular order never got a
   real Firestore id (saveOrderToFirestore failed — see js/order.js),
   this falls back to the exact original local-only timer simulation
   (runLocalSimulation below), unchanged — same graceful-degradation
   shape as every other Firebase-touching feature in this project. A
   local-only order has no real backend for an admin to ever manage
   anyway, so simulating its progression client-side remains the right
   fallback here, same reasoning as before.

   PHASE 3 "Order Again" (spec section 9): trackingOrder is kept here,
   module-level, purely so initOrderTracking()'s click handler has
   something to hand to js/cart.js's reorderFromOrder() — unchanged by
   this phase except that it now also gets refreshed on every live
   subscription snapshot, not just set once.
   ================================================================ */

let activeUnsubscribe = null;
let localTimers = [];
let trackingOrder = null;

function clearLocalTimers(){
  localTimers.forEach(clearTimeout);
  localTimers = [];
}
function clearSubscription(){
  if(activeUnsubscribe){ activeUnsubscribe(); activeUnsubscribe = null; }
}

function renderHeader(order){
  document.getElementById('orderIdVal').textContent = '#' + (order.orderNumber || order.id || '');
  document.getElementById('orderTypeVal').textContent = order.fulfilmentType === 'delivery' ? 'Delivery' : 'Pickup';

  const payEl = document.getElementById('orderPaymentVal');
  if(order.paymentMethod === 'transfer'){
    payEl.textContent = '🏦 Paid by bank transfer · awaiting confirmation';
  } else {
    payEl.textContent = order.fulfilmentType === 'delivery' ? '💵 Pay on delivery' : '💵 Pay on pickup';
  }
}

function buildTimelineDom(order){
  const stages = getTimelineFor(order);
  const tl = document.getElementById('timeline');
  tl.innerHTML = '';
  stages.forEach(s => {
    const el = document.createElement('div');
    el.className = 'tl-stage pending';
    el.id = 'tl-' + s.key;
    el.innerHTML = `
      <div class="tl-icon">${s.icon}</div>
      <div class="tl-content">
        <div class="label">${s.label}</div>
        <div class="sub"></div>
      </div>`;
    tl.appendChild(el);
  });
  return stages;
}

function showFinished(){
  document.getElementById('enjoyCard').classList.add('show');
  document.getElementById('newOrderBtn').classList.add('show');
  document.getElementById('orderAgainBtn')?.classList.add('show');
}
function hideFinished(){
  document.getElementById('enjoyCard').classList.remove('show');
  document.getElementById('newOrderBtn').classList.remove('show');
  document.getElementById('orderAgainBtn')?.classList.remove('show');
}

/** PHASE 4. Renders the cancelled state — replaces the normal
    progressing timeline with a single explanatory stage instead of
    trying to force CANCELLED into a pending/active/done slot it was
    never one of (see js/order-status.js's own comment on why
    CANCELLED sits outside both TIMELINE arrays). No customer-facing
    "why"/refund copy is invented here since none of that data exists
    yet — just a plain, honest state. PHASE 6: a real cancel action
    now exists (js/order-history-ui.js's Cancel Order button, and the
    admin Orders Dashboard), so an order CAN legitimately land here
    from either side — this view still only ever displays whatever
    status already is, same as every other stage. */
function renderCancelled(){
  const tl = document.getElementById('timeline');
  tl.innerHTML = `
    <div class="tl-stage done">
      <div class="tl-icon">✕</div>
      <div class="tl-content">
        <div class="label">Order cancelled</div>
        <div class="sub">Contact us if you have questions about this order.</div>
      </div>
    </div>`;
  hideFinished();
}

/** Sets each stage's pending/active/done class (and the active/done
    ones' .sub text) from the order's REAL current status — the
    Phase 4 replacement for the old setTimeout-driven DOM writes. Safe
    to call repeatedly (every subscription snapshot calls this again)
    since it always derives the full state from scratch rather than
    incrementally patching classes. */
function renderFromOrder(order){
  if(isCancelled(order.status)){
    renderCancelled();
    return;
  }
  const stages = buildTimelineDom(order);
  const idx = getStatusIndex(order, order.status);
  const currentIdx = idx >= 0 ? idx : 0; // unrecognized/missing status → treat as the first stage rather than crashing

  stages.forEach((s, i) => {
    const el = document.getElementById('tl-' + s.key);
    el.classList.remove('pending', 'active', 'done');
    if(i < currentIdx){
      el.classList.add('done');
      el.querySelector('.sub').textContent = 'Done';
    } else if(i === currentIdx){
      el.classList.add('active');
      el.querySelector('.sub').textContent = s.sub;
    } else {
      el.classList.add('pending');
    }
  });

  if(currentIdx === stages.length - 1 && isTerminalStatus(order.status)){
    const last = document.getElementById('tl-' + stages[currentIdx].key);
    last.classList.remove('active');
    last.classList.add('done');
    last.querySelector('.sub').textContent = 'Done';
    showFinished();
  } else {
    hideFinished();
  }
}

/** Exact original local-only timer simulation — used when Firebase
    isn't configured, or this particular order never got a real
    Firestore id. Unchanged in behaviour or timing from every phase
    before this one. */
function runLocalSimulation(order){
  const stages = buildTimelineDom(order);
  hideFinished();

  stages.forEach((s, i) => {
    const t = setTimeout(() => {
      if(i > 0){
        const prev = document.getElementById('tl-' + stages[i - 1].key);
        prev.classList.remove('active');
        prev.classList.add('done');
        prev.querySelector('.sub').textContent = 'Done';
      }
      const cur = document.getElementById('tl-' + s.key);
      cur.classList.remove('pending');
      cur.classList.add('active');
      cur.querySelector('.sub').textContent = s.sub;

      if(i === stages.length - 1){
        setTimeout(() => {
          cur.classList.remove('active');
          cur.classList.add('done');
          cur.querySelector('.sub').textContent = 'Done';
          showFinished();
        }, 1400);
      }
    }, i * 2400);
    localTimers.push(t);
  });
}

/** The single entry point for showing the tracking view, whether for
    an order just placed (app.js's handleConfirmPayment) or a past
    order reopened from My Orders (js/order-history-ui.js's Track
    button) — both now behave identically, since there's no more
    justPlaced-gated auto-advance to distinguish them for (see this
    file's header comment). Always just displays whatever the order's
    real current status is and stays live from there. */
export function openTrackingForOrder(order){
  trackingOrder = order;
  clearLocalTimers();
  clearSubscription();
  renderHeader(order);

  if(isFirebaseConfigured() && order.id){
    renderFromOrder(order); // paint immediately from what we already have, then let the subscription take over
    subscribeToOrder(order.id, liveOrder => {
      trackingOrder = liveOrder;
      renderFromOrder(liveOrder);
    }).then(unsub => { activeUnsubscribe = unsub; });
    return;
  }

  runLocalSimulation(order);
}

export function stopTracking(){
  clearLocalTimers();
  clearSubscription();
}

/** One-time wiring for the Order Again button — call once from
    app.js's init(), same as every other initX() in this project. */
export function initOrderTracking(){
  document.getElementById('orderAgainBtn')?.addEventListener('click', () => {
    if(!trackingOrder) return;
    reorderFromOrder(trackingOrder);
    goToCart();
  });
}

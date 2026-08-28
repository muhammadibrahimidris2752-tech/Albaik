import { getOrdersCache, hasOrdersLoaded, hasOrdersError, onOrdersChanged } from './order-history.js';
import { getStatusLabel, isTerminalStatus, isCancelled, ORDER_STATUS } from './order-status.js';
import { formatNaira, escapeHtml, formatRelativeTime } from './utils.js';
import { reorderFromOrder } from './cart.js';
import { closeAuthModal } from './auth-ui.js';
import { openOrderModal, goToCart, showView } from './ui.js';
import { openTrackingForOrder } from './order-tracking.js';
import { updateOrderStatus } from './firestore.js';
import { showToast } from './toast.js';

/* ============================================================
   PHASE 4 (spec section 8 — Order History). Rendering for "My
   Orders", inside the auth modal's new authView-orders view (see
   index.html, js/auth-ui.js's AUTH_VIEWS). Split from
   js/order-history.js (data) the same way js/reviews-data.js /
   js/reviews-ui.js split — this is the heavier, richer-UI feature
   Phase 4 adds (expandable line items, three actions per row), unlike
   favorites/addresses' simpler lists which stay inline in
   js/auth-ui.js itself.

   Imports closeAuthModal from js/auth-ui.js, which (via
   js/order-history.js not being involved) has no import back to this
   file — no new circular dependency here, unlike the
   auth-ui.js ↔ favorites.js / auth-ui.js ↔ order-history-ui.js (via
   the "View Order History" button, see auth-ui.js's own comment)
   pairs, which already are and are already documented as safe.

   PHASE 6 (Order Management) additions, all inside the SAME expandable
   row rather than a new separate detail view — see
   PROJECT_CONTINUATION_SUMMARY.md's Phase 6 (Order Management) section
   for why a second, richer view wasn't built alongside this one:
     - individual (unit) prices alongside each line's total, not just
       the total
     - delivery address / pickup contact info
     - payment method + status
     - notes, shown only when an order actually has one (nothing in
       this codebase captures notes at checkout yet — see that same
       section for why this stays a graceful, honest no-op rather than
       inventing a checkout field this phase wasn't asked to add)
     - a Cancel Order button, visible only while status is RECEIVED
       (this project's closest real equivalent to the brief's
       "Pending" — see js/order-status.js's own PHASE 4 addendum for
       the full real-status-vocabulary mapping), using
       window.confirm() to match the exact confirmation pattern
       js/reviews-ui.js's own delete button already established on
       this customer-facing side, rather than introducing a styled
       modal confirm component here (that pattern exists only on the
       admin side — see admin/js/admin-confirm.js — deliberately, since
       admin's destructive actions and a customer cancelling their own
       pending order are different enough contexts to each keep their
       own site's existing convention)
     - real loading skeletons (reusing css/product-grid.css's
       .skeleton-line/shimmer) in place of the plain "Loading your
       orders…" text, and a real error state — both wired to
       js/order-history.js's new hasOrdersError()
   ================================================================ */

const expandedIds = new Set();

function buildItemsHtml(order){
  return (order.items || []).map(line => {
    const lineTotal = line.lineTotal != null ? line.lineTotal : (line.price || 0) * (line.qty || 0);
    return `<div class="account-order-row__item">
      <span>${line.qty}× ${escapeHtml(line.name)} <span class="account-order-row__item-unit">(${formatNaira(line.price || 0)} each)</span></span>
      <span class="mono">${formatNaira(lineTotal)}</span>
    </div>`;
  }).join('');
}

/** Delivery address / pickup contact, and payment method + status —
    the two "ORDER DETAILS" fields this phase's brief asks for that
    the row didn't already show anywhere (item lines and the total
    already did). Notes only renders a row when order.notes is a
    non-empty string — see this file's header comment for why nothing
    populates that field yet. */
function buildExtraDetailsHtml(order){
  const fulfilmentRow = order.fulfilmentType === 'delivery'
    ? `<div class="account-order-row__extra-row"><span>Delivery to</span><span>${escapeHtml(order.deliveryAddress || '—')}</span></div>`
    : `<div class="account-order-row__extra-row"><span>Pickup at</span><span>Gwarzo Road${order.customerPhone ? ' · ' + escapeHtml(order.customerPhone) : ''}</span></div>`;

  const paymentLabel = order.paymentMethod === 'transfer'
    ? `Bank transfer${order.paymentStatus === 'awaiting_confirmation' ? ' · awaiting confirmation' : ''}`
    : `Cash ${order.fulfilmentType === 'delivery' ? 'on delivery' : 'on pickup'}`;
  const paymentRow = `<div class="account-order-row__extra-row"><span>Payment</span><span>${escapeHtml(paymentLabel)}</span></div>`;

  const notesRow = (order.notes && String(order.notes).trim())
    ? `<div class="account-order-row__extra-row"><span>Notes</span><span>${escapeHtml(order.notes)}</span></div>`
    : '';

  return `<div class="account-order-row__extra">${fulfilmentRow}${paymentRow}${notesRow}</div>`;
}

async function handleCancelOrder(order, btn){
  const confirmed = window.confirm(`Cancel order #${order.orderNumber || order.id}? This can't be undone.`);
  if(!confirmed) return;
  btn.disabled = true;
  const ok = await updateOrderStatus(order.id, ORDER_STATUS.CANCELLED);
  if(ok){
    showToast('Order cancelled.');
    // No manual re-render needed — the live subscribeToUserOrders()
    // listener (js/order-history.js) will deliver the updated order
    // and this view re-renders from that, same as any other status
    // change reaching this list from anywhere (including the admin
    // dashboard).
  } else {
    btn.disabled = false;
    showToast("Couldn't cancel this order — check your connection and try again.", { type: 'error' });
  }
}

function buildRow(order){
  const row = document.createElement('div');
  row.className = 'account-order-row';
  const statusClass = isCancelled(order.status) ? 'is-cancelled' : (isTerminalStatus(order.status) ? 'is-done' : 'is-active');
  const itemCount = (order.items || []).reduce((sum, l) => sum + (l.qty || 0), 0);
  const isExpanded = expandedIds.has(order.id);
  const canCancel = order.status === ORDER_STATUS.RECEIVED;

  row.innerHTML = `
    <div class="account-order-row__top">
      <div>
        <div class="account-order-row__number">#${escapeHtml(order.orderNumber || order.id || '')}</div>
        <div class="account-order-row__date mono">${escapeHtml(formatRelativeTime(order.createdAt || order.createdLocalAt))}</div>
      </div>
      <div class="account-order-row__status ${statusClass}">${escapeHtml(getStatusLabel(order))}</div>
    </div>
    <div class="account-order-row__meta">${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatNaira(order.total || 0)}</div>
    <div class="account-order-row__items" ${isExpanded ? '' : 'hidden'}>
      ${buildItemsHtml(order)}
      ${buildExtraDetailsHtml(order)}
    </div>
    <div class="account-order-row__actions">
      <button type="button" class="account-order-row__btn" data-action="view">${isExpanded ? 'Hide' : 'View'}</button>
      <button type="button" class="account-order-row__btn" data-action="again">Order Again</button>
      <button type="button" class="account-order-row__btn" data-action="track">Track</button>
      ${canCancel ? '<button type="button" class="account-order-row__btn account-order-row__btn--cancel" data-action="cancel">Cancel Order</button>' : ''}
    </div>`;

  const itemsEl = row.querySelector('.account-order-row__items');
  const viewBtn = row.querySelector('[data-action="view"]');
  viewBtn.addEventListener('click', () => {
    const nowExpanded = itemsEl.hidden;
    itemsEl.hidden = !nowExpanded;
    viewBtn.textContent = nowExpanded ? 'Hide' : 'View';
    if(nowExpanded) expandedIds.add(order.id); else expandedIds.delete(order.id);
  });
  row.querySelector('[data-action="again"]').addEventListener('click', () => {
    reorderFromOrder(order);
    closeAuthModal();
    openOrderModal();
    goToCart();
  });
  row.querySelector('[data-action="track"]').addEventListener('click', () => {
    closeAuthModal();
    openOrderModal();
    openTrackingForOrder(order);
    showView('tracking');
  });
  const cancelBtn = row.querySelector('[data-action="cancel"]');
  if(cancelBtn) cancelBtn.addEventListener('click', () => handleCancelOrder(order, cancelBtn));

  return row;
}

/** Same wrapper shape as a real row (top/meta placeholders) so the
    list doesn't visibly reflow once real data replaces it — same
    convention admin/js/admin-render.js's buildSkeletonRow() already
    uses on the admin side, reusing the identical
    css/product-grid.css shimmer rather than inventing a second
    loading treatment for this project. */
function buildSkeletonRow(){
  const row = document.createElement('div');
  row.className = 'account-order-row account-order-row--skeleton';
  row.setAttribute('aria-hidden', 'true');
  row.innerHTML = `
    <div class="account-order-row__top">
      <div class="account-order-row__skeleton-lines">
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line skeleton-line--desc"></div>
      </div>
      <div class="skeleton-line skeleton-line--pill"></div>
    </div>`;
  return row;
}

export function renderOrderHistoryView(){
  const listEl = document.getElementById('ordersList');
  const emptyEl = document.getElementById('ordersListEmpty');
  const errorEl = document.getElementById('ordersListError');
  if(!listEl) return;

  if(!hasOrdersLoaded()){
    listEl.innerHTML = '';
    for(let i = 0; i < 3; i++) listEl.appendChild(buildSkeletonRow());
    if(emptyEl) emptyEl.hidden = true;
    if(errorEl) errorEl.hidden = true;
    return;
  }

  if(hasOrdersError()){
    listEl.innerHTML = '';
    if(emptyEl) emptyEl.hidden = true;
    if(errorEl) errorEl.hidden = false;
    return;
  }
  if(errorEl) errorEl.hidden = true;

  const orders = getOrdersCache();
  if(!orders.length){
    listEl.innerHTML = '';
    if(emptyEl) emptyEl.hidden = false;
    return;
  }
  if(emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = '';
  orders.forEach(order => listEl.appendChild(buildRow(order)));
}

/** One-time wiring — call once from app.js's init(). Keeps the list
    live (new order arrives, status changes) any time it's showing,
    same "subscribe once, re-render on every change" shape as every
    other onXChanged() consumer in this project. */
export function initOrderHistoryUI(){
  onOrdersChanged(renderOrderHistoryView);
}

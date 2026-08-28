import { getTimelineFor, getStatusIndex, isCancelled, ORDER_STATUS } from '../../js/order-status.js';
import { setOrderStatus, onOrdersDataChanged, getOrderById } from './admin-orders-data.js';
import { confirmAction } from './admin-confirm.js';
import { formatNaira, escapeHtml, formatRelativeTime } from '../../js/utils.js';
import { showToast } from '../../js/toast.js';

/* ============================================================
   ADMIN ORDERS DASHBOARD — the order detail modal. Reuses
   .order-overlay/.order-modal/.order-modal__header/.icon-btn chrome
   (same convention as the Menu Manager's item-form modal — see
   admin/index.html's header comment) and, for the status timeline
   specifically, css/payment-tracking.css's .timeline/.tl-stage/
   .tl-icon/.tl-content classes — the exact same visual timeline a
   customer sees in their own tracking view, reused rather than
   invented a second time, because staff should see the same stages
   in the same order a customer does.

   renderTimelineInto() below is a deliberate, separate, smaller
   re-implementation of js/order-tracking.js's buildTimelineDom()/
   renderFromOrder() rather than an import of that file — this modal
   only ever needs to paint a SNAPSHOT of an order's current state
   each time it opens (or the live orders subscription delivers a
   change while it's open), never a subscription or local timers of
   its own (the admin Orders Dashboard's own subscribeToAllOrders()
   listener in admin-orders-data.js already is the live source this
   modal re-reads from — see currentOrderId below). Importing the
   customer page's order-tracking.js here would drag in its own
   subscription/timer/"Order Again" machinery for none of which this
   modal has a use. What IS reused: js/order-status.js's pure logic
   (getTimelineFor/getStatusIndex/isCancelled) —
   identical stage data, identical which-stage-is-current math — and
   every CSS class name, so the two renderers produce visually
   identical timelines from the same order, just from two smaller,
   independent pieces of DOM-building code instead of one shared
   one. */

let currentOrderId = null;

function buildCustomerHtml(order){
  const rows = [
    ['Name', order.customerName || 'Guest'],
    ['Phone', order.customerPhone || '—'],
    ['Email', order.customerEmail || '—']
  ];
  if(order.fulfilmentType === 'delivery'){
    rows.push(['Delivery address', order.deliveryAddress || '—']);
  } else {
    rows.push(['Pickup location', 'Gwarzo Road']);
  }
  return rows.map(([label, value]) =>
    `<div class="admin-detail-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
  ).join('');
}

function buildItemsHtml(order){
  const lines = (order.items || []).map(line => {
    const lineTotal = line.lineTotal != null ? line.lineTotal : (line.price || 0) * (line.qty || 0);
    return `<div class="admin-detail-row">
      <span>${line.qty}× ${escapeHtml(line.name)} <span class="admin-detail-row__unit">(${formatNaira(line.price || 0)} each)</span></span>
      <span class="mono">${formatNaira(lineTotal)}</span>
    </div>`;
  }).join('');
  const totals = `
    <div class="admin-detail-row admin-detail-row--total"><span>Subtotal</span><span class="mono">${formatNaira(order.subtotal || 0)}</span></div>
    ${order.deliveryFee ? `<div class="admin-detail-row admin-detail-row--total"><span>Delivery fee</span><span class="mono">${formatNaira(order.deliveryFee)}</span></div>` : ''}
    <div class="admin-detail-row admin-detail-row--grand"><span>Total</span><span class="mono">${formatNaira(order.total || 0)}</span></div>`;
  return lines + totals;
}

function buildPaymentHtml(order){
  const methodLabel = order.paymentMethod === 'transfer' ? 'Bank transfer' : 'Cash';
  const statusLabel = order.paymentStatus === 'awaiting_confirmation' ? 'Awaiting confirmation'
    : order.paymentStatus === 'paid' ? 'Paid'
    : 'Unpaid (pay in person)';
  return `
    <div class="admin-detail-row"><span>Method</span><span>${escapeHtml(methodLabel)}</span></div>
    <div class="admin-detail-row"><span>Status</span><span>${escapeHtml(statusLabel)}</span></div>`;
}

/** Same stage data and current-stage math as js/order-tracking.js's
    renderFromOrder() — see this file's header comment for why this is
    a separate small function rather than an import of that one. */
function renderTimelineInto(container, order){
  if(isCancelled(order.status)){
    container.innerHTML = `
      <div class="tl-stage done">
        <div class="tl-icon">✕</div>
        <div class="tl-content">
          <div class="label">Order cancelled</div>
        </div>
      </div>`;
    return;
  }

  const stages = getTimelineFor(order);
  const currentIdx = Math.max(0, getStatusIndex(order, order.status));

  container.innerHTML = stages.map((s, i) => {
    const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'active' : 'pending');
    const sub = i < currentIdx ? 'Done' : (i === currentIdx ? s.sub : '');
    return `<div class="tl-stage ${cls}">
      <div class="tl-icon">${s.icon}</div>
      <div class="tl-content"><div class="label">${escapeHtml(s.label)}</div><div class="sub">${escapeHtml(sub)}</div></div>
    </div>`;
  }).join('');
}

function buildStatusSelectHtml(order){
  const stages = getTimelineFor(order);
  const options = stages.map(s =>
    `<option value="${s.key}"${order.status === s.key ? ' selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');
  const cancelSelected = order.status === ORDER_STATUS.CANCELLED ? ' selected' : '';
  return `<select class="admin-order-status-select" id="orderDetailStatusSelect">
    ${options}
    <option value="${ORDER_STATUS.CANCELLED}"${cancelSelected}>Cancel Order</option>
  </select>`;
}

function populateModal(order){
  document.getElementById('orderDetailTitle').textContent = 'Order #' + (order.orderNumber || order.id || '');
  document.getElementById('orderDetailSubtitle').textContent =
    escapeHtml(formatRelativeTime(order.createdAt || order.createdLocalAt)) + ' · ' + (order.fulfilmentType === 'delivery' ? 'Delivery' : 'Pickup');

  document.getElementById('orderDetailCustomer').innerHTML = buildCustomerHtml(order);
  document.getElementById('orderDetailItems').innerHTML = buildItemsHtml(order);
  document.getElementById('orderDetailPayment').innerHTML = buildPaymentHtml(order);

  const notesSection = document.getElementById('orderDetailNotesSection');
  if(order.notes && String(order.notes).trim()){
    notesSection.hidden = false;
    document.getElementById('orderDetailNotes').textContent = order.notes;
  } else {
    notesSection.hidden = true;
  }

  renderTimelineInto(document.getElementById('orderDetailTimeline'), order);

  document.getElementById('orderDetailStatusControl').innerHTML = buildStatusSelectHtml(order);
  document.getElementById('orderDetailStatusSelect').addEventListener('change', e => {
    handleStatusChange(order, e.target);
  });
}

async function handleStatusChange(order, select){
  const nextStatus = select.value;
  if(nextStatus === ORDER_STATUS.CANCELLED && order.status !== ORDER_STATUS.CANCELLED){
    const confirmed = await confirmAction({
      title: 'Cancel this order?',
      message: `Order #${order.orderNumber || order.id} will be marked cancelled. The customer will see this immediately.`,
      confirmLabel: 'Cancel Order',
      danger: true
    });
    if(!confirmed){ select.value = order.status; return; }
  }

  select.disabled = true;
  const ok = await setOrderStatus(order.id, nextStatus);
  if(!ok){
    select.disabled = false;
    select.value = order.status;
    showToast("Couldn't update order status — check your connection and try again.", { type: 'error' });
  }
  // On success, onOrdersDataChanged's listener below re-populates this
  // same modal (still open, same order) from the live subscription's
  // next snapshot — no manual patch needed here either.
}

function openModal(){
  document.getElementById('orderDetailOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(){
  document.getElementById('orderDetailOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentOrderId = null;
}

export function openOrderDetail(order){
  currentOrderId = order.id;
  populateModal(order);
  openModal();
}

/** One-time wiring, called once from admin-app.js's init(). Keeps an
    OPEN detail modal live: if the order it's showing changes (staff
    updated it from the row select, or a different admin tab/device
    changed it), the next snapshot from admin-orders-data.js's
    subscription re-populates this same modal automatically — the
    same "live, from anywhere" behavior the customer-facing tracking
    view already has, extended to this view too. */
export function initAdminOrderDetail(){
  document.getElementById('orderDetailCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('orderDetailOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'orderDetailOverlay') closeModal();
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.getElementById('orderDetailOverlay')?.classList.contains('open')) closeModal();
  });

  onOrdersDataChanged(() => {
    if(!currentOrderId) return;
    const fresh = getOrderById(currentOrderId);
    if(fresh) populateModal(fresh);
  });
}

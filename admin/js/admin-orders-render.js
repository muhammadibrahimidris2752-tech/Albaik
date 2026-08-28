import {
  getAllOrders, isOrdersLoading, getOrdersLoadError, onOrdersDataChanged,
  startOrdersSubscription, setOrderStatus, getOrderById
} from './admin-orders-data.js';
import {
  getOrdersSearchQuery, setOrdersSearchQuery, getOrdersStatusFilter, setOrdersStatusFilter,
  getOrdersSortKey, setOrdersSortKey, getFilteredSortedOrders, STATUS_FILTER_OPTIONS, SORT_OPTIONS
} from './admin-orders-filter.js';
import { getTimelineFor, getStatusLabel, ORDER_STATUS } from '../../js/order-status.js';
import { openOrderDetail } from './admin-order-detail.js';
import { confirmAction } from './admin-confirm.js';
import { formatNaira, escapeHtml, formatRelativeTime } from '../../js/utils.js';
import { showToast } from '../../js/toast.js';

/* ============================================================
   ADMIN ORDERS DASHBOARD — toolbar + order list. Same overall shape
   as admin-render.js (the Menu Manager's equivalent): one render
   entry point rebuilding the whole list via innerHTML on every data
   or filter change, event delegation for row actions instead of
   per-row listeners, a search input kept outside the reactive render
   so it's never torn down mid-keystroke. See that file's own header
   comment for the fuller reasoning — not repeated here since it's
   identical.

   The one new interaction Menu Manager rows didn't have: a per-row
   status <select>, populated from THAT order's own real timeline
   (js/order-status.js's getTimelineFor — delivery and pickup orders
   have different stage keys) plus a Cancel Order option appended
   after it. Picking Cancel Order asks for confirmation via
   admin-confirm.js (the same reusable component the Menu Manager's
   delete button already uses — see that file's own header comment:
   "written generic for whatever the rest of Phase 6 needs one for
   next", this is that next use) before writing; picking any real
   timeline stage writes immediately, matching how routine forward
   progress needs no extra ceremony but a terminal, harder-to-walk-
   back action does. */

function buildStatusSelectHtml(order){
  const stages = getTimelineFor(order);
  const options = stages.map(s =>
    `<option value="${s.key}"${order.status === s.key ? ' selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');
  const cancelSelected = order.status === ORDER_STATUS.CANCELLED ? ' selected' : '';
  return `<select class="admin-order-status-select" aria-label="Status for order ${escapeHtml(order.orderNumber || order.id)}">
    ${options}
    <option value="${ORDER_STATUS.CANCELLED}"${cancelSelected}>Cancel Order</option>
  </select>`;
}

function buildOrderRow(order){
  const row = document.createElement('div');
  row.className = 'admin-order-row' + (order.status === ORDER_STATUS.CANCELLED ? ' is-cancelled' : '');
  row.dataset.id = order.id;

  const itemCount = (order.items || []).reduce((sum, l) => sum + (l.qty || 0), 0);
  const fulfilmentLabel = order.fulfilmentType === 'delivery' ? 'Delivery' : 'Pickup';
  const paymentLabel = order.paymentMethod === 'transfer' ? 'Bank transfer' : 'Cash';
  const customerLabel = order.customerName || 'Guest';

  row.innerHTML = `
    <div class="admin-order-row__main">
      <div class="admin-order-row__number">#${escapeHtml(order.orderNumber || order.id || '')}</div>
      <div class="admin-order-row__customer">${escapeHtml(customerLabel)}${order.customerPhone ? ' · ' + escapeHtml(order.customerPhone) : ''}</div>
      <div class="admin-order-row__date mono">${escapeHtml(formatRelativeTime(order.createdAt || order.createdLocalAt))}</div>
    </div>
    <div class="admin-order-row__meta">
      ${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatNaira(order.total || 0)} · ${fulfilmentLabel} · ${paymentLabel}
    </div>
    <div class="admin-order-row__controls">
      ${buildStatusSelectHtml(order)}
      <button type="button" class="admin-row-btn" data-action="details">Details</button>
    </div>`;

  return row;
}

function buildSkeletonRow(){
  const row = document.createElement('div');
  row.className = 'admin-order-row admin-order-row--skeleton';
  row.setAttribute('aria-hidden', 'true');
  row.innerHTML = `
    <div class="admin-order-row__main">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--desc"></div>
    </div>`;
  return row;
}

function buildNoticeBlock({ title, body, actions = [] }){
  const actionsHtml = actions.length
    ? `<div class="admin-notice__actions">${actions.map(a => `<button type="button" class="btn btn-primary" data-action="${a.action}">${escapeHtml(a.label)}</button>`).join('')}</div>`
    : '';
  return `<div class="admin-notice"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>${actionsHtml}</div>`;
}

function emptyMessage(totalCount){
  if(!totalCount) return 'No orders yet — they\'ll show up here the moment a customer checks out.';
  const q = getOrdersSearchQuery();
  const status = getOrdersStatusFilter();
  if(q && status !== 'all') return `No orders match "${escapeHtml(q)}" in this status.`;
  if(q) return `No orders match "${escapeHtml(q)}".`;
  return 'No orders match the current filter.';
}

function renderSummary(totalCount, shownCount){
  const el = document.getElementById('adminOrdersResultsSummary');
  if(!el) return;
  if(!totalCount){ el.textContent = ''; return; }
  el.textContent = shownCount === totalCount
    ? `${totalCount} order${totalCount === 1 ? '' : 's'} total`
    : `Showing ${shownCount} of ${totalCount} order${totalCount === 1 ? '' : 's'}`;
}

export function renderOrdersManager(){
  const list = document.getElementById('adminOrdersList');
  const notice = document.getElementById('adminOrdersLoadNotice');
  if(!list) return;

  if(isOrdersLoading()){
    if(notice) notice.hidden = true;
    list.innerHTML = '';
    for(let i = 0; i < 5; i++) list.appendChild(buildSkeletonRow());
    renderSummary(0, 0);
    return;
  }

  const error = getOrdersLoadError();
  const allOrders = getAllOrders();

  if(error === 'not-configured'){
    if(notice) notice.hidden = true;
    list.innerHTML = buildNoticeBlock({
      title: "Firebase isn't configured yet",
      body: "The admin dashboard needs a real Firebase project to manage live orders. See README.md's Firebase setup section, then reload this page."
    });
    renderSummary(0, 0);
    return;
  }

  if(error && allOrders.length === 0){
    if(notice) notice.hidden = true;
    list.innerHTML = buildNoticeBlock({
      title: "Couldn't load orders",
      body: "This can happen if there are genuinely no orders yet, or if there's a connection problem reaching Firestore.",
      actions: [{ action: 'retry', label: 'Retry' }]
    });
    renderSummary(0, 0);
    return;
  }

  if(notice){
    notice.hidden = !error;
    if(error) notice.textContent = "Couldn't refresh from Firestore — showing the last loaded orders.";
  }

  const shown = getFilteredSortedOrders(allOrders);
  if(!shown.length){
    list.innerHTML = `<div class="admin-empty-state">${escapeHtml(emptyMessage(allOrders.length))}</div>`;
    renderSummary(allOrders.length, 0);
    return;
  }

  list.innerHTML = '';
  shown.forEach(order => list.appendChild(buildOrderRow(order)));
  renderSummary(allOrders.length, shown.length);
}

async function applyStatusChange(order, select, nextStatus){
  if(nextStatus === ORDER_STATUS.CANCELLED && order.status !== ORDER_STATUS.CANCELLED){
    const confirmed = await confirmAction({
      title: 'Cancel this order?',
      message: `Order #${order.orderNumber || order.id} will be marked cancelled. This can be changed back manually if it was a mistake, but the customer will immediately see it as cancelled.`,
      confirmLabel: 'Cancel Order',
      danger: true
    });
    if(!confirmed){
      select.value = order.status; // revert the select back to its real current value
      return;
    }
  }

  select.disabled = true;
  const ok = await setOrderStatus(order.id, nextStatus);
  if(!ok){
    select.disabled = false;
    select.value = order.status;
    showToast("Couldn't update order status — check your connection and try again.", { type: 'error' });
  }
  // On success, the live subscription (admin-orders-data.js) delivers
  // the updated order and re-renders this list on its own — no manual
  // patch needed here.
}

function handleListChange(e){
  if(!e.target.matches('.admin-order-status-select')) return;
  const row = e.target.closest('.admin-order-row');
  if(!row) return;
  const order = getOrderById(row.dataset.id);
  if(!order) return;
  applyStatusChange(order, e.target, e.target.value);
}

function handleListClick(e){
  const actionEl = e.target.closest('[data-action]');
  if(!actionEl) return;
  const action = actionEl.dataset.action;

  if(action === 'retry'){ startOrdersSubscription(); return; }

  const row = actionEl.closest('.admin-order-row');
  if(!row) return;
  const order = getOrderById(row.dataset.id);
  if(!order) return;

  if(action === 'details') openOrderDetail(order);
}

/** One-time wiring, called once from admin-app.js's init(). */
export function initAdminOrders(){
  document.getElementById('adminOrdersSearchInput')?.addEventListener('input', e => {
    setOrdersSearchQuery(e.target.value);
    renderOrdersManager();
  });

  const statusSelect = document.getElementById('adminOrdersStatusFilter');
  if(statusSelect){
    statusSelect.innerHTML = STATUS_FILTER_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    statusSelect.value = getOrdersStatusFilter();
    statusSelect.addEventListener('change', () => { setOrdersStatusFilter(statusSelect.value); renderOrdersManager(); });
  }

  const sortSelect = document.getElementById('adminOrdersSortSelect');
  if(sortSelect){
    sortSelect.innerHTML = SORT_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    sortSelect.value = getOrdersSortKey();
    sortSelect.addEventListener('change', () => { setOrdersSortKey(sortSelect.value); renderOrdersManager(); });
  }

  document.getElementById('adminOrdersRefreshBtn')?.addEventListener('click', () => startOrdersSubscription());

  document.getElementById('adminOrdersList')?.addEventListener('click', handleListClick);
  document.getElementById('adminOrdersList')?.addEventListener('change', handleListChange);

  onOrdersDataChanged(renderOrdersManager);
}

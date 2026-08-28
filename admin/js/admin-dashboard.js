import { getAllItems, isMenuDataLoading, getLoadError, onMenuDataChanged, getLowStockItems } from './admin-data.js';
import { getAllOrders, isOrdersLoading, getOrdersLoadError, onOrdersDataChanged } from './admin-orders-data.js';
import { ORDER_STATUS, isTerminalStatus } from '../../js/order-status.js';
import { formatNaira, escapeHtml, formatRelativeTime } from '../../js/utils.js';

/*
 * Admin overview. This deliberately owns no Firebase reads: the Menu and
 * Orders sections already own the canonical admin caches and subscriptions
 * (both live as of Phase 4 — see admin-data.js/admin-orders-data.js).
 * Re-rendering small derived cards from those caches keeps every number in
 * sync without duplicate listeners or a second source of truth — this is
 * the brief's own "derive everything from one listener/cache" instruction,
 * applied to every stat and panel on this page, including the PHASE 4
 * (Admin Dashboard) Low Stock addition below, which reads getLowStockItems()
 * from the exact same menu items cache the Total/Available stats already
 * use rather than opening anything new.
 */

function setStat(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function orderTime(order){
  const value = order.createdAt || order.createdLocalAt;
  return typeof value === 'number' ? value : value?.toMillis?.() || 0;
}

function renderRecentOrders(orders, loading, error){
  const el = document.getElementById('adminDashboardRecentOrders');
  if(!el) return;
  if(loading){
    el.innerHTML = '<div class="admin-dashboard-empty">Loading live orders…</div>';
    return;
  }
  if(error && !orders.length){
    el.innerHTML = '<div class="admin-dashboard-empty">Orders could not be loaded. Open the Orders tab to retry.</div>';
    return;
  }
  const recent = [...orders].sort((a, b) => orderTime(b) - orderTime(a)).slice(0, 5);
  if(!recent.length){
    el.innerHTML = '<div class="admin-dashboard-empty">No orders yet. New customer orders will appear here automatically.</div>';
    return;
  }
  el.innerHTML = recent.map(order => {
    const name = order.customerName || 'Guest';
    const number = order.orderNumber || order.id || '—';
    const status = order.status === ORDER_STATUS.CANCELLED ? 'Cancelled' : isTerminalStatus(order.status) ? 'Completed' : 'In progress';
    return `<div class="admin-recent-order">
      <div><strong>${escapeHtml(name)}</strong><span>#${escapeHtml(number)} · ${escapeHtml(formatRelativeTime(order.createdAt || order.createdLocalAt) || 'Just now')}</span></div>
      <div><em class="is-${status === 'Completed' ? 'complete' : status === 'Cancelled' ? 'cancelled' : 'open'}">${status}</em><strong>${formatNaira(order.total || 0)}</strong></div>
    </div>`;
  }).join('');
}

/** PHASE 4 (Admin Dashboard). Same "small panel below the stat cards"
    shape as renderRecentOrders() above, so the two read as one
    consistent dashboard rather than a bolt-on — including the same
    "a transient error never blanks a panel that already had real data"
    behaviour: getLowStockItems() reads whatever admin-data.js's cache
    last held, which survives a dropped live connection, so the hard
    error state below only shows when there's truly nothing cached yet
    (itemCount === 0), exactly mirroring renderRecentOrders' own
    `error && !orders.length` check just above. getLowStockItems()
    already does the filtering/sorting (see admin-data.js) — this
    function only ever formats what it's given. */
function renderLowStock(itemCount, loading, error){
  const el = document.getElementById('adminDashboardLowStock');
  if(!el) return;
  if(loading){
    el.innerHTML = '<div class="admin-dashboard-empty">Loading menu items…</div>';
    return;
  }
  if(error && !itemCount){
    el.innerHTML = '<div class="admin-dashboard-empty">Menu items could not be loaded. Open the Menu tab to retry.</div>';
    return;
  }
  const lowStock = getLowStockItems();
  if(!lowStock.length){
    el.innerHTML = '<div class="admin-dashboard-empty">Nothing running low. Stock tracking is opt-in — set a Stock Quantity when editing an item to start watching it here.</div>';
    return;
  }
  el.innerHTML = lowStock.map(item => `<div class="admin-recent-order">
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category || '—')}</span></div>
      <div><em class="is-${item.stockQty === 0 ? 'cancelled' : 'open'}">${item.stockQty === 0 ? 'Out of stock' : `${item.stockQty} left`}</em></div>
    </div>`).join('');
}

function renderDataNote(){
  const note = document.getElementById('adminDashboardDataNote');
  if(!note) return;
  const problems = [];
  if(getLoadError()) problems.push('menu items');
  if(getOrdersLoadError()) problems.push('orders');
  note.hidden = !problems.length;
  if(problems.length) note.textContent = `Live updates for ${problems.join(' and ')} are currently interrupted — the numbers below may be out of date. Reconnecting…`;
}

export function renderAdminDashboard(){
  const items = getAllItems();
  const orders = getAllOrders();
  const menuLoading = isMenuDataLoading();
  const ordersLoading = isOrdersLoading();

  setStat('adminStatTotalItems', menuLoading ? '—' : items.length);
  setStat('adminStatAvailableItems', menuLoading ? '—' : items.filter(item => item.available !== false).length);
  setStat('adminStatTotalOrders', ordersLoading ? '—' : orders.length);

  const cancelled = orders.filter(order => order.status === ORDER_STATUS.CANCELLED);
  const completed = orders.filter(order => isTerminalStatus(order.status) && order.status !== ORDER_STATUS.CANCELLED);
  setStat('adminStatPendingOrders', ordersLoading ? '—' : orders.length - cancelled.length - completed.length);
  setStat('adminStatCompletedOrders', ordersLoading ? '—' : completed.length);
  setStat('adminStatRevenue', ordersLoading ? '—' : formatNaira(orders.reduce((sum, order) => order.status === ORDER_STATUS.CANCELLED ? sum : sum + (Number(order.total) || 0), 0)));
  setStat('adminStatLowStock', menuLoading ? '—' : getLowStockItems().length);

  renderRecentOrders(orders, ordersLoading, getOrdersLoadError());
  renderLowStock(items.length, menuLoading, getLoadError());
  renderDataNote();
}

export function initAdminDashboard(onOpenOrders, onOpenMenu){
  onMenuDataChanged(renderAdminDashboard);
  onOrdersDataChanged(renderAdminDashboard);
  document.getElementById('adminDashboardViewOrders')?.addEventListener('click', onOpenOrders);
  document.getElementById('adminDashboardViewMenu')?.addEventListener('click', onOpenMenu);
  renderAdminDashboard();
}

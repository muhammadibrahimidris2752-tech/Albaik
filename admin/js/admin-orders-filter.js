/* ============================================================
   ADMIN ORDERS DASHBOARD — search + status filter + sort. State and
   pure logic only, no DOM, same "no DOM, unit-testable" convention
   admin-filter.js/js/menu-filter.js already established.

   The status filter groups the REAL order-status model
   (js/order-status.js's ORDER_STATUS — 8 values, fulfilment-type-
   dependent: received/kitchen/packaging/courier|ready/delivered|
   picked_up/cancelled) into the 5 buckets this phase's own brief asks
   to filter by (Pending/Preparing/Ready/Completed/Cancelled) — a
   DIFFERENT, simpler vocabulary than what this project actually ships,
   the same kind of mismatch js/order-status.js's own header comment
   already resolved once before for a similarly-worded PHASE 4 brief
   (see that file's "PHASE 4 addendum"). Same resolution applied again
   here: keep the real model as the single source of truth (nothing
   here invents a new status or changes what's written to Firestore —
   updateOrderStatus() from js/firestore.js is always called with one
   of ORDER_STATUS's real values), and treat the brief's simpler
   5-word list as FILTER LABELS that group real statuses, not as a
   replacement model:
     Pending    → received
     Preparing  → kitchen OR packaging
     Ready      → courier (delivery orders) OR ready (pickup orders'
                  READY_FOR_PICKUP) — genuinely two different real
                  stages that only share a filter bucket because the
                  brief's 5-word list has no separate "out for
                  delivery" bucket to put COURIER in instead
     Completed  → delivered OR picked_up
     Cancelled  → cancelled
   ================================================================ */

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
];

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' }
];

let searchQuery = '';
let statusFilter = 'all';
let sortKey = 'newest';

export function getOrdersSearchQuery(){ return searchQuery; }
export function setOrdersSearchQuery(q){ searchQuery = (q || '').trim(); }

export function getOrdersStatusFilter(){ return statusFilter; }
export function setOrdersStatusFilter(v){
  statusFilter = STATUS_FILTER_OPTIONS.some(o => o.value === v) ? v : 'all';
}

export function getOrdersSortKey(){ return sortKey; }
export function setOrdersSortKey(v){
  sortKey = SORT_OPTIONS.some(o => o.value === v) ? v : 'newest';
}

function matchesStatusFilter(order){
  switch(statusFilter){
    case 'pending': return order.status === 'received';
    case 'preparing': return order.status === 'kitchen' || order.status === 'packaging';
    case 'ready': return order.status === 'courier' || order.status === 'ready';
    case 'completed': return order.status === 'delivered' || order.status === 'picked_up';
    case 'cancelled': return order.status === 'cancelled';
    case 'all':
    default: return true;
  }
}

function matchesSearch(order){
  if(!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (order.orderNumber || '').toLowerCase().includes(q)
    || (order.customerName || '').toLowerCase().includes(q)
    || (order.customerPhone || '').toLowerCase().includes(q);
}

/** Same Firestore-Timestamp-or-plain-number duck-typing js/utils.js's
    formatRelativeTime() already uses elsewhere in this project —
    createdAt is a real Timestamp (has .toMillis()) once synced from
    Firestore; createdLocalAt is the plain-number fallback set at
    order-build time (see js/order.js's buildOrderObject), for the
    brief moment before a freshly-placed order's own write round-trips
    back through this admin's subscription with a real createdAt. */
function getTimeValue(order){
  const t = order.createdAt;
  if(t && typeof t.toMillis === 'function') return t.toMillis();
  return order.createdLocalAt || 0;
}

function compareOrders(a, b){
  const diff = getTimeValue(a) - getTimeValue(b);
  return sortKey === 'oldest' ? diff : -diff;
}

export function getFilteredSortedOrders(orders){
  return orders.filter(o => matchesSearch(o) && matchesStatusFilter(o)).sort(compareOrders);
}

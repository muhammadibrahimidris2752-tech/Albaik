import { getAllOrders, isOrdersLoading, getOrdersLoadError, onOrdersDataChanged } from './admin-orders-data.js';
import { ORDER_STATUS, getStatusLabel } from '../../js/order-status.js';
import { formatNaira, escapeHtml } from '../../js/utils.js';

/* Customers and analytics are derived from the one existing live orders
   cache. This avoids broad staff reads of customer profiles and keeps every
   view consistent with the Orders section. */
function toMillis(value){ return typeof value === 'number' ? value : value?.toMillis?.() || 0; }
function activeOrders(){ return getAllOrders().filter(order => order.status !== ORDER_STATUS.CANCELLED); }

function renderLoadingOrError(target, noun){
  if(isOrdersLoading()){ target.innerHTML = `<div class="admin-dashboard-empty">Loading ${noun}…</div>`; return true; }
  if(getOrdersLoadError() && !getAllOrders().length){ target.innerHTML = `<div class="admin-dashboard-empty">${noun[0].toUpperCase() + noun.slice(1)} could not be loaded. Open Orders to retry.</div>`; return true; }
  return false;
}

function customerRows(){
  const customers = new Map();
  getAllOrders().forEach(order => {
    const key = order.userId || order.customerEmail || order.customerPhone || order.customerName;
    if(!key) return;
    const customer = customers.get(key) || { name: '', email: '', phone: '', count: 0, spent: 0, latest: 0 };
    customer.count += 1;
    if(order.status !== ORDER_STATUS.CANCELLED) customer.spent += Number(order.total) || 0;
    const time = toMillis(order.createdAt || order.createdLocalAt);
    if(time >= customer.latest){
      customer.latest = time;
      customer.name = order.customerName || customer.name;
      customer.email = order.customerEmail || customer.email;
      customer.phone = order.customerPhone || customer.phone;
    }
    customers.set(key, customer);
  });
  return [...customers.values()].sort((a, b) => b.latest - a.latest);
}

export function renderCustomers(){
  const target = document.getElementById('adminCustomersList');
  if(!target || renderLoadingOrError(target, 'customers')) return;
  const customers = customerRows();
  if(!customers.length){ target.innerHTML = '<div class="admin-dashboard-empty">No customers yet. A customer appears here after their first order.</div>'; return; }
  target.innerHTML = customers.map(customer => `<article class="admin-customer-row">
    <div><strong>${escapeHtml(customer.name || 'Guest')}</strong><span>${escapeHtml(customer.email || customer.phone || 'No contact details')}</span></div>
    <div><span>Orders</span><strong>${customer.count}</strong></div>
    <div><span>Lifetime value</span><strong>${formatNaira(customer.spent)}</strong></div>
    <div><span>Last order</span><strong>${customer.latest ? new Date(customer.latest).toLocaleDateString('en-NG', { month:'short', day:'numeric', year:'numeric' }) : '—'}</strong></div>
  </article>`).join('');
}

function bar(label, value, max, display){
  const width = max ? Math.max(4, Math.round(value / max * 100)) : 0;
  return `<div class="admin-bar-row"><span>${escapeHtml(label)}</span><div><i style="width:${width}%"></i></div><strong>${escapeHtml(String(display))}</strong></div>`;
}

function renderRevenueTrend(){
  const target = document.getElementById('adminRevenueTrend');
  if(!target || renderLoadingOrError(target, 'revenue')) return;
  const days = [];
  for(let offset = 6; offset >= 0; offset--){
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - offset);
    days.push({ key: day.getTime(), label: day.toLocaleDateString('en-NG', { weekday:'short', day:'numeric' }), total: 0 });
  }
  activeOrders().forEach(order => {
    const date = new Date(toMillis(order.createdAt || order.createdLocalAt)); date.setHours(0, 0, 0, 0);
    const day = days.find(entry => entry.key === date.getTime());
    if(day) day.total += Number(order.total) || 0;
  });
  const max = Math.max(...days.map(day => day.total), 0);
  target.innerHTML = days.map(day => bar(day.label, day.total, max, formatNaira(day.total))).join('');
}

function renderStatusBreakdown(){
  const target = document.getElementById('adminStatusBreakdown');
  if(!target || renderLoadingOrError(target, 'order statuses')) return;
  const counts = new Map();
  getAllOrders().forEach(order => {
    const label = getStatusLabel(order);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if(!entries.length){ target.innerHTML = '<div class="admin-dashboard-empty">No order statuses to analyse yet.</div>'; return; }
  const max = entries[0][1];
  target.innerHTML = entries.map(([label, count]) => bar(label, count, max, count)).join('');
}

function renderTopItems(){
  const target = document.getElementById('adminTopItems');
  if(!target || renderLoadingOrError(target, 'top menu items')) return;
  const totals = new Map();
  activeOrders().forEach(order => (order.items || []).forEach(item => {
    const key = item.name || item.id;
    if(key) totals.set(key, (totals.get(key) || 0) + (Number(item.qty) || 0));
  }));
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if(!entries.length){ target.innerHTML = '<div class="admin-dashboard-empty">No sold menu items yet.</div>'; return; }
  const max = entries[0][1];
  target.innerHTML = entries.map(([label, count]) => bar(label, count, max, `${count} sold`)).join('');
}

export function renderAdminInsights(){ renderCustomers(); renderRevenueTrend(); renderStatusBreakdown(); renderTopItems(); }
export function initAdminInsights(){ onOrdersDataChanged(renderAdminInsights); renderAdminInsights(); }

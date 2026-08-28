import { initAdminAuthGate } from './admin-auth.js';
import { initAdminItemForm } from './admin-item-form.js';
import { initAdminList } from './admin-render.js';
import { initAdminConfirm } from './admin-confirm.js';
import { startMenuItemsSubscription } from './admin-data.js';
import { initAdminOrders } from './admin-orders-render.js';
import { initAdminOrderDetail } from './admin-order-detail.js';
import { startOrdersSubscription } from './admin-orders-data.js';
import { initAdminDashboard } from './admin-dashboard.js';
import { initAdminTaxonomy, startAdminTaxonomy } from './admin-taxonomy.js';
import { initAdminInsights } from './admin-insights.js';
import { initAdminDeliveryZones, startDeliveryZonesSubscription } from './admin-delivery-zones.js';
import { initAdminSettings, startAdminSettings } from './admin-settings.js';
import { initAdminReviews, startReviewsSubscription } from './admin-reviews.js';
import { initAdminStaff, startStaffSubscription } from './admin-staff.js';
import { getPermittedSectionsFromStaff } from './admin-permissions.js';

/* ============================================================
   ADMIN DASHBOARD — entry point. Same DOMContentLoaded → wire
   everything → let auth resolve shape as js/app.js's own init(),
   scaled down to what this page actually has (no cart/menu/reviews/
   addresses to initialize, no toast connectivity banner).

   Every admin data source (menu items, orders, categories, labels,
   delivery zones, settings, reviews) only starts its subscription once
   a signed-in user is CONFIRMED staff or admin (see admin-auth.js's
   initAdminAuthGate) — never fetched speculatively before that gate
   passes. For orders specifically this is a real security-relevant
   reason to wait: order reads ARE gated by firestore.rules.

   PRIORITY 14: the dashboard is now a left-sidebar management console —
   every management section lives in the sidebar, in a deliberate order
   (Dashboard, Orders, Menu, Categories, Labels, Delivery Zones,
   Customers, Reviews, Analytics, Staff, Settings), and the top header
   holds the section title, a section-jump search, notifications, and
   the signed-in profile.

   PRIORITY 15: staff/role system. After the auth gate confirms a
   signed-in staff/admin, this module computes which sections the user
   may access (from their own staff/{uid}.permissions doc, or all if
   they're the Super Admin) and hides the rest ENTIRELY from the DOM —
   not merely disables them. Only the Super Admin gets the Staff section
   and its live subscription. The same permission ids are enforced in
   firestore.rules, so a restricted write is also denied server-side.
   ================================================================ */

/* Section titles for the top header (PRIORITY 14). */
const SECTION_TITLES = {
  'dashboard': 'Dashboard',
  'orders': 'Orders',
  'menu': 'Menu',
  'categories': 'Categories',
  'labels': 'Labels',
  'delivery': 'Delivery Zones',
  'customers': 'Customers',
  'reviews': 'Reviews',
  'analytics': 'Analytics',
  'staff': 'Staff',
  'settings': 'Settings'
};

function showAdminSection(name){
  const active = document.querySelector('.order-view.active');
  if(active) active.classList.remove('active');
  document.getElementById('adminSection-' + name)?.classList.add('active');
  document.querySelectorAll('.admin-sidebar__tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.section === name);
  });
  const title = document.getElementById('adminPageTitle');
  if(title) title.textContent = SECTION_TITLES[name] || 'Dashboard';
}

function initAdminNav(){
  document.querySelectorAll('.admin-sidebar__tab').forEach(tab => {
    tab.addEventListener('click', () => showAdminSection(tab.dataset.section));
  });

  // Notifications popover toggle.
  const notifBtn = document.getElementById('adminNotificationsBtn');
  const popover = document.getElementById('adminNotifPopover');
  notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if(popover) popover.hidden = !popover.hidden;
  });
  document.addEventListener('click', () => { if(popover) popover.hidden = true; });

  // Global section-jump search in the header.
  const searchHost = document.getElementById('adminHeaderSearch');
  if(searchHost){
    searchHost.innerHTML = '<div class="menu-search"><span class="menu-search__icon">⌕</span><input type="text" id="adminGlobalSearch" placeholder="Jump to a section…" autocomplete="off"></div>';
    const input = document.getElementById('adminGlobalSearch');
    input?.addEventListener('keydown', (e) => {
      if(e.key !== 'Enter') return;
      const q = input.value.trim().toLowerCase();
      if(!q) return;
      const match = Object.entries(SECTION_TITLES).find(([id, label]) =>
        id === q || label.toLowerCase().includes(q));
      if(match && document.getElementById('adminSection-' + match[0]) && !document.getElementById('adminNav' + match[0][0].toUpperCase() + match[0].slice(1)).hidden){
        showAdminSection(match[0]);
        input.value = '';
      }
    });
  }
}

/** PRIORITY 15. Hides every section the user may NOT access, leaving
    only their permitted sections in the DOM. Hidden sections are simply
    absent from the interface — not disabled, not visible-but-greyed.
    The Super Admin (isAdminUser) always sees everything. A staff member
    sees only their granted sections. The Staff section is additionally
    restricted to the Super Admin alone. */
function setPermittedSections(staffDoc, isAdminUser){
  let permitted = getPermittedSectionsFromStaff(staffDoc, isAdminUser);
  // Staff Management is Super-Admin-only, regardless of any permission
  // a staff member might have been granted.
  if(!isAdminUser) permitted = permitted.filter(id => id !== 'staff');

  document.querySelectorAll('.admin-sidebar__tab').forEach(tab => {
    const section = tab.dataset.section;
    const allowed = permitted.includes(section);
    tab.hidden = !allowed;
    document.getElementById('adminSection-' + section).hidden = !allowed;
  });

  // If the currently-active section is no longer permitted, fall back to
  // the first permitted section (always Dashboard for the admin).
  const active = document.querySelector('.admin-sidebar__tab.active');
  if(!active || active.hidden){
    showAdminSection(permitted[0] || 'dashboard');
  }
}

function init(){
  initAdminNav();
  initAdminItemForm();
  initAdminList();
  initAdminConfirm();
  initAdminOrders();
  initAdminOrderDetail();
  initAdminDashboard(() => showAdminSection('orders'), () => showAdminSection('menu'));
  initAdminTaxonomy();
  initAdminInsights();
  initAdminDeliveryZones();
  initAdminSettings();
  initAdminReviews();
  initAdminStaff();
  initAdminAuthGate((user, profile, staffDoc, isAdminUser) => {
    setPermittedSections(staffDoc, isAdminUser);
    startMenuItemsSubscription();
    startOrdersSubscription();
    startAdminTaxonomy();
    startDeliveryZonesSubscription();
    startAdminSettings();
    startReviewsSubscription();
    if(isAdminUser){
      startStaffSubscription();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

import { subscribeToMenuItems, addMenuItem, updateMenuItem, deleteMenuItem, setMenuItemLabelsAndClearLegacyBadges } from '../../js/firestore.js';
import { isFirebaseConfigured } from '../../js/firebase.js';
import { getAdminFirebaseApp } from './admin-session.js';

/* ============================================================
   ADMIN MENU MANAGER — data layer. Reuses js/firestore.js's existing
   subscribeToMenuItems()/addMenuItem()/updateMenuItem()/deleteMenuItem()
   exactly as they already exist (the brief's own explicit instruction:
   "Reuse the existing Firestore helper functions whenever possible...
   Do NOT duplicate Firestore logic") — nothing in this file talks to
   Firestore directly.

   Deliberately separate from js/menu-data.js rather than extending it:
   that module's getMenu() is a CUSTOMER-facing view — it filters out
   unavailable items and sorts by displayOrder for browsing. Admin
   needs the opposite: every item, unfiltered, in whatever order the
   current sort/search state produces (see admin-filter.js), including
   sold-out ones (staff need to find them to turn them back on). Also,
   admin/index.html is a separate HTML document from index.html — even
   though both could import js/menu-data.js, each page load gets its
   own independent module instance, so sharing it would buy nothing;
   keeping this page's own state in its own file matches the project's
   established "each concern owns its own lifecycle" rule (see
   js/favorites.js's header comment for the same reasoning applied to
   favorites vs. Store.state).

   PHASE 4 (Admin Dashboard): upgraded from a one-shot fetchMenuItems()
   + optimistic-local-cache-patch-per-write to a LIVE subscribeToMenuItems()
   listener — the same "derive everything from one listener/cache" shape
   admin-orders-data.js already established for orders, now shared by
   every admin data source (orders, categories, labels, delivery zones,
   settings) instead of Menu Items being the one static exception. Same
   consequence as admin-orders-data.js's own header comment already
   documents for orders: writes below (createItem/saveItemChanges/
   removeItem) no longer patch allItems themselves — the live listener
   delivers the server-confirmed state moments later on its own, so a
   manual patch on top would only risk briefly disagreeing with what the
   listener is about to say anyway. The Firestore SDK also echoes a
   pending local write into its own cache immediately (before the round
   trip completes), so this reads exactly as instantly as the old
   optimistic patch did, while ALSO now reflecting another admin's or
   another open tab's concurrent changes automatically. The Refresh
   button in admin-render.js still exists — like admin-orders-render.js's
   equivalent, it just restarts the live listener rather than re-running
   a one-shot fetch.

   One genuine behavioural improvement that falls out of this for free:
   the old fetchMenuItems() returned null for THREE different situations
   (not configured / genuinely empty / the fetch actually failed), so
   "empty" and "failed" were indistinguishable — see the old version of
   this file. A live subscription's onError callback is a SEPARATE path
   from a successful-but-empty snapshot, so this version can and does
   tell the two apart correctly (loadError stays null for a real empty
   collection; only an actual attach/listen failure sets
   'subscription-failed') — see admin-render.js's updated notice copy. */

const LOW_STOCK_THRESHOLD = 5;

let allItems = [];
let isLoading = true;
let loadError = null;   // null | 'not-configured' | 'subscription-failed'
let unsubscribe = null;
let timeoutId = null;
const listeners = [];

export function getAllItems(){
  return allItems;
}
export function getItemById(id){
  return allItems.find(item => item.id === id);
}
export function isMenuDataLoading(){
  return isLoading;
}
export function getLoadError(){
  return loadError;
}

/** Registered by admin-render.js to re-render whenever the underlying
    item list changes for any reason (initial load, every live snapshot,
    or a manual restart) — same subscribe-and-notify shape
    js/favorites.js's onFavoritesChanged already establishes elsewhere
    in this project. */
export function onMenuDataChanged(cb){
  listeners.push(cb);
}
function notify(){
  listeners.forEach(cb => cb());
}

/** Every category currently in use across the REAL Firestore
    collection, alphabetically. Deliberately does NOT read
    data/menu.sample.js's MENU_CATEGORIES — js/menu-data.js's own
    header comment names itself as the only file that should import
    that sample array directly, and more importantly, admin is
    managing the actual live collection, not the design-time sample
    list, so the true source of "what categories exist" is whatever
    the loaded items actually say. On a brand new, empty collection
    this returns an empty list — the add-item form's "+ Add new
    category" path (see admin-item-form.js) is exactly how the very
    first item gets one. */
export function getKnownCategories(){
  return [...new Set(allItems.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** A reasonable default displayOrder for a new item in `category` —
    one past whatever the highest existing value in that category
    already is, or 10 if the category is new/empty. Only used when the
    add-item form's own Display Order field is left blank (see
    admin-item-form.js) — an explicit value the staff member typed is
    always used as-is. */
export function getNextDisplayOrderForCategory(category){
  const inCategory = allItems.filter(item => item.category === category);
  if(!inCategory.length) return 10;
  const max = Math.max(...inCategory.map(item => (typeof item.displayOrder === 'number' ? item.displayOrder : 0)));
  return max + 10;
}

/** PHASE 4 (Admin Dashboard). Stock is opt-in per item — most items
    have no stockQty field at all, which means "not tracked / always
    available" (every pre-Phase-4 item, unchanged). Only an item whose
    stockQty is an actual number is stock-tracked at all, and only a
    tracked, still-available item at or under LOW_STOCK_THRESHOLD counts
    as low — an item staff already marked Sold Out is a stronger,
    already-visible signal and would just be noise here too. A single
    shared threshold (rather than a per-item field) keeps this feature
    simple — see admin-item-form.js's Stock Quantity field, the only
    place stockQty is ever set. Sorted lowest-remaining-first so the
    most urgent items lead the dashboard panel. */
export function getLowStockItems(){
  return allItems
    .filter(item => item.available !== false && typeof item.stockQty === 'number' && item.stockQty <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stockQty - b.stockQty);
}
export { LOW_STOCK_THRESHOLD };

function clearMenuItemsTimeout(){
  if(timeoutId !== null){ clearTimeout(timeoutId); timeoutId = null; }
}

/** Starts (or restarts) the live menu items subscription. Called once
    from admin-app.js's init() once staff sign-in is confirmed, same
    "only fetch once we know we're allowed to see it" reasoning as
    every other admin data source — menuItems reads are public per
    firestore.rules, so this isn't security-gated the way orders are,
    but there's still no reason to open it before a staff member is
    actually looking at this page. Same 12s honest-timeout shape as
    admin-orders-data.js's startOrdersSubscription() — a subscribeToX()
    promise resolving with a working unsubscribe tells you nothing about
    whether the listener itself ever actually fires. */
export function startMenuItemsSubscription(){
  if(unsubscribe){ unsubscribe(); unsubscribe = null; }
  clearMenuItemsTimeout();

  if(!isFirebaseConfigured()){
    allItems = [];
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
  }, 12000);

  getAdminFirebaseApp().then(app => subscribeToMenuItems(list => {
    clearMenuItemsTimeout();
    allItems = list;
    isLoading = false;
    loadError = null;
    notify();
  }, () => {
    clearMenuItemsTimeout();
    isLoading = false;
    loadError = 'subscription-failed';
    notify();
  }, app)).then(unsub => { unsubscribe = unsub; }).catch(() => {
    clearMenuItemsTimeout();
    isLoading = false;
    loadError = 'subscription-failed';
    notify();
  });
}

/** Creates a new menu item. `data` should already be the full,
    validated field set (see admin-item-form.js) — this function's own
    job is only to call addMenuItem(), not to validate. No local-cache
    patch on success (see this file's header comment) — the live
    subscription above delivers the new item on its own. Returns the
    new item's id, or null if the write failed (addMenuItem() itself
    never throws — see its own guard-and-fallback shape in
    js/firestore.js). */
export async function createItem(data){
  return addMenuItem(data, await getAdminFirebaseApp());
}

/** Applies a partial update to an existing item in Firestore. Returns
    true/false, same convention as updateMenuItem() itself. No local-
    cache patch — see this file's header comment. */
export async function saveItemChanges(id, changes){
  return updateMenuItem(id, changes, await getAdminFirebaseApp());
}

/** Convenience wrapper around saveItemChanges() for the list view's
    one-tap "toggle availability" and inline display-order edit — both
    are just a single-field update, but named separately from the
    add/edit FORM's save path so a quick row-level action never has to
    go through form validation to change one field. */
export async function setItemAvailability(id, available){
  return saveItemChanges(id, { available: !!available });
}
export async function setItemDisplayOrder(id, displayOrder){
  return saveItemChanges(id, { displayOrder });
}

export async function removeItem(id){
  return deleteMenuItem(id, await getAdminFirebaseApp());
}

/** PHASE 4 (Labels migration). Used exactly once per item by
    admin-taxonomy.js's one-time legacy-badge migration — same "this
    file is the only one that talks to Firestore for item writes"
    convention as saveItemChanges() above, just backed by
    setMenuItemLabelsAndClearLegacyBadges() instead of the plain
    updateMenuItem(), because this particular write also needs to
    delete the old isPopular/isNew/isSignature/isBestSeller fields, not
    just set new ones. */
export async function migrateItemLegacyBadges(id, labels){
  return setMenuItemLabelsAndClearLegacyBadges(id, labels, await getAdminFirebaseApp());
}

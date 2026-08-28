import {
  getAllItems, isMenuDataLoading, getLoadError, startMenuItemsSubscription, onMenuDataChanged,
  setItemAvailability, setItemDisplayOrder, removeItem, getItemById, getKnownCategories, LOW_STOCK_THRESHOLD
} from './admin-data.js';
import {
  getSearchQuery, setSearchQuery, getActiveCategory, setActiveCategory,
  getAvailabilityFilter, setAvailabilityFilter, getSortKey, setSortKey,
  getFilteredSortedMenu, highlightMatch, SORT_OPTIONS, AVAILABILITY_OPTIONS
} from './admin-filter.js';
import { openItemFormForAdd, openItemFormForEdit } from './admin-item-form.js';
import { confirmAction } from './admin-confirm.js';
import { formatNaira, escapeHtml } from '../../js/utils.js';
import { showToast } from '../../js/toast.js';
import { getManagedLabels, onTaxonomyChanged } from './admin-taxonomy.js';
import { getItemAggregate, onReviewsChanged } from '../../js/reviews-store.js';

/* ============================================================
   ADMIN MENU MANAGER — toolbar + item list. One render entry point
   (renderMenuManager, registered with admin-data.js's
   onMenuDataChanged) rebuilds the whole list from current data +
   filter/sort state, the same "always fully rebuild via innerHTML,
   safe/cheap to call on every change" pattern js/menu-render.js's own
   renderMenuList() already established for the customer menu grid.

   Row interactions use EVENT DELEGATION — one click listener and one
   change listener on #adminItemList itself (wired once in
   initAdminList(), never re-attached) rather than per-row listeners
   that would need re-wiring every time innerHTML rebuilds the list.
   The search input is the one exception, for the same reason
   js/menu-render.js's initMenuBrowse() keeps it separate from the
   reactive render: the input element itself must never be torn down
   while the customer (here, staff member) is mid-keystroke, or focus
   and cursor position are lost.

   One-directional dependency on admin-item-form.js (to open the add/
   edit modal) — nothing flows back the other way. admin-item-form.js
   never needs to call anything here: it writes through admin-data.js's
   createItem()/saveItemChanges(), and THAT module's own notify() is
   what triggers this file's renderMenuManager() to refresh the list —
   see admin-data.js's header comment. No circular import. */

/* PHASE 4 (Badge/Label consolidation). Reads ONLY the labels array now —
   isPopular/isNew/isSignature/isBestSeller no longer exist on any item
   once admin-taxonomy.js's migration has run. See that file's header
   comment. */
function buildBadgeChips(item){
  const labelNames = new Map(getManagedLabels().map(label => [label.id, label.name]));
  const chips = (item.labels || []).map(id => labelNames.get(id)).filter(Boolean);
  if(!chips.length) return '';
  return `<div class="admin-item-row__badges">${chips.map(l => `<span class="badge">${escapeHtml(l)}</span>`).join('')}</div>`;
}

function buildItemRow(item, query){
  const row = document.createElement('div');
  row.className = 'admin-item-row' + (item.available === false ? ' is-unavailable' : '');
  row.dataset.id = item.id;

  const media = document.createElement('div');
  media.className = 'admin-item-row__media';
  media.innerHTML =
    (item.image ? `<img src="${item.image}" alt="" loading="lazy">` : '') +
    `<div class="admin-item-row__fallback"${item.image ? ' style="display:none"' : ''}>${item.icon || '🍽️'}</div>`;
  row.appendChild(media);
  if(item.image){
    const img = media.querySelector('img');
    img.addEventListener('error', () => {
      img.style.display = 'none';
      media.querySelector('.admin-item-row__fallback').style.display = 'flex';
    });
  }

  // [AUDIT FIX] Used to read item.rating/item.reviewCount — a
  // denormalized field only the customer-side review write path ever
  // recomputed, so admin moderation (hide/restore/delete in
  // admin/js/admin-reviews.js) left it stale. Calculated live from the
  // shared review store instead — see js/reviews-store.js's header
  // comment for the full root-cause writeup.
  const { rating, reviewCount } = getItemAggregate(item.id);
  const ratingText = reviewCount ? ` · ★${rating.toFixed(1)} (${reviewCount})` : '';
  const stockTracked = typeof item.stockQty === 'number';
  const isLowStock = stockTracked && item.available !== false && item.stockQty <= LOW_STOCK_THRESHOLD;
  const stockText = stockTracked ? ` · ${item.stockQty} in stock` : '';
  const info = document.createElement('div');
  info.className = 'admin-item-row__info';
  info.innerHTML =
    `<div class="admin-item-row__name">${highlightMatch(item.name, query)}${item.available === false ? '<span class="admin-sold-out-tag">Sold out</span>' : ''}${isLowStock ? '<span class="admin-lowstock-tag">Low Stock</span>' : ''}</div>` +
    `<div class="admin-item-row__meta">${escapeHtml(item.category || '—')} · ${formatNaira(item.price || 0)}${ratingText}${stockText}</div>` +
    buildBadgeChips(item);
  row.appendChild(info);

  const controls = document.createElement('div');
  controls.className = 'admin-item-row__controls';
  controls.innerHTML =
    `<label class="admin-order-field"><span>Order</span><input type="number" class="admin-order-input" value="${item.displayOrder ?? ''}" step="1" inputmode="numeric" aria-label="Display order for ${escapeHtml(item.name)}"></label>` +
    `<button type="button" class="admin-availability-toggle${item.available === false ? '' : ' is-available'}" data-action="toggle-availability">${item.available === false ? 'Sold Out' : 'Available'}</button>` +
    `<button type="button" class="admin-row-btn" data-action="edit">Edit</button>` +
    `<button type="button" class="admin-row-btn danger" data-action="delete">Delete</button>`;
  row.appendChild(controls);

  return row;
}

/** Same-shape skeleton as js/menu-render.js's buildSkeletonCard() —
    identical wrapper classes to a real row so the list doesn't reflow
    once real data arrives, reusing css/product-grid.css's
    .skeleton-line/shimmer animation rather than inventing a second
    loading treatment. */
function buildSkeletonRow(){
  const row = document.createElement('div');
  row.className = 'admin-item-row admin-item-row--skeleton';
  row.setAttribute('aria-hidden', 'true');
  row.innerHTML =
    `<div class="admin-item-row__media"></div>` +
    `<div class="admin-item-row__info">` +
      `<div class="skeleton-line skeleton-line--title"></div>` +
      `<div class="skeleton-line skeleton-line--desc"></div>` +
    `</div>`;
  return row;
}

function buildNoticeBlock({ title, body, actions = [] }){
  const actionsHtml = actions.length
    ? `<div class="admin-notice__actions">${actions.map(a => `<button type="button" class="btn btn-primary" data-action="${a.action}">${escapeHtml(a.label)}</button>`).join('')}</div>`
    : '';
  return `<div class="admin-notice"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>${actionsHtml}</div>`;
}

function emptyMessage(totalCount){
  if(!totalCount) return 'No menu items yet — add your first one to get started.';
  const q = getSearchQuery();
  const cat = getActiveCategory();
  if(q && cat) return `No items match "${escapeHtml(q)}" in ${escapeHtml(cat)}.`;
  if(q) return `No items match "${escapeHtml(q)}".`;
  if(cat) return `No items in ${escapeHtml(cat)} match the current filters.`;
  return 'No items match the current filters.';
}

function renderSummary(totalCount, shownCount){
  const el = document.getElementById('adminResultsSummary');
  if(!el) return;
  if(!totalCount){ el.textContent = ''; return; }
  el.textContent = shownCount === totalCount
    ? `${totalCount} item${totalCount === 1 ? '' : 's'} total`
    : `Showing ${shownCount} of ${totalCount} item${totalCount === 1 ? '' : 's'}`;
}

/** Rebuilds the category filter's <option> list from whatever
    categories actually exist right now (see admin-data.js's
    getKnownCategories()) — called on every render since an add/edit
    can introduce or remove a category at any time. Preserves the
    active filter selection when it's still valid; resets to "All
    categories" when it isn't (e.g. the last item in a filtered
    category was just deleted or recategorized). */
function renderCategoryFilterOptions(){
  const select = document.getElementById('adminCategoryFilter');
  if(!select) return;
  const categories = getKnownCategories();
  const active = getActiveCategory();
  if(active && !categories.includes(active)) setActiveCategory(null);
  const current = getActiveCategory();
  select.innerHTML = '<option value="">All categories</option>' +
    categories.map(c => `<option value="${escapeHtml(c)}"${c === current ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

export function renderMenuManager(){
  renderCategoryFilterOptions();

  const list = document.getElementById('adminItemList');
  const notice = document.getElementById('adminLoadNotice');
  if(!list) return;

  if(isMenuDataLoading()){
    if(notice) notice.hidden = true;
    list.innerHTML = '';
    for(let i = 0; i < 5; i++) list.appendChild(buildSkeletonRow());
    renderSummary(0, 0);
    return;
  }

  const error = getLoadError();
  const allItems = getAllItems();

  if(error === 'not-configured'){
    if(notice) notice.hidden = true;
    list.innerHTML = buildNoticeBlock({
      title: "Firebase isn't configured yet",
      body: "The admin dashboard needs a real Firebase project to manage the live menu. See README.md's Firebase setup section, then reload this page."
    });
    renderSummary(0, 0);
    return;
  }

  if(error && allItems.length === 0){
    if(notice) notice.hidden = true;
    list.innerHTML = buildNoticeBlock({
      title: "Couldn't load the menu",
      body: "There's a connection problem reaching Firestore. Try again, or add your first item directly — a genuinely empty menu would show a different message than this one.",
      actions: [{ action: 'retry', label: 'Retry' }, { action: 'add-first-item', label: '+ Add First Item' }]
    });
    renderSummary(0, 0);
    return;
  }

  // A live listener that dropped AFTER we already had a working list:
  // keep showing that list (never blank the page over a transient
  // connection issue) with a small non-blocking notice, same "degrade,
  // never break" shape as js/menu-render.js's own menu-load-notice.
  if(notice){
    notice.hidden = !error;
    if(error) notice.textContent = "Live updates interrupted — showing the last known menu. Reconnecting…";
  }

  const query = getSearchQuery();
  const shown = getFilteredSortedMenu(allItems);

  if(!shown.length){
    list.innerHTML = `<div class="admin-empty-state">${escapeHtml(emptyMessage(allItems.length))}</div>`;
    renderSummary(allItems.length, 0);
    return;
  }

  list.innerHTML = '';
  shown.forEach(item => list.appendChild(buildItemRow(item, query)));
  renderSummary(allItems.length, shown.length);
}

async function handleAvailabilityToggle(id, btn){
  const item = getItemById(id);
  if(!item) return;
  const next = item.available === false; // becomes available if currently sold out
  btn.disabled = true;
  const ok = await setItemAvailability(id, next);
  if(!ok){
    btn.disabled = false;
    showToast("Couldn't update availability — check your connection and try again.", { type: 'error' });
  }
  // On success, admin-data.js's notify() re-renders the whole list,
  // which rebuilds this button already reflecting the new state.
}

async function handleDisplayOrderChange(id, input){
  const raw = input.value.trim();
  const value = raw === '' ? 0 : parseInt(raw, 10);
  if(!Number.isFinite(value)){
    showToast('Display order must be a number.', { type: 'error' });
    return;
  }
  input.disabled = true;
  const ok = await setItemDisplayOrder(id, value);
  input.disabled = false;
  if(!ok) showToast("Couldn't update display order — check your connection and try again.", { type: 'error' });
}

async function handleDelete(id){
  const item = getItemById(id);
  if(!item) return;
  const confirmed = await confirmAction({
    title: 'Delete this item?',
    message: `"${item.name}" will be permanently removed from the menu. This can't be undone.`,
    confirmLabel: 'Delete',
    danger: true
  });
  if(!confirmed) return;
  const ok = await removeItem(id);
  showToast(ok ? `Deleted "${item.name}".` : "Couldn't delete this item — check your connection and try again.", { type: ok ? 'info' : 'error' });
}

function handleListClick(e){
  const actionEl = e.target.closest('[data-action]');
  if(!actionEl) return;
  const action = actionEl.dataset.action;

  if(action === 'retry'){ startMenuItemsSubscription(); return; }
  if(action === 'add-first-item'){ openItemFormForAdd(); return; }

  const row = actionEl.closest('.admin-item-row');
  if(!row) return;
  const item = getItemById(row.dataset.id);
  if(!item) return;

  if(action === 'edit') openItemFormForEdit(item);
  else if(action === 'delete') handleDelete(item.id);
  else if(action === 'toggle-availability') handleAvailabilityToggle(item.id, actionEl);
}

function handleListChange(e){
  if(!e.target.matches('.admin-order-input')) return;
  const row = e.target.closest('.admin-item-row');
  if(!row) return;
  handleDisplayOrderChange(row.dataset.id, e.target);
}

/** One-time wiring, called once from admin-app.js's init(). Builds
    the sort/availability selects' options from admin-filter.js's own
    SORT_OPTIONS/AVAILABILITY_OPTIONS (single source of truth — this
    file doesn't hand-author a second copy of either list). */
export function initAdminList(){
  document.getElementById('adminSearchInput')?.addEventListener('input', e => {
    setSearchQuery(e.target.value);
    renderMenuManager();
  });

  const sortSelect = document.getElementById('adminSortSelect');
  if(sortSelect){
    sortSelect.innerHTML = SORT_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    sortSelect.value = getSortKey();
    sortSelect.addEventListener('change', () => { setSortKey(sortSelect.value); renderMenuManager(); });
  }

  const availSelect = document.getElementById('adminAvailabilityFilter');
  if(availSelect){
    availSelect.innerHTML = AVAILABILITY_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
    availSelect.value = getAvailabilityFilter();
    availSelect.addEventListener('change', () => { setAvailabilityFilter(availSelect.value); renderMenuManager(); });
  }

  document.getElementById('adminCategoryFilter')?.addEventListener('change', e => {
    setActiveCategory(e.target.value || null);
    renderMenuManager();
  });

  document.getElementById('addItemBtn')?.addEventListener('click', () => openItemFormForAdd());
  // Menu items are live now (see admin-data.js) — this restarts the
  // listener rather than re-running a one-shot fetch, same role
  // admin-orders-render.js's own Refresh button already plays for the
  // (already-live) Orders Dashboard.
  document.getElementById('adminRefreshBtn')?.addEventListener('click', () => startMenuItemsSubscription());

  document.getElementById('adminItemList')?.addEventListener('click', handleListClick);
  document.getElementById('adminItemList')?.addEventListener('change', handleListChange);

  onMenuDataChanged(renderMenuManager);
  onTaxonomyChanged(renderMenuManager);
  onReviewsChanged(renderMenuManager); // [AUDIT FIX] — see buildItemRow's ratingText above
}

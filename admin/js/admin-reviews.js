import { deleteReviewById, setReviewHidden } from '../../js/firestore.js';
import { staffReplyToReview } from '../../js/reviews-data.js';
import {
  startReviewsStore, getAllReviewsRaw, isReviewsStoreLoading, getReviewsStoreError, onReviewsChanged
} from '../../js/reviews-store.js';
import { getAllItems } from './admin-data.js';
import { getFilteredReviews, getReviewedItemIds } from './admin-reviews-filter.js';
import { confirmAction } from './admin-confirm.js';
import { formatRelativeTime, escapeHtml, starsHtml } from '../../js/utils.js';

/* ============================================================
   PRIORITY 10. Admin review moderation.

   A live-subscribed, event-delegated management console for the whole
   `reviews` collection. The Super Admin (or a staff member with review
   permission) can:
     - view every review (including hidden ones — the raw collection,
       unlike every customer-facing read, which strips `hidden`)
     - filter by menu item
     - search by customer name / text / item id
     - sort by newest / oldest / highest / lowest rating
     - reply publicly (role 'staff', rendered distinctly as "Restaurant")
     - hide / restore abusive reviews
     - delete abusive reviews (permanently)
     - see Verified Purchase badge, rating, reviews.count, date, etc.

   [AUDIT FIX] Data used to come from this file's OWN independent
   subscribeToAllReviews() call — a second live connection to the exact
   same `reviews` collection js/site-reviews.js was ALSO independently
   subscribing to on the customer site, each keeping its own private
   copy of the data. That's exactly the kind of duplicated read path the
   audit was asked to eliminate: this file now reads through the one
   shared js/reviews-store.js module instead (getAllReviewsRaw() for the
   raw, hidden-inclusive list this console needs — see that file's own
   header comment for why every OTHER, customer-facing consumer gets the
   hidden-filtered view instead). The loading/error/12-second-timeout
   handling that used to be hand-rolled here is now js/reviews-store.js's
   own isReviewsStoreLoading()/getReviewsStoreError() — same behaviour,
   written once. startReviewsSubscription() below is kept as a thin,
   same-named wrapper purely so admin-app.js's existing call needs no
   change.

   This is also the direct fix for the reported bug: moderation actions
   below (hide/restore/delete/reply) only ever wrote to the `reviews`
   collection — they never touched a menu item document. Before this
   audit, menu cards and the product modal read a `rating`/`reviewCount`
   field denormalized onto the menu item document itself, recomputed
   only by the CUSTOMER-side review-submission code — moderation here
   never recomputed it, so it went stale. Now that every rating/count
   everywhere is calculated live from this exact same `reviews`
   collection (see js/reviews-store.js), a hide/restore/delete/reply
   performed here reaches every customer-facing surface the instant this
   collection changes, with nothing left to go stale.

   Reads the menu items cache from admin-data.js (which every other
   admin section already owns) to resolve item names/images — no new
   Firestore listener for menu items. Actions write through the
   existing js/firestore.js helpers (deleteReviewById, setReviewHidden)
   and js/reviews-data.js's staffReplyToReview. The live listener
   re-renders automatically after any write, so no optimistic cache
   patching is needed — same convention as admin-orders-data.js.
   ================================================================ */

let filterState = { search: '', itemId: '', sort: 'newest', visibility: 'all' };

function itemNameById(id){
  const item = getAllItems().find(i => i.id === id);
  return item ? item.name : id;
}

function itemImageById(id){
  const item = getAllItems().find(i => i.id === id);
  return item ? item.image : '';
}

function renderToolbar(){
  const itemFilter = document.getElementById('adminReviewsItemFilter');
  if(!itemFilter) return;
  const current = itemFilter.value;
  itemFilter.innerHTML = '<option value="">All menu items</option>' +
    getReviewedItemIds(getAllReviewsRaw())
      .map(id => `<option value="${escapeHtml(id)}">${escapeHtml(itemNameById(id) || id)}</option>`)
      .join('');
  itemFilter.value = current;
}

function renderRows(){
  const el = document.getElementById('adminReviewsList');
  if(!el) return;
  const allReviews = getAllReviewsRaw();
  if(isReviewsStoreLoading()){
    el.innerHTML = '<div class="admin-dashboard-empty">Loading reviews…</div>';
    return;
  }
  if(getReviewsStoreError() && !allReviews.length){
    el.innerHTML = '<div class="admin-dashboard-empty">Reviews could not be loaded. Reconnecting…</div>';
    return;
  }
  const list = getFilteredReviews(allReviews, filterState);
  const summary = document.getElementById('adminReviewsResultsSummary');
  if(summary) summary.textContent = `${list.length} review${list.length === 1 ? '' : 's'}`;
  if(!list.length){
    el.innerHTML = '<div class="admin-dashboard-empty">No reviews match your filters.</div>';
    return;
  }
  el.innerHTML = list.map(review => buildRow(review)).join('');
}

function buildRow(review){
  const date = formatRelativeTime(review.createdAt) || '—';
  const name = review.userName || 'Customer';
  const initial = escapeHtml(name[0] || 'C').toUpperCase();
  const itemName = itemNameById(review.itemId) || review.itemId;
  const itemImage = itemImageById(review.itemId);
  const replyCount = (review.replies || []).length;
  const helpfulCount = (review.helpfulBy || []).length;

  return `<article class="admin-review-row${review.hidden ? ' is-hidden' : ''}" data-review-id="${escapeHtml(review.id)}">
    <div class="admin-review-row__media">
      ${itemImage ? `<img src="${escapeHtml(itemImage)}" alt="" loading="lazy">` : '<span class="admin-review-row__fallback">🍗</span>'}
    </div>
    <div class="admin-review-row__body">
      <div class="admin-review-row__head">
        <span class="admin-review-row__avatar">${initial}</span>
        <div class="admin-review-row__meta">
          <div class="admin-review-row__name">${escapeHtml(name)}
            ${review.verifiedPurchase ? '<span class="verified-badge">Verified Purchase</span>' : ''}
            ${review.hidden ? '<span class="admin-review-tag admin-review-tag--hidden">Hidden</span>' : ''}
          </div>
          <div class="admin-review-row__sub">${starsHtml(review.rating, 'small')}<span class="admin-review-row__item">on ${escapeHtml(itemName)}</span></div>
        </div>
        <span class="admin-review-row__date">${date}</span>
      </div>
      <p class="admin-review-row__text">${escapeHtml(review.text || '')}</p>
      <div class="admin-review-row__stats">
        <span>👍 ${helpfulCount} helpful</span>
        <span>💬 ${replyCount} reply${replyCount === 1 ? '' : 's'}</span>
        <span>#${escapeHtml(review.orderId ? review.id : '—')}</span>
      </div>
      <div class="admin-review-row__replies" id="adminReplyWrap-${escapeHtml(review.id)}">
        ${(review.replies || []).map(reply => `<div class="admin-review-reply"><span class="admin-review-reply__name">${escapeHtml(reply.role === 'staff' ? 'Restaurant' : (reply.userName || 'Customer'))}</span><span>${escapeHtml(reply.text || '')}</span></div>`).join('')}
      </div>
      <div class="admin-review-row__actions">
        <button type="button" class="admin-btn-secondary" data-action="reply" data-review-id="${escapeHtml(review.id)}">Reply</button>
        ${review.hidden
          ? `<button type="button" class="admin-btn-secondary" data-action="restore" data-review-id="${escapeHtml(review.id)}">Restore</button>`
          : `<button type="button" class="admin-btn-secondary" data-action="hide" data-review-id="${escapeHtml(review.id)}">Hide</button>`}
        <button type="button" class="admin-btn-secondary admin-btn-danger" data-action="delete" data-review-id="${escapeHtml(review.id)}">Delete</button>
      </div>
    </div>
  </article>`;
}

function renderAll(){
  renderToolbar();
  renderRows();
}

async function handleRowAction(action, reviewId){
  const review = getAllReviewsRaw().find(r => r.id === reviewId);
  if(!review) return;

  if(action === 'reply'){
    const text = window.prompt('Public reply to this customer review:');
    if(!text || !text.trim()) return;
    await staffReplyToReview(reviewId, text.trim());
    return;
  }

if(action === 'hide'){
    const ok = await confirmAction({ title: 'Hide this review?', message: `Hide this review from ${review.userName || 'Customer'}? The customer won't see it anymore, but you can restore it.`, confirmLabel: 'Hide Review', danger: false });
    if(!ok) return;
    await setReviewHidden(reviewId, true);
    return;
  }

  if(action === 'restore'){
    const ok = await confirmAction({ title: 'Restore this review?', message: 'Restore this review so customers can see it again?', confirmLabel: 'Restore', danger: false });
    if(!ok) return;
    await setReviewHidden(reviewId, false);
    return;
  }

  if(action === 'delete'){
    const ok = await confirmAction({ title: 'Delete this review?', message: 'Permanently delete this review? This cannot be undone.', confirmLabel: 'Delete Review', danger: true });
    if(!ok) return;
    await deleteReviewById(reviewId);
  }
}

function initToolbar(){
  const search = document.getElementById('adminReviewsSearchInput');
  const itemFilter = document.getElementById('adminReviewsItemFilter');
  const sort = document.getElementById('adminReviewsSortSelect');
  const visibility = document.getElementById('adminReviewsVisibilityFilter');

  search?.addEventListener('input', () => { filterState.search = search.value; renderRows(); });
  itemFilter?.addEventListener('change', () => { filterState.itemId = itemFilter.value; renderRows(); });
  sort?.addEventListener('change', () => { filterState.sort = sort.value; renderRows(); });
  visibility?.addEventListener('change', () => { filterState.visibility = visibility.value; renderRows(); });
}

function initList(){
  const list = document.getElementById('adminReviewsList');
  if(!list) return;
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const reviewId = btn.dataset.reviewId;
    const action = btn.dataset.action;
    await handleRowAction(action, reviewId);
  });
}

/** Starts THE one shared live `reviews` listener for this page (see
    js/reviews-store.js) — kept as a same-named wrapper so admin-app.js's
    existing call, gated behind confirmed staff/admin sign-in, needs no
    change. Every render this triggers happens via the onReviewsChanged()
    subscription registered in initAdminReviews() below, not from here
    directly. */
export function startReviewsSubscription(){
  startReviewsStore();
}

export function initAdminReviews(){
  const visibility = document.getElementById('adminReviewsVisibilityFilter');
  if(visibility){
    visibility.innerHTML = [
      { value: 'all', label: 'All reviews' },
      { value: 'visible', label: 'Visible only' },
      { value: 'hidden', label: 'Hidden only' }
    ].map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  }
  const sort = document.getElementById('adminReviewsSortSelect');
  if(sort){
    sort.innerHTML = [
      { value: 'newest', label: 'Newest first' },
      { value: 'oldest', label: 'Oldest first' },
      { value: 'rating-desc', label: 'Highest rating' },
      { value: 'rating-asc', label: 'Lowest rating' }
    ].map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  }
  initToolbar();
  initList();
  onReviewsChanged(renderAll);
}

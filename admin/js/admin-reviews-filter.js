/* ============================================================
   PRIORITY 10. Admin review moderation — filter/search/sort logic,
   no DOM. Pure functions operating on the raw `reviews` collection
   (NOT the customer-facing cache, which already strips hidden
   reviews — the admin queue must see hidden reviews to restore them).

   Mirrors the shape of admin-orders-filter.js / admin-menu-filter.js:
   a pure, unit-testable module that the rendering module feeds state
   into. The admin Reviews section supports:
     - filter by menu item (itemId)
     - search by customer name / review text
     - sort: newest, oldest, highest rating, lowest rating
     - visibility filter: all / visible / hidden
   ================================================================ */

export const REVIEW_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating-desc', label: 'Highest rating' },
  { value: 'rating-asc', label: 'Lowest rating' }
];

export const REVIEW_VISIBILITY_FILTERS = [
  { value: 'all', label: 'All reviews' },
  { value: 'visible', label: 'Visible only' },
  { value: 'hidden', label: 'Hidden only' }
];

function toMillis(value){
  return typeof value === 'number' ? value : value?.toMillis?.() || 0;
}

/** Returns the reviews that match the current search/filter/sort state.
    `reviews` is the raw collection (with hidden reviews present).
    `state` = { search, itemId, sort, visibility } — all optional. */
export function getFilteredReviews(reviews, state = {}){
  const { search = '', itemId = '', sort = 'newest', visibility = 'all' } = state;

  let list = Array.isArray(reviews) ? reviews.slice() : [];

  if(itemId) list = list.filter(r => r.itemId === itemId);

  if(visibility === 'visible') list = list.filter(r => !r.hidden);
  else if(visibility === 'hidden') list = list.filter(r => !!r.hidden);

  const q = search.trim().toLowerCase();
  if(q){
    list = list.filter(r =>
      (r.userName || '').toLowerCase().includes(q) ||
      (r.text || '').toLowerCase().includes(q) ||
      (r.itemId || '').toLowerCase().includes(q)
    );
  }

  switch(sort){
    case 'oldest':
      list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      break;
    case 'rating-desc':
      list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
      break;
    case 'rating-asc':
      list.sort((a, b) => (Number(a.rating) || 0) - (Number(b.rating) || 0));
      break;
    case 'newest':
    default:
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      break;
  }

  return list;
}

/** Distinct menu item ids that have at least one review, for the
    "filter by menu item" dropdown. Returns [{id, name}] — name is
    resolved separately by the caller from the menu cache, since this
    module has no DOM/menu access. */
export function getReviewedItemIds(reviews){
  return [...new Set((Array.isArray(reviews) ? reviews : []).map(r => r.itemId).filter(Boolean))];
}

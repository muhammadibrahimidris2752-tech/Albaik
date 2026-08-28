import { getSearchQuery, setSearchQuery, getActiveCategory, setActiveCategory, getFilteredMenu, highlightMatch } from '../../js/menu-filter.js';

/* ============================================================
   ADMIN MENU MANAGER. Search + category + availability filtering,
   plus sorting — state and pure logic only, no DOM, mirroring
   js/menu-filter.js's own "no DOM" convention so this can be
   exercised directly in a Node script (see run-verification's
   admin-logic-check.mjs).

   Deliberately REUSES js/menu-filter.js's getSearchQuery/
   setSearchQuery/getActiveCategory/setActiveCategory/getFilteredMenu/
   highlightMatch rather than re-implementing name/description/category
   matching a second time — the brief's "do not duplicate Firestore
   logic" applies in spirit to filter logic too, and the matching rule
   itself (substring match across name/description/category, combined
   with category, never one replacing the other) is identical for
   admin and customer. Importing it here creates a SEPARATE module
   instance from the one index.html's own pages use (this is a
   different HTML document, so ES modules never share state across the
   two) — so admin's search box and the customer menu's search box
   never see or affect each other's query, safely.

   What's genuinely new here, because the customer-facing module has
   no use for either: an availability filter (customers only ever see
   available items — js/menu-data.js's getMenu() already drops
   unavailable ones — but staff need to see AND find sold-out items to
   toggle them back on) and a sort order (the customer grid always
   shows displayOrder order; staff need to sort by name/price too when
   scanning a long list). */

let availabilityFilter = 'all';   // 'all' | 'available' | 'unavailable'
let sortKey = 'displayOrder';     // see SORT_OPTIONS below

export const SORT_OPTIONS = [
  { value: 'displayOrder', label: 'Display order' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'price-asc', label: 'Price (low to high)' },
  { value: 'price-desc', label: 'Price (high to low)' },
  { value: 'category', label: 'Category' }
];

export const AVAILABILITY_OPTIONS = [
  { value: 'all', label: 'All items' },
  { value: 'available', label: 'Available only' },
  { value: 'unavailable', label: 'Sold out only' }
];

export { getSearchQuery, setSearchQuery, getActiveCategory, setActiveCategory, highlightMatch };

export function getAvailabilityFilter(){ return availabilityFilter; }
export function setAvailabilityFilter(value){ availabilityFilter = value || 'all'; }

export function getSortKey(){ return sortKey; }
export function setSortKey(value){ sortKey = SORT_OPTIONS.some(o => o.value === value) ? value : 'displayOrder'; }

function matchesAvailability(item){
  if(availabilityFilter === 'available') return item.available !== false;
  if(availabilityFilter === 'unavailable') return item.available === false;
  return true;
}

function byDisplayOrder(a, b){
  return (a.displayOrder ?? 999) - (b.displayOrder ?? 999) || a.name.localeCompare(b.name);
}

function compareItems(a, b){
  switch(sortKey){
    case 'name-asc': return a.name.localeCompare(b.name);
    case 'name-desc': return b.name.localeCompare(a.name);
    case 'price-asc': return (a.price ?? 0) - (b.price ?? 0) || a.name.localeCompare(b.name);
    case 'price-desc': return (b.price ?? 0) - (a.price ?? 0) || a.name.localeCompare(b.name);
    case 'category': return a.category.localeCompare(b.category) || byDisplayOrder(a, b);
    case 'displayOrder':
    default: return byDisplayOrder(a, b);
  }
}

/** The single combined filter+sort every admin list render reads
    from — same "search and category always apply together" rule as
    js/menu-filter.js's own getFilteredMenu (which this calls first),
    with availability filtering and sorting layered on top. */
export function getFilteredSortedMenu(items){
  return getFilteredMenu(items).filter(matchesAvailability).sort(compareItems);
}

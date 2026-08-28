import { escapeHtml } from './utils.js';

/* ============================================================
   PHASE 3. Search + category filter — STATE and pure logic only, no
   DOM. js/menu-render.js is the only consumer, but keeping this
   separate (mirrors js/order-status.js's "one canonical model, no
   DOM" role) means the actual matching/highlighting logic can be
   exercised directly in a Node script without a browser — see the
   verification notes in PROJECT_CONTINUATION_SUMMARY.md.

   activeCategory === null means "All" — that's a UI-only pseudo-
   category (see data/menu.sample.js's MENU_CATEGORIES, which never
   includes it), so it's represented here as the absence of a filter
   rather than a magic string that would need to be kept in sync with
   real category names.
   ================================================================ */

let searchQuery = '';
let activeCategory = null;

export function getSearchQuery(){ return searchQuery; }
export function setSearchQuery(q){ searchQuery = (q || '').trim(); }

export function getActiveCategory(){ return activeCategory; }
export function setActiveCategory(cat){ activeCategory = cat || null; }

function matchesQuery(item, q){
  if(!q) return true;
  const needle = q.toLowerCase();
  return item.name.toLowerCase().includes(needle) ||
    (item.description || '').toLowerCase().includes(needle) ||
    (item.category || '').toLowerCase().includes(needle);
}

function matchesCategory(item){
  return !activeCategory || item.category === activeCategory;
}

/** The single combined filter every menu-browsing view reads from —
    category and search always apply together (see Phase 3 spec's
    "Works together with category filtering"), never one at the
    expense of the other. */
export function getFilteredMenu(menu){
  return menu.filter(item => matchesCategory(item) && matchesQuery(item, searchQuery));
}

/** Top matches for the search-suggestions dropdown — same combined
    filter as above, just capped short. Empty until the customer has
    actually typed something, so the dropdown never shows uninvited. */
export function getSearchSuggestions(menu, limit = 5){
  if(!searchQuery) return [];
  return getFilteredMenu(menu).slice(0, limit);
}

function escapeRegex(str){
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** HTML-safe highlighting: escapes both text and query the same way
    BEFORE matching, so the returned markup can never introduce script/
    tag injection from a customer's own search text, then wraps the
    (also-escaped) query in <mark> for css/product-grid.css to style.
    Returns escaped-but-unhighlighted text when there's no active
    query — always safe to drop straight into innerHTML either way. */
export function highlightMatch(text, query){
  const safeText = escapeHtml(text);
  if(!query) return safeText;
  const safeQuery = escapeHtml(query);
  if(!safeQuery) return safeText;
  const re = new RegExp('(' + escapeRegex(safeQuery) + ')', 'ig');
  return safeText.replace(re, '<mark>$1</mark>');
}

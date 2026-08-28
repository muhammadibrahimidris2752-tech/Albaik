import { SAMPLE_MENU, MENU_CATEGORIES } from '../data/menu.sample.js';
import { fetchMenuItems } from './firestore.js';
import { isFirebaseConfigured } from './firebase.js';

/* ============ MENU DATA LAYER ============
   Everything else in the app calls the functions below instead of
   reading menu data directly.

   loadMenu() tries Firestore's "menuItems" collection first (see
   fetchMenuItems in js/firestore.js) and falls back to the local
   sample data if Firebase isn't configured, is unreachable, or the
   collection is empty — the site should never show a blank menu
   just because a network call failed.

   PHASE 3: getMenu() now also (a) filters out anything explicitly
   marked unavailable (`available === false` — using `!== false` rather
   than `=== true` so a document that omits the field entirely, which
   is how every hand-written Firestore doc will start out, still shows)
   and (b) sorts by displayOrder. That sort runs once, here, across the
   WHOLE catalog rather than per-category, but that's still correct: it
   only needs to preserve each category's relative order once a caller
   filters down to one (e.g. js/menu-render.js's category grouping) —
   Array.prototype.sort then .filter composes exactly that way, and
   displayOrder itself is only ever meaningful *within* a category (see
   data/menu.sample.js's header comment), never compared across two.
   getMenuItemById() deliberately does NOT filter by availability —
   see its own comment below for why.

   PHASE 4 (spec section 2: "Gracefully handle: Loading, Empty menu,
   Missing images, Firestore errors"): isMenuLoading()/didMenuLoadFail()
   below let js/menu-render.js show a skeleton while the very first
   loadMenu() call is in flight, and a small non-alarming notice if
   Firestore was reachable-in-principle (configured) but the fetch
   itself failed — as opposed to simply not being configured yet,
   which isn't an error and shows no notice. Empty menu and missing
   images were already handled before this phase (see getMenu()'s
   filter and js/menu-render.js's <img onerror> fallback respectively)
   and needed no changes here. ============================ */
let menuCache = [];
let isLoading = true;
let lastLoadHadError = false;

export async function loadMenu(){
  isLoading = true;
  const fromFirestore = await fetchMenuItems();
  lastLoadHadError = isFirebaseConfigured() && fromFirestore === null;
  menuCache = fromFirestore && fromFirestore.length ? fromFirestore : SAMPLE_MENU;
  isLoading = false;
  return menuCache;
}

export function isMenuLoading(){
  return isLoading;
}
export function didMenuLoadFail(){
  return lastLoadHadError;
}

/** Customer-facing menu: available items only, in display order. */
export function getMenu(){
  return menuCache
    .filter(item => item.available !== false)
    .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
}

/** Deliberately reads the UNFILTERED cache — a cart line or an order
    placed before an item was 86'd shouldn't suddenly render blank just
    because getMenu() no longer lists it for new adds. Availability only
    ever gates what a customer can newly browse/add, never what they
    already have. */
export function getMenuItemById(id){
  return menuCache.find(item => item.id === id);
}

export function getCategories(){
  // Preserves the sample data's intentional category ordering; falls
  // back to first-seen order for anything else. Derives "seen" from the
  // already-available-filtered getMenu() rather than the raw cache, so a
  // category with nothing currently orderable in it doesn't show an
  // empty tab in the category nav.
  const seen = [...new Set(getMenu().map(item => item.category))];
  return MENU_CATEGORIES.filter(c => seen.includes(c)).concat(seen.filter(c => !MENU_CATEGORIES.includes(c)));
}


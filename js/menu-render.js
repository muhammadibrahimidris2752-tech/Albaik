import { Store } from './store.js';
import { getMenu, getCategories, isMenuLoading, didMenuLoadFail } from './menu-data.js';
import {
  getSearchQuery, setSearchQuery, getActiveCategory, setActiveCategory,
  getFilteredMenu, getSearchSuggestions, highlightMatch
} from './menu-filter.js';
import { isFavorite, toggleFavorite, onFavoritesChanged } from './favorites.js';
import { formatNaira, starsHtml, escapeHtml } from './utils.js';
import { buildAddBtn, buildStepper } from './ui.js';
import { openProductModal } from './product-modal.js';
import { getActiveLabelNamesForItem, onLabelsChanged } from './labels-data.js';
import { getItemAggregate, onReviewsChanged } from './reviews-store.js';

/* ============================================================
   PHASE 3. Menu browsing — sticky category nav, search bar with
   suggestions, and the responsive product-card grid that replaced
   the old buildOrderItemRow()/renderMenuList() simple list (see
   js/ui.js's header comment for the full history). This is the
   "Food should become the primary visual focus" surface the spec
   describes; js/product-modal.js is what a card click opens into.

   Circular import note: this file imports Store directly (to read
   cart quantities for each card's add-button/stepper) plus
   buildAddBtn/buildStepper from js/ui.js. js/store.js imports
   renderMenuList from HERE (its render() dispatcher calls it on every
   state change, same as it always called the old ui.js version), and
   ui.js imports renderMenuList back from here for openOrderModal().
   Safe by the same "nothing runs at module top-level" reasoning
   documented in store.js/ui.js already — Store itself is just a plain
   object these modules read from inside functions, never at import time.
   ================================================================ */

function renderCategoryNav(){
  const nav = document.getElementById('categoryNav');
  if(!nav) return;
  const active = getActiveCategory();
  nav.innerHTML = '';
  ['All', ...getCategories()].forEach(cat => {
    const isActive = cat === 'All' ? !active : active === cat;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-pill' + (isActive ? ' active' : '');
    btn.textContent = cat;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.addEventListener('click', () => {
      setActiveCategory(cat === 'All' ? null : cat);
      renderMenuList();
    });
    nav.appendChild(btn);
  });
}

/* PHASE 4 (Badge/Label consolidation). Badges now come from ONE place —
   an item's `labels` id array, resolved live against js/labels-data.js's
   cache — never isPopular/isNew/isSignature/isBestSeller, which no
   longer exist on any item once admin/js/admin-taxonomy.js's legacy
   migration has run (see that file). A label rename or hide/show toggle
   reaches this card through onLabelsChanged below with no page refresh. */
function buildBadgeRow(item){
  const labels = getActiveLabelNamesForItem(item);
  if(!labels.length) return '';
  return `<div class="product-card__badges">${labels.map(l => `<span class="badge">${escapeHtml(l)}</span>`).join('')}</div>`;
}

/* PHASE 4 (Remove hardcoded ratings). [AUDIT FIX] This was the exact
   spot the "menu cards inside the Order modal still show old ratings
   after Admin Reviews deletes everything" bug traced back to: item.rating/
   item.reviewCount were a denormalized aggregate, recomputed only by
   js/reviews-data.js's old customer-side write path — admin moderation
   (hide/restore/delete in admin/js/admin-reviews.js) never touched it,
   so it went stale the moment a review was moderated instead of
   customer-edited. There is no field left to go stale: rating and
   review count are now calculated fresh, straight from the live
   `reviews` collection (js/reviews-store.js), every time a card is
   built. What was ALSO fake before this phase was data/menu.sample.js
   pre-seeding every item with a rating before a single review existed;
   now that it doesn't (see that file), a brand-new item genuinely has
   reviewCount 0, so this needs its own real empty state rather than
   showing "★ 0.0 (0)". */
function buildRatingRow(item){
  const { rating, reviewCount } = getItemAggregate(item.id);
  if(!reviewCount){
    return `<div class="product-card__rating product-card__rating--empty">${starsHtml(0, 'tiny')}<span class="rating-count">No reviews yet</span></div>`;
  }
  return `<div class="product-card__rating">${starsHtml(rating, 'tiny')}<span class="rating-num">${rating.toFixed(1)}</span><span class="rating-count">(${reviewCount})</span></div>`;
}

function buildProductCard(item, query){
  const card = document.createElement('div');
  card.className = 'product-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View details for ${item.name}`);

  const fav = isFavorite(item.id);
  const media = document.createElement('div');
  media.className = 'product-card__media';
  media.innerHTML =
    (item.image ? `<img src="${item.image}" alt="" loading="lazy">` : '') +
    `<div class="product-card__fallback"${item.image ? ' style="display:none"' : ''}>${item.icon || '🍽️'}</div>` +
    buildBadgeRow(item) +
    `<button type="button" class="product-card__fav${fav ? ' is-favorite' : ''}" aria-label="${fav ? 'Remove' : 'Add'} ${item.name} ${fav ? 'from' : 'to'} favorites">${fav ? '♥' : '♡'}</button>`;
  card.appendChild(media);

  if(item.image){
    const img = media.querySelector('img');
    img.addEventListener('error', () => {
      img.style.display = 'none';
      media.querySelector('.product-card__fallback').style.display = 'flex';
    });
  }

  const info = document.createElement('div');
  info.className = 'product-card__info';
  info.innerHTML =
    `<div class="product-card__name">${highlightMatch(item.name, query)}</div>` +
    `<div class="product-card__desc">${highlightMatch(item.description || '', query)}</div>` +
    buildRatingRow(item) +
    `<div class="product-card__bottom"><span class="product-card__price">${formatNaira(item.price)}</span></div>`;
  card.appendChild(info);

  info.querySelector('.product-card__bottom').appendChild(
    (item.available === false) ? Object.assign(document.createElement('span'), { className: 'product-card__unavailable', textContent: 'Sold out' })
    : buildAddOrStepper(item.id)
  );

  media.querySelector('.product-card__fav').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  });

  // Belt-and-suspenders: buildAddBtn/buildStepper's own buttons (see
  // js/ui.js) already call stopPropagation(), same as the favorite
  // button above, so in practice this handler never even sees clicks
  // that originated on either control — this closest() guard is a
  // deliberate second line of defense, not dead code, in case that
  // invariant ever changes on one side without the other.
  card.addEventListener('click', (e) => {
    if(e.target.closest('.product-card__fav, .add-btn, .qty-stepper')) return;
    openProductModal(item.id);
  });
  card.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openProductModal(item.id); }
  });

  return card;
}

function buildAddOrStepper(id){
  const wrap = document.createElement('div');
  wrap.className = 'product-card__action';
  const qty = Store.state.cart[id] || 0;
  wrap.appendChild(qty > 0 ? buildStepper(id) : buildAddBtn(id));
  return wrap;
}

function emptyStateMessage(){
  const query = getSearchQuery();
  const cat = getActiveCategory();
  if(query && cat) return `No dishes match "${escapeHtml(query)}" in ${escapeHtml(cat)}.`;
  if(query) return `No dishes match "${escapeHtml(query)}".`;
  if(cat) return `Nothing available in ${escapeHtml(cat)} right now.`;
  return 'No dishes available right now.';
}

/** PHASE 4. Plain placeholder cards, same grid classes/sizing as a
    real product-card (see css/product-grid.css's ".product-card--
    skeleton" rule) so the grid doesn't reflow/jump once real content
    replaces them — "avoid layout shifts" (spec section 14). Six is a
    reasonable guess at "about one screenful" on both the mobile and
    desktop grid; it doesn't need to match the real eventual count,
    since real cards replace the whole grid wholesale the moment
    loadMenu() resolves (see js/app.js's init()), not one at a time. */
function buildSkeletonCard(){
  const card = document.createElement('div');
  card.className = 'product-card product-card--skeleton';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML =
    `<div class="product-card__media"></div>` +
    `<div class="product-card__info">` +
      `<div class="skeleton-line skeleton-line--title"></div>` +
      `<div class="skeleton-line skeleton-line--desc"></div>` +
      `<div class="skeleton-line skeleton-line--price"></div>` +
    `</div>`;
  return card;
}

/** PHASE 4 (spec section 2: "gracefully handle... Firestore errors").
    Only ever shown when Firebase IS configured but the fetch itself
    failed (js/menu-data.js's didMenuLoadFail) — an intentionally
    unconfigured project (today's default) shows nothing here, since
    there's no real problem to report, just this project's current
    setup state. */
function renderMenuLoadNotice(){
  const notice = document.getElementById('menuLoadNotice');
  if(!notice) return;
  if(didMenuLoadFail()){
    notice.textContent = "Showing our offline menu — having trouble reaching the kitchen right now.";
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
}

function renderProductGrid(){
  const grid = document.getElementById('productGrid');
  if(!grid) return;
  renderMenuLoadNotice();

  if(isMenuLoading()){
    grid.innerHTML = '';
    for(let i = 0; i < 6; i++) grid.appendChild(buildSkeletonCard());
    return;
  }

  const query = getSearchQuery();
  const items = getFilteredMenu(getMenu());
  grid.innerHTML = '';
  if(!items.length){
    grid.innerHTML = `<div class="product-grid__empty">${emptyStateMessage()}</div>`;
    return;
  }
  items.forEach(item => grid.appendChild(buildProductCard(item, query)));
}

function renderSuggestions(){
  const dropdown = document.getElementById('menuSearchSuggestions');
  const input = document.getElementById('menuSearchInput');
  if(!dropdown || !input) return;
  const query = getSearchQuery();
  const hasFocus = document.activeElement === input;

  if(!hasFocus || !query){
    dropdown.hidden = true;
    dropdown.innerHTML = '';
    return;
  }
  const suggestions = getSearchSuggestions(getMenu(), 6);
  dropdown.innerHTML = '';
  if(!suggestions.length){
    dropdown.hidden = true;
    return;
  }
  dropdown.hidden = false;
  suggestions.forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'search-suggestion';
    row.innerHTML =
      `<span class="search-suggestion__icon">${item.icon || '🍽️'}</span>` +
      `<span class="search-suggestion__name">${highlightMatch(item.name, query)}</span>` +
      `<span class="search-suggestion__cat">${escapeHtml(item.category)}</span>`;
    // mousedown (not click) fires before the input's blur — needed so
    // the suggestion can act before the blur handler's renderSuggestions()
    // call would otherwise already have hidden this dropdown.
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      setSearchQuery(item.name);
      input.value = item.name;
      renderMenuList();
      input.blur();
    });
    dropdown.appendChild(row);
  });
}

/** The single entry point js/store.js's render() dispatcher and
    js/ui.js's openOrderModal() both call — rebuilds the category nav,
    product grid, and (if relevant) the suggestions dropdown from
    current state. Safe/cheap to call on every state change: it always
    fully rebuilds via innerHTML='' first, the same pattern the rest of
    this codebase already uses for the cart view and the old menu list. */
export function renderMenuList(){
  renderCategoryNav();
  renderProductGrid();
  renderSuggestions();
}

/** One-time wiring for the search input — called once from app.js's
    init(), NOT from renderMenuList(), because the input element itself
    must never be torn down/recreated (that would drop keyboard focus
    and cursor position on every keystroke). Only its surrounding
    dropdown/grid content re-renders reactively. */
export function initMenuBrowse(){
  const input = document.getElementById('menuSearchInput');
  if(!input) return;

  input.addEventListener('input', () => {
    setSearchQuery(input.value);
    renderProductGrid();
    renderSuggestions();
  });
  input.addEventListener('focus', renderSuggestions);
  input.addEventListener('blur', () => setTimeout(renderSuggestions, 0));
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      e.stopPropagation(); // don't also close the order modal underneath
      input.value = '';
      setSearchQuery('');
      input.blur();
      renderProductGrid();
      renderSuggestions();
    }
  });

  document.addEventListener('click', (e) => {
    if(!e.target.closest('.menu-toolbar')) renderSuggestions();
  });

  onFavoritesChanged(renderProductGrid);
  onLabelsChanged(renderProductGrid);
  onReviewsChanged(renderProductGrid); // [AUDIT FIX] — see buildRatingRow above
}

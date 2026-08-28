import { getMenuItemById, getMenu } from './menu-data.js';
import { isFavorite, toggleFavorite, onFavoritesChanged } from './favorites.js';
import { Store } from './store.js';
import { buildAddBtn, buildStepper, syncBodyScrollLock } from './ui.js';
import { formatNaira, starsHtml } from './utils.js';
import { BRAND_NAME } from './config.js';
import { renderReviewsSection } from './reviews-ui.js';
import { getActiveLabelNamesForItem, onLabelsChanged } from './labels-data.js';
import { getItemAggregate, onReviewsChanged } from './reviews-store.js';

/* ============================================================
   PHASE 3. Product Details modal — opened by clicking anywhere on a
   product card (js/menu-render.js) except its favorite/add-to-cart
   controls, or a related-item card within this same modal (which just
   re-opens itself for the new id).

   Reuses the order/auth/contact modals' own overlay/modal chrome
   classes (see css/order-modal.css) rather than inventing new ones —
   same convention the auth modal already followed in Phase 2. Stacks
   ON TOP of whichever modal it was opened from (order modal while
   browsing, or nothing if opened some other way) via a higher z-index
   in CSS; app.js's Escape/backdrop-click wiring checks this overlay
   first for exactly that reason.

   Circular import note: this file imports buildAddBtn/buildStepper/
   syncBodyScrollLock from ui.js, and js/auth-ui.js imports
   openProductModal from HERE (so a favorited item in the account view
   can open its details) — safe by the same "nothing runs at module
   top-level" reasoning as every other cycle in this codebase.

   POST-PHASE-3 DESKTOP REDESIGN: added a large in-body heading, a
   feature-pills row (favorite + the same Signature/Best Seller/
   Popular/New flags renderBadges() already put on the image, just
   also as pills), a conditional meta-info grid, and a static trust
   row — see css/product-modal.css's header comment for the full
   reasoning and, importantly, which of these fields are REAL data
   (category, availability, restaurant name — all already existed)
   vs. fields that don't exist in the schema yet (prep time, spice
   level, calories/serving) and so are rendered conditionally, never
   with invented values. Every one of these new elements is CSS-hidden
   below 1024px (see css/product-modal.css/css/responsive.css) — the
   mobile product modal is completely unchanged; this file always
   populates them regardless of viewport (cheap, and means they're
   correct the instant a viewport crosses the breakpoint, no re-render
   needed).
   ================================================================ */

let currentItemId = null;
// [AUDIT FIX] Unsubscribe handle for the currently-mounted reviews
// section's own onReviewsChanged() listener (see reviews-ui.js's
// renderReviewsSection). Must be torn down before subscribing a new
// one — otherwise a previous item's listener would keep repainting
// productReviews with the WRONG item's data every time any review
// anywhere changes.
let unsubscribeReviews = null;

/* PHASE 4 (Badge/Label consolidation). Both this and renderPills below
   now resolve item.labels through js/labels-data.js's live cache — the
   isSignature/isBestSeller/isPopular/isNew booleans they used to read
   no longer exist on any item once admin/js/admin-taxonomy.js's legacy
   migration has run. See js/menu-render.js's buildBadgeRow for the same
   change on the customer product-grid cards. */
function renderBadges(item){
  const wrap = document.getElementById('productBadges');
  if(!wrap) return;
  wrap.innerHTML = '';
  getActiveLabelNamesForItem(item).forEach(label => {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = label;
    wrap.appendChild(span);
  });
}

/** Desktop-only feature-pills row: the same favorite/badge signals
    renderBadges() shows on the image, just repeated here as labeled
    pills — the reference layout this redesign follows shows both (a
    corner badge on the photo AND a pill near the heading), not one
    replacing the other. Rebuilt fresh each open (like renderBadges);
    the favorite pill's live state is kept in sync afterwards by
    renderFavoriteButton() below, same as the existing overlay button. */
// Decorative icon for the four labels this project shipped with — purely
// cosmetic continuity with the old hardcoded pills. Any OTHER label a
// staff member creates later in the admin Labels tab still renders fine,
// just with the generic 🏷️ icon instead of a bespoke one.
const PILL_ICONS = { 'Signature': '⭐', 'Best Seller': '🏆', 'Popular': '🔥', 'New': '✨' };

function renderPills(item){
  const wrap = document.getElementById('productPills');
  if(!wrap) return;
  wrap.innerHTML = '';

  const favPill = document.createElement('button');
  favPill.type = 'button';
  favPill.id = 'productFavPill';
  favPill.className = 'feature-pill feature-pill--fav';
  favPill.addEventListener('click', () => toggleFavorite(item.id));
  wrap.appendChild(favPill);

  getActiveLabelNamesForItem(item).forEach(name => {
    const pill = document.createElement('span');
    pill.className = 'feature-pill';
    pill.textContent = `${PILL_ICONS[name] || '🏷️'} ${name}`;
    wrap.appendChild(pill);
  });
}

/** Desktop-only meta-info grid. Category/Availability/Restaurant are
    real, always-present data (item.category, item.available,
    js/config.js's BRAND_NAME) so they always render. Prep time/spice
    level/calories/serving size do NOT exist anywhere in this
    project's schema (see data/menu.sample.js) — rather than invent
    plausible-looking values, each only renders if the field is
    actually present on the item, so today's menu (none of which has
    these fields) simply shows a shorter grid. The moment a future
    phase adds e.g. `prepTime` to a menu document, it appears here
    with zero code changes. */
function renderMetaGrid(item){
  const grid = document.getElementById('productMetaGrid');
  if(!grid) return;

  const cells = [
    { icon: '🍽️', label: 'Category', value: item.category },
    { icon: '✅', label: 'Availability', value: item.available === false ? 'Currently unavailable' : 'Available now' },
    { icon: '🏠', label: 'Restaurant', value: BRAND_NAME }
  ];
  if(item.prepTime) cells.push({ icon: '⏱️', label: 'Prep Time', value: item.prepTime });
  if(item.spiceLevel) cells.push({ icon: '🌶️', label: 'Spice Level', value: item.spiceLevel });
  if(item.calories) cells.push({ icon: '🔥', label: 'Calories', value: item.calories + ' kcal' });
  else if(item.servingSize) cells.push({ icon: '🍴', label: 'Serving', value: item.servingSize });

  grid.innerHTML = cells.map(c =>
    `<div class="meta-cell">` +
      `<span class="meta-cell__icon">${c.icon}</span>` +
      `<div class="meta-cell__text"><span class="meta-cell__label">${c.label}</span><span class="meta-cell__value">${c.value}</span></div>` +
    `</div>`
  ).join('');
}

/* PHASE 4 (Remove hardcoded ratings). [AUDIT FIX] This used to read
   item.rating/item.reviewCount straight off the menu item document —
   fields that were themselves recomputed by js/reviews-data.js after a
   customer review write, and so went stale the moment a review was
   instead hidden/restored/deleted through admin moderation, which never
   recomputed them (see js/reviews-store.js's header comment for the
   full root-cause writeup). There is no field left to go stale: rating
   and review count are now calculated fresh, straight from the live
   `reviews` collection, on every call. A genuinely-unreviewed item
   reports reviewCount 0, so it gets the same empty-state copy
   js/reviews-ui.js's per-item review list already uses, rather than a
   misleading "★ 0.0 (0 reviews)". */
function renderRating(item){
  const wrap = document.getElementById('productRating');
  if(!wrap) return;
  const { rating, reviewCount } = getItemAggregate(item.id);
  if(!reviewCount){
    wrap.innerHTML = `${starsHtml(0, 'on-light')}<span class="rating-count">No reviews yet — be the first to review</span>`;
    return;
  }
  wrap.innerHTML =
    starsHtml(rating, 'on-light') +
    `<span class="rating-num">${rating.toFixed(1)}</span>` +
    `<span class="rating-count">(${reviewCount} review${reviewCount === 1 ? '' : 's'})</span>`;
}

/** Updates both favorite entry points — the overlay heart on the
    image (unchanged from Phase 3) and the new feature-pill (desktop
    only, but harmless/inert to update even while hidden). Both call
    the exact same toggleFavorite()/isFavorite() from js/favorites.js;
    this function is the one place that keeps their DISPLAYED state in
    sync, not two independent copies of the same logic. */
function renderFavoriteButton(item){
  const fav = isFavorite(item.id);

  const btn = document.getElementById('productFavBtn');
  if(btn){
    btn.textContent = fav ? '♥' : '♡';
    btn.classList.toggle('is-favorite', fav);
    btn.setAttribute('aria-label', fav ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`);
  }

  const pill = document.getElementById('productFavPill');
  if(pill){
    pill.textContent = (fav ? '♥' : '♡') + ' Favorite';
    pill.classList.toggle('is-favorite', fav);
  }
}

function renderHero(item){
  const img = document.getElementById('productHeroImg');
  const fallback = document.getElementById('productHeroFallback');
  if(!img || !fallback) return;
  fallback.textContent = item.icon || '🍽️';
  if(item.image){
    img.src = item.image;
    img.alt = item.name;
    img.style.display = '';
    fallback.style.display = 'none';
    img.onerror = () => { img.style.display = 'none'; fallback.style.display = 'flex'; };
  } else {
    img.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

function renderQty(item){
  const wrap = document.getElementById('productQtyWrap');
  if(!wrap) return;
  wrap.innerHTML = '';
  const qty = Store.state.cart[item.id] || 0;
  wrap.appendChild(qty > 0 ? buildStepper(item.id) : buildAddBtn(item.id));
}

function renderRelated(item){
  const wrap = document.getElementById('productRelated');
  if(!wrap) return;
  const related = getMenu().filter(i => i.category === item.category && i.id !== item.id).slice(0, 4);
  wrap.innerHTML = '';
  if(!related.length){
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const heading = document.createElement('h4');
  heading.textContent = 'You might also like';
  wrap.appendChild(heading);
  const row = document.createElement('div');
  row.className = 'product-related__row';
  related.forEach(r => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'product-related__card';
    card.innerHTML =
      (r.image ? `<img src="${r.image}" alt="" loading="lazy">` : `<div class="product-related__fallback">${r.icon || '🍽️'}</div>`) +
      `<div class="product-related__name">${r.name}</div>` +
      `<div class="product-related__price">${formatNaira(r.price)}</div>`;
    card.addEventListener('click', () => openProductModal(r.id));
    row.appendChild(card);
  });
  wrap.appendChild(row);
}

/** Re-renders everything that can change without re-opening the modal
    (favorite state, cart qty, rating summary). Cheap no-op while the
    modal is closed (guarded on currentItemId), so js/store.js's central
    render() can call this on EVERY state change unconditionally — the
    same way it already unconditionally calls updateCartBadge()/
    renderMenuList()/renderCartView() — rather than needing to know
    whether the product modal happens to be the thing currently open.
    Also registered on favorites/labels/reviews changes below, since
    those don't otherwise touch Store.state and so wouldn't reach here
    via store.js at all. The [AUDIT FIX] reviews-store.js subscription
    is what keeps the top rating summary live even when the change came
    from Admin Reviews in a different tab, not from this modal's own
    review form. */
export function refreshProductModalIfOpen(){
  if(!currentItemId) return;
  const item = getMenuItemById(currentItemId);
  if(!item) return;
  renderFavoriteButton(item);
  renderQty(item);
  renderBadges(item);
  renderPills(item);
  renderRating(item);
}

export async function openProductModal(itemId){
  const item = getMenuItemById(itemId);
  if(!item) return;
  currentItemId = itemId;

  document.getElementById('productModalTitle').textContent = item.name;
  document.getElementById('productHeading').textContent = item.name;
  renderHero(item);
  renderBadges(item);
  renderPills(item);
  renderRating(item);
  renderFavoriteButton(item);
  document.getElementById('productDesc').textContent = item.description || '';
  renderMetaGrid(item);
  document.getElementById('productPrice').textContent = formatNaira(item.price);
  renderQty(item);
  renderRelated(item);

  document.getElementById('productOverlay')?.classList.add('open');
  syncBodyScrollLock();
  const body = document.getElementById('productModalBody');
  if(body) body.scrollTop = 0;

  // [AUDIT FIX] Tear down the previous item's live reviews listener (if
  // any) before mounting this one — see the unsubscribeReviews comment
  // above. No separate "refresh the rating summary" callback needed
  // here anymore: refreshProductModalIfOpen() is already subscribed to
  // every review change below (initProductModal), so the top summary
  // stays live on its own.
  if(unsubscribeReviews){ unsubscribeReviews(); unsubscribeReviews = null; }
  unsubscribeReviews = renderReviewsSection(itemId, document.getElementById('productReviews'));
}

export function closeProductModal(){
  document.getElementById('productOverlay')?.classList.remove('open');
  syncBodyScrollLock();
  currentItemId = null;
  if(unsubscribeReviews){ unsubscribeReviews(); unsubscribeReviews = null; }
}

export function initProductModal(){
  document.getElementById('productCloseBtn')?.addEventListener('click', closeProductModal);
  document.getElementById('productFavBtn')?.addEventListener('click', () => {
    if(currentItemId) toggleFavorite(currentItemId);
  });
  onFavoritesChanged(refreshProductModalIfOpen);
  onLabelsChanged(refreshProductModalIfOpen);
  onReviewsChanged(refreshProductModalIfOpen);
}

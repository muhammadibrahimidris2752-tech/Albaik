/* ============================================================
   Entry point. The only file that:
     1. Sequences startup — loads the menu before anything might
        try to render it (see the await below), sidestepping the
        same load-order hazard the reference project's app.js
        documents for its own Store.state init. PHASE 3 added one
        more startup-order step: pruneCartToExistingItems() runs
        right after loadMenu(), since the cart can now be restored
        from localStorage (see js/store.js) and needs the real menu
        loaded first to check its ids against — see that function's
        own header comment in js/cart.js.

        PHASE 4: exposeOnclickBridge()/wireStaticControls() and every
        initX() call used to run AFTER awaiting loadMenu(). That was
        harmless while loadMenu() resolves near-instantly (true of
        every session so far — no real Firebase project has ever been
        configured in this environment, see js/firebase.js), but
        against a REAL project loadMenu() is a genuine network round
        trip, and a customer tapping "Order Now" during that window
        would have hit onclick="openOrderModal()" with no such
        function on window yet. That's exactly the kind of "made it
        real, but broke production" gap this phase exists to close —
        see init() below for the reordering. Nothing that now runs
        before the loadMenu() await actually depends on menu data:
        opening the order modal early just shows js/menu-render.js's
        loading skeleton (its own header comment) instead of silently
        doing nothing, and every initX() call below only registers
        event listeners.
     2. Bridges ES module scope to the window global — but ONLY for
        the small set of functions still referenced by onclick=""
        attributes baked into index.html's static markup (the modal
        open/close buttons, back links, etc.). Every dynamically
        generated element (menu items, cart lines, upsell chips,
        product cards, category pills, favorite hearts...) already
        wires its own listeners directly via addEventListener and
        needs no bridge. This mirrors the reference project's app.js
        exactly, and for the same reason: rewriting those onclick=""
        attributes to addEventListener would be a behavioural change
        to review, not a pure reorganization — so this project leaves
        them exactly as they were, and every new control added since
        (Phase 2's auth modal, Phase 3's product modal/menu grid,
        Phase 4's account-view sections) has followed addEventListener
        from the start instead of growing the onclick="" set further.
   ================================================================ */
import { loadMenu } from './menu-data.js';
import { updateCartBadge, openOrderModal, closeOrderModal, goToCart, showView,
         initRevealOnScroll, initMobileNav, initCartAddressSync, initCheckoutZonePicker } from './ui.js';
import { openContactSheet, closeContactSheet } from './contact.js';
import { setFulfilmentType, setPaymentMethod, continueToPayment, placeOrder, resetOrder } from './order.js';
import { openTrackingForOrder, stopTracking, initOrderTracking } from './order-tracking.js';
import { copyToClipboard } from './utils.js';
import { PHONE_DISPLAY } from './config.js';
import { initRestaurantSettings, getBankDetails } from './restaurant-settings.js';
import { closeAuthModal, initAuthUI } from './auth-ui.js';
import { initAuthForms } from './auth-forms.js';
import { pruneCartToExistingItems } from './cart.js';
import { initFavorites } from './favorites.js';
import { initAddresses } from './addresses.js';
import { initOrderHistory } from './order-history.js';
import { initOrderHistoryUI } from './order-history-ui.js';
import { initMenuBrowse, renderMenuList } from './menu-render.js';
import { closeProductModal, initProductModal } from './product-modal.js';
import { initConnectivityBanner } from './toast.js';
import { initLabelsData } from './labels-data.js';
import { initDeliveryZonesData } from './delivery-zones-data.js';
import { initSiteReviews } from './site-reviews.js';
import { startReviewsStore } from './reviews-store.js';

/** Bridges continueToPayment() → placeOrder() → tracking view. Kept
    here rather than in order.js since it orchestrates across three
    modules (order, order-tracking, ui) — exactly the kind of
    cross-module glue app.js is for.

    PHASE 6: openTrackingForOrder(order) no longer takes a justPlaced
    option — see js/order-tracking.js's header comment for why (the
    client-side status-auto-advance stand-in it used to gate is gone
    now that the admin Orders Dashboard provides real staff-driven
    updates). This call site and js/order-history-ui.js's Track button
    are now identical one-argument calls. */
async function handleConfirmPayment(){
  const order = await placeOrder();
  if(!order) return;
  openTrackingForOrder(order);
  showView('tracking');
}

/** Bridges the "Start a New Order" tap on the tracking view → a full,
    clean restart. Same reasoning as handleConfirmPayment() above for
    why this lives here and not in order.js: it orchestrates across
    order, order-tracking, and ui, not just one of them.

    Order matters here and matches the reported bug's expected
    behaviour exactly: close the finished tracking view first, cancel
    its local DOM-simulation timers if any are still running (normally
    already finished by the time this button is even visible — see
    order-tracking.js's own comment — but cheap insurance costs
    nothing; PHASE 4: this deliberately does NOT cancel a still-in-
    flight real-status auto-advance scheduler for the order just
    finished, since those timers are keyed to that order's own id and
    complete independently of whatever view is currently open — see
    order-tracking.js's header comment on that distinction), reset the
    cart/fulfilment/payment/address state that resetOrder() owns, then
    reopen the modal, which itself lands on a freshly-rendered menu
    view (see ui.js's openOrderModal()). The cart is normally already
    empty by this point (placeOrder() clears it on success — see
    order.js) — resetOrder()'s own cart-clear here is just the same
    belt-and-suspenders reset it's always done, not new behaviour. */
function handleNewOrder(){
  closeOrderModal();
  stopTracking();
  resetOrder();
  openOrderModal();
}

function wireStaticControls(){
  document.getElementById('typeDelivery')?.addEventListener('click', () => setFulfilmentType('delivery'));
  document.getElementById('typePickup')?.addEventListener('click', () => setFulfilmentType('pickup'));
  document.getElementById('payTransfer')?.addEventListener('click', () => setPaymentMethod('transfer'));
  document.getElementById('payCash')?.addEventListener('click', () => setPaymentMethod('cash'));
  document.getElementById('newOrderBtn')?.addEventListener('click', handleNewOrder);

  document.getElementById('copyAcctBtn')?.addEventListener('click', function(){
    copyToClipboard(getBankDetails().accountNumber, this);
  });
  document.getElementById('copyPhoneBtn')?.addEventListener('click', function(){
    copyToClipboard(PHONE_DISPLAY, this);
  });

  document.getElementById('orderOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'orderOverlay') closeOrderModal();
  });
  document.getElementById('contactOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'contactOverlay') closeContactSheet();
  });
  document.getElementById('authOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'authOverlay') closeAuthModal();
  });
  // PHASE 3: the product modal can be opened from inside the order
  // modal (a card tap while browsing) or, via the account view's
  // favorites list, from inside the auth modal — either way it's the
  // topmost overlay whenever it's open, so it's checked FIRST below.
  document.getElementById('productOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'productOverlay') closeProductModal();
  });

  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    const productOv = document.getElementById('productOverlay');
    const orderOv = document.getElementById('orderOverlay');
    const contactOv = document.getElementById('contactOverlay');
    const authOv = document.getElementById('authOverlay');
    if(productOv?.classList.contains('open')) closeProductModal();
    else if(authOv?.classList.contains('open')) closeAuthModal();
    else if(contactOv?.classList.contains('open')) closeContactSheet();
    else if(orderOv?.classList.contains('open')) closeOrderModal();
  });
}

function exposeOnclickBridge(){
  Object.assign(window, {
    openOrderModal,
    closeOrderModal,
    openContactSheet,
    closeContactSheet,
    goToCart,
    showView,
    continueToPayment,
    confirmPaymentAndPlaceOrder: handleConfirmPayment
  });
}

async function init(){
  exposeOnclickBridge();
  wireStaticControls();
  initAuthUI();
  initAuthForms();
  initFavorites();
  initAddresses();
  initOrderHistory();
  initOrderHistoryUI();
  // PHASE 4 (Badge/Label consolidation, Delivery Zone checkout
  // redesign). Both are live Firestore-or-offline-fallback caches with
  // the exact same "not awaited, renders whatever it has so far and
  // re-renders via its own onXChanged() once real data arrives" shape
  // as initFavorites()/initAddresses() above — see js/labels-data.js
  // and js/delivery-zones-data.js's own header comments.
  initLabelsData();
  initDeliveryZonesData();
  // [AUDIT FIX] Same shape again: THE one live `reviews` listener for
  // this page, started once, here, early — every review consumer
  // (menu cards, product modal, homepage via initSiteReviews() below)
  // just reads js/reviews-store.js's getters and registers
  // onReviewsChanged() from here on; none of them call this
  // themselves. Public-read data (see firestore.rules), so — unlike
  // admin/js/admin-app.js's equivalent call — this needs no auth gate.
  startReviewsStore();
  initMenuBrowse();
  initCartAddressSync();
  initCheckoutZonePicker();
  initProductModal();
  initOrderTracking();
  initRevealOnScroll();
  initMobileNav();
  initConnectivityBanner();
  // PHASE 4 (Remove hardcoded ratings/testimonials). Paints the
  // homepage's empty-state rating/reviews immediately, then upgrades
  // live once (if) real review data arrives via startReviewsStore()
  // above — see js/site-reviews.js's own header comment.
  initSiteReviews();
  // PHASE 4 (Admin Dashboard): this module existed before this phase
  // but had no caller anywhere in the project — see its own header
  // comment. Not awaited, same as the other initX() subscriptions
  // above: getDeliveryFee()/getBankDetails() (js/order.js, js/ui.js,
  // js/app.js) fall back to config.js's defaults on every call until
  // the first snapshot arrives, and by the time a customer reaches
  // checkout that will almost always already have happened.
  initRestaurantSettings();

  await loadMenu(); // no longer near-instant once a real Firebase project is configured — see js/menu-data.js's isMenuLoading()
  pruneCartToExistingItems(); // see its own header comment in js/cart.js
  updateCartBadge();
  renderMenuList(); // PHASE 4: explicit re-render now that real data has arrived — pruneCartToExistingItems() above only triggers one itself (via setState()) when the restored cart actually changes, which isn't guaranteed; the menu grid needs to leave its loading skeleton either way.
}

document.addEventListener('DOMContentLoaded', init);

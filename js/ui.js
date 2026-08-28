import { Store } from './store.js';
import { getMenu } from './menu-data.js';
import { getCartLines, getCartCount, getCartSubtotal, changeQty, removeFromCart } from './cart.js';
import { formatNaira } from './utils.js';
import { renderMenuList } from './menu-render.js';
import { getCurrentUser, getCurrentUserProfile } from './auth.js';
import { getSavedAddresses, getDefaultAddress, onAddressesChanged } from './addresses.js';
import { getZoneById, onDeliveryZonesChanged, resolveDeliveryFee } from './delivery-zones-data.js';
import { createZoneSearchField } from './zone-picker.js';

/* ============================================================
   Order-modal chrome (open/close, scroll lock, view switching) and
   the cart view. The menu/browse view's own rendering (search,
   category nav, product-card grid) moved to js/menu-render.js in
   Phase 3 — see that file's header comment — since it grew into a
   whole feature area of its own; this file keeps the cart, since
   cart-line rendering shares buildStepper() with the product grid
   (exported below) and the payment/tracking hand-off lives right
   next to it either way.

   Circular import note: store.js imports updateCartBadge/
   renderCartView from here and renderMenuList from menu-render.js;
   this file imports Store from store.js AND renderMenuList from
   menu-render.js, which in turn imports buildStepper/buildAddBtn
   back from here. Safe, same reasoning as the pre-existing store.js
   ↔ ui.js cycle: nothing below runs at module top-level, only from
   inside functions called after the whole module graph has loaded.
   ================================================================ */

/* ============ MODAL CHROME ============ */
function anyOverlayOpen(){
  return ['orderOverlay', 'contactOverlay', 'authOverlay', 'productOverlay'].some(id => {
    const el = document.getElementById(id);
    return el && el.classList.contains('open');
  });
}
export function syncBodyScrollLock(){
  document.body.style.overflow = anyOverlayOpen() ? 'hidden' : '';
}

export function openOrderModal(){
  document.getElementById('orderOverlay').classList.add('open');
  syncBodyScrollLock();
  showView('menu');
  renderMenuList();
}
export function closeOrderModal(){
  document.getElementById('orderOverlay').classList.remove('open');
  syncBodyScrollLock();
}

export function showView(name){
  ['menu', 'cart', 'payment', 'tracking'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if(el) el.classList.toggle('active', v === name);
  });

  const titleMap = { menu: 'Order Online', cart: 'Your Cart', payment: 'Payment', tracking: 'Order Status' };
  const title = document.getElementById('modalViewTitle');
  if(title) title.textContent = titleMap[name] || 'Order Online';

  const cartIcon = document.getElementById('modalCartBtn');
  if(cartIcon) cartIcon.style.display = name === 'tracking' ? 'none' : 'flex';

  const footer = document.getElementById('modalFooter');
  const viewCartBtn = document.getElementById('viewCartBtn');
  const continueBtn = document.getElementById('continueBtn');
  const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
  viewCartBtn.style.display = 'none';
  continueBtn.style.display = 'none';
  confirmPaymentBtn.style.display = 'none';

  if(name === 'menu'){
    footer.style.display = 'block'; viewCartBtn.style.display = 'flex';
  } else if(name === 'cart'){
    footer.style.display = 'block'; continueBtn.style.display = 'flex';
  } else if(name === 'payment'){
    footer.style.display = 'block'; confirmPaymentBtn.style.display = 'flex';
  } else {
    footer.style.display = 'none';
  }

  // PHASE 3 — desktop layout hook (see css/responsive.css's min-width:1024px
  // block). On desktop the menu+cart views render side-by-side in a
  // two-column layout rather than one-at-a-time, EXCEPT during the
  // focused single-column payment/tracking steps. This class is the one
  // thing that tells that CSS which mode applies; it has zero effect
  // below the desktop breakpoint, so mobile/tablet behaviour (and every
  // .active toggle above) is completely unchanged.
  document.getElementById('orderOverlay')?.classList.toggle('order-focused', name === 'payment' || name === 'tracking');

  if(name === 'cart') renderCartView();
}

export function goToCart(){
  renderCartView();
  showView('cart');
}

/* ============ CART BADGE ============ */
export function updateCartBadge(){
  const n = getCartCount();
  ['navCartBadge', 'modalCartBadge'].forEach(id => {
    const badge = document.getElementById(id);
    if(!badge) return;
    badge.textContent = n;
    badge.hidden = n === 0;
  });
  const footerCount = document.getElementById('footerCount');
  const footerSubtotal = document.getElementById('footerSubtotal');
  if(footerCount) footerCount.textContent = n;
  if(footerSubtotal) footerSubtotal.textContent = formatNaira(getCartSubtotal());
}

/* ============ SHARED QTY CONTROLS ============
   Exported: js/menu-render.js's product cards (and product-modal.js's
   quantity selector) use the exact same stepper/add-button the cart
   view always has, rather than re-implementing it — one control, one
   place its click behaviour can ever be wrong. */
export function buildAddBtn(id){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-btn';
  btn.textContent = 'Add';
  btn.addEventListener('click', (e) => { e.stopPropagation(); changeQty(id, 1); });
  return btn;
}
export function buildStepper(id){
  const wrap = document.createElement('div');
  wrap.className = 'qty-stepper';
  const minus = document.createElement('button');
  minus.type = 'button'; minus.textContent = '–'; minus.setAttribute('aria-label', 'Remove one');
  minus.addEventListener('click', (e) => { e.stopPropagation(); changeQty(id, -1); });
  const num = document.createElement('span');
  num.className = 'qty-num';
  num.textContent = Store.state.cart[id] || 0;
  const plus = document.createElement('button');
  plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Add one more');
  plus.addEventListener('click', (e) => { e.stopPropagation(); changeQty(id, 1); });
  wrap.appendChild(minus); wrap.appendChild(num); wrap.appendChild(plus);
  return wrap;
}

/* ============ CART VIEW ============ */
function renderUpsell(){
  const row = document.getElementById('upsellRow');
  const wrap = document.getElementById('upsellBlock');
  if(!row || !wrap) return;
  if(!Object.keys(Store.state.cart).length){ wrap.style.display = 'none'; return; }
  const suggestions = getMenu().filter(m => !Store.state.cart[m.id] && (m.category === 'Drinks' || m.category === 'Sides')).slice(0, 3);
  if(!suggestions.length){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  row.innerHTML = '';
  suggestions.forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'upsell-chip';
    chip.innerHTML = `<span class="em">${item.icon}</span> Add ${item.name} · ${formatNaira(item.price)}`;
    chip.addEventListener('click', () => changeQty(item.id, 1));
    row.appendChild(chip);
  });
}

function renderFulfilmentAndTotals(){
  const fulfilmentType = Store.state.fulfilmentType;
  document.getElementById('typeDelivery')?.classList.toggle('active', fulfilmentType === 'delivery');
  document.getElementById('typePickup')?.classList.toggle('active', fulfilmentType === 'pickup');
  // PHASE 4 (Delivery Zone checkout redesign). Three fields now show
  // together for delivery — zone, detailed address, phone — replacing
  // the old single addressField toggle; all three share the exact same
  // show/hide pattern the old single field used.
  const isDelivery = fulfilmentType === 'delivery';
  ['deliveryZoneField', 'addressField', 'deliveryPhoneField'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = isDelivery ? 'block' : 'none';
  });
  // PHASE 4 (spec section 6: "Validate pickup information") — same
  // show/hide pattern as the delivery fields above, just the other
  // fulfilment type. See js/order.js's continueToPayment() for the
  // matching validation and css/order-modal.css's header comment for
  // why this needed zero new CSS (#pickupPhoneField reuses
  // .address-field as-is).
  const pickupPhoneField = document.getElementById('pickupPhoneField');
  if(pickupPhoneField) pickupPhoneField.style.display = fulfilmentType === 'pickup' ? 'block' : 'none';

  renderSavedAddressPicker(fulfilmentType);
  renderSaveAddressCheckbox(fulfilmentType);
  prefillContactFields(fulfilmentType);

  // PHASE 4 (Delivery Zone checkout redesign). "Delivery fee must come
  // automatically from the selected Delivery Zone. No hardcoded
  // delivery prices." — resolveDeliveryFee() is the one function this
  // AND js/order.js's actual order object both call, so the displayed
  // total and the charged total can never disagree (see that
  // function's own comment for its fallback order).
  const selection = getCheckoutZoneSelection();
  const selectedZoneFee = selection ? getZoneById(selection.id)?.fee : null;
  const estimatedFee = resolveDeliveryFee(selection?.id);
  const feeSub = document.getElementById('deliveryFeeSub');
  if(feeSub) feeSub.textContent = selectedZoneFee != null ? `+ ${formatNaira(selectedZoneFee)} fee` : `from ${formatNaira(estimatedFee)}`;

  const subtotal = getCartSubtotal();
  const fee = isDelivery ? estimatedFee : 0;
  document.getElementById('subtotalVal').textContent = formatNaira(subtotal);
  const feeRow = document.getElementById('feeRow');
  if(feeRow) feeRow.style.display = isDelivery ? 'flex' : 'none';
  document.getElementById('feeVal').textContent = formatNaira(fee);
  document.getElementById('totalVal').textContent = formatNaira(subtotal + fee);
  document.getElementById('continueBtn').disabled = subtotal === 0;
}

/** PHASE 4 (Delivery Zone checkout redesign). Created once, lazily,
    the first time checkout actually needs it (initCheckoutZonePicker,
    called from app.js's init) rather than at module load — every other
    DOM-touching setup in this app waits for a call from init() too,
    since module top-level code runs before there's any guarantee the
    static markup it targets has been parsed yet. */
let checkoutZoneField = null;

export function initCheckoutZonePicker(){
  if(checkoutZoneField) return;
  checkoutZoneField = createZoneSearchField({
    inputId: 'deliveryZoneInput',
    suggestionsId: 'deliveryZoneSuggestions',
    onSelect: () => {
      document.getElementById('deliveryZoneField')?.classList.remove('error');
      renderFulfilmentAndTotals();
    }
  });
  onDeliveryZonesChanged(renderFulfilmentAndTotals);
}

/** The checkout's current zone selection, or null — read by
    js/order.js when validating and building the order object, and by
    renderFulfilmentAndTotals() above for the live fee estimate. */
export function getCheckoutZoneSelection(){
  if(!checkoutZoneField) return null;
  const id = checkoutZoneField.getSelectedZoneId();
  return id ? { id, name: checkoutZoneField.getSelectedZoneName() } : null;
}

/** Clears the checkout zone field's selection AND its visible text —
    used by js/order.js's resetOrder() after an order is placed. Goes
    through the picker's own clear() rather than setting
    #deliveryZoneInput.value directly, so the widget's internal
    selectedZoneId is cleared too; setting only the visible input would
    leave the picker still believing a zone is selected. */
export function clearCheckoutZoneSelection(){
  checkoutZoneField?.clear();
}

/** PHASE 4 (spec section 10: "Use saved addresses during checkout").
    A signed-in customer with 1+ saved addresses sees them as tappable
    chips above the delivery-zone field — picking one fills the zone,
    detailed address, and phone fields all at once (still freely
    editable after, not a rigid dropdown-only flow). Hidden entirely
    for guests, pickup orders, or a signed-in customer with no saved
    addresses yet — a picker with nothing to pick is just clutter.
    Re-rendered on every cart-view render AND whenever js/addresses.js's
    own list changes (see initCartAddressSync below) so adding/editing
    an address elsewhere updates this immediately. */
function renderSavedAddressPicker(fulfilmentType){
  const wrap = document.getElementById('savedAddressPicker');
  if(!wrap) return;
  const user = getCurrentUser();
  const list = (fulfilmentType === 'delivery' && user) ? getSavedAddresses() : [];
  if(!list.length){ wrap.hidden = true; wrap.innerHTML = ''; return; }

  wrap.hidden = false;
  wrap.innerHTML = '';
  list.forEach(addr => {
    // Backward-compatible: an address saved before this phase only has
    // the old single `.address` field — see js/addresses.js's header
    // comment on why those aren't migrated on write.
    const details = addr.addressDetails ?? addr.address ?? '';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'saved-address-chip';
    chip.textContent = (addr.isDefault ? '★ ' : '') + addr.label;
    chip.title = [addr.deliveryZoneName, details].filter(Boolean).join(' — ');
    chip.addEventListener('click', () => {
      if(addr.deliveryZoneId) checkoutZoneField?.setSelected(addr.deliveryZoneId, addr.deliveryZoneName || '');
      const addressInput = document.getElementById('addressInput');
      if(addressInput) addressInput.value = details;
      const phoneInput = document.getElementById('deliveryPhoneInput');
      if(phoneInput && addr.phoneNumber) phoneInput.value = addr.phoneNumber;
      document.getElementById('deliveryZoneField')?.classList.remove('error');
      document.getElementById('addressField')?.classList.remove('error');
      document.getElementById('deliveryPhoneField')?.classList.remove('error');
      renderFulfilmentAndTotals();
    });
    wrap.appendChild(chip);
  });
}

/** "Save this address for next time" only makes sense for a
    signed-in customer entering a delivery address — hidden for
    guests (nothing to save it to) and for pickup orders (no address
    field showing at all). */
function renderSaveAddressCheckbox(fulfilmentType){
  const wrap = document.getElementById('saveAddressCheckboxWrap');
  if(!wrap) return;
  wrap.hidden = !(fulfilmentType === 'delivery' && getCurrentUser());
}

/** Best-effort convenience, not a data source of truth: fills the
    delivery zone/address/phone from the customer's default saved
    address, or the pickup contact phone from their profile phone
    number, but ONLY while those fields are still empty — never
    overwrites something the customer already typed/selected.
    Deliberately simple rather than tracking "was this field touched
    yet" state: the only way this could re-fill a field the customer
    doesn't want prefilled is if they clear it back to empty
    themselves, at which point re-offering the same default is a
    reasonable, not harmful, guess. */
function prefillContactFields(fulfilmentType){
  const user = getCurrentUser();
  if(!user) return;

  if(fulfilmentType === 'delivery'){
    const def = getDefaultAddress();
    if(!def) return;
    if(!checkoutZoneField?.getSelectedZoneId() && def.deliveryZoneId){
      checkoutZoneField.setSelected(def.deliveryZoneId, def.deliveryZoneName || '');
    }
    const addressInput = document.getElementById('addressInput');
    const details = def.addressDetails ?? def.address ?? '';
    if(addressInput && details && !addressInput.value.trim()) addressInput.value = details;
    const phoneInput = document.getElementById('deliveryPhoneInput');
    if(phoneInput && def.phoneNumber && !phoneInput.value.trim()) phoneInput.value = def.phoneNumber;
  } else {
    const input = document.getElementById('pickupPhoneInput');
    const profile = getCurrentUserProfile();
    if(input && profile && profile.phoneNumber && !input.value.trim()) input.value = profile.phoneNumber;
  }
}

/** One-time wiring — call once from app.js's init(), same as every
    other initX() in this project. Keeps the saved-address picker
    live even when the cart view isn't the reason something changed
    (e.g. an address added/edited from the account view while the
    order modal happens to already be open behind it). */
export function initCartAddressSync(){
  onAddressesChanged(renderCartView);
}

export function renderCartView(){
  const listEl = document.getElementById('cartList');
  if(!listEl) return; // order modal not open / not in the DOM yet

  const lines = getCartLines();
  listEl.innerHTML = '';

  if(!lines.length){
    listEl.innerHTML = `<div class="empty-cart"><div class="big">🛒</div>Your cart is empty.<br>Add something tasty from the menu.</div>`;
  } else {
    lines.forEach(line => {
      const el = document.createElement('div');
      el.className = 'cart-line';
      el.innerHTML =
        `<div class="cart-line__info">` +
          `<div class="name">${line.icon} ${line.name}</div>` +
          `<div class="unit">${formatNaira(line.price)} each</div>` +
        `</div>` +
        `<div class="cart-line__stepper"></div>` +
        `<div class="cart-line__total">${formatNaira(line.lineTotal)}</div>` +
        `<button type="button" class="remove-btn" aria-label="Remove ${line.name}">✕</button>`;
      el.querySelector('.cart-line__stepper').appendChild(buildStepper(line.id));
      el.querySelector('.remove-btn').addEventListener('click', () => removeFromCart(line.id));
      listEl.appendChild(el);
    });
  }

  renderUpsell();
  renderFulfilmentAndTotals();
}

/* ============ SITE CHROME (nav toggle + scroll reveal) ============ */
export function initRevealOnScroll(){
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = document.querySelectorAll('.reveal');

  if(reduceMotion || !('IntersectionObserver' in window)){
    revealEls.forEach(el => el.classList.add('in-view'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => observer.observe(el));
}

export function initMobileNav(){
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if(!navToggle || !navLinks) return;

  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen);
  });
  navLinks.querySelectorAll('a, button').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

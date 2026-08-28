import { Store, setState } from './store.js';
import { getCartLines, getCartCount, getCartSubtotal } from './cart.js';
import { formatNaira } from './utils.js';
import { getBankDetails } from './restaurant-settings.js';
import { saveOrderToFirestore, getNextOrderNumber } from './firestore.js';
import { showView, getCheckoutZoneSelection, clearCheckoutZoneSelection } from './ui.js';
import { getCurrentUser, getCurrentUserProfile } from './auth.js';
import { isFirebaseConfigured } from './firebase.js';
import { openAuthPromptForCheckout } from './auth-ui.js';
import { addAddress } from './addresses.js';
import { resolveDeliveryFee } from './delivery-zones-data.js';

/* ============================================================
   Fulfilment + payment method selection, order-total math, the
   payment view's DOM population, and placing the order. Mirrors
   the reference project's checkout.js in spirit: rendering that's
   specific to this domain (the payment view's bank-transfer/cash
   cards) lives here rather than in ui.js, same as the reference kept
   fulfilmentSectionHTML() in checkout.js rather than ui.js.

   Both payment methods (Bank Transfer / Cash) stay valid for both
   fulfilment types today — only the cash option's label changes
   ("Pay on Delivery" vs "Pay on Pickup") — so, unlike the reference
   project's product checkout, there's no valid-options-per-fulfilment
   table needed here. If a payment method is ever added that only
   makes sense for one fulfilment type, that reconciliation logic is
   the reference's PAYMENT_METHODS_BY_FULFILMENT pattern to reach for.

   PHASE 4 additions (spec section 6 — Checkout):
     - Pickup orders now validate a contact phone the same way
       delivery orders validate an address (#pickupPhoneField mirrors
       #addressField's exact markup/CSS — see index.html and
       css/order-modal.css, neither of which needed new rules). Only
       pickup gets this new required field, not delivery — the spec
       calls out "validate delivery address" and "validate pickup
       information" as two DIFFERENT requirements, and a delivery
       order already has an address for the courier to use; a pickup
       order has nothing to reach the customer with when it's ready,
       which is the actual gap worth closing here. A delivery order
       still best-effort fills a courier contact number from the
       customer's saved profile phone (see buildOrderObject below)
       without requiring/blocking on it — that's an existing signed-up
       customer's phone from Phase 2's signup form, not a new ask.
     - placeOrder() guards against duplicate submissions with an
       in-flight flag, and puts the confirm button into a visible
       "Placing order…" state while awaiting — same setLoading()
       shape js/auth-forms.js's form handlers already use, duplicated
       rather than shared since importing a form-submission helper
       from the auth modal's own module into checkout would be an
       odd cross-feature dependency for five lines of code.
     - Every order gets a real, collision-free orderNumber (see
       js/firestore.js's getNextOrderNumber) instead of the old
       4-digit client-random id, and a paymentStatus field alongside
       the existing paymentMethod: 'awaiting_confirmation' for a bank
       transfer (nothing here verifies the money actually arrived —
       that's a staff-side confirmation, Phase 6 territory) or
       'unpaid' for cash (paid in person at delivery/pickup). Neither
       ever becomes 'paid' from this codebase yet — named here as the
       eventual third value an admin dashboard's order-status update
       would set, not invented and left dangling.
     - The Firestore document's own id (returned by
       saveOrderToFirestore) is captured onto order.id AFTER a
       successful save. Display code should always read
       order.orderNumber (the human-facing "AB-000123" string,
       generated even when Firebase isn't configured — see the
       fallback below); only js/order-tracking.js's Firestore
       subscription and js/order-history.js's lookups need the real
       order.id, and both already guard on it being present before
       trying to use it.
   ================================================================ */

export function getOrderTotal(){
  const fulfilmentType = Store.state.fulfilmentType;
  const fee = fulfilmentType === 'delivery' ? resolveDeliveryFee(getCheckoutZoneSelection()?.id) : 0;
  return getCartSubtotal() + fee;
}

export function setFulfilmentType(type){
  setState({ fulfilmentType: type });
}

/** "Continue to Payment" handler: blocks on an empty cart, requires a
    delivery zone + detailed address + phone number when fulfilmentType
    is 'delivery' (PHASE 4 — three fields now, each with the same
    inline error state the old single addressField had) or a pickup
    contact phone when fulfilmentType is 'pickup' (identical pattern,
    unchanged), then renders and shows the payment view. A signed-in
    customer with the "save this address" checkbox ticked also gets it
    added to their saved addresses here — see js/addresses.js's
    addAddress(); fire-and-forget, since a failure saving the address
    for NEXT time is not a reason to block THIS checkout (addresses.js's
    own persist() already surfaces a toast on failure). */
export function continueToPayment(){
  if(getCartSubtotal() === 0) return;

  if(Store.state.fulfilmentType === 'delivery'){
    const zoneField = document.getElementById('deliveryZoneField');
    const zoneInput = document.getElementById('deliveryZoneInput');
    const addressInput = document.getElementById('addressInput');
    const addressField = document.getElementById('addressField');
    const phoneInput = document.getElementById('deliveryPhoneInput');
    const phoneField = document.getElementById('deliveryPhoneField');
    const selection = getCheckoutZoneSelection();

    if(!selection){
      zoneField.classList.add('error');
      zoneInput.focus();
      return;
    }
    zoneField.classList.remove('error');

    if(!addressInput.value.trim()){
      addressField.classList.add('error');
      addressInput.focus();
      return;
    }
    addressField.classList.remove('error');

    if(!phoneInput.value.trim()){
      phoneField.classList.add('error');
      phoneInput.focus();
      return;
    }
    phoneField.classList.remove('error');

    const saveAddressCheckbox = document.getElementById('saveAddressCheckbox');
    const user = getCurrentUser();
    if(user && saveAddressCheckbox && saveAddressCheckbox.checked){
      addAddress({
        label: 'Address',
        phoneNumber: phoneInput.value.trim(),
        deliveryZoneId: selection.id,
        deliveryZoneName: selection.name,
        addressDetails: addressInput.value.trim()
      }, user);
      saveAddressCheckbox.checked = false;
    }
  } else {
    const phoneInput = document.getElementById('pickupPhoneInput');
    const phoneField = document.getElementById('pickupPhoneField');
    if(!phoneInput.value.trim()){
      phoneField.classList.add('error');
      phoneInput.focus();
      return;
    }
    phoneField.classList.remove('error');
  }

  renderPaymentView();
  showView('payment');
}

/** Sets the selected payment method and immediately refreshes the
    payment view's DOM — the only screen where paymentMethod is ever
    visible, so there's no need to route this through the global
    Store render() dispatcher (see store.js). */
export function setPaymentMethod(method){
  setState({ paymentMethod: method });
  renderPaymentView();
}

/** Populates the payment view's static markup (it isn't rebuilt from
    a template string — see index.html) with the current order total,
    bank details, and whichever of the transfer/cash cards applies.
    Called once when entering the view (see ui.js's goToPayment) and
    again on every setPaymentMethod() call. */
export function renderPaymentView(){
  const fulfilmentType = Store.state.fulfilmentType;
  const paymentMethod = Store.state.paymentMethod;
  const total = getOrderTotal();

  const paySummaryCount = document.getElementById('paySummaryCount');
  const paySummaryTypeLabel = document.getElementById('paySummaryTypeLabel');
  const paySummaryType = document.getElementById('paySummaryType');
  const paySummaryTotal = document.getElementById('paySummaryTotal');
  if(paySummaryCount) paySummaryCount.textContent = getCartCount();
  if(paySummaryTypeLabel) paySummaryTypeLabel.textContent = fulfilmentType === 'delivery' ? 'Delivery to' : 'Pickup at';
  if(paySummaryType){
    const zone = getCheckoutZoneSelection();
    const addressInput = document.getElementById('addressInput');
    const details = addressInput ? addressInput.value.trim() : '';
    paySummaryType.textContent = fulfilmentType === 'delivery'
      ? ([zone?.name, details].filter(Boolean).join(' — ') || 'address provided')
      : 'Gwarzo Road';
  }
  if(paySummaryTotal) paySummaryTotal.textContent = formatNaira(total);

  const bankName = document.getElementById('bankName');
  const bankAcctNum = document.getElementById('bankAcctNum');
  const bankAcctName = document.getElementById('bankAcctName');
  const transferAmount = document.getElementById('transferAmount');
  const cashAmount = document.getElementById('cashAmount');
  const cashWhen = document.getElementById('cashWhen');
  const payCashLabel = document.getElementById('payCashLabel');
  if(bankName) bankName.textContent = getBankDetails().bank;
  if(bankAcctNum) bankAcctNum.textContent = getBankDetails().accountNumber;
  if(bankAcctName) bankAcctName.textContent = getBankDetails().accountName;
  if(transferAmount) transferAmount.textContent = formatNaira(total);
  if(cashAmount) cashAmount.textContent = formatNaira(total);
  if(cashWhen) cashWhen.textContent = fulfilmentType === 'delivery' ? 'arrives' : 'is ready for pickup';
  if(payCashLabel) payCashLabel.textContent = fulfilmentType === 'delivery' ? 'Pay on Delivery' : 'Pay on Pickup';

  document.getElementById('payTransfer')?.classList.toggle('active', paymentMethod === 'transfer');
  document.getElementById('payCash')?.classList.toggle('active', paymentMethod === 'cash');
  document.getElementById('transferCard')?.classList.toggle('show', paymentMethod === 'transfer');
  document.getElementById('cashCard')?.classList.toggle('show', paymentMethod === 'cash');

  const confirmBtn = document.getElementById('confirmPaymentBtn');
  if(confirmBtn && !isPlacingOrder){
    confirmBtn.textContent = paymentMethod === 'transfer'
      ? "I've Sent the Transfer ✅"
      : (fulfilmentType === 'delivery' ? 'Place Order — Pay on Delivery' : 'Place Order — Pay on Pickup');
  }
  showCheckoutError('');
}

/* PHASE 4 (Delivery Zone checkout redesign). deliveryAddress stays a
   plain human-readable STRING — admin/js/admin-order-detail.js and
   js/order-history-ui.js both just display it as text, so keeping that
   field's shape unchanged means neither needed to change. The
   structured pieces it's built from (zone id/name, address details,
   phone) are ALSO stored alongside it under their own field names, for
   any future admin feature (e.g. grouping today's orders by zone) that
   wants them without re-parsing the display string. */
function buildOrderObject(user, orderNumber){
  const lines = getCartLines();
  const fulfilmentType = Store.state.fulfilmentType;
  const paymentMethod = Store.state.paymentMethod;
  const zone = fulfilmentType === 'delivery' ? getCheckoutZoneSelection() : null;
  const addressInput = document.getElementById('addressInput');
  const deliveryPhoneInput = document.getElementById('deliveryPhoneInput');
  const pickupPhoneInput = document.getElementById('pickupPhoneInput');
  const addressDetails = fulfilmentType === 'delivery' && addressInput ? addressInput.value.trim() : '';
  const profile = getCurrentUserProfile();
  return {
    orderNumber,
    createdLocalAt: Date.now(),
    items: lines,
    subtotal: getCartSubtotal(),
    deliveryFee: fulfilmentType === 'delivery' ? resolveDeliveryFee(zone?.id) : 0,
    total: getOrderTotal(),
    fulfilmentType,
    paymentMethod,
    paymentStatus: paymentMethod === 'transfer' ? 'awaiting_confirmation' : 'unpaid',
    deliveryAddress: fulfilmentType === 'delivery' ? [zone?.name, addressDetails].filter(Boolean).join(' — ') : '',
    deliveryZoneId: zone?.id || null,
    deliveryZoneName: zone?.name || '',
    deliveryAddressDetails: addressDetails,
    status: 'received',
    statusHistory: [{ status: 'received', at: Date.now() }],

    userId: user ? user.uid : null,
    customerName: user ? user.displayName : null,
    customerEmail: user ? user.email : null,
    customerPhone: fulfilmentType === 'pickup'
      ? (pickupPhoneInput ? pickupPhoneInput.value.trim() : '')
      : ((deliveryPhoneInput && deliveryPhoneInput.value.trim()) || (profile && profile.phoneNumber) || '')
  };
}

let isPlacingOrder = false;

function setConfirmButtonBusy(busy){
  const btn = document.getElementById('confirmPaymentBtn');
  if(!btn) return;
  if(busy){
    if(!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
    btn.textContent = 'Placing order…';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalLabel || btn.textContent;
    btn.disabled = false;
  }
}

function showCheckoutError(message){
  const el = document.getElementById('checkoutError');
  if(!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

/** Handles the "I've Sent the Transfer" / "Place Order" tap. Builds the
    order, saves it to Firestore (no-op until Firebase is configured —
    see saveOrderToFirestore in js/firestore.js), clears the cart now
    that it's been converted into that order, and hands off to the
    tracking view.

    The auth gate only engages once isFirebaseConfigured() is true — on
    an unconfigured project (still today's default, since creating a
    real Firebase project is a manual step outside this codebase) this
    behaves exactly as it did before Phase 2, so plugging in real
    Firebase config is the only thing that ever turns checkout-gating
    on. That's deliberate: gating checkout on auth.js's calls while
    they're still inert stubs would just block every order with no way
    through — the same regression Phase 1 flagged and deferred.

    `knownUser`, when passed, is used instead of getCurrentUser() — see
    js/auth-ui.js's resumeAfterAuth() for why: it's the user object from
    the sign-in call that JUST succeeded, not a cached value that might
    not have updated yet.

    PHASE 4: isPlacingOrder guards against a duplicate order from a
    second tap while the first is still in flight (spec section 6,
    "Prevent duplicate orders") — a no-op, not a queued second order.
    The whole body is now wrapped in try/catch/finally: nothing inside
    it actually throws today (saveOrderToFirestore and
    getNextOrderNumber both already catch their own failures and
    resolve with a safe fallback, same convention as every Firestore
    call in this project), but a customer who tapped "place order"
    deserves to never be left staring at a stuck, disabled button with
    no explanation if something unexpected ever does go wrong here —
    see showCheckoutError() and the finally block below. */
export async function placeOrder(knownUser){
  if(isPlacingOrder) return null;
  if(getCartSubtotal() === 0) return null;

  const user = knownUser || getCurrentUser();
  if(isFirebaseConfigured() && !user){
    // Cart is already safe in Store.state — nothing to lose here.
    // Show the sign-in prompt; on success, re-call placeOrder(user) so
    // checkout continues automatically with the same cart.
    return openAuthPromptForCheckout(u => placeOrder(u));
  }

  isPlacingOrder = true;
  setConfirmButtonBusy(true);
  showCheckoutError('');

  try {
    const orderNumber = (await getNextOrderNumber()) || ('AB-' + Math.floor(1000 + Math.random() * 9000));
    const order = buildOrderObject(user, orderNumber);
    Store.state.currentOrder = order;

    const savedId = await saveOrderToFirestore(order); // no-op (returns null) until Firebase is configured
    if(savedId) order.id = savedId;

    // Only clear the cart once the order has actually been built and the
    // save step has completed — never earlier. order.items above is an
    // independent snapshot (see cart.js's getCartLines() — plain spread
    // objects, no live reference into Store.state.cart), so clearing the
    // cart here can never retroactively change the order that was just
    // placed. This is also the ONLY place the cart is cleared on a
    // successful order — "Start a New Order" (see app.js's
    // handleNewOrder()) calls resetOrder() below too, but by then the
    // cart is already empty; that's belt-and-suspenders, not this step's
    // job.
    setState({ cart: {} });

    return order;
  } catch(e){
    console.error('Could not place order:', e);
    showCheckoutError("Something went wrong placing your order. Please try again.");
    return null;
  } finally {
    isPlacingOrder = false;
    setConfirmButtonBusy(false);
  }
}

export function resetOrder(){
  setState({ cart: {}, fulfilmentType: 'delivery', paymentMethod: 'transfer' });
  Store.state.currentOrder = null;
  clearCheckoutZoneSelection();
  const addressInput = document.getElementById('addressInput');
  if(addressInput) addressInput.value = '';
  document.getElementById('deliveryZoneField')?.classList.remove('error');
  document.getElementById('addressField')?.classList.remove('error');
  const deliveryPhoneInput = document.getElementById('deliveryPhoneInput');
  if(deliveryPhoneInput) deliveryPhoneInput.value = '';
  document.getElementById('deliveryPhoneField')?.classList.remove('error');
  const pickupPhoneInput = document.getElementById('pickupPhoneInput');
  if(pickupPhoneInput) pickupPhoneInput.value = '';
  document.getElementById('pickupPhoneField')?.classList.remove('error');
  showCheckoutError('');
}

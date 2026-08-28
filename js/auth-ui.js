import { onAuthStateChangedListener, getCurrentUser, getCurrentUserProfile, refreshCurrentUserProfile, isPasswordProvider, updateAuthPhotoURL, logout } from './auth.js';
import { saveUserProfile } from './firestore.js';
import { uploadProfilePicture, validateImageFile } from './storage.js';
import { syncBodyScrollLock } from './ui.js';
import { getFavoriteIds, onFavoritesChanged, toggleFavorite } from './favorites.js';
import { getSavedAddresses, onAddressesChanged, deleteAddress, setDefaultAddress } from './addresses.js';
import { getCachedMyReviews, loadMyReviews } from './reviews-data.js';
import { renderOrderHistoryView } from './order-history-ui.js';
import { getMenuItemById } from './menu-data.js';
import { formatNaira, escapeHtml, starsHtml, formatRelativeTime } from './utils.js';
import { showToast } from './toast.js';
import { openProductModal } from './product-modal.js';
import { createZoneSearchField } from './zone-picker.js';

/* ============================================================
   Auth modal chrome (open/close/view-switching — mirrors the order
   modal's own showView() pattern in js/ui.js, just scoped to this
   modal's own view ids) plus the nav's signed-in/signed-out control
   and the auth-gate promise machinery placeOrder()/toggleFavorite()/
   review actions call into.

   Form validation and the actual signUp/login/resetPassword calls
   live in js/auth-forms.js instead — split out the same way the
   reference project split search.js/account.js out of a single
   ui.js, so this file stays chrome-and-orchestration only. PHASE 4
   keeps that split: the new personal-info-edit, change-password, and
   add/edit-address FORMS' submit handlers all live in auth-forms.js
   too; this file only renders their surrounding sections and wires
   the interactions that aren't a form submission (Edit/Cancel
   toggles, avatar upload, row-level address actions, view entry
   points) — see each function's own comment below.

   PHASE 3 generalized the Phase 2 checkout-only gate: `pendingReason`
   (null | 'checkout' | 'favorite' | 'review') replaces the old plain
   `checkoutPending` boolean so the SAME resume machinery — open
   sign-in, resolve on success or on close, resume the caller's own
   callback — works for any auth-gated action, each with its own
   banner copy. openAuthPromptForCheckout() is kept as a thin wrapper
   so js/order.js's import/call site never had to change.

   Circular imports, all safe for the same reason: nothing below runs
   at module top-level, only inside functions called after every
   module has finished loading (see js/store.js ↔ js/ui.js's original
   note on this, which every pair below follows identically):
     - favorites.js (openAuthPromptForAuth) ↔ auth-ui.js (favorites
       list rendering) — Phase 3.
     - order-history-ui.js (closeAuthModal) ↔ auth-ui.js (the "View
       Order History" entry point needs to render that view) — PHASE 4.
   auth-forms.js also imports FROM this file (showAuthView,
   resumeAfterAuth, and now PHASE 4's populateAddressFormForEdit) but
   nothing here imports auth-forms.js back — that pair stays
   one-directional, unchanged.
   ================================================================ */

const AUTH_VIEWS = ['signin', 'signup', 'forgot', 'account', 'orders'];

const BANNER_TEXT = {
  checkout: "Sign in to complete your order — your cart is safe, and we'll bring you right back to checkout.",
  favorite: "Sign in to save favorites — we'll bring you right back.",
  review: "Sign in to write a review — we'll bring you right back."
};

let pendingReason = null;   // null | 'checkout' | 'favorite' | 'review'
let pendingResolve = null;
let pendingResume = null;

/** Kept for any existing/future caller that only cares about the
    checkout case specifically; js/order.js doesn't actually import
    this (it only calls openAuthPromptForCheckout), but the export
    predates Phase 3 and removing it isn't this phase's job. */
export function isCheckoutPending(){
  return pendingReason === 'checkout';
}

/** Switches which of this modal's views is showing, updates the modal
    title, and shows/hides the sign-in-reason banner — only ever
    relevant on the signin/signup views, and only while something is
    actually waiting on this modal. PHASE 4 added 'orders' to the view
    set — same mechanism, no changes needed here beyond titleMap. */
export function showAuthView(name){
  AUTH_VIEWS.forEach(v => {
    const el = document.getElementById('authView-' + v);
    if(el) el.classList.toggle('active', v === name);
  });

  const titleMap = { signin: 'Sign In', signup: 'Create Account', forgot: 'Reset Password', account: 'My Account', orders: 'Order History' };
  const title = document.getElementById('authModalTitle');
  if(title) title.textContent = titleMap[name] || 'Sign In';

  const banner = document.getElementById('authCheckoutBanner');
  if(banner){
    const showBanner = !!pendingReason && (name === 'signin' || name === 'signup');
    banner.hidden = !showBanner;
    if(showBanner) banner.textContent = BANNER_TEXT[pendingReason] || BANNER_TEXT.checkout;
  }

  const firstInput = document.querySelector('#authView-' + name + ' input');
  if(firstInput) firstInput.focus();
}

export function openAuthModal(view){
  document.getElementById('authOverlay')?.classList.add('open');
  syncBodyScrollLock();
  showAuthView(view || 'signin');
}

/** Closing without completing sign-in cancels any pending auth-gated
    action — for checkout, the cart itself is untouched (it lives in
    Store.state, not here); for favorite/review, nothing was ever
    optimistically applied, so there's nothing to roll back either. */
export function closeAuthModal(){
  document.getElementById('authOverlay')?.classList.remove('open');
  syncBodyScrollLock();
  settlePending(null);
}

function settlePending(result){
  if(!pendingResolve) return;
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingReason = null;
  resolve(result);
}

/** Generalized auth gate: opens the sign-in view with a reason-specific
    banner; resolves once either (a) sign-in/sign-up succeeds —
    resumeAfterAuth() below calls onResume(user) and resolves with its
    result, so the caller's action (place the order, toggle the
    favorite, submit the review) completes automatically — or (b) the
    modal is closed/cancelled, resolving null: nothing is lost, the
    customer just didn't complete that action yet. */
export function openAuthPromptForAuth(reason, onResume){
  pendingReason = reason;
  pendingResume = onResume;
  openAuthModal('signin');
  return new Promise(resolve => { pendingResolve = resolve; });
}

/** Thin wrapper kept so js/order.js's existing import/call site needed
    zero changes when this gate generalized in Phase 3. */
export function openAuthPromptForCheckout(onResume){
  return openAuthPromptForAuth('checkout', onResume);
}

/** Called by js/auth-forms.js immediately after a successful sign-in,
    sign-up, or Google sign-in — passed the real user object from that
    call's own result, never read back from a cache, so there's no race
    with onAuthStateChangedListener's own (also real, also correct, just
    not guaranteed to run first) update of auth.js's cached currentUser.
    `profile` is an optional plain object (e.g. the sign-up form's own
    displayName/phoneNumber) so the account view has something accurate
    to show immediately, without waiting on a Firestore round-trip. */
export async function resumeAfterAuth(user, profile){
  renderAuthNav(user);

  const wasPending = pendingReason;
  const resume = pendingResume;
  pendingResume = null;

  if(wasPending && resume){
    document.getElementById('authOverlay')?.classList.remove('open');
    syncBodyScrollLock();
    settlePending(await resume(user));
  } else {
    pendingReason = null;
    renderAccountView(user, profile);
    showAuthView('account');
  }
}

/* ============ NAV AUTH CONTROL ============ */
function initials(name){
  if(!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const chars = parts.map(p => p[0] ? p[0].toUpperCase() : '').join('');
  return chars || '?';
}

/** PHASE 4: shows the uploaded/Google avatar photo when one exists —
    user.photoURL is populated either by Google sign-in directly, or
    (for a password-auth account) by js/auth.js's updateAuthPhotoURL
    after js/storage.js's uploadProfilePicture succeeds. Falls back to
    initials exactly as before when there's no photo. Exported so
    js/auth-forms.js's edit-profile handler can refresh the nav chip
    after updateAuthDisplayName — nothing about onAuthStateChanged
    fires for a profile-field update, only for sign-in/out, so nothing
    else would ever re-call this after such an edit otherwise. */
export function renderAuthNav(user){
  const area = document.getElementById('navAuthArea');
  if(!area) return;
  area.innerHTML = '';

  if(user){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-profile-chip';
    btn.setAttribute('aria-label', 'Your account');
    const name = user.displayName || 'Account';
    const firstName = name.split(' ')[0];
    const avatarHtml = user.photoURL
      ? `<img class="nav-profile-chip__avatar" src="${escapeHtml(user.photoURL)}" alt="">`
      : `<span class="nav-profile-chip__avatar">${initials(name)}</span>`;
    btn.innerHTML = avatarHtml + '<span>' + escapeHtml(firstName) + '</span>';
    btn.addEventListener('click', () => { renderAccountView(user); openAuthModal('account'); });
    area.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Sign In';
    btn.addEventListener('click', () => openAuthModal('signin'));
    area.appendChild(btn);
  }
}

/** PHASE 3. Renders the favorited items into the lightweight account
    view (see index.html's #accountFavorites). Deliberately a plain
    list, not the full product-card grid (css/product-grid.css) — this
    is a compact summary inside an already-compact modal, not the main
    browsing surface. Clicking a row opens the same Product Details
    modal the menu grid does, so "view favorites" isn't a dead end. */
function renderAccountFavorites(){
  const list = document.getElementById('accountFavoritesList');
  const empty = document.getElementById('accountFavoritesEmpty');
  if(!list) return;

  const ids = [...getFavoriteIds()];
  const items = ids.map(id => getMenuItemById(id)).filter(Boolean);

  list.innerHTML = '';
  if(empty) empty.hidden = items.length > 0;

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'account-fav-row';
    row.innerHTML =
      `<div class="account-fav-row__thumb">${item.icon}</div>` +
      `<div class="account-fav-row__info">` +
        `<div class="name">${escapeHtml(item.name)}</div>` +
        `<div class="price">${formatNaira(item.price)}</div>` +
      `</div>` +
      `<button type="button" class="account-fav-row__remove" aria-label="Remove ${escapeHtml(item.name)} from favorites">✕</button>`;
    row.querySelector('.account-fav-row__info').addEventListener('click', () => openProductModal(item.id));
    row.querySelector('.account-fav-row__thumb').addEventListener('click', () => openProductModal(item.id));
    row.querySelector('.account-fav-row__remove').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(item.id);
    });
    list.appendChild(row);
  });
}

/** PHASE 4 (spec section 10 — Saved Addresses). Each row shows the
    label/address and up to three inline actions: Set Default (hidden
    on the entry that already is one — never two defaults to choose
    between), Edit (populates #addressForm below via
    populateAddressFormForEdit, exported for js/auth-forms.js's
    post-submit reset to reuse — see this file's header comment),
    and Delete. All three call straight into js/addresses.js; none of
    them are a <form> submission, which is why they live here rather
    than in js/auth-forms.js (see that file's own header comment on
    the same boundary). */
function renderAccountAddresses(){
  const list = document.getElementById('accountAddressesList');
  const empty = document.getElementById('accountAddressesEmpty');
  if(!list) return;

  const addresses = getSavedAddresses();
  list.innerHTML = '';
  if(empty) empty.hidden = addresses.length > 0;

  addresses.forEach(addr => {
    // Backward-compatible: an address saved before Phase 4 only has the
    // old single `.address` field — see js/addresses.js's header
    // comment on why those aren't migrated on write.
    const details = addr.addressDetails ?? addr.address ?? '';
    const subParts = [addr.deliveryZoneName, details, addr.phoneNumber].filter(Boolean);
    const row = document.createElement('div');
    row.className = 'account-list-row';
    row.innerHTML =
      `<div class="account-list-row__body">
        <div class="account-list-row__title">${escapeHtml(addr.label)}${addr.isDefault ? '<span class="account-default-badge">Default</span>' : ''}</div>
        <div class="account-list-row__sub">${escapeHtml(subParts.join(' · '))}</div>
      </div>
      <div class="account-list-row__actions">
        ${addr.isDefault ? '' : '<button type="button" data-action="default">Set Default</button>'}
        <button type="button" data-action="edit">Edit</button>
        <button type="button" class="danger" data-action="delete" aria-label="Delete address">✕</button>
      </div>`;
    row.querySelector('[data-action="default"]')?.addEventListener('click', () => setDefaultAddress(addr.id));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => populateAddressFormForEdit(addr));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const editingId = document.getElementById('addressFormEditingId');
      if(editingId && editingId.value === addr.id) populateAddressFormForEdit(null);
      deleteAddress(addr.id);
    });
    list.appendChild(row);
  });
}

/** Lazily created the same way js/ui.js's checkout zone field is (see
    that file's comment) — the account address form's own instance of
    the shared searchable zone dropdown, independent of checkout's. */
let accountZoneField = null;
export function initAccountZonePicker(){
  if(accountZoneField) return;
  accountZoneField = createZoneSearchField({
    inputId: 'addressZoneInput',
    suggestionsId: 'addressZoneSuggestions',
    onSelect: () => document.getElementById('addressZoneInput')?.closest('.auth-field')?.classList.remove('error')
  });
}

/** The account form's current zone selection, or null — read by
    js/auth-forms.js's handleAddressFormSubmit when validating and
    saving. Same shape as js/ui.js's getCheckoutZoneSelection(), for
    the same reason: one place to ask "what's selected right now"
    rather than each caller reaching into the picker instance itself. */
export function getAccountZoneSelection(){
  if(!accountZoneField) return null;
  const id = accountZoneField.getSelectedZoneId();
  return id ? { id, name: accountZoneField.getSelectedZoneName() } : null;
}

/** Populates #addressForm for editing an existing saved address, or
    (passed null) resets it back to "add a new one" — the Cancel
    button and js/auth-forms.js's handleAddressFormSubmit (after a
    successful add OR edit) both call this the same way, so the form's
    "which mode am I in" state lives in exactly one place: the form's
    own #addressFormEditingId hidden field. Exported for
    js/auth-forms.js to reuse rather than duplicating this. */
export function populateAddressFormForEdit(address){
  document.getElementById('addressFormEditingId').value = address ? address.id : '';
  document.getElementById('addressLabelInput').value = address ? address.label : '';
  document.getElementById('addressPhoneInput').value = address ? (address.phoneNumber || '') : '';
  // Backward-compatible fallback to the pre-Phase-4 `.address` field —
  // see js/addresses.js's header comment.
  document.getElementById('addressTextInput').value = address ? (address.addressDetails ?? address.address ?? '') : '';
  accountZoneField?.setSelected(address?.deliveryZoneId || null, address?.deliveryZoneName || '');
  const submitBtn = document.getElementById('addressFormSubmitBtn');
  submitBtn.textContent = address ? 'Save Changes' : 'Add Address';
  // js/auth-forms.js's setLoading() caches this button's label the FIRST
  // time it goes into a loading state, then restores exactly that cached
  // value afterward — clearing it here means a later loading/restore
  // cycle re-captures whichever label is current, instead of always
  // restoring the very first one it ever saw (e.g. getting stuck showing
  // "Add Address" forever after the first time this form was ever used,
  // even while actually editing an existing entry).
  delete submitBtn.dataset.originalLabel;
  document.getElementById('addressFormCancelBtn').hidden = !address;
  document.getElementById('addressFormError').hidden = true;
}

/** PHASE 4 (spec section 11 — Review History). Read-only list (no
    inline edit/delete here — that already exists where a review
    naturally lives, the product modal's own reviews section; "View"
    just opens that same modal rather than duplicating its edit/delete
    UI a second time in a different place). */
function renderAccountReviews(){
  const list = document.getElementById('accountReviewsList');
  const empty = document.getElementById('accountReviewsEmpty');
  if(!list) return;

  const reviews = getCachedMyReviews();
  list.innerHTML = '';
  if(empty) empty.hidden = reviews.length > 0;

  reviews.forEach(review => {
    const item = getMenuItemById(review.itemId);
    const row = document.createElement('div');
    row.className = 'account-list-row';
    row.innerHTML =
      `<div class="account-list-row__body">
        <div class="account-list-row__title">${escapeHtml(item ? item.name : 'A menu item')}${review.verifiedPurchase ? ' <span class="verified-badge">Verified</span>' : ''}</div>
        <div class="account-list-row__sub">${starsHtml(review.rating, 'small')} <span class="mono">${escapeHtml(formatRelativeTime(review.createdAt))}</span></div>
        ${review.text ? `<div class="account-list-row__sub">${escapeHtml(review.text)}</div>` : ''}
      </div>
      <div class="account-list-row__actions">
        <button type="button" data-action="open">View</button>
      </div>`;
    row.querySelector('[data-action="open"]').addEventListener('click', () => openProductModal(review.itemId));
    list.appendChild(row);
  });
}

/** [AUDIT FIX] loadMyReviews() used to be a one-shot Firestore query
    (js/firestore.js's now-removed fetchReviewsByUser) — the reason this
    section got an actual loading state (spec section 14) where
    favorites/addresses intentionally don't (see js/order-history.js's
    own header comment on that same distinction for order history). It's
    now a filter over js/reviews-store.js's already-live data instead —
    no network round trip — so this resolves essentially instantly.
    Left the loading toggle in place rather than removing it: it's a
    harmless, now-imperceptibly-brief flash rather than a real wait, and
    this section's markup/structure isn't what this audit was asked to
    touch. */
async function refreshAccountReviews(){
  const loading = document.getElementById('accountReviewsLoading');
  if(loading) loading.hidden = false;
  await loadMyReviews();
  if(loading) loading.hidden = true;
  renderAccountReviews();
}

function updatePasswordSectionVisibility(){
  const section = document.getElementById('accountPasswordSection');
  if(section) section.hidden = !isPasswordProvider();
}

/** PHASE 4: now also renders the avatar photo (or initials fallback),
    the addresses/reviews sections, and the password section's
    visibility — plus makes sure the view always (re)opens on the
    read-only info display rather than mid-edit, in case it's being
    reopened right after a previous edit session. Exported so
    js/auth-forms.js's edit-profile and avatar-upload flows can
    re-render this same view with fresh data after they save, instead
    of hand-rolling their own partial DOM updates. */
export function renderAccountView(user, profile){
  const p = profile || getCurrentUserProfile() || {};
  const nameEl = document.getElementById('accountName');
  const emailEl = document.getElementById('accountEmail');
  const phoneEl = document.getElementById('accountPhone');
  const name = user.displayName || p.displayName || '—';
  if(nameEl) nameEl.textContent = name;
  if(emailEl) emailEl.textContent = user.email || p.email || '—';
  if(phoneEl) phoneEl.textContent = p.phoneNumber || '—';

  const initialsEl = document.getElementById('accountAvatarInitials');
  const imgEl = document.getElementById('accountAvatarImg');
  const photoURL = p.photoURL || user.photoURL;
  if(photoURL && imgEl){
    imgEl.src = photoURL;
    imgEl.hidden = false;
    if(initialsEl) initialsEl.hidden = true;
  } else {
    if(imgEl) imgEl.hidden = true;
    if(initialsEl){ initialsEl.hidden = false; initialsEl.textContent = initials(name === '—' ? '' : name); }
  }

  const editForm = document.getElementById('accountEditForm');
  const infoDisplay = document.getElementById('accountInfoDisplay');
  if(editForm) editForm.hidden = true;
  if(infoDisplay) infoDisplay.hidden = false;

  renderAccountFavorites();
  renderAccountAddresses();
  refreshAccountReviews();
  updatePasswordSectionVisibility();
}

/** Wires everything in the auth modal that ISN'T a form submission (see
    js/auth-forms.js for those): the close button, sign-out, the live
    nav control, and — PHASE 4 — the account view's Edit-profile
    toggle, avatar upload, and the Order History view's entry/back
    links. All addEventListener, not onclick="" — this modal has no
    original-prototype precedent the way the order/contact modals do,
    so it follows the same convention app.js's wireStaticControls()
    already uses for markup that isn't part of that legacy onclick=""
    set. */
export function initAuthUI(){
  initAccountZonePicker();
  onAuthStateChangedListener(user => renderAuthNav(user));
  onFavoritesChanged(() => {
    // Only worth re-rendering when the account view is actually the
    // thing showing — renderAccountFavorites() itself is cheap and
    // guards on the list element existing, so this is a convenience
    // early-out more than a strict necessity.
    if(document.getElementById('authOverlay')?.classList.contains('open')) renderAccountFavorites();
  });
  onAddressesChanged(() => {
    if(document.getElementById('authOverlay')?.classList.contains('open')) renderAccountAddresses();
  });

  document.getElementById('authCloseBtn')?.addEventListener('click', closeAuthModal);
  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await logout();
    closeAuthModal();
  });

  document.getElementById('accountEditBtn')?.addEventListener('click', () => {
    const user = getCurrentUser();
    if(!user) return;
    const profile = getCurrentUserProfile() || {};
    document.getElementById('accountEditName').value = user.displayName || profile.displayName || '';
    document.getElementById('accountEditPhone').value = profile.phoneNumber || '';
    document.getElementById('accountEditError').hidden = true;
    document.getElementById('accountInfoDisplay').hidden = true;
    document.getElementById('accountEditForm').hidden = false;
  });
  document.getElementById('accountEditCancelBtn')?.addEventListener('click', () => {
    document.getElementById('accountEditForm').hidden = true;
    document.getElementById('accountInfoDisplay').hidden = false;
  });

  document.getElementById('accountAvatarUploadBtn')?.addEventListener('click', () => {
    document.getElementById('accountAvatarInput')?.click();
  });
  document.getElementById('accountAvatarInput')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow choosing the same file again later
    const user = getCurrentUser();
    if(!file || !user) return;

    const invalidReason = validateImageFile(file);
    if(invalidReason){ showToast(invalidReason, { type: 'error' }); return; }

    document.getElementById('accountAvatar')?.classList.add('uploading');
    const url = await uploadProfilePicture(user.uid, file);
    document.getElementById('accountAvatar')?.classList.remove('uploading');

    if(!url){
      showToast("Couldn't upload your photo — check your connection and try again.", { type: 'error' });
      return;
    }
    await saveUserProfile(user.uid, { photoURL: url });
    await updateAuthPhotoURL(url);
    const profile = await refreshCurrentUserProfile();
    const freshUser = getCurrentUser() || user;
    renderAccountView(freshUser, profile);
    renderAuthNav(freshUser);
  });

  document.getElementById('viewOrderHistoryBtn')?.addEventListener('click', () => {
    showAuthView('orders');
    renderOrderHistoryView();
  });
  document.getElementById('ordersBackLink')?.addEventListener('click', () => showAuthView('account'));
}

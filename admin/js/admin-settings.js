import { saveRestaurantSettings, subscribeToRestaurantSettings } from '../../js/firestore.js';
import { isFirebaseConfigured } from '../../js/firebase.js';
import { getAdminFirebaseApp } from './admin-session.js';
import { DELIVERY_FEE, BANK_DETAILS } from '../../js/config.js';

/* ============================================================
   PHASE 4 (Admin Dashboard) — Settings page.

   Backs the SAME restaurantSettings/primary Firestore document
   js/restaurant-settings.js already reads on the customer side (that
   module existed before this phase touched anything — subscribed to
   Firestore, had a config.js-fallback design — it just had no writer
   anywhere in the project, and nothing called it yet either; see
   js/app.js/js/order.js/js/ui.js for the other half of this phase's
   change). Reuses js/firestore.js's existing getRestaurantSettings()/
   saveRestaurantSettings()/subscribeToRestaurantSettings() exactly as
   they already existed — this file has zero Firestore logic of its
   own. firestore.rules' own comment on the restaurantSettings match
   block ("checkout needs the active delivery fee and bank-transfer
   details, while only staff may change them from the Settings page")
   is what defines this page's scope precisely — delivery fee and bank
   transfer details, nothing more. Brand/contact identity (name,
   phone, WhatsApp, address) stays in js/config.js as static
   per-deployment config, matching that file's own stated purpose —
   making those live-editable too would mean also rewriting how
   index.html's static markup renders them, a materially bigger
   customer-facing change this phase wasn't asked to make.

   DIRTY-TRACKING, not a one-shot load: the form stays subscribed live
   (this page's data should update in real time same as every other
   admin section), but a live snapshot arriving while someone is
   mid-edit must never clobber their in-progress keystrokes — the
   classic "live listener fights a text field" bug. `dirty` tracks
   whether the form has unsaved local changes since it was last
   populated; a snapshot only repopulates the fields when the form is
   NOT dirty. Saving (or a fresh page load) clears it. */

let dirty = false;
let started = false;

function fieldEls(){
  return {
    fee: document.getElementById('settingsDeliveryFee'),
    bankName: document.getElementById('settingsBankName'),
    acctNum: document.getElementById('settingsBankAccountNumber'),
    acctName: document.getElementById('settingsBankAccountName')
  };
}

function applySettingsToForm(settings){
  const f = fieldEls();
  const bank = { ...BANK_DETAILS, ...(settings?.bankDetails || {}) };
  f.fee.value = Number.isFinite(settings?.deliveryFee) ? settings.deliveryFee : DELIVERY_FEE;
  f.bankName.value = bank.bank || '';
  f.acctNum.value = bank.accountNumber || '';
  f.acctName.value = bank.accountName || '';
  dirty = false;
}

function showNotice(message){
  const el = document.getElementById('adminSettingsNotice');
  if(!el) return;
  el.hidden = !message;
  el.textContent = message || '';
}

function showFormError(message){
  const el = document.getElementById('settingsFormError');
  if(!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function setLoading(btn, loading, loadingLabel){
  if(!btn) return;
  if(loading){
    if(!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
    btn.textContent = loadingLabel;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalLabel || btn.textContent;
    btn.disabled = false;
  }
}

async function handleSubmit(e){
  e.preventDefault();
  showFormError('');
  const f = fieldEls();
  const fee = parseFloat(f.fee.value);
  if(f.fee.value.trim() === '' || !Number.isFinite(fee) || fee < 0){
    showFormError('Enter a delivery fee of 0 or more.');
    return;
  }
  if(!isFirebaseConfigured()){
    showFormError("Firebase isn't configured yet, so settings can't be saved.");
    return;
  }

  const button = document.getElementById('settingsSubmitBtn');
  setLoading(button, true, 'Saving…');
  try {
    const ok = await saveRestaurantSettings({
      deliveryFee: fee,
      bankDetails: {
        bank: f.bankName.value.trim(),
        accountNumber: f.acctNum.value.trim(),
        accountName: f.acctName.value.trim()
      }
    }, await getAdminFirebaseApp());
    if(ok){
      dirty = false;
      // Not a toast-and-forget: settings changes affect real checkout
      // pricing, so a persistent confirmation in-place is worth more
      // here than a 3.2s toast that might be missed.
      document.getElementById('adminSettingsNotice')?.classList.add('is-success');
      showNotice('Saved. These changes are live on the site now.');
    } else {
      showFormError("Couldn't save settings — check your connection and try again.");
    }
  } finally {
    setLoading(button, false);
  }
}

/** Starts (or restarts) the live settings subscription. Called once
    from admin-app.js's init() once staff sign-in is confirmed, same
    reasoning as every other admin data source — restaurantSettings
    reads are public per firestore.rules, so this isn't security-gated,
    but there's still no reason to open it before this page is in
    view. */
export async function startAdminSettings(){
  if(started) return;
  started = true;

  if(!isFirebaseConfigured()){
    applySettingsToForm(null); // same safe fallback shape as every Firestore-backed getter in this project — null settings means "use config.js's defaults", handled inside applySettingsToForm itself
    showNotice("Firebase isn't configured yet — showing the current site defaults. Changes here won't be saved until a Firebase project is connected.");
    return;
  }

  const app = await getAdminFirebaseApp();
  await subscribeToRestaurantSettings(next => {
    if(!dirty){
      applySettingsToForm(next);
      // A save's own write echoes back through this same listener a
      // moment later — don't let that routine echo immediately wipe
      // the "Saved." confirmation handleSubmit() just showed. Only
      // clear the notice here if it isn't currently that confirmation;
      // typing again (see the input listener below) is what actually
      // dismisses it.
      if(!document.getElementById('adminSettingsNotice')?.classList.contains('is-success')) showNotice('');
    }
    // else: leave the in-progress edit alone — see this file's header
    // comment. The next successful save (or a manual page reload)
    // will pick up whatever's current.
  }, () => {
    document.getElementById('adminSettingsNotice')?.classList.remove('is-success');
    showNotice("Live updates interrupted — showing the last loaded settings. Reconnecting…");
  }, app);
}

export function initAdminSettings(){
  const form = document.getElementById('adminSettingsForm');
  if(!form) return;
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('input', () => {
    dirty = true;
    document.getElementById('adminSettingsNotice')?.classList.remove('is-success');
    showNotice('');
  });
}

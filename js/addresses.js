import { getCurrentUser, onAuthStateChangedListener } from './auth.js';
import { isFirebaseConfigured } from './firebase.js';
import { saveUserProfile, subscribeToUserProfile } from './firestore.js';
import { showToast } from './toast.js';

/* ============================================================
   Same shape as js/favorites.js on purpose — a plain array living on
   the EXISTING users/{uid} document (`savedAddresses`) rather than a
   new collection, so no new firestore.rules match block or index is
   needed: the owner read/write rule on users/{uid} already covers it.

   PHASE 4 (Delivery Zone checkout redesign). An address entry is now a
   structured object — id, label, phoneNumber, deliveryZoneId,
   deliveryZoneName, addressDetails, isDefault — replacing the old
   single free-text `address` field the brief called out by name
   ("Saved addresses should become structured objects... instead of
   only one text field"). deliveryZoneName is stored alongside
   deliveryZoneId (not just looked up live) so a saved address still
   displays sensibly even if a customer opens it after that zone was
   since renamed or removed from js/delivery-zones-data.js's live list;
   the delivery FEE always comes from the live zone lookup at order
   time regardless (js/order.js), never from this stored copy.

   Addresses saved before this phase only have the old `label`/`address`
   fields — getDefaultAddress()/getSavedAddresses() return them as-is
   rather than migrating them (there's no admin-side "walk every user's
   saved addresses" migration path the way admin-taxonomy.js's badge
   migration has one for menu items), so every render site that reads
   an address's location text falls back to `.address` when
   `.addressDetails` isn't present — see js/ui.js's
   renderSavedAddressPicker and js/auth-ui.js's renderAccountAddresses.

   Real-time: subscribes to the same users/{uid} document
   js/favorites.js also subscribes to, independently — see that
   file's header comment for why two small listeners on one document
   is a deliberate, cheap choice rather than a shared subscription
   module.

   Unlike favorites/reviews, this file does NOT gate itself on sign-in
   via auth-ui.js's openAuthPromptForAuth — every call site that can
   reach these functions (the account view's Saved Addresses section,
   and the cart view's "save this address" checkbox) only ever
   renders/fires once the customer is already signed in. */

const ADDRESSES_KEY = 'albaik:addresses';

function loadLocalMirror(){
  try {
    const raw = localStorage.getItem(ADDRESSES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e){
    return [];
  }
}
function saveLocalMirror(list){
  try { localStorage.setItem(ADDRESSES_KEY, JSON.stringify(list)); } catch(e){ /* storage full/unavailable — still works in-memory this session */ }
}

let addresses = loadLocalMirror();
let unsubscribeProfile = null;
const listeners = [];

export function getSavedAddresses(){
  return addresses;
}
/** The address checkout should prefill with — the one marked default,
    or simply the first saved address if none is (shouldn't normally
    happen, since addAddress()/deleteAddress() below keep exactly one
    entry marked default whenever the list is non-empty, but this is
    a safe fallback rather than returning nothing for a data shape
    that predates this invariant, e.g. hand-edited Firestore data). */
export function getDefaultAddress(){
  return addresses.find(a => a.isDefault) || addresses[0] || null;
}

export function onAddressesChanged(cb){
  listeners.push(cb);
}
function notify(){
  listeners.forEach(cb => cb());
}

function applyServerAddresses(list){
  addresses = Array.isArray(list) ? list : [];
  saveLocalMirror(addresses);
  notify();
}

export function initAddresses(){
  onAuthStateChangedListener(user => {
    if(unsubscribeProfile){ unsubscribeProfile(); unsubscribeProfile = null; }
    if(!user || !isFirebaseConfigured()){
      // Signed out, or Firebase not configured — same "keep whatever
      // the local mirror already has" reasoning as favorites.js.
      notify();
      return;
    }
    subscribeToUserProfile(user.uid, profile => {
      applyServerAddresses(profile && Array.isArray(profile.savedAddresses) ? profile.savedAddresses : []);
    }).then(unsub => { unsubscribeProfile = unsub; });
  });
}

function genId(){
  return 'addr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function persist(next, user){
  addresses = next;
  saveLocalMirror(addresses);
  notify();
  if(user){
    const ok = await saveUserProfile(user.uid, { savedAddresses: addresses });
    if(!ok) showToast("Couldn't save your address — check your connection and try again.", { type: 'error' });
    return ok;
  }
  return true;
}

/** The first address ever saved becomes the default automatically —
    every subsequent one has to be set as default explicitly (see
    setDefaultAddress below), same "first one wins by default, no
    empty/ambiguous state" reasoning a brand-new list needs.

    Requires a real zone selection, not just typed text — deliveryZoneId
    must be a truthy id from js/delivery-zones-data.js's live list (see
    js/zone-picker.js), so the delivery fee this address later produces
    at checkout is always a real zone's fee, never a guess. */
export async function addAddress({ label, phoneNumber, deliveryZoneId, deliveryZoneName, addressDetails }, knownUser){
  const user = knownUser || getCurrentUser();
  const trimmedDetails = (addressDetails || '').trim();
  const trimmedPhone = (phoneNumber || '').trim();
  if(!trimmedDetails || !deliveryZoneId || !trimmedPhone) return false;
  const entry = {
    id: genId(),
    label: (label || '').trim() || 'Address',
    phoneNumber: trimmedPhone,
    deliveryZoneId,
    deliveryZoneName: deliveryZoneName || '',
    addressDetails: trimmedDetails,
    isDefault: addresses.length === 0
  };
  return persist([...addresses, entry], user);
}

export async function updateAddress(id, { label, phoneNumber, deliveryZoneId, deliveryZoneName, addressDetails }, knownUser){
  const user = knownUser || getCurrentUser();
  const next = addresses.map(a => {
    if(a.id !== id) return a;
    return {
      ...a,
      ...(label !== undefined ? { label: label.trim() || 'Address' } : {}),
      ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber.trim() } : {}),
      ...(deliveryZoneId !== undefined ? { deliveryZoneId } : {}),
      ...(deliveryZoneName !== undefined ? { deliveryZoneName } : {}),
      ...(addressDetails !== undefined ? { addressDetails: addressDetails.trim() } : {})
    };
  });
  return persist(next, user);
}

/** If the deleted address was the default and others remain, the
    first remaining one is promoted — same "never leave a non-empty
    list with zero default" invariant addAddress() establishes. */
export async function deleteAddress(id, knownUser){
  const user = knownUser || getCurrentUser();
  const wasDefault = addresses.find(a => a.id === id)?.isDefault;
  let next = addresses.filter(a => a.id !== id);
  if(wasDefault && next.length) next = next.map((a, i) => ({ ...a, isDefault: i === 0 }));
  return persist(next, user);
}

export async function setDefaultAddress(id, knownUser){
  const user = knownUser || getCurrentUser();
  const next = addresses.map(a => ({ ...a, isDefault: a.id === id }));
  return persist(next, user);
}

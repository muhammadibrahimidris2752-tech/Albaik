import { getCurrentUser, onAuthStateChangedListener } from './auth.js';
import { isFirebaseConfigured } from './firebase.js';
import { saveUserProfile, subscribeToUserProfile } from './firestore.js';
import { openAuthPromptForAuth } from './auth-ui.js';
import { showToast } from './toast.js';

/* ============================================================
   PHASE 3. Favorites — "Add favorites / Remove favorites / View
   favorites inside Profile" from the spec. Deliberately NOT part of
   js/store.js's Store.state: same reasoning that file's own header
   comment gives for keeping auth out of it — this is its own concern
   with its own lifecycle, mirroring how js/auth.js keeps currentUser/
   currentUserProfile as module-level state rather than Store fields.

   Storage model: `favorites` is a plain string[] of item ids living
   on the EXISTING users/{uid} document (see js/firestore.js's
   saveUserProfile) rather than a new collection — one more field on
   a doc Phase 2 already reads/writes, so no new Firestore rule or
   index is needed (firestore.rules' users/{uid} rule already gives
   the signed-in owner read/write on their own doc).

   Local mirror: every toggle also writes to localStorage, exactly
   like js/store.js's cart persistence — so hearts survive a reload
   even with no Firebase project configured (today's default dev
   state), and paint instantly on load instead of waiting on an async
   Firestore round-trip.

   PHASE 4: loadFavoritesFor()'s one-shot getUserProfile() read became
   a live subscribeToUserProfile() listener — a change made in another
   tab or on another device now reaches this one without a reload,
   which is the actual "synchronize... update in real time" ask (spec
   section 3), not just "read from Firestore instead of localStorage"
   (which Phase 3 already did). js/addresses.js subscribes to the
   SAME users/{uid} document independently, its own separate listener
   rather than sharing this one — two onSnapshot listeners on one
   small document cost one extra client-side registration, not an
   extra network round trip (the Firestore SDK multiplexes listeners
   on the same doc over one underlying stream), so there's no real
   downside to each feature module owning its own subscription instead
   of routing both through a new shared-state module.
   ================================================================ */

const FAVORITES_KEY = 'albaik:favorites';

function loadLocalMirror(){
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch(e){
    return [];
  }
}
function saveLocalMirror(ids){
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch(e){ /* storage full/unavailable — still works in-memory this session */ }
}

let favoriteIds = new Set(loadLocalMirror());
let unsubscribeProfile = null;
const listeners = [];

export function getFavoriteIds(){
  return favoriteIds;
}
export function isFavorite(itemId){
  return favoriteIds.has(itemId);
}

/** Registered by js/menu-render.js (re-render cards' hearts),
    js/product-modal.js (re-render its own heart + reviews' verified
    state is separate), and js/auth-ui.js (re-render the account
    view's favorites list) — same subscribe-and-notify shape as
    js/order-status.js's consumers, just for this one piece of state. */
export function onFavoritesChanged(cb){
  listeners.push(cb);
}
function notify(){
  listeners.forEach(cb => cb());
}

function applyServerFavorites(ids){
  favoriteIds = new Set(ids);
  saveLocalMirror([...favoriteIds]);
  notify();
}

export function initFavorites(){
  onAuthStateChangedListener(user => {
    if(unsubscribeProfile){ unsubscribeProfile(); unsubscribeProfile = null; }
    if(!user || !isFirebaseConfigured()){
      // Signed out, or Firebase not configured — keep whatever the local
      // mirror already has (set at module load) rather than clearing it;
      // there is no server copy to treat as more authoritative here.
      notify();
      return;
    }
    subscribeToUserProfile(user.uid, profile => {
      applyServerFavorites((profile && Array.isArray(profile.favorites)) ? profile.favorites : []);
    }).then(unsub => { unsubscribeProfile = unsub; });
  });
}

/** Adds/removes itemId from favorites. Gated on sign-in exactly like
    checkout (see js/order.js's placeOrder + js/auth-ui.js's
    openAuthPromptForAuth) — a signed-out tap opens the sign-in modal
    and resumes the same toggle once sign-in succeeds, never losing the
    tap. The gate only engages once isFirebaseConfigured() is true, so
    on an unconfigured project (today's default) hearts work immediately,
    local-only — same invariant placeOrder() already relies on. */
export async function toggleFavorite(itemId, knownUser){
  const user = knownUser || getCurrentUser();
  if(isFirebaseConfigured() && !user){
    return openAuthPromptForAuth('favorite', u => toggleFavorite(itemId, u));
  }

  const next = new Set(favoriteIds);
  if(next.has(itemId)) next.delete(itemId); else next.add(itemId);
  favoriteIds = next;
  saveLocalMirror([...favoriteIds]);
  notify();

  if(user){
    const ok = await saveUserProfile(user.uid, { favorites: [...favoriteIds] }); // no-op until Firebase is configured
    if(!ok) showToast("Couldn't save your favorite — check your connection and try again.", { type: 'error' });
  }
  return true;
}

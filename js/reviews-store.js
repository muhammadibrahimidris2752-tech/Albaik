/*
   js/reviews-store.js
   -------------------
   THE single source of truth for review data, everywhere in this app.

   ROOT CAUSE THIS FILE FIXES
   ---------------------------
   Before this file existed, review data reached the UI through THREE
   independent, unsynchronized paths:

     1. js/site-reviews.js ran its own subscribeToAllReviews() listener
        and kept its own private `reviews` array, used only to paint the
        hero pill / About stats / homepage review grid.
     2. js/reviews-data.js kept a per-item Map (`reviewsCache`), filled by
        a one-shot fetchReviewsForItem() call whenever a product modal
        opened. After a review changed *through this app's own customer
        flow*, it recomputed a { rating, reviewCount } average from that
        local Map and WROTE it onto the menu item document itself
        (menuItems/{id}.rating / .reviewCount) so cards could show a
        number without querying reviews at all.
     3. Every card/summary (js/menu-render.js, js/product-modal.js, and
        the admin Menu Manager) then read THAT denormalized field
        straight off the menu item document.

   Admin moderation (admin/js/admin-reviews.js: hide / restore / delete /
   reply) only ever touched the `reviews` collection directly — nothing
   in that flow recomputed path #2's denormalized field, because that
   recompute lived inside the *customer* review-submission code, not the
   admin moderation code. So deleting a review from Admin Reviews updated
   source #1 (live → homepage correct) but never touched the number
   sitting on the menu item document that #3 was reading (stale → menu
   cards and the product modal kept showing the old stars/count).
   Even a from-scratch customer page load wouldn't have picked up a
   moderation change either: js/menu-data.js fetches menu items ONCE
   (no live listener at all), so the stale field would persist until
   another *customer* review submission happened to recompute it.

   THE FIX
   -------
   Delete the denormalized field and the per-item Map entirely. Rating
   and review count are NEVER stored anywhere — they're arithmetic,
   derived on every read from the one live `reviews` collection snapshot
   held here. One onSnapshot listener per page (customer page, admin
   page — a second listener is unavoidable across two separate HTML
   documents/page loads, same as every other live collection in this
   app; see admin/js/admin-data.js's own note on this), shared by every
   consumer on that page through the getters below. Whenever a review is
   created, edited, deleted, hidden, restored, or replied to — by a
   customer OR by staff — this listener fires, every aggregate this file
   hands out is recalculated, and every subscriber repaints. Nothing
   downstream needs to know *why* the data changed.

   READ THIS FIRST
   ----------------
   - getAllReviewsRaw()      — every review, hidden ones included. Admin
                                moderation only.
   - getVisibleReviews()     — every non-hidden review. Site-wide grid.
   - getReviewsForItem(id)   — non-hidden reviews for one item, newest
                                first. Product modal's review list.
   - getReviewsByUser(uid)   — non-hidden reviews by one signed-in
                                customer, newest first. Account page.
   - getItemAggregate(id)    — { rating, reviewCount } for one item,
                                computed fresh from getReviewsForItem(id).
                                THE replacement for item.rating /
                                item.reviewCount everywhere.
   - getSiteAggregate()      — { rating, reviewCount } across the whole
                                site. THE replacement for site-reviews.js's
                                old private computeAggregate().
   - onReviewsChanged(fn)    — subscribe; fn is called with no arguments
                                on every change, same shape as
                                js/favorites.js's onFavoritesChanged and
                                js/labels-data.js's onLabelsChanged.
                                Returns an unsubscribe function.
   - startReviewsStore()     — starts (or restarts) the one listener for
                                this page. Call once: js/app.js calls it
                                unconditionally and early, same timing as
                                initFavorites()/initLabelsData(), because
                                reviews are public-read. admin/js/admin-app.js
                                calls it only after staff/admin sign-in is
                                confirmed — not because reviews need that
                                gate (they don't; `reviews` is public-read
                                per firestore.rules), but to match every
                                other admin data source's own convention
                                of not opening a listener before a staff
                                member is actually looking at the page.
                                Every other consumer just reads + subscribes;
                                only those two call sites should ever call
                                this.

   No caller anywhere should hold onto a review list or an aggregate
   across a tick — call the getter again when you need current data. The
   whole point is that "current data" always means this file's live
   snapshot, never a copy of it.
*/

import { isFirebaseConfigured } from './firebase.js';
import { subscribeToAllReviews } from './firestore.js';

const SUBSCRIPTION_TIMEOUT_MS = 12000;

let allReviews = [];
let isLoading = true;
let loadError = null;   // null | 'not-configured' | 'subscription-failed'
let unsubscribeFn = null;
let timeoutId = null;
let startToken = 0; // guards against two overlapping startReviewsStore() calls
const listeners = new Set();

function toMillis(value){
  if(!value) return 0;
  if(typeof value.toMillis === 'function') return value.toMillis();
  if(value instanceof Date) return value.getTime();
  return 0;
}

function notify(){
  listeners.forEach(fn => {
    try { fn(); } catch(err) { console.error('reviews-store listener failed', err); }
  });
}

function clearStoreTimeout(){
  if(timeoutId !== null){
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function newestFirst(a, b){
  return toMillis(b.createdAt) - toMillis(a.createdAt);
}

function computeAggregate(list){
  if(!list.length) return { rating: 0, reviewCount: 0 };
  const sum = list.reduce((total, review) => total + (Number(review.rating) || 0), 0);
  return { rating: Math.round((sum / list.length) * 10) / 10, reviewCount: list.length };
}

/** Subscribe to every future change. `fn` receives no arguments — call
    the getters again inside it for current data. Returns an unsubscribe
    function; call it when your view is torn down (a closed modal, for
    instance) so you don't keep repainting something nobody can see. */
export function onReviewsChanged(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isReviewsStoreLoading(){
  return isLoading;
}

export function getReviewsStoreError(){
  return loadError;
}

/** Every review, including hidden ones. Admin moderation is the only
    legitimate caller — anything customer-facing should use
    getVisibleReviews() / getReviewsForItem() / getReviewsByUser() so a
    hidden review never surfaces outside the admin dashboard. */
export function getAllReviewsRaw(){
  return allReviews;
}

export function getVisibleReviews(){
  return allReviews.filter(review => !review.hidden);
}

export function getReviewsForItem(itemId){
  return getVisibleReviews()
    .filter(review => review.itemId === itemId)
    .sort(newestFirst);
}

export function getReviewsByUser(uid){
  return getVisibleReviews()
    .filter(review => review.userId === uid)
    .sort(newestFirst);
}

/** { rating, reviewCount } for one menu item, calculated fresh from the
    live reviews collection every time this is called. Never persisted —
    this is the ONLY correct way to get a menu item's rating anywhere in
    the app now; menuItems documents no longer carry these fields. */
export function getItemAggregate(itemId){
  return computeAggregate(getReviewsForItem(itemId));
}

/** { rating, reviewCount } across every visible review site-wide — hero
    pill, About stats, homepage review summary. */
export function getSiteAggregate(){
  return computeAggregate(getVisibleReviews());
}

/** Starts (or restarts) THE one live listener on the `reviews`
    collection for this page load. Idempotent — safe to call again (a
    manual "retry" affordance, for instance); it tears down any previous
    listener first. See the file header for who should call this. */
export function startReviewsStore(){
  const token = ++startToken; // this attempt's identity — see field comment above
  if(unsubscribeFn){
    unsubscribeFn();
    unsubscribeFn = null;
  }
  clearStoreTimeout();

  if(!isFirebaseConfigured()){
    allReviews = [];
    isLoading = false;
    loadError = 'not-configured';
    notify();
    return;
  }

  isLoading = true;
  loadError = null;
  notify();

  timeoutId = setTimeout(() => {
    timeoutId = null;
    if(!isLoading) return;
    isLoading = false;
    loadError = 'subscription-failed';
    notify();
  }, SUBSCRIPTION_TIMEOUT_MS);

  subscribeToAllReviews(
    list => {
      if(token !== startToken) return; // a later startReviewsStore() call has since superseded this one
      clearStoreTimeout();
      allReviews = list || [];
      isLoading = false;
      loadError = null;
      notify();
    },
    () => {
      if(token !== startToken) return;
      clearStoreTimeout();
      isLoading = false;
      loadError = 'subscription-failed';
      notify();
    }
  ).then(unsub => {
    if(token !== startToken){
      unsub(); // superseded before the listener even finished attaching — don't leak a second live one
      return;
    }
    unsubscribeFn = unsub;
  }).catch(() => {
    if(token !== startToken) return;
    clearStoreTimeout();
    isLoading = false;
    loadError = 'subscription-failed';
    notify();
  });
}

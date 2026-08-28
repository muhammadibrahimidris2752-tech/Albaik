import { getCurrentUser } from './auth.js';
import { isFirebaseConfigured } from './firebase.js';
import {
  upsertReview, deleteReview, addReplyToReview, toggleHelpfulOnReview, getUserOrders
} from './firestore.js';
import { isCancelled } from './order-status.js';
import { openAuthPromptForAuth } from './auth-ui.js';
import { getReviewsForItem, getReviewsByUser } from './reviews-store.js';

/* ============================================================
   PHASE 3. Reviews — data layer. js/reviews-ui.js is the only
   consumer of the mutators below; keeps the same "logic here, DOM
   there" split as every other feature module added this phase
   (menu-filter.js/menu-render.js, favorites.js/auth-ui.js's account
   view).

   Guest/demo-mode fallback: js/order.js's placeOrder() already
   establishes the pattern of gating on `isFirebaseConfigured() && !user`
   — i.e. the sign-in gate only engages once there's a real backend to
   sign in AGAINST. On an unconfigured project (this repo's default dev
   state) there's no real user ever, so reviews use a synthetic 'guest'
   reviewer identity instead of simply refusing to work — the whole
   feature stays exercisable/demoable with zero Firebase setup, same as
   checkout and favorites already are.

   Auth-resume threading: every gated function below takes an optional
   trailing `knownUser` — same shape as js/favorites.js's toggleFavorite —
   so its own openAuthPromptForAuth() resume callback can pass the FRESH
   user object straight back in, rather than re-reading auth.js's cached
   currentUser (which js/auth-ui.js's resumeAfterAuth() explicitly may
   run before updating — that race is exactly why it hands callers the
   user object directly instead).

   [AUDIT FIX] Rating aggregate: menuItems/{id}.rating and .reviewCount
   USED to be denormalized fields, recomputed from a local per-item Map
   this file kept and pushed to both the in-memory menu cache and
   Firestore after every customer-side review write. That's gone. The
   Map, the recompute, and the Firestore write are all deleted — a
   menu item's rating/review count is now pure arithmetic over
   js/reviews-store.js's live `reviews` snapshot, calculated on every
   read, never stored anywhere. This is the actual fix for the "menu
   cards keep showing old stars after Admin Reviews deletes everything"
   bug: the old recompute only ever ran from THIS file's own customer
   write path, so admin moderation (hide/restore/delete, in
   admin/js/admin-reviews.js) — which never called it — left the
   denormalized field stale no matter what the live `reviews` collection
   said. There is no field left to go stale. See js/reviews-store.js's
   own header comment for the full root-cause writeup.

   This file's remaining job is narrower than it used to be: resolve
   "who's asking" (resolveReviewer/currentReviewerId), answer "which of
   the live reviews is mine" (getMyReviewForItem — a filter over
   js/reviews-store.js's live data, not a fetch), and perform the five
   review mutations (submit/remove/reply/staffReply/toggleHelpful).
   Every mutator below does nothing but resolve identity and call the
   matching js/firestore.js write — no local cache patching after the
   write, on purpose. js/reviews-store.js's one live listener (already
   running app-wide) picks up every write, customer or staff, and its
   own onReviewsChanged() notifies every subscribed UI. The Firestore
   SDK also echoes a pending local write into its own cache immediately
   (before the round trip completes), so this reads exactly as instantly
   as the old optimistic patch did — see admin/js/admin-data.js's own
   note on this same point for menu items.

   PHASE 4: Verified Purchase is active. submitReview() below checks
   real order history (getUserOrders() in js/firestore.js) for a
   non-cancelled order containing this itemId, placed by this
   reviewer. "Placed and not cancelled" is the working definition of
   "purchased" here — there's no separate admin-confirmed "fulfilled"
   order status yet (that's Phase 6 territory), so requiring MORE than
   "placed, not cancelled" would mean no review could ever verify
   until an admin dashboard exists to fulfil orders, which defeats the
   point of activating this now. The check is monotonic-OR against
   whatever verifiedPurchase value the review already had: a review
   written BEFORE the matching order existed can become verified on a
   later edit (real progress, worth showing), but a transient
   getUserOrders() failure (network hiccup, security-rule denial)
   during an edit can never DOWNGRADE an already-true badge back to
   false — see the `existing?.verifiedPurchase ||` below and
   js/firestore.js's upsertReview header comment for the same point
   made from that side.

   Same honest caveat named in firestore.rules: verifiedPurchase is
   computed and written by the CLIENT, not a Cloud Function, so a
   determined user could in principle spoof it. Out of scope for a
   vanilla-frontend-only project, named here rather than left unstated.
   ================================================================ */

function resolveReviewer(knownUser){
  const user = knownUser || getCurrentUser();
  if(user) return { uid: user.uid, userName: user.displayName || 'Customer' };
  if(!isFirebaseConfigured()) return { uid: 'guest', userName: 'Guest' };
  return null; // configured + signed out — caller must gate before reaching here
}

/** Which of js/reviews-store.js's live reviews for this item belongs to
    the current (or given) reviewer — a filter over live data, not a
    fetch, so it's always current. Hidden reviews are excluded, same as
    every other customer-facing read of this item's reviews (a customer
    can't see their own review as "mine" while it's admin-hidden; it
    reappears the moment it's restored, since this re-derives on every
    call rather than caching the answer). */
export function getMyReviewForItem(itemId, knownUser){
  const reviewer = resolveReviewer(knownUser);
  if(!reviewer) return null;
  return getReviewsForItem(itemId).find(r => r.userId === reviewer.uid) || null;
}

/** So review list/reply rows can hide "mark helpful"/highlight "your
    review" without every call site re-deriving the current reviewer.
    Accepts the same optional knownUser as the mutators below — the
    reviews UI's post-sign-in refresh passes the resumed user straight
    through here for exactly the reason explained up top. */
export function currentReviewerId(knownUser){
  const reviewer = resolveReviewer(knownUser);
  return reviewer ? reviewer.uid : null;
}

/** True only for a real (non-guest) reviewer with at least one
    non-cancelled order that included this item — see this file's
    header comment for why "placed and not cancelled" is the working
    definition of "purchased" until an admin-confirmed fulfilment
    status exists. */
async function hasVerifiedPurchase(itemId, uid){
  if(!uid || uid === 'guest') return false;
  const orders = await getUserOrders(uid);
  return orders.some(o => !isCancelled(o.status) && Array.isArray(o.items) && o.items.some(it => it.id === itemId));
}

/** Creates or edits the current customer's own review for one item.
    itemId + reviewer uid together decide create-vs-edit (see
    js/firestore.js's upsertReview header comment on why that's safe).
    No local cache to update afterward — js/reviews-store.js's live
    listener picks up the write and every subscribed UI (including
    whichever review list called this) repaints on its own. */
export async function submitReview(itemId, { rating, text }, knownUser){
  const reviewer = resolveReviewer(knownUser);
  if(!reviewer) return openAuthPromptForAuth('review', u => submitReview(itemId, { rating, text }, u));

  const existing = getMyReviewForItem(itemId, reviewer);
  const verifiedPurchase = !!(existing && existing.verifiedPurchase) || await hasVerifiedPurchase(itemId, reviewer.uid);
  return upsertReview({
    itemId, userId: reviewer.uid, userName: reviewer.userName,
    rating, text, verifiedPurchase, isEdit: !!existing
  });
}

export async function removeReview(itemId, knownUser){
  const reviewer = resolveReviewer(knownUser);
  if(!reviewer) return false; // deleting your own review always implies you're already signed in
  return deleteReview(itemId, reviewer.uid);
}

export async function replyToReview(itemId, reviewId, text, knownUser){
  const reviewer = resolveReviewer(knownUser);
  if(!reviewer) return openAuthPromptForAuth('review', u => replyToReview(itemId, reviewId, text, u));
  return addReplyToReview(reviewId, { userId: reviewer.uid, userName: reviewer.userName, text });
}

/** PRIORITY 10. Adds a restaurant/staff reply to a review, marked with
    role 'staff' so customer-facing UIs render it distinctly as a
    "Restaurant" reply. The admin Reviews module calls this; the reply
    is appended (arrayUnion) and never overwrites an existing reply. */
export async function staffReplyToReview(reviewId, text, actorName){
  const reply = { userId: actorName || 'Restaurant', userName: actorName || 'Restaurant', text, role: 'staff' };
  return addReplyToReview(reviewId, reply, 'staff');
}

export async function toggleHelpful(itemId, reviewId, knownUser){
  const reviewer = resolveReviewer(knownUser);
  if(!reviewer) return openAuthPromptForAuth('review', u => toggleHelpful(itemId, reviewId, u));

  const review = getReviewsForItem(itemId).find(r => r.id === reviewId);
  if(!review) return false;
  const already = (review.helpfulBy || []).includes(reviewer.uid);
  return toggleHelpfulOnReview(reviewId, reviewer.uid, !already);
}

let myReviewsCache = [];

export function getCachedMyReviews(){
  return myReviewsCache;
}

/** PHASE 4. Powers the profile's "Your Reviews" section (spec section
    11) — every review this signed-in customer has written, across
    every item, newest first.

    [AUDIT FIX] Used to be its own Firestore query (fetchReviewsByUser)
    run once per profile view. js/reviews-store.js's live listener
    already holds every review app-wide, so this is now just a filter
    over that — no network round trip, and it can never drift from what
    the rest of the app is showing, because it's the same data. Kept as
    an async populate-then-read pair (rather than collapsing into one
    sync getter) purely so js/auth-ui.js's existing `await loadMyReviews();
    ...; getCachedMyReviews()` call shape needs no changes at all. */
export async function loadMyReviews(knownUser){
  const reviewer = resolveReviewer(knownUser);
  myReviewsCache = (!reviewer || reviewer.uid === 'guest') ? [] : getReviewsByUser(reviewer.uid);
  return myReviewsCache;
}

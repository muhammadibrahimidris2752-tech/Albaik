import { getVisibleReviews, getSiteAggregate, onReviewsChanged } from './reviews-store.js';
import { starsHtml, escapeHtml, formatRelativeTime } from './utils.js';

/* PHASE 4 (Remove hardcoded ratings/testimonials). Replaces index.html's
   old static hero rating pill / about-section stats / reviews-section
   summary+cards — a fixed "4.1 (171 reviews)" plus three fabricated
   testimonials (Jacky Chou, Sadiq Dandago, Sulaiman Usman Ardo) — with
   a live, restaurant-WIDE aggregate computed from every document in
   Firestore's `reviews` collection, across every menu item.

   Deliberately a DIFFERENT aggregate from getItemAggregate() (see
   js/reviews-store.js) — that's the correct, live, PER-DISH figure
   already; this is the one site-wide "how's the restaurant doing
   overall" figure the homepage needs, computed fresh from every review
   rather than trying to average the per-dish averages (which would
   silently under-weight a dish with many reviews against one with few).

   [AUDIT FIX] This file used to run its OWN independent
   subscribeToAllReviews() listener and keep its OWN private `reviews`
   array — a second, separate live connection to the exact same
   collection admin/js/admin-reviews.js was ALSO independently
   subscribing to, each with its own copy of "filter hidden, compute an
   average" logic. Harmless for correctness on its own (both listeners
   do see the same live data), but it's exactly the kind of duplicated
   read path the audit was asked to eliminate — every consumer, on both
   the customer site and admin, now reads through the one
   js/reviews-store.js module instead of re-implementing this. Since
   that module already owns the "is Firebase even configured" check
   (see startReviewsStore(), called once from js/app.js), this file no
   longer needs its own isFirebaseConfigured() guard either — it just
   paints whatever the shared store currently has, empty or not, and
   repaints on every change.

   Offline/unconfigured behaviour is unchanged: an unconfigured project
   renders the exact same "no reviews yet" empty state a configured-but-
   genuinely-empty `reviews` collection would. */

/** Verified purchases first, then most recent — capped at 6 to match
    the original 3-card grid's rhythm while allowing a couple more rows
    once there's enough real data (the CSS grid wraps automatically). */
function latestStaffReply(review){
  const replies = (review.replies || []);
  const staff = replies.filter(r => r.role === 'staff');
  return staff[staff.length - 1] || null;
}

function pickFeatured(max = 6){
  return getVisibleReviews()
    .filter(r => r.text && r.text.trim())
    .sort((a, b) => {
      if(!!b.verifiedPurchase !== !!a.verifiedPurchase) return (b.verifiedPurchase ? 1 : 0) - (a.verifiedPurchase ? 1 : 0);
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    })
    .slice(0, max);
}

function renderHero({ rating, reviewCount }){
  const stars = document.getElementById('heroRatingStars');
  const text = document.getElementById('heroRatingText');
  if(stars) stars.innerHTML = starsHtml(rating);
  if(text) text.textContent = reviewCount ? `${rating.toFixed(1)} (${reviewCount} review${reviewCount === 1 ? '' : 's'})` : 'No reviews yet';
}

// "—" rather than "0.0" for the star figure specifically: a bare zero
// star rating reads as "this place is bad", not "no data yet" — the
// review COUNT below still shows a literal 0, matching the brief's own
// "0 Reviews" wording.
function renderAboutStats({ rating, reviewCount }){
  const ratingEl = document.getElementById('aboutStatRating');
  const reviewsEl = document.getElementById('aboutStatReviews');
  if(ratingEl) ratingEl.textContent = reviewCount ? rating.toFixed(1) : '—';
  if(reviewsEl) reviewsEl.textContent = String(reviewCount);
}

function renderSummary({ rating, reviewCount }){
  const score = document.getElementById('reviewScore');
  const stars = document.getElementById('reviewScoreStars');
  const meta = document.getElementById('reviewScoreMeta');
  if(score) score.textContent = reviewCount ? rating.toFixed(1) : '—';
  if(stars) stars.innerHTML = starsHtml(rating);
  if(meta) meta.textContent = reviewCount ? `Based on ${reviewCount} customer review${reviewCount === 1 ? '' : 's'}` : 'No reviews yet';
}

/** Same avatar-initial / "Verified Purchase" / relative-time
    conventions js/reviews-ui.js already established for the per-item
    review list — reused here rather than invented fresh, so a customer
    sees one consistent review "look" whether it's on a dish or on the
    homepage. */
function buildCard(review){
  const name = review.userName || 'Customer';
  const initial = escapeHtml(name[0] || 'C').toUpperCase();
  const metaParts = [];
  if(review.verifiedPurchase) metaParts.push('Verified Purchase');
  const time = formatRelativeTime(review.createdAt);
  if(time) metaParts.push(time);
  const reply = latestStaffReply(review);
  const replyHtml = reply
    ? `<div class="review-card__reply"><div class="review-card__reply-name">Restaurant</div><p>${escapeHtml(reply.text)}</p></div>`
    : '';
  return `<div class="review-card">
    <div class="stars-row">${starsHtml(review.rating)}</div>
    <p class="quote">${escapeHtml(review.text)}</p>
    ${replyHtml}
    <div class="who">
      <div class="avatar">${initial}</div>
      <div><div class="name">${escapeHtml(name)}</div><div class="meta">${metaParts.join(' · ')}</div></div>
    </div>
  </div>`;
}

function renderGrid(){
  const grid = document.getElementById('reviewGrid');
  if(!grid) return;
  const featured = pickFeatured();
  grid.innerHTML = featured.length
    ? featured.map(buildCard).join('')
    : `<div class="review-grid__empty">No customer reviews yet. Be the first verified customer to leave a review.</div>`;
}

function renderAll(){
  const agg = getSiteAggregate();
  renderHero(agg);
  renderAboutStats(agg);
  renderSummary(agg);
  renderGrid();
}

export function initSiteReviews(){
  renderAll(); // paints whatever js/reviews-store.js already has — empty state until its first snapshot arrives, same as before
  onReviewsChanged(renderAll);
}

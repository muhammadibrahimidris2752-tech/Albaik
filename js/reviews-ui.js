import {
  getMyReviewForItem, currentReviewerId,
  submitReview, removeReview, replyToReview, toggleHelpful
} from './reviews-data.js';
import { getReviewsForItem, isReviewsStoreLoading, onReviewsChanged } from './reviews-store.js';
import { openAuthPromptForAuth } from './auth-ui.js';
import { escapeHtml, formatRelativeTime, starsHtml } from './utils.js';

/* ============================================================
   PHASE 3. Reviews — UI. Renders into whatever container
   js/product-modal.js hands it; has no idea it's inside a modal
   specifically, so it could just as easily be dropped somewhere else
   later without change.

   [AUDIT FIX] Used to do its own one-shot `await loadReviewsForItem(itemId)`
   fetch when the section mounted, then paint from that private cache —
   a review changing anywhere else (another tab, an admin moderation
   action) while this was open never reached it. It now paints straight
   from js/reviews-store.js's live snapshot and subscribes to
   onReviewsChanged() for as long as it's mounted, so a review hidden or
   deleted by staff while a customer has this exact item's modal open
   disappears from the list immediately, same as everywhere else in the
   app. renderReviewsSection() returns an unsubscribe function —
   js/product-modal.js calls it when the modal closes (or before
   re-opening for a different item) so a stale listener never keeps
   repainting a container nobody's looking at.

   All customer-submitted text (review text, reply text, display
   names) goes through escapeHtml() before hitting innerHTML — see
   js/utils.js's header comment on why that's non-negotiable here in
   a way it isn't for staff-authored menu copy elsewhere in the app.
   ================================================================ */

function buildStarInput(initialRating){
  const wrap = document.createElement('div');
  wrap.className = 'star-input';
  let current = initialRating || 0;
  const stars = [];
  for(let i = 1; i <= 5; i++){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-input__star';
    btn.textContent = '★';
    btn.setAttribute('aria-label', `Rate ${i} star${i > 1 ? 's' : ''}`);
    btn.addEventListener('mouseenter', () => paint(i));
    btn.addEventListener('mouseleave', () => paint(current));
    btn.addEventListener('click', () => { current = i; paint(current); });
    stars.push(btn);
    wrap.appendChild(btn);
  }
  function paint(n){
    stars.forEach((s, idx) => s.classList.toggle('filled', idx < n));
  }
  paint(current);
  wrap.getValue = () => current;
  return wrap;
}

function buildForm(itemId, myReview, refresh){
  const isEdit = !!myReview;
  const form = document.createElement('div');
  form.className = 'review-form';

  const label = document.createElement('div');
  label.className = 'review-form__label';
  label.textContent = isEdit ? 'Edit your review' : 'Write a review';
  form.appendChild(label);

  const starInput = buildStarInput(isEdit ? myReview.rating : 0);
  form.appendChild(starInput);

  const textarea = document.createElement('textarea');
  textarea.className = 'review-form__text';
  textarea.placeholder = 'Share your experience with this dish…';
  textarea.maxLength = 500;
  textarea.value = isEdit ? (myReview.text || '') : '';
  form.appendChild(textarea);

  const err = document.createElement('div');
  err.className = 'field-error';
  err.hidden = true;
  form.appendChild(err);

  const actions = document.createElement('div');
  actions.className = 'review-form__actions';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'place-order-btn';
  submitBtn.textContent = isEdit ? 'Update Review' : 'Submit Review';
  submitBtn.addEventListener('click', async () => {
    const rating = starInput.getValue();
    const text = textarea.value.trim();
    if(rating < 1){ err.textContent = 'Please select a star rating.'; err.hidden = false; return; }
    if(!text){ err.textContent = 'Please write a few words.'; err.hidden = false; return; }
    err.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    await submitReview(itemId, { rating, text });
    refresh();
  });
  actions.appendChild(submitBtn);

  if(isEdit){
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'review-form__delete';
    delBtn.textContent = 'Delete review';
    delBtn.addEventListener('click', async () => {
      if(!window.confirm('Delete your review? This cannot be undone.')) return;
      await removeReview(itemId);
      refresh();
    });
    actions.appendChild(delBtn);
  }

  form.appendChild(actions);
  return form;
}

function buildReplyForm(itemId, reviewId, refresh){
  const form = document.createElement('div');
  form.className = 'review-reply-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Write a reply…';
  input.maxLength = 300;
  const send = document.createElement('button');
  send.type = 'button';
  send.textContent = 'Send';
  send.addEventListener('click', async () => {
    const text = input.value.trim();
    if(!text) return;
    send.disabled = true;
    await replyToReview(itemId, reviewId, text);
    refresh();
  });
  input.addEventListener('keydown', (e) => { if(e.key === 'Enter') send.click(); });
  form.appendChild(input);
  form.appendChild(send);
  return form;
}

function buildReviewRow(itemId, review, myUid, refresh){
  const row = document.createElement('div');
  row.className = 'review-item';
  const isMine = !!myUid && review.userId === myUid;
  const helpfulBy = review.helpfulBy || [];
  const alreadyHelpful = !!myUid && helpfulBy.includes(myUid);
  const name = review.userName || 'Customer';

  row.innerHTML =
    `<div class="review-item__head">` +
      `<span class="review-item__avatar">${escapeHtml(name[0] || 'C').toUpperCase()}</span>` +
      `<div class="review-item__meta">` +
        `<div class="review-item__name">${escapeHtml(name)}` +
          (review.verifiedPurchase ? ' <span class="verified-badge">Verified Purchase</span>' : '') +
          (isMine ? ' <span class="mine-badge">You</span>' : '') +
        `</div>` +
        `<div class="review-item__sub">${starsHtml(review.rating, 'small')}<span class="review-item__time">${formatRelativeTime(review.createdAt)}</span></div>` +
      `</div>` +
    `</div>` +
    `<p class="review-item__text">${escapeHtml(review.text || '')}</p>` +
    `<div class="review-item__actions"></div>` +
    `<div class="review-item__replies"></div>`;

  const actions = row.querySelector('.review-item__actions');
  if(isMine){
    const countSpan = document.createElement('span');
    countSpan.className = 'review-helpful-count';
    countSpan.textContent = `👍 ${helpfulBy.length} found this helpful`;
    actions.appendChild(countSpan);
  } else {
    const helpfulBtn = document.createElement('button');
    helpfulBtn.type = 'button';
    helpfulBtn.className = 'review-helpful-btn' + (alreadyHelpful ? ' active' : '');
    helpfulBtn.textContent = `👍 Helpful (${helpfulBy.length})`;
    helpfulBtn.addEventListener('click', async () => { await toggleHelpful(itemId, review.id); refresh(); });
    actions.appendChild(helpfulBtn);
  }

  const replyBtn = document.createElement('button');
  replyBtn.type = 'button';
  replyBtn.className = 'review-reply-btn';
  replyBtn.textContent = 'Reply';
  const repliesWrap = row.querySelector('.review-item__replies');
  replyBtn.addEventListener('click', () => {
    if(repliesWrap.querySelector('.review-reply-form')) return;
    const form = buildReplyForm(itemId, review.id, refresh);
    repliesWrap.appendChild(form);
    form.querySelector('input').focus();
  });
  actions.appendChild(replyBtn);

(review.replies || []).forEach(reply => {
    const isStaff = reply.role === 'staff';
    const rEl = document.createElement('div');
    rEl.className = 'review-reply' + (isStaff ? ' review-reply--restaurant' : '');
    rEl.innerHTML =
      `<span class="review-reply__name">${escapeHtml(isStaff ? 'Restaurant' : (reply.userName || 'Customer'))}</span>` +
      `<span class="review-reply__text">${escapeHtml(reply.text || '')}</span>` +
      `<span class="review-reply__time">${formatRelativeTime(reply.at)}</span>`;
    repliesWrap.appendChild(rEl);
  });

  return row;
}

/** Renders the full reviews section for one item into `container`,
    straight from js/reviews-store.js's live data, and keeps it live for
    as long as it stays mounted. Returns an unsubscribe function — call
    it when the container is torn down or about to show a different
    item, or this keeps repainting into a container nobody's looking at
    (and, worse, would repaint the WRONG item's data once itemId no
    longer matches what's on screen). js/product-modal.js is the only
    caller and owns that lifecycle. */
export function renderReviewsSection(itemId, container){
  if(!container) return () => {};

  paint();
  return onReviewsChanged(() => paint());

  function paint(knownUser){
    if(isReviewsStoreLoading()){
      container.innerHTML = '<div class="reviews-loading">Loading reviews…</div>';
      return;
    }

    const reviews = getReviewsForItem(itemId);
    const myUid = currentReviewerId(knownUser);
    const myReview = getMyReviewForItem(itemId, knownUser);

    container.innerHTML = '';

    const heading = document.createElement('h4');
    heading.className = 'reviews-heading';
    heading.textContent = `Customer Reviews (${reviews.length})`;
    container.appendChild(heading);

    const formWrap = document.createElement('div');
    formWrap.className = 'review-form-wrap';
    if(myUid){
      formWrap.appendChild(buildForm(itemId, myReview, paint));
    } else {
      const prompt = document.createElement('button');
      prompt.type = 'button';
      prompt.className = 'review-signin-prompt';
      prompt.textContent = 'Sign in to write a review';
      prompt.addEventListener('click', () => openAuthPromptForAuth('review', (u) => paint(u)));
      formWrap.appendChild(prompt);
    }
    container.appendChild(formWrap);

    const list = document.createElement('div');
    list.className = 'review-list';
    if(!reviews.length){
      list.innerHTML = '<p class="review-empty">No reviews yet — be the first to share what you thought.</p>';
    } else {
      // The customer's own review (if any) leads the list, then
      // everyone else's, newest first (getReviewsForItem is already
      // sorted that way — see reviews-store.js).
      const mine = myUid ? reviews.filter(r => r.userId === myUid) : [];
      const others = myUid ? reviews.filter(r => r.userId !== myUid) : reviews;
      [...mine, ...others].forEach(r => list.appendChild(buildReviewRow(itemId, r, myUid, paint)));
    }
    container.appendChild(list);
  }
}

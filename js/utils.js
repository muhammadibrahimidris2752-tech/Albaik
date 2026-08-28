/* Small, dependency-light helpers shared across modules. */
import { WHATSAPP_NUMBER } from './config.js';

export function formatNaira(n){
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

/** Shared wa.me link builder — the contact sheet and order confirmation
    both use this so the encoding logic exists in exactly one place. */
export function buildWaLink(message){
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Copies text to the clipboard and flips the trigger button to a
    "Copied!" state for ~1.6s. Used by both the payment view's copy-
    account-number button and the contact sheet's copy-phone button,
    which previously duplicated this exact fallback logic inline. */
export function copyToClipboard(text, buttonEl, copiedLabel = 'Copied!'){
  const originalLabel = buttonEl.textContent;
  const showCopied = () => {
    buttonEl.textContent = copiedLabel;
    buttonEl.classList.add('copied');
    setTimeout(() => {
      buttonEl.textContent = originalLabel;
      buttonEl.classList.remove('copied');
    }, 1600);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(showCopied).catch(showCopied);
  } else {
    showCopied();
  }
}

/** PHASE 3. Every menu item's name/description is staff-authored (trusted)
    content, same as it was pre-Phase-3 — but reviews, replies, and display
    names are CUSTOMER-submitted, and js/reviews-ui.js renders them via
    innerHTML (the same convention every other view in this project already
    uses). Any customer text inserted that way MUST go through this first,
    or a review body containing e.g. "<img src=x onerror=...>" would
    execute in every other customer's browser. Escapes the five HTML-
    significant characters; safe to call on text that's already plain. */
export function escapeHtml(str){
  return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
}

/** PHASE 3. Builds the "clipped overlay" star-rating markup shared by
    product cards, the product modal, and the reviews list — one
    dimmed ★★★★★ background plus a gold ★★★★★ copy clipped to the
    rating's percentage width (see css/base.css's original .stars/
    .stars-bg/.stars-fg rules, which this reuses as-is rather than
    inventing a second rating-display pattern). */
export function starsHtml(rating, extraClass){
  const pct = Math.max(0, Math.min(100, (rating || 0) / 5 * 100));
  const cls = extraClass ? ' ' + extraClass : '';
  return `<span class="stars${cls}"><span class="stars-bg">★★★★★</span><span class="stars-fg" style="width:${pct}%">★★★★★</span></span>`;
}

/** PHASE 3. Turns a timestamp (Firestore Timestamp, Date, or epoch ms —
    reviews/replies store epoch ms, see js/reviews-data.js's header comment
    on why) into "just now" / "3d ago" / "Jan 5" style copy for review
    lists. Falls back to a plain date once it's more than a week old,
    rather than an ever-growing "412d ago". */
export function formatRelativeTime(value){
  const ms = typeof value === 'number' ? value : (value && typeof value.toMillis === 'function') ? value.toMillis() : new Date(value).getTime();
  if(!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if(min < 1) return 'just now';
  if(min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if(hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  if(day < 7) return day + 'd ago';
  return new Date(ms).toLocaleDateString('en-NG', { month:'short', day:'numeric', year:'numeric' });
}

/* ============================================================
   PHASE 4. A single-slot toast notification — deliberately NOT a
   general notification center. Section 13 of the Phase 4 brief asks
   for graceful handling of offline mode, Firestore failures, auth
   expiration, and permission errors; the existing guard-and-fallback
   pattern in js/firestore.js already keeps the app from crashing or
   showing broken UI on any of those, but several call sites were
   previously fire-and-forget (e.g. js/favorites.js's toggleFavorite
   awaited saveUserProfile() without checking the result) — a failed
   background write was silently invisible to the customer, who'd see
   their heart/address/review "saved" locally with no idea the server
   copy didn't take. This is the one, small, shared way to surface
   that without interrupting whatever the customer was doing.

   One element, created lazily and reused — calling showToast() again
   while one is already showing just replaces its message and resets
   the timer, rather than stacking multiple toasts. duration:0 means
   "stays until hideToast() is called explicitly" (used for the
   offline banner, which should persist for as long as the customer
   actually is offline, not on a fixed timer). */

let hideTimer = null;

function ensureToastEl(){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/** type: 'info' | 'error'. duration: ms before auto-hiding, or 0 to
    stay until hideToast() is called. */
export function showToast(message, { type = 'info', duration = 3200 } = {}){
  const el = ensureToastEl();
  el.textContent = message;
  el.className = 'toast toast--' + type + ' show';
  clearTimeout(hideTimer);
  if(duration > 0){
    hideTimer = setTimeout(() => el.classList.remove('show'), duration);
  }
}

export function hideToast(){
  clearTimeout(hideTimer);
  document.getElementById('toast')?.classList.remove('show');
}

/** One-time wiring for the offline/online banner — call once from
    app.js's init(), same as every other initX() in this project.
    navigator.onLine has known false positives/negatives on some
    networks (captive portals, flaky wifi), but it's the only signal
    available without pinging a server on every check, and false
    positives here just mean an occasionally-too-cautious banner, not
    a broken app — the same "degrade, never break" tradeoff every
    other Firebase-touching feature in this project already makes. */
export function initConnectivityBanner(){
  window.addEventListener('offline', () => {
    showToast("You're offline — some features may not work until you reconnect.", { type: 'error', duration: 0 });
  });
  window.addEventListener('online', () => {
    showToast("Back online.", { type: 'info', duration: 2200 });
  });
  if(!navigator.onLine){
    showToast("You're offline — some features may not work until you reconnect.", { type: 'error', duration: 0 });
  }
}

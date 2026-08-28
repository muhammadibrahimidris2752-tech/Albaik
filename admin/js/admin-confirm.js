/* ============================================================
   ADMIN MENU MANAGER — a small, generic confirm dialog for
   destructive actions (today: only delete). Deliberately its own
   in-page modal rather than window.confirm(): every other overlay in
   this project (order/auth/product modals) is a styled, on-brand
   dialog, and a native browser confirm() would be the one jarring
   exception on this page. Reuses the same .order-overlay/.order-modal/
   .icon-btn chrome as index.html's modals (see admin/index.html's own
   header comment for exactly which shared stylesheets this page loads
   and why css/responsive.css is deliberately NOT one of them).

   No DOM to build here beyond text content — #confirmOverlay's markup
   already exists in admin/index.html; this module only shows/hides it
   and resolves a Promise. One dialog, reused for every call (calling
   confirmAction() again while one is already open replaces its
   content and resolvers, same "one slot, reused" shape as js/toast.js). */

let resolveCurrent = null;

function close(result){
  const overlay = document.getElementById('confirmOverlay');
  if(overlay) overlay.classList.remove('open');
  if(resolveCurrent){
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve(result);
  }
}

/** Shows the confirm dialog and resolves true (confirmed) or false
    (cancelled/dismissed) once the staff member answers. */
export function confirmAction({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}){
  const overlay = document.getElementById('confirmOverlay');
  if(!overlay) return Promise.resolve(false);

  // A second call while one is already open cancels the first rather
  // than leaving its promise unresolved forever.
  if(resolveCurrent) close(false);

  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const confirmBtn = document.getElementById('confirmActionBtn');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.classList.toggle('admin-btn-danger', !!danger);
  document.getElementById('confirmCancelBtn').textContent = cancelLabel;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  return new Promise(resolve => {
    resolveCurrent = (result) => {
      document.body.style.overflow = '';
      resolve(result);
    };
  });
}

/** One-time wiring, called once from admin-app.js's init(). */
export function initAdminConfirm(){
  document.getElementById('confirmActionBtn')?.addEventListener('click', () => close(true));
  document.getElementById('confirmCancelBtn')?.addEventListener('click', () => close(false));
  document.getElementById('confirmCloseBtn')?.addEventListener('click', () => close(false));
  document.getElementById('confirmOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'confirmOverlay') close(false);
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.getElementById('confirmOverlay')?.classList.contains('open')) close(false);
  });
}

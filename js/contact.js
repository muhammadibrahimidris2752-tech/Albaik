/* Contact sheet (the "Call" bottom sheet — phone number + WhatsApp
   deep link). Small enough to stay its own module rather than folding
   into ui.js, matching how the reference project kept single-purpose
   overlays (e.g. its search overlay) separate once they had their own
   clearly bounded behaviour. Shares ui.js's syncBodyScrollLock() so
   "is any overlay open" stays defined in exactly one place. */
import { syncBodyScrollLock } from './ui.js';

export function openContactSheet(){
  document.getElementById('contactOverlay').classList.add('open');
  syncBodyScrollLock();
}
export function closeContactSheet(){
  document.getElementById('contactOverlay').classList.remove('open');
  syncBodyScrollLock();
}

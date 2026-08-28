import { DELIVERY_FEE, BANK_DETAILS } from './config.js';
import { isFirebaseConfigured } from './firebase.js';
import { subscribeToRestaurantSettings } from './firestore.js';

/* Runtime settings preserve config.js as a safe offline fallback. A missing
   settings document is valid: customers continue to see the established
   delivery fee and bank details until staff saves the first settings record.

   PHASE 4 (Admin Dashboard): initRestaurantSettings() is called once from
   js/app.js's init(); getDeliveryFee()/getBankDetails() are read by
   js/order.js (order totals, the buildOrderObject() snapshot, and the
   payment view) and js/ui.js (the cart's fee line). The admin-side writer
   is admin/js/admin-settings.js's Settings page, via js/firestore.js's
   saveRestaurantSettings() directly — that page doesn't import this file,
   since it's writing the document this file only ever reads. */
let settings = { deliveryFee: DELIVERY_FEE, bankDetails: { ...BANK_DETAILS } };
let started = false;

export function getDeliveryFee(){ return Number.isFinite(settings.deliveryFee) && settings.deliveryFee >= 0 ? settings.deliveryFee : DELIVERY_FEE; }
export function getBankDetails(){ return { ...BANK_DETAILS, ...(settings.bankDetails || {}) }; }
export function getRestaurantSettings(){ return { ...settings, bankDetails: getBankDetails() }; }

export async function initRestaurantSettings(onChange = () => {}){
  if(started || !isFirebaseConfigured()) return;
  started = true;
  await subscribeToRestaurantSettings(next => {
    settings = { ...settings, ...(next || {}), bankDetails: { ...BANK_DETAILS, ...(next?.bankDetails || {}) } };
    onChange(getRestaurantSettings());
  }, () => onChange(getRestaurantSettings()));
}

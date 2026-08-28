import { subscribeToDeliveryZones } from './firestore.js';
import { isFirebaseConfigured } from './firebase.js';
import { getDeliveryFee } from './restaurant-settings.js';
import { SAMPLE_DELIVERY_ZONES } from '../data/taxonomy.sample.js';

/* PHASE 4 (Delivery Zone checkout redesign). Customer-facing counterpart
   to admin/js/admin-delivery-zones.js — that module owns the ADMIN side
   (create/rename/reprice/hide/delete); this one is the READ-ONLY live
   cache that checkout (js/zone-picker.js, used from js/ui.js and
   js/auth-ui.js) reads to populate the searchable zone dropdown and to
   look up a chosen zone's delivery fee. A fee change in the admin panel
   reaches checkout instantly through the same Firestore listener
   pattern used everywhere else in this app.

   Falls back to data/taxonomy.sample.js's SAMPLE_DELIVERY_ZONES whenever
   Firebase isn't configured, the same "offline demo still fully works"
   rule js/labels-data.js applies right next to it. */

let zones = isFirebaseConfigured() ? [] : SAMPLE_DELIVERY_ZONES.slice();
let loading = isFirebaseConfigured();
const listeners = new Set();

function notify(){ listeners.forEach(fn => fn(zones)); }

export function initDeliveryZonesData(){
  if(!isFirebaseConfigured()) return;
  subscribeToDeliveryZones(next => {
    zones = next;
    loading = false;
    notify();
  }, () => {
    loading = false;
    notify();
  });
}

export function isDeliveryZonesDataLoading(){ return loading; }

export function onDeliveryZonesChanged(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Active zones, sorted for display — what the searchable dropdown
    (js/zone-picker.js) filters as the customer types. */
export function getActiveZones(){
  return zones
    .filter(z => z.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function getZoneById(id){
  return zones.find(z => z.id === id) || null;
}

/** The lowest active zone fee — used only for the fulfilment toggle's
    "from ₦X" hint, shown before a customer has picked a zone. Returns
    null when there are no active zones yet, so the caller can fall back
    to restaurant-settings.js's flat getDeliveryFee() instead. */
export function getLowestZoneFee(){
  const active = getActiveZones();
  if(!active.length) return null;
  return Math.min(...active.map(z => Number(z.fee) || 0));
}

/** THE delivery fee to charge, given a chosen zone id (or none yet) —
    the one function js/ui.js's live total display AND js/order.js's
    actual order object both call, so the two can never disagree about
    "the fee" the way a hardcoded flat fee duplicated in two places
    could silently drift. Resolution order: the chosen zone's own fee;
    otherwise the lowest active zone's fee, as the same running
    estimate the fulfilment toggle shows before a zone is picked;
    otherwise restaurant-settings.js's flat fee, the last-resort
    fallback for a restaurant that hasn't configured any zones yet. */
export function resolveDeliveryFee(zoneId){
  if(zoneId){
    const zone = getZoneById(zoneId);
    if(zone) return Number(zone.fee) || 0;
  }
  const lowest = getLowestZoneFee();
  return lowest != null ? lowest : getDeliveryFee();
}

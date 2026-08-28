import { subscribeToMenuLabels } from './firestore.js';
import { isFirebaseConfigured } from './firebase.js';
import { SAMPLE_LABELS } from '../data/taxonomy.sample.js';

/* PHASE 4 (Badge/Label consolidation). Customer-facing counterpart to
   admin/js/admin-taxonomy.js's getManagedLabels() — that module owns
   the ADMIN side (create/rename/hide/delete, plus the one-time legacy
   badge migration); this one is the READ-ONLY cache the customer site
   (js/menu-render.js's product cards, js/product-modal.js's detail
   view) resolves an item's `labels` id array against, live, so a label
   rename or a "hide this label" toggle in the admin panel reaches the
   customer menu instantly through the SAME Firestore listener pattern
   already used everywhere else in this app — no page refresh, matching
   the Phase 4 brief's "Badge changes must update instantly" requirement.

   Falls back to data/taxonomy.sample.js's SAMPLE_LABELS whenever
   Firebase isn't configured, exactly the same "offline demo still
   fully works" rule js/menu-data.js already applies to menu items —
   data/menu.sample.js's SAMPLE_MENU items reference these same sample
   label ids directly. */

let labels = isFirebaseConfigured() ? [] : SAMPLE_LABELS.slice();
let loading = isFirebaseConfigured();
const listeners = new Set();

function notify(){ listeners.forEach(fn => fn(labels)); }

export function initLabelsData(){
  if(!isFirebaseConfigured()) return;
  subscribeToMenuLabels(next => {
    labels = next;
    loading = false;
    notify();
  }, () => {
    loading = false;
    notify();
  });
}

export function isLabelsDataLoading(){ return loading; }

export function onLabelsChanged(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resolves an item's `labels` id array into active, ordered label
    names — the single function both js/menu-render.js's product cards
    and js/product-modal.js's badge/pill rendering call instead of ever
    reading isPopular/isNew/isSignature/isBestSeller again. Inactive
    (hidden) labels are silently dropped, matching how the admin Labels
    tab's "active" toggle already governs visibility elsewhere. */
export function getActiveLabelNamesForItem(item){
  const ids = item?.labels;
  if(!Array.isArray(ids) || !ids.length) return [];
  const byId = new Map(labels.map(l => [l.id, l]));
  return ids
    .map(id => byId.get(id))
    .filter(l => l && l.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(l => l.name);
}

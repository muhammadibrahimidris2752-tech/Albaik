/* Offline/demo fallback for the two small admin-managed "reference"
   collections — menuLabels and deliveryZones — used ONLY while
   Firebase isn't configured, exactly the same role data/menu.sample.js
   already plays for menuItems (see that file's own header comment).

   Kept as its own file rather than folded into menu.sample.js: that
   file's documented concern is the menu CATALOG (menuItems' schema);
   these two are separate Firestore collections with their own schema,
   just small enough not to need their own sample-data file each.

   IMPORTANT — id stability: real Firestore label/zone documents get
   auto-generated ids (see js/firestore.js's addCatalogDocument), which
   only exist once a real project has actually been written to. These
   sample ids (`sample-*`) never need to match those real ids, because
   the two data sets are never read in the same session — js/menu-data.js's
   loadMenu() falls back to SAMPLE_MENU only when Firestore is
   unconfigured/unreachable/empty, and js/labels-data.js /
   js/delivery-zones-data.js below follow that exact same rule for
   labels/zones. SAMPLE_MENU's `labels` arrays (see data/menu.sample.js)
   reference the ids below directly. */

export const SAMPLE_LABELS = [
  { id: 'sample-signature', name: 'Signature', active: true, sortOrder: 0 },
  { id: 'sample-best-seller', name: 'Best Seller', active: true, sortOrder: 1 },
  { id: 'sample-popular', name: 'Popular', active: true, sortOrder: 2 },
  { id: 'sample-new', name: 'New', active: true, sortOrder: 3 }
];

/* Delivery zones are keyed off real Kano neighbourhoods along the
   Gwarzo Road corridor so the offline/demo checkout flow (spec section
   7's searchable zone dropdown) has something realistic to search —
   `area` is the same free-text coverage note admin/js/admin-delivery-zones.js
   already supports. Fees are illustrative placeholders, same
   "safe/reasonable default, replace in the real admin panel" status as
   config.js's own DELIVERY_FEE constant. */
export const SAMPLE_DELIVERY_ZONES = [
  { id: 'sample-zone-gwarzo', name: 'Gwarzo Road', area: 'Around the restaurant', fee: 500, active: true, sortOrder: 0 },
  { id: 'sample-zone-gadon-kaya', name: 'Gadon Kaya', area: 'Near Usman Bin Affan Mosque', fee: 700, active: true, sortOrder: 1 },
  { id: 'sample-zone-hotoro', name: 'Hotoro', area: '', fee: 800, active: true, sortOrder: 2 },
  { id: 'sample-zone-naibawa', name: 'Naibawa', area: '', fee: 900, active: true, sortOrder: 3 },
  { id: 'sample-zone-sabon-gari', name: 'Sabon Gari', area: '', fee: 1000, active: true, sortOrder: 4 }
];

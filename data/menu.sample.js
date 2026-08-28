/* Sample menu catalog — today this IS the menu database. js/menu-data.js
   is the only file that imports this directly; every other module goes
   through js/menu-data.js's functions instead of touching this array, so
   wiring up the real Firestore "menuItems" collection means editing
   js/menu-data.js only — nothing else in the app changes.

   PHASE 4 SCHEMA — every field below is what a real menuItems/{id}
   Firestore document now carries (see PROJECT_CONTINUATION_SUMMARY.md
   for the full field-by-field rundown):
     name, description, price, category, image, rating, reviewCount,
     labels, available, displayOrder
   `id` is the Firestore document id (the array key here), never a field
   on the document itself — matches how every other collection in this
   project already works (see js/firestore.js's `{ id: d.id, ...d.data() }`
   pattern). `icon` is a holdover from Phase 1: a single emoji used as the
   graceful fallback visual (see css/product-grid.css's `.product-card__img
   .fallback`) whenever `image` is missing or fails to load — keeping it
   means every item already has a decent-looking placeholder for free,
   with zero extra data entry.

   PHASE 4 CHANGE — badges and ratings are no longer hardcoded here:
     - The old isPopular/isNew/isSignature/isBestSeller booleans are gone.
       Badges now come from ONE system only — the `labels` array below,
       an array of menuLabels doc ids (see js/labels-data.js), the exact
       same field a real Firestore item carries once
       admin/js/admin-taxonomy.js's legacy-badge migration has run. The
       ids referenced here ('sample-signature' etc.) are defined in
       data/taxonomy.sample.js, this file's offline-fallback sibling for
       the menuLabels/deliveryZones collections.
     - `rating`/`reviewCount` are gone entirely rather than pre-seeded —
       nobody has actually reviewed this demo data, so js/menu-render.js
       and js/product-modal.js's `item.rating || 0` / `item.reviewCount || 0`
       fallbacks correctly show "No reviews yet" until a real review
       exists, exactly like a freshly-created Firestore item would.
       js/reviews-data.js's recomputeAndPersist() already keeps these two
       fields live from that point on — this file only controls the
       BEFORE-any-reviews starting state, which was the one piece that
       was ever fake.

   `image` URLs below are real, freely-licensed (Pexels) stock photography
   picked to match each dish, sourced for this phase as a DEMO/PLACEHOLDER
   set — see PROJECT_CONTINUATION_SUMMARY.md's "Known limitations" section
   before going live: swap these for Albaik's own photography first.

   displayOrder is per-category (not globally unique) — see js/menu-data.js's
   getMenu() for why a single ascending sort across the whole array still
   produces the right order once a caller filters down to one category. */

export const MENU_CATEGORIES = ['Chicken', 'Rice', 'Burgers', 'Wraps', 'Sides', 'Desserts', 'Drinks'];

function img(id){
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
}

export const SAMPLE_MENU = [
  // ---------- Chicken ----------
  { id:'fried-2pc', name:'Crispy Fried Chicken (2pc)', description:'Golden, crackling, seasoned through.', price:2000, category:'Chicken', icon:'🍗', image:img('4253705'), labels:['sample-signature'], available:true, displayOrder:10 },
  { id:'fried-4pc', name:'Crispy Fried Chicken (4pc)', description:'Sharing size — same crisp, more chicken.', price:3500, category:'Chicken', icon:'🍗', image:img('8081264'), labels:['sample-best-seller'], available:true, displayOrder:20 },
  { id:'peppered-chicken', name:'Peppered Chicken', description:'Pan-fried chicken tossed in a fiery pepper sauce.', price:2600, category:'Chicken', icon:'🌶️', image:img('8174278'), labels:['sample-new'], available:true, displayOrder:30 },

  // ---------- Rice ----------
  { id:'rice-liver', name:'White Rice, Liver Sauce & Chicken', description:'Fluffy rice, peppered liver sauce, chicken cut.', price:2500, category:'Rice', icon:'🍚', image:img('21821579'), labels:['sample-best-seller'], available:true, displayOrder:10 },
  { id:'jollof-chicken', name:'Jollof Rice & Chicken', description:'Smoky party jollof with a quarter chicken.', price:2700, category:'Rice', icon:'🍛', image:img('37538487'), labels:['sample-popular'], available:true, displayOrder:20 },

  // ---------- Burgers ----------
  { id:'burger', name:'Chicken Burger', description:'Juicy patty, stacked high.', price:2200, category:'Burgers', icon:'🍔', image:img('15076692'), labels:['sample-popular'], available:true, displayOrder:10 },
  { id:'spicy-burger', name:'Spicy Chicken Burger', description:'Our classic burger with a fiery kick.', price:2400, category:'Burgers', icon:'🍔', image:img('8130749'), labels:['sample-new'], available:true, displayOrder:20 },

  // ---------- Wraps ----------
  { id:'shawarma', name:'Chicken Shawarma', description:'Wrapped fresh to order, packed with sauce.', price:1800, category:'Wraps', icon:'🌯', image:img('32845317'), labels:['sample-signature'], available:true, displayOrder:10 },
  { id:'chicken-wrap', name:'Grilled Chicken Wrap', description:'Grilled chicken, fresh veg, light sauce.', price:1900, category:'Wraps', icon:'🌯', image:img('29306505'), labels:['sample-new'], available:true, displayOrder:20 },

  // ---------- Sides ----------
  { id:'chips', name:'Chips', description:'Crisp, golden, salted just right.', price:1000, category:'Sides', icon:'🍟', image:img('4109234'), available:true, displayOrder:10 },
  { id:'coleslaw', name:'Coleslaw', description:'Cool, creamy, crunchy.', price:800, category:'Sides', icon:'🥗', image:img('2317540'), available:true, displayOrder:20 },

  // ---------- Desserts ----------
  { id:'puff-puff', name:'Puff Puff (5pcs)', description:'Soft, sweet, deep-fried dough bites.', price:900, category:'Desserts', icon:'🍩', image:img('16496294'), labels:['sample-new'], available:true, displayOrder:10 },
  { id:'chin-chin', name:'Chin Chin', description:'Crunchy, sweet, fried pastry snack.', price:800, category:'Desserts', icon:'🍪', image:img('17525097'), labels:['sample-new'], available:true, displayOrder:20 },

  // ---------- Drinks ----------
  { id:'soft-drink', name:'Soft Drink', description:'Chilled can.', price:500, category:'Drinks', icon:'🥤', image:img('8879621'), available:true, displayOrder:10 },
  { id:'zobo', name:'Zobo', description:'House-made, chilled hibiscus drink.', price:700, category:'Drinks', icon:'🧃', image:img('8678927'), labels:['sample-popular'], available:true, displayOrder:20 },
  { id:'chapman', name:'Chapman', description:"Nigeria's favourite fruity mocktail.", price:1200, category:'Drinks', icon:'🍹', image:img('7259028'), labels:['sample-new'], available:true, displayOrder:30 }
];

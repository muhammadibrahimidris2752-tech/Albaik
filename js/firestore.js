import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';

/* ============================================================
   Firestore operations. Every function follows the same shape:
   check isFirebaseConfigured(), try/catch around the real call,
   log and return a safe fallback (null/false/[]/no-op unsubscribe)
   on any failure. Callers never need their own configuration check
   or error handling — a menu that can't reach Firestore should still
   render from the local sample data (see js/menu-data.js), not crash.

   Collections (see firestore.rules for the matching security rules):
     menuItems/{itemId}   — the public menu. Public read, admin write.
     orders/{orderId}     — one document per placed order. PHASE 4:
                             checkout's auth gate (js/order.js's
                             placeOrder) means this is now always
                             created by a signed-in customer, never a
                             guest — the "TBD" from Phase 2's own note
                             here is resolved, not still open.
     users/{uid}          — one profile document per signed-in user:
                             displayName, email, phoneNumber, photoURL,
                             favorites, savedAddresses, role, createdAt,
                             updatedAt, lastLogin. `role` ('customer' |
                             'staff' | 'admin') is what auth.js's
                             isAdmin()/isStaff() read. PHASE 4 activated
                             photoURL (js/storage.js's
                             uploadProfilePicture) and savedAddresses
                             (js/addresses.js) — both were already named
                             here as planned schema before either had a
                             real reader/writer.
     reviews/{reviewId}   — public read, created only by signed-in users.
                             PHASE 4 activated verifiedPurchase (see
                             upsertReview below).
     counters/orders      — PHASE 4. A single document
                             ({ value: <int> }) incremented inside a
                             transaction by getNextOrderNumber() below,
                             the source of every order's human-facing
                             orderNumber. Not customer- or admin-facing
                             data — purely an internal sequence.
   ============================================================ */

/* ============ USERS ============ */
export async function getUserProfile(uid, appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, getDoc } = await loadFirebaseModule('firestore');
    const snap = await getDoc(doc(getFirestore(app), 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch(e){
    console.error('Could not load user profile:', e);
    return null;
  }
}

export async function saveUserProfile(uid, data){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, setDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await setDoc(doc(getFirestore(app), 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch(e){
    console.error('Could not save user profile:', e);
    return false;
  }
}

/** PHASE 4. Live updates for one user's own profile document —
    favorites.js and addresses.js each call this independently once
    signed in (see favorites.js's header comment on why two listeners
    on the same small document is a deliberate, cheap choice rather
    than routing both through one shared subscription module). Powers
    "synchronize favorites across devices... update in real time"
    (Phase 4 spec section 3) and the same for saved addresses — a
    change made in another tab/device now reaches this one without a
    page reload, which the Phase 3 one-shot-on-auth-change read could
    never do. Returns a no-op unsubscribe, same convention as every
    other subscribeTo* function in this file, if unconfigured or the
    listener fails to attach. */
export async function subscribeToUserProfile(uid, callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, onSnapshot } = await loadFirebaseModule('firestore');
    return onSnapshot(doc(getFirestore(app), 'users', uid), snap => {
      callback(snap.exists() ? snap.data() : null);
    }, err => console.error('User profile subscription error:', err));
  } catch(e){
    console.error('Could not subscribe to user profile:', e);
    return () => {};
  }
}

/* ============ MENU ============ */
export async function fetchMenuItems(appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, collection, getDocs } = await loadFirebaseModule('firestore');
    const snap = await getDocs(collection(getFirestore(app), 'menuItems'));
    if(snap.empty) return null;
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e){
    console.error('Could not load menu from Firestore:', e);
    return null;
  }
}

export async function addMenuItem(item, appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, collection, addDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    const docRef = await addDoc(collection(getFirestore(app), 'menuItems'), { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  } catch(e){
    console.error('Could not add menu item:', e);
    return null;
  }
}

export async function updateMenuItem(id, changes, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, updateDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'menuItems', id), { ...changes, updatedAt: serverTimestamp() });
    return true;
  } catch(e){
    console.error('Could not update menu item:', e);
    return false;
  }
}

export async function deleteMenuItem(id, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'menuItems', id));
    return true;
  } catch(e){
    console.error('Could not delete menu item:', e);
    return false;
  }
}

/** PHASE 4 (Labels migration). Used exactly once per item by
    admin/js/admin-taxonomy.js's legacy-badge migration: sets an item's
    new `labels` array AND removes its old isPopular/isNew/isSignature/
    isBestSeller booleans in the SAME write, via Firestore's deleteField()
    sentinel — not a plain updateMenuItem() with the four fields set to
    false, because the goal is to actually retire the legacy schema, not
    just stop reading it (see the Phase 4 brief: "There must never be two
    versions of Best Seller, Popular, etc."). Every other menu-item write
    in this app still goes through the plain updateMenuItem() above. */
export async function setMenuItemLabelsAndClearLegacyBadges(id, labels, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, updateDoc, deleteField, serverTimestamp } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'menuItems', id), {
      labels,
      isPopular: deleteField(),
      isNew: deleteField(),
      isSignature: deleteField(),
      isBestSeller: deleteField(),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch(e){
    console.error('Could not migrate legacy badges for menu item:', e);
    return false;
  }
}

/* ============ ADMIN CATALOG TAXONOMY ============
   NOTE ON subscribeToMenuItems BELOW: placed with its sibling
   subscribeToX catalog wrappers (subscribeToMenuCategories etc., a
   few lines down) rather than up next to fetchMenuItems/addMenuItem/
   updateMenuItem/deleteMenuItem above — grouping by "what kind of
   function is this" rather than "what collection does it touch",
   matching how the categories/labels/delivery-zones functions below
   are already grouped by their own shared shape rather than scattered
   near unrelated menuItems-only code. (Not a hoisting requirement —
   subscribeToCatalogCollection is a function declaration, so it's
   hoisted regardless of where subscribeToMenuItems appears relative
   to it — purely a readability choice.) Behaviourally this is still
   just "the menu items collection, live" — same collection, same
   document shape, nothing about menuItems' own rules or writes
   changes.
   Categories deliberately keep their human-readable name on menu items for
   backwards compatibility with the customer menu. Labels are an optional
   string-id array on menu items, so existing badge booleans continue to work
   unchanged while staff can add richer, managed labels over time. */
async function fetchCatalogCollection(collectionName, appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, collection, getDocs } = await loadFirebaseModule('firestore');
    const snap = await getDocs(collection(getFirestore(app), collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e){
    console.error(`Could not load ${collectionName}:`, e);
    return null;
  }
}

async function addCatalogDocument(collectionName, data, appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, collection, addDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    const ref = await addDoc(collection(getFirestore(app), collectionName), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  } catch(e){
    console.error(`Could not add ${collectionName} document:`, e);
    return null;
  }
}

async function updateCatalogDocument(collectionName, id, changes, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, updateDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), collectionName, id), { ...changes, updatedAt: serverTimestamp() });
    return true;
  } catch(e){
    console.error(`Could not update ${collectionName} document:`, e);
    return false;
  }
}

async function deleteCatalogDocument(collectionName, id, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), collectionName, id));
    return true;
  } catch(e){
    console.error(`Could not delete ${collectionName} document:`, e);
    return false;
  }
}

async function subscribeToCatalogCollection(collectionName, callback, onError = null, appOverride = null){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, collection, onSnapshot } = await loadFirebaseModule('firestore');
    return onSnapshot(collection(getFirestore(app), collectionName), snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error(`${collectionName} subscription error:`, err);
      onError?.(err);
    });
  } catch(e){
    console.error(`Could not subscribe to ${collectionName}:`, e);
    onError?.(e);
    return () => {};
  }
}

/** PHASE 4 (Admin Dashboard). Live updates for the WHOLE menuItems
    collection — the admin Menu Manager's upgrade from a one-shot
    fetchMenuItems() + manual Refresh button to genuine real-time,
    matching every other admin data source (orders, categories,
    labels, delivery zones, settings). Reuses subscribeToCatalogCollection
    exactly as menuCategories/menuLabels/deliveryZones already do below —
    menuItems predates that generic helper (Phase 1's fetchMenuItems/
    addMenuItem/updateMenuItem/deleteMenuItem stay exactly as they are,
    still used by the customer-facing one-shot loadMenu()), but a live
    read of the same collection is exactly the same shape as any other
    catalog collection, so there's no reason to hand-write a second
    onSnapshot(collection(...)) here. See admin/js/admin-data.js for the
    caller. */
export const subscribeToMenuItems = (callback, onError, appOverride) => subscribeToCatalogCollection('menuItems', callback, onError, appOverride);

export const fetchMenuCategories = appOverride => fetchCatalogCollection('menuCategories', appOverride);
export const addMenuCategory = (data, appOverride) => addCatalogDocument('menuCategories', data, appOverride);
export const updateMenuCategory = (id, changes, appOverride) => updateCatalogDocument('menuCategories', id, changes, appOverride);
export const deleteMenuCategory = (id, appOverride) => deleteCatalogDocument('menuCategories', id, appOverride);
export const subscribeToMenuCategories = (callback, onError, appOverride) => subscribeToCatalogCollection('menuCategories', callback, onError, appOverride);

export const fetchMenuLabels = appOverride => fetchCatalogCollection('menuLabels', appOverride);
export const addMenuLabel = (data, appOverride) => addCatalogDocument('menuLabels', data, appOverride);
export const updateMenuLabel = (id, changes, appOverride) => updateCatalogDocument('menuLabels', id, changes, appOverride);
export const deleteMenuLabel = (id, appOverride) => deleteCatalogDocument('menuLabels', id, appOverride);
export const subscribeToMenuLabels = (callback, onError, appOverride) => subscribeToCatalogCollection('menuLabels', callback, onError, appOverride);

/* ============ DELIVERY ZONES + RESTAURANT SETTINGS ============ */
export const fetchDeliveryZones = appOverride => fetchCatalogCollection('deliveryZones', appOverride);
export const addDeliveryZone = (data, appOverride) => addCatalogDocument('deliveryZones', data, appOverride);
export const updateDeliveryZone = (id, changes, appOverride) => updateCatalogDocument('deliveryZones', id, changes, appOverride);
export const deleteDeliveryZone = (id, appOverride) => deleteCatalogDocument('deliveryZones', id, appOverride);
export const subscribeToDeliveryZones = (callback, onError, appOverride) => subscribeToCatalogCollection('deliveryZones', callback, onError, appOverride);

export async function getRestaurantSettings(appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, getDoc } = await loadFirebaseModule('firestore');
    const snap = await getDoc(doc(getFirestore(app), 'restaurantSettings', 'primary'));
    return snap.exists() ? snap.data() : null;
  } catch(e){
    console.error('Could not load restaurant settings:', e);
    return null;
  }
}

export async function saveRestaurantSettings(data, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, setDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await setDoc(doc(getFirestore(app), 'restaurantSettings', 'primary'), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch(e){
    console.error('Could not save restaurant settings:', e);
    return false;
  }
}

export async function subscribeToRestaurantSettings(callback, onError = null, appOverride = null){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, onSnapshot } = await loadFirebaseModule('firestore');
    return onSnapshot(doc(getFirestore(app), 'restaurantSettings', 'primary'), snap => callback(snap.exists() ? snap.data() : null), err => {
      console.error('Restaurant settings subscription error:', err);
      onError?.(err);
    });
  } catch(e){
    console.error('Could not subscribe to restaurant settings:', e);
    onError?.(e);
    return () => {};
  }
}

/* ============ ORDERS ============ */
export async function saveOrderToFirestore(order){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, addDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    const docRef = await addDoc(collection(getFirestore(app), 'orders'), { ...order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  } catch(e){
    console.error('Firestore order save failed:', e);
    return null;
  }
}

/** Live updates for a single order's status — powers the customer-facing
    tracking view. Returns an unsubscribe function; always call it, even
    on the no-op path. */
export async function subscribeToOrder(orderId, callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, onSnapshot } = await loadFirebaseModule('firestore');
    return onSnapshot(doc(getFirestore(app), 'orders', orderId), snap => {
      if(snap.exists()) callback({ id: snap.id, ...snap.data() });
    }, err => console.error('Order subscription error:', err));
  } catch(e){
    console.error('Could not subscribe to order:', e);
    return () => {};
  }
}

/** Live updates for every order belonging to one customer — powers My Orders. */
export async function subscribeToUserOrders(uid, callback){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, query, where, orderBy, onSnapshot } = await loadFirebaseModule('firestore');
    const q = query(collection(getFirestore(app), 'orders'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('User order subscription error:', err));
  } catch(e){
    console.error('Could not subscribe to user orders:', e);
    return () => {};
  }
}

/** Live queue for the admin Orders page — every order, newest first. */
export async function subscribeToAllOrders(callback, appOverride = null){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, collection, query, orderBy, onSnapshot } = await loadFirebaseModule('firestore');
    const q = query(collection(getFirestore(app), 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('Order queue subscription error:', err));
  } catch(e){
    console.error('Could not subscribe to orders:', e);
    return () => {};
  }
}

export async function updateOrderStatus(orderId, status, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, updateDoc, serverTimestamp, arrayUnion } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'orders', orderId), {
      status,
      updatedAt: serverTimestamp(),
      statusHistory: arrayUnion({ status, at: Date.now() })
    });
    return true;
  } catch(e){
    console.error('Could not update order status:', e);
    return false;
  }
}

/** PHASE 4. One-shot equivalent of subscribeToUserOrders — same
    query (and so the same composite index), just a single getDocs()
    instead of a live listener. Two callers need this rather than a
    subscription: js/reviews-data.js's Verified Purchase check (a
    one-off "did this person buy this?" question, not something that
    needs to stay live) and js/order-history.js's initial load before
    its own subscription's first snapshot arrives. */
export async function getUserOrders(uid){
  if(!isFirebaseConfigured()) return [];
  try {
    const app = await getFirebaseApp();
    const { getFirestore, collection, query, where, orderBy, getDocs } = await loadFirebaseModule('firestore');
    const q = query(collection(getFirestore(app), 'orders'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e){
    console.error('Could not load user orders:', e);
    return [];
  }
}

/** PHASE 4 (spec section 7: "Generate unique order numbers
    automatically"). A Firestore transaction on a single counters/orders
    document is what makes this genuinely collision-free — not just
    "unlikely to collide" the way the old client-random 4-digit
    js/order.js id was (only 9000 possible values; a real risk once
    this restaurant does more than a handful of orders). Every
    checkout is already required to be signed in by the time this
    runs (see js/order.js's placeOrder — the auth gate fires first),
    so storage.rules-equivalent Firestore rule for this collection can
    simply require request.auth != null and a strict +1 diff — see
    firestore.rules. Fine at single-restaurant order volume; a
    sharded-counter would be the next step at much higher write
    throughput than one write per placed order. Returns null (never
    throws) on any failure OR when unconfigured — js/order.js falls
    back to the old random-id format in either case, so checkout is
    never blocked by this. */
export async function getNextOrderNumber(){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, runTransaction } = await loadFirebaseModule('firestore');
    const db = getFirestore(app);
    const counterRef = doc(db, 'counters', 'orders');
    const next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = (snap.exists() && typeof snap.data().value === 'number') ? snap.data().value : 0;
      const value = current + 1;
      tx.set(counterRef, { value }, { merge: true });
      return value;
    });
    return 'AB-' + String(next).padStart(6, '0');
  } catch(e){
    console.error('Could not generate order number:', e);
    return null;
  }
}

/* ============ REVIEWS ============
   PHASE 3. Review documents use a DETERMINISTIC id — `${itemId}_${uid}`
   — instead of an auto-id. That single choice is what enforces "one
   review per user per item": writing a second time for the same item
   naturally overwrites the customer's own prior review (i.e. IS the
   edit), both here and in firestore.rules' matching create/update rule,
   with no separate query needed to check "does this user already have
   a review here" before writing. Docs ids never need to be split back
   apart in code — itemId/userId are always available as their own
   fields on the document already — so the only place the '_' separator
   matters is string EQUALITY (`itemId + '_' + uid == reviewId`), in
   both upsertReview()/deleteReview() below and firestore.rules. Menu
   item ids are hand-picked and never contain '_' (see data/menu.sample.js);
   Firebase Auth uids are backend-generated and essentially never do
   either, so a collision between two different (itemId, uid) pairs
   producing the same joined id is a theoretical, not practical, concern
   at this project's scale — worth naming plainly rather than silently
   assuming away.

   [AUDIT FIX] fetchReviewsForItem(itemId) and fetchReviewsByUser(uid) —
   one-shot, scoped queries this section used to export — are gone.
   Every review read in the app, per-item or per-user, now goes through
   subscribeToAllReviews below via the one shared live cache in
   js/reviews-store.js, which filters/derives client-side instead of
   re-querying Firestore per item or per user. That's what closed the
   synchronization gap: a one-shot query is only ever as fresh as the
   moment it ran, so a review hidden or deleted by staff a moment later
   left stale results sitting in whichever local cache had captured
   them. A live collection listener has no "moment it ran" to go stale
   after. */

/** PHASE 4 (Homepage authenticity). Live, collection-wide reviews feed —
    every review, across every menu item, unfiltered. THE one live
    connection to the `reviews` collection per page — js/reviews-store.js
    is its only caller, and every review consumer on both the customer
    site and the admin dashboard reads through that shared module rather
    than calling this directly (see that file's header comment).
    Deliberately reuses subscribeToCatalogCollection exactly like
    menuItems/menuLabels/deliveryZones do: the homepage's rating is a
    restaurant-wide figure, not a per-dish one, so it needs every review,
    live, the same way the rest of this app's "changes anywhere show up
    everywhere instantly" behaviour already works. firestore.rules
    already allows public read on `reviews` (see that file), so no rules
    change was needed for this. */
export const subscribeToAllReviews = (callback, onError, appOverride) => subscribeToCatalogCollection('reviews', callback, onError, appOverride);

/** Creates a customer's review for an item, or edits their existing one
    for that same item — same call either way; `isEdit` only controls
    which fields get (re)initialized vs left alone.

    PHASE 4: Verified Purchase is now active. `verifiedPurchase` is
    computed by the CALLER (js/reviews-data.js's submitReview(), which
    checks real order history via getUserOrders() above) and written
    here on both create AND edit — unlike every other per-review field,
    which stays untouched on edit. That's deliberate, not an
    oversight: a review can go from unverified to verified later (the
    customer writes it, then orders the dish, then edits their review)
    and that transition should show up; the reverse (verified →
    unverified) can never legitimately happen once an order exists, so
    there's no "clobber a true value back to false" risk to guard
    against the way earlier phases worried about. See
    reviews-data.js's own header comment for the monotonic-OR logic
    that keeps a transient order-history read failure from ever
    incorrectly downgrading an already-true badge. */
export async function upsertReview({ itemId, userId, userName, rating, text, verifiedPurchase, isEdit, orderId, orderNumber }){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, setDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    const reviewId = itemId + '_' + userId;
    const data = { itemId, userId, userName, rating, text, verifiedPurchase: !!verifiedPurchase, updatedAt: serverTimestamp() };
    if(!isEdit){
      data.createdAt = serverTimestamp();
      data.helpfulBy = [];
      data.replies = [];
      data.hidden = false;
      if(orderId) data.orderId = orderId;
      if(orderNumber) data.orderNumber = orderNumber;
    }
    await setDoc(doc(getFirestore(app), 'reviews', reviewId), data, { merge: true });
    return true;
  } catch(e){
    console.error('Could not save review:', e);
    return false;
  }
}

export async function deleteReview(itemId, userId){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'reviews', itemId + '_' + userId));
    return true;
  } catch(e){
    console.error('Could not delete review:', e);
    return false;
  }
}

/** PRIORITY 10. Admin moderation — permanently delete a review by its
    real document id. The admin Reviews module operates on the whole
    `reviews` collection so it only has the review's own id, not the
    `${itemId}_${uid}` split deleteReview() derives from. Guarded by
    firestore.rules' isStaffOrAdmin() delete branch. */
export async function deleteReviewById(reviewId){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, deleteDoc } = await loadFirebaseModule('firestore');
    await deleteDoc(doc(getFirestore(app), 'reviews', reviewId));
    return true;
  } catch(e){
    console.error('Could not delete review:', e);
    return false;
  }
}

/** PRIORITY 10. Admin moderation — hide a review (or unhide/restore it).
    Hidden reviews are excluded from every customer-facing surface (see
    js/reviews-data.js and js/site-reviews.js) but stay visible in the
    admin moderation queue. Guarded by firestore.rules to staff/admin
    only. */
export async function setReviewHidden(reviewId, hidden){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'reviews', reviewId), { hidden: !!hidden, updatedAt: serverTimestamp() });
    return true;
  } catch(e){
    console.error('Could not update review visibility:', e);
    return false;
  }
}

/** Appends one reply to a review's own `replies` array. `at` is a plain
    client timestamp (Date.now()), not serverTimestamp() — Firestore
    doesn't support serverTimestamp() sentinels inside arrayUnion(), the
    same constraint updateOrderStatus()'s statusHistory already works
    around above.

    PRIORITY 10: `role` ('customer' | 'staff') marks WHO replied, so
    customer-facing UIs can render restaurant (staff) replies distinctly
    — e.g. a "Restaurant" label — from other customers' replies. Defaults
    to 'customer' so the existing customer reply path is unchanged. The
    reply is appended via arrayUnion, so multiple replies accumulate and
    are never overwritten when a customer edits their own review. */
export async function addReplyToReview(reviewId, reply, role = 'customer'){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc, arrayUnion } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'reviews', reviewId), {
      replies: arrayUnion({ ...reply, role, at: Date.now() })
    });
    return true;
  } catch(e){
    console.error('Could not add reply:', e);
    return false;
  }
}

/** Toggles one uid in/out of a review's `helpfulBy` array — the count
    shown is just that array's length, so there's no separate counter
    field that could ever drift out of sync with who actually marked it. */
export async function toggleHelpfulOnReview(reviewId, uid, mark){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = await getFirebaseApp();
    const { getFirestore, doc, updateDoc, arrayUnion, arrayRemove } = await loadFirebaseModule('firestore');
    await updateDoc(doc(getFirestore(app), 'reviews', reviewId), {
      helpfulBy: mark ? arrayUnion(uid) : arrayRemove(uid)
    });
    return true;
  } catch(e){
    console.error('Could not update helpful mark:', e);
    return false;
  }
}

/* ============ STAFF ============
   PRIORITY 15. A `staff/{uid}` document per staff account, separate from
   the shared `users/{uid}` profile so staff-specific fields (position,
   temp password, detailed permissions, login activity) never leak into
   the customer profile schema. The Super Admin (role 'admin') manages
   these; each staff member reads only their OWN document. Reads/writes
   are gated by firestore.rules' isAdmin() / isSelfStaff() checks — see
   that file. Everything here is a reusable, live-subscribed CRUD layer
   matching the existing catalog-collection pattern, so the admin Staff
   module never talks to Firestore directly. */
export const fetchStaff = appOverride => fetchCatalogCollection('staff', appOverride);
export const subscribeToStaff = (callback, onError, appOverride) => subscribeToCatalogCollection('staff', callback, onError, appOverride);
export const addStaffMember = (data, appOverride) => addCatalogDocument('staff', data, appOverride);
export const updateStaffMember = (id, changes, appOverride) => updateCatalogDocument('staff', id, changes, appOverride);
export const deleteStaffMember = (id, appOverride) => deleteCatalogDocument('staff', id, appOverride);

/** PRIORITY 15. The Super Admin writes a staff member's Firebase Auth
    account is created separately (see admin-session.js's
    createStaffAuthAccount); this writes the shared users/{uid} profile
    with role 'staff'. The staff/{uid} doc itself is written via
    addStaffMember/setStaffMember below. Uses the admin app override so
    the write lands under the admin's session. */
export async function saveStaffProfile(uid, data, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, setDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await setDoc(doc(getFirestore(app), 'users', uid), { ...data, role: 'staff', updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch(e){
    console.error('Could not save staff profile:', e);
    return false;
  }
}

/** PRIORITY 15. Creates the staff/{uid} document (full write, not
    merge, so a brand-new staff member starts with a clean permissions/
    login-activity state). */
export async function setStaffMember(id, data, appOverride = null){
  if(!isFirebaseConfigured()) return false;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, setDoc, serverTimestamp } = await loadFirebaseModule('firestore');
    await setDoc(doc(getFirestore(app), 'staff', id), { ...data, updatedAt: serverTimestamp() });
    return true;
  } catch(e){
    console.error('Could not write staff member:', e);
    return false;
  }
}

/** PRIORITY 15. A staff member reads their OWN document (by their auth
    uid), not the whole collection — the collection is admin-only. */
export async function getStaffMember(uid, appOverride = null){
  if(!isFirebaseConfigured()) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, getDoc } = await loadFirebaseModule('firestore');
    const snap = await getDoc(doc(getFirestore(app), 'staff', uid));
    return snap.exists() ? snap.data() : null;
  } catch(e){
    console.error('Could not load staff member:', e);
    return null;
  }
}

/** PRIORITY 15. Live subscription to a single staff member's own doc —
    powers the staff side's permission changes and password-reset
    propagation taking effect instantly without a page refresh. */
export async function subscribeToStaffMember(uid, callback, onError = null, appOverride = null){
  if(!isFirebaseConfigured()) return () => {};
  try {
    const app = appOverride || await getFirebaseApp();
    const { getFirestore, doc, onSnapshot } = await loadFirebaseModule('firestore');
    return onSnapshot(doc(getFirestore(app), 'staff', uid), snap => callback(snap.exists() ? snap.data() : null), err => {
      console.error('Staff subscription error:', err);
      onError?.(err);
    });
  } catch(e){
    console.error('Could not subscribe to staff member:', e);
    onError?.(e);
    return () => {};
  }
}

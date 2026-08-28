# Albaik Chicken — Online Ordering Platform

Kano's Nonstop Kitchen, on the web. A restaurant ordering site being built up from a
single-file HTML prototype into a full Firebase-backed platform — vanilla HTML/CSS/JS
only, no frameworks.

## Technologies

- Vanilla HTML, CSS, JavaScript (ES Modules) — no build step, no bundler
- Firebase Authentication, Cloud Firestore, Firebase Storage (wired up, not yet configured — see **Firebase setup** below)

## Current progress: Phase 4 of 7 ✅ Complete, Phase 6 (Admin Dashboard) ✅ Complete except review moderation

| Phase | Status |
|---|---|
| 1 — Foundation & Architecture | ✅ Complete |
| 2 — Authentication & User System | ✅ Complete |
| 3 — Menu & Customer Experience | ✅ Complete |
| 4 — Firebase Integration, Checkout & Orders | ✅ Complete |
| 5 — Profile & Settings | ⬜ Pending (mostly done early — see below) |
| 6 — Admin Dashboard | 🟨 Dashboard/Menu/Categories/Labels/Delivery Zones/Orders/Customers/Analytics/Settings done; review moderation still pending |
| 7 — Testing, Optimization & Production Polish | ⬜ Pending |

A naming note, since it's easy to trip over: the brief that produced the most recent
round of admin work (Dashboard live stats, Delivery Zones, Settings, and the rest — see
below) called itself "Phase 4" — a label chosen against a different, external phase plan,
unrelated to this table's own Phase 4 (Firebase Integration, Checkout & Orders, already
long complete). That work is this table's **Phase 6**, and source comments for it say
`PHASE 4 (Admin Dashboard)` for exactly that reason — matching the brief it came from,
not this table's numbering. Mentioned once here so it's never a mystery later.

**What Phase 6 (Admin Dashboard) means concretely, in full:** everything staff need to run
the restaurant from a browser, no code editing. **Dashboard** — live stats (menu items,
availability, orders, revenue, low stock) and two live panels (Low Stock, Recent Orders),
all derived from the same Menu and Orders caches every other section already uses, never a
second listener for the same data. **Menu** — the full item manager described below, now
backed by a live Firestore listener instead of a one-shot fetch, so it, too, updates the
instant anything changes from any tab or any other signed-in staff member; items can
optionally track a Stock Quantity, which is what feeds the Dashboard's Low Stock panel — an
item with no quantity set is simply not stock-tracked, exactly like every item before this
existed. **Categories** and **Labels** — managed lists layered on top of the existing
category text; Labels absorbed the four original badges (Popular/New/Signature/Best
Seller) as of the Phase 4 Continuation pass (see `PROJECT_CONTINUATION_SUMMARY.md`) — a
migration folded every item's existing badge into its `labels` array and removed the old
boolean fields, so there's now exactly one badge system end-to-end, staff and customer
side both. **Delivery Zones** — a live-updating list of areas and fees for staff that, as
of that same pass, now IS what checkout's delivery fee is actually calculated from (see
`PROJECT_CONTINUATION_SUMMARY.md`), not just reference data. **Customers** and
**Analytics** — both
computed entirely from the existing live orders cache, no separate reads of customer
profiles. **Settings** — delivery fee and bank transfer details, editable from the
Dashboard and live on the site the moment they're saved: checkout (`js/order.js`,
`js/ui.js`) and the payment view now read these through `js/restaurant-settings.js`, a
module that existed before this round of work but had no caller anywhere in the project
until now. See `PROJECT_CONTINUATION_SUMMARY.md`'s **Phase 6 — Admin Dashboard
(continued)** section for the full architecture and every non-obvious decision behind it.

**What Phase 6's Order Management means concretely:** My Orders (on your profile) now has
a real error state and loading skeletons instead of a plain "Loading…" line, shows each
item's individual price alongside the total, delivery address or pickup contact and
payment method/status, and — while an order is still freshly placed and not yet in the
kitchen — a Cancel Order button. Staff get a whole new Orders Dashboard tab at `/admin/`:
a live queue of every order that updates the instant a status changes from anywhere,
search by order number/customer/phone, filter by status, sort newest/oldest, a one-click
status control per order (populated with that order's own real stages — delivery and
pickup orders progress differently), and a full detail view with the exact same visual
timeline customers see in their own tracking view. Live order tracking's stage-by-stage
progression is no longer a stand-in timer — it only ever moves when a real customer
cancels or a real staff member advances it from this new dashboard. See
`PROJECT_CONTINUATION_SUMMARY.md`'s **Phase 6 — Order Management** section for the
architecture, and its Honesty note addendum for exactly what was and wasn't verified.

**What Phase 6's Admin Menu Manager means concretely:** staff with a `staff` or `admin`
Firestore role can now manage the entire live menu from a browser, no code editing —
sign in at `/admin/`, then view, search, filter by category, and sort every item; add new
ones or edit existing ones (name, description, price, category — including adding a brand
new one on the fly — image URL with a live preview, and a real Firebase Storage photo
upload); toggle availability and reorder items with one click, right from the list; toggle
the Popular/New/Signature/Best Seller labels (a single checklist now — see the Phase 4
Continuation note above); and delete an item with a confirmation step.
It's a separate, self-contained page — nothing in the customer-facing site was touched to
build it. See `PROJECT_CONTINUATION_SUMMARY.md`'s **Phase 6 — Admin Menu Manager** section
for the architecture, and its Honesty note addendum for exactly what was and wasn't
verified (real-browser-tested against mocked data; still no real Firebase project — same
caveat every phase before this one carries too).

**What Phase 4 means concretely:** checkout, orders, and live tracking are now genuinely
backed by Firestore instead of simulated — a real, collision-free order number for every
order, saved delivery addresses usable during checkout, a pickup contact-phone field, and
duplicate-order prevention. Live order tracking reads real order status and updates
automatically. A full "My Orders" history is browsable from your profile — view past
orders, reorder any of them, or track one that's still in progress. Verified Purchase is
active: reviewing an item you've actually ordered now shows the badge for real. The
profile view grew substantially — this phase's brief pulled in most of what was originally
planned for Phase 5: your name/phone are now editable, you can upload a profile picture,
manage saved addresses, see your own review history, and change your password. See
`PROJECT_CONTINUATION_SUMMARY.md` for the full rundown, the reasoning behind every
non-obvious decision, and the honest list of what's still only verified by static analysis
and not by an actual browser or a real Firebase project.

**What Phase 3 means concretely:** the order modal's menu view is a real, browsable
storefront — responsive product cards with real food photography, ratings, and badges;
sticky search (with suggestions and match highlighting) and category navigation, both
filtering the same grid together; a Product Details modal with a quantity selector,
related items, and a full customer-reviews system; favorites, synced to your account and
browsable from Profile; a cart that survives a page reload; and a genuinely different
desktop layout — menu and cart side by side with a persistent cart sidebar — built from
the exact same markup and render pipeline as mobile. Two follow-up desktop-only polish
rounds then reworked the Product Details modal specifically — see
`PROJECT_CONTINUATION_SUMMARY.md`'s **Post-Phase-3 desktop polish passes** section.

**What Phase 2 means concretely:** sign up, sign in (email/password + Google), password
reset, and sign out are real, wired into the UI. The nav shows "Sign In" or a profile chip
depending on auth state. Checkout requires sign-in, but **only once a real Firebase
project is configured** (`isFirebaseConfigured()` — see **Firebase setup**) — until then,
checkout behaves exactly as it did in Phase 1.

**What Phase 1 means concretely:** the original single-file prototype was split into a
clean modular project (below) with zero visible change — same layout, colors, copy,
animations, and interactions as before.

## Features completed (Phases 1–4, plus Phase 6 — Admin Dashboard, complete except review moderation)

- Full page: hero, about, why-chips, menu highlights, reviews, visit/hours, footer — pixel-identical to the original
- **Menu & browsing:** responsive product-card grid (real photos, ratings, badges, favorite hearts), sticky search with suggestions, sticky category navigation, all filtering together; a loading skeleton while the menu is fetching, and a small notice if Firestore is reachable in principle but the fetch itself failed
- **Product Details modal:** large image, full description, quantity selector, related items, reviews — dedicated two-column desktop layout
- **Reviews:** rate/write/edit/delete your own review per item; reply to and mark others' reviews helpful; average rating and count recompute live; **Verified Purchase is active** — shows for real once you've ordered the item, based on your actual order history
- **Favorites:** add/remove from any card or the product modal; synced to your account in real time (multi-tab/multi-device), with a local-storage mirror so it also works with no Firebase project configured
- **Saved addresses:** add, edit, delete, and set a default delivery address from your profile; pick a saved address (or your default fills in automatically) during checkout, and optionally save a newly-typed one for next time
- **Checkout:** delivery-address or pickup-contact-phone validation depending on fulfilment type, a visible "Placing order…" state, and protection against accidentally placing the same order twice from a double-tap; delivery fee and bank transfer details are live-configurable from the admin Settings page (see below), with `js/config.js`'s values as the offline-safe fallback
- **Orders:** every order gets a real, unique order number (not a random guess); records payment status, customer contact info, and full item/pricing details
- **My Orders:** a real order-history list on your profile — view any past order's full detail (individual item prices, delivery/payment info), reorder it in one tap, track it live, or cancel it while it's still freshly placed; real loading skeletons and a real error state if the connection drops
- **Live order tracking:** reads real order status from Firestore and updates automatically, with the exact same visual timeline as before; a cancelled order shows a clear message instead of a stuck progress bar; progression is now driven entirely by real customer/staff actions, not a stand-in timer
- **Profile:** edit your name/phone, upload a profile picture, manage saved addresses, browse your own review history, and change your password (email/password accounts) — all from one account view
- **Admin Dashboard** (`/admin/`, staff/admin accounts only): live stats (menu items,
  availability, orders, revenue, low stock) and two live panels (Low Stock, Recent
  Orders), all derived from the same Menu and Orders caches every other admin section
  already uses
- **Admin Menu Manager** (`/admin/`): view, search, filter, and sort the entire live
  menu, now via a live Firestore listener instead of a one-shot fetch; add, edit, and
  delete items; toggle availability and reorder items with one click; edit
  name/description/price/category (including creating a new category on the fly)/image,
  with a live preview and a real Storage photo upload; assign labels from the Labels
  checklist (the four original badges included — see below); optionally
  track a Stock Quantity per item, which feeds the Dashboard's Low Stock panel
- **Admin Categories & Labels** (`/admin/`): managed lists layered on top of the existing
  category text — visibility and ordering without disturbing existing menu data or
  orders; Labels is now the ONE badge system (Phase 4 Continuation folded the four
  original badges into it and retired the old boolean fields, on both the admin item form
  and the customer-facing menu/product cards)
- **Admin Delivery Zones** (`/admin/`): a live-updating list of delivery areas and fees
  for staff that now drives checkout's own delivery-fee calculation directly (Phase 4
  Continuation), not just reference data
- **Admin Orders Dashboard** (`/admin/`): a live order queue that updates automatically; search by
  order number, customer name, or phone; filter by status; sort newest/oldest; change any
  order's status with one click (delivery and pickup orders get their own correct set of
  stages); a full detail view with customer/items/payment info and the same visual
  timeline customers see
- **Admin Customers & Analytics** (`/admin/`): both computed entirely from the existing
  live orders cache — lifetime value, order counts, and last-order date per customer;
  a 7-day revenue trend, an order-status breakdown, and top menu items by orders
- **Admin Settings** (`/admin/`): delivery fee and bank transfer details, editable live —
  changes take effect on the site immediately, read through `js/restaurant-settings.js`
- Order modal: browse menu by category, add/adjust/remove items, delivery-or-pickup toggle, running totals
- Payment view: bank transfer (with copy-to-clipboard) or cash on delivery/pickup
- Contact sheet: tap-to-call and WhatsApp deep link
- Sign up, sign in (email/password + Google), forgot-password email, sign out
- Checkout auth gate — active once Firebase is configured; guests are prompted to sign in and land back at checkout automatically on success
- Order completion resets cleanly: the cart clears exactly once an order is placed, the header/modal cart badges always match the real count, and "Start a New Order" fully closes and reopens the modal to a fresh menu
- A small toast notification for things you should know about but that shouldn't interrupt you — a background save that failed, or losing your connection
- Fully responsive — mobile ordering sheet, tablet 2-column grid, desktop sidebar layout

**Not yet implemented** (see the phase table): a dedicated full-page profile (today's
account view is a modal, now a fairly long one), and review moderation from the admin
dashboard (every other originally-planned admin feature is done, see above). Delivery
Zones is also reference data for staff only — checkout itself still charges a single flat
delivery fee rather than picking one per zone (see `PROJECT_CONTINUATION_SUMMARY.md` for
why that line wasn't crossed this round). See `PROJECT_CONTINUATION_SUMMARY.md`'s **Known
bugs/limitations** for smaller, honestly-named gaps in what's already built.

## Folder structure

```
index.html              Homepage + order/auth/product modals — markup unchanged from the
                         original prototype except where each phase's own section says
admin/                    Admin Dashboard — a separate, self-contained page; nothing here
                           is loaded by index.html and nothing in index.html/css/root js/
                           was touched to build the admin panel itself (Order Management's
                           customer-facing half, and this round's Settings wiring, DO touch
                           index.html/css/js/ — see below and
                           PROJECT_CONTINUATION_SUMMARY.md's Phase 6 sections)
  index.html               Sign-in gate + full nav (Dashboard/Menu/Categories/Labels/
                            Delivery Zones/Orders/Customers/Analytics/Settings) +
                            add/edit-item, category, label, and delivery-zone modals +
                            delete-confirm + order detail modal
  css/admin.css              Page-specific styles; deliberately does NOT load
                              css/responsive.css — see PROJECT_CONTINUATION_SUMMARY.md's
                              Phase 6 sections for why
  js/
    admin-session.js          Admin-only Firebase app instance + sign-in/out,
                              isolated from the customer-facing session
    admin-auth.js              Staff-only sign-in gate wrapping admin-session.js
    admin-data.js               Menu items CRUD + a live Firestore subscription — the
                                canonical cache every other admin section reads from
                                (Dashboard stats/Low Stock, Categories/Labels usage
                                counts, the item form's category list)
    admin-filter.js              Search/category (reused from js/menu-filter.js) +
                                 availability filter + sort — no DOM
    admin-render.js               Menu Manager toolbar wiring + item list rendering
                                  (incl. stock/low-stock display), event-delegated actions
    admin-item-form.js             Add/edit modal: validation, image upload, badges,
                                   labels checklist, optional stock quantity
    admin-taxonomy.js               Categories + Labels CRUD, both live-subscribed;
                                    legacy-badge → managed-label import
    admin-delivery-zones.js          Delivery Zones CRUD, live-subscribed
    admin-dashboard.js                Live stats + Low Stock/Recent Orders panels, derived
                                      entirely from admin-data.js/admin-orders-data.js's
                                      existing caches — no new listeners of its own
    admin-insights.js                  Customers + Analytics — both derived from the
                                       existing live orders cache, no separate reads
    admin-settings.js                   Delivery fee + bank transfer details form, live-
                                        subscribed with dirty-tracking so an incoming update
                                        never overwrites an in-progress edit
    admin-confirm.js                     Generic reusable confirm dialog (used throughout
                                         the admin panel)
    admin-app.js                          Entry point + nav switching across all nine sections
    admin-orders-data.js                   Wraps js/firestore.js's subscribeToAllOrders/
                                           updateOrderStatus — a live listener, no optimistic
                                           patching needed
    admin-orders-filter.js                  Search/status-filter/sort for the Orders
                                            Dashboard — no DOM
    admin-orders-render.js                   Orders Dashboard toolbar + row rendering,
                                             event-delegated, per-row status control
    admin-order-detail.js                     Order detail modal: customer/items/payment/
                                              notes + a reused timeline visualization
css/                      One file per concern, loaded in this order (order matters —
                          see css/responsive.css's header):
                            tokens → base → header-nav → hero → home → menu (homepage
                            teaser) → reviews → order-modal (chrome + cart) →
                            product-grid → product-modal → auth-modal →
                            payment-tracking → animations → responsive (every @media
                            block, including the desktop layout)
js/
  config.js               Brand name, contact info, bank details — edit this for a different branch/location
  restaurant-settings.js   Live-configurable delivery fee + bank details — subscribes to
                           Firestore, config.js is the offline-safe fallback; written by
                           admin/js/admin-settings.js, read by js/order.js + js/ui.js
  firebase.js              Firebase app init — inert until firebaseConfig has real values
  auth.js                   Sign up/in/out, password reset, change password, role checks
  auth-ui.js                 Auth modal chrome, view switching, nav profile control, the
                              generalized sign-in gate (checkout/favorite/review all
                              share it), and the account view (profile, favorites,
                              addresses, review history, order-history entry, password)
  auth-forms.js                Auth modal + account-view form validation and submit handlers
  firestore.js               CRUD + realtime listeners for users/menuItems/orders/reviews,
                              plus order-number generation (Firestore transaction)
  storage.js                  Firebase Storage — profile picture uploads, and (Phase 6)
                               the Admin Menu Manager's menu-photo uploads
  addresses.js                 Saved-addresses CRUD — Firestore-synced + localStorage-mirrored
  order-history.js              Order-history state — subscribes to your own past orders,
                                 with a timeout-based error state
  order-history-ui.js            "My Orders" list rendering — view (individual prices,
                                  delivery/payment/notes)/reorder/track/cancel per order,
                                  real loading skeletons
  store.js                    Central state (cart, fulfilment type, payment method) +
                               render dispatcher; cart round-trips through localStorage
  cart.js                      Add/remove/change quantity, stale-cart pruning, Order Again
  menu-data.js                  Menu data access layer (Firestore-first, falls back to
                                 data/menu.sample.js); tracks loading/error state
  menu-filter.js                 Search/category filter state + matching/highlighting logic
  menu-render.js                  Sticky search+category toolbar, the product-card grid,
                                   and a loading skeleton while the menu is fetching
  favorites.js                    Favorites state — real-time Firestore sync once signed
                                   in, localStorage-mirrored always
  product-modal.js                 Product Details modal
  reviews-data.js                   Review CRUD + rating-aggregate recompute + Verified
                                     Purchase check — no DOM
  reviews-ui.js                      Review list/form/replies rendering
  order.js                       Fulfilment/payment selection, order-total math, placing
                                  an order (real order numbers, duplicate-order guard)
  order-status.js                 Canonical order-status constants + timelines (the real
                                   model, fulfilment-type dependent — see
                                   PROJECT_CONTINUATION_SUMMARY.md's Phase 6 sections for
                                   how this reconciles with simpler task-brief wording)
  order-tracking.js                Live tracking view — reads real Firestore status when
                                    configured, falls back to a local simulation
                                    otherwise; progression is entirely customer-cancel/
                                    staff-driven now (no more stand-in auto-advance timer)
  toast.js                          One shared notification (failed background saves,
                                     offline/online banner)
  ui.js                             Modal chrome, cart view (incl. the saved-address
                                     picker and pickup-phone field), shared stepper/
                                     add-button controls, nav/scroll-reveal
  contact.js                        Contact sheet
  app.js                             Entry point — startup sequencing + event wiring
data/menu.sample.js       Today's actual menu data (fallback once Firestore is live)
firebase.json / firestore.rules / firestore.indexes.json / storage.rules
                           Firebase project config — every collection/bucket path this
                           project uses now has a real rule
```

## Firebase setup

The site works today with zero Firebase configuration (menu loads from
`data/menu.sample.js`, sign-in shows a friendly "not set up yet" message, checkout isn't
gated, favorites/reviews/addresses work locally — see
`PROJECT_CONTINUATION_SUMMARY.md`'s Known Limitations). To turn on real backend features:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) — this step can't be done from inside this codebase; it needs your own Google account
2. Register a Web App, copy its config object into `js/firebase.js`'s `firebaseConfig`
3. Enable Firestore Database, Authentication (turn on Email/Password and Google as sign-in providers), and Storage
4. Deploy `firestore.rules` — every collection this project uses (`users`, `orders`, `menuItems`, `menuCategories`, `menuLabels`, `deliveryZones`, `restaurantSettings`, `reviews`, `counters`) has a real rule now
5. Deploy `firestore.indexes.json` — needed for the order-history and review queries to actually return results instead of silently failing
6. Deploy `storage.rules` — needed before profile-picture uploads or the Admin Menu Manager's photo uploads will work; also enable the Storage↔Firestore cross-service permission in the console the first time (see that file's own header comment for why it's needed)
7. Edit `js/config.js` with your real bank transfer details (currently placeholders) — or leave the placeholders and set them live from the admin Settings page instead once staff sign-in works; either way is fine, `js/restaurant-settings.js` prefers whichever was saved to Firestore and falls back to `config.js` when nothing has been saved yet
8. Before launch, swap `data/menu.sample.js`'s placeholder Pexels stock photos for Albaik's own food photography — see that file's header comment

No other file needs to change — every module already calls the right functions; they just
start actually working the moment real config values are in place. The checkout/favorite/
review sign-in gates switch on automatically too — see
`PROJECT_CONTINUATION_SUMMARY.md`'s Authentication section for exactly why that's safe.

## Running locally

No build step, but ES modules require a real HTTP server (not `file://`):

```
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL.

## Remaining work

See `PROJECT_CONTINUATION_SUMMARY.md` for the full phase-by-phase breakdown, known
limitations, and exactly what's next — the small remainder of Phase 5, then the one piece
of Phase 6 still open (review moderation from the admin dashboard — everything else Phase
6 originally meant is done: Dashboard, Menu Manager, Categories, Labels, Delivery Zones,
Order Management, Customers, Analytics, and Settings), then Phase 7. Also see that file's
Honesty note for what's been real-browser-verified and what still hasn't: no phase,
including any admin feature, has been checked against a real Firebase project yet.

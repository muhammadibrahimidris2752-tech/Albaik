# Project Continuation Summary — Albaik Chicken Ordering Platform

Read this file first. It should be everything a new AI session needs to continue this
project without any other context.

## Honesty note for whoever picks this up

A previous session in this project's history asserted that Phase 1 was already complete
and that substantial implementation existed, before any project code had actually been
written — only a reference codebase had been partially studied. That was incorrect and
was corrected before Phase 1's work began. Everything described as "complete" in this
file was verified (syntax-checked, import/export-checked, diffed/cross-checked against
the real files) during the session that built it — see **Engineering decisions →
Verification**. Please hold the same bar: don't mark a phase complete, or describe a
feature as working, until you've actually built and checked it.

**Phase 2 addendum:** this environment has no network access and no real Firebase
project, and can't create one (that's a Google-account-holder's manual step — see
README's Firebase setup). So Phase 2's verification is the same *kind* as Phase 1's
(syntax, import/export, DOM-id cross-checks, careful manual tracing of every flow) but
could not include the one thing that would make it definitive: actually exercising
sign-up/sign-in/sign-out against a live Firebase project in a real browser. Treat
Phase 2 as "carefully built and reasoned through, not yet proven" until someone does
that. This isn't a gap anyone hid — it's flagged here, in the Known Bugs section below,
and in Pending Tasks, on purpose.

**Stabilization-pass addendum:** two follow-up sessions (still before Phase 3) found and
fixed three real bugs in the checkout flow — see **Stabilization pass** below. All three
were Phase 1-origin, and all three were caught using a new verification technique (a
real, executable Node simulation of the flow) that's strictly stronger than the
hand-tracing above for JS state — though the third bug (Bug 3, a CSS-cascade issue) also
needed CSS-specification reasoning the simulation itself couldn't cover, since the stub
does no real rendering. Still not a real browser or a real Firebase project. Pending
Task 1 still stands.

**Phase 3 addendum:** this environment still has no real browser and no real Firebase
project — that hasn't changed, and Pending Task 1 (below) is now three phases old. What
*did* change this phase: verification went further than Phase 2's hand-tracing and
roughly as far as the stabilization pass's simulation, but broader — a Node harness
stubbing `localStorage`/`document`/`window` actually **imported the entire real module
graph** (all 20 files under `js/`, every circular-import chain among them, not a curated
subset) and it loaded cleanly, which is a real, mechanical guarantee that every
`import {x} from './y.js'` in the whole project resolves to a real export (ES modules
throw at import time otherwise — this is stronger evidence than the regex-based
cross-check script used every phase before). On top of that, a second script exercised
cart math, localStorage persistence, stale-cart pruning, Order Again, menu filtering,
favorites (toggle/persist), and the full review lifecycle (submit → live rating
recompute → edit-as-upsert → reply → helpful toggle → delete → aggregate resets to 0)
against the real, unmodified business-logic functions — 27 assertions, all passing — plus
a third pass that opened the Product Details modal and its embedded reviews UI through
the real render functions to confirm they run to completion without throwing. **What
this still doesn't prove:** that the new CSS (the card grid, the desktop two-column
layout, the product modal) actually *looks* right, that the Pexels image URLs actually
load, or that any of this works against a real Firestore project. See **Known
bugs/limitations** below for the honest list.

**Phase 4 addendum:** still no real browser, no real Firebase project — Pending Task 1 is
now four phases old, and this phase is the biggest single argument yet for doing it before
anything else: it adds a Firestore transaction (`getNextOrderNumber`), several new
security rules including a first-ever `storage.rules` file with cross-service
`firestore.get()` calls, and a real-time-subscription-driven tracking view, none of which
this environment can exercise against a live backend. Verification followed the Phase 3
playbook and pushed it slightly further in one respect: the Node harness's DOM stub
previously answered every `querySelector()` call with a hardcoded `null`, which meant it
was silently NOT exercising any code path that populates an element via `innerHTML` and
then queries back into it (menu-render.js's `buildProductCard` is exactly that pattern,
and it predates this phase — Phase 3's own harness never actually ran it far enough to
notice). This phase's stub does a lightweight regex scan of whatever was last assigned to
`.innerHTML` so `querySelector('tag' | '.class' | '[attr="value"]')` can find a plausible
match — not a real parser, but enough to let `buildProductCard`, and every new Phase 4
`buildXRow()`-style function that follows the same pattern (`order-history-ui.js`,
`auth-ui.js`'s address/review rows), actually run to completion instead of crashing on a
stub limitation that has nothing to do with whether the application code is correct. With
that fix: the full module graph (27 files now) still imports cleanly; a DOM-id cross-check
(every `getElementById('literal-string')` call in `js/` against every `id="..."` in
`index.html`) found zero real mismatches (two flagged candidates —`productFavPill`,
`toast`— turned out to be IDs assigned dynamically via `el.id = '...'` rather than present
in static HTML, which is the correct, pre-existing pattern for both, not a bug); and a
business-logic script (45 assertions, all passing) exercised the order-status timeline
math, the full saved-addresses CRUD lifecycle (add → set-default → delete-the-default →
auto-promote → update), every Firestore-touching function's safe-fallback return value
when unconfigured, the menu loading-state flag transition, and cart/order total math for
both fulfilment types. **What this still doesn't prove**, on top of everything Phase 3's
addendum already couldn't: that the rewritten live-tracking view actually updates in
real time against a real `onSnapshot` listener, that the order-number transaction
actually behaves correctly under concurrent writes, that `storage.rules`' `firestore.get()`
calls are accepted by a real project (the cross-service Storage↔Firestore permission
link the Firebase docs describe has to be enabled once, in the console, the first time —
nothing here can do that step), or that any of the substantial new account-view UI
(avatar upload, addresses, review history, order history, password change) actually
looks or behaves correctly in a real browser. This is now the fourth phase in a row to
say some version of "please do Pending Task 1 before continuing" — see **Pending tasks**.

**Post-Phase-4 modal-fix addendum:** the first real thing to change across five addenda
in a row — a real browser actually touched this codebase this pass, headless Chromium via
Playwright, driving raw touch (CDP `Input.dispatchTouchEvent`, a genuine touchStart/
touchMove/touchEnd sequence) and wheel input against the live page, not a DOM/Node stub.
Scope was narrow and deliberate: a reported bug (Account modal frozen to touch on a
touchscreen Chromebook, working fine on Android) rather than a general audit. Confirmed
the bug in the real browser *before* touching any code — `overflow-y:hidden` /
`display:grid` on the modal body at a 1280x800 viewport, touch-drag and wheel both
leaving `scrollTop` at 0 — fixed it the same way Round 1 fixed the analogous product-modal
bug (see **Post-Phase-4 fix**, right after **Phase 4** below), then confirmed the fix in
the same real browser across touch-desktop/touch-mobile/mouse-desktop contexts, plus
re-measured that neither the order modal's nor the product modal's own desktop layouts had
moved (both identical to before). **What this still doesn't prove**, unchanged from the
Phase 4 addendum above: none of it. This pass verified one modal's scroll/touch/wheel
*mechanics* in a real browser — genuinely new evidence, not reasoning — but touched
nothing about real Firebase data, the live-tracking subscription, the order-number
transaction, or `storage.rules`. Pending Task 1 (the full real-Firebase-project
click-through) is unchanged and still stands; this only closes one specific,
previously-open question — does this modal actually scroll/drag correctly in a real
browser on a real device class — with an actual yes, rather than leaving it
reasoned-through-but-unproven like everything else in this file still is.

**Phase 6 (Admin Menu Manager) addendum:** built as a separate, self-contained page
(`admin/`) — zero customer-facing files touched, confirmed by a full byte-for-byte diff
against the pre-session project, not just by intent (see **Phase 6 — Admin Menu Manager**
below for why that was possible). Verification went a step further than the Post-Phase-4
modal fix: that pass drove real touch/wheel *mechanics* against the live page; this one
built a second copy of the new `admin/js/` files — byte-identical, diffed to confirm it —
served alongside hand-written in-memory replacements for `js/firestore.js`/`js/auth.js`/
`js/storage.js` (same exported function names and signatures, fake data instead of a real
backend), and drove the actual production rendering/validation/event-handling code through
real Chromium via Playwright: sign-in gating including the non-staff-gets-signed-back-out
race, full add/edit/delete with validation, badge toggles, on-the-fly category creation,
image upload wiring, row-level quick actions (availability toggle, display-order reorder),
three distinct empty-state messages (search-empty vs. filter-empty vs. genuinely-empty),
and responsive layout at mobile/tablet/desktop with screenshots — 85 assertions, all
passing, plus 14 more against the pure filter/sort logic directly (no DOM, same tier as
`menu-filter.js`'s own verification) and 7 against the real, unmocked page confirming it
degrades cleanly rather than crashing when Firebase is configured but genuinely
unreachable, which is this sandbox's actual condition. This process caught a real bug
before it shipped: the exact `[hidden]`-loses-to-author-`display` issue this file already
documents for `.cart-badge` (see that rule's own comment in `css/order-modal.css`)
recurred in two new places — `.admin-gate` and the item-form image preview `<img>` — same
fix applied. It also caught two mistakes in the test assertions themselves (a hand-typed
sort expectation with an arithmetic slip, and two cases of asserting an uploaded/typed
image URL would render when the URL didn't point to a real image) — both corrected in the
test code, not the application code, once checked by hand against what the code actually
does. **What this still doesn't prove**, unchanged from every addendum above: this is
still not a real Firebase project. Whether a real `addMenuItem()`/`updateMenuItem()`/
`deleteMenuItem()` write actually lands in a real `menuItems` collection, whether
`storage.rules`' staff/admin write gate is actually enforced the way `firestore.rules`
intends, whether an uploaded photo actually reaches a real Storage bucket and the
returned download URL actually resolves, and how any of this looks or behaves on a real
staff device are all exactly as unverified as they were before this session. Pending Task
1 is unchanged and still stands — it now also covers this new admin surface, not just
everything from Phase 3/4.

**Phase 6 (Order Management) addendum:** two genuinely different pieces this time — the
customer-facing My Orders enhancements (error state, real loading skeletons, unit prices,
delivery/payment detail, a real Cancel Order action) touch `index.html`/`js/`/`css/`
directly, unlike the Menu Manager, which never did; the admin Orders Dashboard is the
Menu Manager's sibling, added to the same self-contained `admin/` page. Before writing any
code, this session's own task doc was checked against what's actually in this codebase —
its assumed 5-status vocabulary (Pending/Preparing/Ready/Completed/Cancelled) doesn't match
`js/order-status.js`'s real 8-value, fulfilment-type-dependent model, the exact same
mismatch that file's own "PHASE 4 addendum" already resolved once before for a
similarly-worded brief. Resolved the same way again rather than inventing a second status
system: the real model stays the single source of truth everywhere data is written; the
brief's simpler words became FILTER LABELS in `admin/js/admin-orders-filter.js` that group
real statuses, documented inline. `js/order-tracking.js`'s `scheduleAutoAdvance()` — a
stand-in explicitly built and documented, in Phase 4, to be replaced the moment a real
admin dashboard could drive order status for real — was retired now that this phase built
exactly that; kept, the two would have raced each other on every new order.

Verification followed the same four-tier shape the Menu Manager's addendum above
describes, extended to cover both new surfaces: 14 pure-logic unit tests against the new
`admin-orders-filter.js` (search/status-grouping/sort, including the real-vs-brief status
mapping); real-Chromium/Playwright assertions against a byte-diffed mock harness — 21 for
the admin order list (search, filter, sort, row-level status changes with live
re-rendering, cancel-requires-confirmation), 20 for the order detail modal (full content,
the reused timeline rendering the correct real stages for both fulfilment types, a
cancelled order showing its own distinct state, live updates while open), 20 for customer
My Orders (live subscription, expanded detail content, Cancel Order visible only at the
right status, native `window.confirm()` matching this side's own established pattern), and
9 more isolating the three loading/empty/error states specifically — including the error
state's 12-second timeout, confirmed with Playwright's clock-fast-forward API rather than
either skipping it or actually waiting 12 real seconds. The full previous Menu Manager
suite (85 assertions) was re-run against this session's final code too, confirming it
still passes unchanged. Building the fuller mock this pass required (the customer page
imports far more of `js/firestore.js`/`js/auth.js` than the admin-only page did) surfaced
its own bugs along the way, each found by an actual browser console error and fixed before
it could hide a real one: several missing mock exports (review functions, profile
functions, `uploadProfilePicture`), and a mock `login()`/`loginWithGoogle()`/`signUp()`
return-shape mismatch against what Firebase's real `UserCredential` looks like, which
`js/auth-forms.js` destructures — masked in last session's admin-only mock (nothing there
touches the return value), only surfaced once a real customer sign-in flow was actually
exercised. One test itself needed fixing along the way too — a hand-seeded mock order
list's timestamps weren't in `orderNumber` sequence (realistic, but this pass's own sort
test wrongly assumed they were); recomputed from the actual seed data and fixed, same
"check the test, not just the code" discipline as the Menu Manager pass before it.

This session also found `js/auth.js`/`admin/js/admin-auth.js`/`admin/index.html` already
changed from what was delivered last session — Google sign-in wired into the admin gate,
plus an unused `linkPasswordToAccount()` function — from work done outside this
conversation between sessions. Investigated rather than assumed: confirmed
`loginWithGoogle()` itself already existed pre-session (only the admin gate's use of it is
new), confirmed the new function is genuinely unused anywhere, left both exactly as found
per this phase's own "don't modify authentication unless absolutely necessary" instruction
— fixed only one thing in that area, a set of inline styles on the new Google button/divider
that didn't match this project's established "static layout belongs in a stylesheet"
convention, which is a presentation-only change with no behavior implication.

**What this still doesn't prove**, unchanged in kind from every addendum above: still not
a real Firebase project. Whether a real customer's cancel request or a real staff status
change actually lands in a real `orders` document, whether `firestore.rules`' order-read
gating actually behaves the way the admin dashboard's own "only fetch once staff is
confirmed" reasoning assumes, and how any of this looks on a real device are all exactly as
unverified as they were before this session. Pending Task 1 is unchanged and still
stands — it now also covers both new Order Management surfaces.

**Phase 6 (Admin Dashboard, continued) addendum:** this session's brief said, in its own
words, to treat the uploaded ZIP as the only source of truth and ignore assumptions from
earlier conversations — sound advice this file itself needed applied to it. This
document's own **Current status** claimed Categories, Labels, Customers, and Analytics
hadn't been started; reading the actual code first (as the brief also required, before
changing anything) found all four fully built and working. Nothing here says the earlier
work was wrong — it wasn't; every part of it checked out — only that this document's
*record* of what existed had quietly gone stale, for reasons this session has no way to
determine (a prior session's work not making it back into this file, most likely). This
session's own new work — Delivery Zones, Settings (and wiring it to have real effect on
checkout), the live Menu Manager, Low Stock, the legacy-label import, and two small
pre-existing-bug fixes found along the way (a dead `adminDashboardDataNote` reference, and
Categories/Labels' delete confirmations using `window.confirm()` instead of this project's
own shared dialog) — was verified the same *kind* of way every phase before this one was:
syntax-checked, import/export cross-checked (across all 47 project JS files, not just the
changed ones), DOM-ids cross-checked, and re-read carefully enough to catch and fix two
real logic bugs before they shipped (see **Phase 6 — Admin Dashboard (continued)**'s own
honesty note, and **Handoff notes**, for exactly what that did and didn't cover this time —
notably lighter than the Playwright-driven passes before it: this environment had no
browser tool available at all).

**What this still doesn't prove**, unchanged in kind from every addendum above: still not
a real Firebase project, still not a real browser — if anything, this pass's evidence is
one tier lighter than the Admin Menu Manager and Order Management passes specifically
achieved, since neither a DOM stub nor a real Playwright browser was available this time.
Treat every new admin section from this pass (Delivery Zones, Settings, the Dashboard's Low
Stock panel) as carefully built and reasoned through, not yet proven, exactly the caution
this note has asked for every single time so far — and treat this document's OTHER
sections with a little more suspicion than before, too: it was wrong about four fully-
shipped features until this session happened to check.

## Project overview

- **Purpose:** turn a single-file HTML/CSS/JS restaurant-ordering prototype (Albaik
  Chicken, Gwarzo Road, Kano, Nigeria) into a production Firebase-backed ordering
  platform, without changing the existing visual design or UX.
- **Current objective:** Phase 4, Firebase Integration, Checkout & Orders, is complete —
  it also absorbed most of Phase 5's originally-planned scope (profile picture,
  saved-addresses CRUD, password management, order/review history — see **Phase 4** for
  why). Phase 6, Admin Dashboard, is next; Phase 5 is now light — see **Still open**.
- **Stack:** vanilla HTML/CSS/JS (ES Modules), Firebase Authentication, Cloud Firestore,
  Firebase Storage. No frameworks, no bundler, no build step.
- **Reference project:** a previous e-commerce project ("Kitchen & Home By Noor") was
  provided as an architecture reference for Phase 1 — its engineering patterns were
  studied and reused; none of its e-commerce-specific code or content was copied.
- **UX references:** the Domino's Nigeria ordering site (dominos.ng) was provided for
  Phase 2's kickoff (see **Customer experience spec**); Phase 3 additionally received
  Domino's screenshots (customer flow), Temu screenshots (compact product-card
  information hierarchy), and a Thai-food-site screenshot (food photography sizing) as
  UX-only references — explicitly not to be visually cloned. See **Phase 3** below for
  what was actually borrowed vs. deliberately not.

## Current status

- **Current phase:** Phase 6 — Admin Dashboard is now complete except review moderation.
  See **Phase 6 — Admin Dashboard (continued)** below for this round's work (Dashboard
  live stats/Low Stock, a live Menu Manager, Delivery Zones, and Settings) — and for an
  important correction: this round started by re-reading the actual code rather than
  trusting this document, per its own brief's explicit instruction, and found that
  Categories, Labels, Customers, and Analytics (plus the Dashboard's original stat cards)
  were ALREADY fully built and working — just never written up here. That earlier work
  isn't re-described in detail below since it was already correct; this document is
  simply catching up to what the code has actually contained for a while. Take the
  "Remaining" line below as current as of this pass, but treat any *other* phase's status
  in this document with the same "verify against the code first" caution this pass had to
  apply to Phase 6 — the gap here was real and this may not be the only one.
- **Overall completion:** roughly 4/7 phases plus all of Phase 6 except review moderation.
  Phase 5's small remainder (see **Customer experience spec**) is unchanged and still
  pending — all of Phase 6 was built on explicit instruction, out of phase order, so its
  absence isn't a sign anything went wrong.
- **Completed:** Phase 1 — Foundation & Architecture. Phase 2 — Authentication & User
  System. Phase 3 — Menu & Customer Experience. Phase 4 — Firebase Integration, Checkout
  & Orders (including most of Phase 5's original scope — see **Phase 4**). Phase 6 —
  Admin Dashboard: Dashboard, Menu Manager, Categories, Labels, Delivery Zones, Order
  Management, Customers, Analytics, and Settings.
- **Remaining:** the small remainder of Phase 5; review moderation (the one piece of
  Phase 6 still open); Phase 7 — Testing/Optimization/Polish.

## Phase 3 — Menu & Customer Experience

Built directly on the Phase-2-stabilized codebase per an explicit "preserve everything,
extend don't rewrite" brief. Every item below shipped; nothing was descoped silently —
anything not built is named in **Known bugs/limitations** or **Customer experience
spec** instead.

**1. Menu redesign.** The order modal's `#menuList` — a flat, category-grouped list of
icon+name+price rows — is gone, replaced by `js/menu-render.js`'s responsive product-card
grid (`css/product-grid.css`): real photo, up to four badges (Signature/Best Seller/
Popular/New, each independently boolean on the item), a favorite heart, name, a
2-line-clamped description, star rating + review count, price, and an add button/qty
stepper that's the exact same control the cart view uses (`js/ui.js`'s exported
`buildStepper`/`buildAddBtn` — one control, one place its behavior can be wrong). Cards
are 1-column on mobile (room for **large** images, per spec), 2-column at ≥640px
(tablet), 3-column at ≥1024px (desktop, inside the now-narrower main column — see
**Responsive layout** below).

**2. Real food images.** Every item in `data/menu.sample.js` got an `image` URL —
real food photography, sourced via web search against Pexels (explicitly free-to-use,
no-attribution-required stock photos — see that file's header comment) since this
sandbox has no outbound network access from the bash tool and couldn't otherwise fetch/
verify binary image content. **These are placeholder/demo images, not Albaik's own
photography** — flagged prominently in that file's header, in README's Firebase setup
step 7, and again here. Each card and the product modal both lazy-load (`loading="lazy"`)
and fall back gracefully to the item's `icon` emoji (Phase 1's original data, kept
specifically to serve as this fallback) via an `<img>` `error` listener if the URL 404s
or the browser blocks it — never a broken-image icon.

**3. Firestore menu schema.** Expanded and **renamed** (not just added-to) to match the
brief's exact field list: `name, description, price, category, image, rating,
reviewCount, isPopular, isNew, isSignature, isBestSeller, available, displayOrder`. The
rename (`desc`→`description`, `cat`→`category`, and the old single `tag` string replaced
by the four boolean badge fields) touched every read site — `js/menu-data.js`,
`js/ui.js`'s `renderUpsell` — grepped clean afterward (see Verification). `available`
(customer-facing menu filters out `=== false`, defaulting missing-field items to shown)
and `displayOrder` (ascending sort, per-category numbering — see `menu-data.js`'s
`getMenu()` comment for why a single whole-array sort still produces correct per-category
order once a caller filters down to one) are both new and both live in `getMenu()`
itself, so every consumer gets correctly-filtered, correctly-ordered data for free.

**4. Search.** `js/menu-filter.js` (pure state/logic, no DOM — deliberately isolated so
it's unit-testable without a browser, see Verification) matches name, description, *and*
category text, always combined with whatever category is active — never one replacing
the other, per the brief's explicit "works together with category filtering." Matches
highlight via a real `<mark>` tag (`highlightMatch()` — escapes both text and query
before building the regex, so a search query can never inject HTML). A suggestions
dropdown (`js/menu-render.js`'s `renderSuggestions()`) shows the top 6 matches while the
search input has focus; picking one fills the input and re-filters. `js/utils.js` gained
`escapeHtml()` for this and, more importantly, for reviews (see below) — the FIRST user-
generated content this project has ever rendered via `innerHTML`; every review/reply/
display name goes through it now, unlike menu item text, which is staff-authored/trusted
and was never escaped (and still isn't — that's correct, not an oversight).

**5. Category navigation.** Sticky (`position:sticky` inside `#view-menu`'s own scroll
context — see **Responsive layout**), pills for `All` (a UI-only pseudo-category,
never a real stored value — see `menu-filter.js`) plus whatever `getCategories()`
returns: `Chicken, Rice, Burgers, Wraps, Sides, Desserts, Drinks`. `data/menu.sample.js`
was re-categorized (and expanded from 9 to 16 items, adding Nigerian dishes — Jollof
rice, peppered chicken, puff puff, chin chin, Chapman — specifically so every category
has at least two real items, not an empty tab) from the old 3-category `Mains/Sides/
Drinks` scheme, which no longer exists anywhere in the codebase.

**6. Product Details modal.** New top-level overlay, `#productOverlay` (`js/
product-modal.js`, `css/product-modal.css`) — reuses `.order-overlay`/`.order-modal`/
`.order-modal__header`/`.icon-btn` chrome from `order-modal.css`, the same convention the
Phase 2 auth modal established. Full-bleed hero image (a negative-margin trick that
exactly cancels the body's own padding — see that CSS file's comment if this ever needs
re-deriving), badges, favorite toggle, full description, the same qty stepper/add-button
as everywhere else, up to 4 related items from the same category (click one → the modal
re-opens for that item), and the embedded reviews section (`js/reviews-ui.js`). Opens
from a card click — everywhere EXCEPT the favorite button and the add/stepper controls,
per the brief; those three controls all call `stopPropagation()`, and the card's own
click handler ALSO explicitly excludes them via `closest()` as a second line of defense
(documented in `menu-render.js` as deliberate redundancy, not dead code). Stacks on top
of whichever modal it was opened from (order modal while browsing, or the auth modal via
a favorited item in the account view) — `app.js`'s Escape-key handling checks it first,
being the topmost overlay whenever it's open.

**7. Favorites.** `js/favorites.js` — a `users/{uid}.favorites` string array (one more
field on the profile doc Phase 2 already writes to, not a new collection/rule) synced
once signed in, always mirrored to `localStorage` too so it works with zero Firebase
configured (this sandbox's reality) and paints instantly on load rather than waiting on
an async Firestore read. **Gated on sign-in** using the exact same guard-and-resume
pattern Phase 2 built for checkout — `openAuthPromptForCheckout` was generalized into
`openAuthPromptForAuth(reason, onResume)` in `auth-ui.js` (kept the old name as a thin
wrapper so `order.js` needed zero changes), reused by favorites and reviews with their
own banner copy. The gate only engages once `isFirebaseConfigured()` is true — same
invariant as checkout, so hearts work immediately and locally on an unconfigured project.
Browsable and removable from the account view's new Favorites section
(`auth-ui.js`'s `renderAccountFavorites()`), which is deliberately a plain list, not the
full card grid — a compact summary inside an already-compact modal.

**8. Reviews.** The biggest new subsystem: `js/reviews-data.js` (Firestore CRUD +
rating-aggregate recompute, no DOM) and `js/reviews-ui.js` (form/list/replies rendering,
embedded in the product modal). Rate/write/edit/delete your own review; anyone else
signed in can reply or mark it helpful (never both the same field — see
`firestore.rules`). **Deterministic review doc ids** (`${itemId}_${uid}`, set in
`js/firestore.js`'s `upsertReview()`) are what make "one review per user per item" true
*by construction* — a second submit for the same item overwrites the customer's own
prior review (i.e. IS the edit) rather than needing a separate existence check, both in
code and in the matching Firestore rule. Rating/reviewCount are **denormalized fields on
the menu item itself**, recomputed from the full review list and pushed to both the
local menu cache (instant UI update) and Firestore (`firestore.rules` has a
field-scoped rule letting any signed-in customer touch *only* those two fields — see
**Firestore** below) every time a review is added, edited, or deleted. **Verified
Purchase is schema-ready and intentionally inert** — every review is created with
`verifiedPurchase: false` and nothing anywhere ever sets it true yet; the badge only
renders when true, so it correctly never shows today. Activating it for real needs
order history to check against, which doesn't exist as a queryable feature until Phase 4
— see **Customer experience spec**, which had flagged this exact dependency before Phase
3 started.

**9. Shopping cart.** Now round-trips through `localStorage` (`js/store.js` — seeded at
module load, saved on every `setState()`, not just cart-touching ones — simpler than
tracking which patches touched cart, costs nothing measurable). Still never disappears
during sign-in (unchanged Phase 2 guarantee — nothing about persistence touches that),
and still only clears after a successful Firestore order write (unchanged stabilization-
pass fix). Persistence opened one new edge case that literally could not happen before
(a cart surviving past a single page load at all): a saved cart referencing an item id
that's since been removed/renamed. `js/cart.js`'s new `pruneCartToExistingItems()`,
called once in `app.js`'s `init()` right after `loadMenu()` resolves, closes that gap —
a no-op on every normal run. **"Order Again"** (`js/cart.js`'s `reorderFromOrder()`) is
additive (never replaces an existing cart), silently skips any line whose item no
longer exists, and today has exactly one call site — a button on the tracking view,
right after a successful order (see **Known bugs/limitations** for why this isn't yet a
general "reorder from my order history" feature).

**10. Responsive layout.** Still one HTML file, one JS codebase — no separate desktop
build. Mobile (<640px): unchanged "ordering sheet" shape, 1-column cards, sticky
search+category toolbar, the footer's View Cart button was already effectively sticky
(flex:none, doesn't scroll) before this phase and needed no change. Tablet (640–1023px):
modal widens to 640px, 2-column grid. **Desktop (≥1024px)**: the modal widens further
(94vw, up to 1180px) and `#view-menu`/`#view-cart` render **side by side** — a persistent
cart sidebar, not a "tap to view cart" flow — while payment/tracking stay single-column
focused steps. The mechanism is one small, additive line in `js/ui.js`'s `showView()`:
toggling an `order-focused` class on `#orderOverlay` (true only for payment/tracking).
Everything else is pure CSS (`css/responsive.css`'s `min-width:1024px` block) reading
that one flag — `#view-menu`/`#view-cart` forced visible together via a higher-specificity
selector (`#orderOverlay.order-focused #view-menu{display:none!important}` beats the
lower-specificity always-visible rule precisely when focused), and `#continueBtn`'s
`!important` override is specifically needed because `showView()` sets that button's
`display` via inline style, which normally beats any stylesheet rule except an
`!important` one — see that CSS block's own header comment, the reasoning is non-obvious
enough to be worth re-reading rather than re-deriving from scratch. **This layout has
never been seen in a real browser** — see Known bugs/limitations.

## Post-Phase-3 desktop polish passes

Two follow-up requests, both before Phase 4, both explicitly scoped as "UI/UX only — no
architecture, no new features, no logic changes, preserve mobile." Documented as two
rounds below since they fixed genuinely different things (a layout bug, then an
information-density redesign), not one continuous change.

### Round 1 — layout fix (the modal wasn't getting desktop styling at all)

The first request: the Product Details modal "still behaves like a stretched mobile
layout" on desktop. That report turned out to be exactly right, and exactly the kind of
thing this project's Node-based verification (see Honesty note) can't catch, since it's a
real-browser rendering/cascade issue, not a logic bug.

**Root cause.** Phase 3's desktop block (`css/responsive.css`, `min-width:1024px`) styles
`.order-modal`/`.order-modal__body` — bare class selectors — to build the menu+cart
sidebar layout. The Product Details modal (`#productOverlay`) **also** carries those same
two classes, purely for chrome reuse (see `css/product-modal.css`'s header comment) — so
those rules were landing there too: `max-width:1180px; width:94vw` and `display:grid;
grid-template-columns:1fr 380px; padding:0; overflow:hidden`, none of which make sense
for a product-detail layout with two totally different children. The product modal had
never been given its own desktop rules at all in Phase 3 — it was, quite literally, a
stretched mobile layout at desktop widths, not just resembling one.

**Fix.** Added new rules to the *same* `min-width:1024px` block in `css/responsive.css`
(still the one place every `@media` block lives), every selector prefixed with
`#productOverlay` (or the unique `#productModalBody` id). `#productOverlay .product-modal`
has specificity (1,1,0) against the leaked `.order-modal`'s (0,1,0); `#productModalBody`
alone is (1,0,0) against `.order-modal__body`'s (0,1,0) — both strictly higher, verified
with a small specificity-calculator script rather than assumed, so the new rules win
regardless of source order **without editing either existing rule**. Zero JS or HTML
changed; `css/responsive.css` is the only file this pass touched.

**What the new rules do, concretely:**
- `#productModalBody` becomes a 2-column grid (`minmax(0,1fr) minmax(0,1fr)`, 44px
  column gap): row 1 is image | info; `.product-modal__related` and
  `.product-modal__reviews` (no explicit `grid-row`, so they auto-place into rows 2/3)
  each get `grid-column:1 / -1` to span full width below.
- `.product-modal__hero` drops the mobile full-bleed negative-margin trick (`margin:0`
  instead) and becomes its own rounded card (`border-radius:var(--radius)`, fixed
  `height:430px`, `aspect-ratio:auto` so height — not a width-based ratio — governs its
  size) — matches the spec's "max height ~400–450px" and "rounded corners" literally;
  the `<img>`'s own `object-fit:cover` (untouched, `css/product-modal.css`) still governs
  cropping/quality.
- `.product-modal__info` becomes a flex column with **no** `align-self` override — the
  grid's default `stretch` is what lets it match the image's 430px height, which is what
  makes `.product-modal__price-row{margin-top:auto}` actually have empty space to push
  into, grounding the price/quantity/Add-to-Cart row at the bottom of that column instead
  of immediately trailing the description. Combined with the grid, this is what makes
  "Add to Cart stays visible without scrolling" literally true: it now sits inside the
  same always-visible row 1 as the image, rather than somewhere further down a long
  single column. The Add button/stepper get a modest size bump (`padding:13px 28px`,
  38px stepper buttons) scoped to *this* row only — `css/order-modal.css`'s shared
  `.add-btn`/`.qty-stepper` rules (used by cart lines and every product-grid card) are
  untouched.
- Related items: no change to the horizontal-scrolling row itself
  (`.product-related__row` was already `display:flex; overflow-x:auto` — never actually
  "stacked" — see `css/product-modal.css`) — it just needed its *container* to get full
  width, which the grid leak had been preventing. Cards got a modest size bump (120px →
  150px wide) for desktop presence.
- Reviews: `js/reviews-ui.js`'s own structure (heading → write/edit form → review list
  with replies/helpful/verified-purchase) is completely untouched — this pass only adds
  `max-width` caps on the form and each review item (640px / 760px) so a full-width
  section doesn't force uncomfortably long text lines, a common "wide section, narrower
  text column" pattern rather than a structural change.

**Verification this pass.** `css/responsive.css` brace-balance; a specificity-calculator
script confirming the new selectors mathematically outrank the leaked ones (not just
"should" — actually computed and compared); the full-module-graph Node import test
re-run to confirm zero JS impact (trivially true — no JS file was touched — but
confirmed rather than assumed); a grep-based check confirming `product-modal__*`/
`product-related__*` classes never appear inside the order modal's own markup and
`#productModalBody` is a genuinely unique id, so there's no reverse-direction leakage
either. **Still not verified in a real browser** — if anything, this pass is a concrete
example of why that still matters: everything about this bug was invisible to syntax
checks, import/export checks, and even the integration-scenario Node tests from Phase 3,
because it's a CSS cascade issue in a dimension none of those touch. It took a human
actually looking at the rendered page to catch it. Treat this fix with the same
"carefully reasoned through, not yet proven" status as everything else in this project
until Pending Task 1 happens.

### Round 2 — informational redesign (richer right column)

The second request: even after Round 1's layout fix, the desktop product modal "still
feels visually empty compared to the mobile version" — a reference screenshot (a richer
product-detail layout: large heading, rating, feature-pill badges including a labeled
Favorite pill, full description, a 2×3 meta-info grid — category/availability/prep-time/
spice-level/restaurant/calories — price+quantity+Add-to-Cart, and a bottom trust-badge
row) was provided as layout inspiration, with the same "no architecture/logic/feature
changes, UI/UX only" scoping as Round 1, plus one explicit new constraint: **don't invent
data that doesn't exist** — show optional fields (prep time, calories, serving size, spice
level) only when real, or design clean placeholders, never fabricated values.

**What's real vs. what isn't.** This is the load-bearing distinction for this whole round:
- **Always rendered (real, existing data):** name (now also a large in-body heading, not
  just the header bar's small title), rating, review count, description, price, quantity/
  Add to Cart — all pre-existing. Category (`item.category`), availability
  (`item.available`), and restaurant name (`js/config.js`'s `BRAND_NAME`) are also real
  fields that simply weren't surfaced in the modal before — now shown in a new meta-info
  grid.
- **Conditionally rendered, currently always absent:** prep time, spice level, calories/
  serving size — none of these exist anywhere in `data/menu.sample.js`'s schema. Rather
  than invent plausible-looking numbers, `js/product-modal.js`'s `renderMetaGrid()` only
  adds a grid cell for each when the corresponding field (`item.prepTime`, `.spiceLevel`,
  `.calories`, `.servingSize`) is actually present. Today's 16 menu items have none of
  these fields, so the grid currently always shows exactly 3 cells (Category/
  Availability/Restaurant) — verified directly (see Verification below), not assumed. The
  moment a future phase adds e.g. `prepTime` to one menu document, it appears with zero
  further code changes.
- **Static, universal, not per-item data:** the bottom trust row ("100% Halal", "Freshly
  Made", "Secure Packaging") — plain HTML in `index.html`, no JS involved, since it's
  identical for every product rather than something that could vary per item. This
  mirrors the reference layout's own bottom trust strip, which shows the same pattern.
  "Feature highlights" from the request's own text (Halal, Freshly Prepared) map to this
  static row; "Signature recipe" maps to the real `isSignature` per-item flag (via the
  new pills row, described next); "Chef's recommendation" and per-item spice level had no
  corresponding real field or an obvious safe inference, so neither was added — named here
  explicitly rather than silently dropped.
- **New feature-pills row:** a Favorite pill (a second entry point to the exact same
  `toggleFavorite()`/`isFavorite()` favorites logic the existing image-overlay heart
  already used — both are kept in sync by the same `renderFavoriteButton()` call, not two
  independent copies) plus whichever of Signature/Best Seller/Popular/New are true for
  that item — the same per-item flags `renderBadges()` already puts on the image, shown a
  second time as labeled pills; the reference layout does this too (a corner badge on the
  photo AND a pill near the heading), not one replacing the other.

**Scope discipline.** All four new elements (heading, pills, meta-grid, trust row) are
`display:none` by default (`css/product-modal.css`) and switched on only inside the
existing `min-width:1024px` block (`css/responsive.css`) — the mobile/tablet product
modal is byte-for-byte unchanged in behavior; only new, additively-hidden markup exists
for it to ignore. `js/reviews-ui.js` (reviews) and `js/favorites.js`/`js/reviews-data.js`
(the actual favorite/review logic) were not touched at all — the new favorite pill and the
reviews section both call into that same, unmodified code. Files touched: `index.html`
(new elements added to `.product-modal__info`, nothing removed), `js/product-modal.js`
(new render functions + `BRAND_NAME` import), `css/product-modal.css` (base/hidden styles
for the new elements, `white-space:pre-line` added to the description for future
multi-paragraph support), `css/responsive.css` (desktop `display` overrides + a bumped
450px hero height, up from Round 1's 430px, to comfortably fit the richer info column).

**Verification this round.** Same battery as every pass (syntax, full-module-graph
import, HTML/CSS balance, specificity checks confirming the new `display` overrides
correctly outrank the base `display:none` rules) — plus the integration-test harness
itself needed a real fix first: its `getElementById` stub had been creating a fresh,
disconnected fake element on every call rather than a persistent one, which is harmless
for the Phase 3 tests (all state-based) but meant it *couldn't* verify DOM content at
all. Upgraded to an id-keyed registry (persistent elements across calls), then used it to
directly confirm: the meta-grid's actual rendered HTML contains "Category"/"Burgers",
"Available now", and "Restaurant"/"Albaik Chicken", and does **not** contain "Prep Time",
"Spice Level", "Calories", or "Serving" for a real menu item — i.e. the no-invented-data
requirement is met in the code that ships, not just in intent. Also confirmed the large
heading shows the correct product name, and that both favorite entry points (overlay
heart + new pill) toggle in sync in both directions. What this round could NOT verify,
same honest caveat as always: whether the richer info column actually fits comfortably
within the image's 450px height on a real screen, or needs further adjustment once
someone actually looks at it — a real risk given how much more content this round added
to that column, flagged plainly rather than assumed away.

## Phase 4 — Firebase Integration, Checkout & Orders

Built on the Phase-3-stabilized codebase per a detailed, explicitly-numbered brief (15
sections) that also pulled most of Phase 5's originally-planned scope ("Profile &
Settings") into this phase directly — its own section 11 asked for personal-info editing,
avatar upload, saved addresses, review history, order history, settings, and password
management, all under "Phase 4". Followed as the authoritative, most-recent scope rather
than the older 7-phase plan's division of labor — see **Still open** for what that leaves
for Phase 5. Same "preserve everything, extend don't rewrite" brief as Phase 3; nothing
below redesigned an existing visual surface — new sections were added to the account view
the same way Phase 3 added the favorites section to it, not by changing anything that was
already there.

**1. Firebase integration groundwork.** `js/storage.js` — the first Firebase Storage
usage in this codebase (Storage itself was configured back in Phase 2's setup steps, but
nothing wrote to it until now). `storage.rules` — a new file, first Storage ruleset this
project has needed, including cross-service `firestore.get()` calls to check a signed-in
user's `role` for menu-image write access (unused by any UI until Phase 6, prepared per
the brief's own instruction). `firebase.json` gained a `storage` key pointing at it.
`firestore.rules`' `orders/{orderId}` create rule gained a `userId == request.auth.uid`
check (previously accepted any signed-in user's claimed `userId` at face value — real
hardening now that checkout is what actually exercises this path, not preparatory). A new
`counters/{counterId}` collection backs order-number generation (**3** below).

**2. Menu loading & error states.** `js/menu-data.js` gained `isMenuLoading()`/
`didMenuLoadFail()`; `js/menu-render.js` shows a shimmering skeleton grid
(`.product-card--skeleton`, same `.product-card__media`/`.product-card__info` classes as
a real card so nothing reflows once real data arrives) while the very first `loadMenu()`
call is in flight, and a small non-alarming notice when Firebase is configured but the
fetch itself failed (never when simply unconfigured — that's not an error, just this
project's current setup state). Fixed a real, if latent, production bug while doing this:
`app.js`'s `init()` used to expose the `onclick=""` bridge and wire every control only
*after* `await loadMenu()` — harmless in this sandbox where `loadMenu()` resolves near-
instantly (nothing has ever been configured here), but against a real Firebase project
it's a genuine network round trip, during which tapping "Order Now" would have hit
`onclick="openOrderModal()"` with no such function on `window` yet. Bridge/wiring now runs
first; the menu grid shows its loading skeleton for whatever window remains.

**3. Checkout.** `js/order.js`: pickup orders now validate a contact phone
(`#pickupPhoneField`, mirrors `#addressField` exactly — same CSS, zero new rules needed)
the same way delivery orders validate an address — only pickup, since the spec calls these
out as two distinct requirements and a delivery order already collects an address for the
courier. `placeOrder()` gained an in-flight guard (a second tap while the first is still
running is a no-op, not a duplicate order) and a visible "Placing order…" button state.
Every order now gets a real, collision-free `orderNumber` (`AB-000123`, via
`js/firestore.js`'s `getNextOrderNumber()` — a Firestore transaction against
`counters/orders`, see **Firestore**) instead of the old 4-digit client-random id (only
9000 possible values — a real collision risk at more than a handful of orders); falls back
to that same old random format if unconfigured or the transaction fails, so checkout is
never blocked by it. `paymentStatus` (`'awaiting_confirmation'` for bank transfer,
`'unpaid'` for cash) and `customerPhone` (the pickup phone field, or the signed-in
customer's saved profile phone for delivery — best-effort, not required) were added
alongside the existing `paymentMethod`. A signed-in customer can tick "save this address
for next time" while checking out (`js/addresses.js`'s `addAddress`, fire-and-forget — a
failed save here doesn't block the order itself), and sees a row of saved-address chips
above the address field if they have any (`js/ui.js`'s `renderSavedAddressPicker`) — both
new, and the delivery address auto-fills from their default saved address when the field
is empty. Checkout failures (never actually observed against this unconfigured project,
but now handled rather than assumed impossible) surface a plain inline message
(`#checkoutError`) instead of leaving the button stuck.

**4. Orders.** Already Firestore-backed since Phase 2 (`saveOrderToFirestore`); this
phase completed the field set the brief's section 7 asks for (order number, user id,
customer name/email/**phone**, items/quantities/prices, totals, delivery method/address,
**payment status**, order status, created timestamp) and fixed an identity-model gap: the
order object's own `id` field used to just BE the client-random display id, and the real
Firestore document id `saveOrderToFirestore` returns was silently discarded by its only
caller — meaning nothing could ever have correctly looked an order back up by its real id.
Now: `orderNumber` is the human-facing display string (works with or without Firebase
configured); `order.id` is only ever the real Firestore document id, attached after a
successful save, and only ever used for real lookups (`subscribeToOrder`,
`updateOrderStatus`) — the same `{id: d.id, ...d.data()}` convention every other Firestore-
backed list in this codebase already uses (menu items, reviews).

**5. Order History.** Entirely new: `js/order-history.js` (data — subscribes to
`subscribeToUserOrders` once signed in, same shape as `favorites.js`/`addresses.js`, no
localStorage mirror since order history is inherently server-side data a guest never has)
and `js/order-history-ui.js` (rendering — a new `authView-orders` view in the auth modal,
reached via a "View Order History →" link near the top of the account view). Each order
row shows its number, a relative date, a status badge, item count + total, and three
actions: **View** (expand/collapse line items inline), **Order Again**
(`cart.js`'s existing `reorderFromOrder`, now genuinely general-purpose — its one call
site used to be the just-placed order's own tracking-view button; this is the second, and
the function needed zero changes to serve it), and **Track** (opens the real tracking view
for that specific order, whatever its current status — see **6**).

**6. Live order tracking — now real.** `js/order-tracking.js`'s core mechanism changed
from a pure `setTimeout` simulation driving the DOM directly to `renderFromOrder()`
deriving every stage's pending/active/done class from the order's actual `status` field
(via new `js/order-status.js` helpers — `getStatusIndex`, `isTerminalStatus`,
`isCancelled`), fed by a live `subscribeToOrder()` listener when Firebase is configured
and the order has a real id. The DOM/CSS/animation are completely unchanged — same
`.tl-stage`/`.tl-icon` classes, same timeline arrays. **The one honest gap, named rather
than hidden:** there is still no admin dashboard (Phase 6) for real staff to actually move
an order through kitchen → packaging → courier → delivered. A purely read-only real
subscription would just show "Order received" forever, which is a worse experience than
Phase 1 already had. `scheduleAutoAdvance()` is the stand-in — for the ONE order the
current tab just placed, it writes real status transitions to `counters`-adjacent
`orders/{id}` documents on the exact cadence the old simulation used (down to
reconstructing the final stage's extra 1.4s "still pulsing" beat by delaying that specific
write, rather than faking it client-side — see that function's own comment), so the
customer sees identical pacing to before, except every step is now a real Firestore write
any tab's subscription genuinely reacts to. It never runs for a reopened past order —
those only ever show whatever status is really there. Swapping this scheduler for genuine
staff-driven `updateOrderStatus()` calls from Phase 6 is a drop-in change; nothing about
the rendering or subscription needs to know who wrote the status. **Status vocabulary:**
the brief's own suggested labels ("Pending, Confirmed, Preparing, Ready, Out for Delivery,
Delivered, Completed") were deliberately mapped onto the EXISTING, already-shipped,
UI-connected model (received/kitchen/packaging/courier-or-ready/delivered-or-picked_up)
rather than renamed or extended with a new "Confirmed" stage — see `order-status.js`'s own
comment for the full mapping. Adding a distinct stage would have been a real timeline
redesign (new step, new icon, new row), which conflicts with the same brief's "do NOT
redesign the UI." A new `cancelled` terminal state is handled (a plain replacement message,
no timeline) though nothing customer-facing can trigger it yet — prepared for Phase 6, not
wired to any button.

**7. Verified Purchase — activated.** `js/reviews-data.js`'s `submitReview()` now checks
real order history (`getUserOrders()`) for a non-cancelled order containing the item being
reviewed, by this reviewer. "Placed and not cancelled" is the working definition of
"purchased" — there's no separate admin-confirmed "fulfilled" status yet, and requiring
more would mean nothing could ever verify until Phase 6 exists, defeating the point of
activating this now. The check is monotonic-OR against whatever the review's existing
`verifiedPurchase` value already was: a review written before the matching order existed
can become verified on a later edit (real, worth showing), but a transient
`getUserOrders()` failure during an edit can never downgrade an already-true badge back to
false. `js/firestore.js`'s `upsertReview()` now writes `verifiedPurchase` on both create
AND edit (previously: false on create, untouched on edit — correct for Phase 3's inert
placeholder, no longer correct once the value can legitimately improve over time). Same
honest client-writable-aggregate caveat as `rating`/`reviewCount` already carried, now
extended to this field too, for the same reason.

**8. Saved Addresses.** Entirely new: `js/addresses.js` — a `savedAddresses` array on the
existing `users/{uid}` document (already named in `firestore.js`'s own header comment as
planned schema since before this phase existed), not a new collection, so no new Firestore
rule was needed. Real-time (`subscribeToUserProfile`, see **10**), with add/edit/delete/
set-default all wired into a new "Saved Addresses" section in the account view, and into
checkout (**3**). Deliberately does NOT use the sign-in-gate machinery favorites/reviews
use — every reachable entry point already requires being signed in first (the account view
itself, or a checkbox only shown to a signed-in customer at checkout), so there's no
signed-out tap this needs to resume after.

**9. Profile — most of Phase 5's scope, done now.** Personal info (name, phone) is now
editable in place (`accountEditBtn` toggles a form; saves to both the Firestore profile
and, via new `js/auth.js` functions `updateAuthDisplayName`/`updateAuthPhotoURL`, the
Firebase Auth user object itself — needed because the nav chip and `renderAccountView`
both prefer the Auth object's own `displayName`/`photoURL` first, falling back to the
Firestore profile only when the Auth object doesn't have one). Avatar upload
(`js/storage.js`'s `uploadProfilePicture`, a camera-icon button overlaid on the existing
avatar circle) — the same `photoURL` field Google sign-in has quietly written since Phase
2, now also writable by a password-auth account. Review history (a new read-only "Your
Reviews" section, `js/reviews-data.js`'s new `fetchReviewsByUser`/`loadMyReviews` — no
composite index needed, sorted client-side same as `fetchReviewsForItem` already does).
Password management (`js/auth.js`'s `changePassword` — reauthenticate with the current
password, then `updatePassword`; the section is hidden entirely for a Google-only account
via new `isPasswordProvider()`, rather than shown and left to fail every attempt).
"Settings" was deliberately NOT built as a speculative preferences panel with no backing
feature behind it — the brief's own word, but nothing else in the spec defines what a
"setting" actually is here, and this project's own established rule is real data or
nothing invented. Scoped down to what IS real: the edit-profile form plus password
management, named here explicitly as a scope call rather than silently narrowed.

**10. Error handling & loading states.** `js/toast.js` — one small, reusable notification
(not a general notification center), used for: background-save failures that were
previously silent (a failed favorite/address/review write used to leave the customer
thinking it saved when it hadn't — `favorites.js`/`addresses.js` now check the result and
say so), and an offline/online banner (`initConnectivityBanner`, `navigator.onLine` +
`online`/`offline` events). Real-time sync was extended from favorites-only (Phase 3) to
also cover saved addresses — both independently `subscribeToUserProfile` the same
`users/{uid}` document rather than sharing one listener; two small listeners on one
document is a deliberate, cheap choice over a new shared-state module, not an oversight
(the Firestore SDK multiplexes same-document listeners over one underlying stream). Order
history and review history each get their own loading state (`.section-loading`, reused
from `.reviews-loading`'s existing visual) since — unlike favorites/addresses, which
piggyback on an already-instant local mirror — both are one-shot/fresh-subscription reads
with nothing to show before they resolve.



## Post-Phase-4 fix — Account modal desktop scroll/touch bug

**The report.** Touch dragging inside the Account modal was completely unresponsive on a
touchscreen Chromebook — "the modal feels frozen and ignores touch gestures" — while the
same modal scrolled correctly by touch on Android phones. Flagged ahead of Phase 6's
Admin Menu Manager, as a standalone fix rather than part of that phase.

**Root cause.** The exact same leaked-cascade bug class as Round 1 above, just never
caught for this modal, because nobody had looked. `.order-modal`/`.order-modal__body` are
shared CHROME classes (see `css/auth-modal.css`'s header comment) — the `min-width:1024px`
block's menu+cart-only desktop rules (`display:grid; grid-template-columns:1fr 380px; ...
overflow:hidden`, written only for the order modal's menu/cart split) land on `#authOverlay`
too. Round 1 fixed this exact leak for the product modal with `#productOverlay`-scoped
overrides; the auth modal's `.auth-modal` class has sat on the modal root since Phase 2 for
exactly this kind of override (see `index.html`) but nobody had actually written one. Unlike
the order modal's own `#view-menu`/`#view-cart`/`#view-payment`/`#view-tracking`, none of
the auth modal's `.order-view` children (`#authView-signin`/`-signup`/`-forgot`/`-account`/
`-orders`) were ever added to the compensating `overflow-y:auto` rule, so at `>=1024px` the
account view's content — reliably more than one screen (avatar, info, edit form, favorites,
saved addresses + inline add-address form, reviews, order-history link, change-password
form, sign out) — hit `overflow:hidden` with nowhere for the scroll to go.

Confirmed with a real (headless) Chromium run, not just reasoned through: at a 1280x800
viewport (a common Chromebook resolution), `getComputedStyle` on the modal body showed
`overflow-y: hidden` / `display: grid`, `clientHeight` 606px against a `scrollHeight` of
1209px, and a simulated touch-drag gesture (raw CDP `Input.dispatchTouchEvent`
touchStart/touchMove×12/touchEnd, not a synthetic `scroll` event) left `scrollTop` at 0 —
as did a simulated wheel event at the same viewport, with or without touch capability
enabled on the browser context. At a 390x844 viewport (Android-sized) the same modal's
body computed `overflow-y: auto` / `display: block`, and the identical touch-drag gesture
moved `scrollTop` to 402 — matching the report exactly (Android fine, Chromebook-class
viewport frozen) and confirming the bug tracks viewport width, not input method: a
mouse-only 1280x800 context hit the identical `overflow:hidden` dead end on a wheel event,
so a regular desktop-Chrome visitor at that width would have hit the same wall a
touchscreen Chromebook did, just via a different gesture. There's no wheel-specific
handler anywhere in this codebase to begin with (grepped for `wheel`, `preventDefault`,
`touch-action`, `pointer-events`: none exist) — "not a mouse wheel issue" is accurate as a
description of where *not* to go looking, but wheel scrolling on this modal at this width
was, in fact, hitting the same CSS dead end as touch; the fix restores both, since they
were never actually separate mechanisms.

**Fix.** One new `#authOverlay`-scoped block appended to the same `min-width:1024px`
block in `css/responsive.css` that already holds the `#productOverlay` overrides —
matching that block's technique and specificity approach exactly (`#authOverlay
.order-modal` and `#authOverlay .order-modal__body`, both ID-anchored, both strictly
outrank the leaked bare-class rules regardless of source order, so neither existing rule
had to be edited). Restores `.order-modal` to `max-width:640px; height:auto;
max-height:88vh` (the same numbers the `min-width:640px` tablet card already uses) and
`.order-modal__body` to `display:block; overflow-y:auto` (the same values the
un-media-queried base rule already uses) — i.e. this modal now looks and scrolls
identically at every breakpoint from tablet up, rather than being forced into a two-pane
layout that never suited a one-view-at-a-time sign-in/account form. Nothing new was
built: native `overflow-y:auto` on a bounded-height flex column is the exact mechanism
that already made mobile/tablet scroll correctly by touch, wheel, and trackpad with zero
JS — this just stops switching it off at one breakpoint. `css/responsive.css` is the only
file this fix touched; no JS or HTML changed.

**Verification this pass.** The first genuinely real-browser verification this project
has had (see **Honesty note**'s Post-Phase-4 addendum and **Known bugs**'s first bullet) —
headless Chromium via Playwright, not a DOM/Node stub. Checked, before and after the fix,
across three contexts (1280x800 touch — "Chromebook"; 390x844 touch — "Android"; 1280x800
mouse-only — "desktop"): computed `overflow-y`/`display` on the modal body; a raw-CDP
simulated touch drag; a simulated wheel event; before/after screenshots (the after-drag
screenshot visibly shows scrolled-to content — the address form / reviews section — where
the before-fix one is pixel-identical to the unscrolled opening screenshot); and that
`document.body`'s `overflow` stays `hidden` while the modal is open in every context (the
page-behind-the-modal lock is a separate mechanism — `js/ui.js`'s `syncBodyScrollLock()`
— and was never implicated in this bug). Also re-opened the order modal and product modal
at the same 1280x800 desktop viewport after the fix and confirmed both computed exactly as
before (order modal: `display:grid`, `grid-template-columns: 800px 380px`, 1180px wide;
product modal: 920px wide) — the new rules are ID-scoped to `#authOverlay` only, so
neither of the other two modals' desktop layouts could have been touched, and this
confirms they weren't. CSS brace-balance re-checked (61 open / 61 close). **Still not a
substitute for Pending Task 1's full real-Firebase-project click-through** — this pass
verified the modal chrome's scroll/touch mechanics specifically, not the account view's
actual data behavior (avatar upload, addresses CRUD, review/order history rendering real
records), which still depends on a real Firebase project nothing in this environment has.

## Phase 6 — Admin Menu Manager

**Scope.** One piece of Phase 6, not all of it: a staff-facing page to manage the
`menuItems` collection entirely from the browser — view/search/filter/sort, add/edit/
delete, toggle availability, change display order, edit name/description/price/category/
image, preview images, toggle the four badges. Orders management, user management, review
moderation, and restaurant settings (the rest of what "Admin Dashboard" originally meant —
see **Customer experience spec**) are untouched.

**A separate, self-contained page.** Everything lives under `admin/` — `admin/index.html`,
`admin/css/admin.css`, `admin/js/*.js`. Nothing in `index.html`, any `css/*.css`, or any
root `js/*.js` file was changed — confirmed by a full recursive diff against the project
as it was at the start of this session, not just by intent, and there is still no link
from the customer-facing nav into `/admin/` (staff reach it by navigating there directly —
same assumption `js/auth.js`'s own header comment already named). This means the "no
regressions in existing customer functionality" requirement is trivially true: there is
zero shared surface for a regression to occur on. The tradeoff is that a handful of small
UI helpers (a loading-button-label toggle, a form-error show/hide) that already exist in
`js/auth-forms.js` got a second, near-identical copy in `admin/js/admin-auth.js` and
`admin/js/admin-item-form.js` rather than being imported — they're private, unexported
functions in that file, so sharing them would have meant exporting internals of a
customer-facing file for an admin-only caller. Kept separate on purpose; each copy is a
few lines.

**Firestore and Storage — reused, not re-implemented.** `admin/js/admin-data.js` calls
`js/firestore.js`'s existing `fetchMenuItems()`/`addMenuItem()`/`updateMenuItem()`/
`deleteMenuItem()` exactly as they already exist — this file has zero Firestore query
logic of its own. Image upload calls `js/storage.js`'s existing `uploadImage()` exactly the
way that file's own header comment already anticipated
(`uploadImage('menu-images/' + itemId + '/' + file.name, file)`), landing in
`storage.rules`' pre-existing `menu-images/{itemId}/{fileName}` path. Auth reuses
`js/auth.js`'s `login()`/`logout()`/`onAuthStateChangedListener()`/`isStaff()` — the gate
checks `isStaff()` (true for both `staff` and `admin` roles), matching
`firestore.rules`' `isStaffOrAdmin()` write gate on `menuItems` exactly. A signed-in
non-staff account (e.g. a customer somehow signing in here) is immediately signed back out
rather than left half-authenticated — `admin-auth.js`'s `pendingGateError` exists
specifically to survive the second `onAuthStateChanged` callback that sign-out itself
triggers, so the "this account doesn't have admin access" message isn't silently
overwritten by the generic signed-out gate a moment later.

**What's genuinely new.** `admin/js/admin-filter.js` reuses `js/menu-filter.js`'s
search/category matching (`getFilteredMenu`, `highlightMatch`) rather than
re-implementing it, and adds only what the customer-facing module has no use for: an
availability filter (customers never see unavailable items at all; staff need to find
them to turn them back on) and six sort options (customers always see displayOrder;
staff scanning a long list need name/price too). `admin/js/admin-data.js`'s
`getKnownCategories()` derives the category list from whatever's actually in the loaded
Firestore collection, not from `data/menu.sample.js`'s `MENU_CATEGORIES` — that file's own
header comment names `js/menu-data.js` as the only module that should import it directly,
and more to the point, admin is managing the real database, not the design-time sample
list, so the true source of "what categories exist" is whatever the loaded items say. A
brand-new empty collection returns zero categories; the add-item form's "+ Add new
category…" option is how the first item gets one. Writes update the local `allItems` cache
optimistically from the known result (append/patch/remove directly) rather than
re-running `fetchMenuItems()` after every change, the same "patch the local cache from a
known-good result" shape `js/menu-data.js`'s own `patchMenuItemLocal()` already uses
elsewhere; a manual Refresh button re-fetches for a staff member who wants another
admin's concurrent edits. The item list uses event delegation — one click listener and one
change listener on `#adminItemList` itself, wired once — rather than per-row listeners
that would need re-wiring every time the list rebuilds via `innerHTML`, which it does on
every render.

**Uploading a photo for an item that doesn't exist yet.** Storage needs a path the moment
a file is chosen, but a brand-new item has no real Firestore id until `addMenuItem()`
(→ Firestore's `addDoc()`) actually succeeds. `admin/js/admin-item-form.js` generates a
client-side temporary key (`'new-' + Date.now().toString(36) + …`) used only as the
Storage path segment while the Add form is open; it's never written to Firestore itself —
the item's `image` field is always just the plain download URL, identical whether it came
from typing one in or uploading one. `storage.rules`' `menu-images/{itemId}/{fileName}`
path segment is a free-form organizational key, not a foreign key checked against a real
`menuItems` document, so this is safe: it only affects which Storage folder a photo is
filed under.

**CSS — deliberately not loading `css/responsive.css`.** That file's `min-width:1024px`
rule for `.order-modal` is written for the customer cart/menu two-pane split and isn't
scoped to just that modal — reusing the bare `.order-modal` class (which this page does,
for the add/edit-item modal and the delete-confirm dialog, the same chrome-reuse
convention the Phase 2 auth modal established) would have inherited the exact leak this
project has already had to patch twice (**Post-Phase-3 desktop polish passes → Round 1**
and **Post-Phase-4 fix**, both above). Rather than patch it a third time, `admin/index.html`
simply never loads that stylesheet, and `admin/css/admin.css` writes its own desktop rules
for `#itemFormOverlay`/`#confirmOverlay` specifically, scoped from the start. Whoever
builds the rest of Phase 6 (an Orders page, a Users page) should keep doing this — a new
admin page reusing `.order-modal` chrome again only needs to skip `responsive.css` and
write its own ID-scoped desktop block, not touch the customer stylesheet at all.

**A bug this process found, not review.** `.admin-gate`'s own `display:flex` silently beat
`admin-auth.js`'s `adminGate.hidden = true` — author styles always beat the browser's
default `[hidden]{display:none}` rule, the exact issue `css/order-modal.css` already
documents and fixes for `.cart-badge`. The same thing recurred for the item-form image
preview `<img>` (`.admin-form-image__preview img{display:block}`). Both fixed the same
way `.cart-badge[hidden]` already was. See the Honesty note's Phase 6 addendum above for
how this was caught, and how the rest of this feature was verified.

**Known limitations, named rather than hidden:**
- `fetchMenuItems()` returns `null` for three different situations — Firebase not
  configured, the collection genuinely empty, or the fetch actually failing — and per
  "reuse the existing Firestore helper functions, don't duplicate Firestore logic," this
  file doesn't re-implement that query with its own empty-vs-error distinction. A
  configured project whose fetch comes back null is shown one honest, combined message
  covering both real possibilities (`admin-render.js`'s `'fetch-failed-or-empty'` state)
  rather than guessing which one it is.
- The customer-facing menu has no live listener — it re-reads Firestore via
  `loadMenu()` once per page load (unchanged, pre-existing behavior). An admin's edit
  reaches a customer on their next page load/reload, not instantly on an already-open tab.
  Adding a real-time listener to the customer menu was out of scope for "build the Admin
  Menu Manager" and would be a customer-facing architecture change — flagging it as a
  future option rather than making it unasked.
- No drag-and-drop reordering, no bulk actions (bulk-delete, bulk-toggle-availability), no
  category rename/merge tool, no pagination (fine at today's ~16 items; untested at, say,
  200). None were in the requested feature list; noting them as candidates for a future
  pass rather than silently deciding they don't matter.
- The sign-in gate has no "forgot password" link and no account-creation path — deliberate
  (see **Firestore and Storage — reused, not re-implemented** above: staff accounts are a
  manual Firebase-console step today, same as every other role-gated feature this project
  has shipped), but worth knowing before assuming it's an oversight.

## Phase 6 — Order Management

**Scope.** Two halves. Customer-facing: enhance the My Orders view Phase 4 already
shipped (live subscription, order number/date/status/items/total already there) to add
what it was missing — an error state, real loading skeletons, individual item prices,
delivery/pickup and payment detail, and a Cancel Order action. Admin-facing: a complete
Orders Dashboard added to the same self-contained `admin/` page the Menu Manager already
established, with its own live queue, search, status filter, sort, per-order status
control, and a full order detail view. User management, review moderation, and restaurant
settings — the rest of what "Admin Dashboard" originally meant — are still untouched.

**The status vocabulary, resolved the same way twice now.** This phase's own brief lists
"Pending, Preparing, Ready, Completed, Cancelled" as the statuses to support. This
project's real model (`js/order-status.js`) has always been eight values, fulfilment-type
dependent — `received → kitchen → packaging → courier → delivered` for delivery,
`received → kitchen → packaging → ready → picked_up` for pickup, plus `cancelled` outside
either timeline — because a PHASE 4 brief made the exact same simplifying assumption once
before (see that file's own "PHASE 4 addendum"), and the resolution then was to keep the
real model as the single source of truth and treat the brief's words as a looser
description, not a literal rename. Same resolution again: nothing here invents a status or
changes what `updateOrderStatus()` is ever called with — `admin/js/admin-orders-filter.js`'s
5-bucket status filter groups the real values (documented inline exactly which real
statuses fall in each bucket, including that "Ready" covers two genuinely different real
stages — `courier` for delivery orders, `ready` for pickup orders — because the brief's
5-word list has no separate "out for delivery" bucket to put one of them in instead), and
every status-CHANGE control (the row select, the detail modal's select) is populated from
that specific order's own real timeline via the existing `getTimelineFor()`, so staff only
ever pick from stages that are actually real for that order's fulfilment type.

**Retiring `scheduleAutoAdvance()`.** `js/order-tracking.js` had, since Phase 4, a
client-side timer that wrote fake staff-paced status transitions for the one order a tab
just placed — an explicitly named, temporary stand-in for exactly this phase, with its own
comment saying so: "swapping this scheduler out for genuine staff-driven
updateOrderStatus() calls from Phase 6's admin dashboard is a drop-in change." It's been
removed. `openTrackingForOrder()` no longer takes the `justPlaced` option that gated it;
`renderFromOrder()` and the live subscription underneath it are completely unchanged,
since they only ever reacted to whatever status was actually in Firestore regardless of
who wrote it — the swap really was as clean as that comment promised. Keeping both would
have meant a newly-placed order's status racing between a fake timer and whatever a real
staff member clicks, auto-completing every order in ~12 seconds regardless of what staff
actually do — directly contradicting this phase's own "orders must update immediately when
the admin changes their status" requirement.

**Customer My Orders.** `js/order-history.js` gained an honest error state without
touching `js/firestore.js` at all (this phase's own instruction: the existing helpers
"must remain the single source of truth", and every `subscribeToX` function in that file
shares one deliberate shape where an attach failure or a live listener error both just
`console.error()` internally and never reach the caller's callback — true of
`subscribeToUserOrders` same as its siblings). A 12-second application-layer timeout
(`ORDERS_TIMEOUT_MS`) is what actually detects "stuck" rather than "slow" — generous on
purpose, and cleared the instant a real snapshot does arrive. `js/order-history-ui.js` was
substantially rewritten: real skeleton rows (reusing `css/product-grid.css`'s
`.skeleton-line`/shimmer, same convention `admin/js/admin-render.js` already uses on the
admin side) in place of a plain "Loading your orders…" line; the expanded row now shows
each item's unit price alongside its line total, delivery address or pickup contact,
payment method and status, and a notes line that only renders when `order.notes` is
actually a non-empty string (nothing in this codebase captures notes at checkout, so this
stays an honest, graceful no-op rather than a checkout change this phase wasn't asked to
make); and a Cancel Order button, visible only while an order's status is `RECEIVED`
(this project's real equivalent of the brief's "Pending" — the only stage before kitchen
work begins, and the only one `updateOrderStatus()` was already safe to call from the
customer's own side without inventing new backend logic, per this phase's own "if the
architecture already supports it" framing), confirmed via `window.confirm()` — matching
`js/reviews-ui.js`'s own delete-review button, the existing precedent for a customer-facing
destructive confirmation on this side of the app, rather than introducing the admin side's
styled modal confirm component into a context that never used it before.

**Admin Orders Dashboard.** Added to the same `admin/` page and JS/CSS conventions the
Menu Manager established — `admin/js/admin-orders-data.js` (wraps the existing
`subscribeToAllOrders()`/`updateOrderStatus()`, nothing more), `admin/js/admin-orders-filter.js`
(search + status grouping + sort, no DOM), `admin/js/admin-orders-render.js` (toolbar +
row rendering, event-delegated), `admin/js/admin-order-detail.js` (the full detail modal).
One deliberate difference from the Menu Manager's data layer: no optimistic local-cache
patching after a write. The Menu Manager reads via a one-shot `fetchMenuItems()`, so
patching the cache after a successful write is what makes its list feel live between
manual refreshes; orders are read via the LIVE `subscribeToAllOrders()` listener instead,
so the moment `updateOrderStatus()` writes, that same listener delivers the update on its
own, moments later — adding an optimistic patch on top would only risk briefly disagreeing
with what the listener is about to say anyway. A new nav (`admin/js/admin-app.js`'s
`showAdminSection()`) switches between the Menu and Orders sections, reusing
`.order-view`/`.active` — already shared by the order modal's own views and the auth
modal's views — for a third time, rather than inventing a new class for what's the exact
same "one of several named sections, only one visible" role. The detail modal's status
timeline reuses `css/payment-tracking.css`'s `.timeline`/`.tl-stage` classes directly (that
stylesheet is now loaded on the admin page too — checked for `@media` blocks first, same
diligence as every other stylesheet choice on this page, found none), so staff see the
exact same visual timeline, stages, and icons a customer sees in their own tracking view —
built as a small, separate DOM-building function rather than an import of
`js/order-tracking.js` itself, since this modal only ever needs to paint a snapshot on open
(or on the next live update while open), never a subscription or timers of its own; see
`admin/js/admin-order-detail.js`'s own header comment for the full reasoning. Cancelling an
order (from either the row select or the modal) asks for confirmation via
`admin/js/admin-confirm.js` — the exact reuse that file's own header comment anticipated
when the Menu Manager shipped it ("written generic for whatever the rest of Phase 6 needs
one for next").

**Two things already in this codebase before this phase touched it,** from work done
outside this conversation between sessions — found, verified, and left exactly as found,
not reverted, per this phase's own "don't modify authentication unless absolutely
necessary" instruction:
- Google sign-in wired into the admin gate (`admin/js/admin-auth.js`, `admin/index.html`)
  using `js/auth.js`'s `loginWithGoogle()` — which already existed before last session too;
  only the admin gate's use of it is new. Confirmed by diffing against what was delivered
  last session, not assumed.
- `js/auth.js` also gained a `linkPasswordToAccount()` function. Confirmed genuinely unused
  anywhere in the project (grepped the whole codebase) — noted here rather than silently
  left for someone to wonder about later, not removed (this phase's instruction was not to
  touch authentication unless necessary, and "unused but not broken" isn't a reason that
  rises to necessary) and not wired up either (out of scope for Order Management).
The only change made in this area at all: the Google button/divider's styling moved from
inline `style=""` attributes to `admin/css/admin.css` classes (`.admin-gate__divider`,
`.admin-google-btn`), using this project's actual token colors in place of the inline
version's hand-typed hex greys — a presentation-only cleanup matching this project's
established "static layout belongs in a stylesheet" convention (see `css/order-modal.css`'s
own upsell block for the same convention already in use), with no behavior change.

**Known limitations, named rather than hidden:**
- No live sync of order data to an already-open, different browser tab beyond what the
  live `subscribeToAllOrders()`/`subscribeToUserOrders()` listeners themselves already
  provide — which is to say, live sync IS real here (unlike the Menu Manager's one-shot
  reads), this note exists only to be precise about what "live" means: any tab with an
  active subscription updates automatically; nothing is polled or needs a manual refresh
  to see another admin's or the customer's own change.
- The admin status `<select>` lets staff move an order to ANY of its real timeline stages,
  forward or backward, with no guardrail against skipping stages or moving one backward by
  mistake (only Cancel gets a confirmation step). Not a bug — genuinely useful for
  correcting a mis-click — but worth knowing before assuming the UI prevents it.
- No bulk actions (bulk status update across multiple orders), no order search by date
  range, no CSV/export. None were in the requested feature list; noting them as candidates
  for a future pass rather than silently deciding they don't matter.
- `getNextOrderNumber()`'s transactional counter and `saveOrderToFirestore()`'s write path
  are unchanged by this phase — Order Management only ever READS orders and updates
  `status`; nothing about how an order is created was touched.

## Phase 6 — Admin Dashboard (continued)

**Brief:** implement the remaining Admin Dashboard features — live stats (revenue,
pending/completed orders, low stock, recent orders), Menu Management improvements,
Categories management, Labels management (with existing food labels imported and still
editable), Delivery Zones management, a Customers page, an Analytics page, and a Settings
page — all real-time, deriving dashboard widgets from shared listeners/caches rather than
opening new ones, while preserving the existing architecture, auth system, customer
experience, and Firestore/Storage structure. Explicit instruction: read the entire project
and find the real integration points before changing anything, since a ZIP upload — not
this document — was to be treated as the only source of truth.

**What "read the entire project first" actually found:** this document's own **Current
status** section (before this pass corrected it, see above) claimed only the Admin Menu
Manager and Order Management existed, and that "user management, review moderation, and
restaurant settings" hadn't been started. The code told a different story. Categories and
Labels management (`admin/js/admin-taxonomy.js`) were already fully built — live-
subscribed CRUD for both, usage-count-aware category renaming and deletion, label
deletion that cascades to remove the label from every item using it. A Customers page and
an Analytics page (`admin/js/admin-insights.js`) were already built too — both correctly
derived from the existing live orders cache rather than opening a new listener or reading
user profiles broadly. The Dashboard already had five of its six originally-planned stat
cards and a live Recent Orders panel. `js/firestore.js` already had complete CRUD +
subscribe functions for `menuCategories`, `menuLabels`, `deliveryZones`, and
`restaurantSettings`, and `firestore.rules` already had real rules for all four — the
Firestore layer was ready for Delivery Zones and Settings before this pass touched
anything; only their admin UI had never been built. `js/restaurant-settings.js` existed,
subscribed to Firestore, and had a config.js-fallback design — but nothing in the project
ever called it. None of this was guessed at: it came from reading `js/firestore.js`,
`firestore.rules`, `admin/js/admin-taxonomy.js`, `admin/js/admin-insights.js`,
`admin/js/admin-dashboard.js`, `admin/index.html`, and `js/restaurant-settings.js`
directly, then cross-checking with `grep` for callers before concluding something was
unused. The lesson for whoever reads this next: this document is a log, useful for
intent and reasoning, but the ZIP is what actually shipped — verify claims like "not
started" against the code before repeating them.

**What was actually built or changed this pass**, roughly in dependency order:

1. **Live Menu Manager.** `js/firestore.js` gained `subscribeToMenuItems()` — a one-line
   reuse of the existing `subscribeToCatalogCollection()` helper already backing
   categories/labels/delivery-zones, not a new query. `admin/js/admin-data.js` was
   rewritten around it: `loadAllMenuItems()` (one-shot fetch + optimistic per-write cache
   patch) became `startMenuItemsSubscription()` (live listener, no patching — the same
   shape `admin-orders-data.js` already established for orders, and the same reasoning:
   a manual patch on top of a live listener only risks briefly disagreeing with what the
   listener is about to say anyway). This was the one admin data source still using a
   one-shot fetch; it now isn't, matching the brief's explicit "all data should update in
   real time" requirement for the panel as a whole, not just the new sections. One
   genuine improvement fell out of this for free: the old `fetchMenuItems()` returned
   `null` for BOTH "genuinely empty collection" and "the fetch failed", so the Menu
   Manager's error copy used to hedge both explanations at once. A live subscription's
   error callback is a separate path from a successful-but-empty snapshot, so this is no
   longer ambiguous — see `admin-render.js`'s updated notice copy. Every caller of the
   old function (`admin-app.js`'s init, admin-render.js's Refresh button and retry
   action) was updated to the new one; verified with `grep` that no reference to
   `loadAllMenuItems` remains anywhere outside a comment.
2. **Low Stock.** No inventory concept existed anywhere in the schema before this pass.
   Added an opt-in `stockQty` field (number or absent — absent, on every pre-existing
   item, means "not tracked / always available", so nothing about any existing item
   changes) plus a single shared `LOW_STOCK_THRESHOLD` (5, in `admin-data.js`) rather
   than a per-item threshold field, to keep the feature simple. `getLowStockItems()`
   filters to available, tracked items at or under the threshold. Wired into: the item
   form (`itemFormStock`, optional, validated as a non-negative integer), the item list
   row (a stock count in the meta line, an amber "Low Stock" tag distinct from the
   existing red "Sold out" one), and a new Dashboard stat card + panel, both reading
   `getAllItems()`/`getLowStockItems()` from the SAME menu-items cache the Total/
   Available stats already used — no new listener. The panel follows
   `renderRecentOrders()`'s own "a transient error never blanks a panel that already had
   real data" rule (only hard-fails when there's truly no cached data at all), a
   consistency fix applied after first writing it the less-careful way and re-reading it
   against its neighbor.
3. **Categories/Labels: legacy badge import.** The four hardcoded boolean badges
   (`isPopular`/`isNew`/`isSignature`/`isBestSeller`) predate managed labels and are what
   the brief called "current food labels" that should be imported and stay editable.
   `admin-taxonomy.js` gained `importLegacyBadgeLabels()`: after labels first load, it
   creates a managed label for each of the four names, skipping any that already exist
   by case-insensitive name match (the same duplicate check `saveLabel()` already used,
   now shared via one `findLabelByName()` helper instead of two copies of the same
   logic) — safe to run every session. Deliberately does NOT touch any item's
   `isPopular`/etc. fields or `labels` array: this is an import into the labels
   DIRECTORY, not a rewrite of every item, so the customer-facing badge ribbons
   (`js/menu-render.js`, `js/product-modal.js`) keep reading the same four boolean
   fields exactly as before, completely unaffected by whether these four labels get
   renamed or deleted later. Two of these four rows could in principle be created twice
   if two staff members opened the admin panel for the very first time at the exact same
   moment (no unique-constraint mechanism exists for label names) — a real but narrow
   race, self-resolving in impact (an admin can delete the duplicate via the delete-label
   action that already existed), named here rather than silently assumed away.
4. **Consistency fix, found while in this file for the above:** Categories and Labels'
   delete actions used `window.confirm()` — the one delete action in the whole admin
   panel not using the shared in-page `admin-confirm.js` dialog every other overlay here
   uses (that file's own header comment already called out `window.confirm()` as the
   thing it was meant to replace everywhere). Fixed both to use `confirmAction()`,
   matching items, orders, and the new Delivery Zones below.
5. **Delivery Zones.** New `admin/js/admin-delivery-zones.js`, architecturally identical
   to `admin-taxonomy.js`'s categories/labels — live `subscribeToDeliveryZones()`
   listener, module state, one render function, event-delegated row actions, a small
   add/edit modal (`zoneFormOverlay`, styled identically to categoryForm/
   labelFormOverlay), delete via `admin-confirm.js`. Simpler than taxonomy in one respect:
   zones aren't referenced by any menu item field, so there's no usage count to compute
   and no cascading update needed on rename/delete. Fields: name, fee, an optional free-
   text coverage-area description, active/hidden. Deliberately NOT wired into checkout's
   own delivery-fee calculation — `js/order.js` still charges one flat fee (see point 6).
   This is reference data for staff (phone orders, future expansion), not a live per-zone
   pricing engine; the brief asked for "Delivery Zones management", and turning a
   flat-fee checkout into a zone-picker is a materially bigger customer-facing change
   than that, named here rather than silently done or silently skipped.
6. **Settings.** New `admin/js/admin-settings.js`, backing the exact same
   `restaurantSettings/primary` document `js/restaurant-settings.js` already read on the
   customer side. Scope — delivery fee and bank transfer details, nothing more — comes
   directly from `firestore.rules`' own comment on that collection's match block
   ("checkout needs the active delivery fee and bank-transfer details, while only staff
   may change them from the Settings page"), which had clearly been the intended design
   all along; brand/contact identity (name, phone, WhatsApp, address) deliberately stays
   in `config.js` as static per-deployment config, since making those live-editable would
   mean also rewriting how `index.html`'s static markup renders them — a materially
   bigger customer-facing change than this page needed to make. The form stays live-
   subscribed (`subscribeToRestaurantSettings()`) rather than a one-shot load, with a
   `dirty` flag: a snapshot only repopulates the fields when the admin hasn't typed
   anything since the last load/save, so another admin's concurrent change, or the
   echo of this admin's own just-saved write coming back through the same listener,
   never clobbers an in-progress edit. First version of this had a real bug, caught on
   re-read: the save confirmation ("Saved. These changes are live on the site now.") was
   being wiped almost instantly by that same echo, since the echo arrives `dirty: false`
   and the naive version unconditionally cleared any notice on every non-dirty snapshot.
   Fixed by only clearing the notice when it isn't currently that success message —
   typing again is what actually dismisses it now, not the next snapshot.
7. **Making Settings have real effect.** A Settings page whose Save button changed a
   Firestore document nothing else read would be cosmetic. `js/restaurant-settings.js`
   already existed with exactly the right shape (`getDeliveryFee()`/`getBankDetails()`,
   config.js fallback) but had zero callers anywhere in the project — `js/order.js`,
   `js/ui.js`, and `js/app.js` all imported `DELIVERY_FEE`/`BANK_DETAILS` straight from
   `config.js`, and `initRestaurantSettings()` was never invoked. Fixed by swapping those
   direct constant imports for the two getters at every call site (`order.js`'s
   `getOrderTotal()`, `buildOrderObject()`, and `renderPaymentView()`; `ui.js`'s cart fee
   line; `app.js`'s copy-account-number handler) and adding one `initRestaurantSettings()`
   call to `app.js`'s `init()`. Behaviourally invisible until an admin actually saves new
   settings — both getters fall back to the exact same `config.js` constants as before
   when nothing's been saved yet — so this carries the same "safe until configured" risk
   profile as every other Firebase-gated feature in this project, not a new one.
8. **Housekeeping fix, unrelated to any single feature above:** `admin-dashboard.js` had
   referenced a `document.getElementById('adminDashboardDataNote')` since before this
   pass — safely guarded (`if(note) ...`), so it never threw, but the element never
   existed in `admin/index.html`, so that code path was silently inert. Added the
   missing `<div id="adminDashboardDataNote" hidden>` and gave `renderDataNote()` actual
   text to show (which menu/orders data source is currently having live-update trouble),
   since the brief's own closing checklist asked to verify there were no broken
   references, and a guarded-but-dead reference is a milder version of the same thing.

**Honesty note, matching every phase before this one:** verified by static analysis only
— full re-reads of every changed file after editing, an automated cross-check of every
`import { X } from './Y.js'` in all 47 project JS files against Y's actual exports (found
zero mismatches after fixing a bug in the check script itself, not in the project),
`node --check` syntax validation on every JS file, a cross-check of every
`getElementById()` call in `admin/js/*.js` against `admin/index.html`'s actual ids, and
CSS brace/paren balance checks. NOT verified: no real browser, no real Firebase project —
this environment has no network access, so `isFirebaseConfigured()`'s branch of every new
function (the one that actually touches Firestore) has never executed against a live
backend, only reasoned through against the existing, working patterns it copies
(`admin-orders-data.js` for the live-subscription-with-timeout shape,
`admin-taxonomy.js` for CRUD-list shape). The same caveat every phase in this document
carries.

## Phase 4 Continuation — Eliminate Fake Data & Full Firestore Sync

Requested under the title "Phase 4 Continuation" (see that brief) — the number
refers to the brief's own framing, not strictly this document's Phase 3/4/6
chronology below: the work here closes out loose ends left in BOTH Phase 4
(checkout/orders) and Phase 6 (admin dashboard: labels, reviews, delivery
zones), so it's filed as its own section rather than folded into either.

Before changing anything, every claim in the brief was checked against the
actual code (not just this document, which the Honesty note above already
warns can drift from the code) — all of it held up:
- Menu items carried BOTH the legacy isPopular/isNew/isSignature/isBestSeller
  booleans AND a separate `labels` array, but only the booleans were ever
  rendered on the customer site or read by the admin item list — two systems,
  confirmed in js/menu-render.js, js/product-modal.js, admin/js/admin-render.js.
- data/menu.sample.js (today's actual "menu database" — see that file's own
  header comment) pre-seeded every item with a fake rating/reviewCount before
  any review existed.
- index.html's hero rating pill, About-section stats, and Reviews section were
  static markup: a fixed "4.1 (171 reviews)" and three fabricated testimonials
  (Jacky Chou, Sadiq Dandago, Sulaiman Usman Ardo).
- Delivery Zones (built in Phase 6) were real admin-managed data but never
  read by checkout, which still used restaurant-settings.js's flat fee.
- Saved addresses were a single free-text field with no zone or phone.

### What changed

**Badges/Labels — one system.** admin/js/admin-taxonomy.js's legacy-badge
import now runs a second step after it: `migrateLegacyBadgeItemsIfReady()`
walks every existing menu item once, folds each true legacy boolean into that
item's `labels` array as the matching managed label's real id, and deletes
the four legacy fields from the document in the same write
(js/firestore.js's `setMenuItemLabelsAndClearLegacyBadges`, using
`deleteField()` — not just writing `false`, since the goal was retiring the
schema, not just not-reading it). Both the customer site (new
js/labels-data.js, a live Firestore-or-offline-fallback cache) and the admin
item list/form now read `labels` only. The admin item form's four
badge-toggle buttons are gone; the existing labels checklist is the only
control. Offline fallback: data/taxonomy.sample.js's `SAMPLE_LABELS`, and
data/menu.sample.js's items now reference those ids instead of booleans.

**Ratings — no more pre-seeded numbers.** data/menu.sample.js's
rating/reviewCount fields are removed entirely (was already a live,
Firestore-derived pair — js/reviews-data.js — the sample DATA was the only
fake part). js/menu-render.js's product cards and js/product-modal.js's
detail view both now show "No reviews yet" / "No reviews yet — be the first
to review" when reviewCount is 0, instead of "★ 0.0 (0)".

**Homepage — real aggregate, real testimonials, real empty state.** New
js/site-reviews.js subscribes to the ENTIRE `reviews` collection live
(js/firestore.js's new `subscribeToAllReviews`) and computes one
restaurant-wide average + count — deliberately a different figure from any
single item's rating (see that file's header comment for why). Populates the
hero rating pill, About stats, and Reviews section summary; the three fake
cards are replaced by real reviews (verified-purchase + most-recent first,
same avatar-initial/"Verified Purchase"/relative-time conventions
js/reviews-ui.js already used for per-item reviews) or, with none yet, the
brief's own suggested empty-state copy. Judgment call, flagged for whoever
reads this next: the star-rating FIGURE shows "—" rather than "0.0" when
there's no data (a bare zero reads as "this place is bad", not "no data
yet"); the review COUNT still shows a literal "0", matching the brief's own
wording. Also a deliberate scope decision: this aggregate does NOT pull from
js/reviews-data.js's per-item in-memory demo cache, so a demo review
submitted with no Firebase configured won't appear here — it's a
session-only preview with nothing durable behind it even today, and showing
"no reviews yet" here is the honest state for a site with no real review
data behind it.

**Delivery Zones now drive checkout.** New js/delivery-zones-data.js (live
cache, same shape as js/labels-data.js) and js/zone-picker.js (a shared
searchable-dropdown factory, reusing js/menu-render.js's existing
search-suggestions interaction pattern and CSS) back a new zone field in both
checkout (js/ui.js) and the account address form (js/auth-ui.js). The
delivery fee is now resolved by one function both places call —
js/delivery-zones-data.js's `resolveDeliveryFee(zoneId)`: the chosen zone's
fee, else the lowest active zone's fee as a running estimate, else
restaurant-settings.js's flat fee as a last-resort fallback for a restaurant
that hasn't configured any zones yet (never a bare hardcoded number — the
old static "+ ₦700 fee" button label is now populated by this same
function). Offline fallback: data/taxonomy.sample.js's
`SAMPLE_DELIVERY_ZONES`, five real Gwarzo-Road-corridor neighbourhoods.

**Addresses are structured.** js/addresses.js's saved-address shape is now
`{ id, label, phoneNumber, deliveryZoneId, deliveryZoneName, addressDetails,
isDefault }`, replacing the single `address` field. Both the checkout
"save this address" flow and the account address form write the new shape.
Addresses saved before this phase only have the old fields — there's no
admin-side path to migrate every user's own saved addresses the way the
badge migration has one for menu items, so every render site falls back to
the old `.address` field when `.addressDetails` isn't present
(js/ui.js's `renderSavedAddressPicker`, js/auth-ui.js's
`renderAccountAddresses`) rather than breaking on old data.

**Left alone, deliberately:** admin/js/admin-item-form.js's "calculated
automatically from customer reviews, not editable here" rating label —
matched the brief's "Calculated automatically" removal list literally, but
it's an accurate, admin-only, non-misleading disclaimer about an already-live
value, not fake data; removing it would make the form less honest, not more.
firestore.rules — already allowed public read on menuLabels/deliveryZones/
reviews and owner read/write on users/{uid} before this phase; nothing here
needed a new rule.

### Verification

Same battery this document's Engineering decisions section above describes,
plus one addition: every file touched was `node --check`'d — but note that
required copying each `.js` file to a temp `.mjs` path first. Plain
`node --check somefile.js` silently passed real, deliberately-broken ESM
syntax in THIS sandbox's Node version (confirmed both ways: a broken
destructuring param and a bad property access both got a clean bill of
health from `node --check file.js`, then correctly failed under
`node --check file.mjs` and under actually running the file). Whoever
verifies future changes here should copy to `.mjs` or pass
`--input-type=module` — not `node --check` a bare `.js` file and trust it.
Beyond that: a project-wide import/export cross-check (every named import
resolved against the actual exports of its source file, across all 52 JS
files in the project, not just the ones touched this phase — zero
mismatches after fixing two files that imported `isFirebaseConfigured` from
the wrong module), a `getElementById()` cross-check against both
index.html and admin/index.html (442 calls checked; the only 4 "misses"
were ids set dynamically via JS, e.g. `el.id = 'toast'`, confirmed by hand,
not real bugs), HTML tag balance and CSS brace balance on every touched
file, and a full re-run of the brief's own audit patterns (★, "4.1"/"171",
"Google Review", the three fake names, live isPopular/etc. references,
hardcoded "700") against the finished project — clean except harmless
false positives (SVG hex colors, a real postal code, font-weight values, and
this document's own prose describing what was removed). NOT verified, same
caveat every phase in this document carries: no real browser, no real
Firebase project — this environment has no network access.

## Architecture

**JavaScript modules.** One file per concern, ES Modules throughout, no bundler — now 27
files under `js/` (was 20 after Phase 3, 13 before it). Core data flow is unchanged: UI
event → action function → `setState()` (`store.js`) → `render()` re-runs
`updateCartBadge()` + `renderMenuList()` + `renderCartView()` + `refreshProductModalIfOpen()`.

**Circular imports, Phase 3 additions.** The pre-existing `store.js` ↔ `ui.js` cycle
(safe: neither calls the other at module top-level) gained more members rather than more
cycles — same rule applies to all of them, verified by the fact that the entire module
graph imports cleanly under Node (see Verification):
- `store.js` ↔ `menu-render.js` (render() calls `renderMenuList`) and `store.js` ↔
  `product-modal.js` (render() calls `refreshProductModalIfOpen`)
- `ui.js` ↔ `menu-render.js` (`menu-render.js` reuses `buildStepper`/`buildAddBtn`;
  `ui.js`'s `openOrderModal()` calls `renderMenuList`)
- A longer chain: `product-modal.js` → `favorites.js` → `auth-ui.js` →
  `product-modal.js` (the account view opens favorited items' details) — and a 4-file
  one: `product-modal.js` → `reviews-ui.js` → `reviews-data.js` → `auth-ui.js` →
  `product-modal.js`. Both safe by the same "nothing at top-level" rule; every file's
  actual top-level code is just plain variable/constant declarations, never a call into
  another module's export.
- One genuine top-level *call* exists — `favorites.js`'s `let favoriteIds = new
  Set(loadLocalMirror())` runs at module load — but it's safe specifically because
  `loadLocalMirror()` only touches `localStorage`, never another module's binding.

**Circular imports, Phase 4 additions.** One new pair, same rule, same verification:
`auth-ui.js` ↔ `order-history-ui.js` (the account view's "View Order History" link needs
to render that view; that view's row actions need to close the account modal). Everything
else Phase 4 added to an existing cycle rather than creating a new one — e.g.
`auth-forms.js` already imported from `auth-ui.js` (`showAuthView`, `resumeAfterAuth`);
adding `populateAddressFormForEdit` to that same import is one more name on an existing,
still one-directional edge, not a new cycle.

**app.js** still exposes exactly 8 functions to `window` for the original prototype's
`onclick=""` attributes (unchanged since Phase 1) — every control added since (Phase 2's
auth modal, Phase 3's product modal/menu grid/favorites/reviews, Phase 4's saved
addresses/order history/avatar upload/password management) uses `addEventListener`
exclusively, wired from `init()`'s own `initX()` calls. `productOverlay` was added to the
shared backdrop-click and Escape-key handling in Phase 3, checked FIRST in the Escape
chain since it's always the topmost overlay when open; unchanged this phase.

**CSS organization.** Still 15 files — Phase 4 extended six of them in place
(`auth-modal.css`, `order-modal.css`, `product-grid.css`, `base.css`, `animations.css`,
`header-nav.css`) rather than adding new ones, same "still the same concern as what was
already in that file" reasoning Phase 3 used for `reviews.css`/`auth-modal.css`. Load
order unchanged: `tokens → base → header-nav → hero → home → menu (homepage teaser) →
reviews → order-modal → product-grid → product-modal → auth-modal → payment-tracking →
animations → responsive`. `responsive.css` still MUST load last.

**Firebase architecture.** Unchanged principle: every Firebase-touching function checks
`isFirebaseConfigured()` first. Phase 3's twist: `reviews-data.js` (and, in spirit,
`favorites.js`) additionally fall back to a **synthetic 'guest' identity** when
unconfigured, rather than simply refusing to work — see `reviews-data.js`'s
`resolveReviewer()`. This means reviews/favorites are fully exercisable with zero backend
set up, matching how checkout has always degraded (ungated) rather than breaking. Phase 4
added Storage as a third Firebase product alongside Auth/Firestore (`js/storage.js`, same
`isFirebaseConfigured()` guard, same "return a safe fallback, never throw" shape as every
Firestore function) and one genuinely new pattern: `js/firestore.js`'s
`getNextOrderNumber()` is the first function in this codebase to use a Firestore
**transaction** rather than a plain read/write.

**State management.** `Store.state = { cart, fulfilmentType, paymentMethod,
currentOrder }` — unchanged shape, but `cart`'s *initial value* now comes from
`localStorage` instead of always starting `{}`. Favorites (`favorites.js`), saved
addresses (`addresses.js`), order history (`order-history.js`), and reviews' "who am I"
concept (`reviews-data.js`) all deliberately stay OUT of `Store.state`, same reasoning
`store.js`'s own header comment already gives for keeping auth out of it — each is its own
concern with its own lifecycle.

## Firestore

Collections (see `firestore.rules`):

- **`menuItems/{itemId}`** — public read. **Active as of Phase 3** — `menu-data.js`'s
  `loadMenu()` reads from here first, falling back to `data/menu.sample.js`. Write rule
  is now two-tier: staff/admin can change anything; any OTHER signed-in customer can
  write too, but ONLY to the `rating`/`reviewCount` fields (a `diff().affectedKeys()`
  check) — see **Phase 3 → Reviews** above for why that's needed (the client itself
  recomputes and pushes the aggregate) and **Engineering decisions** for the honest
  caveat about what a more production-grade version of this would look like.
- **`orders/{orderId}`** — composite index (`userId` ASC + `createdAt` DESC) added in
  Phase 3. **Phase 4:** the create rule now also checks `request.resource.data.userId ==
  request.auth.uid` (previously accepted any signed-in user's claimed `userId` at face
  value); schema gained `orderNumber`, `paymentStatus`, `customerPhone` — see **Phase 4 →
  Checkout/Orders** above for all three.
- **`users/{uid}`** — unchanged rule. Schema: `favorites: string[]` (Phase 3).
  **Phase 4** activated two fields that were already NAMED as planned schema in
  `firestore.js`'s own header comment before either had a real reader/writer:
  `savedAddresses` (array, `js/addresses.js`) and `photoURL` (string,
  `js/storage.js`'s `uploadProfilePicture` — Google sign-in had already been writing this
  one since Phase 2, just never from anywhere else). No new collection or rule needed for
  either — already covered by the existing owner-read/write rule.
- **`reviews/{reviewId}`** — active as of Phase 3, doc id `${itemId}_${uid}`. No composite
  index needed (client-side sort, see **Engineering decisions**). **Phase 4** activated
  `verifiedPurchase` — see **Phase 4 → Verified Purchase** above; covered by the existing
  "author can update their own review" rule, no rules change needed.
- **`counters/orders`** — **new in Phase 4.** A single document (`{ value: <int> }`)
  incremented inside a Firestore transaction by `getNextOrderNumber()`, the source of
  every order's human-facing `orderNumber`. Rule allows any signed-in user to create it
  once (`value == 1`) or update it (`+1` and nothing else) — checkout is what exercises
  this, and checkout is already required to be signed in.

`storage.rules` — **new in Phase 4**, this project's first Storage ruleset. See **Phase 4
→ Firebase integration groundwork** above for what it covers and the honest note about
its `firestore.get()` cross-service calls being unverified against a real project.

## Authentication

Unchanged from Phase 2's own description below this line, with one addition: the
checkout-only auth gate (`openAuthPromptForCheckout`) was **generalized**, not replaced —
`auth-ui.js` now has `openAuthPromptForAuth(reason, onResume)` underneath it, where
`reason` is `'checkout' | 'favorite' | 'review'`, each with its own sign-in banner copy
(`BANNER_TEXT` in that file). `openAuthPromptForCheckout(onResume)` is kept as a thin
wrapper specifically so `order.js`'s existing import/call site needed zero changes. The
same "only engages once `isFirebaseConfigured()` is true" invariant applies to all three
reasons now, not just checkout — see **Phase 3 → Favorites/Reviews** above. Saved
addresses (Phase 4) deliberately does NOT get a fourth `reason` — see **Phase 4 → Saved
Addresses** above for why it doesn't need one.

`js/auth.js` implements sign up (accepts an optional `displayName`), login (accepts a
`keepSignedIn` flag), Google popup sign-in, password reset, logout, and
`onAuthStateChangedListener` — all unchanged since Phase 2. **Phase 4** added
`changePassword` (reauthenticate-then-`updatePassword`), `isPasswordProvider` (hides the
change-password form for a Google-only account), `updateAuthDisplayName`/
`updateAuthPhotoURL` (keep the Auth user object's own fields in sync with the Firestore
profile after an edit — see **Phase 4 → Profile** above for why both are needed, not just
the Firestore write), and `refreshCurrentUserProfile` (re-reads the cached profile after
any write that happens outside a full sign-in/out cycle, which is the only thing that
otherwise refreshes it).

**Google sign-in needs one more manual step beyond "enable Authentication"**: the Google
provider specifically has to be turned on in the Firebase console's Sign-in Methods tab
(and, for a production domain, an OAuth consent screen configured in the linked Google
Cloud project). Nothing in this codebase can do that step. **Phase 4 adds a second such
step:** the Storage↔Firestore cross-service permission `storage.rules`' `firestore.get()`
calls depend on has to be enabled once in the Firebase console the first time a project
uses it — also nothing here can do that step; see `storage.rules`' own header comment.

## Features completed

See README.md's "Features completed" section for the user-facing list (kept there
specifically so the two files don't drift out of sync — skim it before reading further
here). Everything in it is real and was verified per this file's Honesty note. Two pieces
of nuance worth adding here rather than in the user-facing README: **cart badges (nav +
modal) still always match the real cart count** — the Phase-1-origin bug the stabilization
pass fixed, reconfirmed again by this phase's Node harness alongside everything new; and
**every Firestore-touching function added or changed this phase returns the same
documented safe fallback when Firebase isn't configured** that every function before it
already did (`null`/`false`/`[]`/a no-op unsubscribe) — verified directly, not assumed, by
calling each one in the Node harness with no Firebase project configured and asserting the
fallback value (see **Verification**).

**Phase 6 (Admin Menu Manager):** every feature bullet in the original request is built —
view/search/filter/sort, add/edit/delete, toggle availability, change display order, edit
name/description/price/category/image URL, image preview (including live-uploading via
Storage), and badge assignment via the labels checklist. (The four dedicated badge-toggle
buttons this bullet originally shipped with are gone as of the Phase 4 Continuation section
above — badges are a single system now, managed through the same labels checklist as
everything else; see that section.) See **Phase 6 — Admin Menu Manager** above for the
architecture and the Honesty note's Phase 6 addendum for exactly what was and wasn't
verified — real-browser-tested against mocked data (85 passing assertions), not a real
Firebase project.

**Phase 6 (Order Management):** every feature bullet in the original request is built —
customer My Orders now has an error state, real loading skeletons, individual item prices,
delivery/pickup and payment detail, and Cancel Order (while RECEIVED); the admin Orders
Dashboard has a live queue, search by order#/customer/phone, status filtering, newest/
oldest sort, per-order status controls populated from that order's real timeline, and a
full detail view with a reused timeline visualization. See **Phase 6 — Order Management**
above for the architecture (including how this phase's assumed 5-status vocabulary was
reconciled with the real 8-value model) and the Honesty note's Order Management addendum
for exactly what was and wasn't verified — 90 new passing assertions this pass (200 total
across both admin features combined, including the previous 110 re-confirmed unchanged),
still not a real Firebase project.

## Files created

**Phase 1 / Phase 2:** see those phases' own records above — unchanged, not repeated
here.

**Phase 3:**
- `js/menu-filter.js` — search/category filter state + matching/highlighting logic, no DOM
- `js/menu-render.js` — sticky search+category toolbar, product-card grid (replaced the
  old simple list previously built inline in `ui.js`)
- `js/favorites.js` — favorites state, Firestore-synced + localStorage-mirrored
- `js/product-modal.js` — Product Details modal
- `js/reviews-data.js` — review CRUD + rating-aggregate recompute, no DOM
- `js/reviews-ui.js` — review list/form/replies/helpful rendering
- `css/product-grid.css` — category nav, search bar + suggestions, product-card grid
- `css/product-modal.css` — Product Details modal layout

**Phase 4:**
- `js/toast.js` — one shared, reusable notification (background-save failures,
  offline/online banner)
- `js/storage.js` — Firebase Storage wrapper (`uploadProfilePicture`, generic
  `uploadImage` prepared for Phase 6's menu-photo uploader)
- `js/addresses.js` — saved-addresses CRUD, Firestore-synced + localStorage-mirrored (same
  shape as `favorites.js`)
- `js/order-history.js` — order-history state, subscribes to `subscribeToUserOrders`, no DOM
- `js/order-history-ui.js` — My Orders list rendering (view/order-again/track per row)
- `storage.rules` — this project's first Storage ruleset

**Phase 6 (Admin Menu Manager):**
- `admin/index.html` — replaces the Phase-6 placeholder; the whole admin shell (sign-in
  gate, dashboard, add/edit-item modal, delete-confirm dialog)
- `admin/css/admin.css` — everything page-specific: gate, header, toolbar, item rows,
  form controls, and the scoped desktop overrides for the two reused modals (see
  **Phase 6 — Admin Menu Manager → CSS** above)
- `admin/js/admin-data.js` — wraps `fetchMenuItems`/`addMenuItem`/`updateMenuItem`/
  `deleteMenuItem`; local `allItems` cache, optimistic updates, `getKnownCategories()`,
  `getNextDisplayOrderForCategory()`
- `admin/js/admin-filter.js` — search/category (reused from `js/menu-filter.js`) +
  availability filter + sort, no DOM
- `admin/js/admin-auth.js` — staff-only sign-in gate wrapping `js/auth.js`
- `admin/js/admin-render.js` — toolbar wiring + item list rendering, event-delegated
  row actions
- `admin/js/admin-item-form.js` — add/edit modal: validation, image upload wiring,
  badge toggles, on-the-fly category creation
- `admin/js/admin-confirm.js` — generic reusable confirm dialog (delete today; written
  generic for whatever the rest of Phase 6 needs one for next)
- `admin/js/admin-app.js` — entry point, same `DOMContentLoaded` → wire → let auth
  resolve shape as `js/app.js`

**Phase 6 (Order Management):**
- `admin/js/admin-orders-data.js` — wraps `subscribeToAllOrders`/`updateOrderStatus`; no
  optimistic local-cache patching (see **Phase 6 — Order Management** above for why that's
  a deliberate difference from `admin-data.js`, not an inconsistency)
- `admin/js/admin-orders-filter.js` — search (order#/customer/phone) + status-group filter
  (real statuses grouped into this phase's 5-word vocabulary) + sort, no DOM
- `admin/js/admin-orders-render.js` — toolbar wiring + order row rendering,
  event-delegated, per-row status `<select>`
- `admin/js/admin-order-detail.js` — the order detail modal: customer/items/payment/notes,
  a reused timeline visualization, and the status-change control

**Phase 6 (Admin Dashboard, continued):**
- `admin/js/admin-delivery-zones.js` — Delivery Zones CRUD, architecturally identical to
  `admin-taxonomy.js`'s categories/labels; live `subscribeToDeliveryZones()`, event-
  delegated row actions, a small add/edit modal, delete via `admin-confirm.js`
- `admin/js/admin-settings.js` — the delivery-fee/bank-details form; live-subscribed with
  dirty-tracking so an incoming snapshot never overwrites an in-progress edit

## Files modified

**Phase 6 (Admin Dashboard, continued):** unlike the Admin Menu Manager phase, this pass
genuinely touches root-level customer-facing files — confirmed by re-reading each one
after editing, not just listed here from memory:
- `js/firestore.js` — added `subscribeToMenuItems()` (reuses the existing
  `subscribeToCatalogCollection()` helper; no new query)
- `js/order.js` — `DELIVERY_FEE`/`BANK_DETAILS` (static `config.js` constants) replaced
  with `getDeliveryFee()`/`getBankDetails()` (`js/restaurant-settings.js`) at all four
  call sites (`getOrderTotal()`, `buildOrderObject()`'s `deliveryFee` field, and the
  payment view's three bank-detail fields)
- `js/ui.js` — same substitution, one call site (the cart's fee line)
- `js/app.js` — same substitution for the copy-account-number handler; added one
  `initRestaurantSettings()` call to `init()` (previously never called anywhere)
- `js/restaurant-settings.js` — header comment only; behavior unchanged, now actually has
  callers (see above) instead of none
- `admin/js/admin-data.js` — rewritten: `loadAllMenuItems()` (one-shot fetch + optimistic
  per-write cache patch) → `startMenuItemsSubscription()` (live listener, no patching);
  added `getLowStockItems()`/`LOW_STOCK_THRESHOLD`
- `admin/js/admin-render.js` — imports/Refresh-button/retry-action updated for the above;
  item rows show a stock count + Low Stock tag; load-failure copy updated now that
  empty-vs-error is no longer ambiguous
- `admin/js/admin-item-form.js` — added the optional Stock Quantity field (input,
  validation, read/write on submit)
- `admin/js/admin-dashboard.js` — added the Low Stock stat card + panel; fixed a
  pre-existing dead reference (`adminDashboardDataNote` existed in the JS, never in the
  HTML — see **Phase 6 — Admin Dashboard (continued)** above)
- `admin/js/admin-taxonomy.js` — added `importLegacyBadgeLabels()`; both delete
  confirmations switched from `window.confirm()` to the shared `confirmAction()` dialog;
  `saveLabel()`'s inline duplicate-name check now reuses the new `findLabelByName()`
  helper instead of a second copy of the same logic
- `admin/js/admin-app.js` — imports/wiring updated for two new sections (Delivery Zones,
  Settings) and the live menu-items subscription; `initAdminDashboard()` now takes a
  second callback for its new "View menu" button
- `admin/index.html` — two new nav tabs + sections (Delivery Zones, Settings) + a new
  `zoneFormOverlay` modal; Dashboard gained a Low Stock stat card + panel + the
  previously-missing `adminDashboardDataNote` element; item form gained the Stock
  Quantity field; header comment extended
- `admin/css/admin.css` — `.admin-lowstock-tag`; spacing for the Dashboard's now-two
  stacked panels; `.admin-settings-form` layout; `zoneFormOverlay` added to the existing
  ID-scoped modal-chrome rules alongside `categoryFormOverlay`/`labelFormOverlay`; notice
  styling for the two new sections + the settings success state

**Phase 6 (Admin Menu Manager):** none. Every customer-facing file — `index.html`, every
`css/*.css`, every root `js/*.js`, `data/menu.sample.js`, `firestore.rules`,
`storage.rules`, `firebase.json`, `firestore.indexes.json` — is byte-for-byte identical to
before this session, confirmed by a full recursive diff, not just by intent. See
**Phase 6 — Admin Menu Manager** above for why a separate self-contained page made this
possible.

**Phase 6 (Order Management):** unlike the Menu Manager, this phase's customer-facing half
genuinely does touch shared files — confirmed by diff, not just listed here from memory:
- `js/order-tracking.js` — `scheduleAutoAdvance()` and its `advancedOrderIds` guard
  removed; `openTrackingForOrder()` no longer takes a `justPlaced` option; `updateOrderStatus`
  import removed (no longer called in this file); header comment rewritten to explain the
  retirement (see **Phase 6 — Order Management** above)
- `js/order-status.js` — comments updated now that a real cancel action exists on both the
  customer and admin sides (no logic change)
- `js/order-history.js` — new `hasOrdersError()`/timeout-based error detection; unchanged
  otherwise
- `js/order-history-ui.js` — substantially rewritten: real skeleton rows, individual item
  prices, delivery/payment/notes detail, error-state rendering, Cancel Order
- `js/app.js` — `handleConfirmPayment()`'s `openTrackingForOrder` call simplified (no more
  `justPlaced` option)
- `index.html` — added `#ordersListError`; removed the now-fully-superseded
  `#ordersListLoading` plain-text element
- `css/auth-modal.css` — new rules for the order row's expanded detail content, Cancel
  Order button, error state, and skeleton rows
- `admin/index.html` — nav tabs, the Orders section, the order detail modal; `payment-tracking.css`
  now loaded; the pre-existing (not-this-session) Google sign-in button/divider's inline
  styles moved into `admin/css/admin.css`
- `admin/css/admin.css` — nav tab styles, order row styles, detail modal content styles,
  the Google button/divider cleanup above, and a third scoped desktop override
  (`#orderDetailOverlay`) alongside the existing two
- `admin/js/admin-app.js` — wires in the new Orders modules; added `showAdminSection()`
  for the Menu/Orders nav switch

Also found already changed from what was delivered last session, from work done outside
this conversation — **not modified by this phase**, left exactly as found (see
**Phase 6 — Order Management** above for the full account): `js/auth.js` (gained
`linkPasswordToAccount()`, confirmed unused), `admin/js/admin-auth.js` (Google sign-in
wired in).

**Phase 3:**
- `data/menu.sample.js` — full schema rewrite (see **Phase 3 → Firestore menu schema**);
  9 → 16 items; new `MENU_CATEGORIES`; every item gained `image`/`rating`/`reviewCount`/
  badges/`available`/`displayOrder`
- `js/menu-data.js` — `getMenu()` now filters `available !== false` and sorts by
  `displayOrder`; `getCategories()` derives from that filtered set; new
  `patchMenuItemLocal()` for live rating updates; field-name rename throughout
- `js/store.js` — cart seeded from and persisted to `localStorage`; `render()` also
  calls `refreshProductModalIfOpen()`; `renderMenuList` import repointed to
  `menu-render.js`
- `js/cart.js` — new `pruneCartToExistingItems()` and `reorderFromOrder()`
- `js/ui.js` — old `buildOrderItemRow()`/`renderMenuList()` removed (moved to
  `menu-render.js`); `buildStepper`/`buildAddBtn` now exported for reuse;
  `anyOverlayOpen()` gained `'productOverlay'`; `showView()` gained the `order-focused`
  class toggle; `renderUpsell()`'s field-name rename (`m.cat` → `m.category`)
- `js/auth-ui.js` — `checkoutPending` boolean generalized to `pendingReason`;
  `openAuthPromptForAuth(reason, onResume)` added, `openAuthPromptForCheckout` kept as a
  wrapper; `renderAccountView` gained the favorites list
- `js/order-tracking.js` — remembers the just-placed order; shows/wires an "Order Again"
  button alongside the existing "Start a new order" one
- `js/app.js` — wires every new `initX()`; `productOverlay` added to backdrop-click/
  Escape handling (checked first); `pruneCartToExistingItems()` called once after
  `loadMenu()` in `init()`
- `js/firestore.js` — old placeholder `fetchReviews()`/`addReview()` replaced with the
  full Phase 3 set: `fetchReviewsForItem`, `upsertReview`, `deleteReview`,
  `addReplyToReview`, `toggleHelpfulOnReview`
- `js/utils.js` — added `escapeHtml()`, `starsHtml()` (shared rating markup, used by
  product cards/modal/reviews instead of three copies), `formatRelativeTime()`
- `index.html` — `#view-menu` restructured (toolbar + `#productGrid`, replacing
  `#menuList`); `#productOverlay` modal added; `authView-account` gained the favorites
  section; tracking view gained the Order Again button; 2 new CSS files linked
- `css/order-modal.css` — dead `.menu-category`/`.order-item*`/`.mini-tag` rules removed
  (nothing renders them anymore); header comment updated
- `css/reviews.css` — extended with the full live review system (form, star input, list,
  replies, helpful)
- `css/auth-modal.css` — extended with the favorites-in-account-view section
- `css/payment-tracking.css` — `.tracking-actions` wrapper + `#orderAgainBtn` styling
- `css/responsive.css` — tablet 2-column grid (extends the existing 640px block); new
  1024px desktop two-column layout block (see **Phase 3 → Responsive layout**); touched
  again in both rounds of the **Post-Phase-3 desktop polish passes** below
- `firestore.rules` — `menuItems`/`reviews` activated (were commented out); see
  **Firestore** above for the field-scoped `menuItems` update rule
- `firestore.indexes.json` — added the `orders` composite index (see **Firestore** above)

**Post-Phase-3 polish — Round 1 (layout fix):**
- `css/responsive.css` — only file touched. New `#productOverlay`/`#productModalBody`-
  scoped rules added to the existing `min-width:1024px` block; nothing removed or
  rewritten, see **Post-Phase-3 desktop polish passes → Round 1** above.

**Post-Phase-3 polish — Round 2 (informational redesign):**
- `index.html` — added heading/pills/meta-grid/trust-row elements inside
  `.product-modal__info`; nothing removed
- `js/product-modal.js` — new `renderPills()`/`renderMetaGrid()`; `renderFavoriteButton()`
  extended to also sync the new pill; new `BRAND_NAME` import from `js/config.js`
- `css/product-modal.css` — base (hidden-by-default) styles for the four new elements;
  `white-space:pre-line` added to `.product-modal__desc`
- `css/responsive.css` — desktop `display` overrides for the new elements; hero height
  430px → 450px; info-column gap 16px → 14px — see **Round 2** above for why

**Phase 4:**
- `js/firestore.js` — added `subscribeToUserProfile`, `getUserOrders`,
  `getNextOrderNumber` (transaction), `fetchReviewsByUser`; `upsertReview` now accepts and
  always writes `verifiedPurchase`; header comment updated (new collection, corrected a
  stale "guest checkout TBD" note that Phase 2 had already resolved)
- `js/auth.js` — added `changePassword`, `isPasswordProvider`, `updateAuthPhotoURL`,
  `updateAuthDisplayName`, `refreshCurrentUserProfile`
- `js/order-status.js` — added `TERMINAL_STATUSES`/`isTerminalStatus`/`isCancelled`/
  `getStatusIndex`/`getStatusLabel`; documented the brief's suggested status vocabulary →
  existing model mapping
- `js/favorites.js` — one-shot `getUserProfile` read on auth-change → live
  `subscribeToUserProfile`; save failures now surface a toast instead of failing silently
- `js/reviews-data.js` — `submitReview` computes and passes `verifiedPurchase`
  (monotonic-OR against any existing value); added `loadMyReviews`/`getCachedMyReviews`
  for the profile's review history
- `js/order.js` — full rewrite: pickup-phone validation, in-flight duplicate-order guard,
  real `orderNumber` generation with random-id fallback, `paymentStatus`/`customerPhone`
  fields, saved-address "save this address" hookup, checkout error handling; the order
  object's own `id` field is no longer a fake client-random string — see **Phase 4 →
  Orders** above for the identity-model fix
- `js/order-tracking.js` — full rewrite: real Firestore-subscription-driven rendering with
  the original local-timer simulation kept as the unconfigured/no-real-id fallback; new
  `openTrackingForOrder(order, {justPlaced})` entry point; cancelled-state rendering
- `js/ui.js` — `renderFulfilmentAndTotals` gained the pickup-phone field toggle, saved-
  address picker, save-address-checkbox visibility, and best-effort contact-field prefill;
  new `initCartAddressSync()`
- `js/menu-data.js` — added `isMenuLoading()`/`didMenuLoadFail()`; `loadMenu()` now tracks
  both
- `js/menu-render.js` — `renderProductGrid` shows a skeleton while loading and a small
  notice on a real Firestore error; new `buildSkeletonCard()`/`renderMenuLoadNotice()`
- `js/auth-ui.js` — full rewrite: `AUTH_VIEWS` gained `'orders'`; `renderAccountView`
  (now exported) also renders addresses/reviews/password-section-visibility and resets to
  the read-only display on every open; new `renderAccountAddresses`,
  `populateAddressFormForEdit` (exported), `renderAccountReviews`/`refreshAccountReviews`,
  `updatePasswordSectionVisibility`; `renderAuthNav` (now exported) shows an uploaded/
  Google photo when present; `initAuthUI` wires the edit-profile toggle, avatar upload,
  and order-history entry/back links
- `js/auth-forms.js` — added `handleEditProfileSubmit`, `handleChangePasswordSubmit`,
  `handleAddressFormSubmit`; header comment updated for the file's expanded scope
- `js/app.js` — `exposeOnclickBridge()`/`wireStaticControls()`/every `initX()` now run
  BEFORE `await loadMenu()`, not after (see **Phase 4 → Menu loading & error states**
  above for the bug this fixes); wires the five new Phase 4 `initX()` calls;
  `handleConfirmPayment` calls `openTrackingForOrder(order, {justPlaced:true})`
- `index.html` — account view gained edit-profile form, avatar upload controls, saved-
  addresses section + inline form, review-history section, change-password section, and
  an order-history entry link; new `authView-orders` view; cart view gained
  `#pickupPhoneField`, `#savedAddressPicker`, the save-address checkbox; payment view
  gained `#checkoutError`; menu view gained `#menuLoadNotice`
- `css/auth-modal.css` — extended with every new account-view section's styling;
  `.account-avatar` gained `position:relative` (anchors the new upload button; no visual
  change on its own)
- `css/order-modal.css` — saved-address picker/chip, save-address-checkbox spacing
- `css/product-grid.css` — skeleton card + shimmer lines, menu-load notice
- `css/base.css` — toast styling (page-wide, not scoped to one modal)
- `css/animations.css` — `shimmer` keyframe
- `css/header-nav.css` — `.nav-profile-chip__avatar` gained `object-fit:cover` (no effect
  on the existing text-initials case; only applies once used on an `<img>`)
- `firestore.rules` — `orders` create rule tightened (`userId` must match
  `request.auth.uid`); new `counters/{counterId}` match block; header comment updated
- `firebase.json` — added the `storage` key pointing at `storage.rules`

## Engineering decisions

- **Store/setState/render pattern**, **Firestore-first-with-sample-fallback**,
  **`onclick=""` + window bridge preserved for the original ~8 legacy buttons only** —
  all from Phase 1, all still accurate.
- **Surgical, higher-specificity CSS overrides instead of editing shared rules** — Round
  1's fix, and reused again in Round 2's new elements: when two things share a base class
  for legitimate chrome-reuse reasons (the order modal and product modal both use
  `.order-modal`) but need genuinely different behavior at a given breakpoint, adding a
  more-specific, narrowly-scoped rule (`#productOverlay .product-modal`) that provably
  outranks the shared one is lower-risk than editing the shared rule to somehow serve
  both — zero chance of regressing the thing that already worked. Worth reusing this
  pattern any time two features share base styling but diverge later.
- **Conditional rendering instead of invented data** — Round 2's other defining choice:
  when asked to display fields that don't exist in the schema (prep time, spice level,
  calories), the answer was never "make up something plausible" — `renderMetaGrid()`
  only adds a cell when the real field is present, so today's menu (which has none of
  these fields) simply shows fewer cells, correctly, rather than fabricated ones. The
  same "real data always, everything else conditional or explicitly static" split
  applies to every new Round 2 element — see **Round 2** above for the full breakdown of
  which is which.
- **The checkout gate's `isFirebaseConfigured() && !user` condition**, generalized this
  phase to favorites/reviews — see **Authentication** above. Still the single most
  important invariant in this codebase: never gate a Firebase-backed feature without it.
- **Deterministic review doc ids** (`${itemId}_${uid}`) — see **Phase 3 → Reviews**.
  Worth naming the one honest caveat explicitly: menu item ids are hand-picked and never
  contain `_` (verified), Firebase Auth uids are backend-generated and essentially never
  do either, so a collision between two different (item, user) pairs producing the same
  joined id is a theoretical, not practical, concern at this project's scale.
- **Denormalized rating/reviewCount, recomputed client-side.** The honest tradeoff: a
  determined client could write a bogus number directly to a menu item's `rating` field,
  since the Firestore rule only restricts *which fields* a non-staff write can touch, not
  that the values match reality. The correct production hardening is a Cloud Function
  trigger on the `reviews` collection that owns this field instead of the client — out of
  scope for a vanilla-frontend-only project, named here rather than left unstated.
- **CSS-only desktop layout via one additive JS class toggle** (`order-focused`) — see
  **Phase 3 → Responsive layout**. Chosen over duplicating markup or rewriting
  `showView()`'s core logic specifically because it's the smallest possible diff that
  achieves "same architecture, genuinely different desktop experience."
  `!important` is used exactly twice, both against a specific, understood inline-style
  competitor (`showView()`'s own `element.style.display` calls) — not a general escape
  hatch.
- **`escapeHtml()` for all customer-submitted text.** Menu item text stays unescaped by
  deliberate design (staff-authored, trusted, unchanged since Phase 1) — reviews/replies/
  the search-highlight query are the first user-generated content this project renders
  via `innerHTML`, so this is a new, real security boundary, not a style preference.
- **`starsHtml()` centralized in `utils.js`** rather than duplicated across
  `menu-render.js`/`product-modal.js`/`reviews-ui.js` — also carries a `.tiny`/`.small`/
  `.on-light` CSS variant, since the pre-existing `.stars-bg` color (`css/base.css`) was
  tuned for the dark indigo hero background and is nearly invisible on the white/cream
  cards every new Phase 3 usage sits on; `css/reviews.css`'s own pre-Phase-3
  `.review-summary .stars-bg` override had already solved this exact problem
  independently, confirming the fix direction.
- **Pexels stock photography as placeholder images**, sourced via `web_search`/
  `web_fetch` (no bash-tool network access in this sandbox to verify URLs directly) —
  see **Phase 3 → Real food images**. Explicitly flagged as a pre-launch swap-out, not
  production content, in three places (data file, README, here) rather than one, since
  it's the kind of thing that's easy to silently ship if under-flagged.
- **Reviews/favorites use a synthetic 'guest' identity when Firebase isn't configured**,
  rather than refusing to work — matches checkout's existing "ungated when unconfigured"
  degradation instead of introducing a new, inconsistent failure mode.
- **Verification, not assumption** — continued and extended this phase; see Honesty
  note's Phase 3 addendum for the new full-module-graph-import + integration-scenario
  technique, and the note below on why the checker scripts still aren't committed.
- **The import/export, DOM-id, and (new this phase) full-module-graph-import checker
  scripts are written fresh each session, not committed to the repo** — same reasoning as
  every prior phase: a handful of lines, reproducible in under a minute, and committing
  them would add maintenance surface to a project whose deliverable is the site itself.

- **Phase 4: a Firestore transaction for order numbers, not a client-random guess.**
  `getNextOrderNumber()` is the first transaction in this codebase — chosen specifically
  because the old 4-digit random id (9000 possible values) was a real collision risk, and
  a transaction is achievable from a vanilla frontend with no Cloud Functions, matching
  every other "production-ready without a backend" choice this project has made. Falls
  back to that same old random format if unconfigured or the transaction fails, so
  checkout is never blocked by it — same "degrade, never break" shape as everything else.
- **Phase 4: the brief's suggested tracking-status vocabulary was mapped onto the
  existing model, not used to rename or extend it** — see **Phase 4 → Live order
  tracking** above for the full reasoning; named here again because it's exactly the kind
  of judgment call this project's culture asks to be flagged rather than made silently.
- **Phase 4: `scheduleAutoAdvance()` writes real Firestore status transitions on a timer,
  standing in for a real admin dashboard that doesn't exist yet.** The alternative —
  leaving live tracking purely read-only until Phase 6 — would have technically satisfied
  "read real order status from Firestore" while making the customer experience *worse*
  than Phase 1's simulation (a status that never moves). Explicitly scoped to only the
  order the current tab just placed, never a reopened one, and its timers are
  deliberately NOT tied to the tracking view's own cleanup — they represent a real,
  in-progress backend commitment for that specific order, not a UI concern.
- **Phase 4: Verified Purchase is monotonic-OR, never re-derived from scratch.**
  `submitReview()` computes `existing?.verifiedPurchase || (fresh check)` rather than just
  using the fresh check's result — a transient `getUserOrders()` failure during an edit
  must never downgrade an already-true badge, since a real purchase, once made, can't be
  un-made. The same reasoning `js/firestore.js`'s `upsertReview()` header comment gives
  from the write side.
- **Phase 4: two independent `subscribeToUserProfile` listeners (favorites, addresses)
  instead of one shared subscription module.** The Firestore SDK multiplexes same-document
  listeners from the same client over one underlying stream, so the real cost of a second
  listener on one small document is one extra client-side registration, not a network
  round trip — cheap enough that keeping each feature module fully self-contained (same
  pattern every other feature in this project already follows) won a marginal efficiency
  gain that would have meant introducing a new shared-state module.
- **Phase 4: "Settings" scoped down to what's real, not built as a speculative panel.**
  The brief's own word, but nothing else in its spec defines what a "setting" is here —
  scoped to the edit-profile form plus password management (both real, both backed by
  actual functionality) rather than adding toggles for preferences nothing else reads.
  Same "real data or nothing invented" rule Round 2 already established for menu-modal
  fields, applied here to a feature rather than a data field.
- **Phase 4: fixed the order-identity-model gap rather than building tracking around
  it.** `saveOrderToFirestore`'s real Firestore document id was being silently discarded
  by its only caller before this phase — nothing could have correctly subscribed to a
  specific order's real-time status without first fixing that, so it was fixed as part of
  making tracking real rather than worked around.
- **Verification, not assumption** — continued and extended again this phase; see
  Honesty note's Phase 4 addendum for what's new (the DOM stub's `innerHTML`-aware
  `querySelector`, which fixed a real gap in Phase 3's own harness, not just this phase's
  new code) and the note below on why the checker scripts still aren't committed.

## Known bugs / edge cases / temporary limitations

- **A real (headless) browser has now touched this codebase substantially — but a real
  Firebase project still never has.** Four phases (Phase 2, the stabilization pass, Phase
  3, Phase 4) plus both rounds of the Post-Phase-3 desktop polish shipped without any real
  browser at all; the Post-Phase-4 modal fix was the first pass to actually drive real
  Chromium, for one narrow thing (one modal's scroll/touch mechanics). The Admin Menu
  Manager and Order Management passes went considerably further — real Playwright/Chromium
  driving the actual production rendering/validation/event-handling code against a
  byte-diffed mock data layer (200 passing assertions across both admin features
  combined — 110 from the Menu Manager pass, 90 new this pass), plus the real, unmocked
  pages confirmed to degrade cleanly rather than crash
  under this sandbox's actual blocked-network condition. That's real evidence for a lot
  more than before — but still: no real Firebase project has ever been connected, so that
  remains the single most important thing to do before continuing — see **Pending
  Tasks**. Concretely unverified by anything in this repo, on top of everything named in
  earlier phases: whether the rewritten live-tracking view actually updates in real time
  against a real `onSnapshot` listener; whether `getNextOrderNumber()`'s transaction
  behaves correctly under real concurrent checkouts; whether `storage.rules`' cross-service
  `firestore.get()` calls are accepted as written (the Storage↔Firestore permission link
  has to be enabled once, in the console, the first time a project uses it — nothing here
  can do that step); whether a real admin's `updateOrderStatus()` write and a real
  customer's own cancel both actually land and are actually gated the way
  `firestore.rules` intends; and whether the substantial account-view UI's actual *data*
  behavior (avatar upload, addresses CRUD, review/order history rendering real records,
  password change) is correct — only its modal chrome (open/close/scroll) has ever been
  driven in a real browser, not what happens once a real signed-in customer with real
  Firestore data is behind it.
- **Placeholder images.** Every `image` URL in `data/menu.sample.js` is real, freely-
  licensed stock photography, not Albaik's own food — see README's Firebase setup step 7
  and that file's own header comment. Swap before any real launch.
- ~~**No customer-facing way to cancel an order.**~~ **Resolved in Phase 6 (Order
  Management)** — `js/order-history-ui.js`'s Cancel Order button (visible while an order
  is still `RECEIVED`) calls the same `updateOrderStatus()` this note originally pointed
  to; staff can also cancel from the admin Orders Dashboard's status control.
- ~~**Live order tracking has no real admin behind it yet.**~~ **Resolved in Phase 6
  (Order Management)** — `scheduleAutoAdvance()` has been removed; a delivery/pickup
  order's status now only ever changes when a real customer cancel or a real staff
  update writes it, from the admin Orders Dashboard. See **Phase 6 — Order Management**
  above for the retirement.
- **The address/pickup-phone autofill can reapply itself.** `js/ui.js`'s
  `prefillContactFields()` fills an empty field from the customer's default saved
  address/profile phone on every cart-view render, by design — but that means if a
  customer deliberately clears the field back to empty (rather than editing it), the next
  render (e.g. changing an item's quantity) will offer the same default again. Named as a
  minor, accepted UX nuance, not fixed with additional "was this field touched" state
  tracking.
- **The `menuItems` rating/reviewCount fields, and now `reviews.verifiedPurchase`, are
  client-writable by any signed-in customer, values unverified server-side.** See
  **Engineering decisions** for the full tradeoff and what the "correct" production fix
  (a Cloud Function) looks like — the same caveat, now covering one more field.
- **A narrow page-load race** (Phase 2, unchanged): a `keepSignedIn` session's very first
  instant after page load, before `onAuthStateChangedListener`'s restore resolves, can
  briefly show the sign-in modal to an already-signed-in customer. Not fixed — flagged as
  intentionally out of scope for how narrow the window is.
- **Google sign-in requires its own provider + OAuth consent screen setup** — unchanged
  from Phase 2, easy to miss if you only read "enable Authentication." **Phase 4 adds a
  second, analogous manual step**: the Storage↔Firestore cross-service permission
  mentioned above.
- **The Admin Menu Manager's own known limitations** (no bulk actions/drag
  reorder/pagination, no self-service staff account creation) are listed where they were
  decided, not repeated here — see **Phase 6 — Admin Menu Manager**'s final bullet list
  above. One limitation from that same list is no longer current, addressed in
  **Phase 6 — Admin Dashboard (continued)**: the admin side's `fetchMenuItems()`-returns-
  `null`-for-both-empty-and-failed ambiguity no longer affects the Menu Manager, since it
  now uses a live `subscribeToMenuItems()` listener instead of that function —
  `fetchMenuItems()` itself is unchanged and the same ambiguity still applies to its one
  remaining caller, `js/menu-data.js`'s customer-facing `loadMenu()`, exactly as before.
  That live listener also adds a capability that never existed in any form before (so
  there was never a limitation bullet about its absence): the Menu Manager now syncs
  live across an already-open admin tab or another signed-in staff member's concurrent
  edit — separate from, and not to be confused with, the CUSTOMER-facing "no live
  listener" limitation immediately below, which remains exactly as it was.
- **The customer-facing MENU ITEMS still have no live listener** — `js/menu-data.js`'s
  `loadMenu()` re-reads Firestore once per page load, unchanged by this pass. An admin's
  edit to an item's name/price/description/etc. still only reaches a customer on their
  next page load/reload, not instantly on an already-open customer tab, exactly as
  originally named in **Phase 6 — Admin Menu Manager** above. Narrower than it sounds
  after Phase 4 Continuation, though: labels/badges, delivery zones, and the site-wide
  reviews aggregate ARE now live on the customer side too (`js/labels-data.js`,
  `js/delivery-zones-data.js`, `js/site-reviews.js`) — this bullet is specifically about
  the menu item fields themselves (name, price, description, category, image,
  availability, display order), which still need a reload.
- **~~Delivery Zones is reference data for staff, not wired into checkout's own
  pricing~~ — RESOLVED in Phase 4 Continuation.** `js/order.js`/`js/ui.js` now resolve the
  delivery fee from the customer's chosen zone (`js/delivery-zones-data.js`'s
  `resolveDeliveryFee()`), falling back to Settings' flat fee only if no zones are
  configured yet. See **Phase 4 Continuation — Eliminate Fake Data & Full Firestore Sync**
  above.
- **The legacy-badge label import has a narrow, self-resolving race**: if two staff
  members open the admin panel for the very first time at the exact same moment, before
  any managed labels exist, both could create the same badge-name label once each (no
  unique-name constraint exists for labels). Not fixed — an admin can delete the
  duplicate with the delete-label action that already existed. See **Phase 6 — Admin
  Dashboard (continued)**.
- **Settings' delivery fee and bank details are the only restaurant configuration that's
  live-editable** — brand name, tagline, location, phone, and WhatsApp number remain
  static `config.js` constants, deliberately not moved to Firestore this pass (doing so
  would mean also rewriting how `index.html`'s static markup renders them). See
  **Phase 6 — Admin Dashboard (continued)**.
- **Review moderation** — the one piece of the originally-planned Admin Dashboard not yet
  built. No admin UI exists to hide or delete a customer's review; `js/reviews-data.js`'s
  customer-facing CRUD (a customer can delete their own review) is unchanged and is not
  the same thing.
- ~~**"Order Again" only works right after placing that specific order.**~~ **Resolved in
  Phase 4** — My Orders (`js/order-history-ui.js`) now offers it from any past order, using
  the same already-general-purpose `reorderFromOrder()` this note originally pointed to.
- ~~**Verified Purchase is permanently false today.**~~ **Resolved in Phase 4** — see
  **Phase 4 → Verified Purchase** above for exactly how, and the one honest caveat that
  comes with it (folded into the rating/reviewCount bullet above).

## Customer experience spec (Domino's/Temu/Thai-food-site-referenced)

**Phase 2's own items** (sign-in modal, sign-up form, nav state, lightweight profile
view) — unchanged, already shipped, see that phase's own notes below if diffing history.

**Phase 3's own kickoff references** (screenshots, not attached to this file, so future
sessions without them should treat the descriptions below as sufficient):
- **Domino's** (dominos.ng) — customer flow: header nav (Order Online/Menu/Deals/
  Stores/Tracker), a delivery-vs-carryout choice up front, a flat list-style category
  nav with small thumbnail icons, the sign-in modal and post-signup profile page already
  referenced in Phase 2. Used again here specifically for "how does browsing → ordering
  flow, end to end" feel, not for any new visual element.
- **Temu** — compact product-card information hierarchy: image-forward, price
  prominent, a compact rating/sold-count row, a cart icon/button, sale-style badges, a
  running-subtotal cart sidebar. This is the single biggest visual-inspiration source for
  `css/product-grid.css`'s card design and the desktop cart sidebar — deliberately
  reinterpreted in Albaik's own indigo/gold/pepper/cream palette, never Temu's own
  colors/typography/logo.
- **A Thai-food-site screenshot** — food photography sizing/quality and a large-image
  product-detail lightbox pattern. Informed the product modal's full-bleed hero image
  treatment specifically.

**What Phase 4 resolved from the previously-open items:**
- **Live order tracking wired to real Firestore data** — built, with one named,
  deliberate gap (no real admin to drive it yet — see **Known bugs/limitations**).
- **Saved delivery addresses used during checkout** — built exactly as the prior note
  anticipated.
- **Verified Purchase activation** — built exactly as the prior note specified: checks
  order history via (a one-shot equivalent of) `subscribeToUserOrders` and passes
  `verifiedPurchase` through to `upsertReview()`.
- **A real "My Orders" list** — built; `reorderFromOrder()` is now genuinely
  general-purpose, reachable from both the just-placed order's tracking view AND any past
  order in My Orders.
- **Most of Phase 5's originally-listed scope** — profile picture, saved-addresses CRUD,
  password management, order history, review history — landed this phase too, per the
  brief's own section 11. See **Still open** immediately below for exactly what that
  leaves.

**Still open, for Phase 5/6:**
- **Phase 5 (Profile & Settings) — now small.** What's left after Phase 4: a full,
  dedicated profile PAGE rather than the current lightweight account-view modal (still
  genuinely just a modal, now a long one — see **Phase 4 → Profile**), and whatever
  "settings" turns out to mean once there's a concrete feature behind that word (Phase 4
  deliberately did not invent one — see **Engineering decisions**). Confirm scope before
  starting it rather than assuming the original 7-phase plan's description still applies
  unmodified, the same caution Phase 3 gave about Verified Purchase's phase assignment.
- **Phase 6 (Admin Dashboard):** manage menu items/categories/orders/users, moderate
  reviews, manage restaurant settings; this is also where a customer-facing/staff-facing
  order-cancellation flow and the real staff-driven status updates that replace Phase 4's
  `scheduleAutoAdvance()` stand-in belong. `admin/index.html` is still a pure placeholder.
  `storage.rules`' `menu-images/{itemId}` path and `js/storage.js`'s generic `uploadImage`
  are already prepared for this phase's menu-photo uploader — see **Phase 4 → Firebase
  integration groundwork**.

## Pending tasks

1. **Still first**: create the real Firebase project (README's Firebase setup), deploy
   `firestore.rules`, `firestore.indexes.json`, AND `storage.rules` — including the
   one-time Storage↔Firestore cross-service permission `storage.rules`' `firestore.get()`
   calls need, enabled in the console (see that file's own header comment) — then click
   through every phase in an actual browser: guest and signed-in
   browsing/search/favorites/reviews, checkout (both fulfilment types, including the
   pickup-phone field and saved-address picker), live order tracking actually progressing
   in real time now that a real admin can drive it, My Orders (view/reorder/track/cancel),
   the full account view (edit profile, avatar upload, addresses CRUD, review history,
   change password), the desktop two-column layouts at a real ≥1024px viewport, the Admin
   Menu Manager's actual writes landing in a real `menuItems` collection, a real photo
   upload reaching a real Storage bucket, the admin Orders Dashboard's
   `updateOrderStatus()` writes and a customer's own cancel both actually landing and
   being enforced by `firestore.rules`, AND (new this pass) every write path Categories,
   Labels, Delivery Zones, and Settings now have — including the legacy-badge label
   import actually firing against a real, empty `menuLabels` collection, and Settings'
   saved delivery fee/bank details actually showing up in a real checkout — rather than a
   hand-written mock with the same function signatures. This is now six phases plus five
   polish/admin passes deep without it — Round 1 remains a direct demonstration of a bug
   class (CSS cascade/specificity) that only real-browser viewing catches, and the Admin
   Menu Manager pass found a second, unrelated instance of that exact same class
   (`[hidden]` vs. author `display`) the same way. The account view is still the largest
   amount of *customer-facing* UI never checked against real data; nothing changes that
   here.
2. Phase 5 — whatever's left of Profile & Settings (now small — see **Customer experience
   spec**). Untouched this session.
3. Review moderation — the one piece of Phase 6 — Admin Dashboard still open. Everything
   else Phase 6 originally meant is done: Dashboard (including live stats and Low Stock),
   Menu Manager (now live-subscribed, with optional stock tracking), Categories, Labels
   (with the four legacy badges importable), Delivery Zones, Order Management, Customers,
   Analytics, and Settings (with real effect on checkout) — see **Phase 6 — Admin Menu
   Manager**, **Phase 6 — Order Management**, and **Phase 6 — Admin Dashboard
   (continued)**.
4. Phase 7 as originally scoped.

## Next priority

Same call as every phase so far, now with four concrete examples behind it rather than
just a principle: do the browser + real-Firebase-project verification (Pending Task 1)
before writing any more feature code — Phase 5 or the rest of Phase 6. Round 1 of the
desktop polish fixed a bug that no amount of `node --check`, import/export cross-checking,
or integration-scenario testing could ever have caught — it took a person looking at the
actual rendered page. Round 2 added a question of the same shape (does the richer layout
actually fit); Phase 4 added a THIRD, larger one — the account view's substantial new UI
is still the single largest amount of visually-unverified *customer-facing* surface any
phase has shipped, on top of a live-tracking rewrite and a first-ever Storage ruleset that
both depend on real backend behavior no static check can simulate; the Admin Menu Manager
pass found a FOURTH instance of the exact same underlying lesson — a real browser (this
time genuinely driven via Playwright, not just looked at) caught a `[hidden]`/`display`
bug that 110 passing assertions across four verification tiers, including real DOM
rendering, did not catch on their own, because none of those tiers happened to check
computed visibility after a `.hidden = true` assignment specifically. It took actually
looking at whether the gate disappeared. The Order Management pass systematically checked
every new `hidden`-toggled element against its own CSS's `display` rules BEFORE shipping,
specifically because of that fourth example — and found none this time. Read that as the
discipline paying for itself, not as a reason it's no longer needed: the check is cheap,
happened to come back clean this pass, and should keep happening every time regardless.
There is no reason to expect issues of that general shape (things that look right from the
code but are only actually provable by looking) are exhausted in this codebase, in either
the customer-facing account view or either admin surface. If you're picking this up and
choosing to defer real-browser, real-Firebase verification again — your call, but say so
explicitly in this file rather than silently skipping it, same as every phase before has
asked.

**Addendum, this pass:** the same call, for a fifth time, plus one more concrete reason
this time — this pass's own **Current status** correction. The previous version of this
document described Categories, Labels, Customers, and Analytics as not-yet-started; they
were fully built and working. That's not evidence a person needs to re-verify code that
already works — it's evidence that this document's account of what's built and what
isn't has drifted from the code before, silently, and might again. A real-browser pass
would catch that kind of drift immediately (a missing feature is obvious the moment you
click for it); a document can carry it for an unknown number of sessions before anyone
notices, exactly as this one did.

**Addendum, Phase 4 Continuation:** the same call, for a sixth time. This pass's own
largest unverified surface: the entire new checkout delivery-zone flow (search, select,
fee calculation, validation) and its twin in the account address form, never driven by an
actual browser — reasoned through and cross-checked structurally (imports resolve, ids
match, no syntax errors), same as every phase before, not the same thing as watching the
searchable dropdown actually filter as someone types, or a saved address actually prefill
all three fields correctly. The homepage reviews aggregate (js/site-reviews.js) is the
same story — computed correctly on paper against Firestore's document shape, never seen
rendering against a real `reviews` collection. Both belong on the SAME real-browser,
real-Firebase-project pass Pending Task 1 already asks for — nothing here changes that
task's priority, only its size.

## Handoff notes

- **Existing patterns to keep using:** the guard-and-no-op pattern for every
  Firebase-touching function (Phase 3 extended it once more: no-op *or fall back to a
  synthetic guest identity*, for reviews/favorites specifically); `setState()` instead of
  ad hoc DOM updates; one file per concern rather than growing any file past ~250 lines
  (Phase 3 split menu-filter/menu-render/favorites/product-modal/reviews-data/reviews-ui;
  Phase 4 followed the same instinct for order-history/order-history-ui rather than
  folding either into an existing file, but deliberately did NOT split favorites-sized
  features like addresses the same way — see that file's own header comment for the
  "when does a feature actually need the heavier split" judgment call); the generalized
  `openAuthPromptForAuth(reason, onResume)` gate — reuse it for any future auth-gated
  action rather than inventing a new bespoke gate (Phase 4's saved addresses deliberately
  did NOT need a fourth reason — see **Phase 4 → Saved Addresses** for why, and check
  whether a new feature actually has a signed-out entry point before assuming it needs
  one either).
- **Do not** redesign any existing visual element — still the explicit brief, still
  followed: the homepage sections, the cart view's core layout, the payment/tracking
  views' core layout, and the auth modal's original sections are all visually untouched.
  New surfaces (product cards, the product modal, the desktop layout, and now Phase 4's
  account-view sections/pickup-phone field/saved-address picker) are new *because they
  didn't exist before*, not because anything existing was redesigned.
- **Do not** gate any feature on a Firebase call without also checking
  `isFirebaseConfigured()` — proven out across five independent features now (checkout,
  favorites, reviews, addresses, order history) using the exact same one-line condition
  every time.
- **Any element that both uses the `hidden` attribute/property AND has its own CSS
  `display` rule needs a matching `[hidden]{ display:none; }` override** — unchanged
  advice from the stabilization pass, rechecked again for every new `hidden`-toggled
  element Phase 4 added (`savedAddressPicker`, `saveAddressCheckboxWrap`,
  `checkoutError`, `menuLoadNotice`, the addresses/reviews/orders empty-and-loading
  states) — none of THOSE needed the override. Do not read that as "this stopped being a
  risk": the Admin Menu Manager pass checked the same way (grep every `display:`
  declaration against every `.hidden =` assignment) and found two real violations
  (`.admin-gate`, the item-form image preview `<img>`) — see the Honesty note's Phase 6
  addendum. The check is cheap; skipping it because the last few phases came back clean
  is exactly how this class of bug ships.
- **Before marking any phase complete:** run the same battery this phase used —
  `node --check` on every file, the import/export cross-check, a DOM-id cross-check,
  CSS brace-balance, an HTML tag-balance parse, a Node harness that `import()`s the
  *entire* module graph with `localStorage`/`document`/`window` stubbed, and a second
  script that exercises real business logic against real scenarios and asserts on the
  results (45 assertions this phase, all passing, on top of the 40 from Round 2). Still
  not a substitute for a real browser — see Pending Tasks — but catches real bugs static
  analysis alone would miss, cheaply enough to be worth doing every phase from here on.
- **A DOM stub's `getElementById` must return the SAME element instance on repeated
  calls for the same id** (Round 2's own lesson, restated because it's still exactly
  right) — an id-keyed registry (`Map<id, element>`) fixes this in a few lines.
- **A DOM stub's `querySelector` needs to actually look at what was assigned to
  `innerHTML`, not just always return `null`.** New lesson this phase: a first-pass stub
  that hardcoded `querySelector() { return null; }` made every function following the
  extremely common `el.innerHTML = '...<img>...'; el.querySelector('img').addEventListener(...)`
  pattern crash on a null dereference that had nothing to do with whether the application
  code was correct — and this pattern predates Phase 4 (`menu-render.js`'s
  `buildProductCard`, written in Phase 3), meaning Phase 3's own harness never actually
  ran that function far enough to exercise it, a gap that went unnoticed until this phase
  happened to call `setState()` with real menu data loaded during a test. The fix doesn't
  need to be a real HTML parser — a regex scan of the `innerHTML` string for tag names,
  `class="..."` values, and other attributes, returning a fresh fake element for any
  match, was enough to unblock every real code path in this codebase (see
  `run-verification`'s `dom-stub.mjs` for the actual implementation, rebuilt fresh each
  session same as always). Worth building this in from the start next time rather than
  discovering the gap mid-phase. Even with that fix, this stub still can't simulate
  `appendChild` actually attaching a child for cross-element `innerHTML`/`querySelector`
  purposes (querying INTO an already-appended child from its parent) — every list-row
  pattern in this codebase (favorites, addresses, reviews, order history) avoids that by
  querying each row's own `innerHTML` directly before appending it anywhere, which this
  stub does support; if a future phase ever needs the cross-element case, that's the next
  gap to close, not yet built.
- **A real Playwright browser plus a hand-written mock module (same exported function
  names/signatures, fake data instead of a real backend) is a genuinely stronger
  verification tier than the Node DOM-stub harness above, when it's available** — the
  Admin Menu Manager used this instead of extending the DOM stub, and it sidesteps every
  DOM-stub limitation named in the three bullets above for free: no `getElementById`
  identity registry to build, no `querySelector`-into-`innerHTML` regex scan, no
  cross-element `appendChild` gap, because it's a real browser DOM, not a simulation of
  one. The cost is that it needs something to serve the files over HTTP (`python3 -m
  http.server`, backgrounded with `setsid ... &` — a plain trailing `&` did not reliably
  survive between tool calls in this environment; `setsid` did) and a mock file for
  anything that would otherwise need real Firebase — worth it for a page with enough
  interactive surface to justify the setup (this one: sign-in, CRUD, filters, uploads),
  possibly overkill for something smaller than that. Still not a real Firebase project —
  see Pending Task 1 — but a real browser rendering the real application code against
  known data is strictly more evidence than a DOM stub or reasoning-through-the-code ever
  was.
- **A new admin sub-page that wants `.order-overlay`/`.order-modal` chrome should skip
  `css/responsive.css` entirely and write its own ID-scoped desktop rules**, the same
  choice the Admin Menu Manager made — see **Phase 6 — Admin Menu Manager → CSS** above
  for the full reasoning. Whoever builds the Orders or Users admin page next should reuse
  this pattern rather than rediscovering the leak it avoids.
- **Mocking Firestore/Auth/Storage for the CUSTOMER page needs a much bigger mock than the
  admin-only page did — and the reliable way to find every export it needs is loading the
  real page in a real browser and watching for actual `pageerror`/console errors, not
  grepping for import statements.** The Menu Manager's mock only ever needed to satisfy
  `admin/js/*.js`'s own imports; this phase's customer-facing changes meant the SAME mock
  files now also had to satisfy every OTHER module `index.html` loads (favorites, reviews,
  addresses, the whole account view) — profile functions, all six review functions,
  `uploadProfilePicture`, `signUp`/`resetPassword`/`changePassword`/etc., none of which
  this phase was even changing. A `grep -oE "import \{[^}]+\} from"` pass missed one
  (`addReplyToReview`, inside a multi-line import the regex's single-line pattern couldn't
  match) that only surfaced once the page was actually loaded in Playwright and the
  console error was read. The robust check that actually worked: diff the SORTED list of
  every real `export (async )?function` name in the source file against the same list from
  the mock — catches everything, multi-line imports included, in one pass per file.
- **A mock's function signatures matching the real ones isn't enough — the RETURN VALUE'S
  SHAPE has to match too, if any real caller destructures it.** This phase's mock
  `login()`/`loginWithGoogle()`/`signUp()` returned the plain user object directly; the
  real Firebase SDK functions they stand in for return a `UserCredential` (`{ user: {...},
  ... }`), and `js/auth-forms.js`'s `handleSignIn()` does `cred.user.uid` on the result.
  The Menu Manager's admin-only mock never caught this because `admin/js/admin-auth.js`
  calls `login()` and never touches its return value at all — the bug was latent, not
  absent, and only surfaced once a real customer sign-in flow was actually driven through
  a form that DOES use the return value. Worth checking a mock's return shape against every
  real caller's actual usage, not just against the real function's own signature.
- **Playwright's `page.clock.install()` / `page.clock.fastForward(ms)` can test a
  real, unshortened application timeout (this phase's `ORDERS_TIMEOUT_MS = 12000` in
  js/order-history.js) without either waiting 12 real seconds per test run or temporarily
  shrinking the constant for testing purposes** (which would mean testing a different
  number than what ships). Used once this phase specifically for that error-state test;
  worth reaching for again anywhere else a timeout needs real verification.
- **This is the second time a task brief's assumed status/data vocabulary has turned out
  simpler than what this codebase actually has** (js/order-status.js's own "PHASE 4
  addendum" was the first, this phase's 5-status assumption was the second) — worth
  actually checking a brief's assumed vocabulary/schema against the real code before
  building anything against it, rather than after, next time one shows up. Both times the
  resolution was the same: keep the real model as the single source of truth, treat the
  brief's simpler words as filter/display labels layered on top, and document the mapping
  inline where it's decided.
- **This pass's environment had no browser tool at all** — not Playwright, not even a way
  to serve the files over HTTP for a browser to load, unlike whatever tooling the Admin
  Menu Manager and Order Management passes had access to (both bullets above describe real
  Playwright/Chromium runs). This pass's verification sits a tier below even the Node
  DOM-stub harness described above: `node --check` on every changed file, a script that
  cross-checks every `import { X } from './Y.js'` in all 47 project JS files against Y's
  actual exports (caught and fixed a bug in the check script's own path handling before it
  produced a trustworthy result — worth rereading a static checker's own output skeptically
  before trusting a clean pass), a cross-check of every `getElementById()` call in
  `admin/js/*.js` against `admin/index.html`'s actual ids (one apparent miss turned out to
  be a pre-existing, correct, dynamically-injected id — see **Phase 6 — Admin Dashboard
  (continued)**'s honesty note), CSS brace/paren balancing, and several full re-reads of
  every changed file specifically looking for logic bugs (this is how the Settings
  notice-clobbering race and the Low Stock panel's inconsistent error-handling — see that
  same section — were actually caught: not by any script, by rereading the code against
  its own neighbor's more careful version of the same pattern). No DOM stub was built and
  no module graph was `import()`-ed and executed. If a future session has real browser
  tooling available again, this pass's new admin sections (Delivery Zones, Settings, the
  Dashboard's new panel) have exactly the same unverified-in-a-real-DOM status the Admin
  Menu Manager pass's own Honesty note describes for its own first draft — worth the same
  level of scrutiny, not assumed clean because the reasoning here was careful.


# TODO — Priorities 10–15 Implementation Tracker

One connected feature set: Review Moderation, Product-Centered Reviews, Item Review Page,
Data Audit, Admin Layout, and Staff/Role Management.

Legend: [x] done · [~] in progress · [ ] pending

## Phase A — Admin Layout (Priority 14) — FIRST
- [x] Left-sidebar management console (Dashboard, Orders, Menu, Categories, Labels,
      Delivery Zones, Customers, Reviews, Analytics, Staff, Settings)
- [x] Sign Out moved to bottom of sidebar
- [x] Redesigned top header (logo, section title, search, notifications, profile)
- [x] Reordered sections to match sidebar order

## Phase B — Staff & Permission System (Priority 15)
- [ ] APP_PERMISSIONS list + permission helpers (reusable)
- [ ] Super Admin CRUD (create/edit/reset password/disable/delete/change permissions/
      temp password/login activity)
- [ ] Staff dashboard filtered by permissions (hidden = non-existent)
- [ ] First-login temp password change prompt
- [ ] Frontend + firestore.rules permission enforcement
- [ ] Real-time staff sync

## Phase C — Homepage Product-Centered Reviews (Priority 11)
- [ ] One card per menu item (image, name, desc, price, avg rating, count, Add to Cart)
- [ ] Latest review below each card (stars, name, verified badge, text, restaurant reply)
- [ ] View All Reviews → link

## Phase D — Dedicated Item Review Page (Priority 12)
- [ ] Large image, name, desc, price, availability, avg rating, count, Add to Cart
- [ ] All reviews for that item, newest first, restaurant replies
- [ ] Add to Cart → direct ordering flow

## Phase E — Review Moderation verification (Priority 10)
- [x] Verify existing admin review moderation is complete; fix only genuine issues
      — Genuine issue found: moderation (hide/restore/delete/reply) only ever
      wrote to the `reviews` collection, never to menuItems/{id}.rating/
      .reviewCount — a denormalized field only the customer-side review
      write path recomputed. Fixed by removing that field entirely; every
      rating/count everywhere is now calculated live from `reviews`
      (js/reviews-store.js). See PROJECT_CONTINUATION_SUMMARY.md/git log
      for the full file list.

## Final Audit (Priority 13)
- [ ] No remaining hardcoded ratings/review counts/stats/delivery fees/labels/badges
- [ ] No duplicate label systems / no stale UI requiring refresh
- [x] No inconsistent real-time listeners / no disconnected review data
- [ ] No broken imports / no dead code

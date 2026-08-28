/* ============================================================
   The ONE canonical order-status model for the whole project.
   The customer-facing tracking view (js/order-tracking.js), the
   admin Orders queue (Phase 6), and every Firestore status write
   (js/firestore.js, js/order.js) import from here instead of
   hardcoding their own list or labels.

   These stages match the site's existing tracking simulation
   exactly (see the original startTracking() timeline) — nothing
   about what the customer sees or the order of the stages has
   changed, this just gives that timeline a name every other module
   can share instead of re-declaring it.
   ================================================================ */

export const ORDER_STATUS = {
  RECEIVED: 'received',
  KITCHEN: 'kitchen',
  PACKAGING: 'packaging',
  COURIER: 'courier',           // delivery only
  READY_FOR_PICKUP: 'ready',    // pickup only
  DELIVERED: 'delivered',
  PICKED_UP: 'picked_up',
  CANCELLED: 'cancelled'
};

export const DELIVERY_TIMELINE = [
  { key: ORDER_STATUS.RECEIVED,   icon: '🧾', label: 'Order received',            sub: "We've got it!" },
  { key: ORDER_STATUS.KITCHEN,    icon: '👨‍🍳', label: 'Preparing in the kitchen',  sub: 'Cooking fresh, just for you' },
  { key: ORDER_STATUS.PACKAGING,  icon: '📦', label: 'Packaging your order',       sub: 'Sealing it up to stay hot' },
  { key: ORDER_STATUS.COURIER,    icon: '🛵', label: 'With your courier',          sub: 'On the way to you' },
  { key: ORDER_STATUS.DELIVERED,  icon: '✅', label: 'Delivered',                  sub: 'Enjoy!' }
];

export const PICKUP_TIMELINE = [
  { key: ORDER_STATUS.RECEIVED,          icon: '🧾', label: 'Order received',           sub: "We've got it!" },
  { key: ORDER_STATUS.KITCHEN,           icon: '👨‍🍳', label: 'Preparing in the kitchen', sub: 'Cooking fresh, just for you' },
  { key: ORDER_STATUS.PACKAGING,         icon: '📦', label: 'Packaging your order',      sub: 'Sealing it up to stay hot' },
  { key: ORDER_STATUS.READY_FOR_PICKUP,  icon: '🛎️', label: 'Ready for pickup',          sub: 'Waiting at the counter' },
  { key: ORDER_STATUS.PICKED_UP,         icon: '✅', label: 'Picked up',                 sub: 'Enjoy!' }
];

export function getTimelineFor(order){
  return order.fulfilmentType === 'pickup' ? PICKUP_TIMELINE : DELIVERY_TIMELINE;
}

/* ============================================================
   PHASE 4 addendum. The Phase 4 brief's own section 9 lists a
   suggested status vocabulary — "Pending, Confirmed, Preparing,
   Ready, Out for Delivery, Delivered, Completed" — for the newly-real
   Firestore-backed tracker. That's a DIFFERENT set of names than this
   file's existing, already-shipped, UI-connected model above (which
   Phase 1 built and every phase since has explicitly preserved,
   including the just-restated Phase 4 brief's own "do NOT redesign
   the UI" / "preserve everything completed"). Renaming this model —
   or adding a distinct "Confirmed" stage between received and kitchen
   — would be a real timeline redesign (a new step, a new icon, a new
   row in js/order-tracking.js's rendered DOM), not a backend swap.

   Resolution: keep this model exactly as-is: it already covers the
   same ground, name-for-name close enough that nothing is lost —
       RECEIVED   ≈ Pending + Confirmed  (the order exists and is
                    accepted the moment it's placed; there's no
                    separate staff-confirmation step in this codebase
                    for a second stage to represent)
       KITCHEN    ≈ Preparing
       PACKAGING  ≈ (still) Preparing, the tail end of it
       COURIER    ≈ Out for Delivery      (delivery orders only)
       READY_FOR_PICKUP ≈ Ready           (pickup orders only)
       DELIVERED / PICKED_UP ≈ Delivered / Completed
       CANCELLED  ≈ Cancelled             (new — see below)
   Named here explicitly, the same way every non-obvious judgment call
   in this project gets a comment rather than a silent choice — see
   PROJECT_CONTINUATION_SUMMARY.md's Phase 4 section for the same note
   restated at the project level.

   CANCELLED is real (staff can write it via updateOrderStatus in
   js/firestore.js from the admin Orders Dashboard, and — PHASE 6 —
   a signed-in customer can write it themselves too, but ONLY while
   their own order is still at RECEIVED; see
   js/order-history-ui.js's Cancel Order button) but isn't part of
   either TIMELINE array above — it's a terminal state that replaces
   the whole progress view rather than being one more step in it (see
   js/order-tracking.js's renderCancelled()). */
export const TERMINAL_STATUSES = [ORDER_STATUS.DELIVERED, ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED];

export function isTerminalStatus(status){
  return TERMINAL_STATUSES.includes(status);
}

export function isCancelled(status){
  return status === ORDER_STATUS.CANCELLED;
}

/** Index of `status` within order's own timeline (0-based), or -1 if
    it isn't one of that timeline's stages (true for CANCELLED, and
    for READY_FOR_PICKUP/PICKED_UP on a delivery order or
    COURIER/DELIVERED on a pickup order — a delivery order's status
    should never actually BE a pickup-only value or vice versa, but
    -1 is a safe, non-throwing answer if it somehow were). Used by
    js/order-tracking.js to derive each stage's pending/active/done
    class from a real order.status instead of a setTimeout offset. */
export function getStatusIndex(order, status){
  return getTimelineFor(order).findIndex(s => s.key === status);
}

/** Short, current-state label for a compact list row (My Orders) —
    the matching timeline stage's own label, or 'Cancelled'. Falls
    back to 'Order received' for a status that matches nothing (e.g.
    old/malformed data), rather than showing a blank status. */
export function getStatusLabel(order){
  if(isCancelled(order.status)) return 'Cancelled';
  const idx = getStatusIndex(order, order.status);
  const timeline = getTimelineFor(order);
  return (idx >= 0 ? timeline[idx].label : timeline[0].label);
}

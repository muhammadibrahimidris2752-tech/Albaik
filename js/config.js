/* Site configuration. This is the one file to edit when reusing this
   codebase for a different branch/location — brand name, contact
   numbers, and bank transfer details all live here so nothing is
   hardcoded inside rendering or checkout logic. */

/* ============ CONFIG — replace these for your own branch ============ */
export const BRAND_NAME = 'Albaik Chicken';
export const BRAND_TAGLINE = "Kano's Nonstop Kitchen";
export const LOCATION_LABEL = 'Gwarzo Road, Kano';

export const PHONE_DISPLAY = '0705 793 7677';
export const PHONE_TEL = '+2347057937677';           // used in tel: links
export const WHATSAPP_NUMBER = '2347057937677';        // international format, no + or spaces, used in wa.me links

export const MAPS_QUERY_URL = 'https://www.google.com/maps/search/?api=1&query=Albaik+Chicken%2C+Gwarzo+Road%2C+Kano%2C+Nigeria';

// Automatically added to the order total at checkout when a customer
// chooses Delivery; never charged for Pickup. See js/order.js.
export const DELIVERY_FEE = 700;

// PLACEHOLDER — replace with the real settlement account before going
// live. Shown to customers who choose Bank Transfer at checkout.
// Safe to leave as-is during development: nothing breaks, the transfer
// card just keeps showing these placeholder values.
export const BANK_DETAILS = {
  bank: '[Add your bank name]',
  accountNumber: '0000000000',
  accountName: 'Albaik Chicken Kano'
};

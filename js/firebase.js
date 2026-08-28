/* ============================================================
   Firebase app initialization.

   The SDK is loaded dynamically (via import(), inside a function)
   rather than as a static top-level import, on purpose:
     - Until firebaseConfig below has real values, isFirebaseConfigured()
       is false and NOTHING here ever fetches anything over the network —
       the site loads exactly as fast/lightweight with this file in
       place as it would without it.
     - Even once configured, if the CDN is briefly unreachable, this
       fails as a normal rejected Promise any caller can catch — not a
       page-breaking module resolution error.

   To actually turn this on (Phase 2):
     1. Create a free project at https://console.firebase.google.com
     2. Build icon (</>) → register a Web App → copy the config object
        it shows you into firebaseConfig below
     3. Build → Firestore Database → Create database
     4. Build → Authentication → get started → enable the sign-in
        methods you want (Email/Password, Google, etc.)
     5. Build → Storage → get started (for menu-item photos and
        profile pictures)
   That's it — no CDN <script> tag needed in index.html, and nothing
   else in the codebase needs to change; menu-data.js, firestore.js,
   and auth.js already call the functions below correctly.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyAzeYiNdWmhQnW9Wi1681P96hQs8t0_c80",
  authDomain: "albaik-chicken.firebaseapp.com",
  projectId: "albaik-chicken",
  storageBucket: "albaik-chicken.firebasestorage.app",
  messagingSenderId: "146853730223",
  appId: "1:146853730223:web:d27293bfcd0be9f86b015a"
};

// Check https://firebase.google.com/docs/web/setup for the current version
// if this one is ever out of date.
export const FIREBASE_SDK_VERSION = '10.13.0';

let appPromise = null;
const namedAppPromises = new Map();

export function isFirebaseConfigured(){
  return firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY";
}

/** Dynamically loads one piece of Firebase's modular SDK from CDN,
    e.g. loadFirebaseModule('firestore') → the firebase-firestore.js module. */
export async function loadFirebaseModule(pkg){
  return import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-${pkg}.js`);
}

/** Returns the initialized Firebase app, or null if not configured yet.
    Safe to call repeatedly — only initializes once. */
export async function getFirebaseApp(){
  if(!isFirebaseConfigured()) return null;
  if(!appPromise){
    appPromise = loadFirebaseModule('app').then(({ initializeApp }) => initializeApp(firebaseConfig));
  }
  return appPromise;
}

/**
 * Returns a separately named Firebase app for an isolated browser session.
 * Firebase Auth persists a session per app name, so this lets the staff
 * console sign in without replacing the storefront customer's session.
 */
export async function getNamedFirebaseApp(name){
  if(!isFirebaseConfigured()) return null;
  if(!name) throw new Error('A Firebase app name is required.');
  if(!namedAppPromises.has(name)){
    namedAppPromises.set(name, loadFirebaseModule('app').then(({ initializeApp }) => initializeApp(firebaseConfig, name)));
  }
  return namedAppPromises.get(name);
}

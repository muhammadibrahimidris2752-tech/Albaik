import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';
import { getUserProfile } from './firestore.js';

/* ============================================================
   Authentication. Everything here is a real Firebase Authentication
   call, safely inert until firebaseConfig in firebase.js is filled
   in — see isFirebaseConfigured(). Nothing else in the app needs to
   check that itself; every exported function here already does.

   Phase 2 wires this up to: the profile icon that replaces "Login"
   once signed in, the checkout auth gate (guests can browse/cart but
   not place an order), and the admin dashboard's staff sign-in.

   Role model: every signed-in user gets a Firestore document at
   users/{uid} (see js/firestore.js). Regular customers have
   role: 'customer' (or no role field at all); staff accounts have
   role: 'staff' or 'admin'. isAdmin()/isStaff() below read the
   cached profile populated by onAuthStateChangedListener — never a
   fresh read — so call getUserProfile() directly if you need the
   very latest value instead of what was true when auth last changed.
   ============================================================ */

let currentUser = null;
let currentUserProfile = null;

/** displayName is optional so existing/future callers that only want the
    bare Auth account still work — but js/auth-forms.js's sign-up handler
    always passes one, via updateProfile(), so getCurrentUser().displayName
    is populated the same way it already is for Google sign-in, and the nav
    profile chip (js/auth-ui.js) never needs a Firestore round-trip just to
    show a name. */
export async function signUp(email, password, displayName){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, createUserWithEmailAndPassword, updateProfile } = await loadFirebaseModule('auth');
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, password);
  if(displayName) await updateProfile(cred.user, { displayName });
  return cred;
}

/** keepSignedIn matches the Domino's-style choice on the sign-in view
    ("Sign In for This Order" vs "Sign In & Keep Me Signed In"): true
    persists the session across browser restarts (browserLocalPersistence,
    the default), false keeps it only for the current tab session
    (browserSessionPersistence). Firebase requires setting persistence
    before the sign-in call it applies to, not after. */
export async function login(email, password, keepSignedIn = true){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } = await loadFirebaseModule('auth');
  const auth = getAuth(app);
  await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle(){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await loadFirebaseModule('auth');
  return signInWithPopup(getAuth(app), new GoogleAuthProvider());
}

export async function resetPassword(email){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  const app = await getFirebaseApp();
  const { getAuth, sendPasswordResetEmail } = await loadFirebaseModule('auth');
  return sendPasswordResetEmail(getAuth(app), email);
}

export async function logout(){
  if(!isFirebaseConfigured()) return;
  const app = await getFirebaseApp();
  const { getAuth, signOut } = await loadFirebaseModule('auth');
  return signOut(getAuth(app));
}

/** PHASE 4 (spec section 11: "Password management"). Firebase Auth
    requires a RECENT sign-in before it will accept updatePassword() —
    reauthenticateWithCredential() with the customer's current
    password is what supplies that, in the same call rather than
    asking them to sign out and back in. Only meaningful for
    password-auth accounts (see isPasswordProvider() below) — a
    Google-only account has no password to change here; auth-ui.js's
    account view hides this form entirely for those accounts rather
    than showing it and having every attempt fail. */
export async function changePassword(currentPassword, newPassword){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet — see js/firebase.js.');
  if(!currentUser) throw new Error('You must be signed in to change your password.');
  const app = await getFirebaseApp();
  const { getAuth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await loadFirebaseModule('auth');
  const auth = getAuth(app);
  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
}

/** True only once currentUser has actually hydrated (see
    getCurrentUser()'s own comment) AND that account has a
    'password' entry in its providerData — a Google-only sign-in
    (auth-forms.js's handleGoogleSignIn) never does. Used purely to
    decide whether to show the change-password form; not a security
    boundary itself (changePassword() above would simply fail for a
    provider-less account regardless). */
export function isPasswordProvider(){
  return !!currentUser && (currentUser.providerData || []).some(p => p.providerId === 'password');
}

/** PHASE 4. Syncs a newly-uploaded avatar (js/storage.js's
    uploadProfilePicture, called from js/auth-ui.js) onto the Firebase
    Auth user object itself, not just the Firestore profile doc that's
    this project's actual source of truth for photoURL. This is what
    lets renderAuthNav's nav-corner chip show the photo too — that
    function only ever receives the plain Auth user object, the same
    way a Google sign-in's own photoURL already reaches it (see
    js/auth-forms.js's handleGoogleSignIn). Silently does nothing if
    unconfigured or signed out — the Firestore write is what actually
    matters and already happened by the time this is called; this is
    a nice-to-have sync, not a required step. */
export async function updateAuthPhotoURL(url){
  if(!isFirebaseConfigured() || !currentUser) return;
  const app = await getFirebaseApp();
  const { getAuth, updateProfile } = await loadFirebaseModule('auth');
  const auth = getAuth(app);
  await updateProfile(auth.currentUser, { photoURL: url });
  currentUser = auth.currentUser;
}

/** PHASE 4. Same reasoning and shape as updateAuthPhotoURL above, for
    the account view's edit-profile form: keeps the Firebase Auth
    user's own displayName in sync with the Firestore profile's, since
    js/auth-ui.js's renderAuthNav (nav-corner chip) and renderAccountView
    both read user.displayName FIRST, falling back to the Firestore
    profile's displayName only when the Auth object doesn't have one —
    without this, an edited name would show correctly in the account
    view (which also reads the Firestore profile) but never update the
    nav chip, since that only ever reads the Auth object. */
export async function updateAuthDisplayName(name){
  if(!isFirebaseConfigured() || !currentUser) return;
  const app = await getFirebaseApp();
  const { getAuth, updateProfile } = await loadFirebaseModule('auth');
  const auth = getAuth(app);
  await updateProfile(auth.currentUser, { displayName: name });
  currentUser = auth.currentUser;
}

/** Synchronous by design (UI code needs this without awaiting), so this
    stays null until onAuthStateChangedListener below has fired at least
    once — that's the standard way Firebase Auth's state hydrates. */
export function getCurrentUser(){
  return currentUser;
}

export function getCurrentUserProfile(){
  return currentUserProfile;
}

/** PHASE 4. Re-reads and re-caches the signed-in user's own profile
    document. onAuthStateChangedListener below only refreshes this
    cache on sign-in/sign-out — a write that happens WITHOUT a full
    auth-state change (editing name/phone, uploading an avatar) would
    otherwise leave getCurrentUserProfile() returning stale data until
    the next reload. js/auth-forms.js's handleEditProfile and
    js/auth-ui.js's avatar upload handler both call this right after
    their saveUserProfile() succeeds. No-op (returns null) when
    signed out. */
export async function refreshCurrentUserProfile(){
  if(!currentUser) return null;
  currentUserProfile = await getUserProfile(currentUser.uid);
  return currentUserProfile;
}

export function isAdmin(){
  return !!currentUser && currentUserProfile?.role === 'admin';
}

export function isStaff(){
  return !!currentUser && (currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'staff');
}

/** Calls callback(user) whenever auth state changes; returns an
    unsubscribe function. Also refreshes the cached Firestore profile
    (see getUserProfile in firestore.js) so isAdmin()/isStaff()/
    getCurrentUserProfile() are correct by the time callback runs. */
export async function onAuthStateChangedListener(callback){
  if(!isFirebaseConfigured()){ callback(null); return () => {}; }
  try {
    const app = await getFirebaseApp();
    const { getAuth, onAuthStateChanged } = await loadFirebaseModule('auth');
    return onAuthStateChanged(getAuth(app), async user => {
      currentUser = user;
      currentUserProfile = user ? await getUserProfile(user.uid) : null;
      callback(user);
    });
  } catch(e){
    console.error('Auth state listener failed to attach:', e);
    callback(null);
    return () => {};
  }
}

/** Links an email/password credential to an already signed-in account 
    (e.g., when signed in via Google and creating a password for Admin login). */
export async function linkPasswordToAccount(password) {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured yet.');
  if (!currentUser || !currentUser.email) throw new Error('No user is currently signed in.');

  const app = await getFirebaseApp();
  const { getAuth, EmailAuthProvider, linkWithCredential } = await loadFirebaseModule('auth');
  const auth = getAuth(app);

  const credential = EmailAuthProvider.credential(currentUser.email, password);
  return linkWithCredential(auth.currentUser, credential);
}
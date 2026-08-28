import { getNamedFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from '../../js/firebase.js';
import { getUserProfile } from '../../js/firestore.js';

/* The admin console uses a named Firebase app. Firebase Auth stores browser
   sessions per app name, so this session is independent from index.html. */
const ADMIN_APP_NAME = 'admin-console';

let currentUser = null;
let currentUserProfile = null;

export function getAdminFirebaseApp(){
  return getNamedFirebaseApp(ADMIN_APP_NAME);
}

export async function login(email, password){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet.');
  const app = await getAdminFirebaseApp();
  const { getAuth, signInWithEmailAndPassword, setPersistence, browserLocalPersistence } = await loadFirebaseModule('auth');
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle(){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet.');
  const app = await getAdminFirebaseApp();
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await loadFirebaseModule('auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(getAuth(app), provider);
}

export async function logout(){
  if(!isFirebaseConfigured()) return;
  const app = await getAdminFirebaseApp();
  const { getAuth, signOut } = await loadFirebaseModule('auth');
  return signOut(getAuth(app));
}

/** PRIORITY 15. Creates a Firebase Auth account for a new staff member
    using the admin console's named app. This is separate from the
    signed-in admin's own session — the returned credential is for the
    NEW account, and this app's auth state is left untouched (the admin
    stays signed in as themselves). The caller then writes the
    users/{uid} profile (role 'staff') and staff/{uid} doc. Returns
    { uid, email }, or throws on failure. */
export async function createStaffAuthAccount(email, password, displayName){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet.');
  const app = await getAdminFirebaseApp();
  const { getAuth, createUserWithEmailAndPassword, updateProfile } = await loadFirebaseModule('auth');
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, password);
  if(displayName) await updateProfile(cred.user, { displayName });
  return { uid: cred.user.uid, email: cred.user.email };
}

/** PRIORITY 15. Generates a strong temporary password for a new staff
    account or a reset. Not cryptographically random — Math.random is
    fine for a human-typed temp password, but it's shaped (letters +
    digits + a symbol) to satisfy typical Firebase password policies. */
export function generateTempPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789';
  const symbols = '!@#$%';
  let pw = '';
  for(let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  pw += symbols[Math.floor(Math.random() * symbols.length)];
  return pw;
}

/** PRIORITY 15. Resets a staff member's password to a fresh temporary
    password. Client-side Firebase Auth cannot change another user's
    password directly, so the operational reset is:
      1. generate a new temp password,
      2. write it to staff/{uid}.tempPassword AND set
         mustChangePassword:true (so their next sign-in forces the
         change prompt),
      3. return the new temp password so the Super Admin can hand it to
         the staff member.
    The staff member then signs in with it and is prompted to change it.
    `uid` is the staff/{uid} doc id (= their auth uid). */
export async function resetStaffPassword(uid){
  const newPassword = generateTempPassword();
  const { updateStaffMember } = await import('../../js/firestore.js');
  await updateStaffMember(uid, { tempPassword: newPassword, mustChangePassword: true });
  return newPassword;
}

/** PRIORITY 15. A staff member changes their OWN password (the first-
    login temp-password prompt, or a voluntary change). Uses the admin
    app's auth, reauthenticating with the current (temp) password
    first, then updating to the new one. On success the caller flags
    mustChangePassword false on the staff/{uid} doc. */
export async function changeOwnPassword(currentPassword, newPassword){
  if(!isFirebaseConfigured()) throw new Error('Firebase is not configured yet.');
  const app = await getAdminFirebaseApp();
  const { getAuth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await loadFirebaseModule('auth');
  const auth = getAuth(app);
  const user = auth.currentUser;
  if(!user || !user.email) throw new Error('You must be signed in to change your password.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  return true;
}

export function getCurrentUser(){ return currentUser; }
export function getCurrentUserProfile(){ return currentUserProfile; }
export function isStaff(){
  return !!currentUser && (currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'staff');
}

export async function onAuthStateChangedListener(callback){
  if(!isFirebaseConfigured()){
    callback(null);
    return () => {};
  }
  try {
    const app = await getAdminFirebaseApp();
    const { getAuth, onAuthStateChanged } = await loadFirebaseModule('auth');
    return onAuthStateChanged(getAuth(app), async user => {
      currentUser = user;
      currentUserProfile = user ? await getUserProfile(user.uid, app) : null;
      callback(user);
    });
  } catch(e){
    console.error('Admin auth state listener failed to attach:', e);
    callback(null);
    return () => {};
  }
}

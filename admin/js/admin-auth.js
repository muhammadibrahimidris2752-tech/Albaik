import { login, loginWithGoogle, logout, onAuthStateChangedListener, isStaff, getCurrentUser, getCurrentUserProfile, changeOwnPassword } from './admin-session.js';
import { isFirebaseConfigured } from '../../js/firebase.js';
import { getStaffMember, updateStaffMember } from '../../js/firestore.js';

/* ============================================================
   ADMIN MENU MANAGER — the staff sign-in gate. Uses admin-session.js's
   separately named Firebase app, so staff sign-in never replaces the
   customer's storefront session in this browser.

   GATE STATES this module renders into #adminGate (see admin/index.html):
     'checking'       — the brief moment before onAuthStateChangedListener's
                         first callback fires. Shown by default so an
                         already-signed-in staff member never sees a
                         flash of the sign-in form first.
     'not-configured' — isFirebaseConfigured() is false. No sign-in is
                         possible at all; shown immediately rather than
                         waiting for a failed attempt.
     'signed-out'      — no user, or a user who was just rejected for
                          not being staff (see below).
     'dashboard'        — a signed-in user whose cached profile role is
                           'staff' or 'admin'. onStaffReady(user, profile)
                           fires exactly once per qualifying sign-in.
*/

let pendingGateError = null;

function friendlyAuthError(err){
  if(/not configured/i.test((err && err.message) || '')){
    return "Sign-in isn't set up on this site yet.";
  }
  const code = (err && err.code) || '';
  switch(code){
    case 'auth/invalid-email': return "That email address doesn't look right.";
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password': return 'Email or password is incorrect.';
    case 'auth/too-many-requests': return 'Too many attempts — please wait a moment and try again.';
    case 'auth/network-request-failed': return "Couldn't reach the sign-in service — check your connection and try again.";
    case 'auth/popup-closed-by-user': return 'Sign-in window was closed. Please try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

function isValidEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setLoading(btn, loading, loadingLabel){
  if(!btn) return;
  if(loading){
    if(!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
    btn.textContent = loadingLabel;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalLabel || btn.textContent;
    btn.disabled = false;
  }
}

function showFormError(message){
  const el = document.getElementById('adminGateError');
  if(!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function showGatePanel(name){
  document.getElementById('adminGateChecking').hidden = name !== 'checking';
  document.getElementById('adminGateNotConfigured').hidden = name !== 'not-configured';
  document.getElementById('adminSignInPanel').hidden = name !== 'signed-out';
}

function showGate(state){
  document.getElementById('adminGate').hidden = false;
  document.getElementById('adminDashboard').hidden = true;
  if(state === 'not-configured'){
    showGatePanel('not-configured');
    return;
  }
  showGatePanel('signed-out');
  showFormError(pendingGateError);
  pendingGateError = null;
}

function showDashboard(user, profile){
  document.getElementById('adminGate').hidden = true;
  document.getElementById('adminDashboard').hidden = false;
  const nameEl = document.getElementById('adminHeaderUserName');
  if(nameEl) nameEl.textContent = user.displayName || profile?.displayName || user.email || 'Staff';
  const avatarEl = document.getElementById('adminHeaderAvatar');
  if(avatarEl) avatarEl.textContent = (user.displayName || profile?.displayName || 'A')[0].toUpperCase();
}

async function handleSignIn(e, onStaffReady){
  e.preventDefault();
  const emailEl = document.getElementById('adminSignInEmail');
  const passwordEl = document.getElementById('adminSignInPassword');
  const btn = document.getElementById('adminSignInSubmitBtn');
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  showFormError('');

  if(!isValidEmail(email)){
    showFormError('Enter a valid email address.');
    return;
  }
  if(!password){
    showFormError('Enter your password.');
    return;
  }

  setLoading(btn, true, 'Signing in…');
  try {
    await login(email, password, true);
    passwordEl.value = '';
  } catch(err){
    showFormError(friendlyAuthError(err));
  } finally {
    setLoading(btn, false);
  }
}

async function handleGoogleSignIn(){
  const googleBtn = document.getElementById('adminGoogleBtn');
  showFormError('');
  setLoading(googleBtn, true, 'Signing in with Google…');
  try {
    await loginWithGoogle();
  } catch(err){
    showFormError(friendlyAuthError(err));
  } finally {
    setLoading(googleBtn, false);
  }
}

async function handleSignOut(){
  await logout();
}

/** One-time wiring, called once from admin-app.js's init() */
export function initAdminAuthGate(onStaffReady){
  showGatePanel('checking');
  document.getElementById('adminGate').hidden = false;
  document.getElementById('adminDashboard').hidden = true;

  document.getElementById('adminSignInForm')?.addEventListener('submit', e => handleSignIn(e, onStaffReady));
  document.getElementById('adminGoogleBtn')?.addEventListener('click', handleGoogleSignIn);
  document.getElementById('adminSignOutBtn')?.addEventListener('click', handleSignOut);
  initPasswordChange();

  if(!isFirebaseConfigured()){
    showGate('not-configured');
    return;
  }

onAuthStateChangedListener(user => {
    if(!user){
      showGate('signed-out');
      return;
    }
    if(!isStaff()){
      pendingGateError = "This account doesn't have admin access. Sign in with a staff account.";
      // This only clears the separate admin-console session. The customer
      // session on index.html remains signed in.
      void logout();
      return;
    }
const profile = getCurrentUserProfile();
    const isAdminUser = profile?.role === 'admin';
    // Load the staff member's own staff/{uid} doc (permissions, status,
    // mustChangePassword). For the Super Admin (no staff doc exists),
    // fall back to an empty doc + isAdminUser=true so they see all.
    getStaffMember(user.uid).then(staffDoc => {
      showDashboard(user, profile, staffDoc || {}, isAdminUser);
      // First-login temp-password prompt: if the staff member's own doc
      // says mustChangePassword and they're not the Super Admin, block the
      // dashboard behind the password-change modal until they comply.
      if(!isAdminUser && staffDoc && staffDoc.mustChangePassword){
        openPasswordChangeModal(user.uid);
      }
      onStaffReady(user, profile, staffDoc || {}, isAdminUser);
    }).catch(() => {
      showDashboard(user, profile, {}, isAdminUser);
      onStaffReady(user, profile, {}, isAdminUser);
    });
  });
}

/* ---- First-login password change ---- */
let mustChangeUid = null;

function openPasswordChangeModal(uid){
  mustChangeUid = uid;
  const overlay = document.getElementById('passwordChangeOverlay');
  if(overlay) overlay.classList.add('open');
  // Keep the dashboard behind the modal locked until the password is changed.
  const dashboard = document.getElementById('adminDashboard');
  if(dashboard) dashboard.style.pointerEvents = 'none';
}

function closePasswordChangeModal(){
  const overlay = document.getElementById('passwordChangeOverlay');
  if(overlay) overlay.classList.remove('open');
  const dashboard = document.getElementById('adminDashboard');
  if(dashboard) dashboard.style.pointerEvents = '';
  mustChangeUid = null;
}

async function handlePasswordChangeSubmit(e){
  e.preventDefault();
  const error = document.getElementById('passwordChangeError');
  const current = document.getElementById('passwordChangeCurrent').value;
  const next = document.getElementById('passwordChangeNew').value;
  const confirm = document.getElementById('passwordChangeConfirm').value;

  if(!current || !next || !confirm){
    error.textContent = 'Fill in all three fields.'; error.hidden = false; return;
  }
  if(next.length < 8){
    error.textContent = 'New password must be at least 8 characters.'; error.hidden = false; return;
  }
  if(next !== confirm){
    error.textContent = 'New passwords don\'t match.'; error.hidden = false; return;
  }

  const btn = document.getElementById('passwordChangeSubmit');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await changeOwnPassword(current, next);
  } catch(err){
    error.textContent = /wrong-password|invalid-credential/i.test(err.message || '') ? 'Current password is incorrect.' : 'Could not change your password. Try again.';
    error.hidden = false;
    if(btn){ btn.disabled = false; btn.textContent = 'Change Password'; }
    return;
  }
  // Clear the must-change flag on the staff member's own doc.
  if(mustChangeUid){
    await updateStaffMember(mustChangeUid, { mustChangePassword: false });
  }
  closePasswordChangeModal();
}

function initPasswordChange(){
  document.getElementById('passwordChangeForm')?.addEventListener('submit', handlePasswordChangeSubmit);
  document.getElementById('passwordChangeClose')?.addEventListener('click', () => void logout());
  document.getElementById('passwordChangeCancel')?.addEventListener('click', () => void logout());
}

export { getCurrentUser, getCurrentUserProfile };

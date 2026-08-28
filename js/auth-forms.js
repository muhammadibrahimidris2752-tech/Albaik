import { signUp, login, loginWithGoogle, resetPassword, getCurrentUser, refreshCurrentUserProfile, updateAuthDisplayName, changePassword } from './auth.js';
import { getUserProfile, saveUserProfile } from './firestore.js';
import { showAuthView, resumeAfterAuth, renderAccountView, renderAuthNav, populateAddressFormForEdit, getAccountZoneSelection } from './auth-ui.js';
import { addAddress, updateAddress } from './addresses.js';

/* ============================================================
   Validation and submit handlers for the auth modal's forms. Split
   out from js/auth-ui.js (modal chrome + orchestration) — see that
   file's header comment for why. Every handler follows the same
   shape: validate inline (reusing the address-field error convention
   from css/order-modal.css — a .error class plus a message), call the
   real auth.js/addresses.js function, map any failure to plain copy
   (never a raw Firebase error code), and hand a successful result to
   resumeAfterAuth() (sign-in/sign-up only) so checkout can resume
   automatically.

   PHASE 4 grew this file's scope from "the four sign-in/up/forgot
   forms" to "every FORM SUBMISSION in the auth modal" — the account
   view's edit-profile, change-password, and add/edit-address forms
   all followed here too, for the same reason the original four did:
   keep js/auth-ui.js to chrome/orchestration/rendering, this file to
   "what happens when a form is actually submitted". Interactions in
   the account view that AREN'T a form submission (the Edit/Cancel
   toggles, avatar upload, address row actions, view entry links)
   stay in js/auth-ui.js's initAuthUI() instead — see that function's
   own header comment for the exact boundary.
   ================================================================ */

const SIGNUP_FIELD_IDS = ['signupFirstName', 'signupLastName', 'signupEmail', 'signupPhone', 'signupPassword', 'signupConfirmPassword'];

function isValidEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function showFormError(id, message){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function setFieldError(fieldId, hasError){
  const field = document.getElementById(fieldId);
  const wrap = field ? field.closest('.auth-field') : null;
  if(wrap) wrap.classList.toggle('error', hasError);
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

/** Maps Firebase Auth error codes (and this project's own "Firebase is
    not configured yet" Error, thrown by every js/auth.js function) to
    plain, accurate customer-facing copy. Never surfaces a raw error
    code or message — matches the "errors don't apologize, are never
    vague" tone the rest of the site's copy already uses. */
function friendlyAuthError(err){
  if(/not configured/i.test((err && err.message) || '')){
    return "Sign-in isn't set up on this site yet — please check back soon.";
  }
  const code = (err && err.code) || '';
  switch(code){
    case 'auth/invalid-email': return "That email address doesn't look right.";
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password': return 'Email or password is incorrect.';
    case 'auth/email-already-in-use': return 'An account already exists with that email — try signing in instead.';
    case 'auth/weak-password': return 'Please use at least 6 characters.';
    case 'auth/too-many-requests': return 'Too many attempts — please wait a moment and try again.';
    case 'auth/popup-closed-by-user': return null; // closing their own Google popup isn't an error
    case 'auth/network-request-failed': return 'Network error — check your connection and try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

async function handleSignIn(e){
  e.preventDefault();
  const emailEl = document.getElementById('signinEmail');
  const passwordEl = document.getElementById('signinPassword');
  const keepSignedInEl = document.getElementById('signinKeepSignedIn');
  const btn = document.getElementById('signinSubmitBtn');

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  showFormError('signinError', '');
  setFieldError('signinEmail', false);
  setFieldError('signinPassword', false);

  if(!isValidEmail(email)){
    setFieldError('signinEmail', true);
    showFormError('signinError', 'Enter a valid email address.');
    return;
  }
  if(!password){
    setFieldError('signinPassword', true);
    showFormError('signinError', 'Enter your password.');
    return;
  }

  setLoading(btn, true, 'Signing in…');
  try {
    const cred = await login(email, password, keepSignedInEl ? keepSignedInEl.checked : true);
    passwordEl.value = '';
    const profile = await getUserProfile(cred.user.uid);
    await resumeAfterAuth(cred.user, profile);
  } catch(err){
    const msg = friendlyAuthError(err);
    if(msg) showFormError('signinError', msg);
  } finally {
    setLoading(btn, false);
  }
}

async function handleSignUp(e){
  e.preventDefault();
  const firstName = document.getElementById('signupFirstName').value.trim();
  const lastName = document.getElementById('signupLastName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phone = document.getElementById('signupPhone').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  const agreed = document.getElementById('signupTerms').checked;
  const btn = document.getElementById('signupSubmitBtn');

  showFormError('signupError', '');
  SIGNUP_FIELD_IDS.forEach(id => setFieldError(id, false));

  setFieldError('signupFirstName', !firstName);
  setFieldError('signupLastName', !lastName);
  setFieldError('signupEmail', !isValidEmail(email));
  setFieldError('signupPhone', !phone);

  if(!firstName || !lastName || !isValidEmail(email) || !phone){
    showFormError('signupError', 'Please fill in every field with a valid value.');
    return;
  }
  if(password.length < 6){
    setFieldError('signupPassword', true);
    showFormError('signupError', 'Password must be at least 6 characters.');
    return;
  }
  if(confirmPassword !== password){
    setFieldError('signupConfirmPassword', true);
    showFormError('signupError', "Passwords don't match.");
    return;
  }
  if(!agreed){
    showFormError('signupError', 'Please agree to the Terms of Use to continue.');
    return;
  }

  const displayName = (firstName + ' ' + lastName).trim();
  setLoading(btn, true, 'Creating account…');
  try {
    const cred = await signUp(email, password, displayName);
    const profile = { displayName, email, phoneNumber: phone };
    await saveUserProfile(cred.user.uid, profile); // no-op until Firebase is configured, same as every other Firestore write in this project
    await resumeAfterAuth(cred.user, profile);
  } catch(err){
    const msg = friendlyAuthError(err);
    if(msg) showFormError('signupError', msg);
  } finally {
    setLoading(btn, false);
  }
}

async function handleForgotPassword(e){
  e.preventDefault();
  const emailEl = document.getElementById('forgotEmail');
  const btn = document.getElementById('forgotSubmitBtn');
  const email = emailEl.value.trim();

  showFormError('forgotError', '');
  showFormError('forgotSuccess', '');
  setFieldError('forgotEmail', false);

  if(!isValidEmail(email)){
    setFieldError('forgotEmail', true);
    showFormError('forgotError', 'Enter a valid email address.');
    return;
  }

  setLoading(btn, true, 'Sending…');
  try {
    await resetPassword(email);
    showFormError('forgotSuccess', 'If ' + email + ' has an account, a reset link is on its way.');
    emailEl.value = '';
  } catch(err){
    const msg = friendlyAuthError(err);
    if(msg) showFormError('forgotError', msg);
  } finally {
    setLoading(btn, false);
  }
}

async function handleGoogleSignIn(){
  const btn = document.getElementById('googleSignInBtn');
  showFormError('signinError', '');
  setLoading(btn, true, 'Connecting…');
  try {
    const cred = await loginWithGoogle();
    let profile = await getUserProfile(cred.user.uid);
    if(!profile){
      // First time this Google account has signed in here — back it
      // with a users/{uid} doc the same way email/password sign-up
      // does, using what Google already gave us.
      profile = { displayName: cred.user.displayName || null, email: cred.user.email || null, photoURL: cred.user.photoURL || null };
      await saveUserProfile(cred.user.uid, profile);
    }
    await resumeAfterAuth(cred.user, profile);
  } catch(err){
    const msg = friendlyAuthError(err);
    if(msg) showFormError('signinError', msg);
  } finally {
    setLoading(btn, false);
  }
}

/** PHASE 4 (spec section 11 — Profile: personal information). Only
    name and phone are editable here — email is the Firebase Auth
    account identifier; changing it is a materially different,
    reauthentication-and-reverification flow this project doesn't
    build (named here rather than silently omitted). Updates BOTH the
    Firestore profile (saveUserProfile — the real source of truth) and
    the Firebase Auth user's own displayName (updateAuthDisplayName —
    purely so the nav chip and any other Auth-object reader stay in
    sync; see that function's own comment in js/auth.js). */
async function handleEditProfileSubmit(e){
  e.preventDefault();
  const user = getCurrentUser();
  if(!user) return;
  const nameEl = document.getElementById('accountEditName');
  const phoneEl = document.getElementById('accountEditPhone');
  const btn = document.getElementById('accountEditSaveBtn');
  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();

  showFormError('accountEditError', '');
  if(!name){
    showFormError('accountEditError', 'Please enter your name.');
    return;
  }

  setLoading(btn, true, 'Saving…');
  try {
    await saveUserProfile(user.uid, { displayName: name, phoneNumber: phone });
    await updateAuthDisplayName(name);
    const profile = await refreshCurrentUserProfile();
    const freshUser = getCurrentUser() || user;
    renderAccountView(freshUser, profile);
    renderAuthNav(freshUser);
  } catch(err){
    showFormError('accountEditError', friendlyAuthError(err) || 'Something went wrong. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

/** PHASE 4 (spec section 11 — Password management). Only ever wired
    up when js/auth-ui.js's updatePasswordSectionVisibility has
    determined this account actually has a password to change — see
    js/auth.js's isPasswordProvider and changePassword (the
    reauthenticate-then-updatePassword pair) for why a Google-only
    account can't reach this at all. */
async function handleChangePasswordSubmit(e){
  e.preventDefault();
  const currentEl = document.getElementById('currentPasswordInput');
  const newEl = document.getElementById('newPasswordInput');
  const confirmEl = document.getElementById('confirmNewPasswordInput');
  const btn = document.getElementById('changePasswordSubmitBtn');

  showFormError('changePasswordError', '');
  showFormError('changePasswordSuccess', '');

  const currentPassword = currentEl.value;
  const newPassword = newEl.value;
  const confirmPassword = confirmEl.value;

  if(!currentPassword){
    showFormError('changePasswordError', 'Enter your current password.');
    return;
  }
  if(newPassword.length < 6){
    showFormError('changePasswordError', 'New password must be at least 6 characters.');
    return;
  }
  if(newPassword !== confirmPassword){
    showFormError('changePasswordError', "New passwords don't match.");
    return;
  }

  setLoading(btn, true, 'Updating…');
  try {
    await changePassword(currentPassword, newPassword);
    currentEl.value = '';
    newEl.value = '';
    confirmEl.value = '';
    showFormError('changePasswordSuccess', 'Your password has been updated.');
  } catch(err){
    showFormError('changePasswordError', friendlyAuthError(err));
  } finally {
    setLoading(btn, false);
  }
}

/** PHASE 4 (Delivery Zone checkout redesign). Handles BOTH adding a
    new address and saving edits to an existing one — which mode is
    live in the form's own hidden #addressFormEditingId field (see
    js/auth-ui.js's populateAddressFormForEdit, which sets it when a
    row's Edit button is clicked and clears it again once this handler
    succeeds, via the same function called with null). Validates all
    three required fields (zone, detailed address, phone) the same
    "clear every field's error, then re-check each one" pattern this
    handler already used for the single address field before this
    phase — see js/order.js's continueToPayment for the equivalent
    checkout-side validation. */
async function handleAddressFormSubmit(e){
  e.preventDefault();
  const editingId = document.getElementById('addressFormEditingId').value;
  const labelEl = document.getElementById('addressLabelInput');
  const zoneEl = document.getElementById('addressZoneInput');
  const phoneEl = document.getElementById('addressPhoneInput');
  const textEl = document.getElementById('addressTextInput');
  const btn = document.getElementById('addressFormSubmitBtn');
  const label = labelEl.value.trim();
  const addressDetails = textEl.value.trim();
  const phoneNumber = phoneEl.value.trim();
  const zone = getAccountZoneSelection();

  showFormError('addressFormError', '');
  setFieldError('addressZoneInput', false);
  setFieldError('addressPhoneInput', false);
  setFieldError('addressTextInput', false);
  if(!zone){
    setFieldError('addressZoneInput', true);
    showFormError('addressFormError', 'Please choose your delivery zone.');
    return;
  }
  if(!addressDetails){
    setFieldError('addressTextInput', true);
    showFormError('addressFormError', 'Please enter your detailed address.');
    return;
  }
  if(!phoneNumber){
    setFieldError('addressPhoneInput', true);
    showFormError('addressFormError', 'Please enter a phone number.');
    return;
  }

  setLoading(btn, true, editingId ? 'Saving…' : 'Adding…');
  try {
    const payload = { label: label || 'Address', phoneNumber, deliveryZoneId: zone.id, deliveryZoneName: zone.name, addressDetails };
    if(editingId){
      await updateAddress(editingId, payload);
    } else {
      await addAddress(payload);
    }
    populateAddressFormForEdit(null);
  } catch(err){
    showFormError('addressFormError', 'Something went wrong. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

export function initAuthForms(){
  document.getElementById('signinForm')?.addEventListener('submit', handleSignIn);
  document.getElementById('signupForm')?.addEventListener('submit', handleSignUp);
  document.getElementById('forgotForm')?.addEventListener('submit', handleForgotPassword);
  document.getElementById('googleSignInBtn')?.addEventListener('click', handleGoogleSignIn);

  document.getElementById('goToSignupLink')?.addEventListener('click', () => showAuthView('signup'));
  document.getElementById('goToSigninLink')?.addEventListener('click', () => showAuthView('signin'));
  document.getElementById('forgotPasswordLink')?.addEventListener('click', () => showAuthView('forgot'));
  document.getElementById('forgotBackLink')?.addEventListener('click', () => showAuthView('signin'));

  document.getElementById('accountEditForm')?.addEventListener('submit', handleEditProfileSubmit);
  document.getElementById('changePasswordForm')?.addEventListener('submit', handleChangePasswordSubmit);
  document.getElementById('addressForm')?.addEventListener('submit', handleAddressFormSubmit);
  document.getElementById('addressFormCancelBtn')?.addEventListener('click', () => populateAddressFormForEdit(null));
}

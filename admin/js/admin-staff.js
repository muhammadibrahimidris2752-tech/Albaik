import { subscribeToStaff, addStaffMember, updateStaffMember, deleteStaffMember, saveUserProfile } from '../../js/firestore.js';
import { SECTION_PERMISSIONS } from './admin-permissions.js';
import { confirmAction } from './admin-confirm.js';
import { escapeHtml, formatRelativeTime } from '../../js/utils.js';
import { generateTempPassword, resetStaffPassword, createStaffAuthAccount } from './admin-session.js';

/* ============================================================
   PRIORITY 15. Staff management — Super Admin only.

   The restaurant owner (role 'admin') can, from the Staff section:
     - create staff accounts (name, email, temp password, optional
       phone, position, granular permissions)
     - edit staff accounts / change permissions at any time
     - reset a staff password (view + regenerate a temp password)
     - disable / re-enable accounts
     - permanently delete accounts
     - view each staff member's email, temp password, login activity,
       and date created

   Staff members can never see other staff accounts — this module is
   only ever wired into admin-app.js when the signed-in user is the
   Super Admin (see admin-app.js's init()). The data layer reuses
   js/firestore.js's staff CRUD (subscribeToStaff/addStaffMember/
   updateStaffMember/deleteStaffMember) and a users/{uid} profile write
   (saveUserProfile) to set the staff member's role.

   Real-time sync: subscribeToStaff is a live listener, so creating /
   editing / disabling / deleting a staff member updates every open
   Super Admin dashboard instantly, and the affected staff member's own
   session picks up permission/status changes via their own
   subscribeToStaffMember (admin-session.js).
   ================================================================ */

let allStaff = [];
let isLoading = true;
let loadError = null;
let unsubscribe = null;
let timeoutId = null;
let editingUid = null;   // null = creating new, else the doc id being edited

function toMillis(v){
  return typeof v === 'number' ? v : v?.toMillis?.() || 0;
}

function renderToolbar(){
  const count = document.getElementById('adminStaffResultsSummary');
  if(count) count.textContent = `${allStaff.length} staff account${allStaff.length === 1 ? '' : 's'}`;
}

function permissionNames(permissions){
  if(!Array.isArray(permissions) || !permissions.length) return 'No sections';
  return permissions
    .map(id => SECTION_PERMISSIONS.find(p => p.id === id)?.label || id)
    .join(', ');
}

function buildRow(member){
  const name = member.name || member.email || 'Staff';
  const initial = escapeHtml(name[0] || 'S').toUpperCase();
  const status = member.status === 'disabled' ? 'disabled' : 'active';
  const loginActivity = Array.isArray(member.loginActivity) ? member.loginActivity : [];
  const loginRows = loginActivity.length
    ? loginActivity.slice(-3).reverse().map(a => `
        <div class="admin-staff-login"><span>${escapeHtml(a.clientInfo || 'unknown device')}</span><span>${escapeHtml(formatRelativeTime(a.at) || '—')}</span></div>`).join('')
    : '<div class="admin-staff-login-empty">No login activity yet.</div>';

  return `<article class="admin-staff-row${status === 'disabled' ? ' is-disabled' : ''}" data-staff-uid="${escapeHtml(member.id)}">
    <div class="admin-staff-row__media"><div class="admin-staff-row__avatar">${initial}</div></div>
    <div class="admin-staff-row__body">
      <div class="admin-staff-row__head">
        <div class="admin-staff-row__meta">
          <div class="admin-staff-row__name">${escapeHtml(name)}
            <span class="admin-staff-tag${member.mustChangePassword ? ' admin-staff-tag--warn' : ''}">${status}</span>
            ${member.mustChangePassword ? '<span class="admin-staff-tag admin-staff-tag--warn">Reset password pending</span>' : ''}
          </div>
          <div class="admin-staff-row__sub">
            <span>${escapeHtml(member.position || 'Staff')}</span>
            <span>${escapeHtml(member.email || '—')}</span>
            <span>${escapeHtml(member.phoneNumber || '—')}</span>
          </div>
          <div class="admin-staff-row__stats">
            <span>Created ${escapeHtml(formatRelativeTime(member.createdAt) || '—')}</span>
            <span>Permissions: ${escapeHtml(permissionNames(member.permissions))}</span>
          </div>
        </div>
      </div>
      <div class="admin-staff-row__login">
        <div class="admin-staff-login-empty" style="font-weight:700;opacity:0.7">Login activity</div>
        ${loginRows}
      </div>
      <div class="admin-staff-row__actions">
        <button type="button" class="admin-btn-secondary" data-action="edit" data-staff-uid="${escapeHtml(member.id)}">Edit</button>
        <button type="button" class="admin-btn-secondary" data-action="permissions" data-staff-uid="${escapeHtml(member.id)}">Permissions</button>
        ${status === 'active'
          ? `<button type="button" class="admin-btn-secondary" data-action="disable" data-staff-uid="${escapeHtml(member.id)}">Disable</button>`
          : `<button type="button" class="admin-btn-secondary" data-action="enable" data-staff-uid="${escapeHtml(member.id)}">Enable</button>`}
        <button type="button" class="admin-btn-secondary" data-action="resetpw" data-staff-uid="${escapeHtml(member.id)}">Reset Password</button>
        <button type="button" class="admin-btn-secondary admin-btn-danger" data-action="delete" data-staff-uid="${escapeHtml(member.id)}">Delete</button>
      </div>
    </div>
  </article>`;
}

function renderRows(){
  const el = document.getElementById('adminStaffList');
  if(!el) return;
  if(isLoading){
    el.innerHTML = '<div class="admin-dashboard-empty">Loading staff accounts…</div>';
    return;
  }
  if(loadError && !allStaff.length){
    el.innerHTML = '<div class="admin-dashboard-empty">Staff accounts could not be loaded. Reconnecting…</div>';
    return;
  }
  if(!allStaff.length){
    el.innerHTML = '<div class="admin-dashboard-empty">No staff accounts yet. Create one to give a team member dashboard access.</div>';
    return;
  }
  el.innerHTML = allStaff.map(buildRow).join('');
}

function renderAll(){
  renderToolbar();
  renderRows();
}

/* ---- permission checkbox list ---- */
function renderPermissionChecklist(container, selected = []){
  if(!container) return;
  container.innerHTML = SECTION_PERMISSIONS.map(p => `
    <label class="admin-permission-choice">
      <input type="checkbox" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''}>
      <span>${escapeHtml(p.icon)} ${escapeHtml(p.label)}</span>
    </label>`).join('');
}

function getCheckedPermissions(container){
  if(!container) return [];
  return [...container.querySelectorAll('input:checked')].map(i => i.value);
}

/* ---- modal open/close ---- */
function openModal(mode, member){
  const overlay = document.getElementById('staffFormOverlay');
  const title = document.getElementById('staffFormTitle');
  const submit = document.getElementById('staffFormSubmit');
  const error = document.getElementById('staffFormError');
  const passwordWrap = document.getElementById('staffFormPasswordWrap');
  const passwordField = document.getElementById('staffFormPassword');
  const passwordNote = document.getElementById('staffFormPasswordNote');

  editingUid = mode === 'edit' ? member.id : null;
  if(error) error.hidden = true;

  if(title) title.textContent = mode === 'edit' ? 'Edit Staff Account' : 'Add Staff Account';
  document.getElementById('staffFormName').value = member?.name || '';
  document.getElementById('staffFormEmail').value = member?.email || '';
  document.getElementById('staffFormPhone').value = member?.phoneNumber || '';
  document.getElementById('staffFormPosition').value = member?.position || '';
  document.getElementById('staffFormStatus').value = member?.status === 'disabled' ? 'disabled' : 'active';

  if(mode === 'new'){
    // New accounts always get a generated temp password.
    if(passwordWrap) passwordWrap.style.display = '';
    if(passwordField){
      passwordField.value = generateTempPassword();
      passwordField.readOnly = true;
    }
    if(passwordNote) passwordNote.textContent = 'This temporary password will be shown once. The staff member must change it on their first sign-in.';
  } else {
    if(passwordWrap) passwordWrap.style.display = 'none';
    if(passwordNote) passwordNote.textContent = 'Password is not changed here — use "Reset Password" to issue a new temporary password.';
  }

  renderPermissionChecklist(document.getElementById('staffFormPermissions'), member?.permissions || []);
  if(submit) submit.textContent = mode === 'edit' ? 'Save Changes' : 'Add Staff Account';
  if(overlay) overlay.classList.add('open');
}

function closeModal(){
  const overlay = document.getElementById('staffFormOverlay');
  if(overlay) overlay.classList.remove('open');
  editingUid = null;
}

/* ---- create/edit submit ---- */
async function handleFormSubmit(e){
  e.preventDefault();
  const error = document.getElementById('staffFormError');
  const name = document.getElementById('staffFormName').value.trim();
  const email = document.getElementById('staffFormEmail').value.trim();
  const phone = document.getElementById('staffFormPhone').value.trim();
  const position = document.getElementById('staffFormPosition').value.trim();
  const status = document.getElementById('staffFormStatus').value;
  const permissions = getCheckedPermissions(document.getElementById('staffFormPermissions'));

  if(!name || !email){ if(error){ error.textContent = 'Name and email are required.'; error.hidden = false; } return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ if(error){ error.textContent = 'Enter a valid email address.'; error.hidden = false; } return; }

  const btn = document.getElementById('staffFormSubmit');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    if(editingUid){
      const changes = { name, email, phoneNumber: phone, position, status, permissions };
      await updateStaffMember(editingUid, changes);
} else {
      const password = document.getElementById('staffFormPassword').value;
      // Create the Firebase Auth account via the admin app's auth (the
      // admin stays signed in as themselves — separate session), then
      // write the staff/{uid} doc and the users/{uid} profile.
      const { uid } = await createStaffAuthAccount(email, password, name);
      await addStaffMember({
        uid, name, email, phoneNumber: phone, position,
        tempPassword: password, mustChangePassword: true,
        status, permissions, createdAt: Date.now(), loginActivity: []
      });
      await saveUserProfile(uid, { displayName: name, email, phoneNumber: phone, role: 'staff', createdAt: Date.now() });
    }
    closeModal();
  } catch(err){
    if(error){
      error.textContent = /email-already-in-use/i.test(err.message || '') ? 'That email is already registered.' : 'Could not save staff account. Try again.';
      error.hidden = false;
    }
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = editingUid ? 'Save Changes' : 'Add Staff Account'; }
  }
}

/* ---- row actions ---- */
async function handleRowAction(action, uid){
  const member = allStaff.find(s => s.id === uid);
  if(!member) return;

  if(action === 'edit'){
    openModal('edit', member);
    return;
  }

  if(action === 'permissions'){
    openModal('edit', member);
    document.getElementById('staffFormError') ? document.getElementById('staffFormError').hidden = true : null;
    return;
  }

  if(action === 'disable'){
    const ok = await confirmAction({ title: 'Disable this staff account?', message: `${member.name || member.email} won't be able to sign in until you re-enable them.`, confirmLabel: 'Disable', danger: true });
    if(!ok) return;
    await updateStaffMember(uid, { status: 'disabled' });
    return;
  }

  if(action === 'enable'){
    await updateStaffMember(uid, { status: 'active' });
    return;
  }

  if(action === 'resetpw'){
    const newPassword = await resetStaffPassword(uid);
    if(!newPassword){ window.alert('Could not reset the password. Try again.'); return; }
    // Show the new temp password to the Super Admin so they can hand it
    // to the staff member. (firestore.rules only lets the Super Admin
    // read staff docs, so this is a safe disclosure.)
    window.alert(`New temporary password for ${member.name || member.email}:\n\n${newPassword}\n\nThe staff member must change it on their next sign-in.`);
    return;
  }

  if(action === 'delete'){
    const ok = await confirmAction({ title: 'Delete this staff account?', message: `Permanently delete ${member.name || member.email}? This cannot be undone.`, confirmLabel: 'Delete Staff', danger: true });
    if(!ok) return;
    await deleteStaffMember(uid);
    return;
  }
}

/* ---- wiring ---- */
function initToolbar(){
  document.getElementById('addStaffBtn')?.addEventListener('click', () => openModal('new', null));
  document.getElementById('staffFormOverlay')?.addEventListener('click', (e) => {
    if(e.target.id === 'staffFormOverlay') closeModal();
  });
  document.getElementById('staffFormClose')?.addEventListener('click', closeModal);
  document.getElementById('staffFormCancel')?.addEventListener('click', closeModal);
  document.getElementById('staffForm')?.addEventListener('submit', handleFormSubmit);

  const list = document.getElementById('adminStaffList');
  list?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    await handleRowAction(btn.dataset.action, btn.dataset.staffUid);
  });
}

export function startStaffSubscription(){
  if(unsubscribe){ unsubscribe(); unsubscribe = null; }
  if(timeoutId !== null){ clearTimeout(timeoutId); timeoutId = null; }
  isLoading = true;
  loadError = null;
  renderAll();

  timeoutId = setTimeout(() => {
    timeoutId = null;
    if(!isLoading) return;
    isLoading = false;
    loadError = 'subscription-failed';
    renderAll();
  }, 12000);

  subscribeToStaff(list => {
    if(timeoutId !== null){ clearTimeout(timeoutId); timeoutId = null; }
    allStaff = list || [];
    isLoading = false;
    loadError = null;
    renderAll();
  }, () => {
    if(timeoutId !== null){ clearTimeout(timeoutId); timeoutId = null; }
    isLoading = false;
    loadError = 'subscription-failed';
    renderAll();
  }).then(unsub => { unsubscribe = unsub; }).catch(() => {
    if(timeoutId !== null){ clearTimeout(timeoutId); timeoutId = null; }
    isLoading = false;
    loadError = 'subscription-failed';
    renderAll();
  });
}

export function initAdminStaff(){
  initToolbar();
}

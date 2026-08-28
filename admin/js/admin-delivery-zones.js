import { addDeliveryZone, updateDeliveryZone, deleteDeliveryZone, subscribeToDeliveryZones } from '../../js/firestore.js';
import { isFirebaseConfigured } from '../../js/firebase.js';
import { getAdminFirebaseApp } from './admin-session.js';
import { escapeHtml, formatNaira } from '../../js/utils.js';
import { showToast } from '../../js/toast.js';
import { confirmAction } from './admin-confirm.js';

/* ============================================================
   PHASE 4 (Admin Dashboard) — Delivery Zones management.

   Architecturally identical to admin-taxonomy.js's categories/labels:
   a live subscribeToDeliveryZones() listener (js/firestore.js — this
   file has zero Firestore query logic of its own, same "reuse, don't
   duplicate" instruction every other admin module here follows),
   module-level state, one render function, event-delegated row
   actions, a small add/edit modal, delete via the shared
   admin-confirm.js dialog. Simpler than taxonomy in one respect: zones
   aren't referenced by any menu item field the way a category name or
   a label id is, so there's no "usage count" to compute and no
   cascading update/removal needed when a zone is renamed or deleted —
   deleting a zone here only ever affects this collection.

   Deliberately NOT wired into checkout's delivery-fee calculation
   (js/order.js still uses a single flat fee — see
   js/restaurant-settings.js / admin-settings.js for where that fee is
   actually configured). This page is reference data for staff (phone
   orders, future expansion) rather than a live per-zone pricing engine
   — the brief asked for "Delivery Zones management", not a checkout
   redesign, and turning a flat-fee checkout into a zone-picker is a
   substantial customer-facing change this phase wasn't asked to make.
   Named here plainly rather than silently assumed away. */

let zones = [];
let loading = true;
let error = false;
let selectedZoneId = null;
let started = false;
const listeners = [];

function notify(){ listeners.forEach(listener => listener()); }
export function onZonesChanged(listener){ listeners.push(listener); }
export function getZones(){ return [...zones].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.name.localeCompare(b.name)); }

function findZoneByName(name){ return zones.find(zone => zone.name.trim().toLowerCase() === name.trim().toLowerCase()); }

function setModalOpen(id, open){
  document.getElementById(id)?.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function renderZones(){
  const list = document.getElementById('adminZonesList');
  if(!list) return;
  if(loading){ list.innerHTML = '<div class="admin-dashboard-empty">Loading delivery zones…</div>'; return; }
  if(error && !zones.length){ list.innerHTML = '<div class="admin-dashboard-empty">Delivery zones could not be loaded. Check the connection and refresh the page.</div>'; return; }
  if(!zones.length){ list.innerHTML = '<div class="admin-dashboard-empty">No delivery zones yet. Add one to keep a shared reference of areas and fees.</div>'; return; }
  list.innerHTML = getZones().map(zone => {
    const area = zone.area ? `${escapeHtml(zone.area)} · ` : '';
    return `<div class="admin-taxonomy-row" data-id="${escapeHtml(zone.id)}">
      <div><strong>${escapeHtml(zone.name)}</strong><span>${area}${formatNaira(zone.fee || 0)} delivery fee · ${zone.active === false ? 'Hidden' : 'Visible'}</span></div>
      <div class="admin-taxonomy-row__actions">
        <button type="button" class="admin-row-btn" data-action="toggle-zone">${zone.active === false ? 'Show' : 'Hide'}</button>
        <button type="button" class="admin-row-btn" data-action="edit-zone">Edit</button>
        <button type="button" class="admin-row-btn danger" data-action="delete-zone">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function openZoneForm(zone = null){
  selectedZoneId = zone?.id || null;
  document.getElementById('zoneFormTitle').textContent = zone ? 'Edit Delivery Zone' : 'Add Delivery Zone';
  document.getElementById('zoneFormName').value = zone?.name || '';
  document.getElementById('zoneFormFee').value = zone?.fee ?? '';
  document.getElementById('zoneFormArea').value = zone?.area || '';
  document.getElementById('zoneFormActive').checked = zone?.active !== false;
  document.getElementById('zoneFormError').hidden = true;
  setModalOpen('zoneFormOverlay', true);
  document.getElementById('zoneFormName').focus();
}
function closeZoneForm(){ setModalOpen('zoneFormOverlay', false); selectedZoneId = null; }
function formError(message){ const el = document.getElementById('zoneFormError'); el.textContent = message; el.hidden = !message; }

async function saveZone(event){
  event.preventDefault();
  const name = document.getElementById('zoneFormName').value.trim();
  const feeRaw = document.getElementById('zoneFormFee').value;
  const fee = parseFloat(feeRaw);
  const area = document.getElementById('zoneFormArea').value.trim();
  const active = document.getElementById('zoneFormActive').checked;

  if(!name){ formError('Enter a zone name.'); return; }
  if(feeRaw === '' || !Number.isFinite(fee) || fee < 0){ formError('Enter a delivery fee of 0 or more.'); return; }
  const duplicate = findZoneByName(name);
  if(duplicate && duplicate.id !== selectedZoneId){ formError('A delivery zone with this name already exists.'); return; }

  const button = document.getElementById('zoneFormSubmit');
  button.disabled = true;
  try {
    const data = { name, fee, area, active };
    const ok = selectedZoneId
      ? await updateDeliveryZone(selectedZoneId, data, await getAdminFirebaseApp())
      : !!await addDeliveryZone({ ...data, sortOrder: zones.length }, await getAdminFirebaseApp());
    if(!ok) throw new Error('zone-save-failed');
    showToast(selectedZoneId ? 'Delivery zone saved.' : 'Delivery zone added.');
    closeZoneForm();
  } catch(e){ formError('Could not save this delivery zone. Please try again.'); }
  finally { button.disabled = false; }
}

async function handleZoneAction(action, id){
  const zone = zones.find(z => z.id === id);
  if(!zone) return;
  if(action === 'edit-zone') return openZoneForm(zone);
  if(action === 'toggle-zone'){
    const ok = await updateDeliveryZone(id, { active: zone.active === false }, await getAdminFirebaseApp());
    if(!ok) showToast("Couldn't update this zone's visibility.", { type: 'error' });
    return;
  }
  if(action === 'delete-zone'){
    const confirmed = await confirmAction({
      title: 'Delete this delivery zone?',
      message: `"${zone.name}" will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if(!confirmed) return;
    const ok = await deleteDeliveryZone(id, await getAdminFirebaseApp());
    if(!ok) showToast("Couldn't delete this delivery zone.", { type: 'error' });
  }
}

/** Starts (or restarts) the live delivery-zones subscription. Called
    once from admin-app.js's init() once staff sign-in is confirmed,
    same reasoning as every other admin data source. */
export async function startDeliveryZonesSubscription(){
  if(started) return;
  started = true;
  const notice = document.getElementById('adminZonesLoadNotice');
  if(!isFirebaseConfigured()){
    loading = false;
    error = true;
    if(notice){ notice.hidden = false; notice.textContent = "Firebase isn't configured yet — delivery zones can't be loaded or saved."; }
    notify();
    return;
  }
  const app = await getAdminFirebaseApp();
  await subscribeToDeliveryZones(next => {
    zones = next;
    loading = false;
    error = false;
    if(notice) notice.hidden = true;
    notify();
  }, () => {
    loading = false;
    error = true;
    if(notice){ notice.hidden = false; notice.textContent = "Live updates interrupted — showing the last known list. Reconnecting…"; }
    notify();
  }, app);
}

export function initAdminDeliveryZones(){
  onZonesChanged(renderZones);
  document.getElementById('addZoneBtn')?.addEventListener('click', () => openZoneForm());
  document.getElementById('adminZonesList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); const row = button?.closest('[data-id]');
    if(button && row) handleZoneAction(button.dataset.action, row.dataset.id);
  });
  document.getElementById('zoneForm')?.addEventListener('submit', saveZone);
  ['zoneFormClose', 'zoneFormCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', closeZoneForm));
  document.getElementById('zoneFormOverlay')?.addEventListener('click', event => { if(event.target.id === 'zoneFormOverlay') closeZoneForm(); });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && document.getElementById('zoneFormOverlay')?.classList.contains('open')) closeZoneForm();
  });
  renderZones();
}

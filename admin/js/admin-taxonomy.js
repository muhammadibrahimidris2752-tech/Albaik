import {
  addMenuCategory, updateMenuCategory, deleteMenuCategory, subscribeToMenuCategories,
  addMenuLabel, updateMenuLabel, deleteMenuLabel, subscribeToMenuLabels
} from '../../js/firestore.js';
import { isFirebaseConfigured } from '../../js/firebase.js';
import { getAdminFirebaseApp } from './admin-session.js';
import { getAllItems, getKnownCategories, isMenuDataLoading, onMenuDataChanged, saveItemChanges, migrateItemLegacyBadges } from './admin-data.js';
import { escapeHtml } from '../../js/utils.js';
import { showToast } from '../../js/toast.js';
import { confirmAction } from './admin-confirm.js';

/* Managed categories and labels complement the restaurant's existing menu-item
   category text. Labels now fully REPLACE the old badge fields (see below).

   PHASE 4 (Eliminate duplicate badge system). The four hardcoded badge
   fields (isPopular/isNew/isSignature/isBestSeller — formerly read
   directly by js/menu-render.js, js/product-modal.js and this file's
   own admin-render.js) are retired as of this phase. There is now ONE
   badge system: an item's `labels` array of managed-label ids, resolved
   live via js/labels-data.js on the customer site and via
   getManagedLabels() below in the admin panel. Two things make that
   transition safe for menu items that were already using the old
   fields:

     1. importLegacyBadgeLabels() seeds a managed label for each of the
        four legacy names, IF a label with that name doesn't already
        exist — safe to run every session (see its own comment).
     2. migrateLegacyBadgeItemsIfReady() then walks every existing menu
        item once, adds the matching managed label's id to that item's
        `labels` array for each legacy boolean it has set to true, and
        deletes the four legacy fields from the document in the same
        write (js/firestore.js's setMenuItemLabelsAndClearLegacyBadges) —
        so a menu item never carries both systems at once, and nothing
        is lost: "Preserve every existing menu item's badge assignment"
        is the whole point of doing this as a migration rather than a
        silent cutover. Both steps are idempotent and only ever run
        once per session (see the two "*Attempted" flags below) —
        re-running them after they've already succeeded is always a
        no-op, so there's no harm in every admin page load attempting
        them again. */
const LEGACY_BADGE_LABELS = ['Popular', 'New', 'Signature', 'Best Seller'];
let legacyImportAttempted = false;
let legacyItemMigrationAttempted = false;

let categories = [];
let labels = [];
let categoriesLoading = true;
let labelsLoading = true;
let categoriesError = false;
let labelsError = false;
let selectedCategoryId = null;
let selectedLabelId = null;
let started = false;
const listeners = [];

function notify(){ listeners.forEach(listener => listener()); }
export function onTaxonomyChanged(listener){ listeners.push(listener); }
export function getManagedCategories(){ return [...categories].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.name.localeCompare(b.name)); }
export function getManagedLabels(){ return [...labels].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.name.localeCompare(b.name)); }
export function getEnabledLabels(){ return getManagedLabels().filter(label => label.active !== false); }
export function getCategoryChoices(){
  const managed = getManagedCategories().filter(category => category.active !== false).map(category => category.name);
  return [...new Set([...managed, ...getKnownCategories()])].sort((a, b) => a.localeCompare(b));
}

function findCategoryByName(name){ return categories.find(category => category.name.trim().toLowerCase() === name.trim().toLowerCase()); }
export async function ensureManagedCategory(name){
  const existing = findCategoryByName(name);
  if(existing) return existing;
  const id = await addMenuCategory({ name, active: true, sortOrder: categories.length }, await getAdminFirebaseApp());
  return id ? { id, name, active: true, sortOrder: categories.length } : null;
}

function findLabelByName(name){ return labels.find(label => label.name.trim().toLowerCase() === name.trim().toLowerCase()); }

/** PHASE 4. See this file's header comment. Guarded by
    legacyImportAttempted so it only ever runs once per page session —
    findLabelByName() already makes each individual addMenuLabel() call
    idempotent across sessions/reloads, but there's no reason to
    re-check on every single labels snapshot within one session (a
    label added or renamed by staff mid-session shouldn't re-trigger
    this). Awaited by its caller below (unlike a true fire-and-forget
    background write) because migrateLegacyBadgeItemsIfReady() needs
    these four labels' real ids to exist before it can resolve an
    item's booleans into `labels` entries. */
async function importLegacyBadgeLabels(){
  if(legacyImportAttempted) return;
  legacyImportAttempted = true;
  const app = await getAdminFirebaseApp();
  for(const name of LEGACY_BADGE_LABELS){
    if(findLabelByName(name)) continue;
    await addMenuLabel({ name, active: true, sortOrder: labels.length }, app);
  }
}

/** PHASE 4. The item-side half of the legacy-badge migration (see this
    file's header comment) — walks every menu item once, folds each
    true legacy boolean into that item's `labels` array as the matching
    managed label's real id, and clears the four legacy fields in the
    same write. Needs BOTH menu items and labels loaded to do this
    correctly (it must resolve a label by name to a real id before it
    can write it onto an item), and the two subscriptions that load them
    (admin-data.js's startMenuItemsSubscription, this file's own labels
    subscription) resolve independently — so this is called from two
    places: after importLegacyBadgeLabels() confirms the four labels
    exist, AND from renderTaxonomy() on every menu-data change, in case
    items are still loading when labels finish first (or vice versa).
    Calling it repeatedly is safe: legacyItemMigrationAttempted makes
    the whole thing run at most once per session, and isMenuDataLoading()
    guards against running it against a still-empty, not-yet-loaded
    item list. */
async function migrateLegacyBadgeItemsIfReady(){
  if(legacyItemMigrationAttempted || labelsLoading || isMenuDataLoading()) return;
  legacyItemMigrationAttempted = true;
  const BOOLEAN_TO_NAME = [
    ['isSignature', 'Signature'],
    ['isBestSeller', 'Best Seller'],
    ['isPopular', 'Popular'],
    ['isNew', 'New']
  ];
  const targets = getAllItems().filter(item => BOOLEAN_TO_NAME.some(([key]) => item[key]));
  for(const item of targets){
    const addIds = BOOLEAN_TO_NAME
      .filter(([key]) => item[key])
      .map(([, name]) => findLabelByName(name)?.id)
      .filter(Boolean);
    const mergedLabels = [...new Set([...(item.labels || []), ...addIds])];
    const ok = await migrateItemLegacyBadges(item.id, mergedLabels);
    if(!ok) console.error(`Could not migrate legacy badges for menu item "${item.id}".`);
  }
}

function setModalOpen(id, open){
  document.getElementById(id)?.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function categoryUsage(name){ return getAllItems().filter(item => item.category === name); }
function labelUsage(id){ return getAllItems().filter(item => Array.isArray(item.labels) && item.labels.includes(id)); }

function renderCategories(){
  const list = document.getElementById('adminCategoriesList');
  if(!list) return;
  if(categoriesLoading){ list.innerHTML = '<div class="admin-dashboard-empty">Loading categories…</div>'; return; }
  if(categoriesError && !categories.length){ list.innerHTML = '<div class="admin-dashboard-empty">Categories could not be loaded. Check the connection and refresh the page.</div>'; return; }
  if(!categories.length){ list.innerHTML = '<div class="admin-dashboard-empty">No managed categories yet. Existing menu categories remain available; add one here to control its visibility and order.</div>'; return; }
  list.innerHTML = getManagedCategories().map(category => {
    const usage = categoryUsage(category.name).length;
    return `<div class="admin-taxonomy-row" data-id="${escapeHtml(category.id)}">
      <div><strong>${escapeHtml(category.name)}</strong><span>${usage} menu item${usage === 1 ? '' : 's'} · ${category.active === false ? 'Hidden' : 'Visible'}</span></div>
      <div class="admin-taxonomy-row__actions">
        <button type="button" class="admin-row-btn" data-action="toggle-category">${category.active === false ? 'Show' : 'Hide'}</button>
        <button type="button" class="admin-row-btn" data-action="edit-category">Edit</button>
        <button type="button" class="admin-row-btn danger" data-action="delete-category">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function renderLabels(){
  const list = document.getElementById('adminLabelsList');
  if(!list) return;
  if(labelsLoading){ list.innerHTML = '<div class="admin-dashboard-empty">Loading labels…</div>'; return; }
  if(labelsError && !labels.length){ list.innerHTML = '<div class="admin-dashboard-empty">Labels could not be loaded. Check the connection and refresh the page.</div>'; return; }
  if(!labels.length){ list.innerHTML = '<div class="admin-dashboard-empty">No labels yet. Create labels such as Spicy, Family Favourite, or Limited Time.</div>'; return; }
  list.innerHTML = getManagedLabels().map(label => {
    const usage = labelUsage(label.id).length;
    return `<div class="admin-taxonomy-row" data-id="${escapeHtml(label.id)}">
      <div><strong>${escapeHtml(label.name)}</strong><span>${usage} menu item${usage === 1 ? '' : 's'} · ${label.active === false ? 'Hidden' : 'Visible'}</span></div>
      <div class="admin-taxonomy-row__actions">
        <button type="button" class="admin-row-btn" data-action="toggle-label">${label.active === false ? 'Show' : 'Hide'}</button>
        <button type="button" class="admin-row-btn" data-action="edit-label">Edit</button>
        <button type="button" class="admin-row-btn danger" data-action="delete-label">Delete</button>
      </div>
    </div>`;
  }).join('');
}

export function renderTaxonomy(){
  renderCategories();
  renderLabels();
  migrateLegacyBadgeItemsIfReady();
}

function openCategoryForm(category = null){
  selectedCategoryId = category?.id || null;
  document.getElementById('categoryFormTitle').textContent = category ? 'Edit Category' : 'Add Category';
  document.getElementById('categoryFormName').value = category?.name || '';
  document.getElementById('categoryFormActive').checked = category?.active !== false;
  document.getElementById('categoryFormError').hidden = true;
  setModalOpen('categoryFormOverlay', true);
  document.getElementById('categoryFormName').focus();
}
function openLabelForm(label = null){
  selectedLabelId = label?.id || null;
  document.getElementById('labelFormTitle').textContent = label ? 'Edit Label' : 'Add Label';
  document.getElementById('labelFormName').value = label?.name || '';
  document.getElementById('labelFormActive').checked = label?.active !== false;
  document.getElementById('labelFormError').hidden = true;
  setModalOpen('labelFormOverlay', true);
  document.getElementById('labelFormName').focus();
}
function closeCategoryForm(){ setModalOpen('categoryFormOverlay', false); selectedCategoryId = null; }
function closeLabelForm(){ setModalOpen('labelFormOverlay', false); selectedLabelId = null; }
function formError(id, message){ const el = document.getElementById(id); el.textContent = message; el.hidden = !message; }

async function saveCategory(event){
  event.preventDefault();
  const name = document.getElementById('categoryFormName').value.trim();
  const active = document.getElementById('categoryFormActive').checked;
  if(!name){ formError('categoryFormError', 'Enter a category name.'); return; }
  const duplicate = findCategoryByName(name);
  if(duplicate && duplicate.id !== selectedCategoryId){ formError('categoryFormError', 'A category with this name already exists.'); return; }
  const button = document.getElementById('categoryFormSubmit'); button.disabled = true;
  try {
    if(selectedCategoryId){
      const current = categories.find(category => category.id === selectedCategoryId);
      const affected = current && current.name !== name ? categoryUsage(current.name) : [];
      const itemResults = await Promise.all(affected.map(item => saveItemChanges(item.id, { category: name })));
      if(itemResults.some(result => !result)) throw new Error('menu-update-failed');
      const ok = await updateMenuCategory(selectedCategoryId, { name, active }, await getAdminFirebaseApp());
      if(!ok) throw new Error('category-update-failed');
      showToast('Category saved.');
    } else {
      const id = await addMenuCategory({ name, active, sortOrder: categories.length }, await getAdminFirebaseApp());
      if(!id) throw new Error('category-create-failed');
      showToast('Category added.');
    }
    closeCategoryForm();
  } catch(e){ formError('categoryFormError', 'Could not save this category. Please try again.'); }
  finally { button.disabled = false; }
}

async function saveLabel(event){
  event.preventDefault();
  const name = document.getElementById('labelFormName').value.trim();
  const active = document.getElementById('labelFormActive').checked;
  if(!name){ formError('labelFormError', 'Enter a label name.'); return; }
  const duplicate = findLabelByName(name);
  if(duplicate && duplicate.id !== selectedLabelId){ formError('labelFormError', 'A label with this name already exists.'); return; }
  const button = document.getElementById('labelFormSubmit'); button.disabled = true;
  try {
    const ok = selectedLabelId
      ? await updateMenuLabel(selectedLabelId, { name, active }, await getAdminFirebaseApp())
      : !!await addMenuLabel({ name, active, sortOrder: labels.length }, await getAdminFirebaseApp());
    if(!ok) throw new Error('label-save-failed');
    showToast(selectedLabelId ? 'Label saved.' : 'Label added.');
    closeLabelForm();
  } catch(e){ formError('labelFormError', 'Could not save this label. Please try again.'); }
  finally { button.disabled = false; }
}

async function handleCategoryAction(action, id){
  const category = categories.find(item => item.id === id);
  if(!category) return;
  if(action === 'edit-category') return openCategoryForm(category);
  if(action === 'toggle-category'){
    const ok = await updateMenuCategory(id, { active: category.active === false }, await getAdminFirebaseApp());
    if(!ok) showToast("Couldn't update category visibility.", { type: 'error' });
    return;
  }
  if(action === 'delete-category'){
    if(categoryUsage(category.name).length){ showToast('Move or rename its menu items before deleting this category.', { type: 'error' }); return; }
    // PHASE 4 consistency fix: this used window.confirm() before, the
    // one delete action in the admin panel not using the shared
    // in-page dialog every other overlay here uses — see
    // admin-confirm.js's own header comment.
    const confirmed = await confirmAction({
      title: 'Delete this category?',
      message: `"${category.name}" will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if(!confirmed) return;
    const ok = await deleteMenuCategory(id, await getAdminFirebaseApp());
    if(!ok) showToast("Couldn't delete this category.", { type: 'error' });
  }
}

async function handleLabelAction(action, id){
  const label = labels.find(item => item.id === id);
  if(!label) return;
  if(action === 'edit-label') return openLabelForm(label);
  if(action === 'toggle-label'){
    const ok = await updateMenuLabel(id, { active: label.active === false }, await getAdminFirebaseApp());
    if(!ok) showToast("Couldn't update label visibility.", { type: 'error' });
    return;
  }
  if(action === 'delete-label'){
    const confirmed = await confirmAction({
      title: 'Delete this label?',
      message: `"${label.name}" will be removed from all menu items using it. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if(!confirmed) return;
    const affected = labelUsage(id);
    const results = await Promise.all(affected.map(item => saveItemChanges(item.id, { labels: (item.labels || []).filter(labelId => labelId !== id) })));
    if(results.some(result => !result) || !await deleteMenuLabel(id, await getAdminFirebaseApp())) showToast("Couldn't delete this label.", { type: 'error' });
  }
}

export async function startAdminTaxonomy(){
  if(started) return;
  started = true;
  if(!isFirebaseConfigured()){
    categoriesLoading = labelsLoading = false;
    categoriesError = labelsError = true;
    notify();
    return;
  }
  const app = await getAdminFirebaseApp();
  await Promise.all([
    subscribeToMenuCategories(next => { categories = next; categoriesLoading = false; categoriesError = false; notify(); }, () => { categoriesLoading = false; categoriesError = true; notify(); }, app),
    subscribeToMenuLabels(next => {
      labels = next;
      labelsLoading = false;
      labelsError = false;
      notify();
      importLegacyBadgeLabels().then(migrateLegacyBadgeItemsIfReady);
    }, () => { labelsLoading = false; labelsError = true; notify(); }, app)
  ]);
}

export function initAdminTaxonomy(){
  onTaxonomyChanged(renderTaxonomy);
  onMenuDataChanged(renderTaxonomy);
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCategoryForm());
  document.getElementById('addLabelBtn')?.addEventListener('click', () => openLabelForm());
  document.getElementById('adminCategoriesList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); const row = button?.closest('[data-id]');
    if(button && row) handleCategoryAction(button.dataset.action, row.dataset.id);
  });
  document.getElementById('adminLabelsList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); const row = button?.closest('[data-id]');
    if(button && row) handleLabelAction(button.dataset.action, row.dataset.id);
  });
  document.getElementById('categoryForm')?.addEventListener('submit', saveCategory);
  document.getElementById('labelForm')?.addEventListener('submit', saveLabel);
  ['categoryFormClose', 'categoryFormCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', closeCategoryForm));
  ['labelFormClose', 'labelFormCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', closeLabelForm));
  document.getElementById('categoryFormOverlay')?.addEventListener('click', event => { if(event.target.id === 'categoryFormOverlay') closeCategoryForm(); });
  document.getElementById('labelFormOverlay')?.addEventListener('click', event => { if(event.target.id === 'labelFormOverlay') closeLabelForm(); });
  renderTaxonomy();
}

import { createItem, saveItemChanges, getNextDisplayOrderForCategory } from './admin-data.js';
import { uploadImage, validateImageFile } from '../../js/storage.js';
import { showToast } from '../../js/toast.js';
import { escapeHtml } from '../../js/utils.js';
import { getAdminFirebaseApp } from './admin-session.js';
import { getCategoryChoices, getManagedLabels, ensureManagedCategory } from './admin-taxonomy.js';
import { getItemAggregate } from '../../js/reviews-store.js';

/* ============================================================
   ADMIN MENU MANAGER — the add/edit item modal. Reuses
   js/storage.js's existing uploadImage()/validateImageFile() exactly
   as they already exist — uploadImage('menu-images/' + itemId + '/' +
   file.name, file) is literally the call that file's own header
   comment already documented as the intended Phase 6 call site. Writes
   go through admin-data.js's createItem()/saveItemChanges(), which
   wrap js/firestore.js's addMenuItem()/updateMenuItem() — this file
   never calls Firestore directly.

   Image upload before a NEW item exists: Storage needs a path the
   moment a file is chosen, but a brand-new item has no real Firestore
   id yet (addDoc() only assigns one once the item is actually saved —
   see js/firestore.js's addMenuItem()). tempImageKey below is a
   client-generated placeholder path segment used ONLY for where an
   uploaded photo lives in Storage while the Add form is still open;
   it is never written to Firestore itself (the item's `image` field
   is always just the plain download URL uploadImage() returns, the
   same field format whether that URL came from typing one in or
   uploading one). storage.rules' menu-images/{itemId}/{fileName} path
   segment is a free-form organizational key, not a foreign key
   validated against a real menuItems document, so this is safe — it
   only affects which Storage folder the photo is filed under, not
   whether the upload is allowed (that's still governed by the
   signed-in uploader's own staff/admin role, same rule either way).

   Badges are managed entirely through the labels checklist below
   (renderLabelChecklist/selectedLabelIds) — the four old hardcoded
   badge-toggle buttons (isPopular/isNew/isSignature/isBestSeller) were
   removed in Phase 4 once admin-taxonomy.js's migration folded them
   into the labels system; see that file's header comment for why
   there must only ever be one badge control here, not two. The
   availability toggle still works exactly as before (plain module
   state via the "active" CSS class on #itemFormAvailabilityToggle's
   two buttons) — the submit handler reads it directly when it builds
   the write payload. ================ */

let editingId = null;     // null while adding a new item
let tempImageKey = null;  // see header comment — only set while adding

function genTempKey(){
  return 'new-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  const el = document.getElementById('itemFormError');
  if(!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

/** Rebuilds the category <select>'s options from whatever categories
    currently exist (admin-data.js's getKnownCategories()) plus a
    trailing "add new" option. `selected` is the item's current
    category when editing, or null when adding. */
function renderCategorySelect(selected){
  const select = document.getElementById('itemFormCategory');
  const newCategoryInput = document.getElementById('itemFormNewCategory');
  const categories = getCategoryChoices();
  select.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('') +
    `<option value="__new__">+ Add new category…</option>`;

  if(selected && categories.includes(selected)){
    select.value = selected;
    newCategoryInput.hidden = true;
  } else if(selected){
    // Defensive: an item whose category isn't in the known list
    // (shouldn't normally happen, since that list is derived from the
    // same loaded items) — preserve the real value via the "new
    // category" path instead of silently discarding it.
    select.value = '__new__';
    newCategoryInput.hidden = false;
    newCategoryInput.value = selected;
  } else {
    select.value = categories[0] || '__new__';
    newCategoryInput.hidden = select.value !== '__new__';
  }
}

function renderLabelChecklist(selectedIds = []){
  const container = document.getElementById('itemFormLabelList');
  if(!container) return;
  const selected = new Set(selectedIds);
  const labels = getManagedLabels();
  container.innerHTML = labels.length
    ? labels.map(label => `<label class="admin-label-choice"><input type="checkbox" value="${label.id}"${selected.has(label.id) ? ' checked' : ''}${label.active === false && !selected.has(label.id) ? ' disabled' : ''}><span>${label.name}${label.active === false ? ' (hidden)' : ''}</span></label>`).join('')
    : '<span class="admin-field-hint">No labels yet — create them from the Labels tab.</span>';
}

function selectedLabelIds(){
  return [...document.querySelectorAll('#itemFormLabelList input:checked')].map(input => input.value);
}

function currentCategoryValue(){
  const select = document.getElementById('itemFormCategory');
  if(select.value === '__new__') return document.getElementById('itemFormNewCategory').value.trim();
  return select.value;
}

function renderImagePreview(url){
  const img = document.getElementById('itemFormImagePreviewImg');
  const fallback = document.getElementById('itemFormImageFallback');
  if(url){
    img.src = url;
    img.hidden = false;
    fallback.hidden = true;
    img.onerror = () => { img.hidden = true; fallback.hidden = false; };
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    fallback.hidden = false;
  }
}

function renderAvailabilityToggle(available){
  document.querySelectorAll('#itemFormAvailabilityToggle button').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.available === 'true') === available);
  });
}
function currentAvailability(){
  const active = document.querySelector('#itemFormAvailabilityToggle button.active');
  return active ? active.dataset.available === 'true' : true;
}

function resetForm(){
  document.getElementById('itemForm').reset();
  showFormError('');
  const status = document.getElementById('itemFormUploadStatus');
  status.textContent = '';
  status.classList.remove('is-error');
  renderAvailabilityToggle(true);
  renderLabelChecklist();
  renderImagePreview('');
  document.getElementById('itemFormRatingInfo').hidden = true;
}

function openModal(){
  document.getElementById('itemFormOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(){
  document.getElementById('itemFormOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function openItemFormForAdd(){
  resetForm();
  editingId = null;
  tempImageKey = genTempKey();

  document.getElementById('itemFormTitle').textContent = 'Add Menu Item';
  document.getElementById('itemFormSubmitBtn').textContent = 'Add Item';
  renderCategorySelect(null);
  renderLabelChecklist();
  const orderInput = document.getElementById('itemFormDisplayOrder');
  orderInput.value = '';
  orderInput.placeholder = 'e.g. 10 — leave blank to add at the end';
  document.getElementById('itemFormStock').value = '';

  openModal();
  document.getElementById('itemFormName').focus();
}

export function openItemFormForEdit(item){
  resetForm();
  editingId = item.id;
  tempImageKey = null;

  document.getElementById('itemFormTitle').textContent = 'Edit Menu Item';
  document.getElementById('itemFormSubmitBtn').textContent = 'Save Changes';

  document.getElementById('itemFormName').value = item.name || '';
  document.getElementById('itemFormDescription').value = item.description || '';
  document.getElementById('itemFormPrice').value = item.price ?? '';
  document.getElementById('itemFormIcon').value = item.icon || '';
  document.getElementById('itemFormImageUrl').value = item.image || '';
  renderImagePreview(item.image || '');
  renderCategorySelect(item.category || null);
  renderLabelChecklist(item.labels || []);
  const orderInput = document.getElementById('itemFormDisplayOrder');
  orderInput.value = item.displayOrder ?? '';
  orderInput.placeholder = 'e.g. 10 — leave blank to add at the end';
  document.getElementById('itemFormStock').value = typeof item.stockQty === 'number' ? item.stockQty : '';

  renderAvailabilityToggle(item.available !== false);

  // [AUDIT FIX] Used to read item.rating/item.reviewCount — a
  // denormalized field recomputed only by the customer-side review
  // write path (see js/reviews-store.js's header comment for the full
  // root-cause writeup on why that went stale). Calculated live from
  // the shared review store instead; that store has been subscribed
  // since page load, so this is already current the moment the form
  // opens.
  const ratingInfo = document.getElementById('itemFormRatingInfo');
  const { rating, reviewCount } = getItemAggregate(item.id);
  if(reviewCount){
    ratingInfo.textContent = `★ ${rating.toFixed(1)} from ${reviewCount} review${reviewCount === 1 ? '' : 's'} — calculated automatically from customer reviews, not editable here.`;
    ratingInfo.hidden = false;
  } else {
    ratingInfo.hidden = true;
  }

  openModal();
  document.getElementById('itemFormName').focus();
}

function validateForm(){
  const name = document.getElementById('itemFormName').value.trim();
  const priceRaw = document.getElementById('itemFormPrice').value;
  const price = parseFloat(priceRaw);
  const category = currentCategoryValue();
  const stockRaw = document.getElementById('itemFormStock').value.trim();

  if(!name) return 'Please enter a name.';
  if(priceRaw === '' || !Number.isFinite(price) || price <= 0) return 'Please enter a price greater than zero.';
  if(!category) return 'Please choose or enter a category.';
  if(stockRaw !== '' && (!Number.isInteger(parseFloat(stockRaw)) || parseFloat(stockRaw) < 0)) return 'Stock quantity must be a whole number, 0 or more (or leave it blank to not track stock).';
  return null;
}

function handleUploadClick(){
  document.getElementById('itemFormImageFile').click();
}

async function handleFileSelected(e){
  const file = e.target.files[0];
  e.target.value = ''; // allow re-selecting the same file later
  if(!file) return;

  const statusEl = document.getElementById('itemFormUploadStatus');
  const validationError = validateImageFile(file);
  if(validationError){
    statusEl.textContent = validationError;
    statusEl.classList.add('is-error');
    return;
  }

  const idForPath = editingId || tempImageKey;
  statusEl.classList.remove('is-error');
  statusEl.textContent = 'Uploading…';
  const url = await uploadImage(`menu-images/${idForPath}/${file.name}`, file, await getAdminFirebaseApp());
  if(url){
    document.getElementById('itemFormImageUrl').value = url;
    renderImagePreview(url);
    statusEl.textContent = 'Uploaded.';
  } else {
    statusEl.textContent = "Couldn't upload — check your connection, or paste an image URL directly instead.";
    statusEl.classList.add('is-error');
  }
}

async function handleSubmit(e){
  e.preventDefault();
  showFormError('');
  const validationError = validateForm();
  if(validationError){ showFormError(validationError); return; }

  const category = currentCategoryValue();
  const displayOrderRaw = document.getElementById('itemFormDisplayOrder').value.trim();
  const displayOrder = displayOrderRaw === '' ? getNextDisplayOrderForCategory(category) : parseInt(displayOrderRaw, 10);

  const creatingCategory = document.getElementById('itemFormCategory').value === '__new__';
  if(creatingCategory && !await ensureManagedCategory(category)){
    showFormError("Couldn't create the new category. Please try again.");
    return;
  }

  const stockRaw = document.getElementById('itemFormStock').value.trim();
  const stockValue = stockRaw === '' ? null : parseInt(stockRaw, 10);

  const data = {
    name: document.getElementById('itemFormName').value.trim(),
    description: document.getElementById('itemFormDescription').value.trim(),
    price: parseFloat(document.getElementById('itemFormPrice').value),
    category,
    image: document.getElementById('itemFormImageUrl').value.trim(),
    icon: document.getElementById('itemFormIcon').value.trim(),
    available: currentAvailability(),
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
    // PHASE 4 (Admin Dashboard). null (the field left blank) means "not
    // stock-tracked" — see admin-data.js's getLowStockItems() header
    // comment. Firestore accepts null as a real field value (unlike
    // undefined), so an item that WAS tracked and has its Stock
    // Quantity cleared correctly goes back to "not tracked" rather than
    // silently keeping its last known count.
    stockQty: Number.isFinite(stockValue) ? stockValue : null,
    labels: selectedLabelIds()
  };

  const btn = document.getElementById('itemFormSubmitBtn');
  setLoading(btn, true, editingId ? 'Saving…' : 'Adding…');
  try {
    if(editingId){
      const ok = await saveItemChanges(editingId, data);
      if(ok){ showToast(`Saved "${data.name}".`); closeModal(); }
      else showFormError("Couldn't save changes — check your connection and try again.");
    } else {
      const id = await createItem(data);
      if(id){ showToast(`Added "${data.name}".`); closeModal(); }
      else showFormError("Couldn't add this item — check your connection and try again.");
    }
  } finally {
    setLoading(btn, false);
  }
}

/** One-time wiring, called once from admin-app.js's init(). */
export function initAdminItemForm(){
  document.getElementById('itemForm')?.addEventListener('submit', handleSubmit);
  document.getElementById('itemFormCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('itemFormOverlay')?.addEventListener('click', e => {
    if(e.target.id === 'itemFormOverlay') closeModal();
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.getElementById('itemFormOverlay')?.classList.contains('open')) closeModal();
  });

  document.getElementById('itemFormCategory')?.addEventListener('change', e => {
    const newCategoryInput = document.getElementById('itemFormNewCategory');
    newCategoryInput.hidden = e.target.value !== '__new__';
    if(!newCategoryInput.hidden) newCategoryInput.focus();
  });

  document.getElementById('itemFormImageUrl')?.addEventListener('input', e => renderImagePreview(e.target.value.trim()));
  document.getElementById('itemFormUploadBtn')?.addEventListener('click', handleUploadClick);
  document.getElementById('itemFormImageFile')?.addEventListener('change', handleFileSelected);

  document.querySelectorAll('#itemFormAvailabilityToggle button').forEach(btn => {
    btn.addEventListener('click', () => renderAvailabilityToggle(btn.dataset.available === 'true'));
  });
}

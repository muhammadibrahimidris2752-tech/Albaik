import { getFirebaseApp, isFirebaseConfigured, loadFirebaseModule } from './firebase.js';

/* ============================================================
   PHASE 4. Firebase Storage — same shape as every function in
   js/firestore.js: check isFirebaseConfigured(), try/catch the real
   call, return a safe fallback (null) on any failure, never throw.
   Callers never need their own configuration check.

   Section 12 of the Phase 4 brief: "Use Firebase Storage for profile
   pictures. Prepare the storage architecture so the future Admin
   Dashboard can reuse it for menu images." uploadImage() below is the
   generic primitive (any path, any file) — uploadProfilePicture() is
   the one caller this phase actually wires up (js/auth-forms.js's
   avatar upload). A future Phase 6 admin uploader for menu photos
   calls uploadImage('menu-images/' + itemId + '/' + file.name, file)
   directly; nothing here is profile-picture-specific except the path
   convention in that one wrapper. See storage.rules for the matching
   security rules (profile-pictures/{uid}/** — owner-write, public-
   read; menu-images/{itemId}/** — staff/admin-write, public-read,
   unused by any UI until Phase 6 builds the uploader that needs it).
   ============================================================ */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — matches storage.rules

export function validateImageFile(file){
  if(!file) return 'No file selected.';
  if(!file.type || !file.type.startsWith('image/')) return 'Please choose an image file.';
  if(file.size > MAX_UPLOAD_BYTES) return 'Image is too large — please choose one under 5MB.';
  return null;
}

/** Uploads `file` to `path` in the default Storage bucket and returns
    its public download URL, or null on any failure (including "not
    configured yet" and client-side validation failures — validate
    with validateImageFile() first if you need a distinct message for
    that case; this function folds it in too as a last line of
    defense since it's cheap and this is the one place that can't be
    bypassed). */
export async function uploadImage(path, file, appOverride = null){
  if(!isFirebaseConfigured()) return null;
  if(validateImageFile(file)) return null;
  try {
    const app = appOverride || await getFirebaseApp();
    const { getStorage, ref, uploadBytes, getDownloadURL } = await loadFirebaseModule('storage');
    const storageRef = ref(getStorage(app), path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return await getDownloadURL(storageRef);
  } catch(e){
    console.error('Image upload failed:', e);
    return null;
  }
}

/** Profile pictures live at profile-pictures/{uid}/{filename} — one
    owner-writable folder per user (see storage.rules). Re-uploading
    keeps the original filename convention simple (always
    "avatar" + the file's own extension) so a user replacing their
    photo overwrites the same object instead of accumulating orphaned
    old uploads with no cleanup path in a Cloud-Function-free project. */
export async function uploadProfilePicture(uid, file){
  if(!file) return null;
  const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name || '');
  const ext = extMatch ? extMatch[0] : (file.type === 'image/png' ? '.png' : '.jpg');
  return uploadImage(`profile-pictures/${uid}/avatar${ext}`, file);
}

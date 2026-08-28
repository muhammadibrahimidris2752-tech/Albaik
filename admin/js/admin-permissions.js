/* ============================================================
   PRIORITY 15. Reusable permission system — the single source of
   truth for which dashboard sections exist and which permission id
   gates each one. Used by:
     - admin-auth.js  — to hide unauthorized sections (= non-existent
                        in the DOM, not merely disabled) for a staff
                        member, and to gate individual actions.
     - admin-staff.js — to render the Super Admin's permission
                        checkboxes in the staff form.
   The same permission ids are enforced server-side in firestore.rules
   (hasPermission()), so a user can never reach a restricted write by
   typing a URL — the frontend is UX, the rules are enforcement.

   The Super Admin (users/{uid} role 'admin') always passes without a
   staff/{uid} doc; a staff member's permissions come from their own
   staff/{uid}.permissions array.
   ================================================================ */

/** Every management section + the permission id that gates it.
    Order matters — it drives the sidebar and the permission checklist. */
export const SECTION_PERMISSIONS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: '📊' },
  { id: 'orders',      label: 'Orders',      icon: '🧾' },
  { id: 'menu',        label: 'Menu',        icon: '🍗' },
  { id: 'categories',  label: 'Categories',  icon: '🗂️' },
  { id: 'labels',      label: 'Labels',      icon: '🏷️' },
  { id: 'delivery',    label: 'Delivery Zones', icon: '🛵' },
  { id: 'customers',   label: 'Customers',   icon: '👥' },
  { id: 'reviews',     label: 'Reviews',     icon: '⭐' },
  { id: 'analytics',   label: 'Analytics',   icon: '📈' },
  { id: 'staff',       label: 'Staff',       icon: '🛡️' },
  { id: 'settings',    label: 'Settings',    icon: '⚙️' }
];

/** The permission a section needs, defaulting to the section's own id
    (SECTION_PERMISSIONS already maps section → permission 1:1). */
export function permissionForSection(section){
  return SECTION_PERMISSIONS.find(p => p.id === section)?.id || section;
}

/** True if the given staff doc (or Super Admin flag) grants access to
    `section`. The Super Admin always sees everything. A staff member
    sees a section only if their permissions list contains its id. */
export function canAccessSection(section, { isAdminUser = false, permissions = [] } = {}){
  if(isAdminUser) return true;
  return Array.isArray(permissions) && permissions.includes(permissionForSection(section));
}

/** The list of section ids a user may access, in sidebar order. */
export function getPermittedSections({ isAdminUser = false, permissions = [] } = {}){
  return SECTION_PERMISSIONS
    .map(p => p.id)
    .filter(id => canAccessSection(id, { isAdminUser, permissions }));
}

/** Convenience: given a staff doc with a `permissions` array, return
    the set of allowed section ids. Super Admin passes isAdminUser=true. */
export function getPermittedSectionsFromStaff(staffDoc, isAdminUser = false){
  return getPermittedSections({ isAdminUser, permissions: staffDoc?.permissions });
}

/** General permission check for individual actions (not just whole
    sections) — e.g. "may this staff member delete a review?" Both the
    frontend and the rules use the same id vocabulary. */
export function hasPermission(permissionId, { isAdminUser = false, permissions = [] } = {}){
  if(isAdminUser) return true;
  return Array.isArray(permissions) && permissions.includes(permissionId);
}

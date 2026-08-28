import { getActiveZones, onDeliveryZonesChanged } from './delivery-zones-data.js';
import { formatNaira, escapeHtml } from './utils.js';

/* PHASE 4 (Delivery Zone checkout redesign). The "Searchable dropdown"
   the brief asks for, factored out into its own module because it has
   TWO independent call sites that each need their own instance/state:
   checkout's delivery step (js/ui.js) and the account view's saved-
   address form (js/auth-ui.js). Rather than a singleton, this is a
   factory — createZoneSearchField() — so each caller gets its own
   selection state, the same "each concern owns its own lifecycle"
   reasoning already used elsewhere in this app for anything that could
   have more than one instance on screen.

   Interaction pattern deliberately mirrors js/menu-render.js's existing
   search-suggestions dropdown (same mousedown-before-blur trick so a
   click registers before the input's blur handler would otherwise hide
   the list first, same Escape-to-close, same "close on outside click"
   wiring) rather than inventing a second dropdown pattern — it reuses
   that feature's `.search-suggestions`/`.search-suggestion` CSS
   classes as-is. */
export function createZoneSearchField({ inputId, suggestionsId, onSelect }){
  let selectedZoneId = null;
  let selectedZoneName = '';

  const input = () => document.getElementById(inputId);
  const dropdown = () => document.getElementById(suggestionsId);

  function renderSuggestions(){
    const inp = input(); const drop = dropdown();
    if(!inp || !drop) return;
    if(document.activeElement !== inp){ drop.hidden = true; drop.innerHTML = ''; return; }
    const query = inp.value.trim().toLowerCase();
    const zones = getActiveZones().filter(z =>
      !query || z.name.toLowerCase().includes(query) || (z.area || '').toLowerCase().includes(query)
    );
    if(!zones.length){ drop.hidden = true; drop.innerHTML = ''; return; }
    drop.hidden = false;
    drop.innerHTML = zones.map(z =>
      `<button type="button" class="search-suggestion" data-zone-id="${escapeHtml(z.id)}">` +
        `<span class="search-suggestion__icon">📍</span>` +
        `<span class="search-suggestion__name">${escapeHtml(z.name)}${z.area ? ' — ' + escapeHtml(z.area) : ''}</span>` +
        `<span class="search-suggestion__cat">${formatNaira(z.fee || 0)}</span>` +
      `</button>`
    ).join('');
    drop.querySelectorAll('[data-zone-id]').forEach(btn => {
      // mousedown (not click) fires before the input's blur — otherwise
      // blur would hide the dropdown a beat before the click registers.
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        const zone = zones.find(z => z.id === btn.dataset.zoneId);
        if(zone) select(zone);
        input()?.blur();
      });
    });
  }

  function select(zone){
    selectedZoneId = zone.id;
    selectedZoneName = zone.name;
    const inp = input();
    if(inp) inp.value = zone.name;
    const drop = dropdown();
    if(drop){ drop.hidden = true; drop.innerHTML = ''; }
    onSelect?.(zone);
  }

  function clear(){
    selectedZoneId = null;
    selectedZoneName = '';
    const inp = input();
    if(inp) inp.value = '';
  }

  /** Programmatically sets the field's value — used when prefilling
      from a saved address (js/ui.js's renderSavedAddressPicker,
      js/auth-ui.js's populateAddressFormForEdit). Accepts a zone that
      may no longer exist (e.g. an old saved address referencing a zone
      staff later deleted) — still shows its saved name, but leaves
      selectedZoneId set to it as-is; the caller re-validates against
      getActiveZones() at submit time regardless. */
  function setSelected(zoneId, zoneName){
    selectedZoneId = zoneId || null;
    selectedZoneName = zoneName || '';
    const inp = input();
    if(inp) inp.value = selectedZoneName;
  }

  function wire(){
    const inp = input();
    if(!inp || inp.dataset.zoneWired) return;
    inp.dataset.zoneWired = '1';
    inp.addEventListener('input', () => {
      // Editing the text away from the confirmed selection un-selects
      // it — a stale zone id must never survive the customer typing
      // something that no longer matches that zone's name.
      if(selectedZoneId && inp.value !== selectedZoneName){ selectedZoneId = null; selectedZoneName = ''; }
      renderSuggestions();
    });
    inp.addEventListener('focus', renderSuggestions);
    inp.addEventListener('blur', () => setTimeout(renderSuggestions, 0));
    inp.addEventListener('keydown', e => {
      if(e.key === 'Escape'){ e.stopPropagation(); inp.blur(); }
    });
    document.addEventListener('click', e => {
      if(!e.target.closest(`#${inputId}, #${suggestionsId}`)) renderSuggestions();
    });
    onDeliveryZonesChanged(renderSuggestions);
  }

  wire();

  return {
    getSelectedZoneId: () => selectedZoneId,
    getSelectedZoneName: () => selectedZoneName,
    setSelected,
    clear
  };
}

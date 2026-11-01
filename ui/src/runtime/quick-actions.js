import { text } from '../bridge/hud';
export function readPins(g) {
  return (g.SceneCtx?.getActionBarSlots() || [null,null,null,null]).map(token => {
    let label = '·';
    if (token) {
      const [kind, skill, action] = token.split('|');
      label = kind === 'hub' ? g.SceneApp?.getQuickBarPinLabel(skill, action) || action : skill === 'rest_toggle' ? text(g,'action.bar.pin.rest') : skill === 'drink_flask' ? text(g,'flask.action.drink') : skill;
    }
    return { token, label, title: (token ? label : text(g,'action.bar.pin.empty_title')) + ' · ' + text(g,'action.bar.pin.right_clear') };
  });
}
const yes = v => v === true || v === 1 || ['1','true'].includes(String(v).trim().toLowerCase());
export function readBelt(g, ready) {
  const IE = g.InventoryEquipment;
  let available = false;
  try { available = ready && !!IE && g.SceneCtx.shouldShowLeftHudBlock('quick_belt'); } catch {}
  const model = { available, label: text(g,'quick.belt.dock'), slots: [] };
  if (!available) return model;
  const character = IE.getCharacterForDisplay(), pocket = IE.getPocketArray(), vest = IE.getVestArray();
  let slot = 0;
  for (const [source, arr] of [['pocket', pocket], ['vest', vest]]) {
    if (source === 'vest' && pocket.length && vest.length) model.slots.push({ separator: true });
    arr.forEach((it, index) => {
      const item = { source, index, digit: slot < 9 ? ++slot : (slot++, null), filled: !!it?.item_id, name: '', short: '—', actions: [], identity: it?.instance_id || it?.item_id || '' };
      if (it?.item_id) {
        const tpl = IE.getItemTemplate(it.item_id), tier = IE.getItemDisplayTier(it.item_id, character);
        item.name = tpl ? IE.getDisplayName(tpl, tier, character) : it.item_id;
        if ((it.sewing || it.sewing_parts) && g.SewingSystem) item.name = g.SewingSystem.itemName(it);
        item.short = item.name.slice(0, 2);
        if (tpl && ((yes(tpl.edible) && String(tpl.edible_buff_id || '').trim()) || (yes(tpl.usable) && String(tpl.use_buff_id || '').trim()) || (tpl.use_effect && typeof tpl.use_effect === 'object'))) item.actions.push({ id:'use', label:text(g,'inv.use') });
        if (tpl?.equip_slot) item.actions.push({ id:'equip', label:text(g,'inv.equip') });
        item.actions.push({ id:'drop', label:text(g,'inv.drop') });
      }
      model.slots.push(item);
    });
  }
  return model;
}
export function beltActions(g) {
  function current(item) {
    const IE = g.InventoryEquipment, arr = item.source === 'pocket' ? IE.getPocketArray() : IE.getVestArray(), value = arr[item.index];
    return value && (value.instance_id || value.item_id) === item.identity ? value : null;
  }
  return {
    hideTooltip: () => g.SceneUi.hideItemTooltip(),
    tooltip(item, el) {
      const inst = current(item); if (!inst) return;
      const IE = g.InventoryEquipment;
      g.SceneUi.showTemplateTooltip(inst.item_id, IE.getItemTemplate(inst.item_id), inst, IE.getCharacterForDisplay(), el);
    },
    execute(id, item) {
      if (!current(item) || g.SceneApp.isStoryMovementLocked() || g.SceneApp.isPreCreationGameplayRestricted()) return;
      if (id === 'use') g.SceneApp.tryUseItemFromContainer(item.source, item.index);
      else if (id === 'equip') g.SceneApp.tryEquipItemFromContainer(item.source, item.index);
      else if (id === 'drop') { const p = g.SceneCtx.E.getState(); g.InventoryEquipment.dropItemToGround(item.source, item.index, p.mapId, p.x, p.y); g.SceneRenderer.render(); }
    },
    position(el, menu) {
      const a = el.getBoundingClientRect(), r = menu.getBoundingClientRect(), tip = g.document.getElementById('svelte-item-tooltip'), tr = tip?.classList.contains('show') ? tip.getBoundingClientRect() : null;
      const w = r.width || 88, h = r.height || 36, pad = 12, gap = 10, vw = g.innerWidth;
      let left = a.right + gap;
      if (tr) {
        const tw = tr.width || 220, right = tr.left >= a.right, opposite = right ? a.left - w - gap : a.right + gap;
        if (opposite >= pad && opposite + w <= vw - pad) left = opposite;
        else if (right) { left = Math.max(pad,a.right+gap); if (left+w+gap+tw <= vw-pad) tip.style.left = (left+w+gap)+'px'; }
        else { left = Math.min(vw-w-pad,a.left-w-gap); if (left-gap-tw >= pad) tip.style.left = (left-gap-tw)+'px'; }
      } else if (left+w > vw-pad) left = a.left-w-gap;
      return { left: Math.max(pad,Math.min(left,vw-w-pad)), top: Math.max(pad,Math.min(a.top,g.innerHeight-h-pad)) };
    },
  };
}

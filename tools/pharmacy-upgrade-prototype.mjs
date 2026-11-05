// UI question: choose between A (split workbench), B (centred operation), C (expandable inventory).
// Prototype only: shared facility construction in isolated game storage; medicine stacks stay in memory.
const g = window;
if (!g.__PHARMACY_UPGRADE_MEMORY__) throw Error('This prototype requires isolated storage');
const root = new URL('../', import.meta.url);
const [rules, items] = await Promise.all(['data/innate-medicines.json', 'data/items.json'].map(async file => (await fetch(new URL(file, root))).json()));
await g.__PHARMACY_UPGRADE_READY__;
g.DialogueUI.close();
g.SceneApp.openCharacterCreationAfterIntro();
await new Promise(resolve => setTimeout(resolve, 50));
if (!g.SceneApp.creation.confirm({ name: '制药试玩', height: 178, gender: 'male', hand: 'right', leg: 'right' })) throw Error('Prototype character creation failed');
await new Promise(resolve => setTimeout(resolve, 50));
g.DialogueUI.close();
g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired', true);
// The preview character already knows injections; production discovery remains unchanged.
g.NPCSystem.setDemoFlag('pharmacy_injection_unlocked', true);
g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 14);
g.SceneApp.render();
document.title = '制药台升级 · 试玩';

const variants = { A: '双栏', B: '居中', C: '清单' };
const attributes = { jingu: '筋骨', flexibility: '柔韧', breath: '呼吸', dexterity: '身手', focus: '专注' };
const familyIds = Object.keys(rules.families);
const params = new URLSearchParams(location.search);
const state = { variant: variants[params.get('variant')] ? params.get('variant') : 'A', family: familyIds[0], tier: 0, quantity: 25, level: 50, stock: {}, records: [], result: null, open: true, history: false, materialPreset: 'ready' };
const idFor = (family = state.family, tier = state.tier) => `potion_innate_${family}_${rules.tiers[tier].id}`;
const source = () => items[idFor()];
const next = () => items[source().innate_medicine_profile.upgrade.next_item_id];
const stock = id => (state.stock[id] || []).reduce((sum, count) => sum + count, 0);
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = () => g.ItemIcons.forItem(source());
// Register only in this isolated page; use the production panel and settlement without copying them.
const stationCosts = { wood: 8, metal: 8, parts: 4 };
const stationProjectId = 'pharmacy_upgrade_prototype';
const stationSpec = g.FacilityUnlockConfig.projects[stationProjectId] = {
  id: stationProjectId, title: '升级制药台', groups: g.FacilityUnlockConfig.makeGroups(stationCosts),
  position: [...g.FacilityUnlockConfig.projects.pharmacy.position],
  requires: 'npc_station_pharmacy_base_repaired', unlock: 'facility_ready:' + stationProjectId
};
const stationProject = g.FacilityUnlock.get(stationProjectId);
const stationReady = () => Number(!!stationProject.isComplete()) >= rules.upgrade_rule.required_station_upgrades;
const materialPresets = {
  ready: { name: '材料齐备', items: { wood_plank_soft: 4, ore_scrap_metal: 8, mechanical_parts: 2 } },
  unrepaired: { name: '未修复', items: { ore_clay_raw: 5, wood_plank_soft: 4, ore_scrap_metal: 4, mechanical_parts: 1 } },
  missing: { name: '缺少机件', items: { wood_plank_soft: 4, ore_scrap_metal: 8 } },
  alternative: { name: '替代材料', items: { wood_bamboo_green: 8, ore_cast_iron: 4, mechanical_parts: 2 } }
};
const stationInventory = structuredClone(g.InventoryEquipment.getState());
stationInventory.equipment.backpack = g.BackpackSystem.generate('eq_backpack_frame_hauler', []);
stationInventory.skills.survival_language = { level: 10, move_usage: {}, study_exp: 0 };
stationInventory.inventory_pocket = []; stationInventory.inventory_vest = [];
stationInventory.inventory_vehicle = []; stationInventory.bound_vehicle_id = null; stationInventory.ground_items = {};
function resetStation() {
  if (g.FacilityUnlockPanel.isOpen()) g.FacilityUnlockPanel.close();
  g.FacilityUnlock.get('pharmacy').reset();
  g.NPCSystem.setDemoFlag('npc_station_pharmacy_base_repaired', state.materialPreset !== 'unrepaired');
  stationProject.reset(); g.NPCSystem.setDemoFlag(stationSpec.unlock, false);
  for (const [id, group] of g.FacilityUnlockConfig.materials) if (group in stationCosts) g.NPCSystem.setDemoFlag('repair_material_used:' + id, false);
  const inventory = structuredClone(stationInventory);
  inventory.inventory_backpack = Object.entries(materialPresets[state.materialPreset].items).flatMap(([item_id, count]) => Array.from({ length: count }, () => ({ item_id, count: 1 })));
  inventory.inventory_backpack.push({ item_id: 'solvent_water_pure', count: 3 }, { item_id: 'med_antler_powder', count: 3 });
  g.InventoryEquipment.setState(inventory);
  g.SceneHud?.refresh('status');
  state.open = true;
}
resetStation();
async function openStationEntry() {
  g.PharmacyStationPanel.close();
  g.NPCSystem.menu.close();
  await g.NPCSystem.openMenu('npc.station.pharmacy_base');
  render();
}
function chance(quantity = state.quantity) {
  const p = source().innate_medicine_profile.upgrade.probability;
  return Math.min(p.cap, (quantity / p.denominator) ** p.exponent * (1 + Math.max(0, Math.min(p.skill_multiplier.max_level, state.level)) * p.skill_multiplier.bonus_per_level));
}
const percent = value => value === 1 ? '100%' : (value * 100).toFixed(value >= 0.9995 ? 3 : 1) + '%';
function resetStock() {
  for (const family of familyIds) rules.tiers.forEach((_, tier) => { state.stock[idFor(family, tier)] = tier === 0 ? [100, 100, 100, 100, 100] : tier < 3 ? [100] : []; });
  state.records = []; state.result = null;
}
resetStock();

const host = document.createElement('div');
host.id = 'pharmacy-upgrade-prototype';
host.innerHTML = '<nav class="pu-switcher" aria-label="试玩控制"></nav>';
document.body.append(host);
const modal = document.getElementById('modal-pharmacy-station');
host.prepend(modal);
const panel = document.createElement('section'), controls = host.querySelector('.pu-switcher');
panel.className = 'pu-panel'; panel.hidden = true; panel.setAttribute('aria-label', '强化药品');
modal.querySelector('.cs-panel').append(panel);
const iconBox = () => `<span class="pu-icon" aria-hidden="true">${icon()}</span>`;
function familyList(horizontal = false) {
  return `<div class="pu-families ${horizontal ? 'horizontal' : ''}" aria-label="药品种类">${familyIds.map(family => `<button data-family="${family}" aria-pressed="${family === state.family}" class="${family === state.family ? 'selected' : ''}">${iconBox()}<span><strong>${escape(rules.families[family].name)}</strong><small>先天${attributes[family]}</small></span></button>`).join('')}</div>`;
}
function tiers() {
  return `<div class="pu-tiers" aria-label="药品版本">${rules.tiers.map((tier, index) => `<button data-tier="${index}" aria-pressed="${index === state.tier}" class="${index === state.tier ? 'selected' : ''}"><span>${escape(tier.prefix)}</span><small>库存 <b>${stock(idFor(state.family, index))}</b></small></button>`).join('')}</div>`;
}
function material(item, output = false) {
  return `<div class="pu-material ${output ? 'output' : ''}"><span class="pu-caption">${output ? '成功产出' : '本次投料'}</span>${iconBox()}<strong>${escape(item.name)}</strong><div><b ${output ? '' : 'data-quantity-text'}>${output ? '+1' : '−' + state.quantity}</b><small>库存 ${stock(item.item_id)}</small></div></div>`;
}
function flow() {
  return `<div class="pu-flow">${material(source())}<span class="pu-arrow" aria-hidden="true">→</span>${material(next(), true)}</div>`;
}
function quantities() {
  const max = rules.upgrade_rule.max_inputs;
  return `<div class="pu-quantity"><div class="pu-quantity-heading"><label for="pu-quantity-number">投料数量</label><div class="pu-stepper"><button data-step="-1" aria-label="减少投料">−</button><input id="pu-quantity-number" data-quantity type="number" min="1" max="${max}" step="1" value="${state.quantity}" aria-label="投料数量"><button data-step="1" aria-label="增加投料">＋</button></div></div><input data-quantity type="range" min="1" max="${max}" step="1" value="${state.quantity}" aria-label="投料滑块"></div>`;
}
function actions() {
  return `<div class="pu-actions"><div class="pu-odds"><span>升级成功率</span><strong data-chance>${percent(chance())}</strong><div class="pu-meter"><i data-meter style="width:${chance() * 100}%"></i></div></div><div class="pu-action-buttons"><button data-upgrade="10" class="pu-secondary">连试 10 次</button><button data-upgrade="1" class="pu-primary">升级一次</button></div></div>`;
}
function result() {
  const r = state.result;
  if (!r) return '<div class="pu-result-slot" aria-live="polite"></div>';
  return `<div class="pu-result-slot" aria-live="polite"><div class="pu-result ${r.successes ? 'success' : 'failure'}"><span class="pu-result-symbol" aria-hidden="true">${r.successes ? '✓' : '×'}</span><div><strong>${r.attempts === 1 ? (r.successes ? '升级成功' : '升级失败') : `成功 ${r.successes} / ${r.attempts}`}</strong><span>${escape(items[r.sourceId].name)} −${r.spent}</span><span>${escape(items[r.outputId].name)} +${r.successes}</span></div><button data-dismiss aria-label="关闭升级结果">×</button></div></div>`;
}
function history() {
  return `<details class="pu-history" ${state.history ? 'open' : ''}><summary>升级记录 <b>${state.records.length}</b></summary><div>${state.records.length ? state.records.map(r => `<div class="pu-record"><span>${escape(items[r.sourceId].name)}</span><span>−${r.spent}</span><span class="${r.successes ? 'pu-good' : ''}">${r.successes} / ${r.attempts}</span><span>${percent(r.probability)}</span></div>`).join('') : '<span class="pu-empty">暂无记录</span>'}</div></details>`;
}
function highest() {
  return `<div class="pu-highest">${iconBox()}<strong>${escape(source().name)}</strong><span>库存 ${stock(source().item_id)}</span><b>已达最高版本</b></div>`;
}
function VariantA() {
  return `<div class="pu-layout-a"><aside class="pu-library"><h3>药品</h3>${familyList()}</aside><div class="pu-workbench">${tiers()}${next() ? flow() + quantities() + actions() : highest()}${result()}${history()}</div></div>`;
}
function VariantB() {
  return `<div class="pu-layout-b">${familyList(true)}<div class="pu-centred"><div class="pu-version-select"><label for="pu-version">升级版本</label><select id="pu-version" data-version>${rules.tiers.map((tier, index) => `<option value="${index}" ${index === state.tier ? 'selected' : ''}>${escape(tier.prefix)} · ${stock(idFor(state.family, index))}</option>`).join('')}</select></div>${next() ? flow() + quantities() + actions() : highest()}${result()}</div>${tiers()}${history()}</div>`;
}
function VariantC() {
  return `<div class="pu-layout-c">${familyList(true)}<div class="pu-inventory-head"><span>药品版本</span><span>库存</span><span>操作</span></div><div class="pu-inventory-list">${rules.tiers.map((tier, index) => `<div class="pu-inventory-entry ${index === state.tier ? 'selected' : ''}"><button data-tier="${index}" aria-expanded="${index === state.tier}" class="pu-inventory-row"><span>${iconBox()}${escape(tier.prefix + rules.families[state.family].name)}</span><b>${stock(idFor(state.family, index))}</b><span>${index === 3 ? '最高版本' : index === state.tier ? '已选择' : '选择'}</span></button>${index === state.tier ? `<div class="pu-inline-work">${next() ? `<div class="pu-inline-output"><span>成功产出</span><strong>${escape(next().name)}</strong><b>+1</b></div>${quantities()}${actions()}` : highest()}</div>` : ''}</div>`).join('')}</div>${result()}${history()}</div>`;
}
function render() {
  state.open = g.PharmacyStationPanel.isOpen();
  panel.dataset.variant = state.variant;
  panel.hidden = !stationReady() || g.PharmacyStationPanel.getMode() !== 'enhance';
  panel.innerHTML = stationReady() ? `<div class="pu-enhance-toolbar"><span class="pu-level">制药 <strong>${state.level}</strong> 级</span></div><div class="pu-content">${({ A: VariantA, B: VariantB, C: VariantC })[state.variant]()}</div>` : '';
  controls.innerHTML = `<span class="pu-demo-badge">试玩</span><div class="pu-variant-control"><button data-cycle="-1" aria-label="上一个布局">←</button><strong>${state.variant} · ${variants[state.variant]}</strong><button data-cycle="1" aria-label="下一个布局">→</button></div><label>制药等级 <input data-level type="number" min="0" max="100" step="1" value="${state.level}" aria-label="试玩制药等级"></label><div class="pu-level-presets">${[0, 50, 100].map(level => `<button data-level-preset="${level}" class="${level === state.level ? 'selected' : ''}">${level}</button>`).join('')}</div><select data-material-preset aria-label="试玩升级材料" ${stationReady() ? 'disabled' : ''}>${Object.entries(materialPresets).map(([id, preset]) => `<option value="${id}" ${id === state.materialPreset ? 'selected' : ''}>${preset.name}</option>`).join('')}</select><button data-reset-station>重置制药台</button><button data-reset>重置药品</button>${state.open ? '' : '<button data-open>点击制药台</button>'}`;
  panel.querySelector('.pu-history')?.addEventListener('toggle', event => { state.history = event.target.open; });
  updateAmounts();
  controls.hidden = g.FacilityUnlockPanel.isOpen();
}
function validQuantity() { return Number.isInteger(state.quantity) && state.quantity >= rules.upgrade_rule.min_inputs && state.quantity <= rules.upgrade_rule.max_inputs; }
function updateAmounts() {
  const valid = validQuantity(), p = valid && next() ? chance() : 0;
  host.querySelectorAll('[data-quantity-text]').forEach(el => { el.textContent = valid ? '−' + state.quantity : '—'; });
  host.querySelectorAll('[data-chance]').forEach(el => { el.textContent = valid ? percent(p) : '—'; });
  host.querySelectorAll('[data-meter]').forEach(el => { el.style.width = p * 100 + '%'; });
  host.querySelectorAll('[data-quantity]').forEach(el => { if (el !== document.activeElement) el.value = state.quantity ?? ''; });
  host.querySelectorAll('[data-step]').forEach(el => { el.disabled = !valid || (Number(el.dataset.step) < 0 ? state.quantity <= 1 : state.quantity >= rules.upgrade_rule.max_inputs); });
  host.querySelectorAll('[data-upgrade]').forEach(el => {
    const attempts = Number(el.dataset.upgrade), enough = valid && stock(source().item_id) >= state.quantity * attempts;
    el.disabled = !stationReady() || !next() || !enough;
    if (attempts === 1) el.textContent = !valid ? '输入数量' : enough ? '升级一次' : '数量不足';
  });
}
function consume(id, count) {
  for (let i = 0; i < state.stock[id].length && count; i++) { const take = Math.min(state.stock[id][i], count); state.stock[id][i] -= take; count -= take; }
  state.stock[id] = state.stock[id].filter(Boolean);
}
function receive(id, count) {
  const limit = items[id].stack_limit, stacks = state.stock[id];
  while (count > 0) { let index = stacks.findIndex(n => n < limit); if (index < 0) { index = stacks.length; stacks.push(0); } const add = Math.min(limit - stacks[index], count); stacks[index] += add; count -= add; }
}
function upgrade(attempts) {
  if (!stationReady() || !next() || !validQuantity() || ![1, 10].includes(attempts) || stock(source().item_id) < state.quantity * attempts) return;
  const r = { sourceId: source().item_id, outputId: next().item_id, attempts, successes: 0, spent: state.quantity * attempts, probability: chance() };
  for (let i = 0; i < attempts; i++) if (r.probability === 1 || Math.random() < r.probability) r.successes++;
  consume(r.sourceId, r.spent); receive(r.outputId, r.successes);
  state.result = r; state.records.unshift(r); state.records.length = Math.min(state.records.length, 20);
  render();
  panel.querySelector('.pu-result').scrollIntoView({ block: 'nearest' });
}
function cycle(direction) {
  const keys = Object.keys(variants);
  state.variant = keys[(keys.indexOf(state.variant) + direction + keys.length) % keys.length];
  const url = new URL(location.href); url.searchParams.set('variant', state.variant); g.history.replaceState(null, '', url);
  render();
}
function setQuantity(value) {
  const n = Number(value);
  state.quantity = value !== '' && Number.isInteger(n) ? Math.max(1, Math.min(rules.upgrade_rule.max_inputs, n)) : null;
  const input = host.querySelector('#pu-quantity-number');
  if (input && state.quantity !== null && n !== state.quantity) input.value = state.quantity;
  updateAmounts();
}
host.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (!button.closest('.pu-panel,.pu-switcher')) return;
  const d = button.dataset;
  if ('family' in d) { state.family = d.family; render(); }
  else if ('tier' in d) { state.tier = Number(d.tier); render(); }
  else if ('step' in d) setQuantity(state.quantity + Number(d.step));
  else if ('upgrade' in d) upgrade(Number(d.upgrade));
  else if ('cycle' in d) cycle(Number(d.cycle));
  else if ('levelPreset' in d) { state.level = Number(d.levelPreset); render(); }
  else if ('reset' in d) { resetStock(); render(); }
  else if ('resetStation' in d) { resetStation(); openStationEntry(); }
  else if ('dismiss' in d) { state.result = null; render(); }
  else if ('open' in d) openStationEntry();
});
host.addEventListener('input', event => { if ('quantity' in event.target.dataset) setQuantity(event.target.value); });
host.addEventListener('change', event => {
  if ('materialPreset' in event.target.dataset && !stationReady() && materialPresets[event.target.value]) { state.materialPreset = event.target.value; resetStation(); openStationEntry(); }
  if ('level' in event.target.dataset) { state.level = Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))); render(); }
  if ('version' in event.target.dataset) { state.tier = Number(event.target.value); render(); }
});
document.addEventListener('click', () => queueMicrotask(() => { controls.hidden = g.FacilityUnlockPanel.isOpen(); }), true);
document.addEventListener('keydown', event => {
  if (g.FacilityUnlockPanel.isOpen() || g.NPCSystem.isMenuOpen()) {
    queueMicrotask(() => { controls.hidden = g.FacilityUnlockPanel.isOpen(); });
    return;
  }
  if (g.PharmacyStationPanel.isOpen() && g.PharmacyStationPanel.getMode() !== 'enhance') return;
  if (!state.open && !host.contains(event.target)) return;
  event.stopImmediatePropagation();
  if (event.key === 'Escape') { event.preventDefault(); g.PharmacyStationPanel.close(); render(); return; }
  if (event.key === 'Tab' && state.open) {
    const focusable = [...host.querySelectorAll('button:not(:disabled),input,select,summary')].filter(el => el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!host.contains(event.target) || event.target === panel || (event.shiftKey && event.target === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
}, true);
panel.tabIndex = -1;
g.PharmacyStationPanel.setEnhancementView({ stationProjectId, isUnlocked: stationReady, render, hide: () => { panel.hidden = true; } });
new MutationObserver(render).observe(modal, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
await openStationEntry();

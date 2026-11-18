import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { boot } from './ui-game-fixture.mjs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const settle = () => new Promise(setImmediate);

test('independent NPC checks use real survival buffs, default on, and never alter survival state', async () => {
  const settings = [undefined, {}, { thirst: false }, { dirtyness: false },
    { thirst: false, dirtyness: false }, { thirst: true, dirtyness: true },
    { thirst: 'false', dirtyness: 0 }];
  const defs = settings.map((checks, i) => ({ id: 'test.npc.' + i, name: '测试对象',
    mainMenu: { showChat: false, showLeave: true }, interactionChecks: checks }));
  const registry = { npcs: Object.fromEntries(defs.map(d => [d.id, { def: d.id }])) };
  const storage = new Map();
  const c = vm.createContext({ console, localStorage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
  }, fetch: async path => ({ ok: true, json: async () =>
    path === 'data/npc/npc_registry.json' ? registry : defs.find(d => d.id === path) || json(path) }) });
  c.window = c;
  for (const name of ['game-time', 'buff-system', 'food-metabolism', 'survival', 'npc-system'])
    vm.runInContext(read('js/' + name + '.js'), c, { filename: name + '.js' });
  c.Survival.setConfig(json('data/survival-config.json'));
  c.BuffSystem.init();
  await settle();
  let view, blocked = false;
  c.NPCSystem.menu.attachView(v => { view = v; });
  c.SceneApp = { guardPlayerActionBlocked: () => blocked };
  for (const def of defs) for (const state of [
    { thirst: 0, dirtyness: 0 }, { thirst: 100, dirtyness: 91 },
    { thirst: 0, dirtyness: 100 }, { thirst: 0.1, dirtyness: 90 }
  ]) {
    c.NPCSystem.menu.close();
    c.Survival.setState(state);
    assert.equal(c.BuffSystem.hasBuffByBuffId('player', 'survival_thirst_dehydrated_zero'), state.thirst === 0);
    assert.equal(c.BuffSystem.hasBuffByBuffId('player', 'survival_dirty_messy'), state.dirtyness >= 91);
    const before = JSON.stringify(c.Survival.getState());
    await c.NPCSystem.openMenu(def.id);
    const checks = def.interactionChecks || {};
    const denied = (state.thirst === 0 && checks.thirst !== false) ||
      (state.dirtyness >= 91 && checks.dirtyness !== false);
    assert.equal(view.open, !denied, JSON.stringify({ checks, state }));
    assert.equal(JSON.stringify(c.Survival.getState()), before, 'opening never clears debuffs or changes reserves');
  }
  c.NPCSystem.menu.close();
  c.Survival.setState({ thirst: 0, dirtyness: 100 });
  blocked = true;
  await c.NPCSystem.openMenu(defs[4].id);
  assert.equal(view.open, false, 'other action guards still block exempt facilities');
  blocked = false;
  c.Survival.setState({ thirst: 0, dirtyness: 91 });
  await c.NPCSystem.openMenu(defs[0].id);
  assert.equal(view.open, false);
  c.Survival.addThirst(1);
  c.Survival.reduceDirtyness(1);
  await c.NPCSystem.openMenu(defs[0].id);
  assert.equal(view.open, true, 'drinking and cleaning immediately restore ordinary NPC access');
  c.NPCSystem.menu.close();
  c.Survival.setState({ thirst: 0, dirtyness: 0 });
  assert.equal(c.Survival.ingestFood('food_fish_soup_clear', json('data/food-balance.json').foods.food_fish_soup_clear), true);
  await c.NPCSystem.openMenu(defs[0].id);
  assert.equal(view.open, true, 'food water also clears the interaction block immediately');
});

test('real scene entry opens exempt facilities even at exhaustion, blocks ordinary NPCs, and retains the stun guard', async () => {
  const h = await boot(true), g = h.g;
  try {
    g.DialogueUI.close();
    g.SceneApp.openCharacterCreationAfterIntro();
    await h.drain();
    const input = g.document.getElementById('creation-name');
    input.value = '交互测试'; input.dispatchEvent(new g.Event('input', { bubbles: true }));
    await h.drain();
    g.document.getElementById('btn-confirm-creation').click();
    await h.drain(); g.DialogueUI.close();
    assert.equal(g.SceneApp.isPreCreationGameplayRestricted(), false);
    const defs = Object.values(json('data/npc/npc_registry.json').npcs).map(row => json(row.def));
    const facilities = defs.filter(d => d.id.startsWith('npc.station.'));
    assert.ok(facilities.length >= 11);
    for (const def of facilities) {
      assert.deepEqual(def.interactionChecks, { thirst: false, dirtyness: false }, def.id);
      g.GameEngine.setState(def.location.sceneId, def.location.x, def.location.y + 1);
      // The pharmacy is on the bottom edge; its southern neighbour is outside the map.
      if (def.id === 'npc.station.pharmacy_base') g.GameEngine.setState(def.location.sceneId, 13, 14);
      if (def.id === 'npc.station.agriculture_base') {
        g.NPCSystem.setDemoFlag('facility_restored:agriculture', true);
        g.GameEngine.setState(def.location.sceneId, 5, 10);
      }
      if(def.gymStation){
        const {x,y}=def.location,[w,h]=def.gymStation.footprint,candidates=[];
        for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)for(const [ax,ay] of [[1,0],[-1,0],[0,1],[0,-1]])candidates.push({x:x+dx+ax,y:y+dy+ay});
        const p=candidates.find(p=>g.GameEngine.isWalkable(p.x,p.y));assert.ok(p,def.id+' accessible');g.GameEngine.setState(def.location.sceneId,p.x,p.y);
      }
      g.Survival.setState({ thirst: 0, dirtyness: 100 });
      g.SceneCtx.actions.interactNpc(def.id);
      await h.drain();
      if (def.id === 'npc.station.manufacturing_base') {
        assert.equal(g.ManufacturingPanel.isOpen(), true, def.id);
        g.ManufacturingPanel.close();
        continue;
      }
      if (def.id === 'npc.station.agriculture_base') {
        assert.equal(g.document.querySelector('#modal-agriculture').getAttribute('aria-hidden'), 'false', def.id);
        g.AgricultureActions.closeAgriculturePanel();
        continue;
      }
      assert.equal(g.NPCSystem.isMenuOpen(), true, def.id);
      g.NPCSystem.menu.close();
    }
    for (const id of ['npc.supervisor.manager', 'npc.checkpoint.ruins']) {
      for (const state of [{ thirst: 0, dirtyness: 0 }, { thirst: 100, dirtyness: 91 }]) {
        g.Survival.setState(state);
        await g.NPCSystem.openMenu(id);
        await h.drain();
        assert.equal(g.NPCSystem.isMenuOpen(), false, id + ' ' + JSON.stringify(state));
      }
    }
    const bed = facilities.find(def => def.id === 'npc.station.bed_base').location;
    g.GameEngine.setState(bed.sceneId, bed.x, bed.y - 1);
    g.Survival.setState({ thirst: 0, dirtyness: 100, stamina: 0, fatigue: 100 });
    g.SceneCtx.actions.interactNpc('npc.station.bed_base'); await h.drain();
    assert.equal(g.NPCSystem.isMenuOpen(), true, 'the exhausted player can still interact with the bed');
    g.NPCSystem.menu.close();
    const stun = g.InventoryEquipment.consumePlayerStunRoundIfBlocking;
    g.InventoryEquipment.consumePlayerStunRoundIfBlocking = () => true;
    try {
      g.SceneCtx.actions.interactNpc('npc.station.bed_base'); await h.drain();
      assert.equal(g.NPCSystem.isMenuOpen(), false, 'stun guard still runs');
    } finally { g.InventoryEquipment.consumePlayerStunRoundIfBlocking = stun; }
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('NPC editor keeps defaults and independent checkboxes across import and export', async () => {
  const errors = [], downloads = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e)));
  const dom = new JSDOM(read('tools/npc-editor.html'), {
    url: 'https://npc-editor-test.invalid/', runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(g) {
      g.fetch = async () => ({ ok: false, status: 404 });
      g.confirm = () => true;
      g.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test'; };
      g.URL.revokeObjectURL = () => {};
      g.HTMLAnchorElement.prototype.click = function () {};
    }
  });
  const g = dom.window, d = g.document;
  const checkbox = name => d.getElementById('npc-check-' + name);
  const fileText = file => new Promise((resolve, reject) => {
    const reader = new g.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(file);
  });
  async function load(def) {
    const input = d.getElementById('file-import-npc');
    const file = new g.File([JSON.stringify(def)], 'npc.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new g.Event('change'));
    for (let i = 0; i < 20 && d.getElementById('npc-id')?.value !== def.id; i++)
      await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(d.getElementById('npc-id').value, def.id);
  }
  try {
    d.getElementById('btn-new-npc').click();
    assert.equal(checkbox('thirst').checked, true);
    assert.equal(checkbox('dirtyness').checked, true);
    await load({ id: 'npc.test.old', mainMenu: { showChat: false, showLeave: true } });
    assert.equal(checkbox('thirst').checked, true);
    assert.equal(checkbox('dirtyness').checked, true);
    await load({ id: 'npc.test.water', interactionChecks: { thirst: false } });
    assert.equal(checkbox('thirst').checked, false);
    assert.equal(checkbox('dirtyness').checked, true);
    checkbox('thirst').click(); checkbox('dirtyness').click();
    d.getElementById('btn-export-npc').click();
    assert.equal(downloads.length, 1);
    const exported = JSON.parse(await fileText(downloads[0]));
    assert.deepEqual(exported.interactionChecks, { thirst: true, dirtyness: false });
    await load({ ...exported, id: 'npc.test.roundtrip' });
    assert.equal(checkbox('thirst').checked, true);
    assert.equal(checkbox('dirtyness').checked, false);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

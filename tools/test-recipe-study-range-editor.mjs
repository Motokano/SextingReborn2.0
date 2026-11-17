import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createEditorServer, projectRoot, readSnapshot, saveRange, createRange } from './recipe-study-range-server.mjs';
import { mountEditor } from './recipe-study-range-editor.mjs';

const files = ['data/dungeon-config.json', 'docs/design/examples/manufacturing-system-v1.json', 'docs/design/manufacturing-classification-v1.json', 'data/items.json', 'js/manufacturing-knowledge-catalog.js', 'js/manufacturing-knowledge.js', 'js/dungeon/recipe-study.js', 'data/forging/item-catalog-v2.json', 'data/dungeon-recipe-ranges.json', 'js/dungeon/recipe-ranges.js', 'data/medical-crafting.json', 'data/medical-kits.json'];
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-study-editor-'));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, file), path.join(root, file));
  }
  // Keep test scenarios independent of scopes the designer has already edited.
  const game = JSON.parse(fs.readFileSync(path.join(root, files[0]), 'utf8'));
  const design = JSON.parse(fs.readFileSync(path.join(root, files[1]), 'utf8'));
  design.recipes.push(...JSON.parse(fs.readFileSync(path.join(root,'data/medical-crafting.json'),'utf8')).recipes);
  fs.writeFileSync(path.join(root, 'data/dungeon-recipe-ranges.json'), JSON.stringify({ version: 2, dungeons: [{ id: game.id, name: game.name, recipeStudy: { enabled: true, chance: .03, recipeIds: design.recipes.filter(r => r.unlock.kind === 'exploration').map(r => r.recipe_id) } }] }, null, 2) + '\n');
  t.after(() => {
    const relative = path.relative(os.tmpdir(), root);
    assert(relative.startsWith('recipe-study-editor-') && !relative.includes(path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
const configPath = root => path.join(root, 'data/dungeon-recipe-ranges.json');
const current = root => fs.readFileSync(configPath(root), 'utf8');
const scope = (s, id = s.defaultDungeonId) => s.dungeons.find(d => d.id === id).recipeStudy;
const payload = (s, config = scope(s), dungeonId = s.defaultDungeonId) => ({ revision: s.revision, dungeonId, config });
const changeFile = (root, change) => {
  const config = JSON.parse(current(root)); change(config);
  fs.writeFileSync(configPath(root), JSON.stringify(config, null, 2) + '\n');
};
async function serve(t, root) {
  const server = createEditorServer({ root });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchAt = (url, options) => fetch(new URL(url, origin), options);
  return { fetchAt, origin };
}

test('reads the actual 70 products and two processes with current material names', t => {
  const s = readSnapshot(fixture(t));
  assert.equal(s.recipes.length, 72);
  assert.equal(s.recipes.filter(r => r.selectable).length, 47);
  assert.equal(s.recipes.filter(r => r.kind === 'basic').length, 23);
  assert.equal(s.recipes.filter(r => r.kind === 'processing').length, 2);
  const soil = s.recipes.filter(r => r.category === 'agriculture');
  assert.equal(soil.length, 7);
  const materials = soil.flatMap(r => r.inputs).filter(i => i.id.startsWith('compost_matrix_'));
  assert.deepEqual(materials.map(m => m.name).sort(), ['腐熟基质·散', '腐熟基质·散', '腐熟基质·散', '腐熟基质·匀', '腐熟基质·匀', '腐熟基质·细', '腐熟基质·细'].sort());
  assert.equal(materials.reduce((n, m) => n + m.count, 0), 20);
  assert.equal(s.recipes.find(r => r.name === '黄绵土客土').output, 4);
  assert.equal(s.recipes.find(r => r.name === '基础路亚竿').tools[0].name, '维修钳');
  assert(s.recipes.flatMap(r => [...r.inputs, ...r.tools]).every(i => i.name !== i.id), 'All ingredient and tool names must resolve');
});

test('saves only the selected dungeon, preserving other scopes, map config and ticket overrides', t => {
  const root = fixture(t);
  const initial = readSnapshot(root), actualConfig = path.join(root, files[0]);
  const c = JSON.parse(fs.readFileSync(actualConfig, 'utf8'));
  c.tickets = [{ id: 'editor-fixture', content: { recipeStudy: { recipeIds: [scope(initial).recipeIds[0]] } } }];
  fs.writeFileSync(actualConfig, JSON.stringify(c)); const untouchedConfig = fs.readFileSync(actualConfig, 'utf8');
  const other = createRange(root, { revision: readSnapshot(root).revision, name: '水边地牢', copyFromId: initial.defaultDungeonId });
  const before = JSON.parse(current(root)), s = readSnapshot(root);
  const config = { enabled: true, chance: .2, recipeIds: [scope(s).recipeIds[0]] };
  const after = saveRange(root, payload(s, config));
  assert.deepEqual(scope(after), config); assert.equal(after.dungeons.find(d => d.connected).ticketOverrides, 1);
  assert.equal(scope(after, other.createdId).recipeIds.length, 47);
  const expected = structuredClone(before); expected.dungeons.find(d => d.id === s.defaultDungeonId).recipeStudy = config;
  assert.deepEqual(JSON.parse(current(root)), expected);
  assert.equal(fs.readFileSync(actualConfig, 'utf8'), untouchedConfig);
  const disabled = saveRange(root, payload(after, { enabled: false, chance: .03, recipeIds: [] }));
  assert.equal(scope(disabled).recipeIds.length, 0);
  assert.equal(scope(saveRange(root, payload(disabled, { enabled: true, chance: 0, recipeIds: [] }))).chance, 0);
});

test('runtime validation rejects bad IDs, basics, processes, duplicates, empty active ranges and invalid chances', t => {
  const root = fixture(t), s = readSnapshot(root), original = current(root);
  const allowed = scope(s).recipeIds[0], basic = s.recipes.find(r => r.kind === 'basic').id, process = s.recipes.find(r => r.kind === 'processing').id;
  const invalid = [
    { recipeIds: ['bad-id'] }, { recipeIds: [basic] }, { recipeIds: [process] },
    { recipeIds: [allowed, allowed] }, { recipeIds: [] }, { chance: -1 }, { chance: 1.01 },
    { chance: null }, { chance: "0.03" }, { count: 1 }, { enabled: 'yes' }, { extra: 1 },
  ];
  for (const delta of invalid) {
    assert.throws(() => saveRange(root, payload(s, { ...scope(s), ...delta })));
    assert.equal(current(root), original);
  }
  assert.throws(() => saveRange(root, payload(s, scope(s), 'missing_dungeon')), /有效的地牢/);
  assert.throws(() => saveRange(root, { revision: s.revision, config: scope(s) }), /有效的地牢/);
});

test('detects stale config and source changes instead of overwriting other edits', t => {
  const root = fixture(t), s = readSnapshot(root);
  changeFile(root, c => { c.dungeons[0].name = '其他编辑器修改的名称'; });
  const changed = current(root);
  assert.throws(() => saveRange(root, payload(s)), /其他窗口/);
  assert.equal(current(root), changed);
  const reloaded = readSnapshot(root), recipePath = path.join(root, files[1]);
  fs.appendFileSync(recipePath, '\n');
  assert.throws(() => saveRange(root, payload(reloaded)), /其他窗口/);
  const design = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
  design.recipes[0].unlock.kind = 'exploration';
  fs.writeFileSync(recipePath, JSON.stringify(design));
  assert.throws(() => readSnapshot(root), /不同步/);
});

test('failed file replacement leaves the original config intact and removes its temporary file', t => {
  const root = fixture(t), s = readSnapshot(root), original = current(root);
  const mock = t.mock.method(fs, 'renameSync', () => { throw Error('simulated write failure'); });
  assert.throws(() => saveRange(root, payload(s, { ...scope(s), chance: .2 })), /simulated write failure/);
  mock.mock.restore();
  assert.equal(current(root), original);
  assert.equal(fs.readdirSync(path.dirname(configPath(root))).some(name => name.endsWith('.tmp')), false);
});

test('local HTTP API serves the editor, checks origin/token, and returns conflicts without writing', async t => {
  const root = fixture(t), original = current(root), { fetchAt } = await serve(t, root);
  const page = await fetchAt('/'); assert.equal(page.status, 200); assert.match(await page.text(), /资料台配方范围/);
  assert.equal((await fetchAt('/tools/recipe-study-range-editor.mjs')).status, 200);
  assert.equal((await fetchAt('/assets/dungeon/recipe-study-point-v1/available.png')).headers.get('content-type'), 'image/png');
  assert.equal((await fetchAt('/data/dungeon-config.json')).status, 404);
  assert.equal((await fetchAt('/api/recipe-study', { headers: { Origin: 'https://elsewhere.invalid' } })).status, 403);
  const s = await (await fetchAt('/api/recipe-study')).json();
  const options = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(s, { ...scope(s), chance: .2 })) };
  assert.equal((await fetchAt('/api/recipe-study', options)).status, 403);
  assert.equal(current(root), original);
  options.headers['X-Editor-Token'] = s.token;
  assert.equal((await fetchAt('/api/recipe-study', options)).status, 200);
  const saved = current(root);
  assert.equal((await fetchAt('/api/recipe-study', options)).status, 409);
  assert.equal(current(root), saved);
  assert.equal((await fetchAt('/api/recipe-study', { ...options, body: '{' })).status, 400);
});

async function editor(t) {
  const root = fixture(t), { fetchAt, origin } = await serve(t, root);
  const dom = new JSDOM(fs.readFileSync(path.join(projectRoot, 'tools/recipe-study-range-editor.html'), 'utf8'), { url: origin });
  t.after(() => dom.window.close()); dom.window.confirm = () => true;
  const doc = dom.window.document, app = mountEditor(doc, fetchAt); await app.ready;
  return { root, doc, app, win: dom.window, click: selector => { const element = doc.querySelector(selector); assert(element, selector); element.click(); }, search: value => { doc.getElementById('search').value = value; doc.getElementById('search').dispatchEvent(new dom.window.Event('input', { bubbles: true })); } };
}

test('creates blank and copied scopes without creating a map; rejects duplicate names and stale copies', t => {
  const root = fixture(t), original = readSnapshot(root);
  const blank = createRange(root, { revision: original.revision, name: '农场遗址' });
  const entry = blank.dungeons.find(d => d.id === blank.createdId);
  assert.equal(entry.connected, false); assert.deepEqual(entry.recipeStudy, { enabled: false, chance: .03, recipeIds: [] });
  assert.equal(blank.defaultDungeonId, original.defaultDungeonId);
  const copied = createRange(root, { revision: blank.revision, name: '修理工坊', copyFromId: original.defaultDungeonId });
  assert.deepEqual(scope(copied, copied.createdId), scope(original));
  const edited = saveRange(root, payload(copied, { enabled: true, chance: .03, recipeIds: [scope(original).recipeIds[0]] }, copied.createdId));
  assert.equal(scope(edited).recipeIds.length, 47);
  const before = current(root);
  for (const name of ['', '   ', '农场遗址', '很长'.repeat(21)]) assert.throws(() => createRange(root, { revision: edited.revision, name }));
  assert.throws(() => createRange(root, { revision: edited.revision, name: '新地牢', copyFromId: 'not-a-dungeon' }));
  assert.throws(() => createRange(root, { revision: blank.revision, name: '旧窗口新地牢' }), /其他窗口/);
  assert.equal(current(root), before);
});

test('UI preserves drafts across switches; saving or undoing one dungeon does not touch another', async t => {
  const { root, doc, app, click, search, win } = await editor(t);
  click('[data-category="agriculture"]'); click('#clear-visible');
  click('#new-dungeon'); doc.getElementById('new-name').value = '农场遗址';
  await app.create(); const farmId = readSnapshot(root).dungeons.find(d => d.name === '农场遗址').id;
  assert.equal(doc.getElementById('selected-count').textContent, '0');
  assert.equal(doc.getElementById('enabled').checked, false);
  assert.match(doc.getElementById('override-note').textContent, /不会新增/);
  click('[data-category="agriculture"]'); click('#select-visible'); click('#enabled');
  click('[data-dungeon="village_ruins"]'); assert.equal(doc.getElementById('selected-count').textContent, '40');
  click(`[data-dungeon="${farmId}"]`); assert.equal(doc.getElementById('selected-count').textContent, '7');
  await app.save(); assert.equal(scope(readSnapshot(root), farmId).recipeIds.length, 7);
  assert.equal(scope(readSnapshot(root)).recipeIds.length, 47, 'other dirty dungeon is not saved');
  click('[data-dungeon="village_ruins"]'); assert.equal(doc.getElementById('selected-count').textContent, '40');
  click('#undo'); assert.equal(doc.getElementById('selected-count').textContent, '47');
  click(`[data-dungeon="${farmId}"]`); assert.equal(doc.getElementById('selected-count').textContent, '7');
  search('红壤'); click('[data-recipe]');
  click('[data-dungeon="village_ruins"]');
  const leaving = new win.Event('beforeunload', { cancelable: true }); win.dispatchEvent(leaving);
  assert.equal(leaving.defaultPrevented, true, 'warn even when only an inactive dungeon has unsaved work');
  click('#new-dungeon'); doc.getElementById('new-name').value = '农场副本'; doc.getElementById('copy-from').value = farmId;
  await app.create(); assert.equal(doc.getElementById('selected-count').textContent, '7', 'copies saved scope rather than another tab draft');
  click(`[data-dungeon="${farmId}"]`); assert.equal(doc.getElementById('selected-count').textContent, '6', 'creating a copy retains source draft');
  win.confirm = () => false; await app.load(); assert.equal(doc.getElementById('selected-count').textContent, '6');
  win.confirm = () => true; await app.load(); assert.equal(doc.getElementById('selected-count').textContent, '7');
});

test('allocation overview counts overlaps and unassigned recipes, includes drafts, and links to the right dungeon', async t => {
  const { root, doc, app, click } = await editor(t);
  click('#new-dungeon'); doc.getElementById('new-name').value = '农场遗址'; await app.create();
  const farmId = readSnapshot(root).dungeons.find(d => d.name === '农场遗址').id;
  click('[data-category="agriculture"]'); click('#select-visible');
  click('#allocation-button'); assert.equal(doc.getElementById('shared-count').textContent, '7');
  assert.equal(doc.getElementById('assigned-count').textContent, '47'); assert.equal(doc.getElementById('unassigned-count').textContent, '0');
  assert.equal(doc.getElementById('save').hidden, true);
  click('[data-assignment="shared"]'); assert.equal(doc.querySelectorAll('.assignment-row').length, 7);
  assert.match(doc.querySelector('.assignment-row').textContent, /未接地图.*不投放.*未保存/);
  click(`.assignment-row [data-jump-dungeon="${farmId}"]`); assert.equal(doc.getElementById('dungeon-title').textContent, '农场遗址');
  click('#undo'); click('[data-dungeon="village_ruins"]'); click('[data-category="agriculture"]'); click('#clear-visible');
  click('#allocation-button'); click('[data-assignment="unassigned"]');
  assert.equal(doc.getElementById('unassigned-count').textContent, '7'); assert.equal(doc.getElementById('assigned-count').textContent, '40');
  assert.equal(doc.querySelectorAll('.assignment-row').length, 7);
  assert([...doc.querySelectorAll('.assignment-row')].every(r => r.textContent.includes('尚未分配')));
  assert.equal(scope(readSnapshot(root)).recipeIds.length, 47, 'overview does not save drafts');
});

test('UI filters and bulk edits affect only visible research recipes, preserve other categories, and undo', async t => {
  const { doc, click, search } = await editor(t);
  assert.equal(doc.querySelectorAll('[data-recipe]').length, 72);
  assert.equal(doc.querySelectorAll('[data-recipe]:disabled').length, 25);
  assert.equal(doc.getElementById('selected-count').textContent, '47');
  assert.equal(doc.getElementById('save').disabled, true);
  click('[data-category="agriculture"]');
  assert.equal(doc.querySelectorAll('[data-recipe]').length, 7);
  click('#clear-visible'); assert.equal(doc.getElementById('selected-count').textContent, '40');
  click('[data-category="fishing"]'); assert([...doc.querySelectorAll('[data-recipe]:not(:disabled)')].every(i => i.checked));
  click('[data-category="all"]'); search('腐熟基质·细');
  assert.equal(doc.querySelectorAll('[data-recipe]').length, 2);
  click('#select-visible'); assert.equal(doc.getElementById('selected-count').textContent, '42');
  search('黄绵土'); click('[data-detail]');
  assert.match(doc.getElementById('detail').textContent, /腐熟基质·散/);
  click('#detail-toggle'); assert.equal(doc.getElementById('selected-count').textContent, '43');
  click('#undo'); assert.equal(doc.getElementById('selected-count').textContent, '47');
  search('不存在的配方'); assert.equal(doc.getElementById('empty').hidden, false); assert.equal(doc.getElementById('select-visible').disabled, true);
  search('manufacturing.tool_repair_pliers'); assert.equal(doc.querySelectorAll('[data-recipe]').length, 1);
});

test('UI empty-range guard, exact one-recipe save, reload and server conflict retain unsaved work', async t => {
  const { root, doc, app, click, search } = await editor(t);
  click('#clear-visible'); assert.equal(doc.getElementById('selected-count').textContent, '0');
  assert.equal(doc.getElementById('save').disabled, true); assert.match(doc.getElementById('status').textContent, /至少选择/);
  click('#enabled'); assert.equal(doc.getElementById('save').disabled, false);
  click('#enabled'); assert.equal(doc.getElementById('save').disabled, true);
  search('manufacturing.tool_repair_pliers'); click('[data-recipe]');
  await app.save();
  assert.deepEqual(scope(readSnapshot(root)).recipeIds, ['manufacturing.tool_repair_pliers']);
  assert.equal(doc.getElementById('save').disabled, true);
  assert.match(doc.getElementById('status').textContent, /已保存/);
  search(''); click('[data-filter="unselected"]'); click('#select-visible');
  assert.equal(doc.getElementById('selected-count').textContent, '47');
  changeFile(root, c => { c.dungeons[0].name = '外部修改'; }); const before = current(root);
  await app.save();
  assert.equal(current(root), before); assert.equal(doc.getElementById('selected-count').textContent, '47');
  assert.match(doc.getElementById('status').textContent, /其他窗口/);
  await app.load(); assert.equal(doc.getElementById('selected-count').textContent, '1');
});

test('UI edits expedition percentage, rejects blanks/out-of-range values and saves fractional chance', async t => {
  const { root, doc, app, click } = await editor(t);
  const input = doc.getElementById('chance');
  const set = value => { input.value = value; input.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true })); };
  assert.equal(input.value, '3');
  set('12.5'); assert.equal(doc.getElementById('save').disabled, false);
  await app.save(); assert.equal(scope(readSnapshot(root)).chance, .125);
  for (const value of ['', '-1', '101']) { set(value); assert.equal(doc.getElementById('save').disabled, true); }
  click('#undo'); assert.equal(input.value, '12.5');
  set('0'); click('#clear-visible'); await app.save();
  assert.equal(scope(readSnapshot(root)).chance, 0); assert.deepEqual(scope(readSnapshot(root)).recipeIds, []);
});

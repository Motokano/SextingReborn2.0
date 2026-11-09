import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkEntrySource, checkScriptOrder, checkRepository, checkCompositionModule } from './check-scene-entry.mjs';
const modules = JSON.parse(fs.readFileSync('docs/architecture/scene-modules.json', 'utf8')).modules;
const source = fs.readFileSync('js/scene-app.js', 'utf8');

test('current production entry and all declared modules satisfy the architecture contract', () => {
  assert.equal(checkRepository(), modules.length);
});
test('entry guard rejects gameplay, state, rendering, dynamic dispatch and disguised callbacks', () => {
  for (const forbidden of [
    'function damage() { return 10; }',
    'var state = {};',
    'if (window.Survival.isDead()) return;',
    'window.InventoryEquipment.takeItemFromContainer("pocket", 0);',
    'document.body.innerHTML = "hidden implementation";',
    'window.CombatExchange.attackEnemy("enemy", {});',
    'window.SceneStartup.initialize(function () { window.Survival.advanceTick(); });',
    'eval("window.Survival.advanceTick()");'
  ]) assert.throws(() => checkEntrySource(source.replace('})(window);', '    ' + forbidden + '\n})(window);'), modules), /scene architecture/, forbidden);
  assert.throws(() => checkEntrySource(source.replace('window.SceneConfig.initialize();', 'window.SceneConfig.initialize(() => 42);'), modules), /scene architecture/);
  for(const prefix of ['function* (window)', 'async function (window)']) assert.throws(()=>checkEntrySource(source.replace('function (window)',prefix),modules),/scene architecture/);
});
test('missing, duplicate and late module loads are rejected before the browser runs', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const tag = '<script src="js/scene/combat-exchange.js"></script>';
  for (const broken of [html.replace(tag, ''), html.replace(tag, tag + tag), html.replace(tag, '').replace('<script src="js/bootstrap.js"></script>', tag + '<script src="js/bootstrap.js"></script>'),html.replace(tag,tag.replace('<script','<script async')),html.replace('<script src="js/scene-app.js"','<script type="module" src="js/scene-app.js"')]) {
    assert.throws(() => checkScriptOrder(broken, modules, 'mutation'), /scene architecture/);
  }
});
test('composition adapters cannot become an alternative gameplay entry',()=>{
  for(const global of ['SceneStartup','ScenePublicApi']) {
    const module=modules.find(m=>m.global===global),original=fs.readFileSync(module.file,'utf8');
    for(const statement of ['window.Survival.getState().stamina = 0;','window.Survival.consumeDiqi(2);','window.SceneCtx.foo++;','delete window.SceneCtx.actions;','Object.assign(window.SceneCtx, {damage:10});']) {
      assert.throws(()=>checkCompositionModule(original.replace('function initialize() {','function initialize() {'+statement),module),/scene architecture/);
    }
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { boot } from './dungeon/fixture.mjs';
const read = file => fs.readFileSync(file, 'utf8'), plain = value => JSON.parse(JSON.stringify(value));
const registry = JSON.parse(read('data/dungeon-recipe-ranges.json'));
const config = JSON.parse(read('data/dungeon-config.json'));
const context = vm.createContext({});
for (const file of ['js/manufacturing-knowledge-catalog.js', 'js/manufacturing-knowledge.js', 'js/dungeon/recipe-study.js', 'js/dungeon/recipe-ranges.js']) vm.runInContext(read(file), context);
const ranges = context.DungeonRecipeRanges;
assert.equal(config.content.recipeStudy, undefined, 'one authoritative range source');
assert.deepEqual(plain(ranges.forDungeon(registry, config.id)), registry.dungeons.find(d => d.id === config.id).recipeStudy);
const recipes = context.ManufacturingKnowledge.catalog.filter(r => r.unlock === 'exploration');
const custom = { id: 'fixture_workshop', name: '测试工坊', recipeStudy: { enabled: true, chance: 1, recipeIds: [recipes[3].id] } };
registry.dungeons = [registry.dungeons.find(d => d.id === config.id)];
registry.dungeons.push(custom);
assert.deepEqual(plain(ranges.forDungeon(registry, custom.id)), custom.recipeStudy);
const detached = ranges.forDungeon(registry, custom.id); detached.recipeIds.length = 0;
assert.equal(custom.recipeStudy.recipeIds.length, 1, 'resolving a dungeon returns its own copy');
assert.throws(() => ranges.forDungeon(registry, 'unknown'), /未配置/);
for (const mutate of [
  d => d.dungeons.push(plain(d.dungeons[0])),
  d => d.dungeons[1].name = d.dungeons[0].name,
  d => d.dungeons[1].id = '../invalid',
  d => d.dungeons[1].recipeStudy.recipeIds = [],
  d => d.dungeons[1].recipeStudy.recipeIds = ['unknown.recipe'],
  d => d.dungeons[1].recipeStudy.recipeIds = [context.ManufacturingKnowledge.catalog.find(r => r.unlock === 'skill_level').id],
]) { const bad = plain(registry); mutate(bad); assert.throws(() => ranges.validate(bad)); }

// A synthetic second dungeon exercises the real loader; it is never added to project data.
config.id = custom.id; config.name = custom.name;
const h = await boot(false, { jsonOverrides: { 'data/dungeon-config.json': config, [config.recipeStudyRangesSource]: registry } });
try {
  const g = h.g, D = g.DungeonRuntime, E = g.GameEngine, Q = g.RuinsRecipeStudy;
  await D.ready;
  assert.deepEqual(plain(D.config().content.recipeStudy), custom.recipeStudy, 'runtime selects by dungeon ID instead of using the first or default scope');
  g.CharacterAttributes.setState({ character_creation_completed: true }); E.setState('M0_Field_02', 7, 7);
  const seed = Array.from({length:100},(_,i)=>'per-dungeon-range-fixture-'+i).find(s=>Q.plan(s,1,4,custom.recipeStudy).floor===1);
  g.RuinsSeed.create = () => seed;
  assert.equal(D.enter(), true); assert.equal(D.getRun().dungeonId, custom.id);
  let s = D.getSim(); assert.deepEqual(plain(s.insightPoints.find(Q.isPoint).recipeIds), custom.recipeStudy.recipeIds);
  const saved = g.SaveSystem.buildSnapshotForDebug(); assert.equal(saved.dungeon.run.dungeonId, custom.id);
  const wrongDungeon = plain(saved); wrongDungeon.dungeon.run.dungeonId = 'village_ruins';
  assert.equal(g.SaveSystem.applySnapshotForDebug(wrongDungeon), false);
  const old = plain(saved); delete old.dungeon.run.dungeonId;
  assert.equal(g.SaveSystem.applySnapshotForDebug(old), true, 'old saves without dungeon ID still restore');
  D.config().content.recipeStudy.recipeIds = [recipes[5].id];
  s = D.getSim(); s.enemies = []; E.getMap().enemies = []; for (const door of s.doors) door.closed = false;
  E.setState(D.getRun().mapId, s.map.exit % s.map.width, Math.floor(s.map.exit / s.map.width)); D.sync();
  assert.equal(D.descend(), true);
  assert.equal(D.getSim().insightPoints.filter(Q.isPoint).length, 0, 'the room cannot appear again in the same expedition');
  assert.deepEqual(plain(D.getRun().content.recipeStudy.recipeIds), custom.recipeStudy.recipeIds, 'next floor keeps the expedition snapshot');
  assert.deepEqual(h.errors, []);
  console.log('PASS: per-dungeon source, strict registry validation, isolated scopes, ID binding through the real loader, saved identity, old-save compatibility and locked next-floor range.');
} finally { await h.close(); }

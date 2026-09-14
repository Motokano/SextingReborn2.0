import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const map = {
  map_id: 'field',
  enemies: [
    { enemy_id: 'wolf', x: 2, y: 2 },
    { enemy_id: 'wolf', x: 3, y: 3 }
  ]
};
const forced = [];
const context = {
  console,
  GameEngine: { getState: () => ({ mapId: map.map_id }), getMap: () => map },
  CombatEnemies: { forceAggro: (_map, index) => forced.push(index) }
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(fs.readFileSync('js/combat-engagement.js', 'utf8'), context, { filename: 'combat-engagement.js' });

const CE = context.CombatEngagement;
const changes = [];
CE.onChange((event) => changes.push(event.inCombat));

CE.syncFromAi(map, (index) => index === 0);
assert.equal(CE.isPlayerInCombat(), true);
assert.deepEqual(changes, [true]);

CE.syncFromAi(map, () => true);
assert.deepEqual(changes, [true], 'adding a second enemy must not duplicate enter feedback');

CE.disengageEnemy({ mapId: map.map_id, index: 0, record: map.enemies[0] });
assert.equal(CE.isPlayerInCombat(), true);
assert.deepEqual(changes, [true], 'one enemy leaving must not exit while another remains');

CE.syncFromAi(map, () => false);
assert.equal(CE.isPlayerInCombat(), false);
assert.deepEqual(changes, [true, false]);

CE.engageEnemy({ mapId: map.map_id, index: 1, enemyId: 'wolf', record: map.enemies[1], reason: 'player_attack' });
const saved = CE.getState();
CE.clear('test_clear', { silent: true });
CE.setState(saved);
assert.equal(CE.isPlayerInCombat(), true);
assert.deepEqual(forced, [1], 'loading engagement restores enemy aggro');

CE.setCurrentMap('town');
assert.equal(CE.isPlayerInCombat(), false, 'changing maps clears old-map engagement');

const aiContext = { console };
aiContext.window = aiContext;
aiContext.globalThis = aiContext;
vm.runInNewContext(fs.readFileSync('js/combat-enemies.js', 'utf8'), aiContext, { filename: 'combat-enemies.js' });
const AI = aiContext.CombatEnemies;
AI.setTable({ enemies: { wolf: { can_attack: true, aggro_radius: 2, leash_radius: 4, move_interval_ticks: 1 } } });
const farMap = { map_id: 'far', enemies: [{ enemy_id: 'wolf', x: 0, y: 0 }] };
assert.equal(AI.forceAggro(farMap, 0, 6), true);
AI.updateEnemyAI({ map: farMap, playerX: 10, playerY: 0, tick: 6, isWalkable: () => true, isBlockedByOther: () => false });
assert.equal(AI.isEnemyAggro('far', 0), true, 'active attack aggro survives its protected response tick');
AI.updateEnemyAI({ map: farMap, playerX: 10, playerY: 0, tick: 7, isWalkable: () => true, isBlockedByOther: () => false });
assert.equal(AI.isEnemyAggro('far', 0), false, 'normal leash rules resume after the response tick');

const pairMap = { map_id: 'pair', enemies: [{ enemy_id: 'wolf', x: 0, y: 0 }, { enemy_id: 'wolf', x: 1, y: 0 }] };
AI.forceAggro(pairMap, 0, 0);
AI.forceAggro(pairMap, 1, 0);
AI.removeEnemyAiStateAt('pair', 0);
assert.equal(AI.isEnemyAggro('pair', 0), true, 'removing an enemy preserves the shifted instance aggro');

console.log('combat engagement tests passed');

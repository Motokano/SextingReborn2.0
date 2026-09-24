import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
 const ctx=vm.createContext({console});ctx.window=ctx;
 for(const file of ['game-engine','combat-engagement']) vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),ctx);
 const E=ctx.GameEngine, CE=ctx.CombatEngagement;
 E.setMaps({field:{map_id:'field',width:6,height:6,blocks:[],portals:[{x:2,y:1,target_map_id:'town',target_x:1,target_y:1}],enemies:[{enemy_id:'wolf',x:4,y:4}]},town:{map_id:'town',width:6,height:6,blocks:[],portals:[],enemies:[]}});
 E.setState('field',1,1);
 CE.engageEnemy({mapId:'field',index:0,record:E.getMap().enemies[0],enemyId:'wolf'});
 assert.equal(CE.isPlayerInCombat(),true);
 return {ctx,E,CE};
}
// A map without an enemies field is a valid peaceful map, not a reason to retain engagement.
{
 const {ctx,E,CE}=fixture();
 for(const file of ['combat-enemies','combat-world'])vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),ctx);
 E.setState('town',1,1);delete E.getMap().enemies;
 CE.engageEnemy({mapId:'field',index:0,record:E.getMaps().field.enemies[0],enemyId:'wolf',silent:true});
 ctx.CombatWorld.tickEnemiesAfterWorldTick();
 assert.equal(CE.isPlayerInCombat(),false,'world sync must clear stale combat on maps with no enemies field');
}
for(const transition of ['walk','jump','setState']) {
 const {ctx,E,CE}=fixture();const notifications=[];CE.onChange(e=>notifications.push(e));
 ctx.Survival={advanceTick(){assert.equal(CE.isPlayerInCombat(),false,'old-map engagement must clear before destination world tick');}};
 E.onChange(()=>assert.equal(CE.isPlayerInCombat(),false,'destination observers must see out-of-combat state'));
 if(transition==='walk')assert.equal(E.moveTo(2,1),true);
 if(transition==='jump')assert.equal(E.jumpTo(2,1,2),true);
 if(transition==='setState')E.setState('town',1,1);
 assert.equal(E.getState().mapId,'town');
 assert.equal(CE.isPlayerInCombat(),false,transition+' must leave old-map combat');
 assert.equal(CE.getState().mapId,'town');
 assert.equal(notifications.length,1);assert.equal(notifications[0].reason,'map_changed');
}
for(const transition of ['walk','jump','setState','invalid']) {
 const {E,CE}=fixture();let changes=0;CE.onChange(()=>changes++);
 if(transition==='walk')assert(E.moveTo(1,2));
 if(transition==='jump')assert(E.jumpTo(1,3,2));
 if(transition==='setState')E.setState('field',1,2);
 if(transition==='invalid')E.setState('missing',1,2);
 assert.equal(CE.isPlayerInCombat(),true,'same-map or rejected movement must retain combat');assert.equal(changes,0);
}
{
 const {ctx,E,CE}=fixture();
 E.getMaps().town.enemies=[{enemy_id:'guard',x:3,y:3}];
 ctx.Survival={advanceTick(){CE.engageEnemy({mapId:'town',index:0,record:E.getMap().enemies[0],enemyId:'guard'});}};
 E.moveTo(2,1);
 assert.equal(CE.isPlayerInCombat(),true,'destination enemies can start a new fight');
 assert.equal(CE.getState().enemies.length,1);assert.equal(CE.getState().enemies[0].enemyId,'guard');
}
console.log('PASS: portal walk/jump/direct transfer, missing enemy list, same-map movement, invalid transfer and destination combat.');

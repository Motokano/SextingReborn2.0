import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './ui-game-fixture.mjs';
const h=await boot(true),g=h.g,I=g.InventoryEquipment,W=g.ModularWeaponCombat,C=g.ForgingConfig;
try{
 g.CharacterAttributes.setState({character_creation_completed:true,innate:{jingu:100,flexibility:20,breath:20,dexterity:20,focus:20}});
 const inv=I.getState();inv.inventory_pocket=[];inv.inventory_backpack=[];inv.equipment.weapon_left=null;inv.equipment.weapon_right=null;
 const weapon={item_id:W.ROOT,count:1,connections:{}};
 for(const [slot,design] of Object.entries({front:'T01',side1:'D01',side2:'B01',hilt:'H01'})){
  const b=Object.values(C.components).find(p=>p.designId===design);
  weapon.connections[slot]={connection_schema_version:1,part:{item_id:b.itemId,count:1,forged_component:g.ForgingRules.result(b,{material_forging_iron:b.capacity},100,.1)}};
 }
 inv.inventory_pocket=[weapon];I.setState(inv);
 g.SceneApp.openBackpackPanel();await h.drain();
 g.document.querySelector('#modal-backpack [data-container="pocket"]').click();await h.drain();
 const left=[...g.document.querySelectorAll('#modal-backpack button')].find(b=>b.textContent.trim()==='左手持用');assert(left,'actual backpack exposes left-hand equipment');left.click();await h.drain();
 assert(W.equipped());assert.equal(W.equipped().limbId,'lhand');
 g.SceneApp.panelApi.close('backpack');
 const w=W.equipped().item;I.getSkillsState().combat_basic_footwork.level=60;I.setCombatState({hubs:{footwork:'combat_basic_footwork',breath:'combat_basic_breath'}});
 g.Survival.setState({qi_li_current:100,diqi_current:10000,diqi_max_effective:10000,isDead:false});
 const p=g.GameEngine.getState(),map=g.GameEngine.getMap();
 const target={enemy_id:'modular_test_target',x:p.x+1,y:p.y};map.enemies.push(target);
 g.CombatEnemies.setTable({enemies:{modular_test_target:{speed:1,parry_rate:0,parry_damage_reduce:0,can_attack:false,limbs_invulnerable:true}}});
 const strikes=[],run=g.CombatPipeline.runPipeline;
 g.CombatPipeline.runPipeline=(name,ctx)=>{const result=run(name,ctx);strikes.push(result);return result;};
 const cursors=JSON.stringify(I.getCombatState().move_sequence_cursors);
 W.setPowerLevel('front',7);
 g.SceneCtx.actions.attackEnemy(target.enemy_id,{x:target.x,y:target.y,fromX:p.x,fromY:p.y});
 assert.equal(strikes.filter(c=>c.weaponAction).length,4,'real scene executes four strikes for >=4x speed');
 assert(strikes.every(c=>!c.weaponAction||c.weaponAction.slot==='front'));
 assert(strikes.every(c=>!c.weaponAction||c.resourceResult.powerLevel===7),'all repeated strikes use the configured position power');
 assert.deepEqual(strikes.filter(c=>c.weaponAction).map(c=>c.weaponAction.repeatIndex),[0,1,2,3]);
 assert.equal(w.weapon_combat.attackCursor,1);assert.equal(JSON.stringify(I.getCombatState().move_sequence_cursors),cursors);
 assert(!I.getSkillsState()[W.SKILL]);
 // Equal speed uses one shared pre-contact durability snapshot in the real scene exchange.
 strikes.length=0;g.Math.random=()=>.2;
 g.Survival.setState({qi_li_current:100,diqi_current:10000});
 const sameSpeed=g.CharacterAttributes.getCombatSpeed();
 g.CombatEnemies.setTable({enemies:{modular_test_target:{speed:sameSpeed,parry_rate:0,parry_damage_reduce:0,can_attack:true,limbs_invulnerable:true,attack_damage_min:0,attack_damage_max:0}}});
 const side=w.connections.side1.part.forged_component,beforeSide=side.durability_current;
 let dryDefenseSaw;
 g.CombatPipeline.runPipeline=(name,ctx)=>{if(name==='melee_hit_player_defender'&&ctx.simultaneousDryRun)dryDefenseSaw=side.durability_current;const result=run(name,ctx);strikes.push(result);return result;};
 g.SceneCtx.actions.attackEnemy(target.enemy_id,{x:target.x,y:target.y,fromX:p.x,fromY:p.y});
 assert.equal(dryDefenseSaw,beforeSide);assert(strikes.some(c=>c.simultaneousCommitted));assert(side.durability_current<beforeSide);
 // Faster opponent destroys the holding hand before the player's planned weapon strike.
 g.Survival.setState({qi_li_current:100,diqi_current:10000});strikes.length=0;
 const isDestroyed=g.CharacterAttributes.isBodyPartDestroyedForParry;let handLost=false;
 g.CharacterAttributes.isBodyPartDestroyedForParry=bp=>handLost&&bp==='left_arm'||isDestroyed(bp);
 g.CombatEnemies.getById(target.enemy_id).speed=100;
 g.CombatPipeline.runPipeline=(name,ctx)=>{const result=run(name,ctx);strikes.push(result);if(name==='melee_hit_player_defender')handLost=true;return result;};
 const next=w.weapon_combat.attackCursor;
 g.SceneCtx.actions.attackEnemy(target.enemy_id,{x:target.x,y:target.y,fromX:p.x,fromY:p.y});
 assert(!strikes.some(c=>c.weaponAction));assert.equal(w.weapon_combat.attackCursor,next);assert.equal(W.intent(),null);
 assert(strikes.some(c=>c.attacker?.kind==='player'&&c.skillId==='combat_basic_unarmed'&&c.limbId!=='lhand'),'holding-hand loss reselects an available unarmed reply in this exchange');
 handLost=false;assert(W.intent());g.CharacterAttributes.isBodyPartDestroyedForParry=isDestroyed;
 // Actual SaveSystem roundtrip, not only a JSON copy of the weapon object.
 const state=g.SaveSystem.buildSnapshotForDebug();assert(g.SaveSystem.applySnapshotForDebug(state));
 assert.equal(W.equipped().item.weapon_combat.attackCursor,next);assert(I.auditItemOwnership().ok);
 g.SceneApp.openCombatPanel();await h.drain();
 assert(g.document.querySelector('.weapon-cycle'));
 const oldOrder=W.view().rows.map(r=>r.slot);
 g.document.querySelector('.weapon-cycle button').click();await h.drain();
 assert.equal(W.view().rows[0].slot,oldOrder[1]);
 const power=g.document.querySelector('.weapon-cycle select'),powerSlot=W.view().rows[0].slot;
 assert.equal(power.value,'10','new weapon defaults to full power in the live control');
 const beforeEditTick=g.GameTime.getState().totalTicks;
 power.value='7';power.dispatchEvent(new g.Event('change',{bubbles:true}));await h.drain();
 assert.equal(W.view().rows[0].powerLevel,7);
 assert.equal(g.GameTime.getState().totalTicks,beforeEditTick+1,'editing weapon config during combat consumes an action');
 assert(g.SaveSystem.applySnapshotForDebug(g.SaveSystem.buildSnapshotForDebug()));
 assert.equal(W.equipped().item.weapon_moves[powerSlot].power_level,7);
 if(process.argv.includes('--visual')){
  // HTML serialization alone doesn't include select.value; retain the live selection.
  for(const select of g.document.querySelectorAll('.weapon-cycle select'))for(const option of select.options)option.toggleAttribute('selected',option.selected);
  const styles=[...fs.readFileSync('index.html','utf8').matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]).join('');
  fs.mkdirSync('tmp',{recursive:true});
  fs.writeFileSync('tmp/weapon-loadout-review.html','<!doctype html><html lang="zh-CN"><head><base href="http://127.0.0.1:8030/"><meta charset="utf-8">'+styles+
   '<link rel="stylesheet" href="css/game-theme-systems.css"><link rel="stylesheet" href="css/ui-moss-game.css"><link rel="stylesheet" href="css/combat-loadout.css"></head><body class="'+g.document.body.className+'">'+g.document.querySelector('#modal-combat').outerHTML+'</body></html>');
 }
 assert.deepEqual(h.errors,[]);
 console.log('PASS main-game modular combat: real backpack left-hand equip, production scene four-hit series, separate unarmed cursor and SaveSystem roundtrip.');
}finally{await h.close();}

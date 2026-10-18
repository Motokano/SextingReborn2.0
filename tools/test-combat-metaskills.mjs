import assert from 'node:assert/strict';
import {boot} from './ui-game-fixture.mjs';
// A–H and all variants below are isolated test fixtures, never production content.
const h=await boot(true),g=h.g,I=g.InventoryEquipment,W=g.ModularWeaponCombat,M=g.CombatMetaSkills;
g.Error.stackTraceLimit=40;
const plain=v=>JSON.parse(JSON.stringify(v)),eq=(a,b,msg)=>assert.deepEqual(plain(a),b,msg);
const limbs=['lhand','rhand','lfoot','rfoot'],positions=['front','side1','side2','hilt'];
let playerSpeed=20,sequence=[],counterHook=null;
try {
 g.CharacterAttributes.setState({character_creation_completed:true,innate:{jingu:100,flexibility:20,breath:20,dexterity:20,focus:20}});
 const base=plain(g.CombatSkills.getSkill('combat_basic_unarmed'));
 const makeMove=(id,type)=>({...plain(base.moves[0]),id,name:id,required_limb_tags:[],action_tags:[],damage_type:type,hit_segments:1,attack_range:1,diqi_cost:{ratio_of_diqi_max_at_10_power:.01,min:2,max:2},move_power_multiplier:1,unlock_level:1});
 const skU={...base,id:'test_unarmed',name:'Test unarmed',slots_unlock_by_level:[{level:1,slots:5}],moves:'ABCD'.split('').map(id=>makeMove(id,'blunt'))};
 const skW={...base,id:'test_weapon',name:'Test weapon',category:'weapon',slots_unlock_by_level:[{level:1,slots:5}],moves:'EFGH'.split('').map((id,n)=>makeMove(id,['pierce','slash','slash','blunt'][n]))};
 g.CombatSkills.getSkills()[skU.id]=skU;g.CombatSkills.getSkills()[skW.id]=skW;
 I.getSkillsState()[skU.id]={level:50,move_usage:{}};I.getSkillsState()[skW.id]={level:50,move_usage:{}};
 const inv=I.getState();inv.equipment.weapon_left=null;inv.equipment.weapon_right=null;I.setState(inv);
 const weapon={item_id:W.ROOT,count:1,connections:{}};
 for(const [slot,id] of Object.entries({front:'T01',side1:'B01',side2:'B01',hilt:'H01'})){
  const b=Object.values(g.ForgingConfig.components).find(p=>p.designId===id);
  weapon.connections[slot]={connection_schema_version:1,part:{item_id:b.itemId,count:1,forged_component:g.ForgingRules.result(b,{material_forging_iron:b.capacity},100,.1)}};
 }
 assert(I.equip('weapon_right',weapon).success);
 const p=g.GameEngine.getState(),map=g.GameEngine.getMap(),enemy={enemy_id:'test_meta_target',x:p.x+1,y:p.y};map.enemies.push(enemy);
 const index=map.enemies.indexOf(enemy);
 g.CombatEnemies.setTable({enemies:{test_meta_target:{speed:10,parry_rate:0,can_attack:false,limbs_invulnerable:true,attack_damage_min:0,attack_damage_max:0}}});
 g.CharacterAttributes.getCombatSpeed=()=>playerSpeed;
 g.Math.random=()=>.2;
 g.Survival.setDiqiCapLimitFlatBonus('test_metaskills',1000);
 const originalRun=g.CombatPipeline.runPipeline;
 g.CombatPipeline.runPipeline=(name,ctx)=>{const result=originalRun(name,ctx);sequence.push(result);if(name==='melee_hit_player_defender')counterHook?.(result);return result;};
 function engage(){g.CombatEngagement.engageEnemy({mapId:p.mapId,index,enemyId:enemy.enemy_id,record:enemy,reason:'test'});}
 function signal(mode='replace',extra={}){return {id:'signal',assist_scope:'active_moves',metaskill:{mode,enabled_when:'in_combat',condition:{kind:'event',listen:['test_signal'],test:{path:'event.value',op:'eq',value:true}},...extra}};}
 function setup(defs={jump:signal()},slots={front:['jump']}){
  counterHook=null;playerSpeed=20;g.CombatEnemies.getById(enemy.enemy_id).speed=10;g.CombatEnemies.getById(enemy.enemy_id).can_attack=false;
  g.CombatVariants.setTable({variants:Object.fromEntries(Object.entries(defs).map(([id,v])=>[id,{...v,id}]))});
  const c={limbs:{},move_sequences:{},limb_strike_order:limbs,limb_strike_order_cursor:1};
  for(let n=0;n<4;n++){const lid=limbs[n];c.limbs[lid]={active:skU.id};c.move_sequences[lid]=['ABCD'[n],...(slots[lid]||[]).map(id=>'variant:'+id)];}
  I.setCombatState(c);
  for(let n=0;n<4;n++)assert(W.setMoveConfig(positions[n],{skill_id:skW.id,move_id:'EFGH'[n],variants:slots[positions[n]]||[]})||W.intentAt(positions[n],true)?.moveId==='EFGH'[n]);
  W.setMode('unarmed');W.equipped().item.weapon_combat.attackCursor=0;
  I.setPlayerStunValue(0);g.Survival.setState({isDead:false,qi_li_current:100,diqi_current:10000,diqi_max_effective:10000});
  M.reset();engage();sequence=[];
 }
 function activate(){M.notify('test_signal',{value:true});}
 function ready(){g.GameTime.advanceTicks(1);}
 function attack(){sequence=[];const pos=g.GameEngine.getState(),e=g.GameEngine.getMap().enemies[index];g.SceneCtx.actions.attackEnemy(enemy.enemy_id,{x:e.x,y:e.y,fromX:pos.x,fromY:pos.y});return sequence.filter(c=>c.attacker?.kind==='player');}
 setup();activate();assert.equal(M.getState().queue.length,1);
 assert.equal(M.select({skip:true},{x:enemy.x,y:enemy.y}).entry,null,'activation cannot execute on the activation tick');
 ready();let strikes=attack();eq(strikes.map(c=>c.moveId),['E','E'],'replace repeats E, never B');
 assert.equal(M.mode(),'weapon');assert.equal(W.equipped().item.weapon_combat.attackCursor,1);assert.equal(I.getLimbStrikeOrderCursor(),1,'replaced B did not advance');
 eq(attack().map(c=>c.moveId),['F','F'],'replacement continues from E in the weapon cycle');
 setup({jump:signal('append')});activate();ready();strikes=attack();eq(strikes.map(c=>c.moveId),['B','B','E']);
 assert.equal(M.mode(),'unarmed');assert.equal(W.equipped().item.weapon_combat.attackCursor,0,'append never advances weapon cycle');assert.equal(I.getLimbStrikeOrderCursor(),2);
 eq(attack().map(c=>c.moveId),['C','C'],'append keeps the original cycle');
 setup({jump:signal()},{lfoot:['jump']});activate();ready();eq(attack().map(c=>c.moveId),['C','C']);assert.equal(I.getLimbStrikeOrderCursor(),3);
 // Batch sorting starts at the main cycle's ORIGINAL next position; previous
 // batches retain FIFO order through subsequent mode changes.
 setup({b:signal(),c:signal(),d:signal(),e:signal(),f:signal()},{rhand:['b'],lfoot:['c'],rfoot:['d'],front:['e'],side1:['f']});
 activate();eq(M.getState().queue.map(e=>e.variantId),['b','c','d','e','f']);activate();assert.equal(M.getState().queue.length,5,'deduplicate pending installation');
 ready();attack();eq(M.getState().queue.map(e=>e.variantId),['c','d','e','f']);
 activate();eq(M.getState().queue.map(e=>e.variantId),['c','d','e','f','b'],'new batch appends, no reordering older entries');
 // The real A main strike is what activates a variant installed on E.
 const afterA={...signal(),metaskill:{mode:'replace',enabled_when:'in_combat',condition:{kind:'event',listen:['action_completed'],test:{path:'event.move_id',op:'eq',value:'A'}}}};
 setup({jump:afterA});I.setCombatState({limb_strike_order_cursor:0});eq(attack().map(c=>c.moveId),['A','A']);assert.equal(M.getState().queue.length,1);eq(attack().map(c=>c.moveId),['E','E']);
 // Strict anti-chain: E's action, immediate resource changes, its persistent buff
 // and later ticks are all ineligible, while normal B in a BBE remains eligible.
 const everyMove={...signal(),metaskill:{mode:'replace',enabled_when:'in_combat',condition:{kind:'event',listen:['action_completed'],test:{path:'event.actor',op:'eq',value:'player'}}}};
 setup({jump:signal(),chain:everyMove},{front:['jump'],side1:['chain']});activate();ready();attack();assert.equal(M.getState().queue.length,0,'triggered E cannot activate F');
 setup({jump:signal('append'),chain:everyMove},{front:['jump'],side1:['chain']});activate();ready();attack();eq(M.getState().queue.map(e=>e.variantId),['chain'],'normal B repeats still may activate F');
 setup({a:everyMove,c:everyMove,d:everyMove},{lhand:['a'],lfoot:['c'],rfoot:['d']});attack();eq(M.getState().queue.map(e=>e.variantId),['c','d','a'],'B completion batches start at C');
 const stateVariant={...signal(),metaskill:{mode:'replace',enabled_when:'in_combat',condition:{kind:'state',listen:['resource_changed','world_tick'],test:{path:'self.qi',op:'gte',value:4}}}};
 setup({jump:stateVariant});g.Survival.setState({qi_li_current:0});M.notify('resource_changed');M.withSource('metaskill:test',()=>g.Survival.addQiLi(10));ready();assert.equal(M.getState().queue.length,0,'no delayed state trigger from meta-generated qi');
 g.Survival.drainQiLi();M.notify('resource_changed');g.Survival.addQiLi(10);assert.equal(M.getState().queue.length,1,'fresh non-meta state entry activates');
 ready();attack();ready();assert.equal(M.getState().queue.length,0,'continuing true state does not rearm');
 setup({jump:{...stateVariant,metaskill:{...stateVariant.metaskill,condition:{...stateVariant.metaskill.condition,repeat_interval_ticks:2}}}});
 g.Survival.setState({qi_li_current:0});g.Survival.addQiLi(10);ready();const recurring=M.select({skip:true},enemy);M.consume(recurring);
 assert.equal(M.getState().queue.length,0);ready();assert.equal(M.getState().queue.length,1,'only an explicit interval permits repetition in the same state');
 // Cooldown starts on enqueue, is not refunded by cancellation or removal/re-add.
 setup({jump:signal('replace',{cooldown_ticks:8})});activate();const activated=g.GameTime.getState().totalTicks;
 const signature=M.configSignature();I.setCombatState({move_sequences:{lhand:['A','variant:jump']}});assert.notEqual(M.configSignature(),signature);assert.equal(M.getState().queue.length,0);
 I.setCombatState({move_sequences:{lhand:['A']}});activate();assert.equal(M.getState().queue.length,0);assert(Object.values(M.getState().cooldowns).includes(activated+8));
 ready();g.GameTime.advanceTicks(7);activate();assert.equal(M.getState().queue.length,1,'only a fresh event after cooldown activates');
 setup({jump:signal('replace',{cooldown_ticks:20})});activate();const until=Object.values(M.getState().cooldowns)[0];
 W.setMoveConfig('front',{skill_id:skW.id,move_id:'E',variants:[]});W.setMoveConfig('side1',{skill_id:skW.id,move_id:'F',variants:['jump']});activate();
 assert.equal(M.getState().queue.length,0,'moving a removed metaskill cannot reset its cooldown');assert(Object.values(M.getState().cooldowns).every(t=>t===until));
 // Invalid queued entries do not consume the one-per-attack quota.
 setup({bad:signal(),good:signal()},{lhand:['bad'],front:['good']});activate();ready();
 const destroyed=g.CharacterAttributes.isBodyPartDestroyedForParry;g.CharacterAttributes.isBodyPartDestroyedForParry=id=>id==='left_arm'||destroyed(id);
 eq(attack().map(c=>c.moveId),['E','E']);g.CharacterAttributes.isBodyPartDestroyedForParry=destroyed;
 setup({jump:signal('append')});activate();ready();
 const check=g.CombatWorld.flushDisplacements;g.CombatWorld.flushDisplacements=ctx=>{const r=check(ctx);if(sequence.length===0)enemy.x+=3;return r;};
 eq(attack().map(c=>c.moveId),['B','B'],'out-of-range append cancels after B');g.CombatWorld.flushDisplacements=check;enemy.x=p.x+1;
 // No attack opportunity means no dequeue.
 setup();activate();ready();I.addPlayerStun(100);attack();assert.equal(M.getState().queue.length,1);I.setPlayerStunValue(0);
 // Faster enemy invalidates E; use the preserved unarmed B without recalculating speed.
 setup();activate();ready();g.CombatEnemies.getById(enemy.enemy_id).can_attack=true;g.CombatEnemies.getById(enemy.enemy_id).speed=30;
 let lost=false;g.CharacterAttributes.isBodyPartDestroyedForParry=id=>lost&&id==='right_arm'||destroyed(id);counterHook=()=>{lost=true;};
 strikes=attack();eq(strikes.map(c=>c.moveId),['C'],'E and normal B use the lost hand, so the next available limb acts');assert.equal(M.mode(),'unarmed');g.CharacterAttributes.isBodyPartDestroyedForParry=destroyed;
 // Simultaneous: append runs after both original strikes have been calculated.
 setup({jump:signal('append')});activate();ready();g.CombatEnemies.getById(enemy.enemy_id).can_attack=true;g.CombatEnemies.getById(enemy.enemy_id).speed=20;
 strikes=attack();eq(strikes.map(c=>c.moveId),['B','E']);assert(sequence.find(c=>c.attacker?.kind==='enemy')?.simultaneousCommitted);
 assert.equal(sequence.findIndex(c=>c.moveId==='E'),2,'append cannot contaminate opposing dry calculation');
 // Main mode is selected BEFORE speed, not after the old B's speed was used.
 setup();activate();ready();g.CharacterAttributes.getCombatSpeed=()=>M.mode()==='weapon'?10:40;
 eq(attack().map(c=>c.moveId),['E']);
 setup({jump:signal('append')});activate();ready();eq(attack().map(c=>c.moveId),['B','B','B','B','E']);
 g.CharacterAttributes.getCombatSpeed=()=>playerSpeed;
 for(const count of [3,4]){setup();playerSpeed=count*10;activate();ready();eq(attack().map(c=>c.moveId),Array(count).fill('E'));}
 // Resource state is sequential inside BBE; waivers belong only to E.
 const breath=g.CombatSkills.getSkill('combat_basic_breath'),originalBar=plain(breath.breath_bar);
 breath.breath_bar.action_delta={test_gain:{type:'flat',value:5},test_spend:{type:'flat',value:-8}};
 breath.breath_bar.weapon_diqi_cost={'*':{ratio_of_diqi_max_at_10_power:.01,min:2,max:2}};
 skU.moves[1].action_tags=['test_gain'];skW.moves[0].action_tags=['test_spend'];
 setup({jump:signal('append')});I.setCombatState({hubs:{breath:breath.id}});g.Survival.setState({qi_li_current:0});activate();ready();strikes=attack();
 eq(strikes.map(c=>c.resourceResult.qiRestoreAmt),[5,5,0]);assert.equal(strikes[2].resourceResult.qiSpent,8);assert.equal(strikes[2].forceZeroDamageByResourceInsufficient,false,'B charges E before its resource check: '+JSON.stringify(strikes.map(c=>({qi:c.resourceResult.qiSpent,diqi:c.resourceResult.diqiSpent,need:c.resourceResult.diqiIntended,insufficient:c.resourceResult.insufficientDiqiForIntendedCost,core:c.resourceResult.coreConditionUnsatisfied}))));
 setup({jump:signal('append',{resource_waivers:['qi','diqi']})});g.Survival.setState({qi_li_current:0});activate();ready();strikes=attack();
 eq(strikes.map(c=>c.resourceResult.diqiIntended),[2,2,0]);assert.equal(strikes[2].resourceResult.qiIntended,0);
 setup({jump:signal('append')});playerSpeed=10;g.Survival.setState({qi_li_current:0});activate();ready();strikes=attack();
 eq(strikes.map(c=>c.moveId),['B','E']);assert(strikes[1].forceZeroDamageByResourceInsufficient,'insufficient E still executes once at zero damage');assert.equal(M.getState().queue.length,0);
 setup({jump:signal('replace',{resource_waivers:['qi','diqi']})});g.Survival.setState({qi_li_current:0});activate();ready();strikes=attack();
 assert(strikes.every(c=>!c.forceZeroDamageByResourceInsufficient&&c.resourceResult.qiSpent===0&&c.resourceResult.diqiSpent===0));
 // Explicit qi exemption must not disable a move's positive recovery.
 skW.moves[0].action_tags=['test_gain'];setup({jump:signal('replace',{resource_waivers:['qi']})});g.Survival.setState({qi_li_current:0});activate();ready();strikes=attack();
 assert(strikes.every(c=>c.resourceResult.qiRestoreAmt===5));
 breath.breath_bar=originalBar;skU.moves[1].action_tags=[];skW.moves[0].action_tags=[];
 // No unplayed move may grant its buff, even after a meta was selected.
 g.BuffSystem.registerRuntimeBuffTemplate({buff_id:'test_unplayed',durationTicks:10,maxStacks:1,stacksAddOnApply:1,triggerTags:['test_only'],effects:[]});
 skW.moves[0].on_hit_roll_success_apply_buff_actor='test_unplayed';
 setup({jump:signal('append')});activate();ready();
 const tracedRun=g.CombatPipeline.runPipeline,realDead=g.CombatEnemies.isEnemyDead;let dead=false;
 g.CombatEnemies.isEnemyDead=(...a)=>dead||realDead(...a);
 g.CombatPipeline.runPipeline=(name,ctx)=>{const result=tracedRun(name,ctx);if(ctx.attacker?.kind==='player')dead=true;return result;};
 eq(attack().map(c=>c.moveId),['B'],'target death cancels second B and E');assert(!g.BuffSystem.hasBuffByBuffId('player','test_unplayed'));
 g.CombatEnemies.isEnemyDead=realDead;g.CombatPipeline.runPipeline=tracedRun;delete skW.moves[0].on_hit_roll_success_apply_buff_actor;
 // Out of range is not an attack opportunity; walking/waiting must preserve queue.
 setup();activate();ready();enemy.x=p.x+5;attack();assert.equal(M.getState().queue.length,1);enemy.x=p.x+1;
 // Explicit multi-storage, fresh event IDs, and one meta per world tick.
 setup({jump:signal('replace',{max_pending:2})});M.notify('test_signal',{value:true,event_id:'same'});M.notify('test_signal',{value:true,event_id:'same'});assert.equal(M.getState().queue.length,1);
 M.notify('test_signal',{value:true,event_id:'second'});assert.equal(M.getState().queue.length,2);ready();
 const one=M.select({skip:true},enemy);M.consume(one);assert.equal(M.select({skip:true},enemy).entry,null);assert.equal(M.getState().queue.length,1);
 // Definition-owned activation cost and cancellation refund; neither can chain.
 const charged={...signal(),metaskill:{...signal().metaskill,activation_policy:'test_policy'}};
 M.registerActivationPolicy('test_policy',{canActivate:ctx=>ctx.self.qi>=5,onActivate:()=>{g.Survival.consumeQiLi(5);return {paid:5};},onCancel:receipt=>g.Survival.addQiLi(receipt.paid)});
 const low={...stateVariant,metaskill:{...stateVariant.metaskill,condition:{kind:'state',listen:['resource_changed','world_tick'],test:{path:'self.qi',op:'lte',value:5}}}};
 setup({jump:charged,chain:low},{front:['jump'],side1:['chain']});g.Survival.setState({qi_li_current:10});M.notify('resource_changed');activate();assert.equal(g.Survival.getState().qi_li_current,5);eq(M.getState().queue.map(e=>e.variantId),['jump']);
 ready();g.CharacterAttributes.isBodyPartDestroyedForParry=id=>id==='right_arm'||destroyed(id);M.select({skip:true},enemy);
 assert.equal(g.Survival.getState().qi_li_current,10,'refund uses the declared policy');assert.equal(M.getState().queue.length,0);g.CharacterAttributes.isBodyPartDestroyedForParry=destroyed;
 // A meta-owned delayed buff keeps its provenance through save/load and expiry.
 const delayed='test_meta_delayed';
 g.BuffSystem.registerRuntimeBuffTemplate({buff_id:delayed,durationTicks:3,onsetTicks:1,maxStacks:1,stacksAddOnApply:1,applyMode:'always_apply',triggerEventKind:['world'],triggerEventName:['tick_advanced'],effects:[{type:'survival_delta',params:{stamina:10}}]});
 const stamina={...stateVariant,metaskill:{...stateVariant.metaskill,condition:{kind:'state',listen:['resource_changed','world_tick'],test:{path:'self.survival.stamina',op:'gte',value:15}}}};
 setup({jump:stamina});g.Survival.setState({stamina:10});M.notify('resource_changed');M.withSource('metaskill:delayed',()=>g.BuffSystem.applyBuff('player',delayed,'test'));
 assert(g.SaveSystem.applySnapshotForDebug(g.SaveSystem.buildSnapshotForDebug()));
 assert(g.BuffSystem.getState().instancesByOwner.player.find(b=>b.buff_id===delayed).metaskill_source);
 ready();g.BuffSystem.triggerBuffPipeline({event_kind:'world',event_name:'tick_advanced',event_id:'delayed_tick',tick:g.GameTime.getState().totalTicks,tags:['time','tick'],actor_id:'player'});
 assert(g.Survival.getState().stamina>=20);ready();assert.equal(M.getState().queue.length,0,'delayed meta buff cannot activate a state metaskill');
 const expired={...stateVariant,metaskill:{...stateVariant.metaskill,condition:{kind:'state',listen:['buff_changed','world_tick'],test:{path:'self.buff_stacks.'+delayed,op:'eq',value:0}}}};
 setup({jump:expired});M.notify('world_tick');g.GameTime.advanceTicks(5);g.BuffSystem.triggerBuffPipeline({event_kind:'world',event_name:'tick_advanced',event_id:'expiry_tick',tick:g.GameTime.getState().totalTicks,tags:['time','tick']});ready();
 assert.equal(M.getState().queue.length,0,'expiry is also a meta-caused state change');
 // Swap removes only the old weapon's queued entries; unarmed FIFO survives.
 setup({a:signal(),e:signal(),f:signal()},{lhand:['a'],front:['e'],side1:['f']});activate();const oldWeapon=W.equipped().item;
 M.weaponChanged(undefined);assert.equal(M.getState().queue.length,3,'non-weapon/missing IDs never clear unarmed entries');
 I.unequip('weapon_right');eq(M.getState().queue.map(e=>e.variantId),['a']);assert(I.equip('weapon_right',oldWeapon).success);
 assert.equal(W.equipped().item.weapon_combat.attackCursor,0);assert.equal(M.bindings().filter(b=>b.mode==='weapon').length,0);
 setup({jump:signal('replace',{cooldown_ticks:20})});activate();const editActivation=g.GameTime.getState().totalTicks;
 g.SceneApp.openCombatPanel();await h.drain();
 const beforeEdit=g.GameTime.getState().totalTicks;
 assert(g.SceneApp.combatApi.setCombat({move_sequences:{rhand:['B','variant:jump']}}));
 assert.equal(g.GameTime.getState().totalTicks,beforeEdit+1,'actual panel command consumes a battle action');assert.equal(M.getState().queue.length,0);assert(Object.values(M.getState().cooldowns).includes(editActivation+20));
 g.SceneApp.combatApi.close();
 // Save/load is exact and grants no new activations or time. Target changes don't clear.
 setup({jump:signal('replace',{cooldown_ticks:20})});activate();const before=M.getState(),tick=g.GameTime.getState().totalTicks;
 const saved=g.SaveSystem.buildSnapshotForDebug();assert(g.SaveSystem.applySnapshotForDebug(saved));eq(M.getState(),plain(before));assert.equal(g.GameTime.getState().totalTicks,tick);
 const malformed=plain(saved);malformed.metaskills.seenEvents=null;assert.equal(g.SaveSystem.applySnapshotForDebug(malformed),false);eq(M.getState(),plain(before),'invalid save rejected before state mutation');
 g.CombatEngagement.engageEnemy({mapId:p.mapId,index:index+1,enemyId:'other',record:{enemy_id:'other'},reason:'test'});eq(M.getState(),plain(before));
 g.CombatEngagement.clear('test_disengage');assert.equal(M.getState().queue.length,0);eq(M.getState().cooldowns,plain(before.cooldowns));assert.equal(I.getLimbStrikeOrderCursor(),0);assert.equal(W.equipped().item.weapon_combat.attackCursor,0);
 // Component fallback moves cannot acquire metaskills, even through the config API.
 W.reset(W.equipped().item);assert.equal(W.setMoveConfig('front',{move_id:'weapon_basic_front_thrust',variants:['jump']}),false);assert.equal(M.bindings().filter(b=>b.mode==='weapon').length,0);
 assert.deepEqual(h.errors,[]);
 console.log('PASS metaskill production-scene integration: EE / BBE, cycles, FIFO, dedup, state edges, no chains, cooldowns, range, interruption, simultaneous strikes, saves, disengagement, fallback restrictions.');
}catch(error){console.error(error);throw error;}finally{await h.close();}

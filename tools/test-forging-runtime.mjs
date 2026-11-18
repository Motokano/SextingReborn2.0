import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),copy=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const c=vm.createContext({console,Math,Date,Uint32Array,JSON});c.window=c;
 let flags={},stamina=1000,ticks=0,onTick=()=>{},saving=true;
 c.NPCSystem={getFlagValue:k=>copy(flags[k]??null),setDemoFlag:(k,v)=>flags[k]=copy(v),isDemoFlagTrue:k=>flags[k]===true,getDemoState:()=>copy(flags),setDemoState:s=>flags=copy(s)};
 c.UIText={t:k=>k};c.GameEngine={getState:()=>({mapId:'M0_Base_Inside_lv_1',x:5,y:12}),getInteractNpcIdAt:()=> 'npc.station.forging_base'};
 c.SaveSystem={saveNow:()=>saving};c.Survival={getState:()=>({stamina}),isDead:()=>false,canPerformStaminaOrEnergyAction:()=>true,getIntensityRate:k=>({low:.4,medium:.6,high:1})[k],getActionStaminaCost:n=>n*1.25,consumeStamina:(n,o)=>{assert(o.raw);stamina-=n;},advanceTick:({actionCost=0}={})=>{stamina-=actionCost;ticks++;onTick();}};
 for(const file of ['item-attribute-modules','inventory-equipment','item-assembly','combat-engagement','forging-config','forging-board-core','forging-rules','forging-system'])vm.runInContext(read('js/'+file+'.js'),c,{filename:file});
 const I=c.InventoryEquipment,S=c.ForgingSystem,R=c.ForgingRules,C=c.ForgingConfig;
 I.setConfig({equipment:{bag:{item_id:'bag',equip_slot:'backpack',backpack_slots:150}},items:c.ItemAttributeModules.hydrateCatalog(C.catalog),modules:{},default_equipment:{}});
 I.setState({equipment:{backpack:{item_id:'bag'}},inventory_backpack:[],inventory_pocket:[],inventory_vest:[],ground_items:{},skills:{survival_language:{level:10},life_forging:{level:1,move_usage:{}}}});
 flags.forging_station_unlocked=true;
 const give=(id,state={})=>{const item=I.ensureItemInstanceIdentity({item_id:id,count:1,...state});assert(I.putItemIntoDefaultContainer(item).placed);return item.instance_id;};
 const known=(patch)=>{const s=S.state();for(const [k,v]of Object.entries(patch))Object.assign(s.knowledge[k],v);c.NPCSystem.setDemoFlag('forging_runtime_v1',s);};
 const finish=()=>{let n=0;while(S.state().job?.phase==='work'){const r=S.step();assert(r.ok,r.message);assert(++n<80);}};
 return {c,I,S,R,C,give,known,finish,get ticks(){return ticks},get stamina(){return stamina},set onTick(fn){onTick=fn},set saving(v){saving=v}};
}
{
 const h=harness(),{S,I,C,give,finish}=h,raw=give('ore_iron_raw');
 assert.equal(S.snapshot().components.length,0);assert.equal(S.name('ore_iron_raw'),I.getItemTemplate('ore_iron_raw').placeholder_name);
 assert(!S.start({type:'process',id:raw}).ok);assert(S.inspectOre(raw).ok);assert(!S.identified('ore_iron_raw'));assert.equal(h.ticks,0);
 assert(S.identify(raw).ok);assert(S.start({type:'process',id:raw}).ok);assert(!I.findItemInstanceRecord(raw));
 assert(S.step().ok);assert.equal(I.countCarriedItemsByTemplateId('material_forging_iron'),0);assert(S.cancel().ok);assert(I.findItemInstanceRecord(raw));
 assert(S.start({type:'process',id:raw}).ok);finish();assert.equal(I.countCarriedItemsByTemplateId('material_forging_iron'),1);assert.equal(I.countCarriedItemsByTemplateId('ore_iron_raw'),0);assert.equal(S.state().job,null);
 assert.equal(I.getSkillsState().life_forging.move_usage.forging_xp_units,500);
 const sample=give('weapon_component_b01');assert(S.start({type:'research',id:sample}).ok);assert(!I.findItemInstanceRecord(sample));assert(!S.state().knowledge.structures.B01);
 assert(S.step().ok);S.pause();const saved=copy(S.state());S.onLoad();assert.equal(S.state().job.elapsed,saved.job.elapsed);finish();assert(S.state().knowledge.structures.B01);assert(!S.state().knowledge.recipes[sample]);
 for(let i=0;i<5;i++)give('material_forging_iron');
 assert(S.start({type:'craft',partId:'weapon_component_b01',recipe:{material_forging_iron:6}}).ok);assert.equal(I.countCarriedItemsByTemplateId('material_forging_iron'),0);
 const seed=S.state().job.seed,board=copy(S.state().job.board),before=h.ticks;finish();assert.equal(h.ticks-before,12);assert.equal(S.state().job.phase,'board');assert.deepEqual(copy(S.state().job.board),board);
 S.onLoad();assert.equal(S.state().job.seed,seed);assert(S.boardAction({kind:'heavy',index:0}).ok);const after=copy(S.state().job.board),t=h.ticks;S.onLoad();assert.deepEqual(copy(S.state().job.board),after);assert.equal(h.ticks,t);
 assert(S.boardAction({kind:'finish'}).ok);assert(!S.boardAction({kind:'finish'}).ok);const id=S.state().lastResult.instanceId,item=I.findItemInstanceRecord(id).instance;
 assert(item.forged_component);assert(S.state().knowledge.recipes[id]);assert(I.auditItemOwnership().ok);assert.equal(I.getItemCombinedWeight(item),item.forged_component.final_weight_kg);
 assert.equal(S.describe(item),S.description(item.item_id),'low skill does not reveal numerical stats');
}
{
 const h=harness(),{S,I,C,R,give,known,finish,c}=h;
 const f=()=>R.result(C.components.weapon_component_b01,{material_forging_iron:6},100,.3);
 let part=f();part.durability_current=0;part.durability_units=0;part.zero_durability_result='rolled';
 const id=give('weapon_component_b01',{forged_component:part}),kit=give('tool_repair_roll'),tool=give('tool_repair_whetstone');
 assert(S.toolAction({type:'tool-attach',hostId:kit,anchor:'whetstone',id:tool}).ok);assert.equal(I.getItemCombinedWeight(I.findItemInstanceRecord(kit).instance),2.3);
 assert(S.start({type:'repair',id,kitId:kit}).ok);assert(S.isInstanceLocked(kit));assert(!S.toolAction({type:'tool-detach',hostId:kit,anchor:'whetstone'}).ok);
 h.onTick=()=>c.CombatEngagement.engageEnemy({mapId:'M0_Base_Inside_lv_1',record:{},enemyId:'test',index:0});assert(S.step().ok);assert.equal(S.state().job,null);assert.equal(I.findItemInstanceRecord(id).instance.forged_component.durability_current,0);assert(!I.getSkillsState().life_forging.move_usage.forging_xp_units);
 assert(!S.start({type:'repair',id,kitId:kit}).ok);c.CombatEngagement.clear();h.onTick=()=>{};
 assert(S.start({type:'repair',id,kitId:kit}).ok);const q=S.state().job,paid=h.stamina;finish();assert(Math.abs(paid-h.stamina-q.stamina)<1e-7);assert.equal(I.findItemInstanceRecord(id).instance.forged_component.durability_current,q.target);assert.equal(I.findItemInstanceRecord(id).instance.forged_component.zero_durability_result,null);assert(!S.start({type:'repair',id,kitId:kit}).ok);
 // Last world tick entering combat must not commit a repair either.
 I.findItemInstanceRecord(id).instance.forged_component.durability_current=q.target-1;
 assert(S.start({type:'repair',id,kitId:kit}).ok);h.onTick=()=>c.CombatEngagement.engageEnemy({mapId:'M0_Base_Inside_lv_1',record:{},enemyId:'test2',index:1});S.step();assert.equal(I.findItemInstanceRecord(id).instance.forged_component.durability_current,q.target-1);
 // Even a failed persistence write cannot revive an interrupted repair.
 c.CombatEngagement.clear();h.onTick=()=>{};assert(S.start({type:'repair',id,kitId:kit}).ok);
 h.saving=false;c.CombatEngagement.engageEnemy({mapId:'M0_Base_Inside_lv_1',record:{},enemyId:'save-failure',index:2});
 assert(S.state().job.interrupted);c.CombatEngagement.clear();h.saving=true;assert(!S.step().ok);assert.equal(S.state().job,null);
 assert.equal(I.findItemInstanceRecord(id).instance.forged_component.durability_current,q.target-1);
}
{
 const h=harness(),{S,I,C,R,give,finish}=h,part=C.components.weapon_component_m05_t2;
 delete I.getSkillsState().life_forging;
 const feed={material_forging_iron:part.capacity},id=give(part.itemId,{forged_component:R.result(part,feed,100,.2)});
 assert(S.start({type:'attach',id,anchor:'front'}).ok);finish();const host=S.snapshot().items.find(x=>x.item_id==='weapon_single_hand_assembly');assert(host);
 let coverage=R.coverage(host);assert.equal(coverage.parts.length,1);assert.equal(Object.keys(coverage.positions).length,3);assert(!coverage.complete);
 assert.equal(S.level(),0,'zero XP assembly must not grant a skill level');
 assert(!h.c.ItemAssembly.validateAssembly(host,{requireComplete:true}).ok);
 const b=C.components.weapon_component_b01,blade=give(b.itemId,{forged_component:R.result(b,{material_forging_iron:b.capacity},100,.1)});
 assert(!S.start({type:'attach',hostId:host.instance_id,id:blade,anchor:'side1'}).ok);
 assert(!h.c.ItemAssembly.detachToInventory(host.instance_id,'front').ok,'generic UI cannot bypass paid station work');
 assert(S.start({type:'detach',hostId:host.instance_id,anchor:'front'}).ok);finish();assert(I.findItemInstanceRecord(id));assert(I.auditItemOwnership().ok);
}
{
 const {C,R,S,I,known,give,finish}=harness(),part=C.components.weapon_component_b01;
 const m=R.material(part,{material_forging_iron:6});assert(m.eligible);
 const p=R.result(part,{material_forging_iron:6},0,0);assert.equal(p.ore_trait,null);assert.equal(p.durability_max,R.round(part.baseline.durabilityMax*m.durability*.25));
 assert.equal(R.result(part,{material_forging_iron:6},100,0).ore_trait.id,'ore_edge_preservation');
 const mix={material_forging_iron:3,material_forging_tin:3};assert.equal(R.result(part,mix,99,.5).ore_trait,null);assert.equal(R.result(part,mix,100,.5).ore_trait.id,'C01');
 assert.equal(R.result(part,{material_forging_titanium:3,material_forging_gold:3},0,0).ore_trait.kind,'negative');
 const lo={...part,requirements:{hardness:220,toughness:240,deformationResistance:200,density:200},capacity:10};assert(R.material(lo,{material_forging_iron:3}).eligible);assert(!R.material(lo,{material_forging_iron:2}).eligible);
 for(const p of Object.values(C.components)){assert(p.board&&p.costs);assert(R.result(p,{material_forging_iron:p.capacity},100,0).durability_max>0);}
 I.getSkillsState().life_forging.level=99;I.getSkillsState().life_forging.move_usage.forging_xp_units=4999999;S.gainXp(.001);assert.equal(S.level(),100);assert.equal(I.getSkillsState().life_forging.move_usage.forging_xp_units,0);
}
{
 const h=harness(),raw=h.give('ore_iron_raw');h.S.inspectOre(raw);const before=copy(h.I.getState());h.saving=false;assert(!h.S.start({type:'process',id:raw}).ok);assert(h.I.findItemInstanceRecord(raw));assert.equal(h.S.state().job,null);
}
console.log('PASS forging runtime: knowledge, 1:1 processing, destructive research, fixed paid ticks, saved board RNG, one trait, assembly occupancy, repair interruption, costs, XP, save rollback.');

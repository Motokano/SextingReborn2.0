import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let flags={},nearby=true,saveOk=true,saved;
const c=vm.createContext({console,Math,Date});c.window=c;
c.NPCSystem={getFlagValue:k=>flags[k],isDemoFlagTrue:k=>flags[k]===true,setDemoFlag:(k,v)=>flags[k]=v,getDemoState:()=>JSON.parse(JSON.stringify({flags})),setDemoState:s=>flags=s.flags};
c.StationContext={getCurrentCookingStationContext:()=>nearby?{station_type:'main'}:null,isCookingUiBlockedByRepairForContext:()=>!flags.cooking_base_station_unlocked};
c.SaveSystem={saveNow:()=>{if(saveOk)saved=JSON.parse(JSON.stringify({npc:c.NPCSystem.getDemoState(),inventory:c.InventoryEquipment.getState()}));return saveOk;}};
for(const file of ['js/item-attribute-modules.js','js/inventory-equipment.js','js/facility-unlock-config.js','js/facility-unlock.js','js/cooking-repair.js'])vm.runInContext(read(file),c);
const IE=c.InventoryEquipment,R=c.CookingRepair;
IE.setConfig({equipment:{bag:{item_id:'bag',equip_slot:'backpack',backpack_slots:20}},items:c.ItemAttributeModules.hydrateCatalog(JSON.parse(read('data/item-catalog-v2.json'))),modules:{},default_equipment:{}});
function reset(){flags={};saveOk=true;nearby=true;IE.setState({equipment:{backpack:{item_id:'bag'}},inventory_backpack:[{item_id:'ore_clay_raw',count:6},{item_id:'ore_limestone',count:3},{item_id:'wood_plank_soft',count:3},{item_id:'wood_bamboo_green',count:5},{item_id:'ore_granite',count:1}],inventory_pocket:[],inventory_vest:[],ground_items:{}});}
function learn(){const doc=JSON.parse(read('data/npc/npc_station_cooking_base_triggers.json'));const lesson=doc.entries.find(e=>e.id==='station.cooking.repair_material_lesson');for(const e of lesson.effects)flags[e.params.flag]=e.params.value;assert.ok(!doc.entries.some(e=>e.id==='station.cooking.repair_unlock'));}
reset();assert.equal(R.rows().length,5,'suitable materials available without inspection');assert.equal(R.preview({ore_clay_raw:1}).ok,true);learn();assert.equal(R.rows().length,5);assert.ok(R.rows().every(i=>i.name!==IE.getItemTemplate(i.id).sn),'display uses existing recognition');
assert.equal(R.preview({ore_granite:1}).ok,true,'repair use knowledge is no longer required');assert.equal(R.repair({not_a_material:1}).ok,false,'unrelated materials still rejected');
assert.equal(R.repair({ore_clay_raw:99}).ok,false);assert.equal(R.repair({ore_clay_raw:1.5}).ok,false);
nearby=false;assert.equal(R.repair({ore_clay_raw:1}).ok,false);nearby=true;
assert.equal(R.repair({ore_clay_raw:1}).ok,true);assert.equal(R.state().stone,2);assert.equal(IE.countCarriedItemsByTemplateId('ore_clay_raw'),5);
const restored=JSON.parse(JSON.stringify(saved));flags={};c.NPCSystem.setDemoState(restored.npc);IE.setState(restored.inventory);assert.equal(R.state().stone,2,'partial progress restored together with inventory');
assert.equal(R.repair({wood_plank_soft:2}).ok,false,'later part must wait');
let out=R.repair({ore_clay_raw:5,ore_limestone:3});assert.equal(out.ok,true);assert.ok(out.returned.length>0);assert.notEqual(flags.cooking_base_station_unlocked,true);
out=R.repair({wood_plank_soft:3,wood_bamboo_green:5});assert.equal(out.ok,true);assert.equal(flags.cooking_base_station_unlocked,true);assert.ok(out.returned.length>0);assert.equal(IE.countCarriedItemsByTemplateId('wood_plank_soft'),1);assert.equal(IE.countCarriedItemsByTemplateId('wood_bamboo_green'),5);assert.equal(R.repair({ore_clay_raw:1}).ok,false,'no duplicate repair');
reset();learn();saveOk=false;const before=JSON.stringify(IE.getState());assert.equal(R.repair({ore_clay_raw:1}).ok,false);assert.equal(JSON.stringify(IE.getState()),before,'save failure rolls inventory back');assert.equal(R.state().stone,0);assert.notEqual(flags['repair_material_used:ore_clay_raw'],true,'save failure does not remember material use');
reset();learn();const remove=IE.removeCarriedItemsByTemplateId;IE.removeCarriedItemsByTemplateId=(id,n,o)=>id==='ore_limestone'?{ok:false}:remove(id,n,o);const atomic=JSON.stringify(IE.getState());assert.equal(R.repair({ore_clay_raw:2,ore_limestone:2}).ok,false);assert.equal(JSON.stringify(IE.getState()),atomic,'later item failure rolls earlier deductions back');IE.removeCarriedItemsByTemplateId=remove;
flags={cooking_base_station_unlocked:true};assert.equal(R.state().stone,10,'old unlocked saves stay unlocked');R.reset();assert.equal(flags['repair_use_known:ore_clay_raw'],false);
// Each part shows its first basic material; alternatives need stock or saved consumption.
reset();learn();const held=JSON.parse(JSON.stringify(IE.getState()));
assert.equal(R.preview({ore_limestone:1}).ok,true);assert.equal(R.inspect().ok,true);
IE.setState({...held,inventory_backpack:[]});
const basics=['ore_clay_raw','wood_plank_soft'];
assert.deepEqual(Array.from(R.rows(true),i=>i.id),basics,'only basic materials are disclosed without stock or history');
assert.equal(R.rows().length,0,'default visibility does not provide stock');
assert.equal(R.repair({ore_clay_raw:1}).ok,false,'visible basic materials still require actual inventory');
assert.equal(R.inspect().message,R.groups.map(group=>group.note+'：'+R.rows(true).find(i=>i.group===group.id).name+'。').join('\n'),'legacy inspection reveals only visible materials');
for(const id of Object.keys(c.FacilityUnlockConfig.projects)){
 const model=c.FacilityUnlock.get(id),visible=model.rows(true);
 assert.equal(visible.length,model.groups.length,id+' has one default material per part');
 assert.ok(visible.every(i=>i.basic&&i.stock===0));
 assert.equal(visible.some(i=>i.id==='hus_wool'),false,'ineligible wool never becomes a basic repair material');
}
flags.cooking_base_repair_progress={stone:2};
assert.deepEqual(Array.from(R.rows(true),i=>i.id),basics,'old aggregate progress does not discover alternatives');
reset();IE.setState({...held,inventory_backpack:[{item_id:'ore_limestone',count:1}]});
const discovered=['ore_clay_raw','ore_limestone','wood_plank_soft'];
assert.deepEqual(Array.from(R.rows(true),i=>i.id),discovered,'held alternative appears alongside basic materials');
saveOk=false;assert.equal(R.repair({ore_limestone:1}).ok,false);assert.notEqual(flags['repair_material_used:ore_limestone'],true);saveOk=true;
assert.equal(R.repair({ore_limestone:1}).ok,true);assert.equal(IE.countCarriedItemsByTemplateId('ore_limestone'),0);
assert.deepEqual(Array.from(R.rows(true),i=>i.id),discovered,'consumed alternative remains visible at zero stock');
assert.deepEqual(Array.from(c.FacilityUnlock.get('pharmacy').rows(true),i=>i.id),discovered,'actual material use is shared across facilities');
const learned=JSON.parse(JSON.stringify(saved));flags={};c.NPCSystem.setDemoState(learned.npc);IE.setState(learned.inventory);
assert.deepEqual(Array.from(R.rows(true),i=>i.id),discovered,'alternative material history survives save restoration');
reset();assert.equal(R.repair({ore_granite:2}).ok,false);assert.notEqual(flags['repair_material_used:ore_granite'],true,'rejected offer does not teach');
assert.equal(R.repair({ore_clay_raw:5}).ok,true);
out=R.repair({wood_plank_soft:3,wood_bamboo_green:5});assert.equal(out.ok,true);
assert.equal(flags['repair_material_used:wood_plank_soft'],true);assert.notEqual(flags['repair_material_used:wood_bamboo_green'],true,'offered but returned material does not teach');
IE.setState({...held,inventory_backpack:[]});
assert.equal(R.rows(true).some(i=>i.id==='wood_bamboo_green'),false);
console.log('PASS: real inventory, recognition, partial repair/save, whole returns, stale/unknown inputs, rollback and old unlocks.');

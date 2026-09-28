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
reset();assert.equal(R.rows().length,0);assert.equal(R.repair({ore_clay_raw:1}).ok,false);learn();assert.equal(R.rows().length,4);assert.ok(R.rows().every(i=>i.name!==IE.getItemTemplate(i.id).sn),'display uses existing recognition');
assert.equal(R.repair({ore_granite:1}).ok,false,'unknown use cannot be submitted');
assert.equal(R.repair({ore_clay_raw:99}).ok,false);assert.equal(R.repair({ore_clay_raw:1.5}).ok,false);
nearby=false;assert.equal(R.repair({ore_clay_raw:1}).ok,false);nearby=true;
assert.equal(R.repair({ore_clay_raw:1}).ok,true);assert.equal(R.state().stone,2);assert.equal(IE.countCarriedItemsByTemplateId('ore_clay_raw'),5);
const restored=JSON.parse(JSON.stringify(saved));flags={};c.NPCSystem.setDemoState(restored.npc);IE.setState(restored.inventory);assert.equal(R.state().stone,2,'partial progress restored together with inventory');
let out=R.repair({ore_clay_raw:5,ore_limestone:3,wood_plank_soft:3,wood_bamboo_green:5});assert.equal(out.ok,true);assert.equal(flags.cooking_base_station_unlocked,true);assert.ok(out.returned.length>0);assert.equal(IE.countCarriedItemsByTemplateId('wood_plank_soft'),1);assert.equal(IE.countCarriedItemsByTemplateId('wood_bamboo_green'),5);assert.equal(R.repair({ore_clay_raw:1}).ok,false,'no duplicate repair');
reset();learn();saveOk=false;const before=JSON.stringify(IE.getState());assert.equal(R.repair({ore_clay_raw:1}).ok,false);assert.equal(JSON.stringify(IE.getState()),before,'save failure rolls inventory back');assert.equal(R.state().stone,0);
reset();learn();const remove=IE.removeCarriedItemsByTemplateId;IE.removeCarriedItemsByTemplateId=(id,n,o)=>id==='wood_plank_soft'?{ok:false}:remove(id,n,o);const atomic=JSON.stringify(IE.getState());assert.equal(R.repair({ore_clay_raw:5,wood_plank_soft:2}).ok,false);assert.equal(JSON.stringify(IE.getState()),atomic,'later item failure rolls earlier deductions back');IE.removeCarriedItemsByTemplateId=remove;
flags={cooking_base_station_unlocked:true};assert.equal(R.state().stone,10,'old unlocked saves stay unlocked');R.reset();assert.equal(flags['repair_use_known:ore_clay_raw'],false);
console.log('PASS: real inventory, recognition, partial repair/save, whole returns, stale/unknown inputs, rollback and old unlocks.');

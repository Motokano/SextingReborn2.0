import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { CATEGORY_GROUP_FIELDS, hydrateModularCatalog } from './item-attribute-catalog.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const catalog=json('data/forging/item-catalog-v2.json');
const bindings=json('data/forging/item-bindings-v1.json');
const knowledge=json('data/forging/item-knowledge-v1.json');
const requirements=json('docs/design/examples/weapon-forging-material-requirements-v1.json');
const balance=json('docs/design/examples/weapon-forging-balance-v1.json');
const repair=json('docs/design/examples/weapon-repair-tool-knowledge-v1.json');
const ores=json('docs/design/examples/weapon-forging-ores-v1.json');
const extra=json('docs/design/examples/weapon-ore-intrinsic-traits-v1.json');
const sourceOres=[...ores.ores,...extra.oreAdditions];
const counts={};
const designIds=new Set();
for(const [id,d] of Object.entries(bindings.components)){
  assert(!designIds.has(d.designId));designIds.add(d.designId);counts[d.group]=(counts[d.group]||0)+1;
  const spec=requirements.components.find(c=>c.id===d.designId);assert(spec,id);
  assert.equal(d.repairToolItemId,repair.repair_targets[d.designId]);
  assert.equal(knowledge.components.knowledgeKeyByItem[id],d.structureKnowledgeKey);
  assert.equal(catalog.items[id].weight_kg,d.baseline.weightKg);
  assert(d.baseline.innateStrength>=10);
  assert(d.baseline.weightKg/spec.requirements.density<=0.01,'feed lighter than possible retained product: '+id);
  for(const placement of d.placements){
    assert.equal(new Set(placement.occupies).size,placement.occupies.length);
    assert(placement.occupies.includes(placement.anchor));
    const slots=d.positions.map(p=>p.slot==='side'?placement.anchor:p.slot);
    assert.deepEqual(slots,placement.occupies,id+' attack coverage');
    assert(catalog.items[id].attribute_modules.structure.assembly_part.assembly_types.includes('weapon.single_hand.'+placement.anchor));
  }
  for(const p of d.positions){
    assert(p.basePower>0&&Number.isFinite(p.basePower));
    assert(bindings.fallbackMoves.ids.includes(p.fallbackMoveId));
    if(p.blockEligible)assert(p.blockCoefficient>0&&p.deflectionCoefficient>0);
    else assert(p.blockCoefficient===null&&p.deflectionCoefficient===null);
    if(p.slot==='front')assert.equal(p.blockEligible,false);
  }
}
assert.deepEqual(counts,{B:17,T:12,D:18,H:18,M:18});
assert.deepEqual(designIds,new Set(requirements.components.map(c=>c.id)));
assert.equal(Object.keys(catalog.items).length,112);
assert.equal(bindings.activation.automaticRegistration,true);
assert.deepEqual(bindings.activation.requires,['modular_weapon_combat']);
assert.equal(bindings.forgedInstanceContract.maxOreTraits,1);
assert.equal(bindings.components.weapon_component_h01.damageRules.speedAtZeroOverride,0);
assert.equal(bindings.components.weapon_component_h07.damageRules.speedAtZeroOverride,null);
for(const h of Object.values(bindings.components).filter(d=>d.group==='H'))assert.equal(h.damageRules.disableBlockAtZero,h.positions[0].blockEligible);

for(const [feedId,r] of Object.entries(bindings.feedRoutes)){
  const ore=sourceOres.find(o=>o.id===r.rawItemId),cost=balance.ores.find(o=>o.id===r.rawItemId).processing;
  assert(ore&&catalog.items[feedId]);assert.equal(cost.outputItemId,feedId);
  assert.equal(r.inputCount,1);assert.equal(r.outputCount,1);assert.equal(r.byproducts.length,0);
  assert.notEqual(feedId,r.rawItemId);
  assert.equal(catalog.items[feedId].weight_kg,ore.scores.density/100);
  assert(catalog.items[feedId].weight_kg<=catalog.items[r.rawItemId].weight_kg);
  assert.equal(r.routeKey,ore.id);
}
assert.equal(Object.keys(bindings.feedRoutes).length,12);
assert.deepEqual(knowledge.stationInspection,ores.itemInformation.recognitionMethod.processingInspection);
assert.deepEqual(balance.operationPolicies.oreProcessingInspection,knowledge.stationInspection);
assert.equal(knowledge.stationInspection.consumeSample,0);
assert.equal(knowledge.stationInspection.identityKnownRequired,false);
assert(!knowledge.stationInspection.grants.includes('component_structure'));
assert(!knowledge.stationInspection.grants.includes('raw_identity'));

// Check every modular field against the real schema; unknown fields must not disappear silently.
for(const [id,item] of Object.entries(catalog.items)){
  for(const [category,groups] of Object.entries(item.attribute_modules))for(const [group,fields] of Object.entries(groups)){
    const allowed=CATEGORY_GROUP_FIELDS[category]?.[group];assert(allowed,id+': unknown group');
    for(const field of Object.keys(fields))assert(allowed.includes(field),id+': unknown field '+field);
    assert(Object.keys(fields).length,id+': empty group');
  }
  assert.equal(item.attribute_modules.base.stacking.stack_limit,1);
  assert.equal(item.attribute_modules.equipment?.combat,undefined,'do not expose static complete-weapon combat stats');
}
const permittedExisting=new Set(sourceOres.map(o=>o.id));
for(const f of ['data/item-catalog-v2.json','data/equipment-catalog-v2.json','data/attachment-catalog-v2.json']){
  for(const id of Object.keys(json(f).items))if(catalog.items[id])assert(permittedExisting.has(id),'unplanned live ID collision: '+id);
}

let references=0;
function verifyReferences(value){
  if(Array.isArray(value)){value.forEach(verifyReferences);return;}
  if(value&&typeof value==='object'){Object.values(value).forEach(verifyReferences);return;}
  if(typeof value!=='string'||!/^\.\.\/\.\.\/.+\.(json|md)(#.*)?$/.test(value))return;
  const [file,fragment]=value.split('#');const absolute=path.resolve(root,'data/forging',file);
  assert(fs.existsSync(absolute),'missing ref '+value);references++;
  if(file.endsWith('.json')&&fragment){let doc=JSON.parse(fs.readFileSync(absolute,'utf8'));for(const key of fragment.split('/').slice(1)){doc=doc?.[key.replaceAll('~1','/').replaceAll('~0','~')];assert(doc!==undefined,'bad pointer '+value);}}
  if(file.endsWith('.md')&&fragment){const headings=fs.readFileSync(absolute,'utf8').split(/\r?\n/).filter(l=>/^#+ /.test(l)).map(l=>l.replace(/^#+ /,'').toLowerCase().replace(/[，。：：、（）()]/g,'').replaceAll(' ','-'));assert(headings.includes(fragment.toLowerCase()),'bad heading '+value);}
}
verifyReferences(bindings);verifyReferences(knowledge);

// Use the shipped runtime loaders and connection implementation, in an isolated VM.
const ctx=vm.createContext({console,Math,Date});ctx.window=ctx;ctx.globalThis=ctx;ctx.UIText={t:k=>k};
for(const f of ['item-attribute-modules.js','inventory-equipment.js','item-assembly.js'])vm.runInContext(read('js/'+f),ctx);
const hydrated=ctx.ItemAttributeModules.hydrateCatalog(catalog);
assert.deepEqual(JSON.parse(JSON.stringify(hydrated)),hydrateModularCatalog(catalog));
const IE=ctx.InventoryEquipment,Assembly=ctx.ItemAssembly;
IE.setConfig({equipment:{test_forging_bag:{item_id:'test_forging_bag',equip_slot:'backpack',weight_kg:0,backpack_slots:12,backpack_weight_factor:1}},items:hydrated,modules:{},default_equipment:{}});
IE.setState({equipment:{backpack:{item_id:'test_forging_bag'}},inventory_backpack:[{item_id:'tool_repair_roll'},{item_id:'tool_repair_whetstone'},{item_id:'tool_repair_hammer'},{item_id:'tool_repair_pliers'}],inventory_pocket:[],inventory_vest:[],inventory_vehicle:[],ground_items:{}});
const kitId=IE.getState().inventory_backpack[0].instance_id;
for(const [i,slot] of ['whetstone','hammer','pliers'].entries())assert(Assembly.attachFromContainer(kitId,slot,'backpack',i+1).ok);
const kit=IE.findItemInstanceRecord(kitId).instance;
assert(Assembly.validateAssembly(kit,{requireComplete:true}).ok);
assert(Math.abs(IE.getItemCombinedWeight(kit)-6.8)<1e-9);
assert(IE.auditItemOwnership().ok);
const saved=JSON.stringify(IE.getState());IE.setState(JSON.parse(saved));
assert(Math.abs(IE.getItemCombinedWeight(IE.findItemInstanceRecord(kitId).instance)-6.8)<1e-9);
const emptyKit={item_id:'tool_repair_roll',instance_id:'empty-kit'};
assert(Assembly.validateAssembly(emptyKit,{requireComplete:true}).ok);
assert.equal(Assembly.validateAttach(emptyKit,'hammer',{item_id:'tool_repair_whetstone',instance_id:'wrong-tool'}).ok,false);

// Interpret declared occupancy for data validation only. The gameplay consumer is intentionally not implemented here.
let serial=0;
const weapon=parts=>({item_id:'weapon_single_hand_assembly',instance_id:'weapon-'+serial++,connections:Object.fromEntries(parts.map(([slot,id])=>[slot,{connection_schema_version:1,part:{item_id:'weapon_component_'+id.toLowerCase().replaceAll('-','_'),instance_id:'part-'+serial++}}]))});
function coverage(w){const occupied=new Set();for(const [slot,record] of Object.entries(w.connections||{})){const d=bindings.components[record.part.item_id],placement=d?.placements.find(p=>p.anchor===slot);if(!placement)return false;for(const p of placement.occupies){if(occupied.has(p))return false;occupied.add(p);}}return bindings.prototypes.single_hand.requiredAttackPositions.every(p=>occupied.has(p));}
const split=weapon([['front','T01'],['side1','B01'],['side2','B01'],['hilt','H01']]);
const single=weapon([['front','M05-T6'],['hilt','H18']]);
const head=weapon([['front','T01'],['side1','M01-T1'],['hilt','H01']]);
for(const w of [split,single,head])assert(coverage(w)&&Assembly.validateAssembly(w,{requireComplete:true}).ok);
assert(Math.abs(IE.getItemCombinedWeight(split)-0.92)<1e-9);
assert(Math.abs(IE.getItemCombinedWeight(single)-1.16)<1e-9);
assert.equal(Assembly.validateAssembly(single).instance_count,3);
assert.equal(coverage(weapon([])),false);
assert.equal(coverage(weapon([['side1','M01-T1'],['hilt','H01']])),false,'two-side head must still need a front');
assert.equal(coverage(weapon([['front','M05-T6'],['side2','B01'],['hilt','H18']])),false,'cross-position overlap');
assert.equal(coverage(weapon([['front','T01'],['side2','M01-T1'],['hilt','H01']])),false,'undeclared multi-part rotation');
console.log(`Verified 112 runtime-readable templates, 83 parts, 12 routes, ${references} source references, toolkit assembly/save/6.80 kg and weapon occupancy fixtures. Production and single-hand combat have separate integration tests.`);

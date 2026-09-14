import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture,species,items,read} from './lib/livestock-test-fixture.mjs';
let failed=0,passed=0;
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
function feed(f,n=1){for(let i=0;i<n;i++){for(const arm of Object.values(f.st.arms))for(const m of Object.values(arm))if(m&&!m.shadow&&m.module_id==='feed_trough')m.feed_units=f.ls.getTroughCapacity(m);f.tick();}}
function breeders(){const f=fixture();f.mount('arm4','cw_side','feed_trough',5);const father=f.animal('pig','z1',{weight_kg:120,perks:['fast_growth','hardy','meaty','light_eater']});const mother=f.animal('pig','z1',{weight_kg:120,gender:'female',perks:['slow_growth','fertile','lean','big_eater']});return {...f,father,mother};}
test('slaughter requires the correct equipment, including chickens in their own coop',()=>{
 const f=fixture(),a=f.animal('pig','z1',{weight_kg:120});assert.equal(f.ls.previewSlaughter(a.uid).reason,'no_slaughter');
 f.mount('axis','slot1','slaughter');f.st.power_charge=0;assert(f.ls.slaughterAnimal(a.uid).ok);
 const c=f.animal('chicken','arm2');f.mount('arm1','inner','coop');assert.equal(f.ls.previewSlaughter(c.uid).reason,'no_coop');
 f.mount('arm2','inner','coop');assert(f.ls.slaughterAnimal(c.uid).ok);
});
test('all configured cuts are reachable, health budgets are continuous, and scan outputs conserve mass',()=>{
 for(const [kind,sp] of Object.entries(species)){
  const f=fixture();f.mount('axis','slot1','slaughter');if(kind==='chicken')f.mount('arm1','inner','coop');
  const a=f.animal(kind,kind==='chicken'?'arm1':'z1',{weight_kg:sp.growth.fatten_cap_kg});
  const full=f.ls.previewSlaughter(a.uid);assert(full.ok);
  for(const id of [...sp.products.slaughter.meat_item_ids,...sp.products.slaughter.offal_item_ids,...sp.products.slaughter.byproduct_item_ids])assert(full.items.some(x=>x.item_id===id),kind+' '+id);
  for(const perk of [[],['meaty'],['lean']])for(const hp of [0.001,29.999,30,59.999,60,100])for(let i=1;i<=100;i++){
   a.perks=perk;a.hp=hp;a.weight_kg=sp.growth.fatten_cap_kg*i/100;
   const before=JSON.stringify(a),r=f.ls.previewSlaughter(a.uid);assert.equal(JSON.stringify(a),before);
   if(r.ok){const mass=r.items.reduce((n,x)=>n+x.count*items[x.item_id].weight_kg,0);near(mass,r.output_mass_kg);assert(mass<=a.weight_kg+1e-8);}
  }
  a.weight_kg=sp.growth.fatten_cap_kg;a.perks=[];
  for(const h of [30,60]){a.hp=h-0.0001;const x=f.ls.previewSlaughter(a.uid);a.hp=h;const y=f.ls.previewSlaughter(a.uid);if(x.ok&&y.ok)assert(y.usable_meat_kg-x.usable_meat_kg<0.001);}
 }
});
test('conception freezes independent children; parent mutation, death and reload cannot reroll a litter',()=>{
 const f=breeders();let seed=5;f.ctx.Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const random=f.ctx.Math.random;let first=true;f.ctx.Math.random=()=>{if(first){first=false;return 0;}return random();};
 for(let i=0;i<10000&&!f.mother.pregnant;i++)feed(f);
 assert(f.mother.pregnant);const expected=JSON.parse(JSON.stringify(f.mother.pregnant.children));
 assert(expected.length>=3);assert(new Set(expected.map(c=>c.perks.join(','))).size>1);
 const maternalSnapshot=JSON.stringify(f.mother.pregnant.mother);
 f.father.perks=[];f.mother.perks=[];f.st.animals.splice(f.st.animals.indexOf(f.father),1);
 f.mother.pregnant.remaining_ticks=1;f.mother.satiety=100;f.mother.hp=100;
 const saved=JSON.parse(JSON.stringify(f.st));const g=fixture();g.ls.setState(saved);g.ctx.Math.random=()=>0.99;
 const original=f.mother.weight_kg;feed(f);
 for(const arm of Object.values(g.ls.getState().arms))for(const m of Object.values(arm))if(m&&m.module_id==='feed_trough'&&!m.shadow)m.feed_units=450;
 g.tick();
 const children=f.st.animals.filter(a=>a!==f.mother);assert.equal(children.length,expected.length);
  const plans=xs=>JSON.parse(JSON.stringify(xs.map(a=>({species_id:a.species_id,gender:a.gender,perks:Array.from(a.perks)}))));
 assert.deepEqual(plans(children),expected);assert.deepEqual(plans(g.ls.getState().animals.filter(a=>a.uid!==f.mother.uid)),expected);
 assert(maternalSnapshot.includes('fertile'));near(f.mother.weight_kg+children.reduce((n,a)=>n+a.weight_kg,0),original+f.mother.nutrition_state.last.weight_gain_kg);
});
test('gestation spends nutrition and newborn satiety is transferred from the mother',()=>{
 const f=breeders();f.ctx.Math.random=()=>0;feed(f);assert(f.mother.pregnant);
 f.mother.pregnant.remaining_ticks=1;f.mother.weight_kg=120;f.mother.satiety=100;f.mother.perks=[];
 const reserve=s=>s.nutrition.maintenance_per_tick*s.satiety.starvation_to_zero_ticks/100;
 const before=100*reserve(species.pig);feed(f);
 const babies=f.st.animals.filter(a=>a!==f.mother&&a!==f.father);assert(babies.length>0);
 const total=f.mother.satiety*reserve(species.pig)+babies.reduce((n,a)=>n+a.satiety*reserve(species[a.species_id]),0);
 near(total,before);assert(f.mother.nutrition_state.last.gestation_spent>0);
 const n=f.mother.nutrition_state.last;near(n.intake+n.reserve_used,n.maintenance_paid+n.reserve_refilled+n.recovery_spent+n.growth_spent+n.production_spent+n.gestation_spent+n.unused);
});
test('pheromone uses round-equivalent probability and configured zero disables its trigger',()=>{
 for(const factor of [0,1]){
  const f=fixture();f.ls.getPerk('pheromone').params.trigger_chance=factor;
  f.mount('arm1','cw_side','feed_trough',5);f.mount('arm4','cw_side','feed_trough',5);
  f.animal('pig','z2',{weight_kg:120});const a=f.animal('pig','z1',{weight_kg:120,gender:'female',perks:['pheromone']});
  f.ctx.Math.random=()=>0.1;feed(f);assert.equal(!!a.pregnant,factor===1);
  f.ls.getPerk('pheromone').params.trigger_chance=0.5;
 }
});
test('a trough has a shared per-tick budget and upgrades increase actual capacity and throughput',()=>{
 const amounts=[1,5].map(level=>{const f=fixture(),t=f.mount('arm4','cw_side','feed_trough',level);t.feed_units=f.ls.getTroughCapacity(t);const before=t.feed_units;
  for(let i=0;i<60;i++)f.animal('pig','z1',{weight_kg:120,satiety:50});f.tick();return before-t.feed_units;});
 near(amounts[0],0.25);near(amounts[1],1.2);
});
test('coop admission is atomic, counts corpses and expands with upgrades; chicks are female',()=>{
 const f=fixture(),c=f.mount('arm1','inner','coop');for(let i=0;i<5;i++)assert(f.ls.admitAnimal('chicken','arm1').ok);
 const before=JSON.stringify(f.st);assert.equal(f.ls.admitAnimal('chicken','arm1').reason,'coop_full');assert.equal(JSON.stringify(f.st),before);
 f.st.animals[0].dead=true;assert(!f.ls.admitAnimal('chicken','arm1').ok);c.level=2;assert(f.ls.admitAnimal('chicken','arm1').ok);
 assert(f.st.animals.every(a=>a.gender==='female'&&a.weight_kg===0.05));
});
test('single-side seeders and nets affect only their installed side',()=>{
 for(const side of ['cw_side','ccw_side']){
  const f=fixture();f.mount('arm1',side,'manure_net',5);const a=f.animal('sheep','z1'),b=f.animal('sheep','z2');f.tick();
  const target=side==='cw_side'?'z2':'z1',other=side==='cw_side'?'z1':'z2';near(f.st.zones[target].pollution,0.008*0.7);near(f.st.zones[other].pollution,0.008);
 }
});
test('clinics prioritize worst injury, share patients once and rotate ties',()=>{
 const f=fixture();f.mount('arm1','inner','clinic_arm');f.mount('arm4','inner','clinic_arm');
 const a=f.animal('pig','z1',{hp:40}),b=f.animal('pig','z1',{hp:50});for(let i=0;i<5;i++)f.animal('pig','z1',{hp:60});
 f.tick();near(a.hp,40.03);near(b.hp,50.03); // 0.01 clinic + 0.02 natural; no double clinic.
 const first=f.st.animals.filter(a=>a.clinic_last_served);assert.equal(first.length,4);
 for(const a of f.st.animals){a.hp=50;a.satiety=80;}f.tick();
 assert(f.st.animals.filter(a=>a.clinic_last_served===2).some(a=>!first.includes(a)));
});
test('blood extraction uses best overlapping collection effect and food-paid recovery',()=>{
 const f=fixture();f.mount('arm1','front','auto_collect');f.mount('arm4','front','auto_collect',5);
 const a=f.animal('pig','z1',{weight_kg:120});f.tick();assert.equal(a.cooldowns.blood,Math.ceil(species.pig.products.living.find(p=>p.product_id==='blood').cooldown_ticks*0.8)-1);near(a.hp,90);
 f.tick(20);near(a.hp,90);assert(a.nutrition_state.blood_damage>0);
});
test('disassembly and restore preserve fractional feed and processing; full transfer store fails atomically',()=>{
 const f=fixture(),p=f.mount('arm1','inner','feed_preprocess'),t=f.mount('arm1','cw_side','feed_trough');
 p.input_queue=[{item_id:'herb_maize',nutrition:10,count:2}];p.processing_units=0.125;t.feed_units=0.375;
 assert(f.ls.dismountModule('arm1','inner').ok);assert(f.ls.dismountModule('arm1','cw_side').ok);
 const before=JSON.stringify(f.ls.getModuleStorage());const g=fixture();g.ls.setState(JSON.parse(JSON.stringify(f.st)));assert.equal(JSON.stringify(g.ls.getModuleStorage()),before);
 const pp=f.mount('arm2','inner','feed_preprocess'),tt=f.mount('arm2','cw_side','feed_trough');
 for(const r of f.ls.getModuleStorage().records.slice())assert(f.ls.restoreModuleResources(r.id,'arm2',r.module_id==='feed_trough'?'cw_side':'inner').ok);
 near(pp.processing_units,0.125);near(tt.feed_units,0.375);assert.equal(pp.input_queue[0].count,2);
 f.st.module_storage.capacity=0;const unchanged=JSON.stringify(f.st);assert.equal(f.ls.dismountModule('arm2','inner').reason,'transfer_full');assert.equal(JSON.stringify(f.st),unchanged);
});
test('invalid current state is rejected before mutation and a missing pasture resets empty',()=>{
 const f=fixture();f.animal('pig');const before=JSON.stringify(f.st),bad=JSON.parse(before);bad.animals[0].hp=NaN;
 assert.throws(()=>f.ls.setState(bad));assert.equal(JSON.stringify(f.st),before);
 const saved=JSON.parse(before);f.ls.setState(saved);saved.animals[0].hp=1;assert.equal(f.ls.getState().animals[0].hp,100);
 f.ls.setState(null);assert.equal(f.ls.getState().animals.length,0);
});
test('breeding caps reserve whole litters, zero pauses conception, and lowering a cap preserves pregnancies',()=>{
 const f=breeders();f.ctx.Math.random=()=>0;
 assert(f.ls.setBreedingLimit('pig',0).ok);feed(f,10);assert(!f.mother.pregnant);
 assert(f.ls.setBreedingLimit('pig',3).ok);feed(f,10);assert(!f.mother.pregnant); // Litter needs more than one free slot.
 assert(f.ls.setBreedingLimit('pig',10).ok);feed(f);assert(f.mother.pregnant);
 const count=f.mother.pregnant.children.length;assert.equal(f.ls.getBreedingStatus('pig').pending,count);
 f.ls.setBreedingLimit('pig',0);f.mother.pregnant.remaining_ticks=1;feed(f);
 assert.equal(f.st.animals.length,2+count);assert.equal(f.ls.getBreedingStatus('pig').pending,0);
 const before=JSON.stringify(f.st);assert(!f.ls.setBreedingLimit('pig',-1).ok);assert(!f.ls.setBreedingLimit('pig',1.5).ok);assert.equal(JSON.stringify(f.st),before);
});
test('every configured upgrade preserves capabilities; explicit zero capacity disables storage and production',()=>{
 const modules=JSON.parse(read('data/livestock-modules.json')).modules;
 for(const [id,m] of Object.entries(modules))for(const [effect,values] of Object.entries(m.effects||{}))if(Array.isArray(values)){
  assert.equal(values.length,5,id+' '+effect);
  for(let i=1;i<values.length;i++)assert(effect==='cooldown_mult'?values[i]<=values[i-1]:values[i]>=values[i-1],id+' '+effect);
 }
 const f=fixture();modules.warehouse_hub.effects.capacity[0]=0;
 f.ls.setConfig(species,modules,JSON.parse(read('data/livestock-perks.json')).perks,JSON.parse(read('data/livestock-build-costs.json')).costs,JSON.parse(read('data/livestock-feed-crops.json')).crops);
 f.mount('axis','slot2','warehouse_hub');assert.equal(f.ls.getWarehouseCapacity(),0);
 f.mount('arm1','inner','coop');f.mount('arm1','cw_side','feed_trough',5);const a=f.animal('chicken','arm1');
 const p=f.ls.getSpecies('chicken').products.living.find(p=>p.product_id==='egg'),old=p.storage_capacity;
 try {p.storage_capacity=0;feed(f,600);assert.equal(a.production_buffers.egg||0,0);} finally {p.storage_capacity=old;}
});
test('save-system rejects invalid livestock before touching world time or inventory',()=>{
 const f=fixture();let writes=0;
 f.ctx.GameTime={reset(){writes++;}};f.ctx.GameEngine={setState(){writes++;}};
 f.ctx.CharacterAttributes={setState(){writes++;}};f.ctx.Survival={setState(){writes++;}};
 vm.runInContext(read('js/save-system.js'),f.ctx);
 const snapshot={schemaVersion:1,time:{totalTicks:100},player:{engine:{mapId:'hideout',x:5,y:5},characterAttributes:{},survival:{},inventoryEquipment:{}}};
 const a=f.animal('pig');snapshot.livestock=JSON.parse(JSON.stringify(f.st));snapshot.livestock.animals[0].age_ticks=-1;
 assert.equal(f.ctx.SaveSystem.applySnapshotForDebug(snapshot),false);assert.equal(writes,0);assert.equal(a.hp,100);
});
test('production panel renders breeding controls and exact transfer destinations, with safe reason lookup',()=>{
 const f=fixture(),nodes={};f.ctx.document={getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],querySelector:()=>null};
 for(const id of ['livestock-animal-list','livestock-module-content'])nodes[id]={innerHTML:''};
 vm.runInContext(read('js/livestock-panel.js').replace('window.LivestockPanel = {','window.LivestockPanel = { testAnimals: renderAnimals, testModules: renderModules, testReason: reasonText,'),f.ctx);
 const p=f.ctx.LivestockPanel;p.testAnimals(f.st,100);assert(nodes['livestock-animal-list'].innerHTML.includes('data-breeding-limit="pig|1"'));
 const t=f.mount('arm1','cw_side','feed_trough');t.feed_units=0.375;f.ls.dismountModule('arm1','cw_side');f.mount('arm2','cw_side','feed_trough');
 p.testModules(f.st,100);const html=Object.values(nodes).map(n=>n.innerHTML).join('');assert(html.includes('data-resource-restore="transfer_1|arm2|cw_side"'));
 assert.equal(p.testReason('coop_full'),'livestock.reason.coop_full');assert.doesNotThrow(()=>p.testReason(null));
});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;

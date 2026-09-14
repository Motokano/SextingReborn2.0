import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture,species,read} from './lib/livestock-test-fixture.mjs';
import {rotationRun} from './lib/livestock-rotation-fixture.mjs';
let failed=0,passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('body load is positive, continuous and monotonic; reference weights retain base load',()=>{
  for(const [kind,sp] of Object.entries(species)){
    const f=fixture(),a=f.animal(kind,kind==='chicken'?'arm1':'z1');let last=0;
    for(let i=0;i<=100;i++){
      a.weight_kg=sp.growth.birth_weight_kg+(sp.growth.fatten_cap_kg-sp.growth.birth_weight_kg)*i/100;
      const n=f.ls.getAnimalLoad(a.uid);assert(n.current>=last && n.maintenance>0);last=n.current;
      near(n.at_full_weight,kind==='chicken'?1:2);
    }
    a.weight_kg=sp.nutrition.body_load.reference_weight_kg;near(f.ls.getAnimalLoad(a.uid).current,1);
    const before=JSON.stringify(f.st); f.ls.getAnimalLoad(a.uid); assert.equal(JSON.stringify(f.st),before);
  }
});
test('young pigs do not instantly erase grass; adult pigs work faster but never clean pollution',()=>{
  const result=[0.9,120].map(weight=>{
    const f=fixture(),a=f.animal('pig','z1',{weight_kg:weight});
    f.st.zones.z1.grass_height=1;f.st.zones.z1.compaction=50;f.st.zones.z1.pollution=20;
    const load=f.ls.getAnimalLoad(a.uid).current;f.tick();
    near(f.st.zones.z1.compaction,50-0.045*load);near(f.st.zones.z1.pollution,20);
    near(f.st.zones.z1.grass_height,1+0.0008*0.55-0.001*load);
    assert(f.st.zones.z1.grass_height>0.9);return f.st.zones.z1.compaction;
  });assert(result[1]<result[0]);
});
test('sheep pollution and chicken cleaning scale with body size and actual available pollution',()=>{
  for(const weight of [0.6,20,80]){
    const f=fixture(),a=f.animal('sheep','z1',{weight_kg:weight});const load=f.ls.getAnimalLoad(a.uid).current;
    f.tick();near(f.st.zones.z1.pollution,0.008*load);
  }
  const outputs=[0.05,2.5].map(weight=>{
    const f=fixture();f.mount('arm1','inner','coop');const a=f.animal('chicken','arm1',{weight_kg:weight});
    f.st.zones.z1.pollution=1;f.st.zones.z2.pollution=1;const load=f.ls.getAnimalLoad(a.uid).current;f.tick();
    near(a.nutrition_state.last.pollution_food,0.007*load*1.8);
    return a.nutrition_state.last.pollution_food;
  });assert(outputs[1]>outputs[0]);
});
test('high grass remains a hard sheep barrier and resting grass regenerates without removing compaction',()=>{
  const f=fixture(),a=f.animal('sheep');assert.equal(f.ls.getGrazingStatus(a.uid),'too_high');f.tick();near(a.nutrition_state.last.grass,0);
  f.st.animals=[];f.st.zones.z1.grass_height=0;f.st.zones.z1.compaction=100;f.tick(1000);
  near(f.st.zones.z1.grass_height,0.08);near(f.st.zones.z1.compaction,100);
});
test('cattle and sheep feed demand does not jump at the juvenile-to-fattening boundary',()=>{
  for(const kind of ['cattle','sheep']) {
    const sp=species[kind],pivot=sp.growth.graze_cap_kg;
    const costs=[pivot-0.0001,pivot,pivot+0.0001].map(weight=>{
      const f=fixture(),t=f.mount('arm4','cw_side','feed_trough');t.feed_units=100;
      const a=f.animal(kind,'z1',{weight_kg:weight,satiety:100,gender:'male'});
      for(const z of Object.values(f.st.zones))z.grass_height=0;
      f.tick();return a.nutrition_state.last.growth_spent;
    });
    assert(Math.max(...costs)-Math.min(...costs)<0.0001);
    near(costs[1],fixture().ls.lifecycleGrowth({weight_kg:pivot},sp)*sp.feed.nutrition_per_kg_meat);
  }
});
test('actual detail panel explains blocked grazing and future load without duplicate nutrition rows',()=>{
  const f=fixture(),a=f.animal('sheep','z1',{weight_kg:1});const box={innerHTML:''};
  f.ctx.document={getElementById:id=>id==='livestock-animal-detail'?box:null,querySelector:()=>null,querySelectorAll:()=>[]};
  const src=read('js/livestock-panel.js').replace('  window.LivestockPanel = {','  window.auditDetail = function(st,uid){selectedAnimalUid=uid;renderAnimalDetail(st,0);};\n  window.LivestockPanel = {');
  vm.runInContext(src,f.ctx);f.ctx.auditDetail(f.st,a.uid);
  assert(box.innerHTML.includes('livestock.grazing.too_high'));assert(box.innerHTML.includes('livestock.load.growing'));
  assert.equal(box.innerHTML.split('livestock.detail.nutrition').length-1,1);
});
test('unprepared startup settles into a repeatable cycle; equal-output separation saves feed',()=>{
  const split=rotationRun(),mixed=rotationRun({mixed:true});
  assert.equal(split.deaths,0);near(split.minHp,100);assert.equal(split.tills+split.cleans,0);
  assert.deepEqual(split.products,mixed.products);assert(split.feed < mixed.feed*0.8);
  const tail=split.cycles.slice(-4);for(const p of tail){near(p.feed,tail[0].feed);near(p.grass,tail[0].grass);}
  assert(split.sheepBlockedTicks>0);assert(split.maxLedgerError<1e-8);
});
test('one initial recovery window restores damaged land, then runs without continued intervention',()=>{
  const r=rotationRun({damaged:true,recovery:true});assert.equal(r.deaths,0);near(r.minHp,100);
  assert(r.tills>0 && r.cleans>0);assert(r.tills<60 && r.cleans<40);
  const tail=r.cycles.slice(-4);for(const p of tail){near(p.feed,tail[0].feed);near(p.grass,tail[0].grass);}
});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;

import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fixture,species,items} from './lib/livestock-test-fixture.mjs';
import {rotationRun} from './lib/livestock-rotation-fixture.mjs';
const report={phase:'calibrated-v5',assumptions:['External feed is counted as standard feed and maize-equivalent input; field crop yield and merchant currency are outside the livestock model.','Long runs use real collection arms, constrained trough throughput, explicit breeding limits and staggered purchased/captured chick replacements.','No lifespan disabling or free health resets. Replacements and manual slaughter actions are counted.','Current-version JSON reload occurs halfway through each long run.'],comparisons:{},longRuns:[]};
for(const [name,options] of Object.entries({split:{},mixed:{mixed:true},noPig:{pigs:0},noPigManual:{pigs:0,manual:true},noChicken:{birds:0},noChickenManual:{birds:0,manual:true},repaired:{damaged:true,recovery:true}})) {
 const r=rotationRun(options);report.comparisons[name]=r;
 console.log(name,JSON.stringify({feed:r.feed,products:r.products,deaths:r.deaths,tills:r.tills,cleans:r.cleans}));
}
for(const seedStart of [7,19,41]){
 const f=fixture();let st=f.st,seed=seedStart;
 f.ctx.Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 f.mount('axis','slot1','slaughter',3);f.mount('arm3','inner','coop',5);f.mount('arm4','ccw_side','manure_net',3);
 for(const arm of ['arm1','arm2','arm3','arm4']){
  f.mount(arm,'front','auto_collect',4);
  for(const side of ['cw_side','ccw_side'])if(!(arm==='arm4'&&side==='ccw_side'))f.mount(arm,side,'feed_trough',5);
 }
 let sequence=0;
 for(const [kind,zone,limit]of [['cattle','z1',4],['sheep','z4',4],['pig','z3',6]]){
  f.ls.setBreedingLimit(kind,limit);
  for(const gender of ['male','female'])f.animal(kind,zone,{uid:'founder_'+(++sequence),gender,weight_kg:species[kind].growth.fatten_cap_kg,satiety:100,perks:gender==='male'?['fast_growth','hardy']:['light_eater','fertile']});
 }
 for(let i=0;i<15;i++)f.animal('chicken','arm3',{uid:'founder_'+(++sequence),weight_kg:2.5,age_ticks:i*900,satiety:100});
 const r={seed:seedStart,ticks:48000,feed:0,products:{},chickReplacements:0,manualSlaughters:0,births:0,deaths:0,maxPopulation:st.animals.length,maxLedgerError:0,ledgerChecks:0,periods:[]};
 const seen=new Set(st.animals.map(a=>a.uid)),dead=new Set();let periodFeed=0,lastFeed=0;
 function harvest(xs){for(const x of xs)r.products[x.item_id]=(r.products[x.item_id]||0)+x.count;}
 for(let tick=0;tick<48000;tick++){
  // Staggered renewal preserves cleaning service instead of replacing the whole coop simultaneously.
  for(const a of st.animals.slice())if(a.species_id==='chicken'&&!a.dead&&a.age_ticks>=14000){
   const out=f.ls.slaughterAnimal(a.uid);
   if(out.ok){harvest(out.items);r.manualSlaughters++;const inResult=f.ls.admitAnimal('chicken','arm3');assert(inResult.ok);seen.add(inResult.uid);r.chickReplacements++;}
  }
  const troughs=Object.values(st.arms).flatMap(arm=>Object.values(arm)).filter(m=>m&&!m.shadow&&m.module_id==='feed_trough');
  troughs.forEach(t=>t.feed_units=f.ls.getTroughCapacity(t));
  const before=troughs.reduce((n,t)=>n+t.feed_units,0);f.tick();
  const used=before-troughs.reduce((n,t)=>n+t.feed_units,0);r.feed+=used;periodFeed+=used;let intake=0;
  for(const a of st.animals){
   if(!seen.has(a.uid)){seen.add(a.uid);r.births++;}
   if(a.dead&&!dead.has(a.uid)){dead.add(a.uid);r.deaths++;}
   const n=a.nutrition_state&&a.nutrition_state.last;if(!n)continue;
   // Existing corpses do not settle nutrition again.
   if(a.dead&&a._auditedDead)continue;if(a.dead)a._auditedDead=true;
   const error=Math.abs(n.intake+n.reserve_used-n.maintenance_paid-n.reserve_refilled-n.recovery_spent-n.growth_spent-n.production_spent-(n.gestation_spent||0)-n.unused);
   assert(error<1e-8);r.maxLedgerError=Math.max(r.maxLedgerError,error);r.ledgerChecks++;intake+=n.feed;
   for(const value of Object.values(n))assert(Number.isFinite(value)&&value>=-1e-8);
   assert(a.hp>=0&&a.hp<=100);assert(a.weight_kg>=species[a.species_id].growth.birth_weight_kg-1e-8);
  }
  assert(Math.abs(intake-used*10)<1e-7);
  harvest(f.ls.drainAutoCollectItems());r.maxPopulation=Math.max(r.maxPopulation,st.animals.length);
  if(tick===23999){const saved=JSON.parse(JSON.stringify(st));f.ls.setState(saved);st=f.ls.getState();}
  for(const kind of ['cattle','sheep','pig']){const status=f.ls.getBreedingStatus(kind);assert(status.live+status.pending<=status.limit);}
  if((tick+1)%4000===0){r.periods.push({tick:tick+1,feed:periodFeed,live:st.animals.filter(a=>!a.dead).length,minHp:Math.min(...st.animals.filter(a=>!a.dead).map(a=>a.hp)),maxPollution:Math.max(...Object.values(st.zones).map(z=>z.pollution)),births:r.births,replacements:r.chickReplacements});periodFeed=0;}
 }
 r.finalAnimals=st.animals.map(a=>({kind:a.species_id,weight:a.weight_kg,hp:a.hp,age:a.age_ticks,dead:a.dead}));
 report.longRuns.push(r);console.log('long-run',JSON.stringify({seed:seedStart,feed:r.feed,births:r.births,replacements:r.chickReplacements,deaths:r.deaths,peak:r.maxPopulation,tail:r.periods.slice(-2)}));
}
report.saving=1-report.comparisons.split.feed/report.comparisons.mixed.feed;
assert(report.saving>0.2);assert(report.longRuns.every(r=>r.deaths===0&&r.births>0&&r.chickReplacements>15));
fs.writeFileSync(new URL('../docs/reference/livestock-final-calibration.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('FINAL calibration passed; separation saving '+(report.saving*100).toFixed(2)+'%');

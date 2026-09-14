// Numerical acceptance checks for the current implementation, not the unimplemented redesign.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture, species, items, read } from './lib/livestock-test-fixture.mjs';
const evidence = { date: '2026-09-13', scope: 'current runtime; confirmed future rules are separately identified', checks: {}, pending: {} };
let massCases=0,maxMassExcess=0;
for(const kind of Object.keys(species)) for(const hp of [20,29.99999,30,59.99999,60,100]) for(const ps of [[],['meaty'],['lean']]) {
  const f=fixture(); const a=f.animal(kind,kind==='chicken'?'arm1':'z1',{weight_kg:0.001,hp,perks:ps});
  const min=f.ls.previewSlaughter(a.uid).minimum_weight_kg;
  for(const weight of [min-0.00001,min,min+0.00001,species[kind].growth.fatten_cap_kg-0.00001,species[kind].growth.fatten_cap_kg]) {
    a.weight_kg=weight; const before=JSON.stringify(f.st),p=f.ls.previewSlaughter(a.uid); massCases++;
    assert.equal(JSON.stringify(f.st),before);
    if(weight<min-1e-8) { assert.equal(p.ok,false); continue; }
    assert(p.ok); const mass=p.items.reduce((n,i)=>n+items[i.item_id].weight_kg*i.count,0);
    maxMassExcess=Math.max(maxMassExcess,mass-weight); assert(mass<=weight+1e-8);
  }
}
evidence.checks.slaughter={boundaryCases:massCases,maxMassExcessKg:maxMassExcess,normalMinimumKg:Object.fromEntries(Object.keys(species).map(kind=>{
  const f=fixture(),a=f.animal(kind,kind==='chicken'?'arm1':'z1',{weight_kg:0.001}); return [kind,f.ls.previewSlaughter(a.uid).minimum_weight_kg];
}))};
evidence.checks.processing=[];
for(const module of ['feed_preprocess','feed_refine']) for(let level=1;level<=5;level++) {
  let f=fixture(); f.mount('arm1','inner',module,level); f.mount('arm1',module==='feed_refine'?'ccw_side':'cw_side','feed_trough');
  const slot=module==='feed_refine'?'ccw_side':'cw_side';
  f.st.arms.arm1[slot].feed_units=99.75;
  assert(f.ls.feedProcessInput('arm1','herb_maize',2).ok);
  const multiplier=module==='feed_refine'?[1.2,1.25,1.3,1.35,1.4][level-1]:1;
  const total=99.75+2*multiplier;
  let withdrawn=0,maxError=0;
  for(let i=0;i<100;i++) {
    if(i===25) { const saved=JSON.parse(JSON.stringify(f.ls.getState())); f=fixture(); f.ls.setState(saved); }
    const st=f.ls.getState(),tr=st.arms.arm1[slot],p=st.arms.arm1.inner;
    // External demand after a full-buffer pause; account for every withdrawn fraction.
    if(i>10) { const take=Math.min(0.17,tr.feed_units); tr.feed_units-=take; withdrawn+=take; }
    f.tick();
    const queue=(p.input_queue||[]).reduce((n,q)=>n+q.count*q.nutrition/10*multiplier,0);
    const balance=tr.feed_units+(p.processing_units||0)+(p.refine_cache||0)+queue+withdrawn;
    maxError=Math.max(maxError,Math.abs(balance-total)); assert(Math.abs(balance-total)<1e-8);
  }
  evidence.checks.processing.push({module,level,ticks:100,feedEquivalentInput:2*multiplier,maxError});
}
evidence.checks.births=[];
for(let seed=1;seed<=16;seed++) {
  const f=fixture(); let rng=seed; f.ctx.Math.random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  const mother=f.animal('pig','z1',{gender:'female',weight_kg:120,pregnant:{remaining_ticks:1}});
  f.tick(); const babies=f.st.animals.filter(a=>a!==mother);
  const total=mother.weight_kg+babies.reduce((n,a)=>n+a.weight_kg,0);
  assert(babies.length>=3&&babies.length<=4); assert(Math.abs(total-120)<1e-8);
  evidence.checks.births.push({seed,count:babies.length,motherKg:mother.weight_kg,newbornKg:120-mother.weight_kg,totalKg:total});
}
evidence.checks.pigFeedConversion=[[],['fast_growth'],['easy_fat']].map(perks=>{
  const f=fixture(); const trough=f.mount('arm4','cw_side','feed_trough'); trough.feed_units=100;
  const a=f.animal('pig','z1',{weight_kg:30,satiety:100,perks}); f.tick();
  const consumed=100-trough.feed_units,gain=a.weight_kg-30,conversion=perks.includes('easy_fat')?1.2:1;
  assert(Math.abs(gain-consumed*10/30*conversion)<1e-8);
  return {perks,feedUnits:consumed,gainKg:gain};
});
// Evidence of unfinished rules: do not convert these observations into green redesign tests.
{
  const f=fixture(); f.mount('arm1','inner','coop'); const tr=f.mount('arm1','cw_side','feed_trough');
  const a=f.animal('chicken','arm1',{satiety:0,starvation_ticks:599}); tr.feed_units=0.000001; f.tick();
  evidence.pending.starvation={satiety:a.satiety,hp:a.hp,countdown:a.starvation_ticks,dead:a.dead};
}
evidence.pending.healthCliff=[59.99,60].map(hp=>{
  const f=fixture(),a=f.animal('cattle','z1',{weight_kg:600,hp});return {hp,meatCount:f.ls.previewSlaughter(a.uid).items[0].count};
});
{
  const f=fixture(),a=f.animal('cattle','z1',{gender:'female',satiety:80}); const before={weight:a.weight_kg,satiety:a.satiety};
  const result=f.ls.collectProduct(a.uid,'milk'); evidence.pending.milkNutrition={before,result,after:{weight:a.weight_kg,satiety:a.satiety}};
}
const previous=JSON.parse(read('docs/reference/livestock-runtime-after-retirement.json'));
evidence.longRun={summary:previous.summary,hashMatch:Object.fromEntries(Object.entries(previous.sourceHashes).map(([p,hash])=>[p,createHash('sha256').update(read(p)).digest('hex')===hash])),selected:previous.combinations.filter(c=>['full_following_plus_feed','low_density_prepared_40k'].includes(c.id)).map(c=>({id:c.id,firstDeath:c.firstDeath,final:c.final.bySpecies}))};
evidence.currentHashes=Object.fromEntries(['js/livestock-state.js','js/livestock-panel.js','data/livestock-species.json','data/livestock-modules.json'].map(p=>[p,createHash('sha256').update(read(p)).digest('hex')]));
fs.writeFileSync(new URL('../docs/reference/livestock-round-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({slaughter:evidence.checks.slaughter,processingCases:evidence.checks.processing.length,maxProcessingError:Math.max(...evidence.checks.processing.map(c=>c.maxError)),birthCases:evidence.checks.births.length,pigFeedConversion:evidence.checks.pigFeedConversion,pending:evidence.pending,longRunHashesMatch:Object.values(evidence.longRun.hashMatch).every(Boolean)},null,2));

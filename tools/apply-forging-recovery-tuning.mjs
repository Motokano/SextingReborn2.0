// Uses the saved first-strike audit; validates independent seeds before applying.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createBladeForge} from './blade-forging/core.mjs';
import {findRoute} from './blade-forging/search.mjs';
const dir=new URL('./blade-forging/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,dir),'utf8'));
const [catalog,audit,settings]=await Promise.all(['levels.json','high-recovery-audit.json','high-goal-tuning.json'].map(read));
const high=catalog.levels.filter(l=>l.goal.type==='high');
assert.equal(high.length,34);assert.equal(audit.levels.length,34);
const ids=new Set(audit.levels.map(l=>l.id));assert.equal(ids.size,34);
for(const level of high){
 assert.ok(ids.has(level.id));assert.equal(level.budget.h,8);
 const old=audit.levels.find(l=>l.id===level.id);
 const proposed=old.stats.p10/old.oldTarget<1.15?Math.floor(old.stats.p10*.8/5)*5:old.oldTarget;
 assert.ok([old.oldTarget,proposed].includes(level.goal.min),'Unreviewed target change: '+level.id);
}
const changes=audit.levels.filter(l=>l.stats.p10/l.oldTarget<1.15).map(l=>({id:l.id,name:l.name,tier:l.tier,from:l.oldTarget,to:Math.floor(l.stats.p10*.8/5)*5}));
const report={version:1,date:'2026-10-15',hammerBudget:8,
 method:'Audit all 34 high-score parts across two seeds and every first heavy strike. Hold back one hammer, then search without cross or collectible effects. Adjust only parts whose lower-decile score has less than 15% headroom; new target is 80% of that score rounded down to 5. Validate changed parts on two independent seeds and every first heavy strike, still reserving a hammer. Search witnesses are not player win rates or proven maxima.',
 auditSamples:audit.levels.reduce((n,l)=>n+l.samples.length,0),validationSeeds:[20261015,0x85ebca6b],changes,validation:[]};
for(const change of changes){
 const original=catalog.levels.find(l=>l.id===change.id),level={...original,goal:{type:'high',min:change.to}},f=createBladeForge(level),samples=[];
 assert(change.to<change.from);assert.equal(f.stars(f.create()),0);
 for(const seed of report.validationSeeds){
  let rng=seed;const specials=f.randomSpecials(()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;});
  for(let index=0;index<f.count;index++){
   const first={kind:'heavy',index},start=f.apply(f.create(specials,seed),first);start.left.h--;
   const continuation={...f,create:()=>f.clone(start),budget:{...start.left}};
   let result;
   for(const width of [64,240]){
    result=findRoute(continuation,[],{width,allowCross:false,allowEffects:false,planAhead:true});
    if(f.stars(result.state)===3)break;
   }
   assert.equal(f.stars(result.state),3,change.id+' recovery seed '+seed+' first '+index);
   const actions=[first,...result.actions];let replay=f.create(specials,seed);
   for(const action of actions){assert.notEqual(action.kind,'cross');assert(!action.effect);replay=f.apply(replay,action);assert(replay);}
   assert.equal(f.score(replay),f.score(result.state));assert.equal(f.stars(replay),3);assert(replay.left.h>=1);
   samples.push({seed,specials,first,score:f.score(replay),remaining:replay.left.h,actions});
  }
 }
 report.validation.push({id:change.id,samples});
 console.log(change.id+' '+change.from+' -> '+change.to+': '+samples.length+' independent recovery routes passed');
}
report.validationSamples=report.validation.reduce((n,l)=>n+l.samples.length,0);
await writeFile(new URL('high-recovery-tuning-report.json',dir),JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--apply')){
 for(const change of changes)catalog.levels.find(l=>l.id===change.id).goal.min=change.to;
 settings.version=3;settings.description=report.method;settings.goals=Object.fromEntries(high.map(l=>[l.id,l.goal.min]));
 settings.validation={highComponents:34,adjusted:changes.length,auditSamples:report.auditSamples,independentRecoverySamples:report.validationSamples,report:'high-recovery-tuning-report.json'};
 await writeFile(new URL('levels.json',dir),JSON.stringify(catalog,null,2)+'\n');
 await writeFile(new URL('high-goal-tuning.json',dir),JSON.stringify(settings,null,2)+'\n');
 console.log('Applied '+changes.length+' lower targets; other targets and all hammer/heat budgets unchanged.');
}

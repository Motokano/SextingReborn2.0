import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,growthTotal,distributeGrowth} from './gym-prototype-data.mjs';
const unit=v=>Math.round(v*1e6),sum=rows=>rows.reduce((n,r)=>n+unit(r.pct),0);
const a={main:['a','b'],assist:['c'],growthPct:1};
function rolls(values){let i=0;return ()=>values[i++%values.length];}

test('one percent is a single random pool, with equal treatment of main and assisting targets',()=>{
 const first=distributeGrowth(a,1,()=>0,rolls([.1,.3,.6]));
 assert.deepEqual(first.map(r=>r.pct),[.1,.3,.6]);assert.equal(sum(first),1e6);
 const next=distributeGrowth(a,1,()=>0,rolls([.6,.3,.1]));assert.deepEqual(next.map(r=>r.pct),[.6,.3,.1]);
 assert.deepEqual(next.map(r=>r.id),['a','b','c']);assert.equal(sum(next),1e6);
 assert.equal(ACTIONS.find(a=>a.id==='pushup').growthPct,.88);
 assert.equal(ACTIONS.find(a=>a.id==='curl').growthPct,1.1);
 assert.equal(ACTIONS.find(a=>a.id==='diaphragmatic_breathing').growthPct,.15);
});

test('completed muscles are excluded and capped shares flow to the remaining muscles',()=>{
 const progress=id=>({a:99.99,b:0,c:100})[id];
 const rows=distributeGrowth(a,1,progress,rolls([.9,.1]));
 assert.deepEqual(rows.map(r=>r.pct),[.01,.99,0]);assert.equal(sum(rows),1e6);
 const near=id=>({a:99.999999,b:99.999998,c:100})[id];
 assert.equal(growthTotal(a,100,1,near),.000003);
 assert.deepEqual(distributeGrowth(a,1,near,()=>.5).map(r=>r.pct),[.000001,.000002,0]);
 assert.equal(sum(distributeGrowth(a,0,()=>0,()=>{throw Error('zero pool must not roll');})),0);
 assert.equal(sum(distributeGrowth(a,1,()=>100,()=>{throw Error('completed targets must not roll');})),0);
});

test('six-decimal conservation holds for zero rolls, tiny pools, large pools and all 75 actions',()=>{
 assert.deepEqual(distributeGrowth(a,1,()=>0,()=>0).map(r=>r.pct),[.333334,.333333,.333333]);
 assert.equal(sum(distributeGrowth(a,.000001,()=>0,rolls([0,1,0]))),1);
 let seed=992319;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const action of ACTIONS)for(let run=0;run<50;run++){
  const ids=[...action.main,...action.assist],before=Object.fromEntries(ids.map(id=>[id,run%3===0?100:Math.round(random()*100e6)/1e6]));
  const progress=id=>before[id],total=growthTotal(action,run%5===0?100:1.495,run%2?.5:1,progress);
  const rows=distributeGrowth(action,total,progress,random);
  assert.equal(sum(rows),unit(total),action.id+' keeps the pool');assert.deepEqual(rows.map(r=>r.id),ids);
  for(const r of rows){assert(r.pct>=0);assert(unit(r.pct)<=100e6-unit(before[r.id]),r.id+' stays at or below 100%');}
 }
 assert.equal(growthTotal(a,1.495,.5,()=>0),.7475,'efficiency and fatigue modify the pool once');
});

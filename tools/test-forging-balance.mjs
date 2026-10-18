import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createBladeForge} from './blade-forging/core.mjs';
import {findRoute} from './blade-forging/search.mjs';
const dir=new URL('./blade-forging/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,dir),'utf8'));
const [catalog,savedWitnesses]=await Promise.all(['levels.json','witnesses.json'].map(read));
let witnesses=savedWitnesses;
const levels=new Map(catalog.levels.map(l=>[l.id,l]));let replayed=0;
function replay(f,w,{ordinary=false}={}){
 let s=f.create(w.specials||[],w.seed||0);
 for(const action of w.actions){
  if(ordinary)assert.notEqual(action.kind,'cross');
  const before=JSON.stringify(s),preview=f.apply(s,action);
  assert.ok(preview,'witness action is valid');assert.equal(JSON.stringify(s),before);
  assert.deepEqual(preview,f.apply(s,action));s=preview;
 }
 assert.equal(f.score(s),w.score);assert.equal(f.stars(s),3);replayed++;
}
assert.equal(catalog.levels.length,83);
function solve(f,specials,seed=0){
 let result;
 for(const width of [100,320,800]){
  result=findRoute(f,specials,{seed,width,allowCross:f.goal.type!=='high',planAhead:f.goal.type==='high'});
  if(f.stars(result.state)===3)return result;
 }
 assert.fail(f.level?.id+' sampled route not found');
}
// Rebuild witnesses explicitly when the opportunity pool/RNG rules change.
if(process.argv.includes('--refresh-witnesses')){
 witnesses=catalog.levels.map(level=>{
  const f=createBladeForge(level),result=solve(f,[]);
  return {id:level.id,score:f.score(result.state),actions:result.actions};
 });
 await writeFile(new URL('witnesses.json',dir),JSON.stringify(witnesses,null,2)+'\n');
 console.log('83 baseline routes refreshed; targets unchanged');
}
for(const w of witnesses){const f=createBladeForge(levels.get(w.id));assert.equal(f.stars(f.create()),0);replay(f,w,{ordinary:f.goal.type==='high'});}
const samples=[];
for(const [n,level] of catalog.levels.entries()){
 const f=createBladeForge(level),ordinary=f.goal.type==='high';
 for(const seed of [37,0x85ebca6b]){
  let rng=seed;
  const specials=f.randomSpecials(()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;});
  const result=solve(f,specials,seed);
  assert.equal(f.stars(result.state),3,level.id+' collectible-effects reachability');
  const w={id:level.id,goal:level.goal,seed,specials,score:f.score(result.state),actions:result.actions};
  replay(f,w,{ordinary});samples.push(w);
 }
 if((n+1)%20===0)console.log((n+1)+'/83 components checked');
}
const report={version:3,hammerBudget:8,rules:'Two distinct pickups from keep/burst/gather/spread/erase/level/rebound. Optional one effect per hammer. Spread: heavy eight neighbors; erase: light clears; level: local equalization after hammer; rebound: refund total hammer only. Temporary pool: warmth/flake, no swap. Cross adjacent full, distant half floor.',method:'Two seeds per component. High goals disallow cross. Beam witnesses prove sampled reachability, not maxima or every random layout. Targets unchanged.',baselineRoutes:witnesses.length,samples};
await writeFile(new URL('hammer-budget-balance-report.json',dir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({replayedWitnesses:replayed,randomSamples:samples.length,ordinaryHighSamples:samples.filter(w=>w.goal.type==='high').length,passed:true}));

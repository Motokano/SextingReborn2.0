// Offline balance trial. Search results are witnessed routes, not proven maxima.
import {readFile,writeFile} from 'node:fs/promises';
import {createBladeForge} from './blade-forging/core.mjs';
import {findRoute} from './blade-forging/search.mjs';

const dir=new URL('./blade-forging/',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('levels.json',dir),'utf8'));
const apply=process.argv.includes('--apply');
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
const trainSeeds=[37,...Array.from({length:7},(_,i)=>Math.imul(i+1,0x9e3779b1)>>>0)];
const validationSeeds=Array.from({length:12},(_,i)=>Math.imul(i+19,0x85ebca6b)>>>0);
function specials(f,seed){let rng=seed;return f.randomSpecials(()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;});}
function route(f,seed,allowCross,extreme=true,width=64){
 const effects=specials(f,seed),result=findRoute(f,effects,{seed,allowCross,extreme,width,planAhead:true});
 return {seed,specials:effects,score:f.score(result.state),actions:result.actions};
}
const summary=scores=>{const a=scores.slice().sort((a,b)=>a-b);return {min:a[0],p25:a[Math.floor((a.length-1)*.25)],median:a[Math.floor(a.length/2)],max:a.at(-1)};};
const report={version:3,date:'2026-10-15',rule:'Cross: adjacent full; distance >=2 half, floor after burst. Collectible effects are optional; gather moves half of the neighbors into the landing cell.',method:'8 training seeds: ordinary-only and cross-enabled searches (width 64), plus a no-collectible baseline. Goals capped by the old target, 80% of ordinary p25, 95% of ordinary minimum, and 90% of baseline. 12 additional ordinary-only reachability checks per high goal. Witnesses prove sampled reachability, not optimality or all seeds.',trainSeeds,validationSeeds,levels:[]};
const high=catalog.levels.filter(l=>l.goal.type==='high'&&(!ids||ids.includes(l.id)));
for(const [index,level] of high.entries()){
 const f=createBladeForge(level),training=[];
 for(const seed of trainSeeds)training.push({seed,ordinary:route(f,seed,false),cross:route(f,seed,true)});
 const ordinary=summary(training.map(x=>x.ordinary.score)),cross=summary(training.map(x=>x.cross.score));
 const plain=findRoute(f,[],{allowCross:false,extreme:true,planAhead:true,width:100});
 const baseline=f.score(plain.state),initial=f.score(f.create());
 let target=Math.max(Math.ceil((initial+15)/5)*5,Math.floor(Math.min(level.goal.min,ordinary.p25*.8,ordinary.min*.95,baseline*.9)/5)*5);
 const proposed={...level,goal:{type:'high',min:target}},nf=createBladeForge(proposed);
 const validation=validationSeeds.map(seed=>{
  let witness=route(nf,seed,false,false,90);
  if(witness.score<target)witness=route(nf,seed,false,true,220);
  return witness;
 });
 if(validation.some(x=>x.score<target))throw Error(level.id+' ordinary-only validation failed at target '+target+'; inspect before changing goals');
 const record={id:level.id,name:level.name,tier:level.tier,oldTarget:level.goal.min,target,ordinary,cross,baseline,baselineActions:plain.actions,training,validation};
 report.levels.push(record);
 console.log(`${index+1}/${high.length} ${level.id}: ${level.goal.min} -> ${target}; ordinary ${ordinary.min}/${ordinary.median}/${ordinary.max}; cross median ${cross.median}; 12/12 ordinary routes passed`);
}
report.validation={highComponents:high.length,trainingPairs:high.length*trainSeeds.length,additionalOrdinarySamples:high.length*validationSeeds.length,allSampledOrdinaryThreeStars:true};
await writeFile(new URL('cross-balance-report.json',dir),JSON.stringify(report,null,2)+'\n');
if(apply){
 if(ids)throw Error('Partial runs are report-only');
 const goals=Object.fromEntries(report.levels.map(x=>[x.id,x.target]));
 for(const level of catalog.levels)if(goals[level.id])level.goal.min=goals[level.id];
 const witnesses=[];
 for(const level of catalog.levels){
  const f=createBladeForge(level),r=findRoute(f,[],{width:160,allowCross:level.goal.type!=='high',planAhead:level.goal.type==='high'});
  if(f.stars(f.create())!==0||f.stars(r.state)!==3)throw Error(level.id+' invalid starting/goal configuration');
  witnesses.push({id:level.id,score:f.score(r.state),actions:r.actions});
 }
 await writeFile(new URL('levels.json',dir),JSON.stringify(catalog,null,2)+'\n');
 await writeFile(new URL('high-goal-tuning.json',dir),JSON.stringify({version:2,description:report.method,goals,validation:report.validation},null,2)+'\n');
 await writeFile(new URL('witnesses.json',dir),JSON.stringify(witnesses,null,2)+'\n');
 console.log('Applied all high-score goals. All 83 baseline witnesses replayable; low/range targets unchanged.');
}

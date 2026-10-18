// PROTOTYPE — builds an offline campaign from the existing 83 component designs.
// Question: do varied silhouettes, deterministic moves and chapter unlocks make forging enjoyable?
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createForgeCore} from './forging-puzzle/core.mjs';
import {shapeFor} from './forging-puzzle/shapes.mjs';
const root=new URL('../',import.meta.url),core=createForgeCore();
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const write=(p,s)=>fs.writeFileSync(new URL(p,root),s);
const sum=a=>a.reduce((x,y)=>x+y,0);
const source=read('docs/design/weapon-component-final-stats-draft.md');
let parts=[];
for(const line of source.split(/\r?\n/)){
  let m=line.match(/^\| ([1-6]) \| ([BTDH]\d{2}) ([^|]+) \|/);
  if(m)parts.push({id:m[2],name:m[3].trim(),tier:+m[1],category:m[2][0]});
  m=line.match(/^\| (M\d{2}-T([1-6])) ([^|]+) \|/);
  if(m)parts.push({id:m[1],name:m[3].trim(),tier:+m[2],category:'M'});
}
assert.equal(parts.length,83);assert.equal(new Set(parts.map(p=>p.id)).size,83);
// Interleave component families within each equipment stage.
const order=['B','T','D','H','M'];
parts=Array.from({length:6},(_,i)=>{
 const groups=order.map(c=>parts.filter(p=>p.tier===i+1&&p.category===c));
 const chapter=[];while(groups.some(g=>g.length))for(const group of groups)if(group.length)chapter.push(group.shift());return chapter;
}).flat();
function random(seed){let v=seed>>>0;return()=>{v+=0x6D2B79F5;let t=v;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const shuffle=(a,rng)=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const hitCount=ops=>ops.filter(x=>typeof x==='number').length;
function easySolution(initial,target,g,budget){
  // Exhaust every sequence with at most one hammer, including all allowed Q/T interleavings.
  const seen=new Set();
  function go(b,h,q,t){if(core.equal(b,target))return true;const key=b.join(',')+'|'+h+q+t;if(seen.has(key))return false;seen.add(key);
    if(q&&go(core.apply(b,'Q',g),h,q-1,t))return true;
    if(t&&go(core.apply(b,'T',g),h,q,t-1))return true;
    if(h)for(let i=0;i<b.length;i++)if(b[i]>0&&go(core.apply(b,i,g),0,q,t))return true;return false;
  }return go(initial,1,budget.q,budget.t);
}
function routesNear(path,g,rng){
  const routes=[];const positions=path.map((v,i)=>typeof v==='number'?i:-1).filter(i=>i>=0);
  for(const pos of positions)for(const i of shuffle(g.cells.map((_,i)=>i),rng)){const p=path.slice();p[pos]=i;routes.push(p);}
  for(let a=0;a<path.length;a++)for(let b=a+1;b<path.length;b++){const p=path.slice();[p[a],p[b]]=[p[b],p[a]];routes.push(p);}
  return shuffle(routes,rng).slice(0,120);
}
function variations(initial,target,path,g,rng){
  const candidates=[];const n=initial.length;
  for(let a=0;a<n;a++)if(initial[a]>1)for(let b=0;b<n;b++)if(a!==b&&initial[b]<5){const v=initial.slice();v[a]--;v[b]++;candidates.push(v);}
  const good=[],different=[];
  for(const v of shuffle(candidates,rng)){
    if(core.equal(core.replay(v,path,g),target))good.push({values:v,solution:path.slice(),changedRoute:false});
    else different.push(v);
  }
  for(const p of routesNear(path,g,rng)){
    for(const v of different.slice(0,200))if(core.equal(core.replay(v,p,g),target)){
      if(!good.some(c=>core.equal(c.values,v)))good.unshift({values:v,solution:p,changedRoute:true});
      if(good.filter(c=>c.changedRoute).length>=2)return good.slice(0,2);
    }
  }
  // Equal-degree nonadjacent first hammer pair has a mass-conserving null direction.
  // This supplies certified perturbations even in stages that do not need heat treatment.
  const [a,b]=path.filter(o=>typeof o==='number');
  if(typeof a==='number'&&typeof b==='number'&&!g.neighbors[a].includes(b)&&g.neighbors[a].length===g.neighbors[b].length){
    for(const sign of [1,-1]){const v=initial.slice();v[a]+=sign;v[b]-=sign;for(const i of g.neighbors[a])v[i]-=sign;for(const i of g.neighbors[b])v[i]+=sign;
      if(v.every(x=>x>=1&&x<=6)&&sum(v)===sum(initial)&&!core.equal(v,initial)&&core.equal(core.replay(v,path,g),target)&&!good.some(c=>core.equal(c.values,v)))good.push({values:v,solution:path.slice(),changedRoute:false});
    }
  }
  return good.slice(0,2);
}
function makeLevel(part,number){
 const mask=shapeFor(part),g=core.geometry(mask),n=g.cells.length;
 // Every component must be one connected object.
 const seen=new Set([0]),todo=[0];while(todo.length)for(const j of g.neighbors[todo.pop()])if(!seen.has(j)){seen.add(j);todo.push(j);}assert.equal(seen.size,n,part.id+' disconnected');
 if(part.id==='B01'){
   const b=JSON.parse(read('docs/design/examples/b01-forging-grid-v1.json'));
   const cases=b.cases.map(c=>{const values=b.template.flat();for(const x of c.transfers){values[g.cells.findIndex(a=>a.label===x.from)]-=x.amount;values[g.cells.findIndex(a=>a.label===x.to)]+=x.amount;}return {values,solution:c.solution.map(o=>o==='Q'||o==='T'?o:g.cells.findIndex(x=>x.label===o)),changedRoute:c.id!=='template'};});
   return {...part,number,mask,target:b.target.flat(),budget:{h:5,q:1,t:1},par:3,cases,lesson:'先改变局部，再让整个盘面一起回到目标。',scheme:'qt'};
 }
 const rng=random(731301+number*991),k=Math.min(2+Math.ceil(part.tier/2),Math.floor(n/4));
 const scheme=part.tier>=5&&number%4===0?'split-t':part.tier>=4&&number%5===0?'split-q':['qt','tq','qt','h','t','q'][number%6];
 const budgetHeat={q:scheme==='split-q'?2:1,t:scheme==='split-t'?2:1};
 for(let attempt=0;attempt<70;attempt++){
   const initial=g.cells.map(()=>2+Math.floor(rng()*2));
   // Start with two equal-degree nonadjacent locations to retain controlled perturbations.
   const candidates=shuffle(g.cells.map((_,i)=>i).filter(i=>g.neighbors[i].length>=2),rng);
   const a=candidates[0],b=candidates.find(i=>i!==a&&!g.neighbors[a].includes(i)&&g.neighbors[a].length===g.neighbors[i].length);if(b===undefined)continue;
   let hits=[a,b];for(const i of shuffle(candidates,rng))if(!hits.includes(i)&&hits.length<k)hits.push(i);
   let path=hits.slice();
   if(scheme==='q')path.push('Q');if(scheme==='t')path.push('T');
   if(scheme==='qt')path.push('Q','T');if(scheme==='tq')path.push('T','Q');
   if(scheme==='split-q')path=[...hits.slice(0,2),'Q',...hits.slice(2),'T','Q'];
   if(scheme==='split-t')path=[...hits.slice(0,2),'T',...hits.slice(2),'Q','T'];
   const target=core.replay(initial,path,g);if(!target||Math.max(...target)>24||core.equal(initial,target))continue;
   if(target.filter((v,i)=>v===initial[i]).length/n>.8)continue;
   const budget={h:hits.length+2,...budgetHeat};if(easySolution(initial,target,g,budget))continue;
   const variants=variations(initial,target,path,g,rng).filter(c=>!easySolution(c.values,target,g,budget));
   if(variants.length<2)continue;
   const lessons={qt:'邻格会一起增长；为最后的整体调整留好数值。',tq:'观察奇偶数，回火和淬火的顺序会改变结果。',h:'有些目标保留零值；热处理是否值得用，由你判断。',q:'把传播留下的低点，与全盘抬升的效果一起考虑。',t:'先看目标允许哪些位置为零，再决定如何压低数值。','split-q':'两次淬火各有时机，别急着一次用完。','split-t':'两次回火可以分开使用，提前考虑后续的传播。'};
   return {...part,number,mask,target,budget,par:hits.length,cases:[{values:initial,solution:path,changedRoute:false},...variants],scheme,lesson:lessons[scheme]};
 }
 throw new Error('No certified design for '+part.id);
}
const levels=parts.map((p,i)=>{const result=makeLevel(p,i+1);if((i+1)%10===0)console.log('Designed '+(i+1)+' / 83');return result;});
const catalog={version:1,title:'百炼工坊',chapters:['初识炉火','辨形施锤','刚柔之间','百炼成形','精工细作','匠心之作'],levels};
const counts={};for(const l of levels)counts[l.category]=(counts[l.category]||0)+1;
assert.deepEqual(counts,{B:17,T:12,D:18,H:18,M:18});
let certified=0,changed=0;const fingerprints=new Set();
for(const l of levels){
 const g=core.geometry(l.mask);assert.ok(!fingerprints.has(JSON.stringify([l.mask,l.target])),l.id+' duplicate puzzle');fingerprints.add(JSON.stringify([l.mask,l.target]));
 for(const c of l.cases){assert.equal(c.values.length,g.cells.length);assert.equal(sum(c.values),sum(l.cases[0].values));assert.ok(core.equal(core.replay(c.values,c.solution,g,l.budget),l.target),l.id+' invalid path');assert.ok(core.cost(c.solution).h<=l.budget.h-2);assert.ok(!easySolution(c.values,l.target,g,l.budget));if(c.changedRoute){assert.ok(!core.equal(core.replay(c.values,l.cases[0].solution,g,l.budget),l.target));changed++;}certified++;}
}
write('tools/forging-puzzle/levels.json',JSON.stringify(catalog));
const assets=['tools/forging-puzzle/game.html','tools/forging-puzzle/game.css','tools/forging-puzzle/game.js'];
if(assets.every(p=>fs.existsSync(new URL(p,root)))){
 let html=read(assets[0]).replace('/* INLINE_STYLE */',read(assets[1]));
 const logic=read('tools/forging-puzzle/core.mjs').replace('export function','function');
 html=html.replace('/* INLINE_SCRIPT */',logic+'\nconst FORGE_CATALOG='+JSON.stringify(catalog).replace(/</g,'\\u003c')+';\n'+read(assets[2]));
 write('tools/forging-puzzle-playtest.html',html);
}
console.log(JSON.stringify({levels:levels.length,chapters:catalog.chapters.length,categories:counts,certifiedCases:certified,changedRouteCases:changed,schemes:levels.reduce((a,l)=>(a[l.scheme]=(a[l.scheme]||0)+1,a),{})}));

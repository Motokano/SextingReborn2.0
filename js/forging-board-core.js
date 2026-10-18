/* Generated from the tested playtest core; no separate rules fork. */
(function(g){
// PROTOTYPE: regional scoring, collectible hammer effects and seeded opportunities.
function createBladeForge(level={}) {
 const mask=level.mask||Array(7).fill('###'),rows=mask.length,cols=mask[0].length;
 const cells=mask.flatMap((row,r)=>[...row].flatMap((v,c)=>v==='#'?[{r,c,label:String.fromCharCode(65+c)+(r+1)}]:[]));
 const count=cells.length,budget={h:8,light:3,cross:1,q:1,t:1,...level.budget};
 const initial=level.initial?.slice()||cells.map(p=>p.c===0?2:p.c===1?(p.r%2?2:1):1);
 const scoreIndices=level.scoreIndices||cells.flatMap((p,i)=>p.c===2?[i]:[]),scoring=new Set(scoreIndices);
 const isScoring=i=>scoring.has(i),scoreLabel=level.scoreLabel||'刃口';
 const goal=level.goal||{type:'high',min:110},target=goal.type==='low'?goal.max:goal.min;
 const effects={
  keep:{name:'留力',mark:'留',summary:'保住落点',modes:['heavy','cross'],color:'#aaf3bd',description:'本次大力锤或十字锤保留落点原值，正常向外传分，无分数门槛。'},
  burst:{name:'传力',mark:'倍',summary:'传分翻倍',modes:['heavy','cross'],color:'#deb3ff',description:'本次大力锤或十字锤向外传分翻倍；十字锤先翻倍，再按距离减半。'},
  gather:{name:'聚料',mark:'聚',summary:'四邻收半',modes:['light','heavy','cross'],color:'#8ff1e7',description:'锤法结算后，将四邻各自一半的分数移入落点，逐格向下取整，总量不变；随后结算临时机会。'},
  spread:{name:'扩散',mark:'扩',summary:'八邻传分',modes:['heavy'],color:'#ffd17c',description:'本次大力锤向周围八个有效格传递全额分数，包括四个斜角；落点归零。'},
  erase:{name:'削尽',mark:'削',summary:'轻锤清零',modes:['light'],color:'#ffa9ac',description:'本次轻锤将落点直接降为0，再结算临时机会；仍消耗1次轻锤。'},
  level:{name:'匀压',mark:'匀',summary:'局部均分',modes:['light','heavy','cross'],color:'#9ebfff',description:'锤法结算后，将落点与四邻的总分均分，总量不变。余数优先分给均分前分数较高的格，同分按行列顺序；再结算临时机会。'},
  rebound:{name:'余劲',mark:'劲',summary:'返还一锤',modes:['light','heavy','cross'],color:'#e6f795',description:'本次有效落锤后返还1次总锤击次数；轻锤、十字锤的专属次数照常消耗。需有剩余总锤数才能落锤。'}
 };
 const opportunityEffects={
  warmth:{name:'余热',mark:'热',description:'先结算锤法，再让落点＋2。',color:'#ffbb77'},
  flake:{name:'剥落',mark:'剥',description:'先结算锤法，再让上下左右有效邻格各－1，最低为0。',color:'#9de7ed'}
 };
 const neighbors=cells.map(p=>cells.flatMap((v,j)=>Math.abs(v.r-p.r)+Math.abs(v.c-p.c)===1?[j]:[]));
 const crosses=cells.map(p=>cells.flatMap((v,j)=>(v.r===p.r||v.c===p.c)&&v!==p?[j]:[]));
 const surrounding=cells.map(p=>cells.flatMap((v,j)=>Math.max(Math.abs(v.r-p.r),Math.abs(v.c-p.c))===1?[j]:[]));
 const transmissionTargets=a=>a.kind==='light'?[]:a.kind==='cross'?crosses[a.index]:a.effect==='spread'?surrounding[a.index]:neighbors[a.index];
 function equalize(values,indices){
  const sum=indices.reduce((n,i)=>n+values[i],0),average=Math.floor(sum/indices.length),remainder=sum%indices.length;
  const order=indices.slice().sort((a,b)=>values[b]-values[a]||a-b);
  for(const i of indices)values[i]=average;
  for(let n=0;n<remainder;n++)values[order[n]]++;
 }
 // Double the transmitted value first; distant cross arms then halve and floor it.
 // Adjacency is geometric, so a missing cell does not shorten the distance.
 function transferValue(s,a,j){
  const i=a.index;
  const value=s.values[i]*(a.effect==='burst'&&s.stored.burst>0?2:1);
  return a.kind==='cross'&&!neighbors[i].includes(j)?Math.floor(value/2):value;
 }
 const score=s=>scoreIndices.reduce((n,i)=>n+s.values[i],0);
 const total=s=>s.values.reduce((n,v)=>n+v,0);
 const distance=value=>goal.type==='high'?Math.max(0,goal.min-value):goal.type==='low'?Math.max(0,value-goal.max):Math.max(0,goal.min-value,value-goal.max);
 const startingDistance=distance(score({values:initial}));
 const completion=s=>{
  if(goal.type==='high')return Math.max(0,Math.min(100,Math.floor(score(s)/goal.min*100)));
  // Low/range goals reward closing the initial gap; overshooting a range loses progress.
  return Math.max(0,100-Math.ceil(distance(score(s))*100/Math.max(1,startingDistance)));
 };
 const goalText=goal.type==='high'?'至少 '+goal.min+' 分':goal.type==='low'?'不高于 '+goal.max+' 分':goal.min+'–'+goal.max+' 分（含边界）';
 const goalNames={high:'堆高总分',low:'压低总分',range:'控制区间'};
 const guidance=s=>{const v=score(s);return distance(v)===0?'已达三星目标':goal.type==='low'||goal.type==='range'&&v>goal.max?'再减 '+distance(v)+' 分进入目标':'再加 '+distance(v)+' 分进入目标';};
 const stars=s=>{const percent=completion(s);return percent>=100?3:percent>=80?2:percent>=60?1:0;};
 const clone=s=>({values:s.values.slice(),locked:s.locked.slice(),specials:s.specials.map(e=>({...e})),stored:{...s.stored},left:{...s.left},finished:s.finished,opportunity:s.opportunity?{...s.opportunity}:null,randomState:s.randomState});
 function create(specials=[],seed=0){return {values:initial.slice(),locked:Array(count).fill(false),specials:specials.map(({index,type})=>({index,type})),stored:Object.fromEntries(Object.keys(effects).map(type=>[type,0])),left:{...budget},finished:false,opportunity:null,randomState:(seed^0x9e3779b9)>>>0};}
 function opportunityDescription(effect){
  return opportunityEffects[effect.type].description;
 }
 function refreshOpportunity(s){
  s.opportunity=null;
  if(!s.left.h)return;
  const candidates=cells.flatMap((_,i)=>s.values[i]>0&&!s.locked[i]&&!s.specials.some(e=>e.index===i)?[i]:[]);
  if(!candidates.length)return;
  // RNG belongs to the state: previews never consume it; undo/replay is deterministic.
  const random=()=>{s.randomState=(s.randomState+0x6D2B79F5)>>>0;let n=s.randomState;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;};
  const index=candidates[Math.floor(random()*candidates.length)];
  const types=Object.keys(opportunityEffects),type=types[Math.floor(random()*types.length)];
  s.opportunity={index,type};
 }
 function randomSpecials(random){
  const places=Array.from({length:count},(_,i)=>i),types=Object.keys(effects),result=[];
  for(let n=0;n<Math.min(2,count);n++)result.push({index:places.splice(Math.floor(random()*places.length),1)[0],type:types.splice(Math.floor(random()*types.length),1)[0]});
  return result;
 }
 function effectReason(s,a){
  if(a.effect===undefined||a.effect===null||a.effect==='')return '';
  const effect=effects[a.effect];
  if(typeof a.effect!=='string'||!Object.hasOwn(effects,a.effect))return '每锤只能选择一种已收取的效果。';
  if(!effect.modes.includes(a.kind))return effect.name+'不适用于当前操作，请取消选择或更换锤法。';
  if(!(s.stored[a.effect]>0))return '尚未收取'+effect.name+'，请先敲中对应格子。';
  return '';
 }
 function reason(s,a){
  if(s.finished)return '已经收工，可以重试本炉或换一炉。';
  const invalidEffect=effectReason(s,a);if(invalidEffect)return invalidEffect;
  if(a.kind==='finish')return '';
  if(a.kind==='quench')return s.left.q?'':'本炉淬火次数已用完。';
  if(a.kind==='temper')return s.left.t?'':'本炉回火次数已用完。';
  if(!['light','heavy','cross'].includes(a.kind))return '未知操作';
  if(!Number.isInteger(a.index)||a.index<0||a.index>=count)return '请选择盘面上的格子。';
  if(!s.left.h)return '本炉锤击次数已用完，仍可使用剩余热处理或收工。';
  if(a.kind==='light'&&!s.left.light)return '本炉轻锤已用满3次，请改用其他锤法。';
  if(a.kind==='cross'&&!s.left.cross)return '本炉十字锤已用过1次，请改用其他锤法。';
  if(s.locked[a.index])return cells[a.index].label+' 已用过十字锤，不能再落锤；仍可接收数值和热处理。';
  if(s.values[a.index]===0)return a.kind==='light'?'此格已是0，无需削减，不消耗次数。':'0格不能使用大力锤或十字锤，可以先接收传分或热处理。';
  return '';
 }
 function apply(s,a){
  if(reason(s,a))return null;
  const next=clone(s);
  if(a.kind==='finish'){next.finished=true;return next;}
  if(a.kind==='quench'){next.left.q--;next.values=next.values.map(v=>v+1);return next;}
  if(a.kind==='temper'){
   next.left.t--;equalize(next.values,cells.map((_,i)=>i));
   return next;
  }
  next.left.h--;
  const i=a.index,value=s.values[i];
  if(a.effect)next.stored[a.effect]--;
  if(a.kind==='light'){next.left.light--;next.values[i]=a.effect==='erase'?0:Math.floor(value/2);}
  else {
   next.values[i]=a.effect==='keep'?value:0;
   for(const j of transmissionTargets(a)){
    const amount=transferValue(s,a,j);
    if(!amount)continue;
    next.values[j]+=amount;
   }
   if(a.kind==='cross'){next.left.cross--;next.locked[i]=true;}
  }
  if(a.effect==='gather')for(const j of neighbors[i]){
   const amount=Math.floor(next.values[j]/2);next.values[j]-=amount;next.values[i]+=amount;
  }
  if(a.effect==='level')equalize(next.values,[i,...neighbors[i]]);
  if(a.effect==='rebound')next.left.h++;
  // Only landing here triggers the old opportunity. Extra changes never recurse.
  const opportunity=s.opportunity;
  if(opportunity?.index===i){
   if(opportunity.type==='warmth')next.values[i]+=2;
   else if(opportunity.type==='flake')for(const j of neighbors[i])next.values[j]=Math.max(0,next.values[j]-1);
  }
  // Collection comes after this hammer; a new charge cannot power its own pickup.
  const pickup=s.specials.find(e=>e.index===i);
  if(pickup){next.stored[pickup.type]++;next.specials=next.specials.filter(e=>e.index!==i);}
  refreshOpportunity(next);
  return next;
 }
 return {rows,cols,count,mask,budget,target,goal,goalText,goalName:goalNames[goal.type],guidance,distance,initial,scoreLabel,scoreIndices,isScoring,effects,opportunityEffects,opportunityDescription,cells,neighbors,crosses,surrounding,transmissionTargets,transferValue,score,total,completion,stars,clone,create,randomSpecials,effectReason,reason,apply};
}

g.createBladeForge=createBladeForge;
})(window);

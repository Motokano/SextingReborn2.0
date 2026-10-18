// Offline tuning helper. A witnessed route proves reachability, not optimality.
export function findRoute(forge,specials=[],{width=70,extreme=false,seed=0,allowCross=true,planAhead=false,allowEffects=true}={}){
 const start=forge.create(specials,seed),type=forge.goal.type;
 if(!allowCross)start.left.cross=0;
 const cost=s=>extreme?(type==='low'?forge.score(s):-forge.score(s)):forge.distance(forge.score(s));
 const rank=s=>{
  let setup=0;
  if(planAhead&&type==='high'&&s.left.h)for(let i=0;i<forge.count;i++){
   if(s.locked[i]||!s.values[i])continue;
   for(const effect of ['',...(allowEffects?['keep','burst','spread'].filter(e=>s.stored[e]>0):[])])for(const kind of s.left.cross?['heavy','cross']:['heavy']){
    if(effect&&!forge.effects[effect].modes.includes(kind))continue;
    let gain=forge.isScoring(i)&&effect!=='keep'?-s.values[i]:0;
    for(const j of forge.transmissionTargets({kind,index:i,effect}))if(forge.isScoring(j)){
     gain+=forge.transferValue(s,{kind,index:i,effect},j);
    }
    setup=Math.max(setup,gain);
   }
  }
  return cost(s)+(type==='low'?.012:-.025)*forge.total(s)-.6*setup;
 };
 let best={state:start,actions:[]},beam=[best],bestCost=cost(start);
 if(!extreme&&bestCost===0)return best;
 const extraHammers=allowEffects?specials.filter(e=>e.type==='rebound').length:0;
 for(let depth=0;depth<forge.budget.h+forge.budget.q+forge.budget.t+extraHammers;depth++){
  const found=new Map();
  for(const node of beam){
   const actions=[];
   if(node.state.left.q)actions.push({kind:'quench'});
   if(node.state.left.t)actions.push({kind:'temper'});
   if(node.state.left.h)for(let index=0;index<forge.count;index++){
    if(node.state.locked[index])continue;
    if(node.state.values[index]){
     actions.push({kind:'heavy',index});
     if(node.state.left.cross)actions.push({kind:'cross',index});
    }
    if(node.state.left.light&&node.state.values[index])actions.push({kind:'light',index});
   }
   if(allowEffects)for(const action of actions.slice())if(action.index!==undefined)for(const [effect,count] of Object.entries(node.state.stored)){
    if(count&&forge.effects[effect].modes.includes(action.kind))actions.push({...action,effect});
   }
   for(const action of actions){
    const state=forge.apply(node.state,action);if(!state)continue;
    const candidate={state,actions:[...node.actions,action]},value=cost(state);
    if(value<bestCost){best=candidate;bestCost=value;}
    if(!extreme&&value===0)return candidate;
    const key=state.values.join(',')+'|'+state.locked.map((v,i)=>v?i:'').join(',')+'|'+Object.values(state.left).join(',')+'|'+JSON.stringify(state.specials)+'|'+Object.values(state.stored).join(',')+'|'+state.randomState+'|'+JSON.stringify(state.opportunity);
    if(!found.has(key))found.set(key,{...candidate,rank:rank(state)});
   }
  }
  beam=[...found.values()].sort((a,b)=>a.rank-b.rank).slice(0,width);
  if(!beam.length)break;
 }
 return best;
}

/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const config={tickMs:1200,water:{uses:2,ticks:1,amount:30,action:'饮水'},stove:{uses:1,ticks:2,amount:40,digestionTicks:25,action:'进食'},medical:{uses:1,ticks:4,ratio:.2,action:'治疗'},rest:{uses:1,ticks:8,amount:20,action:'休息'},campfire:{kind:'stove',uses:1,ticks:2,amount:20,digestionTicks:13,digestionRate:1.6,action:'进食'},kettle:{kind:'water',uses:2,ticks:1,amount:15,action:'饮水'}};
const kind=p=>config[p.id]?.kind||p.id;
const parts={head:{name:'头部',max:50},chest:{name:'胸部',max:100},abdomen:{name:'腹部',max:80},lhand:{name:'左手',max:100},rhand:{name:'右手',max:100},lfoot:{name:'左脚',max:100},rfoot:{name:'右脚',max:100}};
const round=n=>Math.round(n*10000)/10000,clamp=(n,max)=>Math.max(0,Math.min(max,Number(n)||0));
function sample(){return{hydration:40,satiety:55,fatigue:45,damage:{head:18,chest:36,abdomen:28,lhand:32,rhand:25,lfoot:30,rfoot:35},meals:[]};}
function state(){return{remaining:1,progress:0,part:null,fraction:0};}
function initialize(s){s.player.vitals=sample();s.recoveryPoints=(s.map.recoveryPoints||[]).map(p=>({...p,used:false,recovery:{...state(),remaining:config[p.id].uses}}));s.recoveryAction=null;}
function accessible(s,p){return globalThis.RuinsLoot.accessible(s,p);}
function useful(s,p,part){const v=s.player.vitals;if(kind(p)==='water')return v.hydration<100;if(kind(p)==='stove')return v.satiety<150;
 if(p.id==='medical')return !!parts[part]&&v.damage[part]>0;
 return v.fatigue>0||(s.player.stamina<s.player.staminaMax&&v.satiety>=1&&v.hydration>=1);
}
function canUse(s,p,part){return !!p&&p.recovery.remaining>0&&accessible(s,p)&&useful(s,p,p.recovery.part||part);}
function interrupt(s,reason='paused'){s.recoveryAction=null;s.recoveryInterrupted=reason;}
function useTick(s,uid,part){const p=s.recoveryPoints.find(p=>p.uid===uid);if(!canUse(s,p,part))return false;
 const q=p.recovery,c=config[p.id],v=s.player.vitals,before=structuredClone(v);const stamina=s.player.stamina;
 if(p.id==='medical'&&!q.part)q.part=part;
 q.fraction=0;q.progress++;s.recoveryAction={uid};s.recoveryInterrupted=null;
 if(p.id==='medical')v.damage[q.part]=round(Math.max(0,v.damage[q.part]-parts[q.part].max*c.ratio/c.ticks));
 if(p.id==='rest'){
  v.fatigue=round(Math.max(0,v.fatigue-c.amount/c.ticks));
  if(s.player.stamina<s.player.staminaMax&&v.satiety>=1&&v.hydration>=1){s.player.stamina=Math.min(s.player.staminaMax,round(s.player.stamina+2));v.satiety=round(v.satiety-1);v.hydration=round(v.hydration-1);}
 }
 if(q.progress===c.ticks){
  if(kind(p)==='water')v.hydration=Math.min(100,v.hydration+c.amount);
  if(kind(p)==='stove')v.meals.push({remaining:c.amount,ticks:c.digestionTicks,started:s.tick+1,...(c.digestionRate?{rate:c.digestionRate}:{})});
  q.remaining--;if(q.remaining>0)q.progress=0;else{p.used=true;s.recoveryAction=null;}
 }
 if(JSON.stringify(before)!==JSON.stringify(v)||stamina!==s.player.stamina)globalThis.RuinsExpedition?.record(s,'point','recovery:'+uid);
 s.lastRecovery={uid,kind:p.id,before,after:structuredClone(v),staminaBefore:stamina,staminaAfter:s.player.stamina,tick:s.tick+1};return true;
}
function applySpent(s,spent){const v=s.player.vitals;if(!v)return;v.satiety=round(Math.max(0,v.satiety-Math.max(0,spent)*.2));v.fatigue=round(Math.min(100,v.fatigue+Math.max(0,spent)*.1));}
function worldTick(s,spent=0){const v=s.player.vitals;if(!v)return;
 // Existing food model: digestion enters the pool, then baseline expenditure.
 for(const meal of v.meals){if(meal.started>=s.tick||meal.ticks<=0)continue;const gain=Math.min(meal.remaining,meal.rate||meal.remaining/meal.ticks);v.satiety=Math.min(150,round(v.satiety+gain));meal.remaining=round(meal.remaining-gain);meal.ticks--;}
 v.meals=v.meals.filter(m=>m.ticks>0);
 v.satiety=round(Math.max(0,v.satiety-1));
 if(s.tick%2===0)v.hydration=round(Math.max(0,v.hydration-1));
 applySpent(s,spent);
}
// Hook for the combat system's confirmed hit, not enemy visibility/contact.
function receiveHit(s,part,amount){if(!parts[part]||!Number.isFinite(amount)||amount<=0)return false;const v=s.player.vitals;v.damage[part]=clamp(v.damage[part]+amount,parts[part].max);interrupt(s,'hit');globalThis.RuinsHarvest?.cancel(s,'hit');return true;}
function snapshot(s){return{version:1,points:s.recoveryPoints.map(p=>({uid:p.uid,id:p.id,cell:p.cell,recovery:p.recovery})),vitals:s.player.vitals};}
function restore(s,data){
 const old=data?.points||[];
 for(const p of s.recoveryPoints){const saved=old.find(q=>q.uid===p.uid&&q.id===p.id&&q.cell===p.cell),q=saved?.recovery,c=config[p.id];if(!q)continue;
  if(!Number.isInteger(q.remaining)||q.remaining<0||q.remaining>c.uses||!Number.isInteger(q.progress)||q.progress<0||q.progress>c.ticks||q.part&&!parts[q.part])continue;
  if(q.remaining===0&&q.progress!==c.ticks||q.remaining>0&&q.progress===c.ticks||p.id==='medical'&&q.progress>0&&!q.part)continue;
  p.recovery={remaining:q.remaining,progress:q.progress,part:q.part||null,fraction:clamp(q.fraction,.9999)};p.used=q.remaining===0;
 }
 const saved=data?.vitals||s.player.vitals,defaults=sample();s.player.vitals={...defaults};
 if(saved){const v=s.player.vitals;for(const [k,max]of[['hydration',100],['satiety',150],['fatigue',100]])if(Number.isFinite(saved[k]))v[k]=clamp(saved[k],max);
  v.damage=Object.fromEntries(Object.entries(parts).map(([k,p])=>[k,clamp(saved.damage?.[k]??defaults.damage[k],p.max)]));
  v.meals=(saved.meals||[]).filter(m=>Number.isInteger(m.ticks)&&m.ticks>0&&m.ticks<=25&&Number.isFinite(m.remaining)&&m.remaining>=0&&m.remaining<=40&&Number.isInteger(m.started)).map(m=>({...m,rate:Number.isFinite(m.rate)&&m.rate>0&&m.rate<=1.6?m.rate:undefined,started:Math.min(m.started,s.tick)}));
 }interrupt(s);
}
function resetSample(s,p){p.recovery={...state(),remaining:config[p.id].uses};p.used=false;s.player.vitals=sample();s.player.stamina=60;interrupt(s);s.lastRecovery=null;}
globalThis.RuinsRecovery={config,kind,parts,sample,initialize,accessible,useful,canUse,useTick,worldTick,applySpent,interrupt,receiveHit,snapshot,restore,resetSample};
})();

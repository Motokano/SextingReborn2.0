/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const config={door:10,kill:5,point:5}; // Integer percentage points; one final rounding.
const maxFloor=4;
const clone=v=>structuredClone(v),identity=m=>RuinsContainerSearch.identity(m);
function initialize(s){s.reward={version:1,door:[],kill:[],point:[]};s.defeated=[];s.ended=false;}
function record(s,kind,id){
 if(s.ended||!Object.hasOwn(config,kind))return false;
 const q=s.reward|| (initialize(s),s.reward),key=String(id);
 if(q[kind].includes(key))return false;q[kind].push(key);return true;
}
function restore(s,data){
 if(!data||data.version!==1)return false;
 const doors=new Set(s.doors.map(d=>String(d.cell))),enemies=new Set(s.map.enemies.map(e=>e.uid));
 const points=new Set([...(s.lootPoints||[]).map(p=>'loot:'+p.uid),...(s.recoveryPoints||[]).map(p=>'recovery:'+p.uid),...(s.insightPoints||[]).map(p=>'insight:'+p.uid),...(s.harvestPoints||[]).map(p=>'harvest:'+p.uid)]);
 if(!['door','kill','point'].every(k=>Array.isArray(data[k])&&data[k].every(id=>typeof id==='string'&&({door:doors,kill:enemies,point:points})[k].has(id))))return false;
 s.reward={version:1,...Object.fromEntries(['door','kill','point'].map(k=>[k,[...new Set(data[k])]]))};return true;
}
function summary(s){
 const memory=s.exploration?.tiles||[],floor=Math.max(1,Math.trunc(Number(s.map.floor)||1));
 // Terrain is counted once; solid props, walls and still-closed doors are not walkable ground.
 const cells=memory.reduce((n,t,k)=>n+Number([0,1,2,4,6].includes(t)&&RuinsSettlement.walkable(s.staticTiles[k])),0);
 return {identity:identity(s.map),floor,cells,base:cells*floor,door:s.reward?.door.length||0,kill:s.reward?.kill.length||0,point:s.reward?.point.length||0};
}
function aggregate(rows){
 const result={cells:0,base:0,door:0,kill:0,point:0};
 for(const row of rows)for(const k of Object.keys(result))result[k]+=row[k];
 result.percent=100+result.door*config.door+result.kill*config.kill+result.point*config.point;
 result.total=Math.floor((result.base*result.percent+50)/100);return result;
}
const key='ruins-expedition-v1';
function createStore(storage){
 let data={version:1,balance:0,run:null},fresh=true;
 try{const saved=JSON.parse(storage.getItem(key));if(saved?.version===1&&Number.isSafeInteger(saved.balance)&&saved.balance>=0&&(!saved.run||saved.run.id&&saved.run.floors&&['active','settled'].includes(saved.run.status))){data=saved;fresh=false;}}catch{}
 function persist(){try{storage.setItem(key,JSON.stringify(data));return true;}catch{return false;}}
 const context=options=>JSON.stringify([options.seed,options.preset,options.mixed,options.recovery]);
 function contentVersion(options){return data.run?.context===context(options)?data.run.contentVersion||0:1;}
 function contentConfig(options,{restart=false,overrides={},ticketOverrides={}}={}){
  const C=RuinsContentConfig;
  if(!restart&&data.run?.context===context(options))return C.normalize(data.run.contentConfig||C.legacyV1);
  return C.resolve({overrides,ticketOverrides});
 }
 function resume(options){return data.run?.advanced&&data.run.context===context(options)?data.run.current:null;}
 function carry(s,value){for(const k of ['stamina','skills','vitals','harvestProficiency','harvestToolReduction'])if(value.player[k]!==undefined)s.player[k]=clone(value.player[k]);s.bag=clone(value.bag);s.night=value.night;s.tick=value.tick||0;}
 function start(options){data.run={id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),context:context(options),status:'active',floors:{},carry:null,receipt:null};persist();return data.run;}
 function attach(s,options,{restart=false}={}){
  const initial=fresh;fresh=false;
  if(restart||!data.run||data.run.context!==context(options))start(options);
  const run=data.run,saved=run.floors[identity(s.map)];
  const rules=RuinsContentConfig.normalize(s.map.contentConfig||RuinsContentConfig.legacyV1);
  if(run.contentConfig&&JSON.stringify(RuinsContentConfig.normalize(run.contentConfig))!==JSON.stringify(rules))throw Error('本次探险的内容配置不匹配');
  run.contentConfig=rules;
  run.contentVersion??=s.map.contentVersion||0;
  if(run.advanced&&identity(s.map)!==run.current.identity)throw Error('请从当前层继续探险');
  if(saved)RuinsContainerSearch.restore(s,saved.snapshot);
  else if(initial&&!restart)RuinsContainerSearch.load(s);
  else if(run.carry)carry(s,run.carry);
  run.startFloor??=s.map.floor;
  run.current={floor:s.map.floor,seed:s.map.seed,identity:identity(s.map)};
  s.expeditionId=run.id;s.ended=run.status==='settled';save(s);return run;
 }
 function save(s){
  const run=data.run;if(!run||run.id!==s.expeditionId||run.status!=='active'||run.advanced&&identity(s.map)!==run.current.identity)return false;
  const snapshot=clone(RuinsContainerSearch.snapshot(s));
  run.floors[identity(s.map)]={summary:summary(s),width:s.map.width,height:s.map.height,snapshot};
  run.carry={player:clone(s.player),bag:clone(s.bag),night:s.night,tick:s.tick};return persist();
 }
 function totals(s){
  const run=data.run;if(!run)return {...aggregate([]),rows:[]};
  const rows=Object.values(run.floors).map(f=>f.summary);
  if(s&&s.expeditionId===run.id&&run.status==='active'){const current=summary(s),i=rows.findIndex(r=>r.identity===current.identity);if(i<0)rows.push(current);else rows[i]=current;}
  rows.sort((a,b)=>a.floor-b.floor);return {...aggregate(rows),rows};
 }
 function settle(s){
  const run=data.run;if(!run||run.id!==s.expeditionId)return null;
  if(run.status==='settled')return run.receipt;
  if(s.player.cell!==s.map.exit||run.advanced&&identity(s.map)!==run.current.identity)return null;
  const before=clone(data);save(s);const amounts=totals(s);
  run.receipt={id:run.id,...amounts,before:data.balance,after:data.balance+amounts.total};
  data.balance=run.receipt.after;run.status='settled';
  // A single durable write commits both the receipt and balance. Reopening never credits twice.
  if(!persist()){data=before;return null;}
  s.ended=true;return run.receipt;
 }
 function claimInsight(s,uid){
  const run=data.run,p=s.insightPoints?.find(p=>p.uid===uid),key=identity(s.map)+':'+uid;
  if(!run||run.status!=='active'||s.expeditionId!==run.id||!p||p.used||run.insightReceipts?.[key]||!RuinsInsight.accessible(s,p))return null;
  const before=clone(data),world=clone(RuinsContainerSearch.snapshot(s));
  if(!RuinsEncounter.act(s,{type:'insight',uid}))return null;
  const receipt={uid,amount:p.amount,before:data.balance,after:data.balance+p.amount};
  run.insightReceipts??={};run.insightReceipts[key]=receipt;data.balance=receipt.after;
  if(!save(s)){data=before;RuinsContainerSearch.restore(s,world);return null;}
  return receipt;
 }
 function next(s){
  const run=data.run;
  if(!run||run.status!=='active'||run.id!==s.expeditionId||s.ended||s.player.cell!==s.map.exit||s.map.floor>=maxFloor||run.advanced&&identity(s.map)!==run.current.identity)return null;
  return {floor:s.map.floor+1,seed:JSON.parse(run.context)[0]+'|floor-'+(s.map.floor+1)};
 }
 function descend(s,destination){
  const plan=next(s);if(!plan||destination.map.floor!==plan.floor||destination.map.seed!==plan.seed||destination.map.preset!==s.map.preset)return false;
  if(JSON.stringify(RuinsContentConfig.normalize(destination.map.contentConfig||RuinsContentConfig.legacyV1))!==JSON.stringify(RuinsContentConfig.normalize(data.run.contentConfig||RuinsContentConfig.legacyV1)))return false;
  const before=clone(data),run=data.run;
  if(!save(s)){data=before;return false;}
  carry(destination,run.carry);destination.expeditionId=run.id;destination.ended=false;
  // Only chart memory and reward totals survive; prior floor world snapshots cannot be revisited.
  for(const f of Object.values(run.floors)){f.archived=true;f.snapshot={exploration:clone(f.snapshot.exploration)};}
  run.advanced=true;run.current={...plan,identity:identity(destination.map)};
  if(!save(destination)){data=before;return false;}
  return true;
 }
 return {attach,save,totals,settle,claimInsight,next,descend,resume,contentVersion,contentConfig,get data(){return data;}};
}
globalThis.RuinsExpedition={config,maxFloor,initialize,record,restore,summary,aggregate,createStore};
})();

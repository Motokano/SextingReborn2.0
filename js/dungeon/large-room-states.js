/* SPDX-License-Identifier: GPL-3.0-only
 * V13: plan themed terrain independently, then spend existing floor budgets.
 * Full -> light -> abandoned is a one-way downgrade; no extra loot is minted.
 */
(()=>{'use strict';
const R=RuinsSettlement;
const roll=(m,key,id)=>R.hash(m.seed+'-large-room-'+m.floor+'-'+key+'-'+id)/4294967296;
const eligible=(r,c)=>c?.enabled&&r.inner.length>=c.minArea&&r.inner.length<=c.maxArea;
function quotas(total,weights,m){
 const sum=Object.values(weights).reduce((a,b)=>a+b,0),rows=Object.entries(weights).map(([key,w])=>({key,exact:total*w/sum,n:Math.floor(total*w/sum)}));
 let left=total-rows.reduce((n,r)=>n+r.n,0);
 rows.sort((a,b)=>(b.exact-b.n)-(a.exact-a.n)||roll(m,'quota',a.key)-roll(m,'quota',b.key));
 for(const r of rows){if(!left)break;if(weights[r.key]>0){r.n++;left--;}}
 return Object.fromEntries(rows.map(r=>[r.key,r.n]));
}
function plan(m,room,uses){
 const c=m.contentConfig,o=c.outposts,weights=c.largeRooms.themes;
 const types=Object.keys(weights).filter(t=>weights[t]>0&&(!c[t]||c[t].enabled&&room.inner.length>=c[t].minArea&&room.inner.length<=c[t].maxArea));
 const rank=t=>-Math.log(Math.max(1e-9,roll(m,'theme-'+t,room.id)))*(1+(uses[t]||0))/weights[t];
 types.sort((a,b)=>rank(a)-rank(b));
 for(const type of types){
  const cfg=c[type]||o,large=room.inner.length>=cfg.largeArea;
  const min=type==='recovery'?o.minRestEnemies:cfg.minEnemies||o.lootEnemies,max=type==='recovery'?o.restEnemies:cfg.maxEnemies?(large?cfg.maxEnemies:cfg.minEnemies):large?o.largeEnemies:o.lootEnemies;
  const n=type==='canteen'?(large?cfg.maxLoot:cfg.minLoot):type==='clinic'?1:type==='workshop'?cfg.lootPoints:type==='recovery'?1:large?o.largeLootPoints:o.lootPoints;
  for(let count=max;count>=min;count--){
   const p=type==='canteen'?RuinsCanteen.layout(m,room,count,n,cfg):type==='clinic'?RuinsClinic.layout(m,room,count,cfg):type==='workshop'?RuinsWorkshop.layout(m,room,count,cfg):RuinsOutposts.layout(m,room,count,n,o);
   if(p){
    const terrain=p.workshop||p.clinic||p.canteen||!c.outpostDecor.enabled?null:RuinsOutpostDecor.planPartitions(m,room,p);
    return {type,p,terrain,minEnemies:min,lootSlots:type==='recovery'?[]:p.points.slice(0,type==='clinic'?1:n),foodSlots:p.canteen?.food||[],recoveryCell:type==='clinic'?p.points[1]:type==='recovery'?p.points[0]:null};
   }
  }
 }
 // Narrow/irregular buildings can fail every requested theme. Keep a safe
 // abandoned shell with existing rubble/racks instead of inventing rewards.
 const p=RuinsOutposts.layout(m,room,3,2,o)||{cells:[],points:[],depths:[],landings:RuinsResources.neighbours(room.door,m).filter(k=>room.inner.includes(k))};
 return {type:'loot',p,terrain:c.outpostDecor.enabled?RuinsOutpostDecor.planPartitions(m,room,p):null,minEnemies:0,lootSlots:[],foodSlots:[],recoveryCell:null,forceAbandoned:true};
}
function populate(m,catalog,recoveryId){
 const c=m.contentConfig.largeRooms,rooms=m.rooms.filter(r=>eligible(r,c)&&!r.enemyCount&&!r.nodes?.length&&!r.mixedType);
 rooms.sort((a,b)=>roll(m,'state',a.id)-roll(m,'state',b.id));
 const target=quotas(rooms.length,c.states,m),labels=Object.entries(target).flatMap(([state,n])=>Array(n).fill(state));
 // Shuffled room order and rounded quotas avoid a separate chance roll turning
 // a small floor into all-empty rooms. Geometry gets its own random channel.
 const uses={},plans=[];
 rooms.forEach((room,i)=>{
  room.requestedLargeState=labels[i];room.reservedEmpty=false;
  const layout=plan(m,room,uses);
  if(layout){uses[layout.type]=(uses[layout.type]||0)+1;plans.push({room,...layout});}
  else {room.largeRoomState='abandoned';room.largeRoomReason='layout';room.reservedEmpty=true;}
 });
 const budget=m.largeRoomBudget={target,eligible:rooms.length,enemies:m.enemies.length,containers:m.lootPoints.length,actual:{full:0,light:0,abandoned:0},downgraded:0};
 m.outpostBudget={target:rooms.length,enemies:m.enemies.length,containers:m.lootPoints.length};
 m.largeRoomBlocked=new Set();
 // Spend on full rooms first, then distribute the remaining pool among light
 // rooms. Full rooms that cannot afford their minimum join the light pass.
 const donorRooms=m.enemyRooms.slice(),freeEnemies=()=>m.populationConfig?Infinity:Math.max(0,donorRooms.reduce((n,r)=>n+(r.enemies?.length||0),0)-c.reserveEnemies);
 const freeLoot=()=>m.lootPoints.filter(p=>p.roomId===undefined),lootBudget=()=>Math.max(0,freeLoot().length-c.reserveOutdoorContainers);
 const normalCapacity=type=>type==='clinic'?Math.max(0,RuinsContainerProfiles.clinicIds.size-m.outposts.filter(r=>r.outpostType==='clinic').reduce((n,r)=>n+r.lootPoints.length,0)):Infinity;
 const recoveryTypes=catalog.filter(p=>['water','stove','medical','rest'].includes(p.id));
 const takeEnemies=(room,p,n)=>{
  const moved=[];
  while(!m.populationConfig&&moved.length<n){const donor=donorRooms.filter(r=>r.enemies?.length).sort((a,b)=>b.enemies.length-a.enemies.length||a.id-b.id)[0];moved.push(donor.enemies.pop());donor.enemyCount=donor.enemies.length;}
  const removed=new Set(moved.map(e=>e.uid));m.enemies=m.enemies.filter(e=>!removed.has(e.uid));
  room.enemies=p.cells.slice(0,n).map((cell,i)=>({uid:'outpost-'+room.id+'-'+(i+1),roomId:room.id,cell,number:i+1,name:'土匪',entrySteps:p.depths[i]}));room.enemyCount=n;m.enemies.push(...room.enemies);
 };
 const allocate=(layout,state,n,normal,food,recovery)=>{
  const {room,type,p}=layout;room.largeRoomState=state;room.outpostType=type;room.landings=p.landings;room.lootPoints=[];room.enemies=[];room.enemyCount=0;
  if(p.workshop)RuinsWorkshop.commit(m,room,p.workshop);
  if(p.clinic)RuinsClinic.commit(m,room,p.clinic);
  if(p.canteen)RuinsCanteen.commit(m,room,p.canteen);
  if(layout.terrain){room.largeRoomTerrain=layout.terrain;for(const k of layout.terrain.cells)m.largeRoomBlocked.add(k);}
  if(n)takeEnemies(room,p,n);
  const items=freeLoot().slice(0,normal+food);
  items.slice(0,normal).forEach((point,i)=>{point.cell=layout.lootSlots[i];point.roomId=room.id;room.lootPoints.push(point);});
  if(food)RuinsCanteen.addContainers(m,room,items.slice(normal));
  if(recovery){const kind=type==='clinic'?recoveryTypes.find(p=>p.id==='medical'):recoveryTypes.find(p=>p.id===recoveryId)||recoveryTypes[R.hash(m.seed+'-large-recovery-'+room.id)%recoveryTypes.length];
   const point={...kind,uid:'recovery-'+room.id,roomId:room.id,cell:layout.recoveryCell,used:false};room.recoveryPoints=[point];m.recoveryPoints.push(point);
  }
  if(n&&(normal+food||recovery)){room.mixedType=recovery?'recovery':'loot';m.mixedRooms.push(room);}
  m.outposts.push(room);budget.actual[state]++;
  if(state!==room.requestedLargeState)budget.downgraded++;
 };
 const pending=[];
 for(const layout of plans){
  const {room,p,lootSlots,foodSlots,recoveryCell,minEnemies}=layout;
  if(room.requestedLargeState==='abandoned'||layout.forceAbandoned){if(layout.forceAbandoned)room.largeRoomReason='layout';allocate(layout,'abandoned',0,0,0,false);continue;}
  if(room.requestedLargeState!=='full'){pending.push(layout);continue;}
  const recovery=recoveryCell!==null,lootCount=lootSlots.length+foodSlots.length;
  if(freeEnemies()<minEnemies||lootBudget()<lootCount||normalCapacity(layout.type)<lootSlots.length||recovery&&m.recoveryPoints.length){pending.push(layout);continue;}
  // Keep the minimum first so a single four-person room cannot consume the
  // third guard needed by another full room on the same floor.
  allocate(layout,'full',Math.min(minEnemies,p.cells.length),lootSlots.length,foodSlots.length,recovery);
 }
 for(let i=0;i<pending.length;i++){
  const layout=pending[i],{room,p,lootSlots,foodSlots,recoveryCell}=layout,remaining=pending.length-i;
  const n=Math.min(p.cells.length,c.light.maxEnemies,Math.floor(freeEnemies()/remaining)),slots=lootSlots.length+foodSlots.length;
  const desired=c.light.minContainers+Math.floor(roll(m,'light-loot',room.id)*(c.light.maxContainers-c.light.minContainers+1));
  const count=Math.min(slots,foodSlots.length+normalCapacity(layout.type),desired,Math.ceil(lootBudget()/remaining));
  // A light clinic/rest area may use the existing one indoor recovery slot,
  // but never adds a second slot merely because another building was dressed.
  const recovery=!count&&recoveryCell!==null&&!m.recoveryPoints.length;
  const valid=n>=c.light.minEnemies&&(n>0||count>0||recovery);
  if(!valid){room.largeRoomReason='budget';allocate(layout,'abandoned',0,0,0,false);continue;}
  const food=Math.min(foodSlots.length,count),normal=count-food;
  allocate(layout,'light',n,normal,food,recovery);
 }
 for(const r of donorRooms)if(!r.enemyCount){delete r.enemies;delete r.enemyCount;delete r.landings;}
 m.enemyRooms=m.rooms.filter(r=>r.enemyCount);
 for(const r of rooms.filter(r=>!r.outpostType)){budget.actual.abandoned++;if(r.requestedLargeState!=='abandoned')budget.downgraded++;}
 m.roomAllocation.reservedEmpty=m.rooms.filter(r=>r.reservedEmpty).length;
 return m;
}
globalThis.RuinsLargeRooms={eligible,quotas,plan,populate};
})();

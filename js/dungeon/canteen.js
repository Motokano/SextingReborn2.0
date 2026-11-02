/* SPDX-License-Identifier: GPL-3.0-only
 * Dining rows, a screened kitchen and two independent rear approaches.
 * V12 food crates use the container budget. Older saves keep harvesting nodes.
 */
(()=>{'use strict';
const R=RuinsSettlement,RS=RuinsResources;
const foodIds=new Set(['red','grass','leaf','sweet','purple','shiitake','chili','yellow','plum','parsley','thyme','pecan','floral','oregano','rosemary','sage','bay','dill']);
const foodDonor=m=>m.resourceRooms.find(r=>!r.mixedType&&r.resourceType==='gather'&&r.nodes.filter(n=>foodIds.has(n.id)).length>=2);
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function layout(m,room,count,lootCount,cfg){
 const w=m.width,inside=new Set(room.inner),orth=k=>RS.neighbours(k,m),landings=orth(room.door).filter(k=>inside.has(k));
 if(!landings.length||room.inner.length<cfg.minArea||room.inner.length>cfg.maxArea)return null;
 const terrain=blocked=>m.tiles.map((_,k)=>inside.has(k)?blocked.has(k)?6:2:5);
 const flow=(blocked,eight=false)=>R.flood(terrain(blocked),w,m.height,landings[0],eight);
 const base=flow(new Set()),plans=[];
 for(const compact of [false,true])for(const axis of ['x','y'])for(const sign of [-1,1])for(const origin of room.inner){
  const x=origin%w,y=Math.floor(origin/w),at=(u,v)=>{v=Math.max(0,v-Number(compact));const nx=x+(axis==='x'?u:v*sign),ny=y+(axis==='x'?v*sign:u);return nx>=0&&nx<w&&ny>=0&&ny<m.height?ny*w+nx:-1;};
  const envelope=[];for(let v=0;v<10;v++)for(let u=0;u<7;u++)envelope.push(at(u,v));if(envelope.some(k=>!inside.has(k)))continue;
  if(base.dist[at(3,0)]+3>base.dist[at(3,9)])continue;
  const rows=[[],[]];for(let u=3;inside.has(at(u,2));u--)rows[0].push(at(u,2));for(let u=3;inside.has(at(u,4));u++)rows[1].push(at(u,4));
  if(rows.some(row=>row.length<4||row.length>6))continue;
  const tables=rows.flat(),walls=[at(2,6),at(3,6),at(4,6)],counters=[[at(2,7),at(2,8)],[at(4,7),at(4,8)]],solid=[...tables,...walls,...counters.flat()];
  const food=[at(1,8),at(5,8)],points=[at(0,6),at(6,6)].slice(0,lootCount),fixed=new Set([...solid,...food,...points]);
  if(fixed.size!==solid.length+food.length+points.length||solid.length>inside.size*cfg.maxBlockedRatio||[...walls,...counters.flat(),...food,...points].some(k=>distance(k,room.door,w)<cfg.doorBuffer)||tables.some(k=>distance(k,room.door,w)<cfg.tableDoorBuffer))continue;
  const left=[[3,5],[2,5],[1,5],[1,6],[1,7],[0,7],[0,8],[0,9],[1,9],[2,9],[3,9]].map(([u,v])=>at(u,v));
  const right=[[3,5],[4,5],[5,5],[5,6],[5,7],[6,7],[6,8],[6,9],[5,9],[4,9],[3,9]].map(([u,v])=>at(u,v));
  const reserved=new Set([...left,...right,...landings]);if([...reserved].some(k=>fixed.has(k)))continue;
  const f=flow(fixed);if(f.reached!==inside.size-fixed.size||[...food,...points].some(k=>orth(k).filter(n=>f.dist[n]>=0).length<2))continue;
  // Measure actual eight-way routes with and without the dining rows. They
  // must create a detour; decorations and enemies cannot fake the result.
  const withRows=flow(fixed,true),withoutRows=flow(new Set([...walls,...counters.flat(),...food,...points]),true);
  const lengths=food.map(k=>{const access=orth(k).filter(n=>withRows.dist[n]>=0);return{before:Math.min(...access.map(n=>withoutRows.dist[n])),after:Math.min(...access.map(n=>withRows.dist[n]))};});
  if(lengths.some(p=>p.after-p.before<cfg.minExtraSteps))continue;
  const rank=base.dist[at(3,0)]+tables.length*.15+R.hash(m.seed+'-canteen-'+origin+'-'+axis+'-'+sign)%997/997;
  plans.push({axis,sign,compact,origin,rows,tables,walls,counters,solid,food,points,left,right,reserved:[...reserved],lengths,rank,kitchen:[at(3,7),at(3,8)]});
 }
 plans.sort((a,b)=>a.rank-b.rank);let tries=0;
 for(const p of plans.slice(0,cfg.maxCandidates)){
  const fixed=new Set([...p.solid,...p.food,...p.points]),f=flow(fixed,true),reserved=new Set(p.reserved),available=room.inner.filter(k=>f.dist[k]>=cfg.doorBuffer&&!reserved.has(k));
  const far=Math.max(...available.map(k=>f.dist[k])),goals=[3,far*.5,far,far*.7];let chosen=null;
  function search(cells){
   if(chosen||tries>=cfg.layoutAttempts)return;
   if(cells.length===count){const blocked=new Set([...fixed,...cells]),next=flow(blocked);
    if(inside.size-blocked.size<Math.ceil(inside.size*Math.max(cfg.freeRatio,m.contentConfig.outposts.freeRatio))||next.reached!==inside.size-blocked.size||[...p.food,...p.points].some(k=>orth(k).filter(n=>next.dist[n]>=0).length<2)||cells.some(k=>!orth(k).some(n=>next.dist[n]>=0))||!cells.some(k=>p.kitchen.includes(k)))return;
    chosen=cells.slice();return;
   }
   const slot=cells.length,rank=k=>Math.abs(f.dist[k]-goals[slot])+(slot===2&&!p.kitchen.includes(k)?30:0);
   const list=available.filter(k=>cells.every(q=>distance(k,q,w)>=2&&distance(k,q,w)<=9)).sort((a,b)=>rank(a)-rank(b)||a-b).slice(0,20);
   for(const k of list){tries++;search([...cells,k]);if(chosen||tries>=cfg.layoutAttempts)return;}
  }
  search([]);if(chosen){const{rank,...canteen}=p;return{cells:chosen,points:p.points,landings,depths:chosen.map(k=>f.dist[k]),canteen};}
 }
 return null;
}
function commit(m,room,plan,donor){
 room.canteen=plan;
 for(const k of plan.solid)m.canteenBlocked.add(k);
 for(const k of plan.walls){m.canteenOpaque.add(k);m.canteenWalls.add(k);m.canteenObstacles.push({uid:'canteen-wall-'+room.id+'-'+k,roomId:room.id,cell:k,kind:'canteen-wall',moduleWall:true,solid:true,opaque:true,footprint:[k]});}
 const prop=(kind,cells)=>{const cell=Math.max(...cells),horizontal=cells.length===1||Math.floor(cells[0]/m.width)===Math.floor(cells[1]/m.width);m.canteenObstacles.push({uid:kind+'-'+room.id+'-'+cell,roomId:room.id,kind,cell,footprint:cells,solid:true,opaque:false,flip:!horizontal,offsetX:horizontal&&cells.length===2?-.5:0,offsetY:!horizontal&&cells.length===2?-.5:0});};
 for(const row of plan.rows)for(let i=0;i<row.length;i+=2)prop(i+1<row.length?'canteen-table-v1':'broken-chair',row.slice(i,i+2));
 for(const pair of plan.counters)prop('canteen-counter-v1',pair);
 if(m.contentConfig.version>=12)return;
 const old=donor.nodes.slice(),edible=old.filter(n=>foodIds.has(n.id)),first=edible[0],second=edible.find(n=>n.id!==first.id)||edible[1],nodes=[first,second];
 // Retire that resource room as a whole so this room replaces, rather than
 // increases, the 10–20% resource-room allocation. Excess nodes are not added.
 m.resources=m.resources.filter(n=>!old.includes(n)||nodes.includes(n));
 donor.nodes=[];delete donor.resourceType;delete donor.resourceSize;
 room.resourceType='gather';room.resourceSize=2;room.nodes=nodes;
 nodes.forEach((n,i)=>{n.roomId=room.id;n.cell=plan.food[i];n.provision=true;n.name=RS.definitions.find(d=>d.id===n.id).name+'食材筐';});
 room.canteen.resourceTransfer={donor:donor.id,before:old.length,after:nodes.length};
 m.resourceRooms=m.resourceRooms.filter(r=>r!==donor);m.resourceRooms.push(room);
}
function addContainers(m,room,points){
 for(let i=0;i<points.length;i++){
  const p=points[i];Object.assign(p,{roomId:room.id,cell:room.canteen.food[i],assetId:'canteen-food-crate-v1',name:'食材筐',foodCrate:true,containerCategory:'food',containerUse:'food',containerTheme:'canteen',contentWeights:RuinsContainerProfiles.weights('food','canteen',m.contentConfig.containers)});
  delete p.lootTheme;room.lootPoints.push(p);
 }
}
globalThis.RuinsCanteen={foodDonor,layout,commit,addContainers};
})();

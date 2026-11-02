/* SPDX-License-Identifier: GPL-3.0-only
 * Resource-room dressing only. Street and building geometry remains SettleMaker's.
 * Counts/weights below are preview tuning, not final economy or harvest-use values.
 */
(()=>{'use strict';
const R=globalThis.RuinsSettlement,dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const types={
 gather:{name:'采集',color:'#b8cf8b',floor:'#536448',counts:[[2,2],[3,4],[5,6]],preferredArea:26,minArea:12,maxArea:36,spacing:2.3},
 mine:{name:'采矿',color:'#a7cbd2',floor:'#526569',counts:[[1,1],[2,2],[3,3]],preferredArea:10,minArea:8,maxArea:18,spacing:2.1},
 wood:{name:'伐木',color:'#dfb783',floor:'#776046',counts:[[1,1],[2,3],[4,4]],preferredArea:16,minArea:10,maxArea:28,spacing:2.5}
};
// Allow-lists follow gathering-point-first-release.md (the four ruins floors).
// One node has one named main product. There is no corpse-loot roll here.
const definitions=[
 ['red','红火莓','gather',[1,2],'berries',6],
 ['grass','青草尖','gather',[1],'herb',6],
 ['leaf','清香叶','gather',[1],'herb',6],
 ['sweet','甘花茎','gather',[1],'flower',5],
 ['bitter','涩堇草','gather',[1],'flower',2],
 ['purple','紫苏果','gather',[2,3],'berries',6],
 ['shiitake','香菇','gather',[2,3],'mushroom',6],
 ['chili','野山椒','gather',[2],'berries',5],
 ['root','苦根草','gather',[2,3],'herb',2],
 ['cocoon','野蚕茧','gather',[2,4],'cocoon',2],
 ['yellow','黄肚柑','gather',[3,4],'berries',6],
 ['plum','酸梅','gather',[3],'berries',5],
 ['parsley','平叶欧芹','gather',[3],'herb',5],
 ['thyme','百里香','gather',[3],'flower',5],
 ['vine','赤花藤','gather',[3],'flower',2],
 ['pecan','山核桃','gather',[4],'berries',5],
 ['floral','花菇','gather',[4],'mushroom',2],
 ...[['oregano','牛至'],['rosemary','迷迭香'],['sage','鼠尾草'],['bay','月桂叶'],['dill','莳萝']].map(([id,name])=>[id,name,'gather',[4],'herb',5]),
 ['clay','黏土','mine',[1,2],'clay',3],
 ['salt','岩盐','mine',[2,3,4],'salt',6],
 ['limestone','石灰岩','mine',[3],'ore',3],
 ['copper','铜矿','mine',[3,4],'ore',2],
 ['iron','铁矿','mine',[4],'ore',2],
 ['bamboo','青竹','wood',[1,2],'bamboo',2],
 ['birch','桦树','wood',[2],'tree',2],
 ['oak','橡树','wood',[3,4],'tree',2],
 ['beech','榉树','wood',[4],'tree',2],
 ['firewood','拾柴','wood',[1,2],'logs',3],
 ['shrub','干枯灌木','wood',[1,2],'shrub',3],
 ['deadwood','枯木堆','wood',[3,4],'logs',3]
].map(([id,name,type,floors,shape,weight])=>({id,name,type,floors,shape,weight}));
function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function pick(list,rnd){let n=rnd()*list.reduce((s,x)=>s+x.weight,0);for(const x of list){n-=x.weight;if(n<0)return x;}return list.at(-1);}
function neighbours(k,m){const x=k%m.width,y=Math.floor(k/m.width);return dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&b>=0&&a<m.width&&b<m.height).map(([a,b])=>b*m.width+a);}
function cellDistance(a,b,w){return Math.hypot(a%w-b%w,Math.floor(a/w)-Math.floor(b/w));}
function place(map,room,target,rnd,type){
 const occupied=[],floor=new Set(room.inner),entry=neighbours(room.door,map).filter(k=>floor.has(k));
 const candidates=room.inner.filter(k=>cellDistance(k,room.door,map.width)>1.5).map(k=>({k,tie:rnd()}));
 // Preserve connected circulation and an orthogonal interaction cell for every
 // node. Never carve walls or move doors to make the content fit.
 function fits(k){
  map.collision[k]=6;
  const remaining=room.inner.filter(a=>map.collision[a]!==6),seen=new Set(),q=entry.filter(a=>map.collision[a]!==6);
  q.forEach(a=>seen.add(a));
  for(let i=0;i<q.length;i++)for(const n of neighbours(q[i],map))if(floor.has(n)&&map.collision[n]!==6&&!seen.has(n)){seen.add(n);q.push(n);}
  const valid=remaining.length>=Math.ceil(room.inner.length*.6)&&seen.size===remaining.length&&[...occupied,k].every(a=>neighbours(a,map).some(n=>seen.has(n)));
  if(!valid)map.collision[k]=2;
  return valid;
 }
 while(occupied.length<target){
  const ranked=candidates.filter(c=>map.collision[c.k]!==6).map(c=>{
   const separation=occupied.length?Math.min(...occupied.map(k=>cellDistance(k,c.k,map.width))):3;
   const edge=neighbours(c.k,map).some(k=>map.tiles[k]===1)?1:0;
   // Keep each resource patch together, with slightly more working space for
   // trees. Mineral outcrops prefer walls; no room scatters nodes to all corners.
   const spacing=occupied.length?4-Math.abs(separation-types[type].spacing):6;
   return{...c,score:spacing+edge*(type==='mine'?1.5:1)+c.tie};
  }).sort((a,b)=>b.score-a.score||a.k-b.k);
  let chosen=null;
  for(const c of ranked){if(occupied.some(k=>cellDistance(k,c.k,map.width)<1.9))continue;if(fits(c.k)){chosen=c.k;break;}}
  if(chosen===null)break;
  occupied.push(chosen);
 }
 return occupied;
}
function quota(map,floor,config){
 const {minRatio,maxRatio}=config.resourceRooms;
 const min=Math.ceil(map.rooms.length*minRatio),max=Math.floor(map.rooms.length*maxRatio),rnd=random(R.hash(map.seed+'-resource-quota-'+floor));
 const target=max>=min?min+Math.floor(rnd()*(max-min+1)):max;
 return {min,max,target};
}
function populate(map,floor=3,options={}){
 map.contentVersion=options.legacy?0:1;
 map.contentConfig=options.legacy?RuinsContentConfig.legacyV1:RuinsContentConfig.normalize(options.contentConfig||RuinsContentConfig.defaults);
 floor=Math.max(1,Math.min(4,Math.trunc(Number(floor))||3));
 map.floor=floor;map.resources=[];map.resourceRooms=[];map.collision=map.tiles.slice();
 for(const enemy of map.enemies||[])map.collision[enemy.cell]=7;
 for(const room of map.rooms){delete room.resourceType;delete room.nodes;delete room.resourceSize;}
 const rnd=random(R.hash(map.seed+'-resources-'+floor));
 const candidates=map.rooms.map(room=>({room,tie:rnd()})).filter(c=>!c.room.enemyCount&&!c.room.reservedEmpty),used=new Set();
 // Apply the expedition's resolved resource-room range, including mixed rooms.
 // Old active runs retain their original three-room allocation.
 const {minRatio,maxRatio}=map.contentConfig.resourceRooms;
 const minRooms=Math.ceil(map.rooms.length*minRatio),maxRooms=Math.floor(map.rooms.length*maxRatio);
 const allocation=random(R.hash(map.seed+'-resource-quota-'+floor));
 const desired=maxRooms>=minRooms?minRooms+Math.floor(allocation()*(maxRooms-minRooms+1)):maxRooms;
 const quota=Math.min(options.legacy?3:desired,candidates.length);
 const order=['gather','mine','wood'].map(type=>({type,rank:allocation()})).sort((a,b)=>a.rank-b.rank).map(x=>x.type);
 const schedule=options.legacy?['gather','mine','wood']:Array.from({length:quota},(_,i)=>order[i%order.length]);
 map.resourceQuota={min:minRooms,max:maxRooms,target:quota,total:map.rooms.length};
 for(const type of schedule.slice(0,quota)){
  const ranked=candidates.filter(c=>!used.has(c.room.id)).map(c=>{
   const area=c.room.inner.length;
   // Match the room footprint to its small number of resource nodes. Mining
   // needs the least space; tree rooms leave more circulation than an ore niche.
   const profile=types[type];
   const score=-Math.abs(area-profile.preferredArea)-Math.max(0,area-profile.maxArea)*2-(area<profile.minArea?20:0)+c.tie*4;
   return{...c,score};
  }).sort((a,b)=>b.score-a.score||a.room.id-b.room.id);
  let room,cells,size;
  for(const candidate of ranked){
   const next=candidate.room,nextSize=next.inner.length<18?0:next.inner.length<45?1:2;
   const [min,max]=types[type].counts[nextSize],target=min+Math.floor(rnd()*(max-min+1));
   const positions=place(map,next,target,rnd,type);
   if(positions.length){room=next;cells=positions;size=nextSize;break;}
  }
  if(!room)continue;
  used.add(room.id);
  const pool=definitions.filter(d=>d.type===type&&d.floors.includes(floor));
  // Each wood preview includes the local tree/bamboo rather than only loose fuel.
  const primary=pick(type==='wood'?pool.filter(d=>['tree','bamboo'].includes(d.shape)):pool,rnd);
  const remaining=pool.filter(d=>d.id!==primary.id),species=[primary];
  if(cells.length>=2&&remaining.length&&rnd()<.65)species.push(pick(remaining,rnd));
  if(type==='gather'&&cells.length>=5&&rnd()<.3){const third=remaining.filter(d=>!species.includes(d));if(third.length)species.push(pick(third,rnd));}
  room.resourceType=type;room.resourceSize=size;room.nodes=[];
  // Secondary species occupy the tail, keeping one dominant material per room.
  cells.forEach((cell,i)=>{
   const index=i>=cells.length-(species.length-1)?i-(cells.length-species.length):0;
   const material=species[index],node={uid:`${room.id}-${i+1}`,roomId:room.id,cell,...material};
   room.nodes.push(node);map.resources.push(node);
  });
  map.resourceRooms.push(room);
 }
 // Revalidate after every entity is placed, with all paid doors shut.
 map.path=R.route(R.closedPassages(map),map.width,map.height,map.entry,map.exit);
 const reachable=R.flood(map.collision,map.width,map.height,map.entry);
 if(!map.path.length||reachable.reached!==map.collision.filter(R.walkable).length)throw Error('资源房通路验证未通过。');
 for(const node of map.resources){
  node.access=neighbours(node.cell,map).filter(k=>reachable.dist[k]>=0);
  if(!node.access.length)throw Error('资源点没有可达操作位置。');
 }
 map.resourceSummary=Object.fromEntries(Object.keys(types).map(type=>[type,{rooms:map.resourceRooms.filter(r=>r.resourceType===type).length,nodes:map.resources.filter(n=>n.type===type).length}]));
 return map;
}
globalThis.RuinsResources={populate,quota,types,definitions,neighbours};
})();

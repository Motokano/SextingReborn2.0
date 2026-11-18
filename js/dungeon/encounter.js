/* SPDX-License-Identifier: GPL-3.0-only
 * Encounter preview. View parameters mirror the game's 20/50 design and
 * survival-config.json. Physical wall/door LOS is added for this dungeon.
 */
(()=>{'use strict';
const R=globalThis.RuinsSettlement;
const dirs=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
// One configuration for players, enemies, their sight overlays and perception.
const config={dayRadius:8,nightRadius:4,dayDarkness:.04,nightDarkness:.58,frontAngle:45,sideAngle:75,front:1,side:.65,back:.35,identify:.72,detail:.45,adjacentDetail:1,lossTicks:3,healPerTick:8,hitInjury:40};
const doorConfig={staminaMax:100,reductionPerLevel:.003,maxLevel:100,materials:{wood:{name:'木门',base:1,skill:'logging'},iron:{name:'铁门',base:1,skill:'mining'}}};
const skillLevel=value=>Math.min(doorConfig.maxLevel,Math.max(0,Math.trunc(Number(value)||0)));
function doorCost(s,door){
 const material=doorConfig.materials[typeof door==='string'?door:door.material];
 if(!material)throw Error('未知门材质');
 const level=skillLevel(s.player.skills[material.skill]);
 const multiplier=s.actionCostMultiplier??1;
 if(!Number.isFinite(multiplier)||multiplier<0)throw Error('无效行动费用倍率');
 const raw=material.base*(1-level*doorConfig.reductionPerLevel)*multiplier;
 // Correct representational error at half-integers; round only the final cost.
 return Math.round(raw*100)/100;
}
const dist=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function direction(a,b,w){const dx=Math.sign(b%w-a%w),dy=Math.sign(Math.floor(b/w)-Math.floor(a/w));return Math.max(0,dirs.findIndex(d=>d[0]===dx&&d[1]===dy));}
function neighbours(k,m){const x=k%m.width,y=Math.floor(k/m.width);return dirs.map(([dx,dy])=>[x+dx,y+dy]).filter(([a,b])=>a>=0&&b>=0&&a<m.width&&b<m.height).map(([a,b])=>b*m.width+a);}
function doorInfo(m,room){
 const k=room.door,w=m.width;
 for(const [dx,dy]of[[0,-1],[1,0],[0,1],[-1,0]]){
  const out=k+dy*w+dx,inside=k-dy*w-dx;
  if(room.inner.includes(inside)&&out>=0&&out<m.tiles.length&&m.owner[out]!==room.id&&R.walkable(m.tiles[out]))
   return {cell:k,roomId:room.id,inside,outside:out,dx,dy,closed:true,material:room.doorMaterial||(R.hash(mapSeed(m)+'-door-'+room.id)%2?'iron':'wood')};
 }
 throw Error('房门缺少贯通室内外的朝向：'+room.id);
}
function mapSeed(map){return map.seed||'preview';}
function create(map,roomId=null,options={}){
 const doors=map.rooms.filter(r=>r.hasDoor!==false).map(r=>doorInfo(map,r)),room=map.rooms.find(r=>r.id===roomId),door=room?doorInfo(map,room):null;
 // Material distribution is a reproducible preview fixture, independent of contents.
 if(doors.length>1&&doors.every(d=>d.material===doors[0].material)){const other=doors.findLast(d=>!map.rooms.find(r=>r.id===d.roomId)?.doorMaterial);if(other)other.material=doors[0].material==='wood'?'iron':'wood';}
 const state={map,tick:0,night:false,doors,actionCostMultiplier:1,lastDoorPayment:null,player:{cell:door?door.outside:map.entry,facing:door?direction(door.outside,door.inside,map.width):0,stamina:doorConfig.staminaMax,staminaMax:doorConfig.staminaMax,skills:{gathering:skillLevel(options.skills?.gathering),logging:skillLevel(options.skills?.logging),mining:skillLevel(options.skills?.mining)}},enemies:map.enemies.map(e=>{const facing=e.roaming?e.spawnFacing:direction(e.cell,map.rooms.find(r=>r.id===e.roomId).door,map.width);return {...e,spawn:e.cell,spawnFacing:facing,facing,state:e.roaming?'roam':'idle',patrolTarget:null,patrolClock:0,patrolHold:0,patrolSequence:0,lost:0,lastSeen:null,injury:0,healPerTick:config.healPerTick,healed:0,source:null,returningOnce:false};}),links:[],events:[]};
 state.lootPoints=(map.lootPoints||[]).map(p=>({...p,searched:false}));
 globalThis.RuinsContainerSearch?.initialize(state);
 globalThis.RuinsRecovery?.initialize(state);
 globalThis.RuinsInsight?.initialize(state);
 globalThis.RuinsHarvest?.initialize(state);
 state.staticTiles=map.tiles.slice();for(const k of map.sceneryBlocked||[])state.staticTiles[k]=6;for(const k of map.decorBlocked||[])state.staticTiles[k]=6;for(const k of map.workshopBlocked||[])state.staticTiles[k]=6;for(const n of map.resources)state.staticTiles[n.cell]=6;
 for(const k of map.clinicBlocked||[])state.staticTiles[k]=6;
 for(const k of map.canteenBlocked||[])state.staticTiles[k]=6;
 for(const p of state.lootPoints)state.staticTiles[p.cell]=6;
 for(const p of [...(map.recoveryPoints||[]),...(map.insightPoints||[])])state.staticTiles[p.cell]=6;
 globalThis.RuinsExploration?.initialize(state);
 globalThis.RuinsExpedition?.initialize(state);
 return state;
}
function opaque(s,k){return k<0||k>=s.map.tiles.length||s.map.tiles[k]===1||s.map.tiles[k]===5||s.map.sceneryBlocked?.has(k)||(s.map.workshopOpaque||s.map.workshopBlocked)?.has(k)||s.map.clinicOpaque?.has(k)||s.map.canteenOpaque?.has(k)||s.doors.some(d=>d.cell===k&&d.closed);}
// Centre-to-centre supercover: exact corner crossings cannot peek between walls.
function lineOfSight(s,from,to){
 if(from===to)return true;
 const w=s.map.width,x0=from%w,y0=Math.floor(from/w),x1=to%w,y1=Math.floor(to/w);
 const dx=x1-x0,dy=y1-y0,sx=Math.sign(dx),sy=Math.sign(dy),tx=dx?1/Math.abs(dx):Infinity,ty=dy?1/Math.abs(dy):Infinity;
 let x=x0,y=y0,mx=tx/2,my=ty/2;
 while(x!==x1||y!==y1){
  if(Math.abs(mx-my)<1e-9){if(opaque(s,y*w+x+sx)||opaque(s,(y+sy)*w+x))return false;x+=sx;y+=sy;mx+=tx;my+=ty;}
  else if(mx<my){x+=sx;mx+=tx;}else{y+=sy;my+=ty;}
  const k=y*w+x;if(k===to)return true;if(opaque(s,k))return false;
 }
 return true;
}
function visionProfile(s){
 if(s.visionProfile)return s.visionProfile;
 const nightT=Math.min(1,Math.max(0,(s.night?config.nightDarkness:config.dayDarkness)/config.nightDarkness));
 const visual=config.dayRadius+(config.nightRadius-config.dayRadius)*nightT;
 return {visual,identify:Math.max(1,visual*config.identify),detail:Math.max(1,visual*config.detail),adjacent:config.adjacentDetail};
}
function inspect(s,actor,k){
 const w=s.map.width,dx=k%w-actor.cell%w,dy=Math.floor(k/w)-Math.floor(actor.cell/w),d=Math.max(Math.abs(dx),Math.abs(dy)),v=dirs[actor.facing],dot=dx*v[0]+dy*v[1];
 if(!d)return {terrain:true,dynamic:true,identify:true,detail:true,raw:true};
 const angle=Math.acos(Math.max(-1,Math.min(1,dot/(Math.hypot(dx,dy)*Math.hypot(...v)))))*180/Math.PI;
 const mul=angle<=config.frontAngle+1e-8?config.front:angle<=config.sideAngle+1e-8?config.side:config.back;
 const profile=visionProfile(s),adjacent=d<=profile.adjacent;
 const rear=d===1&&dot<0,inRange=adjacent||d<=profile.visual*mul+1e-8,los=(inRange||rear)&&lineOfSight(s,actor.cell,k),raw=inRange&&los;
 return {terrain:los&&(raw||rear),raw,dynamic:raw&&!rear,
  identify:raw&&!rear&&(adjacent||d<=(angle<=config.sideAngle+1e-8?profile.visual:profile.identify)*mul),
  detail:raw&&!rear&&(adjacent||d<=profile.detail*mul)};
}
function sees(s,actor,k){return inspect(s,actor,k).dynamic;}
// A short-lived view for one sensing/render pass. Rebuild after every action;
// no role-specific bonuses, observer-mode flags or shared intel enter it.
function sightField(s,actor){
 const viewer={cell:actor.cell,facing:actor.facing},cells=new Map();
 const at=k=>{if(!cells.has(k))cells.set(k,inspect(s,viewer,k));return cells.get(k);};
 return {at,sees:k=>at(k).dynamic};
}
function collision(s,exclude=null,includePlayer=true){
 const t=s.staticTiles.slice();for(const d of s.doors)if(d.closed)t[d.cell]=8;
 for(const e of s.enemies)if(e!==exclude)t[e.cell]=7;
 if(includePlayer&&s.player!==exclude)t[s.player.cell]=7;
 return t;
}
function perception(s){
 const fields=s.enemies.map(e=>sightField(s,e)),own=fields.map(f=>f.sees(s.player.cell)),links=[],known=[];
 s.enemies.forEach((e,i)=>{
  const donor=own[i]?-1:s.enemies.findIndex((ally,j)=>j!==i&&own[j]&&fields[i].sees(ally.cell));
  known.push(own[i]?'direct':donor>=0?'shared':null);
  if(donor>=0)links.push({from:s.enemies[donor].uid,to:e.uid});
 });
 return {own,known,links};
}
function moveEnemy(s,e,target,near=false,partial=false){
 if(e.skipTurn||e.cannotMove)return false;
 const m=s.map,t=collision(s,e);let candidates=near?neighbours(target,m).filter(k=>R.walkable(t[k])&&lineOfSight(s,k,target)):[target];
 const f=R.flood(t,m.width,m.height,e.cell);
 if(partial&&f.dist[target]<0){let best=Infinity;candidates=[];for(let k=0;k<t.length;k++)if(f.dist[k]>=0){const d=dist(k,target,m.width);if(d<best){best=d;candidates=[k];}else if(d===best)candidates.push(k);}}
 const choices=candidates.filter(k=>f.dist[k]>=0).sort((a,b)=>f.dist[a]-f.dist[b]||a-b);
 if(!choices.length)return false;
 let next=choices[0];if(next===e.cell)return false;
 while(f.prev[next]!==e.cell&&f.prev[next]>=0)next=f.prev[next];
 if(!R.canStep(t,m.width,m.height,e.cell,next))return false;
 e.facing=direction(e.cell,next,m.width);e.cell=next;return true;
}
function returnHome(s,e){
 const m=s.map,t=collision(s,e),f=R.flood(t,m.width,m.height,e.cell);
 let goal=e.spawn;
 if(!R.walkable(t[goal])||f.dist[goal]<0){
  goal=neighbours(e.spawn,m).filter(k=>R.walkable(t[k])&&f.dist[k]>=0).sort((a,b)=>f.dist[a]-f.dist[b]||a-b)[0];
 }
 if(goal!==undefined){if(e.cell!==goal)moveEnemy(s,e,goal);if(e.cell===goal){e.state='idle';e.facing=e.spawnFacing;}}
}
function tick(s,spent=0,beforeActions=null){
 if(s.ended)return s;
 s.tick++;if(!s.formalRuntime)globalThis.RuinsRecovery?.worldTick(s,spent);s.events=[];const sensed=perception(s);s.links=sensed.links;
 // Read all direct sight BEFORE mutating anyone's position, state or facing.
 s.enemies.forEach((e,i)=>{
  e.healed=0;e.source=sensed.known[i];
  if(e.source){if(e.state!=='chase')s.events.push({kind:e.source==='shared'?'support':'spotted',uid:e.uid});e.state='chase';e.lost=0;e.lastSeen=s.player.cell;if(e.roaming){e.patrolTarget=null;e.patrolClock=0;e.patrolHold=0;}}
  else if(e.state==='chase'||e.state==='search'){e.lost++;e.state=e.lost>config.lossTicks?'return':'search';if(e.state==='return'){e.returningOnce=true;s.events.push({kind:'return',uid:e.uid});}}
 });
 if(beforeActions)beforeActions(s);
 for(const e of s.enemies){
  if(e.skipTurn)continue;
  if(e.holdAction){ /* Meditation holds movement but still permits out-of-combat recovery below. */ }
  else if(e.state==='chase'){
   if(dist(e.cell,s.player.cell,s.map.width)>(e.attackRange||1)||!lineOfSight(s,e.cell,s.player.cell))moveEnemy(s,e,s.player.cell,true);
   else {e.facing=direction(e.cell,s.player.cell,s.map.width);s.events.push({kind:'contact',uid:e.uid});}
  }else if(e.state==='search'&&e.lastSeen!==null)moveEnemy(s,e,e.lastSeen,false,true);
  else if(e.state==='return')returnHome(s,e);
  else if(e.state==='roam')globalThis.RuinsWanderers.step(s,e);
  if((e.state==='return'||e.state==='idle'&&e.returningOnce)&&e.injury>0){e.healed=Math.min(e.injury,e.healPerTick);e.injury-=e.healed;}
  if(e.roaming&&e.state==='idle'&&e.injury===0){e.state='roam';e.patrolClock=0;e.patrolTarget=null;}
 }
 globalThis.RuinsExploration?.observe(s);
 return s;
}
function act(s,action){
 if(s.ended)return false;
 if(action.type==='harvest'){
  const G=globalThis.RuinsHarvest;if(!G?.ready(s,action.uid)){G?.cancel(s);return false;}
  globalThis.RuinsRecovery?.interrupt(s);
  // Enemies act during the work tick. New danger cancels the unfinished harvest
  // without a charge or reward, while the world tick itself remains elapsed.
  tick(s);
  if(G.complete(s,action.uid))globalThis.RuinsRecovery?.applySpent(s,s.lastHarvest.cost);
  return true;
 }
 globalThis.RuinsHarvest?.cancel(s);
 const w=s.map.width,beforeStamina=s.player.stamina;
 if(action.type==='move'){
  const t=collision(s,null,false),enemy=s.enemies.find(e=>e.cell===action.cell);
  if(enemy)return act(s,{type:'attack',uid:enemy.uid});
  if(!R.canStep(t,w,s.map.height,s.player.cell,action.cell))return false;
  s.player.facing=direction(s.player.cell,action.cell,w);s.player.cell=action.cell;
 }else if(action.type==='turn'){
  if(dist(s.player.cell,action.cell,w)!==1)return false;
  s.player.facing=direction(s.player.cell,action.cell,w);globalThis.RuinsExploration?.observe(s);return true; // formal free turn
 }else if(action.type==='door'){
  const door=s.doors.find(d=>d.cell===action.cell);
  if(!door||!door.closed||dist(s.player.cell,door.cell,w)!==1||!lineOfSight(s,s.player.cell,door.cell))return false;
  const cost=doorCost(s,door),before=s.player.stamina;
  if(!Number.isFinite(before)||before<cost)return false;
  s.player.stamina=Math.round((before-cost)*100)/100;
  s.lastDoorPayment={cell:door.cell,material:door.material,cost,before,after:s.player.stamina,tick:s.tick+1};
  door.closed=false;
  globalThis.RuinsExpedition?.record(s,'door',door.cell);
 }else if(action.type==='insight'){
  if(!globalThis.RuinsInsight?.use(s,action.uid))return false;
 }else if(action.type==='recovery'){
  if(!globalThis.RuinsRecovery?.useTick(s,action.uid,action.part))return false;
 }else if(action.type==='loot-open'){
  if(!globalThis.RuinsContainerSearch?.openTick(s,action.uid))return false;
 }else if(action.type==='loot'){
  if(!globalThis.RuinsContainerSearch?.searchTick(s,action.uid))return false;
 }else if(action.type==='loot-claim'){
  if(!globalThis.RuinsContainerSearch?.claim(s,action.uid,action.index))return false;
 }else if(action.type==='attack'){
  const e=s.enemies.find(e=>e.uid===action.uid);
  if(!e||dist(s.player.cell,e.cell,w)!==1||!sees(s,s.player,e.cell)||!lineOfSight(s,s.player.cell,e.cell))return false;
  e.injury=Math.min(100,e.injury+config.hitInjury);e.facing=direction(e.cell,s.player.cell,w);
  if(e.injury>=100){s.defeated??=[];if(!s.defeated.includes(e.uid))s.defeated.push(e.uid);s.enemies=s.enemies.filter(n=>n!==e);s.lastKill={uid:e.uid,cell:e.cell,tick:s.tick+1};globalThis.RuinsExpedition?.record(s,'kill',e.uid);}
 }else if(action.type!=='wait')return false;
 if(action.type!=='recovery')globalThis.RuinsRecovery?.interrupt(s);
 tick(s,Math.max(0,beforeStamina-s.player.stamina));return true;
}
function project(x,y){return {x:(x-y)/Math.SQRT2,y:(x+y)/2};}
function unproject(x,y){return {x:(x*Math.SQRT2+2*y)/2,y:(2*y-x*Math.SQRT2)/2};}
// Plan a reproducible preview using legal movement behind cover, never closing
// a paid entrance or assigning an enemy state directly.
function demoActions(s,roomId){
 const room=s.map.rooms.find(r=>r.id===roomId);if(!room)return [];
 const door=s.doors.find(d=>d.roomId===roomId);
 const opening=door?.closed?[{type:'wait'},{type:'door',cell:door.cell}]:[{type:'wait'}],opened=structuredClone(s);
 if(!opening.every(a=>act(opened,a)))return [];
 const m=s.map,f=R.flood(collision(opened,null,false),m.width,m.height,opened.player.cell);
 const candidates=Array.from({length:m.tiles.length},(_,k)=>k).filter(k=>f.dist[k]>0&&f.dist[k]<=6&&m.owner[k]!==roomId).sort((a,b)=>f.dist[a]-f.dist[b]||a-b);
 for(const target of candidates){
  const retreat=[];let k=target;while(k!==opened.player.cell){retreat.unshift({type:'move',cell:k});k=f.prev[k];}
  const trial=structuredClone(opened);if(!retreat.every(a=>act(trial,a)))continue;
  const team=trial.enemies.filter(e=>e.roomId===roomId);
  if(team.some(e=>e.state==='chase'))continue;
  const waiting=[];
  for(let i=0;i<30;i++){
   const a={type:'wait'};act(trial,a);waiting.push(a);
   if(team.some(e=>e.state==='chase'))break;
   if(team.every(e=>e.returningOnce&&e.state==='idle'&&e.injury===0))return [...opening,...retreat,...waiting];
  }
 }
 return opening;
}
globalThis.RuinsEncounter={config,doorConfig,skillLevel,doorCost,dirs,dist,direction,neighbours,doorInfo,create,visionProfile,sightField,inspect,sees,lineOfSight,collision,perception,tick,act,project,unproject,demoActions};
})();

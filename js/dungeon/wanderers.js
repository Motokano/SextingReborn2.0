/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const R=RuinsSettlement;
const config={roadCellsPerEnemy:300,min:2,max:6,entryBuffer:12,patrolEntryBuffer:8,minSpacing:10,moveTicks:2,minRadius:4,maxRadius:6};
const distance=(a,b,w)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
function outdoorTiles(map){
 const tiles=map.tiles.slice();
 for(let k=0;k<tiles.length;k++)if(tiles[k]===2||tiles[k]===4)tiles[k]=5;
 for(const p of [...(map.resources||[]),...(map.lootPoints||[]),...(map.recoveryPoints||[])])tiles[p.cell]=6;
 for(const t of map.trees||[])tiles[Math.floor(t.y)*map.width+Math.floor(t.x)]=6;
 // Village grass is not a patrol destination: retain streets and their shoulders.
 if(map.preset==='village')for(let k=0;k<tiles.length;k++)if(R.walkable(tiles[k])&&!map.road[k]){
  const x=k%map.width,y=Math.floor(k/map.width);let near=false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<map.width&&y+dy>=0&&y+dy<map.height&&map.road[(y+dy)*map.width+x+dx])near=true;
  if(!near)tiles[k]=5;
 }
 return tiles;
}
function populate(map){
 if(map.populationConfig){map.wanderers=[];return map;}
 const tiles=outdoorTiles(map),flow=R.flood(tiles,map.width,map.height,map.entry);
 const roads=tiles.reduce((n,t,k)=>n+(R.walkable(t)&&map.road[k]&&flow.dist[k]>=0?1:0),0);
 const target=Math.max(config.min,Math.min(config.max,Math.round(roads/config.roadCellsPerEnemy)));
 const candidates=tiles.map((t,k)=>k).filter(k=>map.road[k]&&flow.dist[k]>=config.entryBuffer&&map.doors.every(d=>distance(k,d,map.width)>=3));
 const center={x:candidates.reduce((sum,k)=>sum+k%map.width,0)/Math.max(1,candidates.length),y:candidates.reduce((sum,k)=>sum+Math.floor(k/map.width),0)/Math.max(1,candidates.length)};
 map.wanderers=[];map.patrolTiles=tiles;map.patrolConfig={roadCells:roads,target};
 while(map.wanderers.length<target&&candidates.length){
  candidates.sort((a,b)=>{
   const score=k=>(map.wanderers.length?Math.min(...map.wanderers.map(e=>distance(k,e.cell,map.width))):-Math.hypot(k%map.width-center.x,Math.floor(k/map.width)-center.y))+(R.hash(map.seed+'-patrol-spawn-'+k)%1000)/1000;
   return score(b)-score(a)||a-b;
  });
  const cell=candidates.shift();
  if(map.wanderers.some(e=>distance(e.cell,cell,map.width)<config.minSpacing))continue;
  const radius=config.minRadius+R.hash(map.seed+'-patrol-radius-'+cell)%3,local=R.flood(tiles,map.width,map.height,cell);
  const cells=tiles.map((t,k)=>k).filter(k=>local.dist[k]>=0&&local.dist[k]<=radius&&flow.dist[k]>=config.patrolEntryBuffer);
  if(cells.length<16)continue;
  const number=map.wanderers.length+1;
  const e={uid:'wanderer-'+number,roomId:null,cell,number,name:'游荡土匪',roaming:true,patrolLayoutKey:'patrol-v1:'+cell+':'+radius,spawnFacing:R.hash(map.seed+'-patrol-facing-'+cell)%8,patrolRadius:radius,patrolCells:cells};
  map.wanderers.push(e);
 }
 map.enemies.push(...map.wanderers);return map;
}
function step(s,e){
 const E=RuinsEncounter;
 if(e.patrolHold>0){e.patrolHold--;return;}
 e.patrolClock=(e.patrolClock||0)+1;if(e.patrolClock<config.moveTicks)return;e.patrolClock=0;
 const tiles=E.collision(s,e),zone=new Set(e.patrolCells);
 for(let k=0;k<tiles.length;k++)if(!R.walkable(s.map.patrolTiles[k])||!zone.has(k))tiles[k]=5;
 const flow=R.flood(tiles,s.map.width,s.map.height,e.cell);
 if(e.patrolTarget==null||flow.dist[e.patrolTarget]<0||e.patrolTarget===e.cell){
  const choices=e.patrolCells.filter(k=>flow.dist[k]>=2);
  if(!choices.length){e.patrolTarget=null;return;}
  const n=e.patrolSequence||0;e.patrolSequence=n+1;
  e.patrolTarget=choices[R.hash(s.map.seed+'-'+e.uid+'-waypoint-'+n)%choices.length];
 }
 let next=e.patrolTarget;while(flow.prev[next]!==e.cell&&flow.prev[next]>=0)next=flow.prev[next];
 if(!R.canStep(tiles,s.map.width,s.map.height,e.cell,next)){e.patrolTarget=null;return;}
 e.facing=E.direction(e.cell,next,s.map.width);e.cell=next;
 if(e.cell===e.patrolTarget){e.patrolHold=1+R.hash(s.map.seed+'-'+e.uid+'-hold-'+e.patrolSequence)%2;e.patrolTarget=null;}
}
function restoreAdded(s,oldIds){
 const E=RuinsEncounter;
 for(const e of s.enemies.filter(e=>e.roaming&&!oldIds.has(e.uid))){
  const blocked=E.collision(s,e);
  const available=e.patrolCells.filter(k=>R.walkable(blocked[k])&&E.dist(k,s.player.cell,s.map.width)>=2);
  if(!available.includes(e.cell)&&available.length)e.cell=available[0];
 }
}
globalThis.RuinsWanderers={config,outdoorTiles,populate,step,restoreAdded};
})();

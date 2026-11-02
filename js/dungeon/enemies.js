/* SPDX-License-Identifier: GPL-3.0-only
 * Static encounter-layout preview. No AI, combat or spawn-rate simulation.
 * Reserve existing SettleMaker buildings before resource-room assignment.
 */
(()=>{'use strict';
const R=globalThis.RuinsSettlement;
const profiles={1:{min:12,max:20,target:16},2:{min:20,max:32,target:26},3:{min:32,max:48,target:40}};
const neighbours=(k,m)=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>[k%m.width+dx,Math.floor(k/m.width)+dy]).filter(([x,y])=>x>=0&&y>=0&&x<m.width&&y<m.height).map(([x,y])=>y*m.width+x);
function layout(map,room,count,fixedCells=[]){
 const w=map.width,inside=new Set(room.inner),landings=neighbours(room.door,map).filter(k=>inside.has(k));
 const tiles=map.tiles.map(()=>5);for(const k of room.inner)tiles[k]=2;tiles[room.door]=4;
 const fixed=new Set(fixedCells);for(const k of fixed)tiles[k]=6;
 if(landings.some(k=>fixed.has(k)))return null;
 const flows=landings.map(k=>R.flood(tiles,w,map.height,k));
 const depth=k=>Math.min(...flows.map(f=>f.dist[k]));
 const candidates=room.inner.filter(k=>!fixed.has(k)&&depth(k)>=3);
 const distance=(a,b)=>Math.max(Math.abs(a%w-b%w),Math.abs(Math.floor(a/w)-Math.floor(b/w)));
 const dx=room.center%w-room.door%w,dy=Math.floor(room.center/w)-Math.floor(room.door/w),len=Math.hypot(dx,dy)||1;
 const lateral=k=>((k%w-room.door%w)*dy-(Math.floor(k/w)-Math.floor(room.door/w))*dx)/len;
 let best=null,bestScore=-Infinity;
 function consider(cells){
  if(count>1){
   const depths=cells.map(depth),sides=cells.map(lateral);
   if(Math.max(...depths)-Math.min(...depths)<1||Math.max(...sides)-Math.min(...sides)<1.5)return;
  }
  if(count===3){
   const [a,b,c]=cells,area=Math.abs((b%w-a%w)*(Math.floor(c/w)-Math.floor(a/w))-(c%w-a%w)*(Math.floor(b/w)-Math.floor(a/w)));
   if(area<4)return;
  }
  const occupied=new Set([...cells,...fixed]),seen=new Set(landings),q=[...landings];
  for(let i=0;i<q.length;i++)for(const n of neighbours(q[i],map))if(inside.has(n)&&!occupied.has(n)&&!seen.has(n)){seen.add(n);q.push(n);}
  if(seen.size!==room.inner.length-count-fixed.size||seen.size<Math.ceil(room.inner.length*.6))return;
  if([...occupied].some(k=>!neighbours(k,map).some(n=>seen.has(n))))return;
  // Prefer the middle/rear, with one enemy nearer than its companions.
  const depths=cells.map(depth).sort((a,b)=>a-b);
  let score=-depths.reduce((s,d,i)=>s+Math.abs(d-(i===0?3:5)),0)*2;
  score-=cells.reduce((s,k)=>s+Math.abs(lateral(k)),0)*.12;
  score+=cells.reduce((s,k)=>s+(R.hash(map.seed+'-enemy-'+k)%1000)/1000,0)*.2;
  if(score>bestScore){bestScore=score;best=cells.slice();}
 }
 function search(chosen,start){
  if(chosen.length===count){consider(chosen);return;}
  for(let i=start;i<candidates.length;i++){
   const k=candidates[i];if(chosen.some(a=>distance(a,k)<2||distance(a,k)>4))continue;
   chosen.push(k);search(chosen,i+1);chosen.pop();
  }
 }
 search([],0);
 return best?{cells:best.sort((a,b)=>depth(a)-depth(b)||a-b),landings,depth}:null;
}
function plan(map){
 map.enemies=[];map.enemyRooms=[];
 for(const room of map.rooms){delete room.enemies;delete room.enemyCount;delete room.landings;}
 // Preview density: reserve roughly 40% of buildings for enemies, leaving at
 // least three buildings for the resource examples. This is not a spawn table.
 const available=map.rooms.filter(r=>!r.reservedEmpty).length;
 const quota=Math.min(8,Math.max(3,Math.round(map.rooms.length*.4)),Math.max(0,available-(map.roomAllocation?.resourceSlots??3)));
 function addRoom(count){
  const p=profiles[count];
  const rooms=map.rooms.filter(r=>!r.reservedEmpty&&!r.enemyCount&&r.inner.length>=p.min&&r.inner.length<=p.max)
   .sort((a,b)=>Math.abs(a.inner.length-p.target)-Math.abs(b.inner.length-p.target)||(map.roomAllocation?R.hash(map.seed+'-enemy-room-'+a.id)-R.hash(map.seed+'-enemy-room-'+b.id):a.id-b.id));
  for(const room of rooms){
   const positions=layout(map,room,count);if(!positions)continue;
   room.populationProfile=['ordinary_small','ordinary_medium','ordinary_large'][count-1];room.enemyCount=count;room.landings=positions.landings;
   room.enemies=positions.cells.map((cell,i)=>({uid:`enemy-${room.id}-${i+1}`,roomId:room.id,cell,number:i+1,name:'土匪',entrySteps:positions.depth(cell)}));
   map.enemies.push(...room.enemies);map.enemyRooms.push(room);return true;
  }
  return false;
 }
 // Keep one three-person example; extra rooms favour singles and pairs.
 for(const count of [3,2,1])if(map.enemyRooms.length<quota)addRoom(count);
 let turn=0;
 while(map.enemyRooms.length<quota){
  const preferred=turn++%2?2:1;
  if(!addRoom(preferred)&&!addRoom(preferred===1?2:1))break;
 }
 map.enemyRooms.sort((a,b)=>a.enemyCount-b.enemyCount||a.id-b.id);
 return map;
}
function draw(ctx,x,y,s,number){
 ctx.save();ctx.translate(x,y);ctx.scale(s,s);
 ctx.fillStyle='#110f0c70';ctx.beginPath();ctx.ellipse(.04,.28,.40,.19,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#352622';ctx.strokeStyle='#d19b7f';ctx.lineWidth=.035;
 ctx.beginPath();ctx.ellipse(0,.22,.34,.16,0,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle='#995d4a';ctx.beginPath();ctx.moveTo(-.15,-.15);ctx.lineTo(-.25,.17);ctx.quadraticCurveTo(0,.30,.25,.17);ctx.lineTo(.15,-.15);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#624035';ctx.beginPath();ctx.moveTo(0,-.39);ctx.quadraticCurveTo(-.23,-.30,-.16,-.02);ctx.lineTo(.17,-.02);ctx.quadraticCurveTo(.23,-.29,0,-.39);ctx.fill();ctx.stroke();
 ctx.fillStyle='#d0ad86';ctx.beginPath();ctx.arc(0,-.17,.104,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#352b27';ctx.fillRect(-.1,-.14,.2,.07);
 ctx.strokeStyle='#e0c5a0';ctx.lineWidth=.038;ctx.beginPath();ctx.moveTo(.23,.11);ctx.lineTo(.34,-.23);ctx.moveTo(.22,-.01);ctx.lineTo(.36,.03);ctx.stroke();
 ctx.restore();
 if(s>=25){ctx.font=`${Math.max(9,s*.23)}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f8dab5';ctx.fillText(number,x,y+s*.14);}
}
globalThis.RuinsEnemies={plan,layout,profiles,draw};
})();

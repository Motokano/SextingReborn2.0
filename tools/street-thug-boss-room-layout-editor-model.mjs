// Layout-only data: no player stats, container contents or normal save data.
export const LAYOUT_KEY='street-thug-boss-room.layout.v1';
export const OBJECT_NAMES={
 'den-sleeping':'铁床','den-dining':'收账桌与客凳','den-chair':'头目座椅',
 'den-sideboard':'茶水洗漱柜','den-fan':'小电扇','den-cargo':'周转货架',
 'den-mat':'磨旧地垫','den-lowwall':'半墙','den-column':'端柱','den-rubble':'碎砖',
 'den-private':'头目私藏箱','den-basket':'赃物袋筐'
};
export const objects=m=>[...m.outpostDecor,...m.lootPoints];
export function captureLayout(m){
 return {format:'street-thug-boss-room-layout',version:1,objects:objects(m).map(p=>({uid:p.uid,x:p.cell%m.width,y:Math.floor(p.cell/m.width)}))};
}
export function movedLayout(m,uid,dx,dy){
 const layout=captureLayout(m),p=layout.objects.find(p=>p.uid===uid);
 if(!p)throw Error('找不到这个物件');p.x+=dx;p.y+=dy;return layout;
}
export function planLayout(m,layout,occupied=[]){
 if(layout?.format!=='street-thug-boss-room-layout'||layout.version!==1||!Array.isArray(layout.objects))throw Error('这不是本房间的布局文件');
 const current=objects(m),known=new Map(current.map(p=>[p.uid,p])),seen=new Set(),blocked=new Map(),inner=new Set(m.rooms[0].inner);
 if(layout.objects.length!==current.length)throw Error('布局中的物件数量不完整');
 const plan=layout.objects.map(pos=>{
  const p=known.get(pos?.uid);
  if(!p||seen.has(p.uid))throw Error('布局中有未知或重复的物件');seen.add(p.uid);
  if(!Number.isInteger(pos.x)||!Number.isInteger(pos.y))throw Error('物件必须放在完整的棋格上');
  const dx=pos.x-p.cell%m.width,dy=pos.y-Math.floor(p.cell/m.width),delta=dx+dy*m.width;
  const footprint=(p.footprint||[p.cell]).map(k=>{
   const x=k%m.width+dx,y=Math.floor(k/m.width)+dy,n=y*m.width+x;
   if(x<0||x>=m.width||y<0||y>=m.height||!inner.has(n))throw Error(OBJECT_NAMES[p.uid]+'需要完整放在房间地板上');
   if(p.solid!==false){
    if(blocked.has(n))throw Error(OBJECT_NAMES[p.uid]+'与'+OBJECT_NAMES[blocked.get(n)]+'占格重叠');
    if(occupied.includes(n))throw Error('这里有人物，请先切换试走模式让开位置');
    blocked.set(n,p.uid);
   }
   return n;
  });
  return {p,cell:pos.y*m.width+pos.x,footprint,approach:p.approach===undefined?undefined:p.approach+delta};
 });
 return plan;
}
export function applyLayout(g,layout){
 const D=g.DungeonRuntime,E=g.GameEngine,s=D.getSim(),m=s.map,R=g.RuinsSettlement;
 // Validate the entire file before changing any live state (also for undo/import).
 const plan=planLayout(m,layout);
 for(const {p,cell,footprint,approach} of plan){
  p.cell=cell;if(p.footprint)p.footprint=footprint;if(approach!==undefined)p.approach=approach;
  const live=s.lootPoints.find(q=>q.uid===p.uid);if(live)Object.assign(live,{cell,approach});
 }
 for(const rooms of [m.rooms,m.buildings,m.enemyRooms,m.outposts])for(const room of rooms)room.lootPoints=m.lootPoints.filter(p=>p.roomId===room.id);
 m.decorBlocked=new g.Set(m.outpostDecor.filter(p=>p.solid).flatMap(p=>p.footprint));
 m.workshopOpaque=new g.Set(m.outpostDecor.filter(p=>p.opaque).flatMap(p=>p.footprint));
 for(const [key,shape] of [['lowWalls','lowwall'],['columns','column'],['rubble','rubble']])m.bossRoomReview[key]=m.outpostDecor.filter(p=>p.uid==='den-'+shape).flatMap(p=>p.footprint);
 const tiles=m.tiles.slice();
 for(const group of [m.decorBlocked,m.sceneryBlocked,m.workshopBlocked,m.clinicBlocked,m.canteenBlocked])for(const k of group||[])tiles[k]=6;
 for(const p of [...m.lootPoints,...m.resources,...m.recoveryPoints,...m.insightPoints])tiles[p.cell]=6;
 s.staticTiles=tiles;m.collision=tiles.slice();m.patrolTiles=tiles.slice();
 m.path=R.route(R.closedPassages(m),m.width,m.height,m.entry,m.exit);m.boss.bypass=m.path;
 const gameMap=E.getMap();gameMap.blocks=[];
 for(let k=0;k<tiles.length;k++)if(m.tiles[k]!==R.VOID&&!R.walkable(tiles[k]))gameMap.blocks.push({x:k%m.width,y:Math.floor(k/m.width)});
 gameMap.version++;
 // Undo/import can restore a layout after somebody walked into its old furniture
 // cells. Move those preview actors to the nearest free floor, never trap them.
 const used=new Set(),relocated=[];
 const actorCell=k=>{
  const valid=n=>R.walkable(tiles[n])&&!used.has(n)&&!s.doors.some(d=>d.cell===n&&d.closed);
  const result=valid(k)?k:m.rooms[0].inner.filter(valid).sort((a,b)=>Math.abs(a%m.width-k%m.width)+Math.abs(Math.floor(a/m.width)-Math.floor(k/m.width))-Math.abs(b%m.width-k%m.width)-Math.abs(Math.floor(b/m.width)-Math.floor(k/m.width)))[0];
  if(result===undefined)throw Error('房间里没有可站立的地板');used.add(result);return result;
 };
 const state=E.getState(),oldPlayer=state.y*m.width+state.x,player=actorCell(oldPlayer);
 if(player!==oldPlayer){E.setState(state.mapId,player%m.width,Math.floor(player/m.width));s.player.cell=player;relocated.push('主角');}
 for(const e of gameMap.enemies){
  const old=e.y*m.width+e.x,next=actorCell(old);if(next===old)continue;
  e.x=next%m.width;e.y=Math.floor(next/m.width);const live=s.enemies.find(p=>p.uid===e.dungeonUid);if(live){live.cell=next;live.spawn=next;live.patrolTarget=null;}relocated.push('头目');
 }
 return relocated;
}

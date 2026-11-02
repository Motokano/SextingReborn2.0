/* One translated prefab; never rotate, mirror, stretch or randomize its interior. */
(()=>{'use strict';
 const data=DungeonBossRoomData.template;
 function stamp(map,origin,roomId,enemyId='enemy.street_thug_boss'){
  const [dx,dy]=[origin[0]-data.bounds[0],origin[1]-data.bounds[1]],w=map.width;
  const cell=(x,y)=>(y+dy)*w+x+dx,box=([l,t,r,b])=>[l+dx,t+dy,r+dx,b+dy];
  const room={id:roomId,templateId:data.id,templateVersion:data.version,inner:[],cells:[],door:cell(...data.door),doorMaterial:data.doorMaterial,center:cell(6,8),hasDoor:true,ruined:false,reservedEmpty:false,isEmpty:false,outpostType:'boss',enemyCount:1,landings:[cell(7,11)],nodes:[]};
  const [l,t,r,b]=data.bounds;
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
   const k=cell(x,y),edge=x===l||x===r||y===t||y===b;map.tiles[k]=edge?1:2;map.owner[k]=roomId;map.road[k]=0;
   room.cells.push(k);if(!edge)room.inner.push(k);
  }
  map.tiles[room.door]=4;
  const decor=[],points=[];
  for(const source of data.objects){
   const {x,y,footprintOffsets,container,profile,...rest}=source;
   const p={...rest,roomId,cell:cell(x,y),front:rest.front?.slice(),nativeFront:rest.nativeFront?.slice()};
   if(rest.approach)p.approach=cell(...rest.approach);
   if(container)points.push({...p,assetId:p.uid,containerCategory:profile,containerUse:profile,containerTheme:'residential'});
   else decor.push({...p,kind:p.uid,solid:p.solid!==false,footprint:(footprintOffsets||[[0,0]]).map(([a,b])=>cell(x+a,y+b))});
  }
  room.lootPoints=points;
  const enemy={uid:'den-boss',cell:cell(...data.boss),roomId,enemyId,name:'地头头目',boss:true,number:1,attackRange:1};room.enemies=[enemy];
  const clear=[];for(let y=data.clear[1];y<=data.clear[3];y++)for(let x=data.clear[0];x<=data.clear[2];x++)clear.push(cell(x,y));
  const meta={templateId:data.id,version:data.version,roomId,origin:origin.slice(),bounds:box(data.bounds),apron:box(data.apron),clear};
  return {room,decor,points,enemy,meta};
 }
 globalThis.DungeonBossRoomTemplate={stamp,data};
})();

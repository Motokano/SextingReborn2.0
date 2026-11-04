import {GYM_FOOTPRINTS} from './gym-art.mjs';

export const key = (x,y)=>x+','+y;
export function stationCells(station){
  const [w,h]=station.footprint||GYM_FOOTPRINTS[station.id];
  return Array.from({length:w*h},(_,i)=>({x:station.x+i%w,y:station.y+Math.floor(i/w)}));
}
export function insideBounds(x,y,[x0,y0,x1,y1]){return x>=x0&&x<=x1&&y>=y0&&y<=y1;}

export function layoutSolids(map,layout){
  const solid=new Set([...map.disabled,...map.blocks,...map.npcs,...map.enemies].map(p=>key(p.x,p.y)));
  for(const [name,value]of Object.entries(map))if(name.endsWith('_station_interact_npc_by_cell')&&name!=='gym_station_interact_npc_by_cell')Object.keys(value).forEach(k=>solid.add(k));
  for(const k of ['10,8','11,8','14,13'])solid.add(k);
  for(const s of [...layout.stations,...(layout.decorations||[])])for(const p of stationCells(s))solid.add(key(p.x,p.y));
  return solid;
}
export function findLayoutPath(map,solid,from,targets){
  const goals=new Set(targets.filter(p=>!solid.has(key(p.x,p.y))).map(p=>key(p.x,p.y)));
  const start=key(from.x,from.y),queue=[{x:from.x,y:from.y}],parents=new Map([[start,null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i],k=key(p.x,p.y);
    if(goals.has(k)){
      const route=[];let next=k;
      while(next!==start){const [x,y]=next.split(',').map(Number);route.unshift({x,y});next=parents.get(next);}
      return route;
    }
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const q={x:p.x+dx,y:p.y+dy},qk=key(q.x,q.y);
      if(q.x<0||q.y<0||q.x>=map.width||q.y>=map.height||solid.has(qk)||parents.has(qk))continue;
      parents.set(qk,k);queue.push(q);
    }
  }
  return null;
}

// This is a copy of the live map, never a replacement of the saved map or its NPCs.
// Furniture collision is checked separately so the formal art does not draw it as walls.
export function makeLayoutMap(source,layout){
  const map=structuredClone(source),r=layout.selectedBounds;
  const inRoom=p=>insideBounds(p.x,p.y,r);
  map.disabled=map.disabled.filter(p=>!inRoom(p));
  const openings=new Set([layout.door,...layout.connection].map(p=>key(p.x,p.y)));
  map.blocks=map.blocks.filter(p=>!inRoom(p)&&!openings.has(key(p.x,p.y)));
  for(let y=r[1];y<=r[3];y++)for(let x=r[0];x<=r[2];x++){
    if((x===r[0]||x===r[2]||y===r[1]||y===r[3])&&!openings.has(key(x,y)))map.blocks.push({x,y});
  }
  for(const p of source.blocks)if(source.inspectable_walls?.[key(p.x,p.y)]&&!map.blocks.some(q=>q.x===p.x&&q.y===p.y))map.blocks.push({...p});
  return map;
}

export function validateLayout(source,layout){
  if(source.map_id!==layout.mapId)throw Error('藏身处地图不匹配');
  const map=makeLayoutMap(source,layout),r=layout.selectedBounds;
  const solid=new Set([...map.disabled,...map.blocks,...map.npcs,...map.enemies].map(p=>key(p.x,p.y)));
  for(const [name,value]of Object.entries(map))if(name.endsWith('_station_interact_npc_by_cell')&&name!=='gym_station_interact_npc_by_cell')Object.keys(value).forEach(k=>solid.add(k));
  // Existing fixed props, including the drying racks, are kept in place.
  for(const k of ['10,8','11,8','14,13'])solid.add(k);
  const used=new Set();
  for(const station of [...layout.stations,...(layout.decorations||[])])for(const p of stationCells(station)){
    const k=key(p.x,p.y);
    if(!insideBounds(p.x,p.y,r)||solid.has(k)||used.has(k))throw Error('设施占格冲突：'+station.id+' '+k);
    used.add(k);
  }
  for(const k of used)solid.add(k);
  const start=map.portals.find(p=>p.label==='出门');
  if(!start||solid.has(key(start.x,start.y)))throw Error('原入口不可走');
  const queue=[start],seen=new Set([key(start.x,start.y)]);
  for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p.x,p.y);
    if(p.x<0||p.x>=map.width||p.y<0||p.y>=map.height||solid.has(k)||seen.has(k))continue;
    seen.add(k);queue.push(p);
  }
  const sealed=Object.values(map.inspectable_walls||{}).some(p=>p.sealed_region);
  for(const station of layout.stations){
    const neighbours=stationCells(station).flatMap(p=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})));
    if(!findLayoutPath(map,solid,layout.player,neighbours))throw Error('设施无法相邻操作：'+station.id);
  }
  if(!findLayoutPath(map,solid,layout.player,[layout.door]))throw Error('房内通路不连通');
  for(const p of map.portals)if(!seen.has(key(p.x,p.y)))throw Error('原出口不连通：'+key(p.x,p.y));
  if(sealed){if(seen.has(key(layout.player.x,layout.player.y)))throw Error('封墙未阻隔健身房');}
  else for(const p of [layout.player,layout.door,...layout.connection])if(!seen.has(key(p.x,p.y)))throw Error('通路不连通：'+key(p.x,p.y));
  // Every existing facility still has an accessible neighbour, including the shared bed.
  const oldCells=[...map.npcs,...map.enemies];
  for(const [name,value]of Object.entries(map))if(name.endsWith('_station_interact_npc_by_cell')&&name!=='gym_station_interact_npc_by_cell')Object.keys(value).forEach(k=>{const [x,y]=k.split(',').map(Number);oldCells.push({x,y});});
  // Existing hideout interactions allow the eight neighbouring cells.
  for(const p of oldCells)if(![[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(([dx,dy])=>seen.has(key(p.x+dx,p.y+dy))))throw Error('原设施通路受阻：'+key(p.x,p.y));
  return {facilities:layout.stations.length,decorations:(layout.decorations||[]).length,occupiedCells:used.size,reachableCells:seen.size,selectedCells:(r[2]-r[0]+1)*(r[3]-r[1]+1)};
}

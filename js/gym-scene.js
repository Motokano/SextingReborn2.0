/* Gym furniture joins the normal depth-sorted scene, never an overlay menu pawn. */
(function(g){
 'use strict';
 let art,room,layout;
 const api={ready:null,objects(map,projection,metaAt){
  if(!layout||map.map_id!==layout.mapId)return [];
  const levels=g.GymSystem.getState().levels,unit=projection.tileWidth/144;
  const project=(x,y,z=0)=>{const p=projection.cellCenter(x-.5,y-.5);return {x:p.x/unit,y:p.y/unit-z};};
  const objects=[];
  for(const s of [...layout.stations,...layout.decorations]){
   const station=!!g.GymData.STATIONS.find(a=>a.id===s.id),size=s.footprint||g.GymSystem.footprints[s.id];
   const visible=Array.from({length:size[0]*size[1]},(_,i)=>metaAt(s.x+i%size[0],s.y+Math.floor(i/size[0]))).some(m=>station?m.npcId===g.GymFacility.npcId(s.id)&&m.npc:!!m.sceneryVisible);
   if(!visible)continue;
   objects.push({x:s.x+size[0]/2-.5,y:s.y+size[1]/2-.5,draw(ctx){
    if(!projection.isIsometric){const p=projection.cellCenter(s.x,s.y);ctx.fillStyle='#d6bc7e';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(station?g.GymData.STATIONS.find(a=>a.id===s.id).name:s.name,p.x,p.y);return;}
    ctx.save();ctx.scale(unit,unit);
    if(station){
     art.station(ctx,s.id,levels,project,s.x,s.y,{ghost:!levels[s.id]});
     const p=project(s.x+size[0]/2,s.y+size[1]/2),name=g.GymData.STATIONS.find(a=>a.id===s.id).name;
     ctx.font='12px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.lineWidth=3;ctx.strokeStyle='#101a13';ctx.fillStyle=levels[s.id]?'#e8dfc0':'#aba992';ctx.strokeText(name,p.x,p.y+13);ctx.fillText(name,p.x,p.y+13);
    }
    else {const p=project(s.x+size[0]/2,s.y+size[1]/2);room.sprite(ctx,s.id,p.x,p.y);}
    ctx.restore();
   }});
  }
  if(projection.isIsometric)for(const f of layout.wallFittings){
   const x=Math.floor(f.x),y=Math.floor(f.y);if(!metaAt(x,y).sceneryVisible)continue;
   objects.push({x:f.x-.5,y:f.y-.5,draw(ctx){ctx.save();ctx.scale(unit,unit);const p=project(f.x,f.y,f.z);room.sprite(ctx,f.id,p.x,p.y);ctx.restore();}});
  }
  return objects;
 }};
 api.ready=Promise.all([g.GymSystem.ready,import('./gym-art.mjs'),import('./gym-room-art.mjs'),fetch('data/maps/M0_Base_Inside_lv_1.json').then(r=>r.json())]).then(async([,a,r,map])=>{
  [art,room]=await Promise.all([a.loadGymArt(),r.loadGymRoomArt()]);layout=g.GymSystem.getLayout();room.install(map,layout);
 });
 g.GymSceneArt=api;
})(window);

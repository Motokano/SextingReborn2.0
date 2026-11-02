/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const D=DungeonRuntime,A=RuinsModuleArt,images=new Map();let frame=0;
const invalid=()=>{if(frame||!D.active())return;frame=requestAnimationFrame(()=>{frame=0;if(D.active())globalThis.SceneRenderer?.render();});};
for(const v of [globalThis.DungeonBossRoomArt,globalThis.DungeonCorpseArt,globalThis.DungeonGridArt,RuinsHarvestPawns,RuinsLoot,RuinsMixed,RuinsInsight,RuinsExitPawn,RuinsCanteenArt,RuinsOutpostDecor,A])v?.setInvalidation?.(invalid);
function polygon(ctx,pts){ctx.beginPath();pts.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();}
const unit=pr=>pr.isIsometric?pr.tileWidth/Math.SQRT2:pr.tileWidth;
const point=(pr,x,y,z=0)=>{const p=pr.cellCenter(x,y);return{x:p.x,y:p.y-z*unit(pr)};};
const painter=ctx=>(pts,fill,stroke)=>{polygon(ctx,pts);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
function terrain(ctx,x,y,pr){
 const s=D.getSim();if(!s)return;const m=s.map,k=y*m.width+x,t=m.tiles[k],q=pr.cellPolygon(x,y),vis=D.inspect(k);
 polygon(ctx,q);ctx.fillStyle='#101a16';ctx.fill();if(t===RuinsSettlement.VOID||!vis?.terrain)return;
 ctx.fillStyle=t===1?'#55594a':t===2?'#655f4d':m.road[k]?'#8c846a':'#686f58';ctx.fill();A.floor(ctx,m,k,q);
 if(!vis.raw){polygon(ctx,q);ctx.fillStyle='#151e2166';ctx.fill();}
}
function sprite(ctx,src,x,y,size,crop){let im=images.get(src);if(!im){im=new Image();im.onload=invalid;im.src=src;images.set(src,im);}if(!im.complete||!im.naturalWidth)return;const b=crop||[0,0,im.naturalWidth,im.naturalHeight],f=size/b[2];ctx.drawImage(im,...b,x-size/2,y-b[3]*f,size,b[3]*f);}
function visibleDecor(a){const cells=a.footprint||[a.cell],visible=k=>D.inspect(k)?.terrain;return a.opaque?cells.some(visible):cells.every(visible);}
function drawDecor(ctx,a,pr,m){
 if(a.render===false||!visibleDecor(a))return;const pos=point(pr,a.cell%m.width+(a.offsetX||0),Math.floor(a.cell/m.width)+(a.offsetY||0));
 if(a.moduleWall)A.partition(ctx,m,a.cell,(x,y,z)=>point(pr,x,y,z),painter(ctx),unit(pr));
 else RuinsOutpostDecor.draw(ctx,a,pos.x,pos.y,unit(pr));
}
function ground(ctx,pr){const m=D.getSim()?.map;if(!m)return;for(const a of m.outpostDecor||[])if(!a.solid)drawDecor(ctx,a,pr,m);}
function object(ctx,x,y,pr){
 const s=D.getSim();if(!s)return;const m=s.map,k=y*m.width+x,vis=D.inspect(k),c=pr.cellCenter(x,y),size=unit(pr),world=(x,y,z)=>point(pr,x,y,z),poly=painter(ctx);
 // A visible near face draws its whole opaque assembly; unseen floor, enemies
 // and loot remain gated independently. Do not cut tall art with a tile mask.
 for(const a of [...(m.workshopObstacles||[]),...(m.clinicObstacles||[]),...(m.canteenObstacles||[])])if(a.cell===k)drawDecor(ctx,a,pr,m);
 for(const a of m.outpostDecor||[])if(a.cell===k&&a.solid)drawDecor(ctx,a,pr,m);
 if(!vis?.terrain)return;
 if(m.tiles[k]===1){A.wall(ctx,m,k,world,poly,size);return;}
 const door=s.doors.find(d=>d.cell===k);if(door)A.door(ctx,door,m.width,world,poly,size);
 for(const tree of m.trees||[])if((tree.cell??(Math.floor(tree.y)*m.width+Math.floor(tree.x)))===k){
  if(tree.woodland)A.tree(ctx,tree,c.x,c.y,size,pr.cellCenter(s.player.cell%m.width,Math.floor(s.player.cell/m.width)));
  else RuinsResourceArt.draw(ctx,{shape:'tree',id:'decor'},c.x,c.y-size*.1,size*Math.max(.5,Math.min(1.1,tree.size)));
 }
 const harvest=s.harvestPoints.find(p=>p.cell===k),loot=s.lootPoints.find(p=>p.cell===k),recovery=s.recoveryPoints.find(p=>p.cell===k),insight=s.insightPoints.find(p=>p.cell===k);
 // Fixed POIs on currently visible ground still have an unknown presence in
 // the rear-adjacent stepping area. Only their identity is withheld; do not
 // reuse the actor/dynamic stripping rule or they pop out of an empty tile.
 // The terrain/LOS gate above remains authoritative, including closed doors.
 if(!vis.identify){if(harvest||loot||recovery||insight||k===m.exit){ctx.save();ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#d5cfb5';ctx.fillText('?',c.x,c.y-size*.2);ctx.restore();}return;}
 if(!vis.dynamic)return;
 if(harvest)RuinsHarvestPawns.draw(ctx,harvest,c.x,c.y,size);
 if(loot)RuinsLoot.draw(ctx,loot,c.x,c.y,size);
 if(recovery)RuinsMixed.drawRecovery(ctx,recovery,c.x,c.y,size);
 if(insight)RuinsInsight.draw(ctx,insight,c.x,c.y,size);
 if(k===m.exit)RuinsExitPawn.draw(ctx,c.x,c.y,size,s.player.cell===k?c:null);
 const corpses=s.corpses.filter(p=>p.cell===k).slice(0,3);for(let i=0;i<corpses.length;i++){const p=corpses[i];ctx.save();if(k===s.player.cell)ctx.globalAlpha=.55;DungeonCorpseArt.draw(ctx,p.marked,c.x+(i-(corpses.length-1)/2)*size*.1,c.y,pr.tileWidth);ctx.restore();}
}
// Visibility is applied before painting terrain/objects. A post-render ground
// mask would incorrectly shear off the upper halves of walls and furniture.
function fog(){}
function viewport(p,st,vp){const w=(vp?.width||1042)+400,h=(vp?.height||638)+400,c=p.cellCenter(st.x,st.y),ox=c.x-w/2,oy=c.y-h/2,shift=v=>({x:v.x-ox,y:v.y-oy});return{...p,widthPx:w,heightPx:h,cropKey:st.x+','+st.y,cellCenter:(x,y)=>shift(p.cellCenter(x,y)),cellToPx:(x,y)=>shift(p.cellToPx(x,y)),cellPolygon:(x,y)=>p.cellPolygon(x,y).map(shift),pick:(x,y)=>p.pick(x+ox,y+oy)};}
globalThis.DungeonArt={terrain,ground,object,fog,sprite,viewport};
})();

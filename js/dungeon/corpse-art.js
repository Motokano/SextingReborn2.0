/* Death presentation follows one saved story flag; loot and recovery stay unchanged. */
(()=>{'use strict';
 const GORE_FLAG='血腥开关',root='assets/dungeon/corpse-bag-v3/',cache=new Map(),enemyArt=new Map();
 let invalidate=()=>{},artPawnScale=1.25,artGroundOffset=10;
 const registration={crop:[212,156,896,984],anchor:[660,1136],baseWidth:890,referenceBaseWidth:46};
 const isGoreEnabled=()=>globalThis.NPCSystem?.getFlagValue?.(GORE_FLAG)===true;
 // Boolean callers represent actual recovery sacks, which have no enemy identity.
 function appearance(corpse){
  const marked=typeof corpse==='object'&&corpse!==null?!!corpse.marked:!!corpse;
  const art=isGoreEnabled()&&corpse&&typeof corpse==='object'?enemyArt.get(corpse.enemyId):null;
  if(art)return {...art[marked?'marked':'normal'],referenceScale:artPawnScale,groundOffset:artGroundOffset,
   footprint:[art.normal.crop[2]*art.normal.scaleAt144*.45,12]};
  return {src:root+(marked?'marked':'normal')+'.png',crop:registration.crop,anchor:registration.anchor,
   scaleAt144:registration.referenceBaseWidth/registration.baseWidth,referenceScale:1,groundOffset:8,footprint:[23,7]};
 }
 const source=corpse=>appearance(corpse).src;
 function draw(ctx,corpse,x,y,tileWidth=144){
  const art=appearance(corpse),factor=TileRendererV2.getPawnDisplayScale(),unit=tileWidth/144;
  let entry=cache.get(art.src);
  if(!entry){const image=new Image();entry={image};cache.set(art.src,entry);image.onload=()=>invalidate();image.src=art.src;}
  const image=entry.image;if(!image.complete||!image.naturalWidth)return false;
  const scale=art.scaleAt144*factor/art.referenceScale,spec={crop:art.crop,anchor:art.anchor,width:art.crop[2]*scale};
  if(entry.factor!==factor){entry.shadow=TileRendererV2.makeGroundShadow(image,spec,art.footprint.map(v=>v*factor/art.referenceScale));entry.factor=factor;}
  const dx=(spec.crop[0]-spec.anchor[0])*scale,dy=(spec.crop[1]-spec.anchor[1])*scale;
  ctx.save();ctx.translate(x,y+art.groundOffset*unit);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.save();ctx.filter='blur(.35px)';ctx.drawImage(entry.shadow,...(entry.shadow.drawBounds||[-64,-40,160,88]));ctx.restore();
  ctx.drawImage(image,...spec.crop,dx,dy,spec.width,spec.crop[3]*scale);ctx.restore();return true;
 }
 const ready=fetch('assets/map/isometric/street-thugs-marked-v1/manifest.json').then(r=>{if(!r.ok)throw Error('死亡棋子配置加载失败');return r.json();}).then(manifest=>{
  artPawnScale=manifest.pawnScale;artGroundOffset=manifest.groundOffsetY;
  for(const art of manifest.entries)for(const id of art.enemyIds)enemyArt.set(id,art);
  invalidate();
 }).catch(error=>{console.error(error);});
 globalThis.DungeonCorpseArt={GORE_FLAG,isGoreEnabled,source,draw,registration,ready,
  refresh:()=>invalidate(),setInvalidation:fn=>{invalidate=fn||(()=>{});}};
})();

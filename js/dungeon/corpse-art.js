/* Shared flour-sack pawn: normal / marked use the same base and ground anchor. */
(()=>{'use strict';
 const root='assets/dungeon/corpse-bag-v3/',cache=new Map();let invalidate=()=>{};
 const registration={crop:[212,156,896,984],anchor:[660,1136],baseWidth:890,referenceBaseWidth:46};
 const source=marked=>root+(marked?'marked':'normal')+'.png';
 function draw(ctx,marked,x,y,tileWidth=144){
  const src=source(marked),factor=TileRendererV2.getPawnDisplayScale(),unit=tileWidth/144;
  let entry=cache.get(src);
  if(!entry){const image=new Image();entry={image};cache.set(src,entry);image.onload=()=>invalidate();image.src=src;}
  const image=entry.image;if(!image.complete||!image.naturalWidth)return false;
  const spec={crop:registration.crop,anchor:registration.anchor,width:registration.referenceBaseWidth*factor*registration.crop[2]/registration.baseWidth};
  if(entry.factor!==factor){entry.shadow=TileRendererV2.makeGroundShadow(image,spec,[23*factor,7*factor]);entry.factor=factor;}
  const scale=spec.width/spec.crop[2],dx=(spec.crop[0]-spec.anchor[0])*scale,dy=(spec.crop[1]-spec.anchor[1])*scale;
  ctx.save();ctx.translate(x,y+8*unit);ctx.scale(unit,unit);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.save();ctx.filter='blur(.35px)';ctx.drawImage(entry.shadow,-64,-40,160,88);ctx.restore();
  ctx.drawImage(image,...spec.crop,dx,dy,spec.width,spec.crop[3]*scale);ctx.restore();return true;
 }
 globalThis.DungeonCorpseArt={source,draw,registration,setInvalidation:fn=>{invalidate=fn||(()=>{});}};
})();

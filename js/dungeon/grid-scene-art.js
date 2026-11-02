/* Grid-first painted props. Geometry metadata never changes saved gameplay IDs. */
(()=>{'use strict';
const images=new Map(),catalog=globalThis.DungeonGridSceneCatalog||{};let invalidate=()=>globalThis.SceneRenderer?.render();
const recoveryIds={water:'old-water-filter',stove:'barrel-cooking-stove',medical:'first-aid-trolley',rest:'car-seat-rest-berth',campfire:'campfire-small-pot',kettle:'small-enamel-water-jug'};
const materials={road:'assets/dungeon/grid-scene-v1/road.png',floor:'assets/dungeon/street-thug-boss-room-v6/painted-concrete.png',cap:'assets/dungeon/street-thug-boss-room-v6/painted-concrete.png',wall:'assets/dungeon/street-thug-boss-room-v6/painted-plaster.png',wood:'assets/dungeon/grid-scene-v1/floor-timber.png',iron:'assets/dungeon/grid-scene-v1/iron.png','wall-plaster-brick':'assets/dungeon/grid-scene-v1/wall-plaster-brick.png','wall-damp-stone':'assets/dungeon/grid-scene-v1/wall-damp-stone.png','wall-peeling-workshop':'assets/dungeon/grid-scene-v1/wall-peeling-workshop.png','floor-timber':'assets/dungeon/grid-scene-v1/floor-timber.png','floor-concrete':'assets/dungeon/street-thug-boss-room-v6/painted-concrete.png','floor-industrial':'assets/dungeon/grid-scene-v1/floor-industrial.png'};
function asset(id,state='unsearched'){const p=catalog[id];return p&&(p[state]||p.normal);}
function image(src){if(images.has(src))return images.get(src);if(typeof Image==='undefined')return null;const im=new Image();images.set(src,im);im.onload=()=>invalidate();im.onerror=()=>console.error('地牢素材加载失败：'+src);im.src=src;return im;}
function legacy(id,state){const a=asset(id,state);return a&&{src:a.src,bounds:[...a.crop,...a.anchor,a.bodyWidth,...a.size]};}
function facing(id,point,map,fallback=false){
 const p=catalog[id];if(!p||!point||!map||!Number.isInteger(point.cell))return fallback;
 // Multi-cell props are aligned to their actual occupied axis by the generator.
 // The two native three-quarter views exchange +x and +y; no arbitrary rotation.
 if(p.fixedFacing||p.logicalFootprint.some(v=>v>1)||point.front||point.solid===false)return fallback;
 const x=point.cell%map.width,y=Math.floor(point.cell/map.width),at=(dx,dy)=>{const a=x+dx,b=y+dy;return a>=0&&b>=0&&a<map.width&&b<map.height?b*map.width+a:-1;};
 const free=k=>k>=0&&RuinsSettlement.walkable((map.collision||map.tiles)[k]);
 const score=(dx,dy)=>{const back=at(-dx,-dy);let n=back>=0&&map.tiles[back]===1?3:0;for(let i=1;i<=3;i++){if(!free(at(dx*i,dy*i))){n-=i===1?8:1;break;}n+=4/i;}return n;};
 return score(1,0)>score(0,1);
}
function draw(ctx,id,state,x,y,size,{flip=false,shadow=true,point=null}={}){
 const p=catalog[id],a=asset(id,state);if(!a)return false;
 if(point)flip=facing(id,point,globalThis.DungeonRuntime?.getSim()?.map,flip);
 const im=image(a.src);if(!im?.complete||!im.naturalWidth)return false;
 const [bx,by,bw,bh]=a.crop,[cx,cy]=a.anchor,f=size*Math.SQRT2*p.tileWidth/a.bodyWidth;
 ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);
 if(shadow){ctx.save();ctx.scale(size*p.tileWidth*.45,size*p.tileWidth*.18);const shade=ctx.createRadialGradient(0,0,0,0,0,1);shade.addColorStop(0,'#101a1460');shade.addColorStop(1,'#101a1400');ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();}
 // Ground-contact measurements locate the sprite; they are not a 3-D camera
 // transform. Applying them to the entire painted object distorts its body,
 // wheels and opening. Reviewed containers retain their native proportions.
 if(p.projectionMode!=='native'&&a.groundSlopes){const [u,v]=a.groundSlopes,d=Math.SQRT2/(u-v);ctx.transform(1,Math.SQRT1_2-d*u,0,d,0,0);}
 ctx.drawImage(im,bx,by,bw,bh,(bx-cx)*f,(by-cy)*f,bw*f,bh*f);ctx.restore();return true;
}
globalThis.DungeonGridArt={catalog,asset,legacy,recoveryIds,materials,draw,facing,setInvalidation:fn=>invalidate=fn,load(id){const p=catalog[id];if(p)for(const key of ['normal','unsearched','searched','used','partial','low'])if(p[key])image(p[key].src);}};
})();

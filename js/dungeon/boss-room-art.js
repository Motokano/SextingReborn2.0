/* The approved v6 paint and geometry, shared with the interactive review. */
(()=>{'use strict';
 const root='assets/dungeon/street-thug-boss-room-v6/',data=DungeonBossRoomData.art,images=new Map();let invalidate=()=>{};
 const props=new Map(data.props.map(p=>['den-'+p.id,{...p,src:root+p.src}]));
 const containers=new Map(data.containers.map(p=>[p.id,{...p,...Object.fromEntries(['unsearched','searched'].map(k=>[k,{...p[k],src:root+p[k].src}]))}]));
 function image(src){if(!images.has(src)&&typeof Image!=='undefined'){const im=new Image();images.set(src,im);im.onload=()=>invalidate();im.src=src;}return images.get(src);}
 function paint(ctx,a,x,y,s,{flip=false,solid=true,bodyWidth,displayWidth}={}){
  const im=image(a.src);if(!im?.complete||!im.naturalWidth)return;
  const b=a.crop,width=displayWidth||a.width,f=width*(s*Math.SQRT2/144)/(bodyWidth||a.bodyWidth||b[2]);
  ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);
  if(solid){ctx.save();ctx.scale(width*s/144*.42,width*s/144*.15);const sh=ctx.createRadialGradient(0,0,0,0,0,1);sh.addColorStop(0,'#101a1460');sh.addColorStop(1,'#101a1400');ctx.fillStyle=sh;ctx.fillRect(-1,-1,2,2);ctx.restore();}
  if(a.groundSlopes){const [u,v]=a.groundSlopes,d=Math.SQRT2/(u-v);ctx.transform(1,Math.SQRT1_2-d*u,0,d,0,0);}
  ctx.drawImage(im,...b,(b[0]-a.anchor[0])*f,(b[1]-a.anchor[1])*f,b[2]*f,b[3]*f);ctx.restore();
 }
 const options={grid:false,get wallTexture(){return image(root+data.textures.wall);},get floorTexture(){return image(root+data.textures.floor);}};
 const architecture=DungeonBossRoomArchitecture.install(globalThis,options);
 function drawDecor(ctx,p,x,y,s){
  if(p.kind==='den-lowwall'||p.kind==='den-column'){architecture.drawPartition(ctx,p,x,y,s);return true;}
  const a=props.get(p.kind);if(!a)return false;paint(ctx,a,x,y,s,p);return true;
 }
 function drawLoot(ctx,p,x,y,s,selected=false,progress=null){
  const a=containers.get(p.assetId);if(!a)return false;
  x+=((p.offsetX||0)-(p.offsetY||0))*s/Math.SQRT2;y+=((p.offsetX||0)+(p.offsetY||0))*s/2;
  const state=a[p.search?.opened?'searched':'unsearched'];paint(ctx,{...state,width:a.width},x,y,s,{bodyWidth:state.bodyWidth,flip:p.flip});
  if(selected){ctx.strokeStyle='#dfc693';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,a.width*.52,a.width*.24,0,0,Math.PI*2);ctx.stroke();}
  if(progress!==null){ctx.fillStyle='#dfc693';ctx.fillRect(x-s*.4,y+s*.25,s*.8*progress,3);}
  return true;
 }
 function asset(id){const a=containers.get(id);return a&&{id,name:id==='den-private'?'头目私藏箱':'赃物袋筐',...Object.fromEntries(['unsearched','searched'].map(k=>[k,{src:a[k].src,bounds:[...a[k].crop,...a[k].anchor,a[k].bodyWidth,1280,1280]}]))};}
 function load(id){const a=containers.get(id);if(a)for(const state of ['unsearched','searched'])image(a[state].src);}
 globalThis.DungeonBossRoomArt={props,containers,paint,image,options,architecture,drawDecor,drawLoot,asset,load,setInvalidation:fn=>{invalidate=fn||(()=>{});}};
})();

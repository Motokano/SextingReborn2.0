// Candidate preview only: original PNG and the production pawn/shadow renderer.
import {loadReviewArt as loadBackpackArt} from './ground-backpack-art-draw.mjs';
export async function loadReviewArt(g=window){
 const base=await loadBackpackArt(g);
 const manifest=await fetch('assets/map/isometric/ground-items-v1/manifest.json').then(r=>r.json()),a=manifest.asset;
 const im=new g.Image();im.src=a.src;await im.decode();
 const shadow=g.TileRendererV2.makeGroundShadow(im,{...a,width:a.crop[2]*a.scaleAt144,source:a.src},[10,4]);
 function pile(ctx,x,y,{tileWidth=144,contacts=false}={}){
  const zoom=tileWidth/144,f=a.scaleAt144*zoom,[bx,by,bw,bh]=a.crop,[ax,ay]=a.anchor;
  ctx.save();ctx.translate(x,y);ctx.scale(zoom,zoom);ctx.drawImage(shadow,...shadow.drawBounds);ctx.restore();
  ctx.drawImage(im,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);
  if(contacts){ctx.save();ctx.strokeStyle='#f2bf5c';ctx.lineWidth=1;ctx.beginPath();a.groundContacts.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](x+(u-ax)*f,y+(v-ay)*f));ctx.closePath();ctx.stroke();ctx.fillStyle='#ffcf64';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();ctx.restore();}
 }
 return {manifest,image:im,pile,player:base.player,backpack:base.bag};
}

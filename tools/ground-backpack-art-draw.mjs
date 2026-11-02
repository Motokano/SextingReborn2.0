// Candidate-art review only. Does not register a gameplay asset or mutate saves.
export async function loadReviewArt(g=window) {
  const read=p=>fetch(p).then(r=>{if(!r.ok)throw new Error(p);return r.json();});
  const image=async src=>{const im=new g.Image();im.src=src;await im.decode();return im;};
  const manifest=await read('assets/map/isometric/ground-backpack-v1/manifest.json');
  const a=manifest.asset,im=await image(a.src);
  const pm=await read('assets/map/isometric/player-atlas-v1/manifest.json'),ps=pm.states[0];
  const pi=await image('assets/map/isometric/player-atlas-v1/'+ps.file);
  const shadow=g.TileRendererV2.makeGroundShadow(im,{...a,width:a.crop[2]*a.scaleAt144,source:a.src},[16,6]);
  function bag(ctx,x,y,{tileWidth=144,contacts=false}={}) {
    const zoom=tileWidth/144,f=a.scaleAt144*zoom,[bx,by,bw,bh]=a.crop,[ax,ay]=a.anchor;
    ctx.save();ctx.translate(x,y);ctx.scale(zoom,zoom);ctx.drawImage(shadow,...shadow.drawBounds);ctx.restore();
    ctx.drawImage(im,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);
    if(contacts){ctx.save();ctx.strokeStyle='#f2bf5c';ctx.lineWidth=1;ctx.beginPath();a.groundContacts.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](x+(u-ax)*f,y+(v-ay)*f));ctx.closePath();ctx.stroke();for(const[u,v]of a.groundContacts){ctx.beginPath();ctx.arc(x+(u-ax)*f,y+(v-ay)*f,2,0,Math.PI*2);ctx.fillStyle='#ffcf64';ctx.fill();}ctx.restore();}
  }
  function player(ctx,x,y) { const [bx,by,bw,bh]=ps.crop,[ax,ay]=[bx+ps.anchor[0],by+ps.anchor[1]],f=pm.displayBaseWidth/ps.baseWidth*1.25;ctx.drawImage(pi,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f); }
  return {manifest,image:im,bag,player};
}

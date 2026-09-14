// Appearance is attached to saved world transforms. This module never solves or edits a pose.
export const project = p => [p[0], -p[1] + .45*p[2]];
const position = n => n.worldMatrix.slice(12,15);
const endpoint = n => [0,1,2].map(i=>n.worldMatrix[12+i]+n.worldMatrix[4+i]*n.length);
export function placement(module,node,state) {
  const c=module.crop,w=c[2],h=c[3];
  if(module.mode==='base')return [module.width/w,0,0,module.height/h,-module.width*module.pivot[0],-module.height*module.pivot[1]];
  if(module.mode==='segment'){
    const p=project(position(node)),q=project(endpoint(node));
    const sx=module.start[0]*w,sy=module.start[1]*h;
    const ax=module.end[0]*w-sx,ay=module.end[1]*h-sy,al=Math.hypot(ax,ay);
    const dx=q[0]-p[0],dy=q[1]-p[1],dl=Math.hypot(dx,dy);
    // The two authored attachment points map exactly onto the projected joint/end.
    const ux=ax/al,uy=ay/al,tx=dl>1e-8?dx/dl:0,ty=dl>1e-8?dy/dl:1;
    const cross=module.width/w,long=dl/al;
    const a=tx*ux*long+ty*uy*cross,b=ty*ux*long-tx*uy*cross;
    const cc=tx*uy*long-ty*ux*cross,d=ty*uy*long+tx*ux*cross;
    return [a,b,cc,d,p[0]-a*sx-cc*sy,p[1]-b*sx-d*sy];
  }
  const p=project(module.mode==='head'?state.headCenter:position(node));
  const axis=project(node.worldMatrix.slice(4,7));
  const angle=Math.atan2(axis[1],axis[0])+Math.PI/2,cos=Math.cos(angle),sin=Math.sin(angle);
  const a=cos*module.width/w,b=sin*module.width/w,cc=-sin*module.height/h,d=cos*module.height/h;
  return [a,b,cc,d,p[0]-a*w*module.pivot[0]-cc*h*module.pivot[1],p[1]-b*w*module.pivot[0]-d*h*module.pivot[1]];
}
export function commands(skin,state){
  const nodes=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
  return skin.modules.filter(m=>m.id==='base'||nodes[m.id]?.visible).map(m=>{
    const n=nodes[m.id];
    const depth=n?(position(n)[2]+endpoint(n)[2])/2:0;
    const rank=m.id==='base'?-10000:depth*10+({abdomen:2,chest:3,head:30}[m.id]||0);
    return {id:m.id,module:m,node:n,matrix:placement(m,n,state),rank};
  }).sort((a,b)=>a.rank-b.rank);
}
export function draw(ctx,skin,state,images,{wire=false,explode=0,selected=null,onlyRig=false}={}){
  const list=commands(skin,state);
  if(!onlyRig)for(const item of list){
    const m=item.module,im=images[m.id]||images.sheet,c=m.crop;
    ctx.save();
    if(explode&&m.id!=='base'){
      const index=skin.modules.findIndex(x=>x.id===m.id),col=index%4,row=Math.floor(index/4);
      ctx.translate((col-1.5)*explode,(row-1.5)*explode);
    }
    ctx.transform(...item.matrix);
    if(images[m.id])ctx.drawImage(im,0,0,im.width,im.height,0,0,c[2],c[3]);
    else ctx.drawImage(im,...c,0,0,c[2],c[3]);
    if(state.injuryLayers.some(l=>l.part===m.part)&&skin.injuries[m.id]){
      const uv=skin.injuries[m.id].uv,x=uv[0]*c[2],y=uv[1]*c[3];
      ctx.save();ctx.translate(x,y);ctx.scale(c[2]/220,c[3]/220);
      ctx.fillStyle='#97434cb0';ctx.beginPath();ctx.moveTo(-15,-2);ctx.lineTo(-6,-10);ctx.lineTo(-1,-5);ctx.lineTo(12,-12);ctx.lineTo(9,-2);ctx.lineTo(18,0);ctx.lineTo(6,8);ctx.lineTo(-4,6);ctx.lineTo(-12,12);ctx.closePath();ctx.fill();ctx.restore();
    }
    if(selected===m.id){ctx.strokeStyle='#ffc65b';ctx.lineWidth=3;ctx.strokeRect(0,0,c[2],c[3]);}
    ctx.restore();
  }
  if(wire||onlyRig){
    ctx.lineWidth=.35;ctx.strokeStyle='#4eeed7';ctx.fillStyle='#ffc95c';
    for(const n of state.nodes.filter(n=>n.visible)){
      const p=project(position(n)),q=project(endpoint(n));ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.beginPath();ctx.arc(...p,.6,0,Math.PI*2);ctx.fill();
    }
  }
}

/* Small modular material pilot. Art never changes collision or visibility. */
(()=>{'use strict';
const config={atlas:'assets/dungeon/modules-v1/material-atlas-v1.png',woodlandAtlas:'assets/dungeon/woodland-v1/ground-atlas.png',columns:3,rows:2,repeat:4,wallRepeat:4,wallHeight:.62,cutawayHeight:.24,doorHeight:.94,wallWeights:{wall:1,'wall-plaster-brick':2,'wall-damp-stone':2,'wall-peeling-workshop':2}};
const regions={road:[0,0],floor:[1,0],wall:[2,0],cap:[0,1],wood:[1,1],iron:[2,1],moss:[0,0],earth:[1,0],litter:[2,0]};
let atlas=null,woodlandAtlas=null,invalidate=()=>{};
const wallImages={},wallSources={
 'wall-plaster-brick':'assets/dungeon/walls-v2/wall-plaster-brick.png',
 'wall-damp-stone':'assets/dungeon/walls-v2/wall-damp-stone.png',
 'wall-peeling-workshop':'assets/dungeon/walls-v2/wall-peeling-workshop.png',
 ...globalThis.DungeonGridArt?.materials
};
const wallProfiles=new WeakMap();
// Choose one coherent material per building. Texture coordinates continue
// along each wall run; never pick a different swatch for every grid square.
function wallMaterial(m,k){
 let choices=wallProfiles.get(m);if(!choices){choices=new Map();wallProfiles.set(m,choices);}
 const id=m.owner[k];if(choices.has(id))return choices.get(id);
 let name='wall-peeling-workshop';
 if(!m.rooms.some(r=>r.id===id&&r.workshop)){
  const weights=Object.entries(config.wallWeights),sum=weights.reduce((n,[,v])=>n+v,0);
  let roll=(RuinsSettlement.hash(m.seed+'-wall-material-'+(m.floor||1)+'-'+id)%1000003)/1000003*sum;
  name='wall';for(const [key,weight]of weights){roll-=weight;if(roll<0){name=key;break;}}
 }
 if(m.rooms.some(r=>r.id===id&&(r.clinic||r.canteen)))name='wall';
 choices.set(id,name);return name;
}
// Dedicated scenery silhouettes: never reuse harvest-resource sprites here.
const treeImages={},treeSources={
 scrub:{src:'assets/dungeon/scenery-vegetation-v1/scrub.png',bounds:[54,224,1151,842,700,1061],height:1.05,width:1.45},
 tangle:{src:'assets/dungeon/scenery-vegetation-v1/tangle.png',bounds:[79,143,1120,987,710,1123],height:1.25,width:1.45},
 crooked:{src:'assets/dungeon/scenery-vegetation-v1/crooked.png',bounds:[14,52,1009,1375,600,1420],height:1.85,width:1.45}
};
function setInvalidation(fn){
 invalidate=fn;if(atlas||typeof Image==='undefined')return;
 const load=src=>{const im=new Image();im.onload=()=>{globalThis.DungeonSurfaceStyle?.clear();invalidate();};im.src=src;return im;};
 atlas=load(config.atlas);woodlandAtlas=load(config.woodlandAtlas);
 for(const [key,src]of Object.entries(wallSources))wallImages[key]=load(src);
 for(const [key,a]of Object.entries(treeSources))treeImages[key]=load(a.src);
}
const mod=(a,n)=>((a%n)+n)%n;
const blendCache=new Map();
function naturalBlend(ctx,name,q,uv,weights){
 if(!woodlandAtlas?.complete||!woodlandAtlas.naturalWidth||typeof document==='undefined')return false;
 const key=name+':'+uv.join(',')+':'+weights.join(',');let tile=blendCache.get(key);
 if(!tile){
  const side=64;tile=document.createElement('canvas');tile.width=side;tile.height=side;const c=tile.getContext('2d');
  const w=woodlandAtlas.naturalWidth/3,h=woodlandAtlas.naturalHeight,g=2;
  c.drawImage(woodlandAtlas,regions[name][0]*w+g+uv[0]*(w-2*g),g+uv[1]*(h-2*g),uv[2]*(w-2*g),uv[3]*(h-2*g),0,0,side,side);
  const pixels=c.getImageData(0,0,side,side);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
   const u=x/(side-1),v=y/(side-1),a=(weights[0]*(1-u)+weights[1]*u)*(1-v)+(weights[3]*(1-u)+weights[2]*u)*v;
   pixels.data[(y*side+x)*4+3]=Math.round(255*a*a*(3-2*a));
  }c.putImageData(pixels,0,0);blendCache.set(key,tile);
 }
 ctx.save();ctx.transform(q[1].x-q[0].x,q[1].y-q[0].y,q[3].x-q[0].x,q[3].y-q[0].y,q[0].x,q[0].y);ctx.globalAlpha*=.94;ctx.drawImage(tile,0,0,1,1);ctx.restore();return true;
}
// Quad order: upper-left, upper-right, lower-right, lower-left.
// Orthographic source receives exactly one affine world-to-screen projection.
function surface(ctx,name,q,uv=[0,0,1,1],shade=0){
 const woodland=['moss','earth','litter'].includes(name),standalone=Object.hasOwn(wallSources,name),source=standalone?wallImages[name]:woodland?woodlandAtlas:atlas;
 if(!source?.complete||!source.naturalWidth)return false;
 const r=standalone?[0,0]:regions[name],cw=source.naturalWidth/(standalone?1:config.columns),ch=source.naturalHeight/(standalone||woodland?1:config.rows),g=2;
 const [u,v,uw,vh]=uv,sx=r[0]*cw+g+u*(cw-g*2),sy=r[1]*ch+g+v*(ch-g*2),sw=uw*(cw-g*2),sh=vh*(ch-g*2);
 ctx.save();ctx.beginPath();q.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();ctx.clip();
 ctx.transform(q[1].x-q[0].x,q[1].y-q[0].y,q[3].x-q[0].x,q[3].y-q[0].y,q[0].x,q[0].y);
 ctx.drawImage(source,sx,sy,sw,sh,0,0,1,1);
 if(shade){ctx.fillStyle=shade>0?'rgba(18,27,24,'+shade+')':'rgba(230,217,179,'+(-shade)+')';ctx.fillRect(0,0,1,1);}
 ctx.restore();return true;
}
function floor(ctx,m,k,q){
 if(globalThis.RuinsOutpostDecor?.floor(ctx,m,k,q))return true;
 if(globalThis.DungeonSurfaceStyle)return DungeonSurfaceStyle.floor(ctx,m,k,q,surface);
 const tile=m.tiles[k],interior=tile===2||tile===4||tile===6||m.owner[k]>=0&&tile!==3;
 const name=m.woodland?.ground[k]||(interior?'floor':tile===3?'cap':'road'),n=config.repeat,x=k%m.width,y=Math.floor(k/m.width);
 const uv=[mod(x,n)/n,mod(y,n)/n,1/n,1/n],blend=m.woodland?.blend[k];
 if(blend&&blend.some(v=>v<1)&&blend.some(v=>v>0)){
  surface(ctx,'earth',q,uv,.08);return naturalBlend(ctx,name==='litter'?'litter':'moss',q,uv,blend)||surface(ctx,name,q,uv,.08);
 }
 return surface(ctx,name,q,uv,interior?.15:tile===3?.24:.08);
}
function tree(ctx,t,x,y,s,player){
 const key=treeSources[t.kind]?t.kind:'scrub',im=treeImages[key];if(!im?.complete||!im.naturalWidth)return;
 const source=treeSources[key],[bx,by,bw,bh,cx,bottom]=source.bounds,f=s*(t.size||1)*Math.min(source.height/bh,source.width/bw);
 ctx.save();
 // Fade only a canopy covering the player's screen position, not its collision.
 if(player&&Math.abs(player.x-x)<bw*f*.5&&player.y<y&&player.y>y-bh*f)ctx.globalAlpha=.4;
 ctx.fillStyle='#17271e38';ctx.beginPath();ctx.ellipse(x,y,s*.44,s*.19,0,0,Math.PI*2);ctx.fill();
 ctx.drawImage(im,bx,by,bw,bh,x+(bx-cx)*f,y+(by-bottom)*f,bw*f,bh*f);ctx.restore();
}
function wallHeight(m,k){
 if(k<0||k>=m.tiles.length||m.tiles[k]!==1)return 0;
 const x=k%m.width,y=Math.floor(k/m.width);
 return x+1>=m.width||y+1>=m.height||m.owner[k+1]!==m.owner[k]||m.owner[k+m.width]!==m.owner[k]?config.cutawayHeight:config.wallHeight;
}
function partitionHeight(m,k){return m.workshopWalls?.has(k)||m.clinicWalls?.has(k)||m.canteenWalls?.has(k)? .50 : wallHeight(m,k);}
function partition(ctx,m,k,point,poly,s){if(globalThis.DungeonSceneArchitecture?.wall(ctx,m,k,point,poly,s,surface,wallMaterial(m,k),true))return;return wall(ctx,m,k,point,poly,s,partitionHeight);}
function wall(ctx,m,k,point,poly,s,height=wallHeight){
 if(height===wallHeight&&globalThis.DungeonSceneArchitecture?.wall(ctx,m,k,point,poly,s,surface,wallMaterial(m,k)))return;
 const x=k%m.width,y=Math.floor(k/m.width),z=height(m,k),material=wallMaterial(m,k),repeat=config.wallRepeat;
 const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],top=corners.map(([dx,dy])=>point(x+dx,y+dy,z));
 // Cull internal faces, also cover the vertical step down to cutaway walls.
 for(const [dx,dy,a,b,shade]of[[1,0,1,2,.12],[0,1,2,3,.29]]){
  const nx=x+dx,ny=y+dy,n=ny*m.width+nx,nz=nx<m.width&&ny<m.height?height(m,n):0;
  if(nz>=z)continue;
  const bottomA=point(x+corners[a][0],y+corners[a][1],nz),bottomB=point(x+corners[b][0],y+corners[b][1],nz);
  const q=[top[a],top[b],bottomB,bottomA],u=mod(dx?y:-x,repeat)/repeat;
  const uv=[u,1-z/config.wallHeight,1/repeat,(z-nz)/config.wallHeight];
  poly(q,dx?'#8a8b70':'#6d715b');if(!surface(ctx,material,q,uv,shade))surface(ctx,'wall',q,uv,shade);
 }
 poly(top,'#9a9982');surface(ctx,'cap',top,[mod(x,4)/4,mod(y,4)/4,.25,.25],-.025);
 ctx.strokeStyle='#343c32b8';ctx.lineWidth=Math.max(.7,s*.025);
 for(const [dx,dy,a,b]of[[0,-1,0,1],[1,0,1,2],[0,1,2,3],[-1,0,3,0]]){
  const nx=x+dx,ny=y+dy,nz=nx>=0&&ny>=0&&nx<m.width&&ny<m.height?height(m,ny*m.width+nx):0;
  if(nz===z)continue;
  ctx.beginPath();ctx.moveTo(top[a].x,top[a].y);ctx.lineTo(top[b].x,top[b].y);ctx.stroke();
 }
}
function door(ctx,d,width,point,poly,s){
 const x=d.cell%width-d.dx*.5,y=Math.floor(d.cell/width)-d.dy*.5,tx=-d.dy,ty=d.dx,z=config.doorHeight;
 const a=point(x-tx*.42,y-ty*.42),b=point(x+tx*.42,y+ty*.42),at=point(x-tx*.42,y-ty*.42,z),bt=point(x+tx*.42,y+ty*.42,z);
 const end=d.closed?b:point(x-tx*.42+d.dx*.76,y-ty*.42+d.dy*.76),et={x:end.x,y:end.y-z*s};
 const q=[at,et,end,a],iron=d.material==='iron';
 poly(q,iron?'#65716b':'#836341','#27342c');surface(ctx,iron?'iron':'wood',q,[0,0,1,1],d.dx+d.dy<0?.14:0);
 const face=(u,v)=>({x:a.x+(end.x-a.x)*u,y:a.y+(end.y-a.y)*u-z*s*v});
 const detail=(u,v,w,h,fill)=>poly([face(u,v+h),face(u+w,v+h),face(u+w,v),face(u,v)],fill);
 detail(.07,.17,.86,.035,iron?'#3f554b70':'#495347');detail(.07,.76,.86,.035,iron?'#adc0ab50':'#495347');
 detail(.76,.43,.045,.14,'#253b31');detail(.79,.51,.09,.026,'#c2bea0');
 for(const [lineWidth,color]of[[.095,'#29362e'],[.052,iron?'#9baba1':'#b4a083']]){
  ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,s*lineWidth);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(b.x,b.y);ctx.stroke();
 }
}
globalThis.RuinsModuleArt={config,regions,wallSources,wallMaterial,setInvalidation,surface,floor,wall,wallHeight,partition,door,tree};
})();

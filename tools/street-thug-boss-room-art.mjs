// Standalone art review. No combat, world-state, save, or generation changes.
import {groundRegistration} from './street-thug-boss-room-projection.mjs';
import {drawLivedInRoom} from './street-thug-boss-room-lived-in.mjs';
const root='../',dir=root+'assets/dungeon/street-thug-boss-room-v1/';
const manifest=await fetch(dir+'manifest.json').then(r=>{if(!r.ok)throw Error('素材清单载入失败');return r.json();});
const livedIn=await fetch(root+'assets/dungeon/street-thug-boss-room-v2/manifest.json').then(r=>{if(!r.ok)throw Error('生活区素材载入失败');return r.json();});
const modern=await fetch(root+'assets/dungeon/street-thug-boss-room-v3/manifest.json').then(r=>{if(!r.ok)throw Error('旧厂房素材载入失败');return r.json();});
const woodAdditions=livedIn.props.map(p=>({...p,src:'assets/dungeon/street-thug-boss-room-v2/'+p.src}));
const additions=modern.props.map(p=>({...p,src:'assets/dungeon/street-thug-boss-room-v3/'+p.src}));
const fan=modern.reuse.fan;
const images=new Map(),load=async src=>{if(images.has(src))return images.get(src);const im=new Image();im.src=root+src;await im.decode();images.set(src,im);return im;};
let light=false,searched=false,aligned=true,guides=false,layout=0;
const props=manifest.props.map(p=>({...p,src:'assets/dungeon/street-thug-boss-room-v1/'+p.src}));
const boss={id:'boss',name:'地头头目',src:manifest.reuse.boss,crop:[240,40,715,1200],anchor:[597.5,1238],width:46};
const mat={name:'磨损地毯',src:manifest.reuse.mat,crop:[43,302,1220,735],width:118,...manifest.projectionCalibration.reuse.mat};
const rack={name:'旧木料架',src:manifest.reuse.rack,crop:[223,128,933,962],width:78,...manifest.projectionCalibration.reuse.rack};
const loot=manifest.containers.map(p=>({...p,...Object.fromEntries(['unsearched','searched'].map(state=>[state,{...p[state],src:'assets/dungeon/street-thug-boss-room-v1/'+p[state].src}]))}));
await Promise.all([...props,...additions,...woodAdditions,boss,mat,rack,fan].map(p=>load(p.src)).concat(loot.flatMap(p=>[load(p.unsearched.src),load(p.searched.src)]),[load(manifest.reuse.floor),load(manifest.reuse.wall),load(livedIn.reuse.timberFloor),load('assets/dungeon/modules-v1/material-atlas-v1.png')]));
const bossShadow=TileRendererV2.makeGroundShadow(images.get(boss.src),boss,[23,7]);
function surface(c,w,h){c.imageSmoothingQuality='high';c.fillStyle=light?'#eee8d9':'#263329';c.fillRect(0,0,w,h);c.fillStyle=light?'#e0d9c9':'#2b392e';for(let y=0;y<h;y+=20)for(let x=0;x<w;x+=20)if((x/20+y/20)%2===0)c.fillRect(x,y,20,20);}
function imageFit(c,p,x,y,w,h){const b=p.crop||[0,0,images.get(p.src).width,images.get(p.src).height],s=Math.min(w/b[2],h/b[3]);c.drawImage(images.get(p.src),...b,x+(w-b[2]*s)/2,y+(h-b[3]*s)/2,b[2]*s,b[3]*s);}
function label(c,text,x,y,size=13){c.font=`${size}px Microsoft YaHei,sans-serif`;c.textAlign='center';c.fillStyle=light?'#514e3c':'#dad6c4';c.fillText(text,x,y);}
function polygon(c,q,fill,stroke){c.beginPath();q.forEach((p,i)=>c[i?'lineTo':'moveTo'](...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function groundGuide(c,x,y){if(!guides)return;c.save();c.translate(x,y);c.strokeStyle=light?'#6b784fb0':'#c8d79b99';c.lineWidth=1;c.setLineDash([3,3]);c.beginPath();c.moveTo(-85,-85*Math.SQRT1_2);c.lineTo(85,85*Math.SQRT1_2);c.moveTo(-85,85*Math.SQRT1_2);c.lineTo(85,-85*Math.SQRT1_2);c.stroke();c.restore();}
function sprite(c,p,x,y,{flip=false,shadow=true}={}){const b=p.crop,f=p.width/b[2],a=p.anchor||[b[0]+b[2]/2,b[1]+b[3]];if(p.groundSlopes)groundGuide(c,x,y);c.save();c.translate(x,y);if(flip)c.scale(-1,1);if(shadow&&p.id==='boss')c.drawImage(bossShadow,-64,-40,160,88);else if(shadow){c.save();c.scale(p.width*.38,p.width*.13);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#101a1455');g.addColorStop(1,'#101a1400');c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();}if(aligned&&p.groundSlopes)c.transform(...groundRegistration(p.groundSlopes));c.drawImage(images.get(p.src),...b,(b[0]-a[0])*f,(b[1]-a[1])*f,b[2]*f,b[3]*f);c.restore();}
function container(c,p,x,y,{state=searched?'searched':'unsearched',zoom=1,shadow=true,align=aligned}={}){
 const a=p[state],b=a.crop,f=p.width/a.bodyWidth;
 if(shadow)groundGuide(c,x,y);c.save();c.translate(x,y);c.scale(zoom,zoom);
 if(shadow){c.save();c.scale(p.width*.4,p.width*.14);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#101a1470');g.addColorStop(1,'#101a1400');c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();}
 if(align)c.transform(...groundRegistration(a.groundSlopes));c.drawImage(images.get(a.src),...b,(b[0]-a.anchor[0])*f,(b[1]-a.anchor[1])*f,b[2]*f,b[3]*f);c.restore();
}
function containerGallery(){
 const holder=document.querySelector('#containers');holder.replaceChildren();
 for(const p of loot){
  const article=document.createElement('article');article.className='card';
  const cv=document.createElement('canvas');cv.width=1040;cv.height=450;cv.setAttribute('aria-label',p.name+'，左侧未搜，右侧搜空');
  const c=cv.getContext('2d');surface(c,1040,450);
  ['unsearched','searched'].forEach((state,i)=>{container(c,p,260+520*i,330,{state,zoom:4.5,shadow:false,align:false});label(c,i?'搜空':'未搜',260+520*i,420,26);});
  const caption=document.createElement('div');caption.className='caption';const h=document.createElement('h2');h.textContent=p.name;const t=document.createElement('p');t.textContent=p.detail;caption.append(h,t);article.append(cv,caption);holder.append(article);
 }
}
function gallery(){const holder=document.querySelector('#cards');holder.replaceChildren();for(const p of additions){const article=document.createElement('article');article.className='card';const cv=document.createElement('canvas');cv.width=520;cv.height=400;cv.setAttribute('aria-label',p.name+'素材原图');const c=cv.getContext('2d');surface(c,520,400);imageFit(c,p,24,20,472,360);const caption=document.createElement('div');caption.className='caption';const h=document.createElement('h2');h.textContent=p.name;const t=document.createElement('p');t.textContent=p.detail;caption.append(h,t);article.append(cv,caption);holder.append(article);}}
function reuseGallery(){const el=document.querySelector('#reuse');el.replaceChildren();for(const p of [mat,fan,boss]){const article=document.createElement('article'),cv=document.createElement('canvas');cv.width=330;cv.height=240;const c=cv.getContext('2d');surface(c,330,240);imageFit(c,p,20,16,290,208);const caption=document.createElement('p');caption.textContent=p.name;article.append(cv,caption);el.append(article);}}
function containerScaleRow(){const c=document.querySelector('#container-scale').getContext('2d');surface(c,1100,200);const xs=[100,320,530,750,960];xs.forEach(x=>polygon(c,[[x,84],[x+72,135],[x,186],[x-72,135]],light?'#d6d0b9':'#344233','#88916b80'));sprite(c,boss,xs[0],135);label(c,'头目 · 原尺寸',xs[0],28);for(let i=0;i<4;i++){const p=loot[i<2?0:1],state=i%2?'searched':'unsearched',x=xs[i+1];container(c,p,x,135,{state});label(c,p.name+' · '+(i%2?'搜空':'未搜'),x,28);label(c,'箱身／筐身基准宽 '+p.width+'px',x,49,11);}}
function scaleRow(){const cv=document.querySelector('#scale'),c=cv.getContext('2d');surface(c,1100,530);const xs=[180,550,920],items=[boss,...additions];items.forEach((p,i)=>{const x=xs[i%3],top=Math.floor(i/3)*265,y=top+205;polygon(c,[[x,y-51],[x+72,y],[x,y+51],[x-72,y]],light?'#d6d0b9':'#344233','#88916b80');sprite(c,p,x,y);label(c,p.name,x,top+28);label(c,p.id==='boss'?'头目原尺寸':`组合宽${p.width}px`,x,top+49,11);});document.querySelector('#export-scale').href=cv.toDataURL('image/png');}
const P=(x,y,z=0)=>[680+(x-y)*72,130+(x+y)*144/Math.SQRT2/2-z];
function tileQuad(x,y){return[P(x-.5,y-.5),P(x+.5,y-.5),P(x+.5,y+.5),P(x-.5,y+.5)];}
function texture(c,im,q,sx,sy,sw,sh){c.save();polygon(c,q);c.clip();c.transform(q[1][0]-q[0][0],q[1][1]-q[0][1],q[3][0]-q[0][0],q[3][1]-q[0][1],q[0][0],q[0][1]);c.drawImage(im,sx,sy,sw,sh,0,0,1,1);c.restore();}
function oldRoom(){const c=document.querySelector('#scene').getContext('2d');c.imageSmoothingQuality='high';c.clearRect(0,0,1360,1150);c.fillStyle=light?'#d6d0bf':'#202a23';c.fillRect(0,0,1360,1150);const floor=images.get(manifest.reuse.floor),wall=images.get(manifest.reuse.wall);for(let y=0;y<9;y++)for(let x=0;x<9;x++){const q=tileQuad(x,y),u=x%4/4,v=y%4/4;texture(c,floor,q,u*floor.width,v*floor.height,floor.width/4,floor.height/4);polygon(c,q,'#17231c24',guides?'#efdf9b60':'#ffffff0c');}
 function wallStrip(a,b,height){const A=P(...a),B=P(...b),q=[[A[0],A[1]-height],[B[0],B[1]-height],B,A];texture(c,wall,q,0,0,wall.width,wall.height);polygon(c,q,null,'#565a43');}
 wallStrip([-.5,-.5],[8.5,-.5],62);wallStrip([-.5,-.5],[-.5,8.5],62);
 // Thin foreground walls keep the assembled props readable in this art view.
 wallStrip([8.5,-.5],[8.5,8.5],15);wallStrip([-.5,8.5],[3.5,8.5],15);wallStrip([4.5,8.5],[8.5,8.5],15);
 sprite(c,mat,...P(3.6,.5),{shadow:false});
 const objects=[{p:props[1],x:4,y:0},{p:props[0],x:3.5,y:1},{p:boss,x:4,y:2},{loot:loot[0],x:1,y:1},{loot:loot[1],x:7,y:1},{p:props[2],x:0,y:3.5,flip:true},{p:rack,x:8,y:3},{p:rack,x:8,y:4}];
 objects.sort((a,b)=>(a.x+a.y)-(b.x+b.y));for(const o of objects){const pos=P(o.x,o.y);if(o.loot)container(c,o.loot,...pos);else sprite(c,o.p,...pos,{flip:o.flip});}
 wallStrip([2.5,8.5],[3.5,8.5],62);
 const atlas=images.get('assets/dungeon/modules-v1/material-atlas-v1.png'),door=[P(3.5,8.5,60),P(4.5,8.5,60),P(4.5,8.5),P(3.5,8.5)];texture(c,atlas,door,atlas.width*2/3,atlas.height/2,atlas.width/3,atlas.height/2);polygon(c,door,null,'#393d30');
 const a=P(3.05,8.5,42),b=P(3.4,8.5,42),cc=P(3.4,8.5,26),d=P(3.05,8.5,26),mark=props[3];texture(c,images.get(mark.src),[a,b,cc,d],...mark.crop);
 const entry=P(4,9);label(c,'入口 · 可退出',...entry,17);label(c,aligned?'已按地砖方向校准家具与容器；原素材大图保持原样':'对照：仅缩放原图，未做地面方向校准',680,1108,15);
}
function room(){if(layout===2)oldRoom();else{const c=document.querySelector('#scene').getContext('2d');c.imageSmoothingQuality='high';drawLivedInRoom({c,images,manifest,props,additions:layout===0?additions:woodAdditions,modernRoom:layout===0,fan,boss,mat,rack,loot,light,guides,sprite,container,polygon,texture,label});}document.querySelector('#export-scene').href=document.querySelector('#scene').toDataURL('image/png');}
function draw(){containerGallery();containerScaleRow();gallery();reuseGallery();scaleRow();room();}
document.querySelector('#background').onclick=()=>{light=!light;document.documentElement.classList.toggle('light',light);document.querySelector('#background').textContent=light?'切换深色底':'切换浅色底';draw();};
document.querySelector('#searched').onclick=()=>{searched=!searched;document.querySelector('#searched').textContent=searched?'容器：已搜':'容器：未搜';draw();};
document.querySelector('#alignment').onclick=()=>{aligned=!aligned;document.querySelector('#alignment').textContent=aligned?'摆放：已对齐':'摆放：原始方向';draw();};
document.querySelector('#guides').onclick=()=>{guides=!guides;document.querySelector('#guides').textContent=guides?'隐藏地面参考线':'显示地面参考线';draw();};
document.querySelector('#layout').onclick=()=>{layout=(layout+1)%3;document.querySelector('#layout').textContent=['当前：旧厂房据点 · 对比前版','对照：木家具版 · 查看更早版','对照：旧仓库版 · 返回新版'][layout];document.querySelector('#room-title').textContent=['新版 · 被占用的旧厂房值班室','前版对照 · 木家具生活区','早期对照 · 分散摆放的仓库'][layout];room();};
draw();document.querySelector('#status').textContent='旧厂房据点已载入：五组新家具、原头目与两种专属容器。独立美术预览，尚未接入正式房间生成。';

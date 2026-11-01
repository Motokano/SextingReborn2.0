const base='assets/map/isometric/hideout-facilities-v2/';
const image=async src=>{const i=new Image();i.src=src;await i.decode();return i;};
const manifest=await fetch(base+'manifest.json').then(r=>r.json()),pm=await fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),state=pm.states[0];
const player=await image('assets/map/isometric/player-atlas-v1/'+state.file),assets=await Promise.all(manifest.assets.map(async a=>({...a,image:await image(a.file)})));
const bench=await fetch('assets/map/isometric/manufacturing-bench-v1/manifest.json').then(r=>r.json());
const bm=bench.assets.find(a=>a.id==='unrepaired'),bi=await image('assets/map/isometric/manufacturing-bench-v1/'+bm.file);
const keys=['stove','pharmacy','forging','sewing','toolbench','warehouse','bathroom','barrel','farm','ranch','bed','manufacturing'];
const ctx=document.querySelector('canvas').getContext('2d');let grid=true,contacts=false;
function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...p));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function tile(x,y){poly([[x,y-50.9117],[x+72,y],[x,y+50.9117],[x-72,y]],'#445c48',grid?'#82977a90':null);}
function pawn(x,y){const [bx,by,bw,bh]=state.crop,[ax,ay]=[bx+state.anchor[0],by+state.anchor[1]],f=pm.displayBaseWidth/state.baseWidth*1.25;ctx.drawImage(player,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);}
function sprite(a,x,y){const f=a.scaleAt144,[bx,by,bw,bh]=a.crop,[ax,ay]=a.anchor;
 if(a.offset){x+=(a.offset[0]-a.offset[1])*72;y+=(a.offset[0]+a.offset[1])*72/Math.SQRT2;}
 const points=(a.groundContacts||a.contacts).map(([u,v])=>[x+(u-ax)*f+4,y+(v-ay)*f+2]);poly(points,a.openFootprint?null:'#09130d2e',a.openFootprint?'#09130d55':null);
 ctx.drawImage(a.image,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);
 if(contacts){for(const [u,v]of(a.groundContacts||a.contacts)){ctx.beginPath();ctx.arc(x+(u-ax)*f,y+(v-ay)*f,2,0,Math.PI*2);ctx.fillStyle='#f0b954';ctx.fill();}}
}
function render(){ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,1140,1280);keys.forEach((key,n)=>{const x=n%3*380,y=Math.floor(n/3)*320;ctx.fillStyle='#2c4032';ctx.fillRect(x+5,y+5,370,310);const group=assets.filter(a=>a.key===key);ctx.fillStyle='#f0dfbf';ctx.font='bold 16px Microsoft YaHei';ctx.textAlign='left';ctx.fillText(key==='manufacturing'?'制作台 · 沿用已确认破损版':group[0].label,x+18,y+33);
 const shown=key==='manufacturing'?[{...bm,image:bi}]:group.sort((a,b)=>a.state==='damaged'?-1:b.state==='damaged'?1:0);
 shown.forEach((a,j)=>{const ox=x+(shown.length===1?190:96+j*182),oy=y+208;tile(ox,oy);if(key==='bed')tile(ox+72,oy-50.91);sprite(a,ox,oy);ctx.font='12px Microsoft YaHei';ctx.fillStyle='#c2cfba';ctx.textAlign='center';ctx.fillText(key==='manufacturing'?'未修复':a.state==='damaged'?'修复／装配前':'完成后',ox,y+68);});pawn(x+184,y+290);
 });window.reviewReady=true;}
document.querySelector('#grid').onclick=e=>{grid=!grid;e.target.textContent=grid?'隐藏格线':'显示格线';render();};document.querySelector('#contacts').onclick=e=>{contacts=!contacts;e.target.textContent=contacts?'隐藏接地点':'显示接地点';render();};document.querySelector('#status').textContent='';render();

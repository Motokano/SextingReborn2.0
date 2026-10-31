const base='assets/map/isometric/manufacturing-bench-v1/';
const loadImage=async src=>{const i=new Image();i.src=src;await i.decode();return i;};
const [manifest,pm]=await Promise.all([fetch(base+'manifest.json').then(r=>r.json()),fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json())]);
const state=pm.states[0],player=await loadImage('assets/map/isometric/player-atlas-v1/'+state.file);
const assets=await Promise.all(manifest.assets.map(async a=>({...a,image:await loadImage(base+a.file)})));
const canvas=document.querySelector('#board'),ctx=canvas.getContext('2d');
const projection=MapProjection.create({width:7,height:3},144/Math.SQRT2,'isometric');
const versionSelect=document.querySelector('#level');
let grid=true,wall=false,contacts=false,version=new URLSearchParams(location.search).get('view')||'repair';
if(![...versionSelect.options].some(o=>o.value===version))version='repair';
versionSelect.value=version;
const pos=(x,y)=>{const p=projection.cellCenter(x,y);return {x:p.x+180,y:p.y-45};};
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function drawPawn(x,y){const p=pos(x,y),[bx,by,bw,bh]=state.crop,[ax,ay]=[bx+state.anchor[0],by+state.anchor[1]],f=pm.displayBaseWidth/state.baseWidth*1.25;ctx.drawImage(player,bx,by,bw,bh,p.x+(bx-ax)*f,p.y+(by-ay)*f,bw*f,bh*f);}
function bench(a,x,y){const p=pos(x,y),f=a.scaleAt144,[ax,ay]=a.anchor,[bx,by,bw,bh]=a.crop;
 const foot=[[-.45,-.275],[.45,-.275],[.45,.275],[-.45,.275]].map(([u,v])=>pos(x+u,y+v));polygon(foot.map(q=>({x:q.x+5,y:q.y+3})),'#08130e60');
 ctx.drawImage(a.image,bx,by,bw,bh,p.x+(bx-ax)*f,p.y+(by-ay)*f,bw*f,bh*f);
 if(contacts){ctx.fillStyle='#f3b65f';for(const [cx,cy]of a.contacts){ctx.beginPath();ctx.arc(p.x+(cx-ax)*f,p.y+(cy-ay)*f,2.3,0,Math.PI*2);ctx.fill();}ctx.strokeStyle='#8fd1b9';ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+5,p.y);ctx.moveTo(p.x,p.y-5);ctx.lineTo(p.x,p.y+5);ctx.stroke();}
 ctx.fillStyle='#f0dcae';ctx.font='14px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(a.name,p.x+40,p.y-102);
}
function render(){ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,1120,560);
 for(let y=0;y<3;y++)for(let x=0;x<7;x++){const q=projection.cellPolygon(x,y).map(p=>({x:p.x+180,y:p.y-45}));polygon(q,(x+y)%2?'#415448':'#45594c',grid?'#83967c60':null);}
 if(wall){const a=pos(-.5,-.5),b=pos(6.5,-.5);polygon([{x:a.x,y:a.y-45},{x:b.x,y:b.y-45},b,a],'#677563','#263b30');ctx.strokeStyle='#8b9782';ctx.beginPath();ctx.moveTo(a.x,a.y-22);ctx.lineTo(b.x,b.y-22);ctx.stroke();}
 const shown=assets.filter(a=>version==='repair'?(a.id==='unrepaired'||a.level===1):version==='all'?a.level!==null:version==='unrepaired'?a.id==='unrepaired':a.level===Number(version));
 const objects=[];shown.forEach((a,i)=>{const x=3-(shown.length-1)+i*2,y=wall?0:1;objects.push({z:x+y,draw:()=>bench(a,x,y)});objects.push({z:x+y+1,draw:()=>drawPawn(x,y+1)});});
 objects.sort((a,b)=>a.z-b.z).forEach(o=>o.draw());
 ctx.textAlign='left';ctx.fillStyle='#b6c4ad';ctx.font='12px Microsoft YaHei';ctx.fillText(version==='repair'?'未修复 → 基础':version==='all'?'基础 → 加固 → 精密':'',36,32);
}
for(const [id,set]of [['grid',v=>grid=v],['wall',v=>wall=v],['contacts',v=>contacts=v]])document.querySelector('#'+id).onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));set(on);render();};
versionSelect.onchange=e=>{version=e.target.value;render();};
document.querySelector('#large-toggle').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));document.querySelector('#large').classList.toggle('show',on);};
document.querySelector('#large').innerHTML=assets.map(a=>`<figure><a href="${base+a.file}" target="_blank"><img src="${base+a.file}" alt="${a.name}透明原图"></a><figcaption>${a.name}</figcaption></figure>`).join('');
render();
for(const control of document.querySelectorAll('button,select'))control.disabled=false;

const loadImage=async src=>{const img=new Image();img.src=src;await img.decode();return img;};
const manifest=await fetch('assets/map/isometric/farm-ranch-5x5-v1/manifest.json').then(r=>r.json());
const pm=await fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),ps=pm.states[0];
const player=await loadImage('assets/map/isometric/player-atlas-v1/'+ps.file);
const assets=await Promise.all(manifest.assets.map(async a=>({...a,image:await loadImage(a.file)})));
for(const a of assets){const mask=document.createElement('canvas');mask.width=a.image.width;mask.height=a.image.height;const m=mask.getContext('2d');m.drawImage(a.image,0,0);m.globalCompositeOperation='source-in';m.fillStyle='#111a13';m.fillRect(0,0,mask.width,mask.height);a.shadow=mask;}
let grid=true,wall=false,contacts=false;
const p=(x,y,z=0)=>[490+(x-y)*72,490+(x+y)*72/Math.SQRT2-z];
function polygon(c,points,fill,stroke,width=1){c.beginPath();points.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function render(){for(const a of assets){
 const c=document.getElementById(a.id).getContext('2d');c.setTransform(2,0,0,2,0,0);c.fillStyle='#283a2f';c.fillRect(0,0,980,860);
 c.fillStyle='#e8d7b5';c.font='bold 22px Microsoft YaHei';c.fillText(a.label,32,43);c.font='14px Microsoft YaHei';c.fillStyle='#a4b89d';c.fillText('5 × 5',32,68);
 for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){const inside=Math.abs(x)<=2&&Math.abs(y)<=2;polygon(c,[[x-.5,y-.5],[x+.5,y-.5],[x+.5,y+.5],[x-.5,y+.5]].map(q=>p(...q)),inside?'#58634a':'#3c4c3a',grid?'#b6c19645':null);}
 if(wall){for(const v of [[[-2.7,-2.7],[-2.7,2.7]],[[-2.7,-2.7],[2.7,-2.7]]]){const [u,w]=v;polygon(c,[p(...u),p(...w),p(...w,85),p(...u,85)],'#66705b','#87947b');}}
 const corners=[[-2.5,-2.5],[2.5,-2.5],[2.5,2.5],[-2.5,2.5]].map(q=>p(...q));polygon(c,corners,null,'#cdb47d',2);
 const [ax,ay]=a.anchor,f=a.scaleAt144,[gx,gy]=p(0,0);
 // This shadow is a preview layer; generated PNG bytes are never modified.
 c.save();c.globalAlpha=.22;c.filter='blur(2px)';c.translate(gx+6,gy+4);c.scale(1,.22);c.drawImage(a.shadow,-ax*f,-ay*f,a.image.width*f,a.image.height*f);c.restore();
 c.drawImage(a.image,gx-ax*f,gy-ay*f,a.image.width*f,a.image.height*f);
 if(contacts)for(const [x,y]of a.groundContacts){c.beginPath();c.arc(gx+(x-ax)*f,gy+(y-ay)*f,3,0,Math.PI*2);c.fillStyle='#ffd06d';c.fill();}
 const [px,py]=p(.5,3),[bx,by,bw,bh]=ps.crop,scale=pm.displayBaseWidth/ps.baseWidth*1.25;
 c.fillStyle='#17201860';c.beginPath();c.ellipse(px+9,py+4,34,10,0,0,Math.PI*2);c.fill();
 c.drawImage(player,bx,by,bw,bh,px-ps.anchor[0]*scale,py-ps.anchor[1]*scale,bw*scale,bh*scale);
 }window.reviewReady=true;}
document.getElementById('grid').onclick=e=>{grid=!grid;e.target.textContent=grid?'隐藏格线':'显示格线';render();};
document.getElementById('wall').onclick=e=>{wall=!wall;e.target.textContent=wall?'隐藏墙边':'显示墙边';render();};
document.getElementById('contacts').onclick=e=>{contacts=!contacts;e.target.textContent=contacts?'隐藏接地点':'显示接地点';render();};
render();

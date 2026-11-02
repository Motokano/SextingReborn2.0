/* SPDX-License-Identifier: GPL-3.0-only */
function createRuinsMinimap(options){
 'use strict';
 const {getSim}=options;
 const E=RuinsEncounter,M=RuinsExploration,root=document.getElementById('minimap'),canvas=document.getElementById('minimap-canvas'),ctx=canvas.getContext('2d');
 let scale=7,center=null,following=true,lastIdentity=null,drag=null;
 const bright=['#b3bba0','#7e8f78','#9da58d','#dbcfad','#8e9a7d','#be9769','#c4b785'];
 const remembered=['#536051','#39483d','#495749','#857e65','#454f3f','#756448','#81775a'];
 const project=k=>E.project(k%getSim().map.width,Math.floor(k/getSim().map.width));
 function draw(){
  const s=getSim();if(!s)return;
  const data=M.view(s),id=s.exploration.identity;
  if(id!==lastIdentity){following=true;scale=7;lastIdentity=id;}
  if(following||!center)center=project(s.player.cell);
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
  if(!w||!h)return;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#14221c';ctx.fillRect(0,0,w,h);ctx.lineJoin='round';ctx.lineCap='round';
  const screen=k=>{const p=project(k);return{x:w/2+(p.x-center.x)*scale,y:h/2+(p.y-center.y)*scale};};
  const diamond=(p,r=1)=>{ctx.beginPath();ctx.moveTo(p.x,p.y-scale*.5*r);ctx.lineTo(p.x+scale/Math.SQRT2*r,p.y);ctx.lineTo(p.x,p.y+scale*.5*r);ctx.lineTo(p.x-scale/Math.SQRT2*r,p.y);ctx.closePath();};
  for(const c of data.cells){const p=screen(c.cell);if(p.x< -scale||p.x>w+scale||p.y< -scale||p.y>h+scale)continue;ctx.fillStyle=(c.current?bright:remembered)[c.type];diamond(p,1.015);ctx.fill();}
  for(const c of data.cells.filter(c=>c.gate)){
   const p=screen(c.cell),axis=E.project(-c.gate.dy,c.gate.dx),length=scale*.46;
   ctx.strokeStyle=c.current?'#f3d7a1':'#b3a07a';ctx.lineWidth=Math.max(1.1,scale*.15);ctx.beginPath();
   const line=(a,b)=>{ctx.moveTo(p.x+axis.x*length*a,p.y+axis.y*length*a);ctx.lineTo(p.x+axis.x*length*b,p.y+axis.y*length*b);};
   if(c.type===5)line(-1,1);else{line(-1,-.55);line(.55,1);}ctx.stroke();
  }
  for(const p of data.marks){const at=screen(p.cell);if(at.x<5||at.x>w-5||at.y<5||at.y>h-5)continue;
   ctx.save();ctx.translate(at.x,at.y);ctx.globalAlpha=(p.current?1:.68)*(p.state==='spent'?.45:p.state==='opened'?.7:1);ctx.lineWidth=1.35;
   ctx.strokeStyle=p.kind==='exit'?'#f3cd83':p.kind==='entry'?'#cee3ad':p.kind==='water'?'#b6dcdb':p.kind==='food'?'#efca8f':'#d3ddbb';ctx.fillStyle='#1c2b22';ctx.beginPath();ctx.arc(0,0,5.5,0,Math.PI*2);ctx.fill();ctx.beginPath();
   if(p.kind==='entry'||p.kind==='exit'){ctx.rect(-3,-4,6,8);ctx.moveTo(-1,0);ctx.lineTo(5,0);ctx.lineTo(3,-2);ctx.moveTo(5,0);ctx.lineTo(3,2);}
   else if(p.kind==='loot'){ctx.rect(-3.5,-2.5,7,5);ctx.moveTo(-3.5,-.5);ctx.lineTo(3.5,-.5);ctx.moveTo(0,-.5);ctx.lineTo(0,1);}
   else if(p.kind==='water'){ctx.moveTo(0,-4);ctx.quadraticCurveTo(6,3,0,4);ctx.quadraticCurveTo(-6,3,0,-4);}
   else if(p.kind==='food'){ctx.arc(0,0,4,0,Math.PI);ctx.moveTo(-4,0);ctx.lineTo(4,0);ctx.moveTo(0,-1);ctx.lineTo(0,-4);}
   else if(p.kind==='medical'){ctx.moveTo(0,-4);ctx.lineTo(0,4);ctx.moveTo(-4,0);ctx.lineTo(4,0);}
   else if(p.kind==='rest'){ctx.moveTo(-4,-4);ctx.lineTo(-4,4);ctx.moveTo(-4,1);ctx.lineTo(4,1);ctx.lineTo(4,4);ctx.moveTo(-2,-1);ctx.lineTo(4,-1);}
   else if(p.kind==='insight'){ctx.moveTo(0,-4);ctx.lineTo(1.3,-1.3);ctx.lineTo(4,0);ctx.lineTo(1.3,1.3);ctx.lineTo(0,4);ctx.lineTo(-1.3,1.3);ctx.lineTo(-4,0);ctx.lineTo(-1.3,-1.3);ctx.closePath();}
   else if(p.kind==='mine'){ctx.moveTo(0,-4);ctx.lineTo(4,0);ctx.lineTo(0,4);ctx.lineTo(-4,0);ctx.closePath();}
   else if(p.kind==='wood'){ctx.moveTo(0,-4);ctx.lineTo(4,2);ctx.lineTo(-4,2);ctx.closePath();ctx.moveTo(0,2);ctx.lineTo(0,4);}
   else{ctx.ellipse(0,0,2.4,4,.6,0,Math.PI*2);ctx.moveTo(-2,3);ctx.lineTo(2,-3);}
   ctx.stroke();ctx.restore();
  }
  for(const e of data.enemies){const p=screen(e.cell);ctx.fillStyle='#f0a08b';ctx.strokeStyle='#26372b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.stroke();}
  const player=screen(s.player.cell),[dx,dy]=E.dirs[s.player.facing],vector=E.project(dx,dy),angle=Math.atan2(vector.y,vector.x);
  ctx.save();ctx.translate(player.x,player.y);ctx.rotate(angle);ctx.fillStyle='#fff1bd';ctx.strokeStyle='#27392c';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-5,-4.5);ctx.lineTo(-2,0);ctx.lineTo(-5,4.5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  // Compass follows the scene's C / 45 degree projection, not the actor's facing.
  ctx.strokeStyle='#a6b498';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(16,27);ctx.lineTo(29,18);ctx.lineTo(25,18);ctx.moveTo(29,18);ctx.lineTo(28,22);ctx.stroke();ctx.font='9px Georgia';ctx.fillStyle='#a6b498';ctx.fillText('N',31,17);
  canvas.setAttribute('aria-label','小地图，已记录 '+data.known+' 格，当前可见 '+data.visible.size+' 格');
  root.dataset.known=data.known;root.dataset.visible=data.visible.size;root.dataset.remembered=data.known-data.visible.size;root.dataset.marks=data.marks.length;root.dataset.enemies=data.enemies.length;
  document.getElementById('minimap-follow').setAttribute('aria-pressed',String(following));
 }
 function zoom(factor){scale=Math.max(1.4,Math.min(15,scale*factor));draw();}
 document.getElementById('minimap-in').onclick=()=>zoom(1.3);
 document.getElementById('minimap-out').onclick=()=>zoom(1/1.3);
 document.getElementById('minimap-follow').onclick=()=>{following=true;draw();};
 document.getElementById('minimap-fit').onclick=()=>{
  const s=getSim();if(!s)return;const points=M.view(s).cells.map(c=>project(c.cell));points.push(project(s.player.cell));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  center={x:(minX+maxX)/2,y:(minY+maxY)/2};following=false;scale=Math.min(12,(canvas.clientWidth-38)/(maxX-minX+2),(canvas.clientHeight-38)/(maxY-minY+2));draw();
 };
 canvas.onpointerdown=e=>{if(!center)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,center:{...center}};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;following=false;center={x:drag.center.x-(e.clientX-drag.x)/scale,y:drag.center.y-(e.clientY-drag.y)/scale};draw();};
 canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.15:1/1.15);},{passive:false});
 new ResizeObserver(draw).observe(root);
 return{draw};
}

/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
// Original canvas silhouettes; drawn in cell-local coordinates, no remote assets.
function draw(ctx,node,x,y,s,highlight=false){
 if(globalThis.RuinsResourcePawns?.draw(ctx,node,x,y,s,highlight))return;
 ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.lineCap='round';ctx.lineJoin='round';
 const line=(points,color,width=.045)=>{ctx.beginPath();points.forEach(([a,b],i)=>ctx[i?'lineTo':'moveTo'](a,b));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
 const ellipse=(a,b,rx,ry,color,rotation=0)=>{ctx.beginPath();ctx.ellipse(a,b,rx,ry,rotation,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
 const polygon=(points,fill,stroke)=>{ctx.beginPath();points.forEach(([a,b],i)=>ctx[i?'lineTo':'moveTo'](a,b));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.035;ctx.stroke();}};
 ellipse(0,.24,.42,.16,'#14251b80');
 if(highlight){ellipse(0,.08,.49,.43,'#f1dfa536');ctx.strokeStyle='#eed69a';ctx.lineWidth=.035;ctx.stroke();}
 if(node.used){
  // Exhausted objects retain their footprint; no display base is added.
  if(node.shape==='tree'){
   polygon([[-.18,.25],[-.15,-.12],[.14,-.12],[.2,.26]],'#806344','#bc9b69');
   ellipse(0,-.12,.16,.07,'#d4bb8b');ellipse(0,-.12,.09,.035,'#9c7c50');
   for(const side of [-1,1])line([[side*.11,.2],[side*.29,.3]],'#96734d',.055);
  }else if(node.shape==='bamboo'){
   for(const a of[-.22,0,.22]){line([[a,.23],[a,-.02-(a===0?.1:0)]],'#849267',.085);ellipse(a,-.02-(a===0?.1:0),.045,.024,'#c6c89a');}
  }else if(['ore','salt','clay'].includes(node.shape)){
   polygon([[-.43,.2],[-.26,.01],[.03,-.07],[.37,.06],[.43,.28],[.05,.35]],'#606459','#8e9381');
   polygon([[-.24,.13],[-.06,.03],[.24,.1],[.12,.26],[-.1,.27]],'#3e4942');
   line([[-.24,.13],[-.3,.28]],'#b3ad91',.028);line([[.23,.1],[.33,.26]],'#9b9b84',.028);
  }else if(['logs','shrub'].includes(node.shape)){
   for(const [a,b]of[[-.25,.22],[.05,.08],[.2,.2]])line([[a-.09,b+.08],[a+.1,b-.08]],'#958768',.038);
   line([[-.1,.26],[-.03,-.12],[.14,-.2]],'#82755b',.05);
  }else{
   for(const a of[-.24,0,.24]){line([[a,.27],[a-.025,-.02]],'#8c9672',.038);line([[a,.14],[a+.1,.06]],'#7e8d69',.035);}
   for(const [a,b]of[[-.28,.2],[.22,.25],[0,.32]])ellipse(a,b,.08,.028,'#78805e',a);
  }
  ctx.restore();return;
 }
 const accent=node.id==='copper'?'#d49c69':node.id==='iron'?'#adc1c4':'#cbd1bf';
 if(['ore','salt','clay'].includes(node.shape)){
  const salt=node.shape==='salt',clay=node.shape==='clay',base=clay?'#a48462':salt?'#c7c7a9':'#71858a';
  polygon([[-.43,.18],[-.32,-.12],[-.13,-.28],[.04,-.13],[.23,-.27],[.43,-.01],[.36,.26],[-.1,.36]],base,'#d4d0ae');
  polygon([[-.32,-.12],[-.13,-.28],[.04,-.13],[-.04,.14]],clay?'#c2a080':'#b2bcb2');
  polygon([[.04,-.13],[.23,-.27],[.43,-.01],[.16,.1]],salt?'#e8e5ce':'#8e9f9b');
  line([[-.04,.14],[-.1,.36]],'#425452',.025);line([[.16,.1],[.36,.26]],'#425452',.025);
  // Small pieces remain inside this single node's footprint.
  polygon([[-.46,.25],[-.36,.17],[-.26,.26],[-.3,.36]],clay?'#be9974':'#99aaa5');
  polygon([[.22,.31],[.34,.21],[.45,.31],[.4,.4]],clay?'#98744f':'#7b9394');
  if(!clay){line([[-.27,.07],[-.14,.02],[-.09,.1],[.02,.02]],accent,.065);line([[.17,-.11],[.26,-.04],[.19,.02]],accent,.06);}
 }else if(node.shape==='tree'){
  line([[0,.27],[0,-.42]],'#483a2a',.14);line([[0,.26],[0,-.42]],node.id==='birch'?'#d5c9a5':'#b48c58',.075);
  line([[0,-.08],[-.2,-.23]],'#c3a06c',.05);
  for(const [a,b,r,c]of[[-.2,-.2,.27,'#405c41'],[.2,-.21,.27,'#4d6947'],[0,-.4,.3,'#648052'],[.02,-.2,.34,'#718952']])ellipse(a,b,r,r*.8,c);
  line([[-.15,-.47],[0,-.56],[.14,-.48]],'#bacb86',.03);line([[-.27,-.25],[-.13,-.33]],'#9eb674',.035);
 }else if(node.shape==='bamboo'){
  for(const a of[-.22,0,.22]){line([[a,.22],[a-.04,-.63]],'#a8b77b',.085);for(const b of[-.45,-.15,.12])line([[a-.045,b],[a+.03,b]],'#425e3c',.035);}
  for(const [a,b,d]of[[-.2,-.42,-1],[0,-.55,1],[.2,-.28,1],[-.18,-.12,-1]])ellipse(a+d*.13,b-.05,.19,.045,'#83a567',d*.45);
 }else if(node.shape==='logs'||node.shape==='shrub'){
  for(const [a,b,d]of[[-.2,.02,.35],[0,-.03,-.3],[.13,.13,.35]]){ctx.save();ctx.translate(a,b);ctx.rotate(d);polygon([[-.32,-.07],[.3,-.07],[.33,.07],[-.3,.09]],'#99774e','#d0b383');ellipse(.3,0,.08,.08,'#d8bd8c');ellipse(.3,0,.035,.035,'#84603b');ctx.restore();}
  if(node.shape==='shrub')line([[-.25,.2],[-.05,-.35],[.25,-.48]],'#c3ab78',.045);
 }else if(node.shape==='mushroom'){
  for(const [a,b,r]of[[-.24,.06,.16],[.12,-.1,.22],[.25,.22,.12]]){line([[a,b+.18],[a,b]],'#d8cc9f',.075);ctx.beginPath();ctx.ellipse(a,b,r,r*.62,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fillStyle=node.id==='floral'?'#bb9977':'#b39965';ctx.fill();line([[a-r*.6,b-.025],[a+r*.6,b-.025]],'#e6cf9b',.025);}
 }else{
  // Several shoots form ONE harvestable clump, contained within its one cell.
  ellipse(0,.16,.43,.22,'#395232');
  for(const [cx,cy,scale]of[[-.22,.13,.65],[.22,.08,.72],[0,-.04,1]]){
   ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);
   line([[0,.26],[0,-.36]],'#c1c98e',.035);
   for(const [a,b,rot]of[[-.17,.03,-.55],[.17,-.04,.5],[-.13,-.21,-.65],[.13,-.3,.6]])ellipse(a,b,.2,.085,'#819d5a',rot);
   ctx.restore();
  }
  if(node.shape==='berries'){const color=node.id==='purple'?'#bb9db8':node.id==='yellow'?'#e1ba6f':node.id==='plum'?'#c1b48a':'#d28d73';for(const [a,b]of[[-.22,-.13],[.2,-.2],[.04,-.4]]){ellipse(a,b,.075,.08,color);ellipse(a-.025,b-.025,.02,.02,'#f0dabb');}}
  if(node.shape==='flower')for(const [a,b]of[[-.17,-.19],[.15,-.3],[0,-.42]]){ellipse(a,b,.065,.07,node.id==='vine'?'#c68f79':'#c8b4d3');ellipse(a,b,.025,.025,'#ebd495');}
  if(node.shape==='cocoon'){ellipse(-.16,-.18,.08,.13,'#e1d6b3',-.4);ellipse(.17,-.09,.075,.13,'#cdbf9a',.3);}
 }
 ctx.restore();
}
globalThis.RuinsResourceArt={draw};
})();

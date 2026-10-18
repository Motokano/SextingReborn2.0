// Presentation only: never changes the board, action counts or rating.
function createForgeEffects({forge,tiles,canvas,elements={}}) {
 const ctx=canvas.getContext('2d');
 if(!ctx)return {play(){},clear(){},destroy(){}};
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),animations=new Map();
 let items=[],frameId=0,width=0,height=0,dpr=1;
 const $=id=>elements[id]||document.getElementById(id),clamp=v=>Math.min(1,Math.max(0,v));
 const point=el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2+scrollX,y:r.top+r.height/2+scrollY,w:r.width,h:r.height};};
 const gold=['#fff6cf','#ffda7b','#ffae40','#f67739'],ice=['#f2ffff','#9ff6ff','#67bbff','#b1a5ff'];
 function resize(){
  width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
 }
 function clear(){
  cancelAnimationFrame(frameId);frameId=0;items=[];
  for(const animation of animations.values())animation.cancel();animations.clear();
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
 }
 function animate(el,keyframes,duration,delay=0){
  if(!el)return;
  animations.get(el)?.cancel();
  const animation=el.animate(keyframes,{duration,delay,easing:'cubic-bezier(.18,.8,.3,1)'});
  animations.set(el,animation);animation.onfinish=()=>{if(animations.get(el)===animation)animations.delete(el);};
 }
 function add(type,p,duration=700,delay=0){
  items.push({type,...p,born:performance.now()+delay,duration});
  if(items.length>600)items.splice(0,items.length-600);
  if(!frameId)frameId=requestAnimationFrame(frame);
 }
 function sparks(p,amount,palette=gold,speed=180,delay=0){
  for(let i=0;i<amount;i++){
   const angle=Math.random()*Math.PI*2,v=speed*(.25+Math.random()*.9);
   add('spark',{...p,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v-55,size:.7+Math.random()*2,color:palette[i%palette.length]},420+Math.random()*550,delay);
  }
 }
 function ring(p,color,radius=100,delay=0){add('ring',{...p,color,radius},600,delay);}
 function label(p,text,color='#ffe4a7',size=17,delay=0){add('text',{...p,text,color,size},1000,delay);}
 function glow(index,color,delay=0){
  animate(tiles[index],[{boxShadow:'inset 0 0 30px '+color+', 0 0 25px '+color},{boxShadow:'inset 0 0 0 transparent, 0 0 0 transparent'}],500,delay);
  animate(tiles[index].querySelector('.value'),[{transform:'scale(1.32)',color:'#fffce6',textShadow:'0 0 14px '+color},{transform:'scale(1)',color:getComputedStyle(tiles[index]).color,textShadow:'none'}],350,delay);
 }
 function shake(amount=3){
  animate($('board'),[{transform:'translate(0,0)'},{transform:'translate('+amount+'px,-2px)',offset:.15},{transform:'translate(-'+amount+'px,1px)',offset:.4},{transform:'translate(1px,0)',offset:.7},{transform:'translate(0,0)'}],230);
 }
 function bolt(from,to,color,delay=0){
  const points=Array.from({length:7},(_,i)=>{const t=i/6,jitter=i&&i!==6?9:0;return {x:from.x+(to.x-from.x)*t+(Math.random()-.5)*jitter,y:from.y+(to.y-from.y)*t+(Math.random()-.5)*jitter};});
  add('bolt',{points,color},400,delay);
 }
 function shield(index){
  const p=point(tiles[index]),color='#baffcb';
  add('shield',{...p,color,radius:Math.max(p.w,p.h)*.57},850);
  ring(p,color,72,40);ring(p,'#55d8a4',45,160);
  for(let n=0;n<6;n++){const angle=n*Math.PI/3;add('trail',{x:p.x+Math.cos(angle)*65,y:p.y+Math.sin(angle)*42,tx:p.x,ty:p.y,color,bend:10},420,n*25);}
  glow(index,color);label({x:p.x,y:p.y+29},'留力 · 护住原值',color,15,80);
 }
 function burstStrike(index,destinations){
  const p=point(tiles[index]),color='#efb1ff';
  ring(p,color,145);ring(p,'#ffffff',105,95);ring(p,'#b789ff',75,190);
  add('flare',{...p,color,radius:135},420);sparks(p,70,['#ffffff','#f4c3ff','#b896ff'],310,65);
  for(const j of destinations){const end=point(tiles[j]);bolt(p,end,color,30);bolt(p,end,'#c6baff',130);add('trail',{...p,tx:end.x,ty:end.y,color,bend:-20},500,80);}
  label({x:p.x,y:p.y-44},'传力 ×2 · 双重爆发',color,18,90);shake(4);
 }
 function gatherInto(index){
  const p=point(tiles[index]),color='#91f3ec';
  for(const j of forge.neighbors[index]){const from=point(tiles[j]);add('trail',{...from,tx:p.x,ty:p.y,color,bend:18},580);glow(j,color);}
  add('swirl',{...p,color,radius:42},600);add('flare',{...p,color,radius:35},320,190);
  glow(index,color,120);label({x:p.x,y:p.y+25},'聚料 · 四邻收半',color,15,110);
 }
 function collectEffect(index,type){
  const from=point(tiles[index]),config=forge.effects[type];
  const chip=$('effect-belt')?.querySelector('[data-effect="'+type+'"]');
  ring(from,config.color,60);label({x:from.x,y:from.y-28},'收取 · '+config.name,config.color,16,150);
  if(chip){const to=point(chip);for(let n=0;n<4;n++)add('trail',{...from,tx:to.x,ty:to.y,color:config.color,bend:40+n*8},720,n*45);animate(chip,[{boxShadow:'0 0 24px '+config.color,filter:'brightness(1.8)'},{boxShadow:'0 0 0 transparent',filter:'brightness(1)'}],700,350);}
 }
 function temporaryStrike(opportunity){
  const i=opportunity.index,p=point(tiles[i]),config=forge.opportunityEffects[opportunity.type],color=config.color;
  if(opportunity.type==='warmth'){
   for(let n=0;n<24;n++)add('flame',{x:p.x+(Math.random()-.5)*p.w*.8,y:p.y+12,vx:(Math.random()-.5)*22,vy:45+Math.random()*95,size:5+Math.random()*8,color:n%3?'#ff873d':'#ffe1a0'},650+Math.random()*350,n*8);
   ring(p,'#ffad56',105);add('flare',{...p,color:'#ffa03d',radius:100},470);sparks(p,45,gold,220);
   glow(i,color);label({x:p.x,y:p.y-32},'余热 · 落点 +2','#ffe0a4',18,90);shake(2);
  }else if(opportunity.type==='flake'){
   for(const j of forge.neighbors[i]){
    const end=point(tiles[j]);glow(j,color,80);
    for(let n=0;n<9;n++){const angle=Math.random()*Math.PI*2,speed=45+Math.random()*125;add('shard',{...end,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-65,size:3+Math.random()*5,rotation:angle,color:n%3?'#a8dbe7':'#efffff'},650+Math.random()*220,55);}
   }
   ring(p,color,110);add('bolt',{points:[{x:p.x-24,y:p.y-8},{x:p.x-5,y:p.y+5},{x:p.x+2,y:p.y-12},{x:p.x+24,y:p.y+8}],color:'#ffffff'},450);
   label({x:p.x,y:p.y-32},'剥落 · 四邻 −1',color,18,70);shake(3);
  }
 }
 function chosenStrike(index,type){
  const p=point(tiles[index]),color=forge.effects[type].color;
  if(type==='spread'){
   ring(p,color,145);ring(p,'#fff2c9',95,100);
   for(const j of forge.surrounding[index])bolt(p,point(tiles[j]),color,50);
   label({x:p.x,y:p.y-35},'扩散 · 八向传分',color,18,80);shake(4);
  }else if(type==='erase'){
   for(let n=0;n<28;n++){const angle=Math.random()*Math.PI*2;add('shard',{...p,vx:Math.cos(angle)*180,vy:Math.sin(angle)*140-60,size:3+Math.random()*5,rotation:angle,color},650,n*4);}
   add('beam',{x1:p.x-p.w*.4,y1:p.y+10,x2:p.x+p.w*.4,y2:p.y-10,color},430);
   label({x:p.x,y:p.y-30},'削尽 · 清零',color,18,80);
  }else if(type==='level'){
   for(const j of forge.neighbors[index]){const end=point(tiles[j]);add('trail',{...end,tx:p.x,ty:p.y,color,bend:12},450);add('trail',{...p,tx:end.x,ty:end.y,color,bend:-12},450,120);glow(j,color,120);}
   add('swirl',{...p,color,radius:80},750);label({x:p.x,y:p.y-35},'匀压 · 局部均分',color,17,80);
  }else{
   add('hammer',{...p,scale:.8},650,100);ring(p,color,90);
   const budget=$('hammer-budget')||$('hammer-left');if(budget){const end=point(budget);add('trail',{...p,tx:end.x,ty:end.y,color,bend:45},700);animate(budget,[{color,transform:'scale(1.15)'},{transform:'scale(1)'}],650);}
   label({x:p.x,y:p.y-30},'余劲 · 返还1锤',color,18,80);
  }
 }
 function starPath(x,y,r){
  ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.43:r;const xx=x+Math.cos(angle)*rr,yy=y+Math.sin(angle)*rr;if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);}ctx.closePath();
 }
 function paint(e,p){
  const fade=Math.pow(1-p,1.25),seconds=(performance.now()-e.born)/1000;
  ctx.save();ctx.globalAlpha=fade;
  if(e.type==='spark'){
   const x=e.x+e.vx*seconds,y=e.y+e.vy*seconds+155*seconds*seconds;
   ctx.strokeStyle=e.color;ctx.lineWidth=e.size*(1-p*.65);ctx.lineCap='round';ctx.shadowBlur=9;ctx.shadowColor=e.color;
   ctx.beginPath();ctx.moveTo(x-e.vx*.022,y-(e.vy+310*seconds)*.022);ctx.lineTo(x,y);ctx.stroke();
  }else if(e.type==='ring'){
   const radius=4+e.radius*(1-Math.pow(1-p,3));ctx.strokeStyle=e.color;ctx.lineWidth=4*(1-p)+.5;ctx.shadowBlur=16;ctx.shadowColor=e.color;
   ctx.beginPath();ctx.ellipse(e.x,e.y,radius,radius*.6,0,0,Math.PI*2);ctx.stroke();
  }else if(e.type==='flare'){
   const r=e.radius*(.25+Math.sin(Math.PI*p)*.75),gradient=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,r);
   gradient.addColorStop(0,'#ffffe8');gradient.addColorStop(.13,e.color);gradient.addColorStop(1,'transparent');ctx.globalAlpha=fade*.8;ctx.fillStyle=gradient;ctx.fillRect(e.x-r,e.y-r,r*2,r*2);
  }else if(e.type==='beam'){
   ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=24;ctx.lineCap='round';ctx.lineWidth=14*(1-p)+2;
   ctx.beginPath();ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);ctx.stroke();ctx.shadowBlur=6;ctx.strokeStyle='#fffbe6';ctx.lineWidth=3*(1-p)+.5;ctx.stroke();
  }else if(e.type==='trail'){
   const t=Math.min(1,p*1.7),cx=(e.x+e.tx)/2,cy=(e.y+e.ty)/2-(e.bend??22);
   ctx.strokeStyle=e.color;ctx.shadowBlur=12;ctx.shadowColor=e.color;ctx.lineWidth=2;ctx.globalAlpha=fade*.7;
   ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.quadraticCurveTo(cx,cy,e.tx,e.ty);ctx.stroke();
   const x=(1-t)**2*e.x+2*(1-t)*t*cx+t*t*e.tx,y=(1-t)**2*e.y+2*(1-t)*t*cy+t*t*e.ty;
   ctx.globalAlpha=fade;ctx.fillStyle='#fffad4';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
  }else if(e.type==='text'){
   ctx.globalAlpha=Math.min(1,p*12)*Math.min(1,(1-p)*4);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+e.size+'px "Microsoft YaHei",sans-serif';
   ctx.lineWidth=4;ctx.strokeStyle='#15201ee6';ctx.strokeText(e.text,e.x,e.y-35*p);ctx.fillStyle=e.color;ctx.shadowBlur=10;ctx.shadowColor=e.color;ctx.fillText(e.text,e.x,e.y-35*p);
  }else if(e.type==='hammer'){
   ctx.translate(e.x+18*p,e.y-48*p);ctx.rotate(.75+p*.6);ctx.scale(e.scale,e.scale);ctx.globalAlpha=(1-p)*.92;ctx.shadowBlur=12;ctx.shadowColor='#ffad47';
   const steel=ctx.createLinearGradient(-28,-12,28,12);steel.addColorStop(0,'#ffffec');steel.addColorStop(.35,'#c2d6da');steel.addColorStop(.65,'#68898e');steel.addColorStop(1,'#e8f5df');
   ctx.fillStyle='#92603e';ctx.fillRect(-5,-71,10,64);ctx.fillStyle='#c8995d';ctx.fillRect(-4,-68,3,58);ctx.fillStyle=steel;ctx.fillRect(-28,-12,56,25);ctx.strokeStyle='#fff3b5';ctx.lineWidth=1.5;ctx.strokeRect(-28,-12,56,25);ctx.fillStyle='#ffffff';ctx.fillRect(-25,-9,50,3);
  }else if(e.type==='star'){
   ctx.translate(e.x+e.vx*seconds,e.y+e.vy*seconds+50*seconds*seconds);ctx.rotate(p*3);ctx.fillStyle=e.color;ctx.shadowBlur=15;ctx.shadowColor=e.color;starPath(0,0,e.size*(1-p*.3));ctx.fill();
  }else if(e.type==='swirl'){
   ctx.translate(e.x,e.y);ctx.rotate(p*Math.PI*1.5);ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.shadowBlur=18;ctx.shadowColor=e.color;
   for(let n=0;n<3;n++){ctx.beginPath();ctx.ellipse(0,0,e.radius*(1-p*.7),e.radius*.45*(1-p*.7),n*Math.PI/3,p*Math.PI,p*Math.PI+Math.PI*1.25);ctx.stroke();}
  }else if(e.type==='shield'){
   const r=e.radius*(1+.15*Math.sin(p*Math.PI));ctx.translate(e.x,e.y);ctx.rotate(Math.PI/6);
   ctx.beginPath();for(let n=0;n<6;n++){const angle=n*Math.PI/3,x=Math.cos(angle)*r,y=Math.sin(angle)*r;if(n)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();
   ctx.fillStyle=e.color;ctx.globalAlpha=fade*.14;ctx.fill();ctx.globalAlpha=fade;ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.shadowColor=e.color;ctx.shadowBlur=20;ctx.stroke();
   ctx.scale(.8,.8);ctx.lineWidth=1;ctx.stroke();
  }else if(e.type==='bolt'){
   ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=18;ctx.lineWidth=4*(1-p)+1;ctx.lineJoin='round';
   ctx.beginPath();e.points.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();
  }else if(e.type==='flame'){
   const x=e.x+e.vx*seconds,y=e.y-e.vy*seconds,size=e.size*(1-p*.65);ctx.shadowBlur=16;ctx.shadowColor=e.color;
   const gradient=ctx.createLinearGradient(x,y-size*3,x,y+size);gradient.addColorStop(0,'transparent');gradient.addColorStop(.5,e.color);gradient.addColorStop(1,'#fff4bb');ctx.fillStyle=gradient;
   ctx.beginPath();ctx.moveTo(x,y-size*3);ctx.bezierCurveTo(x+size*2,y,x+size,y+size,x,y+size);ctx.bezierCurveTo(x-size,y+size,x-size*2,y,x,y-size*3);ctx.fill();
  }else if(e.type==='shard'){
   ctx.translate(e.x+e.vx*seconds,e.y+e.vy*seconds+170*seconds*seconds);ctx.rotate(e.rotation+p*5);ctx.fillStyle=e.color;ctx.shadowBlur=8;ctx.shadowColor=e.color;
   ctx.beginPath();ctx.moveTo(-e.size,-e.size*.5);ctx.lineTo(e.size*.7,-e.size);ctx.lineTo(e.size,e.size*.8);ctx.lineTo(-e.size*.3,e.size*.6);ctx.closePath();ctx.fill();
  }else if(e.type==='portal'){
   ctx.translate(e.x,e.y);ctx.rotate(p*Math.PI*2);ctx.strokeStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=20;ctx.lineWidth=3;
   for(let n=0;n<3;n++){ctx.beginPath();ctx.ellipse(0,0,e.radius*(1-n*.16),e.radius*.55*(1-n*.16),n*Math.PI/3,n*Math.PI/2+p,n*Math.PI/2+p+Math.PI*1.6);ctx.stroke();}
  }
  ctx.restore();
 }
 function frame(now){
  frameId=0;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(dpr,0,0,dpr,-scrollX*dpr,-scrollY*dpr);
  items=items.filter(e=>now-e.born<e.duration);
  for(const item of items){const age=now-item.born;if(age>=0)paint(item,clamp(age/item.duration));}
  if(items.length)frameId=requestAnimationFrame(frame);
 }
 function celebrate(stars,finished=false){
  const parent=$(finished?'result-stars':'rating'),p=point(parent),color=stars===3?'#ffe09a':'#c4efff';
  parent.querySelectorAll('.lit').forEach((el,i)=>animate(el,[{transform:'scale(.6) rotate(-15deg)',filter:'brightness(2.5)'},{transform:'scale(1.5) rotate(6deg)',filter:'brightness(1.8)',offset:.4},{transform:'scale(1) rotate(0deg)',filter:'brightness(1)'}],700,i*90));
  ring(p,color,100+stars*20);sparks(p,24+stars*16,stars===3?gold:ice,160);
  for(let i=0;i<8+stars*3;i++){const angle=Math.random()*Math.PI*2;add('star',{...p,vx:Math.cos(angle)*(50+Math.random()*120),vy:Math.sin(angle)*80-80,color:i%2?'#fff7d9':color,size:3+Math.random()*5},1000+Math.random()*250);}
  if(!finished){const board=point($('board'));label({x:board.x,y:board.y-board.h/2+40},['','★ 一星达成','★★ 二星达成','★★★ 三星完美'][stars],color,stars===3?23:20,100);}
 }
 function play(action,before,after){
  const hit=Number.isInteger(action.index),stars=forge.stars(after),gained=stars>forge.stars(before);
  if(motion.matches){
   const el=hit?tiles[action.index]:action.kind==='finish'?$('result'):document.querySelector('.score-band');
   animate(el,[{boxShadow:'inset 0 0 0 2px #ecc385'},{boxShadow:'inset 0 0 0 2px transparent'}],220);return;
  }
  if(width!==innerWidth||height!==innerHeight||dpr!==Math.min(devicePixelRatio||1,2))resize();
  if(hit){
   const i=action.index,p=point(tiles[i]),kind=action.kind,heavy=kind!=='light',cross=kind==='cross';
   const source=before.specials.find(e=>e.index===i),burst=heavy&&action.effect==='burst',keep=heavy&&action.effect==='keep';
   const color=cross?'#a9edff':burst?'#e8b4ff':'#ffc66a',palette=cross?ice:gold;
   add('hammer',{...p,scale:cross?1.3:heavy?1:.65},330);
   add('flare',{...p,color,radius:cross?135:heavy?95:45},cross?410:280);
   sparks(p,cross?100:heavy?65:22,palette,cross?340:heavy?250:125);
   ring(p,color,cross?160:heavy?105:42);if(heavy)ring(p,color,cross?105:65,100);
   glow(i,color);
   const destinations=forge.transmissionTargets(action).filter(j=>forge.transferValue(before,action,j)>0);
   if(cross){
    const row=forge.cells.flatMap((cell,j)=>cell.r===forge.cells[i].r?[point(tiles[j])]:[]),col=forge.cells.flatMap((cell,j)=>cell.c===forge.cells[i].c?[point(tiles[j])]:[]);
    add('beam',{x1:row[0].x-row[0].w/2-12,y1:p.y,x2:row.at(-1).x+row.at(-1).w/2+12,y2:p.y,color},650);
    add('beam',{x1:p.x,y1:col[0].y-col[0].h/2-12,x2:p.x,y2:col.at(-1).y+col.at(-1).h/2+12,color},650);
    label({x:p.x,y:p.y-26},'十字锤 · 此格不可再锤',color,14,110);
   }
   for(const j of destinations){
    const end=point(tiles[j]),delay=Math.min(180,Math.hypot(end.x-p.x,end.y-p.y)*.45);
    add('trail',{...p,tx:end.x,ty:end.y,color},420);
    glow(j,color,delay);sparks(end,cross?6:9,palette,65,delay);
   }
   // Show final net changes once, including reductions and redistribution.
   after.values.forEach((value,j)=>{
    const delta=value-before.values[j];if(!delta)return;
    const end=point(tiles[j]),delay=Math.min(180,Math.hypot(end.x-p.x,end.y-p.y)*.45);
    label({x:end.x,y:end.y-8},(delta>0?'+':'')+delta,delta<0?'#bdebf0':forge.isScoring(j)?'#ffe29a':color,18,delay);
   });
   if(keep)shield(i);
   if(burst)burstStrike(i,destinations);
   if(action.effect==='gather')gatherInto(i);
   if(['spread','erase','level','rebound'].includes(action.effect))chosenStrike(i,action.effect);
   if(source)collectEffect(i,source.type);
   if(before.opportunity?.index===i)temporaryStrike(before.opportunity);
   if(after.opportunity){
    const opportunity=after.opportunity,config=forge.opportunityEffects[opportunity.type],nextPoint=point(tiles[opportunity.index]);
    glow(opportunity.index,config.color,220);ring(nextPoint,config.color,35,240);
    label({x:nextPoint.x,y:nextPoint.y+23},'新 · '+config.name,config.color,12,260);
   }
   const delta=forge.score(after)-forge.score(before),board=point($('board'));
   if(delta)label({x:board.x,y:board.y-board.h/2-9},'计分区 '+(delta>0?'+':'')+delta,forge.completion(after)>=forge.completion(before)?'#ffda8f':'#ffb8a3',20,100);
   animate($('score'),[{transform:'scale(1.25)',textShadow:'0 0 22px '+color},{transform:'scale(1)',textShadow:'none'}],350);
  }else if(action.kind==='quench'||action.kind==='temper'){
   const temper=action.kind==='temper',board=point($('board')),color=temper?'#ffb671':'#9eedff';
   forge.cells.forEach((_,i)=>{const p=point(tiles[i]),delay=forge.cells[i].r*22;glow(i,color,delay);sparks(p,3,temper?gold:ice,55,delay);});
   add('swirl',{...board,color,radius:Math.max(board.w,board.h)*.55},950);
   ring(board,color,board.w*.7);label({x:board.x,y:board.y},temper?'回火 · 全盘均化':'淬火 · 全盘 +1',color,22,100);
  }else if(action.kind==='finish'){
   if(stars)celebrate(stars,true);
   else animate($('result'),[{boxShadow:'0 0 25px #759c6c88'},{boxShadow:'0 0 0 transparent'}],500);
  }
  if(gained&&action.kind!=='finish')celebrate(stars);
 }
 const onResize=()=>{clear();resize();},onVisibility=()=>{if(document.hidden)clear();};
 resize();window.addEventListener('resize',onResize);motion.addEventListener('change',clear);
 document.addEventListener('visibilitychange',onVisibility);
 function destroy(){clear();window.removeEventListener('resize',onResize);motion.removeEventListener('change',clear);document.removeEventListener('visibilitychange',onVisibility);}
 return {play,clear,destroy};
}

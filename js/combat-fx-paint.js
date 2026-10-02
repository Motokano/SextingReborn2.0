/** Approved combat brushwork. Design: docs/design/69-combat-fx-art-direction.md.
 * Pure Canvas drawing; gameplay and timing orchestration live in combat-fx-runtime.js.
 * Source of truth for both the game and its visual comparison page.
 */
(function(global){
'use strict';
const volume = (()=>{
const accents = {
  jab:{windup:170,color:'#f7ce82',detail:'凝实拳影 · 短促气锥 · 压缩冲击'},
  front_kick:{windup:270,color:'#efb56d',detail:'厚底鞋影 · 柱状推力 · 尘雾挤开'},
  swing_punch:{windup:300,color:'#efa066',detail:'重拳残像 · 琥珀扇面 · 碎块迸散'},
  whip_kick:{windup:230,color:'#a5dbc1',detail:'青白风镰 · 鞋尖甩出 · 碎风飞叶'},
  poke_eye:{windup:145,color:'#f4d38c',detail:'双指手影 · 针状闪芒 · 局部眩光'},
  kick_knee:{windup:215,color:'#d8a77c',detail:'硬靴低踹 · 折角冲击 · 贴地扬尘'},
  shove:{windup:320,color:'#b5d5b9',detail:'并列掌面 · 透明气墙 · 压力扩散'},
  slap_combo:{windup:180,color:'#efa78f',detail:'肉色掌影 · 交错扇风 · 掌面震波'},
  weapon_strike:{windup:255,color:'#b1dfeb',detail:'冰白刃面 · 薄锋残光 · 棱形碎屑'}
};
const TAU=Math.PI*2;
function path(c,points){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();}
function line(c,points,color,width=1){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function ellipse(c,x,y,rx,ry,fill){c.fillStyle=fill;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fill();}
function glow(c,x,y,r,color,strength=.5){
  c.save();c.globalAlpha*=strength;
  const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color+'c0');g.addColorStop(.35,color+'60');g.addColorStop(1,color+'00');
  ellipse(c,x,y,r,r,g);c.restore();
}
function smoke(c,x,y,q,color,count=6,size=7,spread=20){
  c.save();c.globalAlpha*=.37;
  for(let i=0;i<count;i++){
    const a=i*2.399,dist=5+q*spread,r=size*(.6+(i%3)*.2)*(1+q*.8),px=x+Math.cos(a)*dist,py=y+Math.sin(a)*dist*.6;
    const g=c.createRadialGradient(px-r*.2,py-r*.3,0,px,py,r);g.addColorStop(0,color+'b0');g.addColorStop(.65,color+'65');g.addColorStop(1,color+'00');ellipse(c,px,py,r,r*.8,g);
  }c.restore();
}
function chips(c,q,color,count=8,spread=28,side=1){
  for(let i=0;i<count;i++){
    const a=side*(i-count*.5)*.29,dist=9+q*(spread+(i%3)*9),x=Math.cos(a)*dist,y=Math.sin(a)*dist+q*q*9;
    c.save();c.translate(x,y);c.rotate(a+q*(i%2?3:-2));path(c,[[-3,-1],[0,-2.5],[4,0],[-1,2]]);c.fillStyle=i%3===0?'#fff0cc':color;c.fill();c.restore();
  }
}
function pressure(c,x,q,color,size=22){
  c.save();c.translate(x,0);
  const g=c.createLinearGradient(-6,0,12,0);g.addColorStop(0,color+'00');g.addColorStop(.7,color+'88');g.addColorStop(1,'#fff4dcbc');
  c.fillStyle=g;c.beginPath();c.ellipse(0,0,8+q*5,size+q*9,0,-Math.PI*.55,Math.PI*.55);c.ellipse(-4,0,7+q*4,size*.82+q*9,0,Math.PI*.55,-Math.PI*.55,true);c.closePath();c.fill();c.restore();
}
function drawMoveContact(c,move,q,side){
  const color=accents[move].color;
  if(move==='jab'){
    glow(c,0,0,20,color,.6);pressure(c,3+q*7,q,color,10);smoke(c,3,0,q,color,4,4,14);chips(c,q,color,5,18);ellipse(c,0,0,4*(1-q)+1,6*(1-q)+1,'#fff4d9');
  }else if(move==='front_kick'){
    glow(c,0,0,26,color,.45);smoke(c,4,0,q,'#ddc9a2',8,8,26);pressure(c,6+q*14,q,color,21);chips(c,q,color,5,23);
  }else if(move==='swing_punch'){
    glow(c,0,0,31,color,.65);smoke(c,7,0,q,'#ddb08b',7,9,24);
    c.save();c.globalAlpha*=.72;path(c,[[-10,-2],[-6,-17],[1,-7],[12,-13],[7,-2],[23,3],[8,7],[2,18],[-4,7],[-13,11]]);const g=c.createLinearGradient(-10,0,23,0);g.addColorStop(0,'#fff0be');g.addColorStop(1,color+'30');c.fillStyle=g;c.fill();c.restore();chips(c,q,color,9,32,side);
  }else if(move==='whip_kick'){
    glow(c,0,0,24,color,.4);pressure(c,4+q*10,q,color,16);chips(c,q,color,9,33,side);smoke(c,6,0,q,'#d2e1c9',4,5,18);
  }else if(move==='poke_eye'){
    glow(c,0,0,14,color,.6);for(const s of [-1,1]){c.save();c.translate(s*4,-s*3);path(c,[[0,-9],[2,-2],[7,0],[2,2],[0,9],[-1,2],[-6,0],[-1,-2]]);c.fillStyle='#fff4d5';c.fill();c.restore();}
  }else if(move==='kick_knee'){
    smoke(c,3,4,q,'#ccb595',8,7,25);glow(c,0,0,16,color,.5);path(c,[[-8,-11],[6,-2],[-2,3],[10,9],[-7,5],[0,0]]);c.fillStyle='#ffe2b2';c.fill();chips(c,q,color,6,19);
  }else if(move==='shove'){
    pressure(c,7+q*22,q,color,27);pressure(c,q*12,q,color,20);smoke(c,5,0,q,'#d4debf',6,8,27);
  }else if(move==='slap_combo'){
    glow(c,0,0,22,color,.4);smoke(c,3,0,q,'#f0be9f',5,5,18);pressure(c,6+q*12,q,color,17);chips(c,q,color,5,23,side);
  }else if(move==='weapon_strike'){
    glow(c,0,0,25,color,.55);path(c,[[-6,-27],[2,-6],[6,29],[-2,6]]);c.fillStyle='#efffff';c.fill();c.save();c.globalAlpha*=.25;path(c,[[-12,-25],[4,-10],[11,30],[-4,10]]);c.fillStyle=color;c.fill();c.restore();chips(c,q,color,8,34);smoke(c,5,0,q,'#cee8dd',3,4,17);
  }
}
function drawDefense(c,result,q){
  if(result==='parry'){
    c.save();c.rotate(Math.PI);pressure(c,0,q,'#badacc',16);chips(c,q,'#cfebe0',5,20);c.restore();
    glow(c,-2,0,16,'#c6e6d1',.35);
  }else{
    path(c,[[-12,-10],[0,-15],[12,-10],[9,8],[0,15],[-9,8]]);
    const g=c.createLinearGradient(-12,-10,12,15);g.addColorStop(0,'#d8fff355');g.addColorStop(.5,'#a4d3c733');g.addColorStop(1,'#739e9310');c.fillStyle=g;c.fill();
  }
}

return {drawMoveContact,drawDefense,pressure,chips};})();
const signature = (()=>{
const {pressure,chips,drawMoveContact:volumeContact,drawDefense:volumeDefense}=volume;
const accents={
  jab:{windup:360,color:'#f7ce82',detail:'拳锋前探 → 直拳打入 → 短锥爆点'},
  front_kick:{windup:430,color:'#efb56d',detail:'脚尖勾起 → 脚跟正蹬 → 屈收回脚'},
  swing_punch:{windup:480,color:'#efa066',detail:'拳影外绕 → 浅弧横摆 → 侧向重震'},
  whip_kick:{windup:450,color:'#a5dbc1',detail:'外侧起腿 → 脚背弧扫 → 青绿扇墨'},
  poke_eye:{windup:340,color:'#f4d38c',detail:'双指亮形 → 窄路突入 → 双点眼花'},
  kick_knee:{windup:390,color:'#d8a77c',detail:'低位送脚 → 脚跟压膝 → 短程回收'},
  shove:{windup:460,color:'#b5d5b9',detail:'双掌展开 → 并肩推入 → 宽面压波'},
  slap_combo:{windup:340,color:'#efa78f',detail:'张掌横抽 → 反掌接续 → 两次扇形掌震'},
  weapon_strike:{windup:440,color:'#b1dfeb',detail:'立刃举起 → 刃面劈落 → 清晰斩痕'}
};
const segmentGap=360,recovery=220,trailLife=240,contactLife=280,kinetic=true;
const clamp=t=>Math.min(1,Math.max(0,t));
const motionProgress=wind=>Math.pow(clamp((wind-.2)/.8),1.45);
const paints={jab:['#ffc847','#ff794b'],front_kick:['#38d9ef','#3b85ff'],swing_punch:['#ff9443','#ee486b'],whip_kick:['#5de6c6','#278fdc'],poke_eye:['#e4b7ff','#a077ed'],kick_knee:['#efb353','#e77443'],shove:['#71d6fa','#5577ef'],slap_combo:['#ff9bc0','#df568e'],weapon_strike:['#c4f6ff','#51acf0']};
function polygon(c,points,fill){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill();}
function inkShape(c,points,fill){polygon(c,points,fill);c.strokeStyle='#142940b0';c.lineWidth=1.1;c.lineJoin='round';c.stroke();}
function paintBurst(c,move,q,side){
  const [color,secondary]=paints[move],small=move==='poke_eye',push=move==='shove';
  const scale=small?.48:move==='jab'?.72:move==='swing_punch'?1.1:1;
  const reach=13+Math.pow(clamp(q*2.5),.55)*24;
  c.save();c.scale(scale,scale*side);
  if(move==='kick_knee')c.rotate(.5);
  if(move==='weapon_strike')c.rotate(-.65);
  // Uneven directional brush lobes spread out once from the actual contact.
  const count=push?4:7;
  for(let i=0;i<count;i++){
    const a=(i-(count-1)/2)*(push?.48:.39),r=reach*(.72+(i%3)*.21),w=3+(i%3)*1.3;
    c.save();c.rotate(a);c.globalAlpha*=.72;
    const g=c.createLinearGradient(0,0,r+9,0);g.addColorStop(0,color);g.addColorStop(.5,i%2?secondary:color);g.addColorStop(1,secondary+'30');
    inkShape(c,[[0,-2],[r*.35,-w],[r*.7,-w*.7],[r+5,-1],[r*.64,w*.4],[r*.8,w],[r*.28,w*.7],[-3,2]],g);
    c.strokeStyle='#fff6e899';c.lineWidth=.65;c.beginPath();c.moveTo(r*.23,-w*.5);c.lineTo(r*.68,-w*.25);c.stroke();c.restore();
  }
  // Discrete paint drops keep the outer edge graphic instead of a foggy glow.
  for(let i=0;i<10;i++){
    const a=(i-4.5)*.32,r=18+q*(29+(i%3)*8),x=Math.cos(a)*r,y=Math.sin(a)*r;
    c.save();c.translate(x,y);c.rotate(a+q*.4);
    c.fillStyle=i%3?color:secondary;c.strokeStyle='#152440a0';c.lineWidth=.7;
    c.beginPath();c.ellipse(0,0,1.4+(i%3)*.7,1+(i%2)*.6,0,0,Math.PI*2);c.fill();c.stroke();
    if(i%2===0)polygon(c,[[-6,-1],[-2,-1],[0,0],[-5,1]],secondary+'a0');c.restore();
  }
  // White-hot compact center; push and eye poke retain their distinct contacts.
  if(!push&&!small){
    c.save();c.globalAlpha*=clamp(1-q*2.2);
    polygon(c,[[-9,-2],[-3,-10],[0,-3],[8,-6],[4,0],[13,3],[3,4],[0,11],[-3,4],[-8,6]],'#fff4cd');
    polygon(c,[[-4,0],[0,-5],[4,0],[0,5]],'#ffffff');c.restore();
  }c.restore();
}
function frontSole(c,x,y,rotation,color,scale=1,alpha=1){
  // Heel is the contact anchor (0,0). Toes stay up; never a sideways shoe outline.
  c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);c.globalAlpha*=alpha;
  const g=c.createLinearGradient(-8,7,7,-27);g.addColorStop(0,'#876546');g.addColorStop(.5,color);g.addColorStop(1,'#fff0ce');
  c.beginPath();c.moveTo(-5,7);c.quadraticCurveTo(-9,1,-6,-7);c.quadraticCurveTo(-10,-17,-7,-24);c.quadraticCurveTo(-3,-30,6,-27);c.quadraticCurveTo(11,-24,9,-15);c.quadraticCurveTo(8,-8,6,-5);c.quadraticCurveTo(9,3,5,7);c.closePath();
  c.fillStyle=g;c.fill();c.strokeStyle='#695141a0';c.lineWidth=1;c.stroke();
  c.strokeStyle='#705443b0';c.lineWidth=1.8;c.lineCap='round';
  for(const y of [-22,-17,-12]){c.beginPath();c.moveTo(-5,y);c.quadraticCurveTo(0,y+2,6,y);c.stroke();}
  polygon(c,[[-4,-2],[4,-2],[4,4],[-4,4]],'#624a3999');
  c.strokeStyle='#fff2d6c0';c.lineWidth=1;c.beginPath();c.moveTo(-6,-23);c.quadraticCurveTo(0,-27,6,-24);c.stroke();c.restore();
}
function drawMoveContact(c,move,q,side,angle=0){
  const color=accents[move].color;
  paintBurst(c,move,q,side);
  if(move==='front_kick'){
    pressure(c,6+q*10,q,color,20);frontSole(c,0,0,-angle,color,.86,Math.max(0,1-q*2)*.4);
    chips(c,q,color,4,23);
  }else if(move==='kick_knee'){
    polygon(c,[[-8,-10],[5,-3],[-1,2],[10,11],[-7,5],[0,0]],'#f5d4a8');chips(c,q,color,4,21);
  }else if(move==='slap_combo'){
    c.save();c.scale(1,side);pressure(c,5+q*14,q,color,20);chips(c,q,color,5,22);c.restore();
  }else if(move==='shove'){
    pressure(c,6+q*17,q,color,26);pressure(c,q*9,q,color,18);
  }else{
    // All remaining contacts have their own existing geometry, not one shared spark.
    volumeContact(c,move,q,side);
  }
}
function drawDefense(c,result,q){
  volumeDefense(c,result,q);
  if(result==='parry'){
    c.save();c.rotate(Math.PI);c.globalAlpha*=.75;chips(c,q,'#94e6ff',4,24);c.restore();
  }
}

return {accents,drawMoveContact,drawDefense};})();
const {accents:timing,drawMoveContact:baseContact,drawDefense}=signature;
const descriptions={jab:'金色短锥 · 拳锋穿刺 · 四角脆闪',front_kick:'青蓝厚笔 · 足跟前推 · 压缩断环',swing_punch:'橙红重弧 · 横向泼墨 · 偏心爆裂',whip_kick:'外侧起弧 · 横扫侧腹 · 顺势裂风',poke_eye:'紫白双针 · 极窄锐痕 · 双点冷闪',kick_knee:'赭金低扫 · 足跟压膝 · 下折碎痕',shove:'双掌蓝浪 · 宽面挤压 · 层叠推波',slap_combo:'玫红扇墨 · 指缝留白 · 反向掌震',weapon_strike:'冰白半月 · 锋面留白 · 斜切裂光'};
const accents=Object.fromEntries(Object.entries(timing).map(([id,a])=>[id,{...a,detail:descriptions[id]}]));
const segmentGap=400,recovery=220,trailLife=160,contactLife=280,kinetic=true,attached=true;
const clamp=t=>Math.max(0,Math.min(1,t));
const motionProgress=wind=>Math.pow(clamp((wind-.2)/.8),1.45);
const colors={jab:['#ffdf62','#f59d32'],front_kick:['#79eff3','#329cdf'],swing_punch:['#ffb35e','#f05a55'],whip_kick:['#a8ffd6','#28bdac'],poke_eye:['#f0d7ff','#b384ee'],kick_knee:['#efca80','#d28043'],shove:['#b4edff','#5099e4'],slap_combo:['#ffbed6','#ed649f'],weapon_strike:['#edfffe','#6ccbe4']};
function line(c,points,color,width){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function pt(t,length,bend,lift,angle){const arc=Math.sin(Math.PI*t);return [length*t-Math.sin(angle)*lift*arc,bend*arc-Math.cos(angle)*lift*arc];}
function smear(c,length,p,bend,lift,angle,color,width){
  // Soft, pointed ink mass: no tubular outline or elbow/knee corners.
  const upper=[],lower=[],count=30;
  for(let i=0;i<=count;i++){
    const t=i/count,v=pt(t*p,length,bend,lift,angle),next=pt(t*p+.002,length,bend,lift,angle),dx=next[0]-v[0],dy=next[1]-v[1],d=Math.hypot(dx,dy)||1;
    const w=width*Math.pow(Math.sin(Math.PI*t),.8)*(.3+.7*t)*(.45+.55*p);
    upper.push([v[0]-dy/d*w,v[1]+dx/d*w]);lower.unshift([v[0]+dy/d*w,v[1]-dx/d*w]);
  }
  const gradient=c.createLinearGradient(0,0,Math.max(1,length*p),0);gradient.addColorStop(0,color+'00');gradient.addColorStop(.28,color+'50');gradient.addColorStop(.65,color+'e8');gradient.addColorStop(1,color+'ff');
  c.beginPath();[...upper,...lower].forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.closePath();c.fillStyle=gradient;c.fill();
}
function edge(c,length,p,bend,lift,angle,color,width=1){const points=[];for(let i=0;i<=20;i++)points.push(pt((.12+.85*i/20)*p,length,bend,lift,angle));line(c,points,color,width);}
function fleck(c,x,y,rotation,size,color){
  c.save();c.translate(x,y);c.rotate(rotation);c.fillStyle=color;
  c.beginPath();c.moveTo(-size,0);c.lineTo(size*.55,-size*.22);c.lineTo(size,0);c.lineTo(size*.2,size*.4);c.closePath();c.fill();c.restore();
}
function calligraphy(c,move,length,p,bend,lift,angle,side,width){
  const [light,tint]=colors[move];
  // Dark outer brush and saturated core share one motion. No detached glowing head.
  c.save();c.translate(0,side*2);c.globalAlpha*=.75;smear(c,length,p,bend,lift,angle,'#132632',width+3);c.restore();
  smear(c,length,p,bend,lift,angle,tint,width);
  c.save();c.globalAlpha*=.95;smear(c,length,p,bend-side*width*.24,lift,angle,light,width*.57);c.restore();
  edge(c,length,p,bend-side*width*.38,lift,angle,'#fff9e0',move==='poke_eye'?1:1.65);
  // Separate dry-brush strands distinguish the move while keeping the same single hit.
  const strands=move==='slap_combo'?4:move==='weapon_strike'?1:move==='whip_kick'?2:0;
  for(let i=0;i<strands;i++){
    c.save();c.globalAlpha*=.7;
    edge(c,length*(.87+i*.025),p,bend+side*(5+i*4),lift+(move==='weapon_strike'?9:0),angle,i%2?light:tint,move==='slap_combo'?1.6:.8);c.restore();
  }
  if(p>.55&&move!=='poke_eye')for(let i=0;i<3;i++){
    const t=p*(.45+i*.13),v=pt(t,length,bend+side*(width+5+i*2),lift,angle);
    c.save();c.globalAlpha*=.55;fleck(c,v[0],v[1],side*.3,2.6+i*.65,tint);c.restore();
  }
}
function finish(c,move,x,y,angle,side){
  // Small contact accents emerge during the last instant, never travel as isolated icons.
  c.save();c.translate(x,y);c.strokeStyle='#fff6da';c.lineWidth=1.8;c.lineCap='round';
  if(move==='front_kick'||move==='kick_knee'){
    c.rotate(-angle);c.beginPath();c.moveTo(-4,3);c.quadraticCurveTo(2,5,3,0);c.quadraticCurveTo(5,-15,0,-16);c.quadraticCurveTo(-6,-15,-5,-6);c.stroke();
  }else if(move==='whip_kick'){
    c.beginPath();c.moveTo(-12,-4);c.quadraticCurveTo(-5,-3,2,1);c.quadraticCurveTo(-2,4,-9,1);c.stroke();
  }else if(move==='poke_eye'){
    line(c,[[-10,-2],[1,-3]],'#fff6da',1.5);line(c,[[-9,2],[1,1]],'#fff6da',1.3);
  }else if(move==='slap_combo'||move==='shove'){
    for(let i=0;i<4;i++)line(c,[[-8,side*(i-1.5)*2],[1,side*(i-1.5)*3]],'#fff6da',1);
  }else if(move==='weapon_strike'){
    line(c,[[-5,11],[3,-15]],'#f2ffed',2);
  }else{
    c.beginPath();c.moveTo(-7,-5);c.quadraticCurveTo(3,-6,2,0);c.quadraticCurveTo(3,5,-7,4);c.stroke();
  }c.restore();
}
function roundhouseTrail(c,{length,progress,side,age,wind,angle,sweep}){
  if(wind<.2)return;
  const returning=age>=0,p=returning?1:progress;
  const [light,tint]=colors.whip_kick;
  const at=(t,k=1)=>[length*t+sweep[0]*Math.sin(Math.PI*t)*k,sweep[1]*Math.sin(Math.PI*t)*k];
  const stroke=(width,color,k=1)=>{
    const upper=[],lower=[];
    for(let i=0;i<=32;i++){
      const t=p*i/32,v=at(t,k),dx=length+sweep[0]*Math.PI*Math.cos(Math.PI*t)*k,dy=sweep[1]*Math.PI*Math.cos(Math.PI*t)*k,d=Math.hypot(dx,dy)||1;
      const w=width*Math.pow(Math.sin(Math.PI*i/32),.8)*(.3+.7*i/32)*(.45+.55*p);
      upper.push([v[0]-dy/d*w,v[1]+dx/d*w]);lower.unshift([v[0]+dy/d*w,v[1]-dx/d*w]);
    }
    const gradient=c.createLinearGradient(0,0,Math.max(1,length),0);gradient.addColorStop(0,color+'00');gradient.addColorStop(.25,color+'65');gradient.addColorStop(.7,color+'ec');gradient.addColorStop(1,color+'ff');
    c.beginPath();[...upper,...lower].forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.closePath();c.fillStyle=gradient;c.fill();
  };
  const trace=(k,color,width)=>{const points=[];for(let i=0;i<=28;i++)points.push(at(p*(.1+.89*i/28),k));line(c,points,color,width);};
  c.save();c.globalAlpha*=returning?Math.pow(1-clamp(age/trailLife),1.5):clamp(progress*4);
  c.save();c.globalAlpha*=.75;stroke(22,'#132632');c.restore();
  stroke(19,tint);stroke(10,light,.93);trace(.88,'#fff9e0',1.65);
  c.save();c.globalAlpha*=.6;trace(1.16,tint,1.3);trace(1.30,light,1);c.restore();
  if(!returning&&p>.82){
    const tip=at(p),a=Math.atan2(sweep[1]*Math.PI*Math.cos(Math.PI*p),length+sweep[0]*Math.PI*Math.cos(Math.PI*p));
    c.save();c.translate(...tip);c.rotate(a);c.globalAlpha*=clamp((p-.82)/.18);finish(c,'whip_kick',0,0,angle+a,side);c.restore();
  }
  c.restore();
}
function drawMoveTrail(c,{move,length,progress,side,age,wind,angle,sweep}){
  if(move==='whip_kick'&&sweep){roundhouseTrail(c,{length,progress,side,age,wind,angle,sweep});return;}
  if(wind<.2)return;
  const [light,tint]=colors[move],returning=age>=0,p=returning?1-.28*clamp(age/trailLife):progress;
  const bend=({swing_punch:29,slap_combo:29,whip_kick:9}[move]||0)*side;
  const lift=({front_kick:10,whip_kick:35,kick_knee:3,weapon_strike:39}[move]||0);
  const width=({jab:6.5,front_kick:12,swing_punch:20,whip_kick:20,poke_eye:1.65,kick_knee:7.5,shove:9.5,slap_combo:17.5,weapon_strike:15}[move]);
  c.save();c.globalAlpha*=returning?Math.pow(1-clamp(age/trailLife),1.5):clamp(progress*4);
  if(move==='shove'){
    for(const s of [-1,1]){c.save();c.translate(s*7*Math.cos(angle),-s*7*Math.sin(angle));calligraphy(c,move,length,p,0,2,angle,s,width);c.restore();}
  }else{
    calligraphy(c,move,length,p,bend,lift,angle,side,width);
  }
  if(['swing_punch','whip_kick','slap_combo','weapon_strike'].includes(move)){
    c.save();c.globalAlpha*=.55;edge(c,length*.9,p,bend+side*9,lift+3,angle,light,1.1);c.restore();
  }
  if(move==='poke_eye'){c.save();c.translate(0,3);edge(c,length,p,0,0,angle,light,1);c.restore();}
  if(!returning&&progress>.82){const end=pt(p,length,bend,lift,angle);c.save();c.globalAlpha*=clamp((progress-.82)/.18);finish(c,move,end[0],end[1],angle,side);c.restore();}
  c.restore();
}

function drawMoveContact(c,move,q,side,angle=0){
  const [light,tint]=colors[move],p=1-Math.pow(1-clamp(q*2),2),fade=1-clamp(q*1.4);
  const impactScale=move==='poke_eye'?1.03:1.16;
  c.save();c.scale(impactScale,impactScale);baseContact(c,move,q,side,angle);c.restore();
  c.save();c.scale(1.12,1.12);c.globalAlpha*=fade;
  if(move==='jab'){
    // Four crisp corners instead of a broad explosive cloud.
    for(let i=0;i<4;i++){const a=Math.PI*.25+i*Math.PI/2,r=9+p*9;c.save();c.rotate(a);line(c,[[r,-3],[r+7,0],[r,3]],light,1.5);c.restore();}
  }else if(move==='front_kick'||move==='shove'){
    const push=move==='shove';
    for(let i=0;i<(push?3:2);i++){
      c.save();c.globalAlpha*=1-i*.23;c.strokeStyle=i%2?tint:light;c.lineWidth=push?2.5:3.2;
      c.beginPath();c.ellipse(3+p*8+i*7,0,5+p*5,(push?22:17)+p*7-i*2,0,-Math.PI*.43,Math.PI*.43);c.stroke();c.restore();
    }
  }else if(move==='swing_punch'){
    for(let i=0;i<6;i++){const a=side*(i-2.5)*.16,r=15+p*17;fleck(c,Math.cos(a)*r,Math.sin(a)*r,a,5+(i%3)*2,i%2?tint:light);}
    line(c,[[-9,-side*15],[2,-side*4],[16,side*2],[28+p*8,side*6]],'#fff3c0',2);
  }else if(move==='whip_kick'){
    // Contact coordinates already follow the incoming sweep tangent.
    c.strokeStyle=light;c.lineWidth=2;
    c.beginPath();c.moveTo(-12,-side*8);c.quadraticCurveTo(8,side*(15+p*8),29+p*12,side*4);c.stroke();
    for(let i=0;i<4;i++)fleck(c,15+p*20+i*4,side*(i-1.5)*4,side*.15,4,light);
  }else if(move==='poke_eye'){
    for(const s of [-1,1]){c.save();c.translate(s*4,-s*3);line(c,[[-3-p*3,0],[3+p*3,0]],light,1);line(c,[[0,-8-p*4],[0,8+p*4]],'#fff6ff',1);c.restore();}
  }else if(move==='kick_knee'){
    // Screen-down creases keep a low heel strike distinct from a sweeping kick.
    c.rotate(-angle);
    for(let i=0;i<3;i++)line(c,[[i*6-8,-5],[i*7-4,3],[i*8-7,13+p*9]],i%2?tint:light,2-i*.4);
  }else if(move==='slap_combo'){
    for(let i=0;i<5;i++){const a=side*(i-2)*.22,r=13+p*17;line(c,[[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+9),Math.sin(a)*(r+9)]],i%2?tint:light,2);}
  }else if(move==='weapon_strike'){
    c.rotate(-angle-.55);
    line(c,[[0,-27-p*10],[0,27+p*10]],'#f7ffff',2);
    line(c,[[4,-19-p*8],[4,17+p*8]],tint,1);
    for(let i=0;i<4;i++)fleck(c,(i%2?1:-1)*(7+p*13),(i-1.5)*11,-.6,3,light);
  }c.restore();
}


global.CombatFxPaint={accents,segmentGap,recovery,trailLife,contactLife,kinetic,attached,motionProgress,drawMoveTrail,drawMoveContact,drawDefense};
})(typeof window!=='undefined'?window:globalThis);

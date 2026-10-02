// PROTOTYPE: force silhouettes and deterministic debris, attached to existing hits.
export const accents = {
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
function volume(c,end,bend,thickness,color,alpha=.7){
  c.save();c.globalAlpha*=alpha;
  const g=c.createLinearGradient(0,0,Math.max(1,end),0);g.addColorStop(0,color+'00');g.addColorStop(.32,color+'35');g.addColorStop(.78,color+'c0');g.addColorStop(1,'#fff5dc');
  c.fillStyle=g;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(end*.4,bend+thickness,end,0);c.quadraticCurveTo(end*.65,bend-thickness,0,0);c.fill();c.restore();
}
const silhouettes={
  fist:[[-15,-6],[-7,-8],[-3,-11],[1,-11],[3,-9],[6,-9],[9,-6],[10,-2],[8,1],[9,5],[6,9],[-1,10],[-7,6],[-15,6]],
  palm:[[-13,-5],[-7,-7],[5,-10],[8,-9],[8,-7],[0,-4],[12,-6],[15,-4],[13,-1],[2,1],[14,-1],[16,2],[13,5],[2,5],[10,5],[12,8],[8,11],[-3,10],[-5,15],[-9,15],[-10,11],[-8,5],[-13,5]],
  sole:[[-15,-5],[-10,-8],[-3,-6],[4,-9],[12,-8],[16,-4],[17,3],[13,8],[5,9],[-3,6],[-10,8],[-15,5]],
  boot:[[-15,-11],[-5,-10],[-4,-3],[7,-3],[14,1],[16,6],[12,9],[-14,9]],
  fingers:[[-16,-4],[-7,-6],[10,-13],[13,-12],[13,-9],[-1,-2],[14,-6],[17,-4],[16,-1],[0,4],[-3,10],[-8,10],[-11,5],[-16,5]]
};
function stamp(c,kind,x,y,scale,color,rotation=0,alpha=1){
  c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);c.globalAlpha*=alpha;
  const pts=silhouettes[kind];
  c.save();c.translate(-1,2);path(c,pts);c.fillStyle='#342e2890';c.fill();c.restore();
  const g=c.createLinearGradient(-8,12,6,-12);g.addColorStop(0,'#765b4a');g.addColorStop(.4,color);g.addColorStop(1,'#fff0ce');
  path(c,pts);c.fillStyle=g;c.fill();c.strokeStyle=color+'d0';c.lineWidth=.8;c.stroke();
  const dark='#5a423b95',light='#fff4dbaa';
  if(kind==='fist'){
    line(c,[[-7,-5],[-1,-8],[3,-6],[6,-6]],light,1.4);line(c,[[1,-6],[2,2],[7,2]],dark,1.2);line(c,[[-7,2],[-2,1],[0,7]],dark,1.2);
  }else if(kind==='palm'){
    line(c,[[-6,-2],[-1,0],[-3,6]],dark,1.1);line(c,[[-5,6],[-1,8],[5,7]],dark,.8);line(c,[[-5,-5],[5,-8]],light,.9);
  }else if(kind==='sole'){
    for(let x=3;x<=11;x+=4)line(c,[[x,-5],[x+2,5]],dark,2);
    path(c,[[-11,-4],[-6,-4],[-6,4],[-11,4]]);c.fillStyle=dark;c.fill();line(c,[[-13,-5],[-9,-6],[-3,-4],[5,-7],[12,-6]],light,1);
  }else if(kind==='boot'){
    line(c,[[-13,6],[13,6]],dark,3);line(c,[[-4,0],[1,-1],[5,1]],light,1);line(c,[[-12,-8],[-8,-8],[-7,-2]],light,.9);
  }else{
    line(c,[[-12,-2],[-5,-3],[9,-10]],light,1);line(c,[[-9,5],[-4,6],[0,2]],dark,1);
  }c.restore();
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
export function drawMoveTrail(c,{move,length,progress,side,age,wind,burst}){
  const color=accents[move].color,end=length*progress,tail=Math.min(end,56),start=end-tail;
  const formAlpha=age<0?1:Math.max(0,1-age/115)*.7;
  if(wind<.5)glow(c,0,0,11,color,Math.sin(wind/.5*Math.PI)*.35);
  if(move==='jab'){
    c.save();c.translate(start,0);volume(c,tail,0,8,color,.8);c.restore();stamp(c,'fist',end-12,0,1.05,color,0,formAlpha);stamp(c,'fist',end-28,0,.8,color,0,formAlpha*.18);
  }else if(move==='swing_punch'){
    volume(c,end,side*30,side*24,color,.8);volume(c,end,side*38,side*4,'#fff0c3',.7);stamp(c,'fist',end-15,0,1.3,color,-side*.3,formAlpha);stamp(c,'fist',end-32,side*12,.98,color,-side*.7,formAlpha*.25);
  }else if(move==='front_kick'){
    volume(c,end,0,15,color,.6);pressure(c,end-18,0,color,16);stamp(c,'sole',end-14,0,1.05,color,side*.1,formAlpha);
  }else if(move==='whip_kick'){
    volume(c,end,side*43,side*26,color,.75);volume(c,end,side*47,side*5,'#e8ffed',.95);volume(c,end*.85,side*57,side*9,color,.25);stamp(c,'boot',end-12,0,.9,color,-side*.45,formAlpha);
  }else if(move==='poke_eye'){
    c.save();c.translate(start,0);volume(c,tail,-3,3,color,.55);c.restore();stamp(c,'fingers',end-15,3,.95,color,0,formAlpha);
  }else if(move==='kick_knee'){
    c.save();c.translate(start,0);volume(c,tail,-6,12,color,.65);c.restore();stamp(c,'boot',end-14,-1,1.15,color,side*.12,formAlpha);
  }else if(move==='shove'){
    volume(c,end,0,24,color,.4);pressure(c,end-10,0,color,25);for(const s of [-1,1])stamp(c,'palm',end-15,s*12,.8,color,-s*.15,formAlpha);
  }else if(move==='slap_combo'){
    volume(c,end,side*24,side*23,color,.65);for(let i=0;i<3;i++)volume(c,end-i*3,side*(29+i*7),side*2,'#ffd3bc',.35);stamp(c,'palm',end-13,0,1.15,color,side*.4,formAlpha);
  }else if(move==='weapon_strike'){
    volume(c,end,-side*25,side*22,color,.55);volume(c,end+4,-side*26,side*6,'#efffff',.95);glow(c,end-5,0,13,color,.35);path(c,[[end-24,side*7],[end+8,-side*5],[end-7,side*8]]);c.fillStyle='#f2ffff';c.fill();
  }
  if(burst){glow(c,end-15,0,30,'#ffc56c',.5);volume(c,end,side*12,10,'#ffd28a',.35);}
}
export function drawMoveContact(c,move,q,side){
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
export function drawMoveGround(c,move,q,angle){
  if(!['front_kick','kick_knee','whip_kick','shove'].includes(move))return;
  // Grounded at the recipient's feet, independent of airborne contact position.
  c.save();c.rotate(angle);c.scale(1,.35);c.globalAlpha*=.5;smoke(c,4,0,q,'#bda785',7,7,31);c.restore();
}
export function drawDefense(c,result,q){
  if(result==='parry'){
    c.save();c.rotate(Math.PI);pressure(c,0,q,'#badacc',16);chips(c,q,'#cfebe0',5,20);c.restore();
    glow(c,-2,0,16,'#c6e6d1',.35);
  }else{
    path(c,[[-12,-10],[0,-15],[12,-10],[9,8],[0,15],[-9,8]]);
    const g=c.createLinearGradient(-12,-10,12,15);g.addColorStop(0,'#d8fff355');g.addColorStop(.5,'#a4d3c733');g.addColorStop(1,'#739e9310');c.fillStyle=g;c.fill();
  }
}
// Reused by the readable-motion variant; the earlier volume comparison is unchanged.
export { stamp, pressure, chips, glow };

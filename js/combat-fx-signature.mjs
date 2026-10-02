// PROTOTYPE: recognize the move from its moving silhouette, path and contact.
// Silhouettes travel along their actual arcs; they do not hover at a beam endpoint.
import { stamp, pressure, chips, drawMoveContact as volumeContact, drawDefense as volumeDefense } from './combat-fx-volumes.mjs';
export const accents={
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
export const segmentGap=360,recovery=220,trailLife=240,contactLife=280,kinetic=true;
const clamp=t=>Math.min(1,Math.max(0,t));
export const motionProgress=wind=>Math.pow(clamp((wind-.2)/.8),1.45);
const curves={jab:0,front_kick:0,swing_punch:17,whip_kick:14,poke_eye:0,kick_knee:0,shove:0,slap_combo:23,weapon_strike:0};
// Accent colors describe the move visually, not elemental damage or game states.
const paints={jab:['#ffc847','#ff794b'],front_kick:['#38d9ef','#3b85ff'],swing_punch:['#ff9443','#ee486b'],whip_kick:['#5de6c6','#278fdc'],poke_eye:['#e4b7ff','#a077ed'],kick_knee:['#efb353','#e77443'],shove:['#71d6fa','#5577ef'],slap_combo:['#ff9bc0','#df568e'],weapon_strike:['#c4f6ff','#51acf0']};
function pt(move,t,length,side,angle=0){
  // Lift remains screen-up when actor/limb/direction change, rather than turning into a ground sweep.
  const lift=move==='whip_kick'?26:move==='weapon_strike'?34:0,s=Math.sin(Math.PI*t),d=Math.PI*Math.cos(Math.PI*t);
  return {x:length*t-Math.sin(angle)*s*lift,y:s*(curves[move]*side-Math.cos(angle)*lift),dx:length-Math.sin(angle)*d*lift,dy:d*(curves[move]*side-Math.cos(angle)*lift)};
}
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
function ribbon(c,move,p,length,side,color,width,alpha=1,angle=0){
  const first=Math.max(0,p-.65),upper=[],lower=[];
  for(let i=0;i<=18;i++){
    const t=first+(p-first)*i/18,v=pt(move,t,length,side,angle),{dx,dy}=v,m=Math.hypot(dx,dy)||1;
    const w=width*Math.sin(i/18*Math.PI*.8)*.5;
    upper.push([v.x-dy/m*w,v.y+dx/m*w]);lower.unshift([v.x+dy/m*w,v.y-dx/m*w]);
  }
  c.save();c.globalAlpha*=alpha;
  const g=c.createLinearGradient(first*length,0,Math.max(first*length+.01,p*length),0);g.addColorStop(0,color+'00');g.addColorStop(.5,color+'80');g.addColorStop(1,color+'ed');polygon(c,[...upper,...lower],g);
  c.strokeStyle='#1b344b70';c.lineWidth=.8;c.stroke();c.restore();
}
function palmFront(c,x,y,scale,color,tilt){
  c.save();c.translate(x,y);c.rotate(tilt);c.scale(scale,scale);
  const g=c.createLinearGradient(-9,12,6,-16);g.addColorStop(0,'#776653');g.addColorStop(.5,color);g.addColorStop(1,'#fff2d6');
  polygon(c,[[-5,13],[-8,6],[-13,-1],[-12,-4],[-9,-4],[-6,0],[-6,-12],[-4,-15],[-2,-13],[-1,-3],[-1,-17],[1,-19],[3,-16],[3,-3],[4,-15],[6,-16],[8,-13],[7,-2],[9,-10],[11,-10],[12,-7],[10,6],[6,13]],g);
  c.strokeStyle='#75674e99';c.lineWidth=1;c.beginPath();c.moveTo(-4,3);c.quadraticCurveTo(1,-1,5,2);c.moveTo(-3,6);c.lineTo(3,8);c.stroke();c.restore();
}
function blade(c,x,y,angle){
  c.save();c.translate(x,y);c.rotate(angle);
  polygon(c,[[-24,-4],[14,-3],[27,0],[14,4],[-24,4]],'#eaf9ec');
  polygon(c,[[-24,0],[27,0],[14,4],[-24,4]],'#80b4bd');
  polygon(c,[[-25,-9],[-21,-9],[-21,9],[-25,9]],'#c8a775');
  polygon(c,[[-37,-3],[-25,-3],[-25,3],[-37,3]],'#71634b');c.restore();
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
function instep(c,x,y,rotation,color){
  // A pointed, extended ankle and instep, contrasting with the heel-led front kick.
  c.save();c.translate(x,y);c.rotate(rotation);
  const g=c.createLinearGradient(-19,-9,10,7);g.addColorStop(0,'#7d9586');g.addColorStop(.5,color);g.addColorStop(1,'#eef5d8');
  polygon(c,[[-24,-16],[-16,-13],[-15,-7],[-8,-4],[2,-1],[12,2],[16,6],[13,9],[4,8],[-8,3],[-18,0],[-23,-5]],g);
  c.strokeStyle='#648b80';c.lineWidth=1.3;c.beginPath();c.moveTo(-17,0);c.quadraticCurveTo(-2,5,13,7);c.stroke();c.restore();
}
export function drawMoveTrail(c,{move,length,progress,side,age,wind,result,angle}){
  const color=accents[move].color,paint=paints[move][0];
  // The readable wind-up lasts ~70–100ms. No impact or fake extra hit in this phase.
  let p=progress,alpha=1;
  if(age>=0){
    const retract=['jab','front_kick','kick_knee','poke_eye'].includes(move);
    p=retract?1-.25*clamp(age/trailLife):1+Math.min(move==='shove'?.07:.17,age/900);
    alpha=Math.max(0,1-age/trailLife);
  }
  const limited=['parry','armor','dry'].includes(result);
  if(limited&&age>=0)p=1-Math.min(.18,age/800);
  const v=pt(move,p,length,side,angle);
  const tangent=Math.atan2(v.dy,v.dx);
  const hand=(kind,scale,rotation,alpha=1)=>{
    const reach=({fist:10,palm:16,sole:17,boot:16,fingers:17}[kind])*scale;
    stamp(c,kind,v.x-Math.cos(rotation)*reach,v.y-Math.sin(rotation)*reach,scale,color,rotation,alpha);
  };
  if(wind<.2){v.x=-3;v.y=['front_kick','kick_knee'].includes(move)?0:side*Math.sin(wind/.2*Math.PI)*6;}
  const width={jab:9,front_kick:15,swing_punch:24,whip_kick:29,poke_eye:4,kick_knee:13,shove:16,slap_combo:24,weapon_strike:19}[move];
  if(wind>.2){
    if(move==='shove')for(const s of [-1,1]){c.save();c.translate(s*9*Math.cos(angle),-s*9*Math.sin(angle));ribbon(c,move,p,length,side,paint,8,.6,angle);c.restore();}
    else{
      ribbon(c,move,p,length,side,paint,width,move==='poke_eye'?.45:.85,angle);
      if(['swing_punch','whip_kick','slap_combo','weapon_strike'].includes(move)){
        c.save();c.translate(0,side*4);ribbon(c,move,Math.max(0,p-.06),length,side,paints[move][1],3,.6,angle);c.restore();
      }
    }
  }
  c.save();c.globalAlpha*=alpha;
  // A moving, shaded silhouette remains readable before and just after contact.
  if(move==='jab')hand('fist',1.04,tangent*.35);
  if(move==='swing_punch'){
    hand('fist',1.35,tangent*.7);
    if(wind>.45&&age<0){const old=pt(move,Math.max(0,p-.17),length,side);stamp(c,'fist',old.x-8,old.y,1.12,color,tangent,.18);}
  }
  if(move==='front_kick'){
    // A compact chamber leads into a straight heel drive, with toes hooked up.
    const lift=age<0?(1-clamp(p/.35))*6:0;
    const tilt=-angle+side*(1-clamp(p/.45))*.18;
    frontSole(c,v.x-Math.sin(angle)*lift,v.y-Math.cos(angle)*lift,tilt,color,.82+.2*clamp(p/.6));
  }
  if(move==='whip_kick'){
    const r=tangent*.65;instep(c,v.x-Math.cos(r)*7,v.y-Math.sin(r)*7,r,color);
    if(wind>.4){c.save();c.globalAlpha*=.45;ribbon(c,move,p,length,side,'#ebffee',5,1,angle);c.restore();}
  }
  if(move==='poke_eye')hand('fingers',1.05,tangent*.3);
  if(move==='kick_knee')frontSole(c,v.x,v.y,-angle+side*.2,color,.65);
  if(move==='shove'){
    // Upright palm faces stay readable in all eight attack directions.
    for(const s of [-1,1])palmFront(c,v.x-5+s*9*Math.cos(angle),v.y-s*9*Math.sin(angle),.76,color,-angle+s*.12);
  }
  if(move==='slap_combo')hand('palm',1.22,tangent*.6+side*.35);
  if(move==='weapon_strike')blade(c,v.x,v.y,-angle-Math.PI/2+side*(-.45+.7*clamp(p)));
  c.restore();
}
export function drawMoveContact(c,move,q,side,angle=0){
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
export function drawDefense(c,result,q){
  volumeDefense(c,result,q);
  if(result==='parry'){
    c.save();c.rotate(Math.PI);c.globalAlpha*=.75;chips(c,q,'#94e6ff',4,24);c.restore();
  }
}

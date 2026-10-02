// PROTOTYPE: acceleration into contact, short local blur, immediate recovery.
export const accents={
  jab:{windup:120,color:'#e4c898',detail:'短蓄力 · 直线加速 · 即打即收'},
  front_kick:{windup:180,color:'#dbc399',detail:'脚跟前送 · 短促蹬入 · 快速回收'},
  swing_punch:{windup:200,color:'#dcba91',detail:'横向重弧 · 一拍打实 · 迅速收拳'},
  whip_kick:{windup:180,color:'#c6d1b8',detail:'弧线加速 · 末端甩击 · 不留风墙'},
  poke_eye:{windup:110,color:'#e7d7b5',detail:'短距双指 · 快进快出 · 局部接触'},
  kick_knee:{windup:145,color:'#cfb698',detail:'低位斜踹 · 鞋跟打入 · 短震回收'},
  shove:{windup:200,color:'#c5ccb4',detail:'双掌同送 · 短程发力 · 受力后退'},
  slap_combo:{windup:135,color:'#deb9a7',detail:'两掌紧接 · 反向抽击 · 段间无停顿'},
  weapon_strike:{windup:190,color:'#d1dfdd',detail:'刃锋加速 · 短促切入 · 余光即散'}
};
export const segmentGap=155;
export const recovery=95;
export const trailLife=65;
export const contactLife=120;
const bends={jab:0,front_kick:0,swing_punch:28,whip_kick:43,poke_eye:0,kick_knee:-6,shove:0,slap_combo:24,weapon_strike:-23};
const widths={jab:4,front_kick:6,swing_punch:7,whip_kick:6,poke_eye:2,kick_knee:5,shove:5,slap_combo:6,weapon_strike:4};
function point(t,length,bend){return [t*length,2*(1-t)*t*bend];}
function path(c,points,fill){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill();}
function stroke(c,points,color,width=1){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();}
function blur(c,length,bend,p,width,color,offset=0){
  const start=Math.max(0,p-.34),top=[],bottom=[];
  for(let i=0;i<=6;i++){
    const t=start+(p-start)*i/6,pt=point(t,length,bend),w=width*(i/6)*.5;
    top.push([pt[0],pt[1]+offset-w]);bottom.unshift([pt[0],pt[1]+offset+w]);
  }
  const g=c.createLinearGradient(start*length,0,Math.max(start*length+.01,p*length),0);g.addColorStop(0,color+'00');g.addColorStop(.7,color+'70');g.addColorStop(1,color+'d0');
  path(c,[...top,...bottom],g);
}
export function drawMoveTrail(c,{move,length,progress,side,age,wind}){
  if(wind<.45||age>trailLife)return;
  const color=accents[move].color,bend=bends[move]*side,width=widths[move];
  const pt=point(progress,length,bend);
  if(move==='shove'){
    blur(c,length,0,progress,width,color,-5);blur(c,length,0,progress,width,color,5);
  }else if(move==='poke_eye'){
    blur(c,length,0,progress,1.5,color,-2);blur(c,length,0,progress,1.5,color,2);
  }else blur(c,length,bend,progress,width,color);
  // A small solid contact surface, never a floating oversized limb icon.
  if(age>0)return;
  c.save();c.translate(...pt);c.rotate(Math.atan2(2*(1-2*progress)*bend,length));
  const g=c.createLinearGradient(-9,4,0,-4);g.addColorStop(0,'#816d59aa');g.addColorStop(1,color);
  if(move==='front_kick'||move==='kick_knee'){
    path(c,[[-11,-4],[-2,-5],[2,-2],[2,4],[-10,4]],g);stroke(c,[[-9,3],[1,3]],'#3b352c99',1.4);
  }else if(move==='shove'){
    for(const y of [-5,5])path(c,[[-7,y-3],[1,y-3],[2,y+2],[-6,y+3]],g);
  }else if(move==='slap_combo'){
    path(c,[[-9,-5],[-1,-5],[2,-2],[1,4],[-8,4]],g);
  }else if(move==='poke_eye'){
    stroke(c,[[-8,-2],[1,-2]],color,1.5);stroke(c,[[-8,2],[1,2]],color,1.5);
  }else if(move==='weapon_strike'){
    path(c,[[-18,3],[4,-2],[-3,3]],'#f3f6e7');
  }else{
    path(c,[[-8,-4],[-1,-4],[2,-1],[1,4],[-7,4]],g);
  }c.restore();
}
export function drawMoveContact(c,move,q,side){
  const color=accents[move].color;
  c.save();c.globalAlpha*=Math.max(0,1-q*1.2);
  if(move==='weapon_strike'){
    path(c,[[-2,-15],[2,-2],[2,15],[-1,2]],'#edf4e4');
  }else if(move==='shove'){
    for(const y of [-6,6])path(c,[[-2,y-4],[2,y-3],[2,y+3],[-2,y+4]],color+'90');
  }else if(move==='poke_eye'){
    for(const y of [-2,2])path(c,[[0,y-3],[1,y],[4,y+1],[0,y+1],[-2,y]],'#f3e8ca');
  }else{
    const r=move==='swing_punch'?9:move==='front_kick'?8:5;
    path(c,[[-r,-2],[-3,-r],[1,-3],[r,-5],[4,0],[r,3],[1,3],[-2,r],[-3,3]],color+'c0');
  }
  // Only a few short ejected flecks; no lingering light or smoke cloud.
  if(!['shove','poke_eye'].includes(move))for(let i=0;i<3;i++){
    const a=(i-1)*.75*side,r=7+q*16;
    stroke(c,[[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+3),Math.sin(a)*(r+3)]],color,1);
  }c.restore();
}

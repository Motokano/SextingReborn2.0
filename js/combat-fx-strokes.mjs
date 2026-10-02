// Display-only attack marks for the prototype. No extra hits or gameplay events.
export const accents = {
  jab: { windup:170, color:'#eee3c4', detail:'短促直线、拳锋残影、紧凑四点冲击' },
  front_kick: { windup:270, color:'#dac696', detail:'蹬出的鞋底、压缩气环、正面推力' },
  swing_punch: { windup:300, color:'#dfb784', detail:'蓄势重弧、拳峰厚边、横向碎屑' },
  whip_kick: { windup:230, color:'#c5d5b5', detail:'长弧逐渐收尖、鞋尖甩梢、细密侧向气痕' },
  poke_eye: { windup:145, color:'#f2e9ce', detail:'双指叉形、极细双轨、两点针芒' },
  kick_knee: { windup:215, color:'#d3ba91', detail:'低位短斜线、硬鞋跟、下压折痕' },
  shove: { windup:320, color:'#c6d1b0', detail:'并列双掌、宽面压波、无尖锐爆点' },
  slap_combo: { windup:180, color:'#e2bd9f', detail:'两次反向掌影、指缝拖痕、扇形接触' },
  weapon_strike: { windup:255, color:'#d3e2de', detail:'细长刀锋、锐利切面、少量断裂亮屑' }
};
function line(c,points,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();}
function shape(c,points,color,fill=true){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=color;if(fill)c.fill();c.strokeStyle=color;c.lineWidth=1;c.stroke();}
function curve(c,end,bend,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(end*.5,bend,end,0);c.stroke();}
function ribbon(c,end,bend,thickness,color){
  c.fillStyle=color;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(end*.40,bend+thickness,end,0);c.quadraticCurveTo(end*.62,bend-thickness*.35,0,0);c.fill();
}
function ring(c,x,y,rx,ry,color,start=0,end=Math.PI*2){c.strokeStyle=color;c.lineWidth=1.15;c.beginPath();c.ellipse(x,y,rx,ry,0,start,end);c.stroke();}
function stamp(c,kind,x,y,scale,color,rotation=0){
  c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);c.globalAlpha*=.82;
  // Stylized force silhouettes, detached from the standing pawn artwork.
  if(kind==='fist'){
    const pts=[[-10,-5],[-3,-7],[0,-8],[3,-7],[4,-5],[7,-4],[8,-1],[7,2],[8,4],[6,7],[0,8],[-4,5],[-10,5]];
    c.save();c.globalAlpha*=.2;shape(c,pts,color);c.restore();shape(c,pts,color,false);
    line(c,[[1,-5],[2,4],[6,4]],color,.9);line(c,[[4,-3],[7,-2]],color,.9);line(c,[[-4,1],[0,1],[1,5]],color,.9);
  }else if(kind==='palm'){
    const pts=[[-11,-5],[-5,-7],[6,-8],[8,-7],[8,-5],[1,-4],[11,-4],[12,-2],[11,0],[2,0],[12,0],[13,2],[11,4],[1,4],[8,4],[9,6],[7,8],[-3,8],[-5,13],[-8,13],[-9,10],[-7,5],[-11,5]];
    c.save();c.globalAlpha*=.14;shape(c,pts,color);c.restore();shape(c,pts,color,false);line(c,[[-6,-2],[-2,0],[-3,5]],color,.7);
  }else if(kind==='sole'){
    const pts=[[-12,-4],[-8,-6],[-2,-5],[3,-7],[10,-6],[13,-3],[13,3],[10,6],[3,7],[-2,5],[-8,6],[-12,4]];
    c.save();c.globalAlpha*=.16;shape(c,pts,color);c.restore();shape(c,pts,color,false);
    for(let x=2;x<=9;x+=3)line(c,[[x,-4],[x+1,4]],color,.8);
    line(c,[[-9,-3],[-5,-3],[-5,3],[-9,3]],color,.8);
  }else if(kind==='heel'){
    shape(c,[[-12,-6],[-4,-6],[-4,-1],[9,-1],[13,2],[12,5],[-12,5]],color,false);
    line(c,[[-11,7],[12,7]],color,1.5);
  }else if(kind==='fingers'){
    line(c,[[-11,5],[-5,3],[12,-3]],color,2.1);
    line(c,[[-8,0],[-3,-2],[11,-9]],color,2.1);
    line(c,[[-9,5],[-5,7],[-1,5]],color,1);
  }
  c.restore();
}

export function drawMoveTrail(c,{move,length,progress,side,age,wind,burst}){
  const color=accents[move].color,end=length*progress;
  const ink='#fff5d7';
  // Wind-up stays around the acting limb; it never creates an extra contact.
  if(wind<.45){c.save();c.globalAlpha*=Math.sin(wind/.45*Math.PI)*.6;ring(c,-3,0,6,10,color,Math.PI*.55,Math.PI*1.45);c.restore();}
  if(move==='jab'){
    shape(c,[[Math.max(0,end-38),-2],[end,0],[Math.max(0,end-38),2]],color);
    line(c,[[end*.12,-7],[end*.70,-5]],color+'70',.8);
    line(c,[[end*.22,7],[end*.72,5]],color+'55',.8);
    stamp(c,'fist',end-3,0,.72,color);
    c.save();c.globalAlpha*=.23;stamp(c,'fist',end-16,0,.56,color);c.restore();
  }else if(move==='swing_punch'){
    const bend=side*29;
    c.save();c.globalAlpha*=.20;ribbon(c,end,bend,side*15,color);c.restore();
    ribbon(c,end,bend,side*5,color);curve(c,end,bend+side*3,ink,.9);
    curve(c,end*.91,bend+side*13,color+'65',1);
    stamp(c,'fist',end-5,0,.95,color,-side*.35);
    for(let i=0;i<3;i++)line(c,[[end*.45+i*6,bend*.65+side*7],[end*.55+i*6,bend*.58+side*5]],color+'80',.8);
  }else if(move==='front_kick'){
    c.save();c.globalAlpha*=.14;shape(c,[[0,-3],[end-5,-12],[end+3,0],[end-5,12],[0,3]],color);c.restore();
    line(c,[[0,-3],[end-14,-8]],color+'90',1.4);line(c,[[0,3],[end-14,8]],color+'90',1.4);
    ring(c,end-12,0,3,12,color+'65',-Math.PI*.45,Math.PI*.45);
    if(age<0)stamp(c,'sole',end-2,0,.86,color,side*.15);
  }else if(move==='whip_kick'){
    const bend=side*43;
    c.save();c.globalAlpha*=.16;ribbon(c,end,bend,side*15,color);c.restore();
    ribbon(c,end,bend,side*3,color);curve(c,end,bend,ink,.85);
    for(let i=0;i<3;i++)curve(c,end*(.88+i*.03),bend+side*(8+i*5),color+(i===0?'80':'38'),.8);
    if(age<0)stamp(c,'heel',end-6,0,.63,color,-side*.5);
    // The narrow tip finishes the same hit, rather than drawing a second impact.
    line(c,[[end-10,side*5],[end+5,0]],ink,1.1);
  }else if(move==='poke_eye'){
    line(c,[[0,1],[end-10,-1]],color+'85',.8);line(c,[[0,-3],[end-10,-6]],color+'85',.8);
    stamp(c,'fingers',end-10,3,.78,color);
  }else if(move==='kick_knee'){
    shape(c,[[0,-3],[end-16,-5],[end+2,2],[end-17,3]],color+'90');
    line(c,[[end*.1,7],[end*.6,9],[end*.84,4]],color+'65',1);
    if(age<0)stamp(c,'heel',end-3,0,.82,color,side*.2);
  }else if(move==='shove'){
    for(const s of [-1,1]){
      c.save();c.globalAlpha*=.2;ribbon(c,end*.96,s*9,s*6,color);c.restore();
      curve(c,end*.88,s*9,color+'90',1);
      if(age<0)stamp(c,'palm',end-4,s*10,.65,color,-s*.16);
    }
    ring(c,end-2,0,4,23,color+'80',-Math.PI*.46,Math.PI*.46);
  }else if(move==='slap_combo'){
    const bend=side*20;
    c.save();c.globalAlpha*=.13;ribbon(c,end,bend,side*13,color);c.restore();
    for(let i=0;i<4;i++)curve(c,end-i*2,bend+side*i*4,color+(i===0?'bb':'55'),i===0?1.4:.8);
    if(age<0)stamp(c,'palm',end-4,0,.84,color,side*.45);
  }else if(move==='weapon_strike'){
    const bend=-side*21;
    c.save();c.globalAlpha*=.22;ribbon(c,end,bend,side*7,color);c.restore();
    ribbon(c,end,bend,side*2.5,color);curve(c,end,bend,ink,1.15);
    line(c,[[end-14,side*6],[end+4,-side*3]],'#f1faf0',1.6);
    line(c,[[end*.08,-side*3],[end*.5,-side*15]],color+'70',.7);
  }
  if(burst){c.save();c.globalAlpha*=.35;curve(c,end,side*12,'#edc379',6);c.restore();}
}

export function drawMoveContact(c,move,q,side){
  const color=accents[move].color;
  // Contact remains centered and decays once. Secondary traces are material, not hits.
  const expand=1+q*.65;
  if(move==='jab'){
    for(let i=0;i<4;i++){const a=Math.PI*.25+i*Math.PI*.5,r=4+q*13;line(c,[[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+4),Math.sin(a)*(r+4)]],color,1.5);}
    c.fillStyle='#fff5d7';c.fillRect(-2,-2,4,4);
  }else if(move==='front_kick'){
    stamp(c,'sole',0,0,expand*.8,color);
    ring(c,3+q*6,0,4+q*7,14+q*8,color+'b0',-Math.PI*.48,Math.PI*.48);
    for(const s of [-1,1])line(c,[[3,s*(10+q*4)],[12+q*10,s*(15+q*8)]],color+'a0',1.2);
  }else if(move==='shove'){
    for(const s of [-1,1])stamp(c,'palm',0,s*9,.6,color,-s*.16);
    ring(c,5+q*12,0,5+q*5,23+q*6,color+'95',-Math.PI*.45,Math.PI*.45);
  }else if(move==='poke_eye'){
    for(const s of [-1,1]){const x=s*3,y=-s*3;line(c,[[x-2-q*4,y],[x+2+q*4,y]],color,1);line(c,[[x,y-3-q*3],[x,y+3+q*3]],'#fff9e6',.8);}
  }else if(move==='slap_combo'){
    stamp(c,'palm',0,0,.8,color,side*.45);
    for(let i=0;i<5;i++){const a=side*(i*.2-.4);const r=13+q*17;line(c,[[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+5),Math.sin(a)*(r+5)]],color,1);}
  }else if(move==='kick_knee'){
    line(c,[[-6,-8],[2,0],[-5,8]],color,2*(1-q)+.5);
    stamp(c,'heel',0,0,.66,color,.25);
    for(let i=0;i<4;i++)line(c,[[3+i*4,4+q*6],[5+i*4,8+q*13]],color+'90',.9);
  }else if(move==='weapon_strike'){
    shape(c,[[-4,-(18+q*10)],[3,-3],[4,20+q*10],[-2,3]],color);
    for(let i=0;i<4;i++){const x=7+q*22+i*2,y=(i-1.5)*8;line(c,[[x,y],[x+3,y-2]],i%2?color:'#f1f6de',1);}
  }else if(move==='whip_kick'){
    line(c,[[-8,-side*7],[3,0],[-8,side*7]],color,2.2);
    for(let i=0;i<5;i++){const x=5+q*23+i*3,y=side*(i-2)*4;line(c,[[x,y],[x+5,y+side*2]],color,.9);}
  }else{
    // A broad asymmetric shock for the swing punch, deliberately heavier than jab.
    c.save();c.globalAlpha*=.5;
    shape(c,[[-7,-4],[-3,-14],[3,-5],[12,-8],[6,0],[17,4],[5,6],[0,13],[-3,5],[-10,9]],color);
    c.restore();
    for(let i=0;i<6;i++){const a=(i-2.5)*.38,r=15+q*26;line(c,[[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a)*(r+6),Math.sin(a)*(r+6)]],i%2?color:'#f2d9b6',1.2);}
  }
}

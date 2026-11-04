// PROTOTYPE V01: Does a breathing white-gold mantle read as an active state at 144px?
// Pure display time. No buff writes, combat events, pawn edits or gameplay timing.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const p=clamp(n);return p*p*(3-2*p);};
const ease=n=>1-(1-clamp(n))**3;
const mix=(a,b,p)=>a+(b-a)*p;
const noise=n=>{const p=Math.sin(n*127.1+311.7)*43758.5453;return p-Math.floor(p);};
const TAU=Math.PI*2;
export const timing={inhale:600,ignite:1400,settle:2050};

function mist(ctx,x,y,r,alpha=.3,color='#ddd3b6',stretch=1,angle=0){
  if(r<=0||alpha<=0)return;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(stretch,1);ctx.globalAlpha*=alpha;
  const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,color+'b0');g.addColorStop(.4,color+'55');g.addColorStop(1,color+'00');
  ctx.fillStyle=g;ctx.fillRect(-r,-r,2*r,2*r);ctx.restore();
}
function flake(ctx,x,y,r,angle,alpha,color='#fff2ce',stretch=1){
  if(alpha<=0)return;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(stretch,1);ctx.globalAlpha*=alpha;
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-r,-r*.2);ctx.lineTo(r*.05,-r*.55);ctx.lineTo(r,r*.08);ctx.lineTo(-r*.25,r*.45);ctx.closePath();ctx.fill();ctx.restore();
}
function curve(a,b,c,d,p){const q=1-p;return{x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};}
// Broad, broken volume around the shoulders/arms; never a drawn limb or a closed shell.
function plume(ctx,t,side,front,power,release,compression=0,pulse=0){
  const breath=Math.sin(t/470)*.5+.5;
  const spread=(1+breath*.08+release*.5+pulse*.22)*(1-compression*.8);
  const a={x:side*14*spread,y:-7},b={x:side*34*spread,y:-25};
  const c={x:side*29*spread,y:-52},d={x:side*10,y:-65-release*12};
  for(let i=0;i<30;i++){
    const phase=(t/(1100+noise(i+8)*700)+i/30)%1;
    if((i%3===0)!==front)continue;
    const p=curve(a,b,c,d,phase),j=(noise(i+12)-.5)*7;
    const alpha=Math.sin(phase*Math.PI)**.8*power;
    const x=p.x+j,y=p.y+(noise(i+38)-.5)*4;
    mist(ctx,x,y,(front?3.4:6)+noise(i+83)*3,alpha*(front?.36:.51),i%4?'#eee3c8':'#a7b1ab',1.45,-1.3*side);
    if(i%2===0)flake(ctx,x,y,1.2+noise(i+63)*1.3,-1.35*side,alpha*.6,'#fff1cd',2.2);
  }
  // An uneven tapered sliver inside the mist supplies readable body at game scale.
  for(let i=0;i<3;i++){
    if(front!==(i===1))continue;
    const u=(t/1700+i*.32)%1,start=clamp(u-.24),end=clamp(u+.1);
    ctx.save();ctx.globalAlpha*=Math.sin(u*Math.PI)*power*.44;ctx.fillStyle='#f5e8c9';ctx.beginPath();
    for(let j=0;j<=12;j++){const p=mix(start,end,j/12),v=curve(a,b,c,d,p),w=Math.sin(j/12*Math.PI)*(2.5+breath);j?ctx.lineTo(v.x+w,v.y):ctx.moveTo(v.x+w,v.y);}
    for(let j=12;j>=0;j--){const p=mix(start,end,j/12),v=curve(a,b,c,d,p),w=Math.sin(j/12*Math.PI)*1.1;ctx.lineTo(v.x-w,v.y);}
    ctx.closePath();ctx.fill();ctx.restore();
  }
}
function expansion(ctx,q,front){
  if(q<0||q>1)return;
  const fade=(1-q)**1.5,r=12+ease(q)*39;
  for(let i=0;i<30;i++){
    const a=i/30*TAU+.15;
    if((Math.sin(a)>.15)!==front)continue;
    const x=Math.cos(a)*r,y=-30+Math.sin(a)*r*.73;
    mist(ctx,x,y,4+q*6,fade*.72,'#eee2bd',2,a+Math.PI/2);
    flake(ctx,x,y,1.1+noise(i+54)*1.3,a,fade*.7,'#fff4d9',1.8);
  }
}
export function stateAt(t,events){
  const last=events.at(-1),end=last.hitAt+260;
  const attack=events.find(e=>t>=e.at&&t<e.hitAt+430);
  const remaining=t<timing.ignite?0:Math.max(0,3-events.filter(e=>t>=e.hitAt).length);
  const fade=1-smooth((t-end)/800);
  const strength=smooth((t-timing.ignite)/260)*fade;
  let compress=0;
  if(attack&&t<attack.hitAt)compress=smooth((t-attack.at)/(attack.hitAt-attack.at))*.24;
  const pulse=attack&&t>=attack.hitAt?(1-clamp((t-attack.hitAt)/330))*.6:0;
  return {remaining,end,attack,fade,compression:compress,pulse,strength:strength*(1-compress+pulse),dissolving:t>=end&&t<end+800};
}
export function drawAura(ctx,{time,events,layer,rim}){
  const state=stateAt(time,events),front=layer==='front';
  ctx.save();
  if(time>=timing.inhale&&time<timing.ignite){
    const q=(time-timing.inhale)/(timing.ignite-timing.inhale);
    for(let i=0;i<40;i++){
      if((i%3===0)!==front)continue;
      const p=clamp((q-noise(i+17)*.3)/.7),a=noise(i+3)*TAU,r=(1-ease(p))*(30+noise(i)*22)+4;
      const x=Math.cos(a)*r,y=-31+Math.sin(a)*r*.72,alpha=Math.sin(p*Math.PI)*.8;
      mist(ctx,x,y,3+noise(i+5)*3,alpha*.4,'#e5dec4',1.6,a);
      flake(ctx,x,y,1+noise(i+9),a,alpha,'#e5dfc8',2);
    }
    if(front)mist(ctx,0,-32,12,q*q*.35,'#fff0c5');
  }
  expansion(ctx,(time-timing.ignite)/650,front);
  if(state.strength>0){
    const release=state.dissolving?smooth((time-state.end)/800):0;
    plume(ctx,time,-1,front,state.strength,release,state.compression,state.pulse);
    plume(ctx,time+340,1,front,state.strength,release,state.compression,state.pulse);
    if(!front){
      mist(ctx,-16,-37,20,state.strength*.16,'#dfd9bd',.7);
      mist(ctx,16,-36,20,state.strength*.16,'#dfd9bd',.7);
    }else{
      // The source's alpha creates only a thin rim. Pawn pixels remain untouched.
      ctx.save();ctx.globalAlpha=state.strength*(.46+Math.sin(time/470)*.12);
      ctx.drawImage(rim.image,rim.x,rim.y,rim.w,rim.h);ctx.restore();
      for(let i=0;i<9;i++){
        const p=(time/2400+i/9)%1,a=i*2.4,x=Math.cos(a)*(23+p*6),y=-8-p*60;
        flake(ctx,x,y,.7+noise(i)*.7,-1.3,state.strength*Math.sin(p*Math.PI)*.65,'#fff3d4',1.4);
      }
    }
  }
  if(state.dissolving){
    const q=clamp((time-state.end)/800);
    for(let i=0;i<26;i++){
      if((i%3===0)!==front)continue;
      const side=i%2?1:-1,x=side*(19+ease(q)*(9+noise(i)*15)),y=-14-noise(i+5)*45-q*15;
      flake(ctx,x,y,(1-q)*(1+noise(i+15)*1.7),-1.3,Math.sin(q*Math.PI)*.65,'#e7dfc6',2);
    }
  }
  ctx.restore();
}
// Additive breath accent over the existing move; especially preserves V04 knee geometry.
export function drawBurstStrike(ctx,e,time,g){
  const wind=(time-e.at)/(e.hitAt-e.at),age=time-e.hitAt,s=g.scale;
  if(wind<.62||age>430)return;
  const knee=e.move==='collar_knee';
  const root=knee?{x:g.dest.x-5*s,y:g.dest.y+33*s}:g.from;
  const origin={x:root.x/s,y:root.y/s},dest={x:g.dest.x/s,y:g.dest.y/s};
  const angle=knee?-Math.PI/2:Math.atan2(dest.y-origin.y,dest.x-origin.x);
  ctx.save();ctx.scale(s,s);
  // A compressed wake follows the strike. It is not a second projectile.
  for(let i=0;i<34;i++){
    const birth=.64+i/34*.36,u=(wind-birth)/.31;
    if(u<0||u>1)continue;
    const p=ease(clamp((birth-.64)/.36)),j=(noise(i+71)-.5)*(7+u*9);
    const x=mix(origin.x,dest.x,p)-Math.sin(angle)*j,y=mix(origin.y,dest.y,p)+Math.cos(angle)*j;
    const a=Math.sin(u*Math.PI)*(1-u)*.8;
    mist(ctx,x,y,4.5+noise(i+17)*3,a,'#ece4cd',1.7,angle);
    if(i%3===0)flake(ctx,x,y,1.4+noise(i+31)*1.6,angle,a,'#fff8e3',2.5);
  }
  // Actual contact only; the original attack keeps its distinctive coloured core.
  if(age>=0&&['hit','armor','parry'].includes(e.result)){
    const q=clamp(age/430),gain=e.result==='hit'?1:.5,r=5+ease(q)*(knee?39:31);
    ctx.save();ctx.translate(dest.x,dest.y);ctx.rotate(angle);
    for(let i=0;i<24;i++){
      const a=i/24*TAU,xx=Math.cos(a)*r*.43,yy=Math.sin(a)*r;
      mist(ctx,xx,yy,3.5+q*3,(1-q)**2*gain*.65,'#e5ddc4',1.8,a+Math.PI/2);
      if(i%2===0)flake(ctx,xx,yy,1.2+noise(i+82),a,(1-q)**2*gain*.8,'#fff6dd',1.7);
    }
    for(let i=0;i<20;i++){
      const a=(noise(i+47)-.5)*2.3,r=ease(q)*(23+noise(i+48)*34);
      flake(ctx,Math.cos(a)*r,Math.sin(a)*r,1.1+noise(i+49)*1.7,a,(1-q)**2*gain*.9,'#f7efd5',2);
    }
    ctx.restore();
  }
  ctx.restore();
}

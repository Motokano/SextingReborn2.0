// Frozen user-approved V04 from 2026-10-28. Do not update to follow production changes.
// PROTOTYPE: one collar-pull / rising-knee animation, on the existing comparison page.
// V04: stronger victim pull and a broader particle impulse; the contact follows the pulled torso.
// Uses one supplied result; no extra turn, damage segment, grab state or world movement.
import * as approved from '../../js/combat-fx-limbs-prototype.mjs';

export const moveId='collar_knee';
export const accents={...approved.accents,[moveId]:{windup:660,color:'#ddc09a',detail:'猛拽近身 · 粗束上顶 · 瞬间爆发'}};
export const {segmentGap,recovery,trailLife,contactLife,kinetic,attached,motionProgress,drawMoveTrail,drawMoveContact,drawDefense}=approved;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>1-(1-clamp(t))**3;
const smooth=t=>{const p=clamp(t);return p*p*(3-2*p);};
const blend=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
const point=(a,b,c,d,t)=>{
  const u=1-t;return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
};
// Seeded particle motion is a pure function of time: pause, scrub and replay stay stable.
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function fleck(ctx,x,y,size,angle,color,stretch=1){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(stretch,1);
  ctx.beginPath();ctx.moveTo(-size*.7,-size*.45);ctx.lineTo(size*.55,-size*.7);
  ctx.lineTo(size,size*.15);ctx.lineTo(-size*.25,size*.6);ctx.closePath();
  ctx.fillStyle=color;ctx.fill();ctx.restore();
}
function dust(ctx,x,y,r,color,opacity=1,stretch=1,angle=0){
  if(r<=0||opacity<=0)return;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(stretch,1);ctx.globalAlpha*=opacity;
  const paint=ctx.createRadialGradient(0,0,0,0,0,r);
  paint.addColorStop(0,color+'c0');paint.addColorStop(.4,color+'80');paint.addColorStop(1,color+'00');
  ctx.fillStyle=paint;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
}
function mote(ctx,x,y,r,color,opacity){
  ctx.save();ctx.globalAlpha*=opacity;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
}
function pawnOffset(key,events,time,project,scale=1){
  const out=approved.presentation.pawnOffset(key,events.filter(e=>e.move!==moveId),time,project,scale);
  for(const e of events){
    if(e.move!==moveId)continue;
    const a=project(e.from),b=project(e.to),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,age=time-e.hitAt;
    if(e.actor===key&&time>=e.at&&age<recovery){
      const wind=(time-e.at)/(e.hitAt-e.at);
      // Reach forward, snap the shoulder back, then drive through the knee.
      // The target supplies most of the closing motion on a grab; keep both pawns readable.
      const lunge=['hit','armor'].includes(e.result)?20:27;
      const v=age>=0?lunge*(1-ease(Math.max(0,age-18)/(recovery-18))):wind<.30?6*smooth(wind/.30):wind<.67?mix(6,-6,smooth((wind-.30)/.37)):mix(-6,lunge,clamp((wind-.67)/.33)**1.6);
      out.x+=dx/length*v*scale;out.y+=dy/length*v*scale;
    }
    if(e.target===key&&time>=e.at&&age<280){
      const wind=(time-e.at)/(e.hitAt-e.at),recoilAge=Math.max(0,age-18);
      const release=age>=0?1-ease(recoilAge/150):1;
      const tug=['hit','armor'].includes(e.result)?smooth(clamp((wind-.30)/.26)**1.65)*release:0;
      const pulse=age>=0?(1-Math.exp(-recoilAge/12))*Math.exp(-recoilAge/105)*clamp(1-age/280):0;
      const pullDistance=Math.min(31,length/scale*.38);
      const amount=-pullDistance*tug+pulse*(e.result==='hit'?28:e.result==='parry'?5:0);
      out.x+=dx/length*amount*scale;out.y+=(dy/length*amount+5*tug-(e.result==='hit'?pulse*10:0))*scale;
      if(e.result==='miss'){
        const dodge=smooth((wind-.72)/.28)*(age>=0?1-ease(age/230):1);
        out.x+=dy/length*dodge*10*scale;out.y-=dx/length*dodge*9*scale;
      }
    }
  }return out;
}
function geometry(e,time,view,offset,targetOffset={x:0,y:0},impactOffset=targetOffset){
  if(e.move!==moveId)return approved.presentation.geometry(e,time,view,offset);
  const scale=view.scale||1,h=view.heightScale??1,ap=view.project(e.from),bp=view.project(e.to);
  const lateral=view.direction(-(e.to.y-e.from.y),e.to.x-e.from.x),norm=Math.hypot(lateral.x,lateral.y)||1;
  const side=e.side==='left'?-1:1,sx=lateral.x/norm*side,sy=lateral.y/norm*side;
  const from={x:ap.x+sx*7*scale+offset.x,y:ap.y-3*scale*h+sy*3*scale+offset.y};
  const hand={x:ap.x-sx*7*scale+offset.x,y:ap.y-23*scale*h-sy*3*scale+offset.y};
  // Follow the pulled torso before contact, then leave the burst at the contact-time position.
  // Recoil is a display offset, not a reason to drag an already emitted explosion along.
  const body={x:bp.x,y:bp.y-(e.part==='chest'?28:20)*scale*h};
  const pulled=['hit','armor'].includes(e.result),aimOffset=time<e.hitAt?targetOffset:impactOffset;
  let dest={x:body.x+(pulled?aimOffset.x:0),y:body.y+(pulled?aimOffset.y:0)};
  if(e.result==='parry')dest={x:mix(dest.x,from.x,.12),y:dest.y+3*scale};
  if(e.result==='distance')dest={x:mix(from.x,dest.x,.45),y:mix(from.y,dest.y,.45)};
  const collar={x:body.x-sx*3*scale+targetOffset.x,y:body.y-(e.part==='chest'?7:15)*scale*h+targetOffset.y};
  return {from,hand,collar,dest,ap,bp,scale,side,lateral:{x:sx,y:sy},angle:Math.atan2(dest.y-from.y,dest.x-from.x)};
}
function drawPull(ctx,hand,collar,wind){
  // Small cloth/dust fragments reach out and then sharply reverse into the actor.
  // There is no hand outline, tether, continuous ribbon or sustained grip graphic.
  for(let i=0;i<12;i++){
    const birth=.07+i*.011,u=(wind-birth)/.21;if(u<0||u>1)continue;
    const p=blend(hand,collar,smooth(u));
    ctx.save();ctx.globalAlpha*=Math.sin(Math.PI*u)*.75;
    fleck(ctx,p.x+(noise(i+3)-.5)*5,p.y+(noise(i+31)-.5)*5,1+noise(i+7)*1.3,noise(i)*6,'#d2d5ba',1.5);ctx.restore();
  }
  const end={x:mix(collar.x,hand.x,.78),y:mix(collar.y,hand.y,.78)+8};
  const direction=Math.atan2(end.y-collar.y,end.x-collar.x);
  for(let i=0;i<44;i++){
    const birth=.29+noise(i+70)*.13,life=.23+noise(i+21)*.10,u=(wind-birth)/life;
    if(u<0||u>1)continue;
    const start={x:collar.x+(noise(i+40)-.5)*24,y:collar.y+(noise(i+51)-.5)*18};
    const p=blend(start,end,u*u*(2-u)),spread=(1-u)*4;
    ctx.save();ctx.globalAlpha*=Math.sin(Math.PI*u)**.55;
    if(i%3===0)dust(ctx,p.x,p.y,6+noise(i+1)*5,'#b5bca2',.65,1.65,direction);
    fleck(ctx,p.x,p.y+Math.sin(i*3)*spread,1.8+noise(i+16)*2.6,direction+u*.7,i%3?'#cad0af':'#f0e7c6',2);
    ctx.restore();
  }
}
function drawKneeStream(ctx,root,dest,wind){
  const chamber={x:mix(root.x,dest.x,.82),y:dest.y+29};
  const origin={x:root.x,y:root.y+3};
  const position=p=>p<.73?blend(origin,chamber,smooth((p-.53)/.20)):
    point(chamber,{x:mix(chamber.x,dest.x,.55),y:chamber.y-2},{x:dest.x,y:dest.y+13},dest,clamp((p-.73)/.27)**1.55);
  // A brief planted-foot scuff supplies weight before the rising impulse.
  const brace=(wind-.48)/.42;
  if(brace>0&&brace<1){
    for(let i=0;i<12;i++){
      const a=noise(i+141)*Math.PI*2,r=brace*(8+noise(i+161)*11);
      dust(ctx,root.x+Math.cos(a)*r,root.y+Math.sin(a)*r*.25,3+brace*3,'#a79c7d',(1-brace)*.5,1.4);
    }
  }
  // Discrete emitters leave a broken, textured wake. No curve is ever stroked or filled.
  for(let i=0;i<82;i++){
    const birth=.53+i/81*.47,u=(wind-birth)/(.25+noise(i+230)*.16);
    if(u<0||u>1)continue;
    const p=position(birth),spread=3+u*9;
    const x=p.x+(noise(i+203)-.5)*spread*2;
    const y=p.y+(noise(i+209)-.5)*spread-u*8+u*u*5;
    const strength=(1-u)**1.7*clamp(u*9);
    const rise=birth>.73;
    dust(ctx,x,y,6+noise(i+210)*5+u*3,i%3?'#c8af87':'#354035',strength*.9,rise?1.65:1.2,rise?-Math.PI/2:Math.atan2(dest.y-root.y,dest.x-root.x));
    ctx.save();ctx.globalAlpha*=strength;
    fleck(ctx,x,y,1.5+noise(i+215)*3,noise(i+211)*6+u*.8,i%5===0?'#fff0cc':i%2?'#e6c99a':'#a88c62',rise?1.5:1.2);
    ctx.restore();
  }
  // A compact leading cluster gives the knee weight without drawing a fake limb or orb.
  if(wind>.67&&wind<1.06){
    const p=position(Math.min(1,wind)),fade=clamp((wind-.67)/.15)*(1-clamp((wind-.99)/.07));
    for(let i=0;i<12;i++){
      const x=p.x+(noise(i+350)-.5)*17,y=p.y+noise(i+370)*12;
      dust(ctx,x,y,5+noise(i+360)*4.5,i%3?'#d0b891':'#f4e3bc',fade*.72,1.3,-Math.PI/2);
      mote(ctx,x,y,1.3+noise(i+390)*1.3,'#ead5aa',fade*.85);
    }
  }
}
function contact(ctx,e,g,age){
  const q=age/contactLife;if(q<0||q>1||!['hit','parry','armor'].includes(e.result))return;
  ctx.save();ctx.translate(g.dest.x,g.dest.y);ctx.scale(g.scale,g.scale);
  if(e.result!=='hit'){
    ctx.save();ctx.globalAlpha=(1-q)**1.5;
    if(e.result==='parry')ctx.rotate(g.angle);
    approved.drawDefense(ctx,e.result,q);ctx.restore();
    for(let i=0;i<14;i++){
      const a=noise(i+401)*Math.PI*2,r=ease(q)*(8+noise(i+402)*19);
      ctx.save();ctx.globalAlpha=(1-q)**2;
      fleck(ctx,Math.cos(a)*r,Math.sin(a)*r,1+noise(i+405)*1.5,a,e.result==='parry'?'#c9ded4':'#a9b5a6',1.4);ctx.restore();
    }
  }else{
    const strength=.65+.35*Math.sqrt(clamp(e.powerFactor??1,0,2));ctx.scale(strength,strength);
    // One blunt particle burst, biased upward: ash outside, warm fragments inside.
    // No comic star outline, fireball, full-screen flash or additional damage event.
    for(let i=0;i<18;i++){
      const a=-Math.PI/2+(noise(i+450)-.5)*Math.PI*1.65,r=ease(q*1.4)*(11+noise(i+451)*22);
      dust(ctx,Math.cos(a)*r,Math.sin(a)*r+q*q*7,8+noise(i+453)*8+q*7,i%3?'#c5b28e':'#303b31',(1-q)**2*.7,1.3,a);
    }
    if(q<.26){
      const flash=1-q/.26;
      dust(ctx,0,1,27,'#ead9b1',flash*.7,1.25,-Math.PI/2);
      ctx.save();ctx.globalAlpha=flash;ctx.fillStyle='#fff2d2';ctx.beginPath();ctx.ellipse(0,0,8+flash*3,11+flash*4,-.15,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(let i=0;i<60;i++){
      const a=i%5===0?noise(i+500)*Math.PI*2:-Math.PI/2+(noise(i+500)-.5)*2.7;
      const travel=ease(q*1.6)*(26+noise(i+510)*47),x=Math.cos(a)*travel,y=Math.sin(a)*travel+q*q*11;
      const alpha=(1-q)**1.6,size=(1.8+noise(i+520)*3.5)*(1-q*.4);
      ctx.save();ctx.globalAlpha=alpha;
      fleck(ctx,x,y,size,a+q*(noise(i+530)-.5)*3,i%4===0?'#fff1cf':i%3?'#e1bd81':'#847253',1+noise(i+540)*1.6);ctx.restore();
    }
    for(let i=0;i<22;i++){
      const a=noise(i+570)*Math.PI*2,r=8+ease(q)*(12+noise(i+580)*20);
      mote(ctx,Math.cos(a)*r,Math.sin(a)*r*.65-q*6,.6+noise(i+590)*.8,'#ddd0ae',(1-q)**2*.8);
    }
  }ctx.restore();
}
function drawStrike(ctx,e,time,view,events){
  if(e.move!==moveId)return approved.presentation.drawStrike(ctx,e,time,view,events);
  if(time<e.at||time>e.hitAt+660)return;
  const offset=pawnOffset(e.actor,events,time,view.project,view.scale||1);
  const targetOffset=pawnOffset(e.target,events,time,view.project,view.scale||1);
  const impactOffset=pawnOffset(e.target,events,e.hitAt,view.project,view.scale||1);
  const g=geometry(e,time,view,offset,targetOffset,impactOffset);
  const age=time-e.hitAt,wind=(time-e.at)/(e.hitAt-e.at),s=g.scale;
  const local=p=>({x:(p.x-g.ap.x)/s,y:(p.y-g.ap.y)/s});
  if(age<230){
    ctx.save();ctx.translate(g.ap.x,g.ap.y);ctx.scale(s,s);
    drawPull(ctx,local(g.hand),local(g.collar),wind);
    drawKneeStream(ctx,local(g.from),local(g.dest),wind);
    ctx.restore();
  }
  contact(ctx,e,g,age);return g;
}
export const presentation={...approved.presentation,pawnOffset,geometry,drawStrike};

// Frozen approved demo V13 (a87d173). Oracle only; do not tune this to match runtime.
export function demoFrame(ctx,paint,events,t,view){
const fx=()=>paint,snapFX={},signatureFX={},zoom=view.scale;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),ease=t=>1-Math.pow(1-clamp(t),3),mix=(a,b,t)=>a+(b-a)*t;
const partHeight={head:52,chest:28,abdomen:20,left_arm:30,right_arm:30,left_leg:9,right_leg:9};
const point=g=>view.project({x:g[0],y:g[1]});
const trackPos=id=>{const a=events.find(e=>e.actor===id),b=events.find(e=>e.target===id),p=a?a.from:b.to;return [p.x,p.y];};
function pawnOffset(id,t){let dx=0,dy=0;
  for(const e of events){if(e.type)continue;const d=point(trackPos(e.target,e.at)),a=point(trackPos(e.actor,e.at));const angle=Math.atan2(d.y-a.y,d.x-a.x);
    if(fx()===snapFX||fx().kinetic){
        const age=t-e.hitAt,recovery=fx().recovery||95,readable=fx()===signatureFX||fx().attached;
      if(e.actor===id&&t>=e.at&&age<recovery){
        const n=(t-e.at)/(e.hitAt-e.at),power=fx().attached?(['front_kick','whip_kick','kick_knee'].includes(e.move)?9:12):['swing_punch','front_kick','whip_kick'].includes(e.move)?7:5;
        const prep=readable?.2:.45;
        const p=fx().motionProgress?fx().motionProgress(n):Math.pow(clamp((n-.45)/.55),2);
        const v=age>=0?power*(1-ease(age/recovery)):n<prep?-1.2*Math.sin(n/prep*Math.PI):power*p;
        dx+=Math.cos(angle)*v;dy+=Math.sin(angle)*v;
      }
      if(e.target===id&&age>=0&&age<(readable?260:180)){
        const pulse=(1-Math.exp(-age/(readable?15:9)))*Math.exp(-age/(readable?80:52))*(readable?clamp(1-age/260):1);
        if(e.result==='hit'||e.result==='parry'){const v=pulse*(e.result==='parry'?3:9);dx+=Math.cos(angle)*v;dy+=Math.sin(angle)*v;}
        if(e.result==='miss'){dx+=Math.sin(angle)*pulse*8;dy-=Math.cos(angle)*pulse*6;}
      }
      continue;
    }
    if(e.actor===id && t>=e.at && t<=e.hitAt+140){const n=(t-e.at)/(e.hitAt+140-e.at),v=Math.sin(n*Math.PI)*3;dx+=Math.cos(angle)*v;dy+=Math.sin(angle)*v;}
    if(e.target===id && t>=e.hitAt && t<e.hitAt+200){const q=(t-e.hitAt)/200;if(e.result==='hit'){dx+=Math.cos(angle)*Math.sin(q*Math.PI*3)*(1-q)*3;dy+=Math.sin(angle)*Math.sin(q*Math.PI*3)*(1-q)*2;}if(e.result==='miss'){dx+=Math.sin(angle)*Math.sin(q*Math.PI)*7;dy-=Math.cos(angle)*Math.sin(q*Math.PI)*4;}}
  }return {x:dx*zoom,y:dy*zoom};}
function line(points,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();}
function impact(p,age,result,angle,move,side,powerFactor=1){const ms=fx().contactLife||(move==='slap_combo'?190:430);if(age<0||age>ms)return;const q=age/ms;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(zoom,zoom);ctx.rotate(angle);ctx.globalAlpha=Math.pow(1-q,1.5);
  if(result==='parry'){
    fx().drawDefense?.(ctx,result,q);
    ctx.strokeStyle='#b2c5b6';ctx.lineWidth=3*(1-q)+.7;ctx.beginPath();ctx.arc(0,0,12+q*6,Math.PI*.6,Math.PI*1.4);ctx.stroke();
    for(let i=0;i<5;i++){const a=Math.PI*.65+i*.18;line([[Math.cos(a)*(8+q*16),Math.sin(a)*(8+q*16)],[Math.cos(a)*(12+q*27),Math.sin(a)*(12+q*27)]],'#e0e6cd',1);}
  }else if(result==='armor'){
    ctx.rotate(-angle);fx().drawDefense?.(ctx,result,q);ctx.strokeStyle='#a0c5b9';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-12,-10);ctx.lineTo(0,-15);ctx.lineTo(12,-10);ctx.lineTo(9,8);ctx.lineTo(0,15);ctx.lineTo(-9,8);ctx.closePath();ctx.stroke();
  }else if(result==='hit'){
    const strength=.65+.35*Math.sqrt(clamp(powerFactor,0,2));ctx.scale(strength,strength);
    fx().drawMoveContact(ctx,move,q,side,angle);
  }
  ctx.restore();
}
function drawStrike(e,t){const life=t-e.at;if(life<0||life>950)return;
  const ap=point(trackPos(e.actor,e.at)), bp=point(trackPos(e.target,e.hitAt));
  const limbSide=e.side==='left'?-1:1;
  // Repeated sub-hits keep the equipped acting limb. Slaps reverse the stroke, not the limb.
  const side=limbSide*(e.move==='slap_combo'&&e.segment%2?-1:1);
  const attached=fx().attached,offset=attached?pawnOffset(e.actor,t):{x:0,y:0};
  const rootHeight=attached?(['front_kick','whip_kick','kick_knee'].includes(e.move)?3:19):limbHeight(e.move);
  const from={x:ap.x+(attached&&e.move==='shove'?0:limbSide*(attached?7:9))*zoom+offset.x,y:ap.y-rootHeight*zoom+offset.y};
  let dest={x:bp.x+(['left_arm','left_leg'].includes(e.part)?-10:['right_arm','right_leg'].includes(e.part)?10:0)*zoom,y:bp.y-partHeight[e.part]*zoom};
  // Project a world-space sideways direction onto the isometric ground plane.
  // Roundhouse kicks approach the flank instead of following a screen-up overhead arc.
  const roundhouse=attached&&e.move==='whip_kick';
  const lateral={x:-2*(bp.y-ap.y),y:(bp.x-ap.x)*.5};
  const lateralSize=Math.hypot(lateral.x,lateral.y)||1;
  lateral.x/=lateralSize;lateral.y/=lateralSize;
  if(roundhouse){
    dest.x+=lateral.x*limbSide*7*zoom;dest.y+=lateral.y*limbSide*7*zoom;
    if(['abdomen','chest'].includes(e.part))dest.y-=8*zoom;
  }
  if((fx()===signatureFX||attached)&&e.move==='kick_knee'&&['left_leg','right_leg'].includes(e.part))dest.y=bp.y-17*zoom;
  if(e.result==='parry'){dest.x+=(from.x-dest.x)*.12;dest.y+=4*zoom;}
  if(e.result==='miss')dest.y-=15*zoom;
  if(e.result==='distance'){dest={x:mix(from.x,dest.x,.45),y:mix(from.y,dest.y,.45)};}
  const angle=Math.atan2(dest.y-from.y,dest.x-from.x),length=Math.hypot(dest.x-from.x,dest.y-from.y)/zoom;
  const chamberLift=roundhouse?10*clamp(lateral.y*side*2):0;
  const sweep=roundhouse?[(lateral.x*Math.cos(angle)+lateral.y*Math.sin(angle))*side*36-Math.sin(angle)*chamberLift,(-lateral.x*Math.sin(angle)+lateral.y*Math.cos(angle))*side*36-Math.cos(angle)*chamberLift]:null;
  const contactAngle=roundhouse?angle+Math.atan2(-Math.PI*sweep[1],length-Math.PI*sweep[0]):angle;
  const wind=(t-e.at)/(e.hitAt-e.at),age=t-e.hitAt,trailLife=fx().trailLife||210,fade=clamp(1-age/trailLife);
  const progress=fx().motionProgress?fx().motionProgress(wind):fx()===snapFX?Math.pow(clamp((wind-.45)/.55),2):ease((wind-.15)/.85);
  if(age<=trailLife){
    ctx.save();ctx.translate(from.x,from.y);ctx.scale(zoom,zoom);ctx.rotate(angle);ctx.globalAlpha=clamp(wind*2)*(attached?1:fade)*(e.result==='dry'?.30:.9);
    fx().drawMoveTrail(ctx,{move:e.move,length,progress,side,age,wind,burst:e.burst,result:e.result,angle,sweep});
    ctx.restore();
  }
  if(['hit','parry','armor'].includes(e.result))impact(dest,age,e.result,contactAngle,e.move,side,e.powerFactor);
  if(age>=0&&age<660){
    const labels={parry:'招架',miss:'闪开',distance:'挥空',dry:'乏力',armor:'吸收'};
    const statuses={jab:'试探',whip_kick:'失衡',poke_eye:'眼花',kick_knee:'跛足',shove:'失衡',slap_combo:'淤伤'};
    const label=(e.segmentCount>1?`${e.segment+1}/${e.segmentCount} `:'')+(labels[e.result]||statuses[e.move]||'命中');
    ctx.save();ctx.globalAlpha=clamp(1-(age-260)/400);ctx.fillStyle=e.result==='hit'?'#edd3a5':'#b5c9b7';ctx.font='11px "Microsoft YaHei"';ctx.textAlign='center';
    const pos=e.move==='jab'&&e.result==='hit'?ap:bp;
    ctx.fillText(label,pos.x,pos.y-100*zoom-e.segment*16-age*.018);ctx.restore();
  }
}

return {draw:e=>drawStrike(e,t),offset:id=>pawnOffset(id,t)};
}

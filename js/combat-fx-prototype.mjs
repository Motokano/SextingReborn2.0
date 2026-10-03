// PROTOTYPE: shared-move visual comparisons. Scripted outcomes, no gameplay mutations.
// Question: are shared move silhouettes and exchange timing readable at a 144px tile width?
import * as lineFX from './combat-fx-strokes.mjs';
import * as volumeFX from './combat-fx-volumes.mjs';
import * as snapFX from './combat-fx-snap.mjs';
import * as signatureFX from './combat-fx-signature.mjs';
import * as limbFX from './combat-fx-limbs-prototype.mjs';
import { scheduleAttackFx, resolvePreviewMove } from './combat-fx-action-prototype.mjs';
const $ = id => document.getElementById(id);
const canvas = $('arena'), ctx = canvas.getContext('2d');
const fx = ()=>({line:lineFX,volume:volumeFX,snap:snapFX,signature:signatureFX,limb:limbFX}[$('effect-style').value]||limbFX);
const clamp = (n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const ease = t=>1-Math.pow(1-clamp(t),3);
const mix = (a,b,t)=>a+(b-a)*t;
const directions = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const shapes = {
  jab:['刺拳','短直线 · 试探','straight'], front_kick:['正蹬','正面推进 · 击退','push'],
  swing_punch:['摆拳','厚重横弧 · 消耗试探','arc'], whip_kick:['鞭腿','长弧收梢 · 失衡','whip'],
  poke_eye:['戳眼','双尖短痕 · 眼花','double'], kick_knee:['踹膝','低位斜击 · 跛足','low'],
  shove:['推搡','宽面推压 · 失衡','shove'], slap_combo:['连环掌掴','两次掌击 · 淤伤','slap'],
  weapon_strike:['兵击直斩','窄锋切线 · 占位兵击','blade']
};
const notes = {
  hit:'预设命中：轨迹抵达实际命中部位，接触后短促散开。状态提示仅表示该情境预设生效。',
  parry:'预设招架成功：轨迹在承招点被截断，免除本段伤害。命中型附带状态仍可按条件生效。',
  miss:'预设闪开：只保留擦身而过的轨迹，没有命中爆点。闪避视觉偏移不改变占格。',
  armor:'预设防具吸收：胸部短暂出现护甲轮廓，没有重创爆点。',
  dry:'预设底气不足：动作仍发生，轨迹虚弱；不表现伤害、控制、减益或位移。',
  mixed:'连环掌掴第一段被挡，其余段命中，分别反馈；段数随装备变式变化，仍是一整招，资源按整招一次。',
  varied:'按最终段列表预设：第一段命中、第二段招架、第三段闪开。只有命中的段播放命中飞溅；段数由各自装备变式后的招式决定。',
  exchange:'预设双方均能行动：先手整招结束后，另一方才开始还击。',
  simultaneous:'预设同速：双方在同一拍出手和接触，演出不制造额外先后手。',
  knockback:'正蹬命中且招架失败，整招结束后击退一格；后手在新位置挥空，不追近。',
  wall:'正蹬击退受到实体阻挡：在阻挡方向追加撞击；本情境预设撞阻眩晕，后手停止攻击。',
  burst:'催气演示：先冲锋到相邻格，再攻击；本情境被招架但仍击退，随后后手距离挥空。'
};
let selected='jab', scenario='hit', swapped=false, dir=0, zoom=1, speed=Number($('speed').value);
let moves={}, pawns=[], events=[], tracks=[], beats=[], duration=2300,time=0,playing=true,last=0,actionSequence=0;
let width=600,height=435;
function image(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});}
function project(g){return {x:(g[0]-g[1])*72,y:(g[0]+g[1])*36};}
function point(g){const p=project(g);return {x:width/2+p.x*zoom,y:height*.60+p.y*zoom};}
function shifted(g,d,k){return [g[0]+d[0]*k,g[1]+d[1]*k];}
function trackPos(id,t){let p=tracks[id].start;for(const step of tracks[id].steps){if(t<step.at)break;p=[mix(step.from[0],step.to[0],ease((t-step.at)/step.ms)),mix(step.from[1],step.to[1],ease((t-step.at)/step.ms))];}return p;}
function limbHeight(move){return ['front_kick','whip_kick','kick_knee'].includes(move)?13:28;}
// Display-only offsets on the approved ~74px pawns; never used as skeleton data.
const partHeight={head:52,chest:28,abdomen:20,left_arm:30,right_arm:30,left_leg:9,right_leg:9};
function currentPart(){return $('part').value;}
function addBeat(at,label){beats.push({at,label});}
function effectiveMove(moveId,actor){return resolvePreviewMove(moves[moveId],$(actor===0?'variant-player':'variant-enemy').value,selected);}
function strike(actor,target,move,at,outcome='hit',part=currentPart(),opts={}){
  const resolved=effectiveMove(move,actor),n=resolved.hit_segments,windup=fx().accents[move].windup;
  // Leave a short retraction before reusing the same limb in the triple fixture.
  const gap=Math.max(fx().segmentGap||230,resolved.previewVariantId?windup+80:0);
  addBeat(at,`${actor===0?'主角':'地痞'} · ${shapes[move][0]}${resolved.previewVariantId?' · 三连':''}`);
  const segments=[];
  for(let i=0;i<n;i++){
    const result=outcome==='mixed'?(i===0?'parry':'hit'):outcome==='varied'?['hit','parry','miss'][i%3]:outcome;
    const hitAt=at+windup+i*gap;
    segments.push({result,part,powerFactor:resolved.fxPowerFactor,powerMultiplier:resolved.move_power_multiplier});
    const label=result==='parry'?'招架':result==='miss'?'闪开':result==='distance'?'距离挥空':result==='dry'?'底气不足':result==='armor'?'护甲吸收':'命中';
    addBeat(hitAt,n>1?`第${i+1}段${label}`:label);
  }
  const action=scheduleAttackFx({actionId:`preview-${++actionSequence}`,moveId:move,actor,target,side:$('side').value,at,windup,gap,recovery:fx().recovery||170,plannedSegments:n,segments,burst:opts.burst});
  events.push(...action.events);
  return action.end;
}
function displacement(id,from,to,at){tracks[id].steps.push({from,to,at,ms:250});addBeat(at,'击退 1 格');events.push({type:'dust',target:id,at,ms:430,from,to});}
function build(){
  scenario=$('scenario').value;
  if(scenario==='mixed')selected='slap_combo';
  if(['knockback','wall','burst'].includes(scenario))selected='front_kick';
  const m=moves[selected];
  const a=swapped?1:0,b=1-a,d=directions[dir];
  const distance=scenario==='burst'?2:1;
  const aPos=[-d[0]*distance/2,-d[1]*distance/2], bPos=[d[0]*distance/2,d[1]*distance/2];
  tracks=[null,null];tracks[a]={start:aPos,steps:[]};tracks[b]={start:bPos,steps:[]};
  events=[];beats=[];actionSequence=0;addBeat(0,'准备');let end=0;
  if(scenario==='burst'){
    events.push({type:'charge',actor:a,at:100,ms:500});addBeat(100,'催气');
    const near=shifted(aPos,d,1);tracks[a].steps.push({from:aPos,to:near,at:380,ms:250});addBeat(380,'冲锋');
    end=strike(a,b,selected,690,'parry','abdomen',{burst:true});
    displacement(b,bPos,shifted(bPos,d,1),end+30);
    end=strike(b,a,'jab',end+460,'distance','chest');
  }else if(scenario==='simultaneous'){
    end=Math.max(strike(a,b,selected,300),strike(b,a,selected,300));
  }else{
    end=strike(a,b,selected,300,['exchange','knockback','wall'].includes(scenario)?'hit':scenario);
    if(scenario==='exchange')end=strike(b,a,'swing_punch',end+260,'hit','head');
    if(scenario==='knockback'){
      displacement(b,bPos,shifted(bPos,d,1),end+30);
      end=strike(b,a,'jab',end+460,'distance','chest');
    }
    if(scenario==='wall'){
      events.push({type:'wall',actor:a,target:b,at:end+60,ms:550});addBeat(end+60,'撞阻');addBeat(end+240,'眩晕 · 停止还击');end+=700;
    }
  }
  duration=Math.max(fx()===snapFX?1400:2100,end+(fx()===snapFX?480:750));time=0;playing=true;last=performance.now();
  beats.sort((a,b)=>a.at-b.at);addBeat(duration-350,'交手结束');
  $('timeline').max=duration;
  $('move-title').textContent=shapes[selected][0];$('school').textContent=m.school;
  describeMove();
  $('rule').textContent=notes[scenario];
  $('variant-note').textContent=`预览变式仅作用于当前选择的「${shapes[selected][0]}」。主角：${variantDescription(0)}；地痞：${variantDescription(1)}。50% 是演示威力参数，不是最终伤害；不读写正式装配。`;
  $('actors').textContent=swapped?'地痞 → 主角':'主角 → 地痞';
  $('swap').textContent=swapped?'交换攻守 · 主角出招':'交换攻守 · 地痞出招';
  $('beats').replaceChildren(...beats.map(b=>{const e=document.createElement('span');e.className='beat';e.textContent=b.label;return e;}));
  document.querySelectorAll('.move').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.move===selected)));
  $('mobile-move').value=selected;
  updateUI();
}
function variantDescription(actor){const m=effectiveMove(selected,actor);return `${m.previewVariantId?'三连变式':'原式'} ${m.hit_segments} 段 / 每段系数 ${m.move_power_multiplier.toFixed(2)}`;}
function describeMove(){const m=effectiveMove(selected,swapped?1:0);$('move-description').textContent=`${m.hit_segments} 段${m.previewVariantId?' · 三连变式 · 每段威力 50%':''} · ${m.damage_type==='slash'?'劈砍':'钝击'} · ${fx().accents[selected].detail}`;}
function updateUI(){
  $('play').textContent=playing?'暂停':'播放';$('timeline').value=time;$('time').textContent=(time/1000).toFixed(2)+'s';
  let idx=0;beats.forEach((b,i)=>{if(time>=b.at)idx=i;});
  $('beats').childNodes.forEach((el,i)=>el.className='beat'+(i<=idx?' done':'')+(i===idx?' active':''));
  $('phase').textContent=beats[idx]?.label||'准备';
  $('state').textContent=`${scenario==='simultaneous'?'双方同时出招':(swapped?'地痞':'主角')+'先出招'} · ${$('side').selectedOptions[0].text} · ${$('part').selectedOptions[0].text}`;
}
function diamond(g,fill,stroke){const p=point(g);ctx.beginPath();ctx.moveTo(p.x,p.y-36*zoom);ctx.lineTo(p.x+72*zoom,p.y);ctx.lineTo(p.x,p.y+36*zoom);ctx.lineTo(p.x-72*zoom,p.y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
function drawFloor(t){
  for(let sum=-7;sum<=7;sum++)for(let x=-4;x<=4;x++){const y=sum-x;if(Math.abs(y)>4)continue;const r=Math.abs(x)+Math.abs(y);diamond([x,y],(x+y)%2?'#303c30':'#344032',`rgba(168,175,136,${Math.max(.03,.16-r*.018)})`);}
  for(let id=0;id<2;id++){const p=trackPos(id,t);diamond(p,id===0?'#74837118':'#bc947018',id===0?'#aabd9560':'#d4b08760');}
  if(scenario==='wall'){
    const b=swapped?0:1,p=point(shifted(tracks[b].start,directions[dir],1));
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(zoom,zoom);
    ctx.fillStyle='#697063';ctx.beginPath();ctx.moveTo(-50,-26);ctx.lineTo(0,-52);ctx.lineTo(50,-26);ctx.lineTo(0,0);ctx.closePath();ctx.fill();
    ctx.fillStyle='#444f43';ctx.beginPath();ctx.moveTo(-50,-26);ctx.lineTo(0,0);ctx.lineTo(0,27);ctx.lineTo(-50,1);ctx.closePath();ctx.fill();
    ctx.fillStyle='#354133';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(50,-26);ctx.lineTo(50,1);ctx.lineTo(0,27);ctx.closePath();ctx.fill();ctx.restore();
  }
}
function canonicalEvents(){return events.filter(e=>!e.type).map(e=>({...e,from:{x:trackPos(e.actor,e.at)[0],y:trackPos(e.actor,e.at)[1]},to:{x:trackPos(e.target,e.hitAt)[0],y:trackPos(e.target,e.hitAt)[1]}}));}
function canonicalView(){return {scale:zoom,project:p=>point([p.x,p.y]),direction:(x,y)=>project([x,y])};}
function pawnOffset(id,t){
  if(fx()===limbFX)return limbFX.presentation.pawnOffset(id,canonicalEvents(),t,canonicalView().project,zoom);
  let dx=0,dy=0;
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
function drawPawn(id,t){const p=point(trackPos(id,t)), o=pawnOffset(id,t),s=pawns[id];ctx.save();ctx.translate(p.x+o.x,p.y+8*zoom+o.y);ctx.scale(zoom,zoom);ctx.drawImage(s.shadow,-64,-40,160,88);ctx.drawImage(s.image,...s.crop,-s.ax,-s.ay,s.w,s.h);ctx.restore();
  ctx.fillStyle=id===0?'#becab3':'#d8b990';ctx.font='10px "Microsoft YaHei"';ctx.textAlign='center';ctx.fillText(id===0?'主角':'地痞',p.x+o.x,p.y-84*zoom+o.y);
}
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
  if(fx()===limbFX){
    const all=canonicalEvents(),event=all.find(s=>s.segmentId===e.segmentId);
    const g=limbFX.presentation.drawStrike(ctx,event,t,canonicalView(),all),age=t-e.hitAt;
    if(g&&age>=0&&age<660){
      const labels={parry:'招架',miss:'闪开',distance:'挥空',dry:'乏力',armor:'吸收'};
      const statuses={jab:'试探',whip_kick:'失衡',poke_eye:'眼花',kick_knee:'跛足',shove:'失衡',slap_combo:'淤伤'};
      const label=(e.segmentCount>1?`${e.segment+1}/${e.segmentCount} `:'')+(labels[e.result]||statuses[e.move]||'命中');
      const pos=e.move==='jab'&&e.result==='hit'?g.ap:g.bp;
      ctx.save();ctx.globalAlpha=clamp(1-(age-260)/400);ctx.fillStyle=e.result==='hit'?'#edd3a5':'#b5c9b7';ctx.font='11px "Microsoft YaHei"';ctx.textAlign='center';ctx.fillText(label,pos.x,pos.y-100*zoom-e.segment*16-age*.018);ctx.restore();
    }
    return;
  }
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
function drawSpecial(e,t){const age=t-e.at;if(age<0||age>(e.ms||600))return;const q=age/(e.ms||600), p=point(trackPos(e.target??e.actor,t));ctx.save();ctx.translate(p.x,p.y);ctx.scale(zoom,zoom);ctx.globalAlpha=(1-q)*.8;
  if(e.type==='dust'){for(let i=0;i<9;i++){const a=i*2.4;ctx.fillStyle='#bbb293';ctx.beginPath();ctx.ellipse(Math.cos(a)*(10+q*23),Math.sin(a)*(3+q*8),2*(1-q)+.4,1.2,0,0,Math.PI*2);ctx.fill();}}
  if(e.type==='charge'){for(let i=0;i<3;i++){ctx.strokeStyle='#d9c292';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(0,-30,14+q*(20+i*4),5+q*8,-.3+i*.3,Math.PI*q,Math.PI*(1.2+q));ctx.stroke();}}
  if(e.type==='wall'){const d=project(directions[dir]),ang=Math.atan2(d.y,d.x);for(let i=0;i<10;i++){const a=ang+Math.PI*.7+i*.2;line([[Math.cos(ang)*20,-20+Math.sin(ang)*10],[Math.cos(ang)*20+Math.cos(a)*(8+q*25),-20+Math.sin(ang)*10+Math.sin(a)*(8+q*25)]],'#d9b286',1.5);}ctx.fillStyle='#e2cba0';ctx.font='11px "Microsoft YaHei"';ctx.textAlign='center';ctx.fillText('撞阻 · 眩晕',0,-90-q*10);}
  ctx.restore();
}
function drawGround(t){
  if(!fx().drawMoveGround)return;
  for(const e of events){const age=t-e.hitAt;if(e.type||e.result!=='hit'||age<0||age>430)continue;
    const p=point(trackPos(e.target,e.hitAt)),a=point(trackPos(e.actor,e.at)),q=age/430;
    ctx.save();ctx.translate(p.x,p.y+5*zoom);ctx.scale(zoom,zoom);ctx.globalAlpha=Math.pow(1-q,1.5);
    fx().drawMoveGround(ctx,e.move,q,Math.atan2(p.y-a.y,p.x-a.x));ctx.restore();
  }
}
function draw(t){ctx.clearRect(0,0,width,height);drawFloor(t);drawGround(t);[0,1].sort((a,b)=>point(trackPos(a,t)).y-point(trackPos(b,t)).y).forEach(id=>drawPawn(id,t));events.forEach(e=>e.type?drawSpecial(e,t):drawStrike(e,t));}
function resize(){const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function frame(now){if(playing){time+=limbFX.presentation.frameDelta(now-last)*speed;if(time>duration){if($('loop').checked)time%=duration;else{time=duration;playing=false;}}}last=now;draw(time);updateUI();requestAnimationFrame(frame);}
async function boot(){
  const [data,manifest,player,thug]=await Promise.all([fetch('data/combat-skills.json').then(r=>r.json()),fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),image('assets/map/isometric/player-atlas-v1/L00.png'),image('assets/map/isometric/street-thug-v1/standing.png')]);
  for(const skill of Object.values(data.skills)){const list=skill.moves.filter(m=>shapes[m.id]);if(!list.length)continue;const title=document.createElement('div');title.className='group-label';title.textContent=skill.name;$('move-list').append(title);for(const move of list){moves[move.id]={...move,school:skill.name};const b=document.createElement('button');b.className='move';b.dataset.move=move.id;b.innerHTML=`<strong>${move.name}</strong><span>${shapes[move.id][1]}</span>`;b.onclick=()=>{selected=move.id;$('scenario').value='hit';$('part').value=['poke_eye','swing_punch','slap_combo'].includes(move.id)?'head':move.id==='kick_knee'?'right_leg':['front_kick','whip_kick'].includes(move.id)?'abdomen':'chest';build();};$('move-list').append(b);}}
  const st=manifest.states.find(s=>s.id==='D000'),scale=manifest.displayBaseWidth/st.baseWidth;
  pawns=[{image:player,crop:st.crop,w:st.crop[2]*scale,h:st.crop[3]*scale,ax:st.anchor[0]*scale,ay:st.anchor[1]*scale},{image:thug,crop:[230,38,757,1216],w:46,h:1216*46/757,ax:(609.5-230)*46/757,ay:(1253-38)*46/757}];
  pawns.forEach(s=>s.shadow=window.TileRendererV2.makeGroundShadow(s.image,{crop:s.crop,anchor:[s.crop[0]+s.ax*s.crop[2]/s.w,s.crop[1]+s.ay*s.crop[2]/s.w],width:s.w},[23,7]));
  Object.keys(moves).forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=moves[id].name;$('mobile-move').append(option);});
  $('mobile-move').onchange=()=>document.querySelector(`[data-move="${$('mobile-move').value}"]`).click();
  for(const id of ['scenario','part','side','variant-player','variant-enemy'])$(id).onchange=build;
  const styleQuery=new URLSearchParams(location.search).get('variant');$('effect-style').value=['line','volume','snap','signature','limb'].includes(styleQuery)?styleQuery:'limb';
  $('effect-style').onchange=()=>{build();const url=new URL(location.href);url.searchParams.set('variant',$('effect-style').value);history.replaceState(null,'',url);};
  $('swap').onclick=()=>{swapped=!swapped;build();};$('rotate').onclick=()=>{dir=(dir+1)%8;build();};
  $('zoom').onchange=()=>{zoom=Number($('zoom').value);$('scale-label').textContent=zoom===1?'144px 格宽 · 实际尺寸':'放大细看 · 1.7×';};
  $('speed').onchange=()=>speed=Number($('speed').value);
  $('play').disabled=false;$('replay').disabled=false;
  $('play').onclick=()=>{if(time>=duration)time=0;playing=!playing;last=performance.now();updateUI();};$('replay').onclick=build;
  $('timeline').oninput=()=>{time=Number($('timeline').value);playing=false;updateUI();};
  new ResizeObserver(resize).observe(canvas);resize();build();requestAnimationFrame(frame);
}
boot().catch(error=>{$('move-title').textContent='素材加载失败';$('move-description').textContent='请通过项目本地服务打开此页面。';console.error(error);});

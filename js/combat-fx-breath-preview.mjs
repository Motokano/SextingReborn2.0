// PROTOTYPE V01, mounted on the existing FX route (?effect=breath).
// User requested one direction: inhale, breathing mantle, attack release, dissolve.
// Choreographed visual-only fixture. Never loads game state or writes saves.
import * as knee from './combat-fx-collar-knee-prototype.mjs';
import {timing,stateAt,drawAura,drawBurstStrike} from './combat-fx-breath-prototype.mjs';
const P=knee.presentation;
const css=document.createElement('link');css.rel='stylesheet';css.href='css/combat-fx-breath-prototype.css';document.head.append(css);
document.title='基本呼吸法 · 催气特效试作';
document.body.innerHTML=`<div class="breath-page">
  <header class="breath-head"><div><span class="eyebrow">潮碧物语 / 基本呼吸法</span><h1>催气</h1><p>收气入身，劲随息动。出招时压紧，再一瞬释放。</p></div><div class="breath-meta">特效试作 01<br><a href="combat-fx-prototype.html?move=collar_knee&actor=enemy&no_reload">返回招式预览 ↗</a></div></header>
  <div class="breath-toolbar"><nav class="breath-phases" aria-label="预览阶段">
    <button data-mode="full" aria-pressed="true">完整演示</button><button data-mode="ignite" aria-pressed="false">只看发动</button><button data-mode="hold" aria-pressed="false">持续状态</button><button data-mode="attack" aria-pressed="false">出招爆发</button>
  </nav><div class="breath-options"><label class="breath-compare"><input id="aura" type="checkbox" checked>催气特效</label><select id="breath-zoom" aria-label="预览尺寸"><option value="1">实际尺寸 · 144px 格宽</option><option value="1.7">放大细看 · 1.7×</option></select><select id="breath-speed" aria-label="播放速度"><option value="1.5">1.5× · 默认节奏</option><option value="0.5">0.5× · 慢放</option><option value="1">1× · 原速</option></select></div></div>
  <section class="breath-scenes" aria-label="主角和头目催气效果对照">
    ${['主角','地头头目'].map((name,i)=>`<article class="breath-card"><div class="breath-card-head"><div><h2>${name}</h2><p>${i?'摆拳 → 推搡 → 扯领膝撞':'刺拳 → 正蹬 → 刺拳'}</p></div><div><div class="breath-state" id="breath-state-${i}">加载棋子…</div><div class="breath-dots" id="breath-dots-${i}"><i></i><i></i><i></i></div></div></div><div class="breath-stage"><canvas id="breath-arena-${i}" aria-label="${name}的催气发动、持续和出招效果"></canvas><div class="breath-scale">144px 格宽 · 实际尺寸</div><div class="breath-caption" id="breath-caption-${i}"></div></div></article>`).join('')}
  </section>
  <div class="breath-transport"><button class="primary" id="breath-play" disabled>暂停</button><button id="breath-replay" disabled>重播</button><input id="breath-timeline" type="range" min="0" max="15700" value="0" step="1" aria-label="催气播放进度"><output id="breath-time">0.00s</output><button id="breath-freeze">定格爆发</button><label><input id="breath-loop" type="checkbox" checked>循环</label></div>
  <div class="breath-beats"><div><strong>01 · 收拢 / 发动</strong><p>胸腹吸入细粒，短促气浪撑开。<br>头目先沉肩吸气，再亮起完整气劲。</p></div><div><strong>02 · 持续 / 蓄劲</strong><p>白金气流贴着肩臂起伏，轮廓微亮。<br>不出招时也能看清催气状态。</p></div><div><strong>03 · 出招 / 喷发</strong><p>气流压紧，沿招式方向释放。<br>膝撞保留回拉，上顶时爆开气浪。</p></div><div><strong>04 · 耗尽 / 散气</strong><p>三次催气出招后，气流散为细粒。<br>末击完整放完，再恢复平常外观。</p></div></div>
  <div class="breath-foot">视觉预览 · 沿用主角图册、正式头目棋子与已确认的攻击特效。此处预设出招用于观察效果；不演算冷却、击退或伤害，不读写存档。催气按出招次数结束，持续段时长仅供演示。</div>
</div>`;
const $=id=>document.getElementById(id);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const modes={full:[0,15700],ignite:[200,2800],hold:[2700,5300],attack:[11900,14500]};
const starts=[5400,8900,12400];
const moves=[['jab','front_kick','jab'],['swing_punch','shove','collar_knee']];
const labels={jab:'刺拳',front_kick:'正蹬',swing_punch:'摆拳',shove:'推搡',collar_knee:'扯领膝撞'};
let time=0,last=0,playing=true,speed=1.5,zoom=1,mode='full',showAura=true,pawns=[];
const positions=[{x:-.5,y:0},{x:.5,y:0}];
const scenes=[0,1].map(actor=>{
  const canvas=$(`breath-arena-${actor}`),ctx=canvas.getContext('2d');
  // Align contacts across the two demonstrations without changing any move's duration.
  const events=moves[actor].map((move,i)=>({actor,target:1-actor,move,side:'right',segment:0,result:'hit',powerFactor:1,part:move==='swing_punch'?'head':move==='jab'?'chest':'abdomen',from:positions[actor],to:positions[1-actor],at:starts[i]+660-knee.accents[move].windup,hitAt:starts[i]+660}));
  return {actor,canvas,ctx,events,width:0,height:0};
});
function image(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});}
function preparePawn(image,crop,anchor,width){
  const s=width/crop[2],w=crop[2]*s,h=crop[3]*s,ax=(anchor[0]-crop[0])*s,ay=(anchor[1]-crop[1])*s;
  const shadow=window.TileRendererV2.makeGroundShadow(image,{crop,anchor,width},[23,7]);
  const pad=8,res=3,mask=document.createElement('canvas');mask.width=Math.ceil((w+2*pad)*res);mask.height=Math.ceil((h+2*pad)*res);
  const mc=mask.getContext('2d');mc.scale(res,res);mc.drawImage(image,...crop,pad,pad,w,h);
  mc.globalCompositeOperation='source-in';mc.fillStyle='#fff0c8';mc.fillRect(0,0,w+pad*2,h+pad*2);
  const rim=document.createElement('canvas');rim.width=mask.width;rim.height=mask.height;const rc=rim.getContext('2d');
  for(let n=0;n<8;n++)rc.drawImage(mask,Math.cos(n*Math.PI/4)*1.3*res,Math.sin(n*Math.PI/4)*1.3*res);
  rc.globalCompositeOperation='destination-out';rc.drawImage(mask,0,0);
  // Fade the completed outline above the feet: no synthetic cut edge or glowing base.
  rc.globalCompositeOperation='destination-in';
  const fade=rc.createLinearGradient(0,(pad+ay-18)*res,0,(pad+ay-8)*res);fade.addColorStop(0,'#ffffffff');fade.addColorStop(1,'#ffffff00');rc.fillStyle=fade;rc.fillRect(0,0,rim.width,rim.height);
  return{image,crop,w,h,ax,ay,shadow,rim:{image:rim,x:-ax-pad,y:8-ay-pad,w:rim.width/res,h:rim.height/res}};
}
function view(scene){return {scale:zoom,project:p=>({x:scene.width/2+(p.x-p.y)*72*zoom,y:scene.height*.64+(p.x+p.y)*36*zoom}),direction:(x,y)=>({x:(x-y)*72,y:(x+y)*36})};}
function floor(scene,v){
  const ctx=scene.ctx;
  for(let sum=-8;sum<=8;sum++)for(let x=-5;x<=5;x++){
    const y=sum-x;if(Math.abs(y)>5)continue;const p=v.project({x,y}),r=Math.abs(x)+Math.abs(y);
    ctx.beginPath();ctx.moveTo(p.x,p.y-36*zoom);ctx.lineTo(p.x+72*zoom,p.y);ctx.lineTo(p.x,p.y+36*zoom);ctx.lineTo(p.x-72*zoom,p.y);ctx.closePath();
    ctx.fillStyle=(x+y)%2?'#303e31':'#344234';ctx.fill();ctx.strokeStyle=`rgba(169,180,145,${Math.max(.025,.14-r*.018)})`;ctx.lineWidth=1;ctx.stroke();
  }
  const g=ctx.createRadialGradient(scene.width*.5,scene.height*.65,30,scene.width*.5,scene.height*.65,scene.width*.65);g.addColorStop(0,'#17271c00');g.addColorStop(1,'#14221dc0');ctx.fillStyle=g;ctx.fillRect(0,0,scene.width,scene.height);
}
function placed(scene,id,v,fn){
  const p=v.project(positions[id]),o=P.pawnOffset(id,scene.events,time,v.project,zoom),ctx=scene.ctx;
  ctx.save();ctx.translate(p.x+o.x,p.y+o.y);ctx.scale(zoom,zoom);fn(ctx,pawns[id]);ctx.restore();
}
function draw(scene){
  const {ctx,width,height,events,actor}=scene,v=view(scene);ctx.clearRect(0,0,width,height);floor(scene,v);
  if(showAura)placed(scene,actor,v,(ctx,pawn)=>drawAura(ctx,{time,events,layer:'back',rim:pawn.rim}));
  for(const id of [0,1])placed(scene,id,v,(ctx,s)=>{ctx.drawImage(s.shadow,-64,-32,160,88);ctx.drawImage(s.image,...s.crop,-s.ax,8-s.ay,s.w,s.h);});
  if(showAura)placed(scene,actor,v,(ctx,pawn)=>drawAura(ctx,{time,events,layer:'front',rim:pawn.rim}));
  for(const e of events){const g=P.drawStrike(ctx,e,time,v,events);if(showAura&&g)drawBurstStrike(ctx,e,time,g);}
  for(const id of [0,1]){
    const p=v.project(positions[id]);ctx.fillStyle=id===actor?'#efe1c0':'#95a78c';ctx.font='10px "Microsoft YaHei"';ctx.textAlign='center';ctx.fillText(id?'头目':'主角',p.x,p.y+28*zoom);
  }
  const st=stateAt(time,events);
  $(`breath-state-${actor}`).textContent=time<timing.inhale?'平常状态':time<timing.ignite?(actor?'沉肩吸气 · 预警':'收气入身'):time<timing.settle?'催气发动':st.remaining?`催气中 · 剩余 ${st.remaining} 招`:time<st.end?'末击释放':st.dissolving?'气劲消散':'平常状态';
  [...$(`breath-dots-${actor}`).children].forEach((el,i)=>el.classList.toggle('on',i<st.remaining));
  const active=st.attack;
  $(`breath-caption-${actor}`).textContent=!showAura?'已关闭催气特效 · 对照原有攻击':time<timing.inhale?'平常站姿':time<timing.ignite?'向胸腹收气':time<timing.settle?'气浪撑开 · 进入催气':active?`${labels[active.move]} · ${time<active.hitAt?'收紧发力':'瞬间释放'}`:st.dissolving?'最后一击后散气':st.remaining?'肩臂气流持续起伏':'恢复平常状态';
}
function update(){if(!pawns.length)return;scenes.forEach(draw);$('breath-timeline').value=time;$('breath-time').textContent=(time/1000).toFixed(2)+'s';$('breath-play').textContent=playing?'暂停':'播放';}
function setMode(next){mode=next;time=modes[mode][0];playing=true;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));const url=new URL(location.href);url.searchParams.set('phase',mode);history.replaceState(null,'',url);update();}
function resize(){for(const s of scenes){const r=s.canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;s.width=r.width;s.height=r.height;s.canvas.width=Math.round(r.width*dpr);s.canvas.height=Math.round(r.height*dpr);s.ctx.setTransform(dpr,0,0,dpr,0,0);}update();}
function frame(now){if(playing){time+=P.frameDelta(now-last)*speed;const [start,end]=modes[mode];if(time>end){if($('breath-loop').checked)time=start+(time-end)%(end-start);else{time=end;playing=false;}}}last=now;update();requestAnimationFrame(frame);}
async function boot(){
  const [manifest,player,boss]=await Promise.all([fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r=>r.json()),image('assets/map/isometric/player-atlas-v1/L00.png'),image('assets/map/isometric/street-thug-boss-v1/standing.png')]);
  const st=manifest.states.find(s=>s.id==='D000');
  // Manifest anchor is crop-local; TileRenderer pawn-spec anchors are image-local.
  pawns=[preparePawn(player,st.crop,[st.crop[0]+st.anchor[0],st.crop[1]+st.anchor[1]],st.crop[2]*manifest.displayBaseWidth/st.baseWidth),preparePawn(boss,[240,40,715,1200],[597.5,1238],46)];
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('breath-zoom').onchange=()=>{zoom=Number($('breath-zoom').value);document.querySelectorAll('.breath-scale').forEach(el=>el.textContent=zoom===1?'144px 格宽 · 实际尺寸':'放大细看 · 1.7×');update();};
  $('breath-speed').onchange=()=>speed=Number($('breath-speed').value);
  $('aura').onchange=()=>{showAura=$('aura').checked;update();};
  $('breath-play').disabled=false;$('breath-replay').disabled=false;
  $('breath-play').onclick=()=>{if(time>=modes[mode][1])time=modes[mode][0];playing=!playing;update();};
  $('breath-replay').onclick=()=>setMode(mode);
  $('breath-timeline').oninput=()=>{const selected=Number($('breath-timeline').value);setMode('full');time=selected;playing=false;update();};
  $('breath-freeze').onclick=()=>{setMode('attack');time=scenes[1].events[2].hitAt+65;playing=false;update();};
  new ResizeObserver(resize).observe(document.querySelector('.breath-scenes'));resize();
  const requested=new URLSearchParams(location.search).get('phase');setMode(requested in modes?requested:'full');last=performance.now();requestAnimationFrame(frame);
}
boot().catch(error=>{document.querySelector('.breath-scenes').innerHTML='<p class="breath-error">棋子加载失败，请通过项目本地服务重新打开。</p>';console.error(error);});

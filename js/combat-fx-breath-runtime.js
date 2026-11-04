/* Basic-breath V01 state presentation. Reads gameplay; owns only disposable visual clocks. */
(function(g){
'use strict';
const paint=g.CombatFxBreathPaint,SPEED=1.5,clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const p=clamp(n);return p*p*(3-2*p);};
let entries=new Map(),mapRef=null,mapId=null;
const rimCache=new WeakMap();
const now=()=>g.CombatFxRuntime.getPlaybackTime()*SPEED;
function clear(){entries.clear();mapRef=null;mapId=null;}
function syncMap(){const m=g.GameEngine?.getMap(),s=g.GameEngine?.getState();if(m!==mapRef||s?.mapId!==mapId){clear();mapRef=m;mapId=s?.mapId;}return !!m;}
function sources(){
  const s=g.GameEngine?.getState();if(!s)return [];
  const active=g.CombatBreath?.active(),dead=!!(g.Survival?.isDead?.()||g.Survival?.getState?.().isDead);
  const out=[{key:'player',kind:'player',x:s.x,y:s.y,dead,remaining:active?.visualId==='basic_breath'?active.remainingAttacks:0,warning:false,ownerId:'player'}];
  for(const b of g.CombatEnemies?.breathVisualStates?.(s.mapId)||[]){
    const rec=mapRef?.enemies?.[b.index];if(!rec||rec.enemy_id!==b.enemyId)continue;
    out.push({...b,kind:'enemy',x:rec.x,y:rec.y});
  }return out;
}
function create(actor,origin,phase){const old=entries.get(actor.key),e={actor:{...actor},origin,phase,events:new Map(),end:Infinity,remaining:3};if(old&&(old.previous||Number.isFinite(old.end)&&now()<old.end+800))e.previous=old;entries.set(actor.key,e);return e;}
function transition(p){
  g.CombatFxRuntime.syncMap();
  if(!syncMap()||p.mapId!==mapId||p.id!=='basic_breath')return;
  const t=now(),old=entries.get(p.actor.key);
  if(p.phase==='warning'){create(p.actor,t-paint.timing.inhale,'warning');return;}
  if(p.phase!=='activate')return;
  // Boss warning has already shown the inward breath; proceed straight to expansion.
  const origin=old?.phase==='warning'?Math.max(t,old.origin+paint.timing.ignite)-paint.timing.ignite:Math.max(t,g.CombatFxRuntime.getActorReadyTime(p.actor.key)*SPEED)-paint.timing.inhale;
  const next=create(p.actor,origin,'active');if(old?.phase==='warning'&&old.previous)next.previous=old.previous;
}
function sourceFor(actor){return sources().find(s=>s.key===actor.key&&(!actor.ownerId||!s.ownerId||s.ownerId===actor.ownerId));}
function readyAt(actor,breath){
  if(!syncMap()||!breath)return 0;
  let e=entries.get(actor.key);
  if(!e){const s=sourceFor(actor);if(!s||s.dead)return 0;e=create({...actor,ownerId:s.ownerId},now()-paint.timing.settle,'active');}
  return (e.origin+paint.timing.settle)/SPEED;
}
function scheduled(a){
  if(!syncMap())return;
  let e=entries.get(a.attacker.key);
  if(!a.breath){
    if(e?.phase==='warning')e.origin=Math.max(e.origin,(a.endMs+260/SPEED)*SPEED-paint.timing.inhale);
    return;
  }
  readyAt(a.attacker,a.breath);e=entries.get(a.attacker.key);if(!e)return;
  const events=a.segments.map(s=>({actor:a.attacker.key,target:a.defender.key,from:a.attacker,to:a.defender,move:s.move,part:s.hitPart,result:s.result,side:/^(lhand|lfoot|left)/.test(s.limbId||'')?'left':'right',at:s.startMs*SPEED,hitAt:s.hitMs*SPEED,segment:s.index}));
  // An updated simultaneous schedule replaces the same action, never adds a second use.
  e.events.set(a.actionId,{events,last:a.breath.remainingAfter===0});
  e.end=Infinity;
  for(const a of e.events.values())if(a.last)e.end=Math.max(...a.events.map(s=>s.hitAt))+260;
}
function update(t){
  if(!syncMap())return;
  const live=new Map(sources().map(s=>[s.key,s]));
  for(const s of live.values()){
    let e=entries.get(s.key);
    if(e&&e.actor.ownerId&&s.ownerId&&e.actor.ownerId!==s.ownerId){entries.delete(s.key);e=null;}
    if(s.dead){entries.delete(s.key);continue;}
    if(!e&&(s.remaining>0||s.warning))e=create(s,t-(s.warning?1200:paint.timing.settle),s.warning?'warning':'active');
    if(!e)continue;
    e.actor={...e.actor,...s};e.remaining=s.remaining;
    if(t>=e.origin+paint.timing.inhale)delete e.previous;
    if(s.remaining>0){if(e.phase==='warning'){e.phase='active';e.origin=t-paint.timing.ignite;}if(Number.isFinite(e.end)&&![...e.events.values()].some(a=>a.last))e.end=Infinity;}
    else if(!s.warning&&!Number.isFinite(e.end)){
      const hits=[...e.events.values()].flatMap(a=>a.events.map(v=>v.hitAt+260));
      e.end=Math.max(t,...hits);
    }
    if(t>e.end+800)entries.delete(s.key);
    for(const [id,a]of e.events)if(!a.last&&a.events.every(v=>t>v.hitAt+700))e.events.delete(id);
  }
  for(const key of entries.keys())if(!live.has(key))entries.delete(key);
}
function sample(e,t){
  if(e.previous&&t<e.origin+paint.timing.inhale)return sample(e.previous,t);
  const local=t-e.origin;
  if(e.phase==='warning')return {time:Math.min(1200,local),state:{end:Infinity,strength:0,dissolving:false,compression:0,pulse:0}};
  const events=[...e.events.values()].flatMap(a=>a.events),attack=events.find(a=>t>=a.at&&t<a.hitAt+430);
  const compression=attack&&t<attack.hitAt?smooth((t-attack.at)/(attack.hitAt-attack.at))*.24:0;
  const pulse=attack&&t>=attack.hitAt?(1-clamp((t-attack.hitAt)/330))*.6:0;
  const fade=1-smooth((t-e.end)/800),strength=smooth((local-paint.timing.ignite)/260)*fade;
  return {time:local,state:{remaining:e.remaining,end:e.end-e.origin,attack,fade,compression,pulse,strength:strength*(1-compression+pulse),dissolving:t>=e.end&&t<e.end+800}};
}
// Identical alpha rim construction to the approved preview, cached per actual pawn pose.
function rimFor(p){
  let cache=rimCache.get(p.image);if(!cache){cache=new Map();rimCache.set(p.image,cache);}
  const key=[...p.crop,...p.anchor,p.width].join(',');if(cache.has(key))return cache.get(key);
  const s=p.width/p.crop[2],w=p.width,h=p.crop[3]*s,ax=(p.anchor[0]-p.crop[0])*s,ay=(p.anchor[1]-p.crop[1])*s,pad=8,res=3;
  const mask=g.document.createElement('canvas');mask.width=Math.ceil((w+2*pad)*res);mask.height=Math.ceil((h+2*pad)*res);
  const mc=mask.getContext('2d');mc.scale(res,res);mc.drawImage(p.image,...p.crop,pad,pad,w,h);
  mc.globalCompositeOperation='source-in';mc.fillStyle='#fff0c8';mc.fillRect(0,0,w+pad*2,h+pad*2);
  const rim=g.document.createElement('canvas');rim.width=mask.width;rim.height=mask.height;const rc=rim.getContext('2d');
  for(let n=0;n<8;n++)rc.drawImage(mask,Math.cos(n*Math.PI/4)*1.3*res,Math.sin(n*Math.PI/4)*1.3*res);
  rc.globalCompositeOperation='destination-out';rc.drawImage(mask,0,0);
  rc.globalCompositeOperation='destination-in';const fade=rc.createLinearGradient(0,(pad+ay-18)*res,0,(pad+ay-8)*res);fade.addColorStop(0,'#ffffffff');fade.addColorStop(1,'#ffffff00');rc.fillStyle=fade;rc.fillRect(0,0,rim.width,rim.height);
  const result={image:rim,x:-ax-pad,y:8-ay-pad,w:rim.width/res,h:rim.height/res};cache.set(key,result);return result;
}
function visible(actor,args){
  if(actor.kind==='player')return true;
  if(!args.dynamicMetaAt)return true;
  const m=args.dynamicMetaAt(actor.x,actor.y);
  return !!(m?.enemy&&m.enemyId===actor.enemyId&&!m.unknownPresence&&m.terrainVisible!==false);
}
function pawnPaints(args,view,t){
  const list=(args.pawnPaints||[]).slice(),f=g.PlayerPawnRig?.getPaintFrame?.(),s=g.GameEngine?.getState();
  if(f&&s){const p=view.project(s),o=g.CombatFxRuntime.getPawnOffsetAt(s.x,s.y,'player',args);list.push({...f,cx:p.x+o.x,cy:p.y+o.y,scale:view.scale,actorKey:'player'});}
  return list;
}
function maskPawn(ctx,p){
  const s=p.width/p.crop[2];ctx.save();ctx.translate(p.cx,p.cy);ctx.scale(p.scale,p.scale);
  if(p.shadow){ctx.save();ctx.filter='blur(.35px)';ctx.drawImage(p.shadow,-64,-32,160,88);ctx.restore();}
  ctx.drawImage(p.image,...p.crop,(p.crop[0]-p.anchor[0])*s,8+(p.crop[1]-p.anchor[1])*s,p.width,p.crop[3]*s);ctx.restore();
}
function render(args,view,t){
  update(t);if(!entries.size)return;
  const paints=pawnPaints(args,view,t),ctx=args.ctx;
  const visibleEntries=[...entries.values()].filter(e=>visible(e.actor,args));
  for(const e of visibleEntries){
    const pawn=paints.find(p=>p.actorKey===e.actor.key);if(!pawn)continue;
    const sampleAt=sample(e,t),rim=rimFor(pawn),s=view.scale;
    // The foreground canvas is above the DOM player. Alpha-mask the back pass by
    // the exact drawn pawn pixels, so it composites as if painted before the pawns.
    const size=200*s,dpr=Math.max(1,g.devicePixelRatio||1);
    if(!e.surface)e.surface=g.document.createElement('canvas');
    const surface=e.surface;if(surface.width!==Math.ceil(size*dpr))surface.width=surface.height=Math.ceil(size*dpr);
    const back=surface.getContext('2d'),x=pawn.cx-size/2,y=pawn.cy-size*.68;
    back.setTransform(dpr,0,0,dpr,0,0);back.clearRect(0,0,size,size);back.save();back.translate(size/2,size*.68);back.scale(s,s);
    paint.drawAura(back,{...sampleAt,layer:'back',rim});back.restore();
    back.save();back.translate(-x,-y);back.globalCompositeOperation='destination-out';
    for(const other of paints)if(Math.abs(other.cx-pawn.cx)<size&&Math.abs(other.cy-pawn.cy)<size)maskPawn(back,other);
    back.restore();ctx.drawImage(surface,x,y,size,size);
  }
  for(const e of visibleEntries){
    const pawn=paints.find(p=>p.actorKey===e.actor.key);if(!pawn)continue;
    ctx.save();ctx.translate(pawn.cx,pawn.cy);ctx.scale(view.scale,view.scale);
    paint.drawAura(ctx,{...sample(e,t),layer:'front',rim:rimFor(pawn)});ctx.restore();
  }
}
function drawStrike(ctx,a,e,t,shape,args){
  if(!a.breath)return;
  const source=sourceFor(a.attacker);
  if(!source||source.dead||!visible(source,args))return;
  paint.drawBurstStrike(ctx,e,t,shape);
}
g.CombatFxBreathRuntime={clear,readyAt,scheduled,render,drawStrike,transition,update,
  sampleAt:(key,t)=>entries.has(key)?sample(entries.get(key),t):null,
  inspect:()=>[...entries.values()].map(e=>({actor:{...e.actor},origin:e.origin,phase:e.phase,end:e.end,remaining:e.remaining,events:[...e.events.values()].flatMap(a=>a.events)}))};
g.SceneAnimation?.on('combat:breath-state',transition);
})(typeof window!=='undefined'?window:globalThis);

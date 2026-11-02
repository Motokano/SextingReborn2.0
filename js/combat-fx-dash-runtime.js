/* Replays committed routes with the frozen v1 renderer. No gameplay mutation. */
(function(g){
'use strict';
const D=g.CombatFxDash,SPEED=1.5;
let entries=[];
function clear(){entries=[];}
function alive(e){const map=g.GameEngine?.getMap(),rec=map?.enemies?.[e.actor.index];return map?.map_id===e.mapId&&rec?.enemy_id===e.actor.enemyId&&rec.dungeonUid===e.actor.uid&&rec.x===e.actor.x&&rec.y===e.actor.y;}
function enqueue(payload){
 g.CombatFxRuntime.syncMap();if(payload?.mapId!==g.GameEngine?.getState()?.mapId||!Array.isArray(payload.path)||payload.path.length<2)return;
 const e=JSON.parse(JSON.stringify(payload)),route=D.prepare(e.path,p=>p);
 e.start=Math.max(g.CombatFxRuntime.getActorReadyTime(e.actor.key),g.CombatFxRuntime.getActorReadyTime('player'));e.end=e.start+D.durations(route).total/SPEED;
 g.CombatFxRuntime.reserveMotion([e.actor.key,'player'],e.end);entries.push(e);if(entries.length>32)entries.shift();
}
function visible(e,args){if(!args.dynamicMetaAt)return true;const m=args.dynamicMetaAt(e.actor.x,e.actor.y);return m?.enemyId===e.actor.enemyId&&!m.unknownPresence&&m.terrainVisible!==false;}
function offset(x,y,kind,args,view,time){
 const out={x:0,y:0};if(kind!=='enemy')return out;
 const e=entries.findLast(e=>alive(e)&&e.actor.x===x&&e.actor.y===y&&time<=e.end);if(!e)return out;
 const route=D.prepare(e.path,view.project),p=D.stateAt(route,(time-e.start)*SPEED,view.scale),end=view.project(e.actor);
 out.x=p.x-end.x;out.y=p.y-end.y;return out;
}
function pawn(ctx,p,at,alpha=1,shadow=false){const s=p.width/p.crop[2];ctx.save();ctx.globalAlpha=alpha;ctx.translate(at.x,at.y);ctx.scale(p.scale,p.scale);if(shadow&&p.shadow)ctx.drawImage(p.shadow,-64,-32,160,88);ctx.drawImage(p.image,...p.crop,(p.crop[0]-p.anchor[0])*s,8+(p.crop[1]-p.anchor[1])*s,p.width,p.crop[3]*s);ctx.restore();}
function render(args,view,time){
 entries=entries.filter(e=>alive(e)&&time<=e.end+D.timing.dustLife/SPEED);
 for(const e of entries){
  if(!visible(e,args)||time<e.start)continue;
  const source=(args.pawnPaints||[]).find(p=>p.actorKey===e.actor.key);if(!source)continue;
  const route=D.prepare(e.path,view.project),age=(time-e.start)*SPEED,st=D.stateAt(route,age,view.scale),particles=D.particlesAt(route,age,view.scale,29),front=p=>p.kind==='brake'&&p.y>st.y+6*view.scale;
  const pts=route.points,x=Math.min(...pts.map(p=>p.x))-100*view.scale,y=Math.min(...pts.map(p=>p.y))-150*view.scale,w=Math.max(...pts.map(p=>p.x))-x+100*view.scale,h=Math.max(...pts.map(p=>p.y))-y+100*view.scale;
  if(!e.surface)e.surface=g.document.createElement('canvas');const surface=e.surface,dpr=Math.max(1,g.devicePixelRatio||1);
  if(surface.width!==Math.ceil(w*dpr)||surface.height!==Math.ceil(h*dpr)){surface.width=Math.ceil(w*dpr);surface.height=Math.ceil(h*dpr);}
  const ctx=surface.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(-x,-y);
  D.drawDust(ctx,particles.filter(p=>!front(p)));for(const ghost of D.ghostsAt(route,age,view.scale))pawn(ctx,source,ghost,ghost.alpha);
  ctx.globalCompositeOperation='destination-out';for(const p of args.pawnPaints||[])pawn(ctx,p,{x:p.cx,y:p.cy},1,true);
  const player=g.PlayerPawnRig?.getPaintFrame?.(),pos=g.GameEngine.getState();if(player){const p=view.project(pos);pawn(ctx,{...player,scale:view.scale},p,1,true);}
  ctx.restore();args.ctx.drawImage(surface,x,y,w,h);D.drawDust(args.ctx,particles.filter(front));
 }
}
g.CombatFxDashRuntime={enqueue,offset,render,clear,hasMotion:t=>entries.some(e=>alive(e)&&t<=e.end+D.timing.dustLife/SPEED),getEntries:()=>entries.map(({surface,...e})=>JSON.parse(JSON.stringify(e)))};
g.SceneAnimation?.on('combat:dash',enqueue);
})(typeof window!=='undefined'?window:globalThis);

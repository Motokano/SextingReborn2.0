import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let clock=1000,map={map_id:'arena',enemies:[]},state={mapId:'arena',x:1,y:1},delivered=0,flush;
const c=vm.createContext({console,performance:{now:()=>clock},setTimeout,clearTimeout});c.window=c;
c.GameEngine={getMap:()=>map,getState:()=>state};
c.CombatWorld={checkAttackDistance(){},queueDisplacement(){},flushDisplacements(){if(flush)flush();}};
c.CombatEnemies={onEnemyDamageResolved(){delivered++;}};
for(const file of ['combat-damage','scene-animation','combat-fx-paint','combat-fx-presentation','combat-fx-events','combat-fx-runtime','combat-pipeline','core/map-projection'])vm.runInContext(read('js/'+file+'.js'),c,{filename:file});
const P=c.CombatPipeline,R=c.CombatFxRuntime,F=c.CombatFxEvents,A=c.SceneAnimation;
P.setConfig({pipelines:{test:{phases:[{handler:'test.defense'},{handler:'builtin.damage_stub'}]}}});
P.registerPhaseHandler('test.defense',ctx=>{
  if(ctx.hitPart==='lhand'){ctx.parrySucceeded=true;ctx.damageAfterParry=0;}
  if(ctx.hitPart==='head'){ctx.defenseBreakdown={absorbed:10};ctx.damageAfterUnifiedDefense=0;}
  return ctx;
});
const events=[];A.on('combat:resolved',p=>events.push(p));
const attack=(opts={})=>({moveId:'slap_combo',skillId:'fixture',limbId:'rhand',hitRollSuccess:true,hitPart:'chest',rawDamage:10,
  attacker:{kind:'player',pos:{x:1,y:1}},defender:{kind:'enemy',enemyId:'target',index:0,pos:{x:2,y:1}},...opts});
const resolve=ctx=>P.runPipeline('test',ctx);
const latest=()=>events.at(-1);
// Real pipeline -> immutable resolved event -> live scheduler. Segment count comes from results.
let ctx=attack({segments:[{hitRollSuccess:true,hitPart:'chest'},{hitRollSuccess:true,hitPart:'lhand'},{hitRollSuccess:false,hitPart:'abdomen'}]});
resolve(ctx);
assert.deepEqual(Array.from(latest().segments,s=>s.result),['hit','parry','miss']);
assert.equal(latest().segments.length,3);assert.equal(ctx.finalDamage,10);
const multi=R.getActiveActions()[0];assert.equal(multi.segments.length,3);
assert(multi.segments[0].hitMs<multi.segments[1].hitMs && multi.segments[1].hitMs<multi.segments[2].hitMs);
assert.equal(R.speed,1.5);
assert(Math.abs((multi.segments[1].startMs-multi.segments[0].startMs)*R.speed-420)<1e-8,'triple slap uses demo variant gap');
ctx.defender.pos.x=99;ctx.segmentsResults[0].hitPart='head';
assert.equal(latest().defender.x,2);assert.equal(latest().segments[0].hitPart,'chest');
const count=events.length;F.publish(ctx);assert.equal(events.length,count,'one event per action');
const queued=R.getActiveActions().length;R.enqueue(latest());assert.equal(R.getActiveActions().length,queued,'repeated event IDs do not duplicate');
// Snapshot exists before displacement changes the world/context.
R.clear();ctx=attack({moveId:'front_kick'});flush=()=>{ctx.defender.pos.x=3;};resolve(ctx);flush=null;
assert.equal(latest().defender.x,2);assert.equal(ctx.defender.pos.x,3);
// Distinct zero-damage causes. Zero damage alone is not a miss or an armor result.
for(const [overrides,result] of [[{distanceMiss:true,hitRollSuccess:false},'distance'],[{forceZeroDamageByResourceInsufficient:true},'dry'],[{hitRollSuccess:false},'miss'],[{hitPart:'lhand'},'parry'],[{hitPart:'head'},'armor'],[{rawDamage:0},'hit']]){
  resolve(attack(overrides));assert.equal(latest().segments[0].result,result);
}
// Same-speed dry runs are silent; committed sides align even with different segment counts.
R.clear();const before=events.length,group=F.nextGroupId();
const player=attack({simultaneousDryRun:true,fxGroupId:group,segments:[{hitRollSuccess:true},{hitRollSuccess:false}]}),enemy=attack({simultaneousDryRun:true,fxGroupId:group,moveId:'thug_shove',attacker:{kind:'enemy',enemyId:'target',index:0,pos:{x:2,y:1}},defender:{kind:'player',pos:{x:1,y:1}}});
resolve(player);resolve(enemy);assert.equal(events.length,before);
P.finalizeSimultaneousStrike(player);P.finalizeSimultaneousStrike(enemy);
assert.equal(events.length,before+2);
let scheduled=R.getActiveActions();assert.equal(scheduled[0].startMs,scheduled[1].startMs);
assert.equal(scheduled[0].segments[0].hitMs,scheduled[1].segments[0].hitMs,'different move silhouettes still contact simultaneously');
assert.equal(scheduled[1].segments[0].move,'shove');
P.finalizeSimultaneousStrike(player);assert.equal(events.length,before+2);
// Ordinary reply waits for the preceding whole move. No 120ms legacy throttle is applied.
R.clear();resolve(attack({segments:[{hitRollSuccess:true},{hitRollSuccess:true},{hitRollSuccess:true}]}));
resolve(attack({moveId:'thug_punch',attacker:{kind:'enemy',enemyId:'target',index:0,pos:{x:2,y:1}},defender:{kind:'player',pos:{x:1,y:1}}}));
scheduled=R.getActiveActions();assert(scheduled[1].startMs>scheduled[0].endMs);
assert(Math.abs((scheduled[1].startMs-scheduled[0].endMs)*R.speed-260)<1e-8,'reply keeps the demo whole-move recovery gap');
assert.equal(scheduled[1].segments[0].move,'jab');
R.clear();resolve(attack({segments:[{hitRollSuccess:true},{hitRollSuccess:true}]}));
const baseSlap=R.getActiveActions()[0];
assert(Math.abs((baseSlap.segments[1].startMs-baseSlap.segments[0].startMs)*R.speed-400)<1e-8,'original two-hit slap keeps demo base gap');
// Rendering the approved primitives across all moves/results/directions catches missing helpers,
// invalid geometry, Canvas stack leaks and accidental legacy projectile duplication.
let depth=0,paintCalls=0;
const gradient={addColorStop(){}};
const canvas=new Proxy({save(){depth++;},restore(){depth--;assert(depth>=0);},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;}},{get:(o,k)=>k in o?o[k]:(...args)=>{for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),String(k));paintCalls++;},set:(o,k,v)=>(o[k]=v,true)});
const projections=['isometric','legacy'].map(mode=>c.MapProjection.create({width:7,height:7},101,mode));
const args={ctx:canvas,cellPx:101,cellCenter:projections[0].cellCenter,projection:projections[0]};
for(const projection of projections)for(const move of Object.keys(c.CombatFxPaint.accents))for(const result of ['hit','parry','miss','armor','dry','distance'])for(const dir of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
  R.clear();const payload={actionId:'draw-'+move+result+dir,mapId:state.mapId,attacker:{key:'player',x:0,y:0},defender:{key:'enemy',x:dir[0],y:dir[1]},segments:[{moveId:move,limbId:dir[0]<0?'lfoot':'rfoot',hitPart:'abdomen',result,damage:10}]};
  R.enqueue(payload);const s=R.getActiveActions()[0].segments[0];
  for(const t of [s.startMs+20,s.hitMs-15,s.hitMs+35,s.hitMs+140])R.render({...args,projection,cellCenter:projection.cellCenter,nowMs:t});
  assert.equal(depth,0,move+result);
}
assert(paintCalls>0);const damageBeforeRender=delivered;R.render({...args,nowMs:clock+2000});assert.equal(delivered,damageBeforeRender);
// Audit the full normal swing against miss/dry on real map projections, including
// the second slap, both hands/feet, low/high targets and the complete trail fade.
const paint=c.CombatFxPaint,originalTrail=paint.drawMoveTrail,originalContact=paint.drawMoveContact;
let trails=[],contacts=0,fullBrushFrames=0;
paint.drawMoveTrail=(ctx,stroke)=>{
  const {result,...geometry}=stroke;
  trails.push({...geometry,alpha:ctx.globalAlpha});
  return originalTrail(ctx,stroke);
};
paint.drawMoveContact=(...params)=>{contacts++;return originalContact(...params);};
const normalized=v=>JSON.parse(JSON.stringify(v,(_,n)=>typeof n==='number'?Math.round(n*1e7)/1e7:n));
try{
  for(const projection of projections)for(const move of Object.keys(paint.accents))for(const side of ['l','r'])for(const part of ['head','abdomen','left_leg'])for(const dir of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
    let normalFrames;
    for(const result of ['hit','miss','dry']){
      R.clear();
      R.enqueue({actionId:'full-brush',mapId:state.mapId,attacker:{key:'player',kind:'player',x:0,y:0},defender:{key:'enemy',kind:'enemy',x:dir[0],y:dir[1]},
        segments:Array.from({length:move==='slap_combo'?2:1},()=>({moveId:move,limbId:side+(/kick/.test(move)?'foot':'hand'),hitPart:part,result,damage:result==='hit'?10:0}))});
      const action=R.getActiveActions()[0],frames=[];
      for(const segment of action.segments)for(const age of [-180,-25,0,55,125,161,279,281]){
        const time=segment.hitMs+age/R.speed;trails=[];contacts=0;
        R.render({...args,projection,cellCenter:projection.cellCenter,nowMs:time});
        const expectedContacts=result==='hit'?action.segments.filter(s=>{const a=(time-s.hitMs)*R.speed;return a>=0&&a<=paint.contactLife;}).length:0;
        assert.equal(contacts,expectedContacts,`${move}/${result}/${segment.index}/${age}: only hit segments get a burst`);
        frames.push(normalized(trails));fullBrushFrames++;
      }
      if(result==='hit')normalFrames=frames;
      else assert.deepEqual(frames,normalFrames,`${move}/${result}/${side}/${part}/${dir}: full trail, opacity and fade must equal a hit`);
    }
  }
}finally{paint.drawMoveTrail=originalTrail;paint.drawMoveContact=originalContact;}
// Resource insufficiency and misses must survive actual multi-segment resolution.
for(const move of Object.keys(paint.accents))for(const result of ['hit','miss','dry']){
  R.clear();const n=move==='slap_combo'?2:1;
  resolve(attack({moveId:move,hitRollSuccess:result!=='miss',forceZeroDamageByResourceInsufficient:result==='dry',
    segments:n>1?Array.from({length:n},()=>({hitRollSuccess:result!=='miss',hitPart:'chest',rawDamage:10})):null}));
  assert.deepEqual(Array.from(latest().segments,s=>s.result),Array(n).fill(result),`${move}: each resolved segment keeps ${result}`);
  if(result!=='hit')assert(latest().segments.every(s=>s.damage===0));
}
console.log(`PASS all-move full brush audit: ${fullBrushFrames} real-projection frames; miss/dry equal normal trails; hit-only bursts; both slap segments and all nine pipeline results.`);
R.clear();resolve(attack());const queuedBefore=R.getActiveActions().length;
A.emit('combat:attack',{resolvedFx:true,x:2,y:1,fromX:1,fromY:1});assert.equal(R.getActiveActions().length,queuedBefore);
// Leaving a map (including replacing a map under the same ID) clears all queued visuals.
state={...state,mapId:'other'};map={map_id:'other'};R.render({...args,nowMs:clock});assert.equal(R.getActiveActions().length,0);
resolve(attack());assert.equal(R.getActiveActions().length,1);map={map_id:'other'};R.render({...args,nowMs:clock});assert.equal(R.getActiveActions().length,0);
console.log('PASS combat FX: pipeline events, actual segments, snapshots, simultaneous commit, replies, zero causes, 864 drawing combinations with real projections and map cleanup.');

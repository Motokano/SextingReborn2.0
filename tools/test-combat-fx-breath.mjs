import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as frozen from './fixtures/combat-fx-breath-v1.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function recorder(){
 const commands=[],stack=[];let state={globalAlpha:1,transform:[],fillStyle:'#000'},path=[];
 const ctx={commands,save(){stack.push({...state,transform:[...state.transform]});},restore(){assert(stack.length);state=stack.pop();},beginPath(){path=[];},
  fill(){commands.push(['fill',path.slice(),{...state}]);},stroke(){commands.push(['stroke',path.slice(),{...state}]);},
  fillRect(...a){commands.push(['fillRect',a,{...state}]);},drawImage(...a){commands.push(['drawImage',a,{...state}]);},
  clearRect(){},setTransform(...a){state.transform=[['set',...a]];},fillText(){},strokeText(){},
  createRadialGradient(...a){return {a,stops:[],addColorStop(...v){this.stops.push(v);}};},createLinearGradient(...a){return {a,stops:[],addColorStop(...v){this.stops.push(v);}};},
  balanced(){assert.equal(stack.length,0);}};
 for(const k of ['translate','scale','rotate','transform'])ctx[k]=(...a)=>{state.transform=[...state.transform,[k,...a]];};
 for(const k of ['moveTo','lineTo','arc','ellipse','closePath','quadraticCurveTo','bezierCurveTo'])ctx[k]=(...a)=>path.push([k,...a]);
 return new Proxy(ctx,{get:(o,k)=>k in o?o[k]:state[k],set:(o,k,v)=>(state[k]=v,true)});
}
const normal=o=>JSON.parse(JSON.stringify(o,(_,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v));
let real=0,map={map_id:'breath',enemies:[{enemy_id:'enemy.street_thug_boss',x:4,y:3}]},pos={mapId:'breath',x:3,y:3},player={visualId:'basic_breath',remainingAttacks:3},dead=false;
let boss=[{key:'enemy:0',index:0,enemyId:'enemy.street_thug_boss',ownerId:'boss-1',dead:false,remaining:0,warning:false}];
const c=vm.createContext({console,performance:{now:()=>real},devicePixelRatio:1,document:{querySelector:()=>null,createElement:()=>({width:0,height:0,getContext:()=>recorder()})}});c.window=c;
c.GameEngine={getMap:()=>map,getState:()=>pos};c.CombatBreath={active:()=>player};c.Survival={getState:()=>({isDead:dead})};c.CombatEnemies={breathVisualStates:()=>boss};
for(const n of ['scene-animation','combat-fx-paint','combat-fx-presentation','combat-fx-collar-knee','combat-fx-runtime','combat-fx-breath','combat-fx-breath-runtime'])vm.runInContext(read('js/'+n+'.js'),c,{filename:n});
const paint=c.CombatFxBreathPaint,R=c.CombatFxRuntime,B=c.CombatFxBreathRuntime;
const rim={image:'rim',x:-31,y:-70,w:62,h:90};
const events=[{at:5700,hitAt:6060},{at:9130,hitAt:9560},{at:12700,hitAt:13060}];
let checks=0;
for(let t=0;t<=14500;t+=37)for(const layer of ['back','front']){
 const expected=recorder(),actual=recorder();frozen.drawAura(expected,{time:t,events,layer,rim});paint.drawAura(actual,{time:t,events,layer,rim});
 assert.deepEqual(normal(actual.commands),normal(expected.commands),`V01 aura ${layer}/${t}`);expected.balanced();actual.balanced();checks++;
}
for(const move of ['jab','front_kick','swing_punch','shove','collar_knee'])for(const result of ['hit','parry','armor','miss','dry','distance'])for(const scale of [1,1.7])for(const side of [-1,1])for(let t=0;t<=1100;t+=41){
 const e={move,result,at:0,hitAt:660},g={scale,from:{x:20*scale,y:40*scale},dest:{x:side*91*scale,y:20*scale}};
 const expected=recorder(),actual=recorder();frozen.drawBurstStrike(expected,e,t,g);paint.drawBurstStrike(actual,e,t,g);
 assert.deepEqual(normal(actual.commands),normal(expected.commands),`V01 burst ${move}/${result}/${t}`);expected.balanced();actual.balanced();checks++;
}
const actor={kind:'player',key:'player',x:3,y:3},foe={kind:'enemy',key:'enemy:0',index:0,enemyId:'enemy.street_thug_boss',ownerId:'boss-1',x:4,y:3};
function start(){real=0;R.clear();R.startPlaybackClock(0);player={visualId:'basic_breath',remainingAttacks:3};boss[0].remaining=0;boss[0].warning=false;dead=false;c.SceneAnimation.emit('combat:breath-state',{phase:'activate',mapId:'breath',id:'basic_breath',actor});}
function enqueue(id,remaining,from=actor,to=foe,extra={}){R.enqueue({actionId:id,mapId:'breath',attacker:from,defender:to,breath:{id:'basic_breath',remainingAfter:remaining},segments:[{moveId:from.kind==='player'?'jab':'collar_knee',hitPart:'chest',limbId:'rhand',result:'hit',damage:10}],...extra});}
start();assert.equal(B.inspect()[0].origin,-600,'start immediately at the approved inward breath');enqueue('one',2);enqueue('two',1);enqueue('three',0);
let actions=R.getActiveActions();assert.equal(actions[0].startMs,(2050-600)/1.5,'first strike follows the complete activation at 1.5x');
player=null;B.update(100);assert.equal(B.inspect().length,1,'immediate mechanical exhaustion must not cancel queued visuals');
const entry=B.inspect()[0],relative=entry.events.map(e=>({...e,at:e.at-entry.origin,hitAt:e.hitAt-entry.origin}));
for(let t=600;t<entry.end-entry.origin+800;t+=83){
 const expected=recorder(),actual=recorder(),sample=B.sampleAt('player',t+entry.origin);
 frozen.drawAura(expected,{time:t,events:relative,layer:'front',rim});paint.drawAura(actual,{...sample,layer:'front',rim});
 assert.deepEqual(normal(actual.commands),normal(expected.commands),`real queue retained exact aura at ${t}`);checks++;
}
B.update(entry.end+801);assert.equal(B.inspect().length,0);
start();B.update(90000);assert.equal(B.inspect().length,1,'idle/stunned/moving time alone never spends a burst');assert.equal(B.sampleAt('player',90000).state.dissolving,false);
player=null;B.update(90001);assert.equal(B.sampleAt('player',90001).state.dissolving,true);B.update(90802);assert.equal(B.inspect().length,0,'disengage/unmount dissipates');
start();dead=true;B.update(100);assert.equal(B.inspect().length,0,'death removes aura immediately');
start();enqueue('old1',2);enqueue('old2',1);enqueue('old3',0);player=null;B.update(100);
const lastCycle=B.sampleAt('player',1200);player={visualId:'basic_breath',remainingAttacks:3};
c.SceneAnimation.emit('combat:breath-state',{phase:'activate',mapId:'breath',id:'basic_breath',actor});
assert.equal(B.inspect()[0].origin,R.getActorReadyTime('player')*1.5-600,'rapid reactivation waits behind already committed visuals');
assert.deepEqual(normal(B.sampleAt('player',1200)),normal(lastCycle),'the previous mantle survives until the next activation can be presented');
start();map={...map};R.render({ctx:recorder(),nowMs:500,cellPx:144,cellCenter:(x,y)=>({x:x*72,y:y*36})});assert.equal(B.inspect()[0].origin,750-2050,'restored active state resumes a mantle without replaying activation');
player=null;map={map_id:'other',enemies:[]};pos={mapId:'other',x:0,y:0};boss=[];R.render({ctx:recorder(),nowMs:700,cellPx:144,cellCenter:(x,y)=>({x:x*72,y:y*36})});assert.equal(B.inspect().length,0);assert.equal(R.getActiveActions().length,0);
// Independent enemy state, warning, late activation and simultaneous scheduling.
map={map_id:'breath',enemies:[{enemy_id:foe.enemyId,x:4,y:3}]};pos={mapId:'breath',x:3,y:3};boss=[{...foe,remaining:0,warning:true,dead:false}];dead=false;R.clear();R.startPlaybackClock(0);
c.SceneAnimation.emit('combat:breath-state',{phase:'warning',id:'basic_breath',mapId:'breath',actor:foe});B.update(2000);assert.equal(B.sampleAt('enemy:0',2000).state.strength,0);
real=2000;R.startPlaybackClock(real);boss[0].remaining=3;boss[0].warning=false;c.SceneAnimation.emit('combat:breath-state',{phase:'activate',id:'basic_breath',mapId:'breath',actor:foe});
assert.equal(B.sampleAt('enemy:0',3000).time,1400,'boss transitions from warning into the same expansion');
player={visualId:'basic_breath',remainingAttacks:3};c.SceneAnimation.emit('combat:breath-state',{phase:'activate',id:'basic_breath',mapId:'breath',actor});
enqueue('enemy',2,foe,actor,{simultaneous:true,groupId:'same'});enqueue('player',2,actor,foe,{simultaneous:true,groupId:'same'});actions=R.getActiveActions();assert.equal(actions[0].segments[0].hitMs,actions[1].segments[0].hitMs);
assert.equal(B.inspect().length,2);assert.equal(B.inspect().find(e=>e.actor.key==='enemy:0').events.length,1,'reschedule replaces the first commitment');
const original=paint.drawAura,drawCalls=[];paint.drawAura=(ctx,o)=>{drawCalls.push(o.layer);original(ctx,o);};
const pawn={image:{name:'boss'},crop:[0,0,46,78],anchor:[23,76],width:46,shadow:{},scale:1,cx:200,cy:200,actorKey:'enemy:0'};
const args={ctx:recorder(),nowMs:2200,cellPx:144,pawnPaints:[pawn],cellCenter:(x,y)=>({x:x*50,y:y*50}),dynamicMetaAt:()=>({enemy:false})};
R.render(args);assert.equal(drawCalls.length,0,'unseen boss cannot leak through its aura');
args.dynamicMetaAt=()=>({enemy:true,enemyId:foe.enemyId,terrainVisible:true});R.render(args);assert.deepEqual(drawCalls,['back','front']);
boss[0].dead=true;drawCalls.length=0;R.render(args);assert.equal(drawCalls.length,0,'dead boss no longer paints');
assert(read('index.html').includes('js/combat-fx-breath-runtime.js'));assert(read('js/combat-fx-breath-prototype.mjs').includes("import './combat-fx-breath.js'"));
console.log(`PASS breath V01: ${checks} frozen paint comparisons; actual queue clocks, full last strike, persistent state, independent actors, warning/activation, same-speed rescheduling, visibility, death, restore and map cleanup.`);

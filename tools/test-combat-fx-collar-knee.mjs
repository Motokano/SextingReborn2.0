import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as approved from './fixtures/combat-fx-collar-knee-v4.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c=vm.createContext({console,performance:{now:()=>1000}});c.window=c;
let map={width:7,height:7},state={mapId:'knee',x:0,y:0};
const playerElement={style:{}};
c.GameEngine={getMap:()=>map,getState:()=>state};
for(const file of ['combat-damage','scene-animation','combat-fx-paint','combat-fx-presentation','combat-fx-collar-knee','combat-fx-events','combat-fx-runtime','combat-pipeline','core/map-projection'])
    vm.runInContext(read('js/'+file+'.js'),c,{filename:file});
c.document={querySelector:()=>playerElement};
const R=c.CombatFxRuntime,P=c.CombatPipeline,events=[];
c.SceneAnimation.on('combat:resolved',p=>events.push(p));
P.setConfig({pipelines:{test:{phases:[{handler:'test.defense'},{handler:'builtin.damage_stub'}]}}});
P.registerPhaseHandler('test.defense',ctx=>{
    if(ctx.testResult==='parry'){ctx.parrySucceeded=true;ctx.damageAfterParry=0;}
    if(ctx.testResult==='armor'){ctx.defenseBreakdown={absorbed:12};ctx.damageAfterUnifiedDefense=0;}
    return ctx;
});
const attack=(result='hit')=>({moveId:'boss_collar_knee',moveTemplate:{fx_move_id:'collar_knee',hit_segments:1},limbId:'rfoot',rawDamage:12,hitPart:'abdomen',testResult:result,
    hitRollSuccess:!['miss','distance'].includes(result),distanceMiss:result==='distance',forceZeroDamageByResourceInsufficient:result==='dry',
    attacker:{kind:'enemy',enemyId:'boss',index:0,pos:{x:1,y:0}},defender:{kind:'player',pos:{x:0,y:0}}});
for(const result of ['hit','parry','armor','miss','dry','distance']){
    R.clear();P.runPipeline('test',attack(result));
    const event=events.at(-1),action=R.getActiveActions()[0],s=action.segments[0];
    assert.equal(event.segments.length,1);assert.equal(event.segments[0].result,result);
    assert.equal(event.segments[0].damage,result==='hit'?12:0);
    assert.equal(s.move,'collar_knee','enemy action visual ID must not fall back to front_kick');
    assert.equal(s.hitMs-s.startMs,440,'660 animation ms at the approved 1.5x speed');
    assert.equal(R.hasPawnMotion(s.hitMs+279/1.5),true,'keep the full final recoil, including its last 20 ms');
    assert.equal(R.hasPawnMotion(s.hitMs+281/1.5),false);
}

// Record actual Canvas paint, gradients, transforms and alpha, ignoring result labels.
function recorder(){
    const draws=[],stack=[];let path=[],s={globalAlpha:1,transform:[],fillStyle:'#000',strokeStyle:'#000',lineWidth:1};
    const emit=(type,geometry)=>draws.push({type,geometry,alpha:s.globalAlpha,transform:s.transform,style:type==='stroke'?s.strokeStyle:s.fillStyle,...(type==='stroke'?{width:s.lineWidth,cap:s.lineCap,join:s.lineJoin}:{})});
    const target={draws,save(){stack.push({...s,transform:[...s.transform]});},restore(){assert(stack.length);s=stack.pop();},beginPath(){path=[];},
        fill(){emit('fill',[...path]);},stroke(){emit('stroke',[...path]);},fillRect(...v){emit('fillRect',v);},
        createRadialGradient(...args){return {args,stops:[],addColorStop(...v){this.stops.push(v);}};},
        createLinearGradient(...args){return {args,stops:[],addColorStop(...v){this.stops.push(v);}};},
        fillText(){},strokeText(){},verify(){assert.equal(stack.length,0);}};
    for(const k of ['translate','scale','rotate','transform'])target[k]=(...v)=>{s.transform=[...s.transform,[k,...v]];};
    for(const k of ['moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','closePath'])target[k]=(...v)=>path.push([k,...v]);
    return new Proxy(target,{get:(o,k)=>k in o?o[k]:s[k],set:(o,k,v)=>(s[k]=v,true)});
}
const normal=v=>JSON.parse(JSON.stringify(v,(_,n)=>{if(typeof n!=='number')return n;assert(Number.isFinite(n));return Math.round(n*1e6)/1e6;}));
const directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const elapsed=[-1,0,65,150,220,310,370,450,550,640,660,678,690,715,785,880,939,941,1200,1321];
const views=[1,1.7].map(scale=>({tileWidth:144*scale,isIsometric:true,cellCenter:(x,y)=>({x:400+(x-y)*72*scale,y:300+(x+y)*36*scale}),directionVector:(x,y)=>({x:(x-y)*72,y:(x+y)*36})}));
views.push(c.MapProjection.create(map,101,'isometric'),c.MapProjection.create(map,101,'legacy'));
let checks=0;
for(const projection of views)for(const dir of directions)for(const side of ['left','right'])for(const part of ['chest','abdomen'])for(const result of ['hit','parry','armor','miss','dry','distance']){
    R.clear();
    const from={x:dir[0],y:dir[1],kind:'enemy',key:'enemy:0'},to={x:0,y:0,kind:'player',key:'player'};
    const payload={actionId:'parity',mapId:'knee',attacker:from,defender:to,segments:[{moveId:'collar_knee',hitPart:part,limbId:side==='left'?'lfoot':'rfoot',result,damage:12}]};
    R.enqueue(payload);
    const s=R.getActiveActions()[0].segments[0];
    const e={actor:from.key,target:to.key,from,to,move:'collar_knee',side,part,result,at:s.startMs*1.5,hitAt:s.hitMs*1.5,powerFactor:1,segment:0};
    const view={scale:projection.tileWidth/144,heightScale:projection.isIsometric===false?.35:1,project:p=>projection.cellCenter(p.x,p.y),direction:projection.directionVector};
    for(const dt of elapsed){
        const t=e.at+dt,expected=recorder(),actual=recorder(),args={ctx:actual,projection,cellCenter:projection.cellCenter,nowMs:t/1.5};
        approved.presentation.drawStrike(expected,e,t,view,[e]);
        R.render(args);
        assert.deepEqual(normal(actual.draws),normal(expected.draws),`V04 paint changed: ${result}/${side}/${part}/${dir}/${dt}`);
        for(const actor of [from,to])assert.deepEqual(normal(R.getPawnOffsetAt(actor.x,actor.y,actor.kind,args)),normal(approved.presentation.pawnOffset(actor.key,[e],t,view.project,view.scale)),`V04 ${actor.key} motion changed at ${dt}`);
        const offset=R.getPawnOffsetAt(0,0,'player',args);
        assert.equal(playerElement.style.translate,offset.x+'px '+offset.y+'px','real DOM pawn receives the same pull');
        actual.verify();expected.verify();checks++;
    }
    assert.deepEqual(from,payload.attacker);assert.deepEqual(to,payload.defender);
}
// Ordinary replies, same-speed commitments, map replacement and dedup remain on the real scheduler.
R.clear();P.runPipeline('test',attack());P.runPipeline('test',attack());
let actions=R.getActiveActions();assert(actions[1].startMs>actions[0].endMs);
R.clear();const before=events.length,group=c.CombatFxEvents.nextGroupId();
const knee={...attack(),simultaneousDryRun:true,fxGroupId:group};
const reply={...attack(),moveId:'jab',moveTemplate:{hit_segments:1},attacker:knee.defender,defender:knee.attacker,simultaneousDryRun:true,fxGroupId:group};
P.runPipeline('test',knee);P.runPipeline('test',reply);assert.equal(events.length,before);
P.finalizeSimultaneousStrike(knee);P.finalizeSimultaneousStrike(reply);
actions=R.getActiveActions();assert.equal(actions[0].segments[0].hitMs,actions[1].segments[0].hitMs);
R.enqueue(events.at(-1));assert.equal(R.getActiveActions().length,2);
map={width:7,height:7};R.getPawnOffsetAt(0,0,'player',{nowMs:1000,projection:views[0],cellCenter:views[0].cellCenter});
assert.equal(R.getActiveActions().length,0);assert.equal(playerElement.style.translate,'');
// Both entry points must load production code; never ship the frozen test fixture.
const html=read('index.html'),moduleTag='src="js/combat-fx-collar-knee.js"';
assert(html.indexOf(moduleTag)>html.indexOf('src="js/combat-fx-presentation.js"'));
assert(html.indexOf(moduleTag)<html.indexOf('src="js/combat-fx-runtime.js"'));
assert(read('js/combat-fx-collar-knee-prototype.mjs').includes("import './combat-fx-collar-knee.js'"));
console.log(`PASS collar knee: ${checks} frozen V04 frame comparisons, exact particles/alpha/gradients and both pawn offsets; enemy pipeline, one hit, 1.5x playback, DOM pull, full recoil, simultaneous/reply ordering and map cleanup.`);

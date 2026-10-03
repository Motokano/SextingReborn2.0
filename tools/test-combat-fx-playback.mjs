import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let wall=1000;
const c=vm.createContext({console,performance:{now:()=>wall}});c.window=c;
const map={},state={mapId:'playback',x:0,y:0};
c.GameEngine={getMap:()=>map,getState:()=>state};
for(const name of ['combat-fx-paint','combat-fx-presentation','combat-fx-runtime'])
    vm.runInContext(fs.readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8'),c);
const r=c.CombatFxRuntime;
r.startPlaybackClock?.(wall);
r.enqueue({actionId:'delayed',mapId:'playback',attacker:{key:'p',kind:'player',x:0,y:0},defender:{key:'e',kind:'enemy',x:1,y:0},segments:[{moveId:'front_kick',limbId:'rfoot',hitPart:'abdomen',result:'hit',damage:10}]});
let expected=wall,previous=wall;
const action=r.getActiveActions()[0];
// The game can block between combat commit and its first visible animation frame.
// Replay the demo's actual frame rule, including subsequent dropped/background frames.
for(const delay of [700,16,16,280,16,16,16,16,16,16,1000,16]){
    wall+=delay;expected+=Math.min(wall-previous,60);previous=wall;
    const t=r.advancePlaybackClock?r.advancePlaybackClock(wall):wall;
    assert.equal(t,expected,'live playback must advance exactly like the demo, without swallowing ink frames');
    const observed=r.getActiveActions()[0];
    assert.equal(observed.segments[0].hitMs,action.segments[0].hitMs,'frame stalls must not reschedule contact');
}
assert.equal(r.speed,1.5);
console.log('PASS demo playback clock: delayed first frame, dropped frames and tab suspension preserve the same ink timeline.');

// Exercise the real map loop, not only a scheduler with hand-picked timestamps.
let tick,environmentFrame,combatFrame;
const canvases=[];
c.devicePixelRatio=1.25;
c.Image=class {};
c.requestAnimationFrame=fn=>(tick=fn,1);c.cancelAnimationFrame=()=>{};
c.document={querySelector:()=>null,createElement(){
    const canvas={style:{},width:0,height:0};
    const ctx=new Proxy({setTransform(...v){this.matrix=v;},createLinearGradient(){return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:()=>{}});
    canvas.getContext=()=>ctx;canvases.push(canvas);return canvas;
}};
for(const name of ['map-projection','tile-renderer-v2'])
    vm.runInContext(fs.readFileSync(new URL('../js/core/'+name+'.js',import.meta.url),'utf8'),c);
const grid={style:{},appendChild(){}},host={appendChild(){}};
wall=10000;r.clear();Object.assign(map,{width:3,height:3,map_id:'playback'});
const renderer=c.TileRendererV2.create(grid,{combatHost:host,cellPx:101});
renderer.setEffectsRenderer(args=>{environmentFrame=args;});
renderer.setCombatEffectsRenderer(args=>{combatFrame=args;r.render(args);});
const scene={map,st:state,metaAt:()=>({walkable:true})};
renderer.render(scene);renderer.startAnimationLoop();
r.enqueue({actionId:'live-loop',mapId:'playback',attacker:{key:'p',kind:'player',x:0,y:0},defender:{key:'e',kind:'enemy',x:1,y:0},segments:[{moveId:'front_kick',limbId:'rfoot',hitPart:'abdomen',result:'hit',damage:10}]});
wall+=700;
renderer.render(scene);renderer.render(scene);
assert.equal(combatFrame.combatNowMs,10000,'synchronous gameplay renders cannot consume unpresented animation frames');
tick(wall);
assert.equal(combatFrame.combatNowMs,10060,'first presented frame follows the demo clock');
assert.equal(environmentFrame.nowMs,wall,'weather and legacy effects retain their real clock');
assert.equal(r.getActiveActions().length,1,'whole attack remains available after delayed commit');
const foreground=canvases.find(v=>v.id==='map-grid-canvas-combat');
assert.equal(foreground.width,Math.round(parseFloat(foreground.style.width)*1.25));
assert.deepEqual(Array.from(foreground.getContext().matrix),[1.25,0,0,1.25,0,0]);
renderer.setCamera(30,-20);
assert.equal(foreground.style.transform,grid.style.transform);
console.log('PASS real map loop: synchronous updates, independent clocks, demo pixel density and camera alignment.');

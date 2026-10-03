import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// One-pixel Canvas compositing probe at the player's clear-radius center.
// Run the real SceneRenderer composition, including its actual radial erase.
let pixel, style, operation, stack;
const alphaOf=s=>typeof s==='object'?s.stops[0][1]:s==='#ff0000'?1:Number(s.match(/,\s*([\d.]+)\)$/)?.[1]??1);
function fill(){
    const alpha=alphaOf(style);
    if(operation==='destination-out')pixel*=1-alpha;
    else pixel=(style==='#ff0000'?alpha:0)+pixel*(1-alpha);
}
const canvas={save(){stack.push([style,operation]);},restore(){[style,operation]=stack.pop();},
    set fillStyle(v){style=v;},get fillStyle(){return style;},
    set globalCompositeOperation(v){operation=v;},get globalCompositeOperation(){return operation;},
    fillRect:fill,fill,beginPath(){},arc(){},
    createRadialGradient(){return {stops:[],addColorStop(p,color){this.stops.push([p,alphaOf(color)]);}};}};
let minute=720;
const context=vm.createContext({console,document:{getElementById:()=>({})}});context.window=context;
context.GameTime={getState:()=>({minuteOfDay:minute})};
context.SceneAnimation={render({ctx}){ctx.fillStyle='#ff0000';ctx.fillRect(0,0,1,1);}};
vm.runInContext(fs.readFileSync(new URL('../js/scene-renderer.js',import.meta.url),'utf8'),context);
const frame={ctx:canvas,map:{width:7,height:7},state:{x:3,y:3},cellPx:101,cellCenter:()=>({x:350,y:350})};
for(minute of [0,360,720,1080]){
    pixel=0;style='#000000';operation='source-over';stack=[];
    context.SceneRenderer.renderEffects(frame);
    assert(pixel>.99,`minute ${minute}: nearby FX must retain its opacity after lighting; retained ${(pixel*100).toFixed(1)}%`);
    assert.equal(stack.length,0);
    assert.equal(operation,'source-over');
}
console.log('PASS live scene FX composition: nearby effects survive day/night clear-radius erasure.');

// The live foreground surface must preserve the same ink independently of the
// environment layer; otherwise moving above the DOM pawn can reintroduce erasure.
context.CombatFxRuntime={render:context.SceneAnimation.render};
for(minute of [0,720]){
    pixel=0;style='#000000';operation='source-over';stack=[];
    context.SceneRenderer.renderCombatEffects(frame);
    assert(pixel>.99,'foreground combat preserves the approved opacity');
    assert.equal(stack.length,0);
    assert.equal(operation,'source-over','visibility masking must restore compositing mode');
}
console.log('PASS foreground combat composition and Canvas state restoration.');

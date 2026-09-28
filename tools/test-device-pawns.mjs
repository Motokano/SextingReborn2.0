import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { inspectPng } from './inspect-device-png.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const kinds = {stove:'cooking', ranch:'livestock', farm:'agriculture', bed:'bed', barrel:'compost', pharmacy:'pharmacy', warehouse:'warehouse', toolbench:'observation'};
const sizes = {};
for (const key of Object.keys(kinds)) {
    const info = inspectPng(path.join(root, 'assets/map/isometric/interactive-devices-v1', key + '.png'));
    assert.ok(info.transparentFraction > .2 && info.transparentFraction < .9, key + ': real transparency');
    assert.deepEqual(info.cornerAlpha, [0,0,0,0], key + ': no opaque matte');
    assert.ok(info.crop[0] > 0 && info.crop[1] > 0, key + ': no clipped silhouette');
    sizes[key] = info;
}

function harness({fail = false, mode = 'isometric'} = {}) {
    let clock = 0;
    const draws = [], texts = [], transforms = [], translations = [], ellipses = [], requests = [], pending = [];
    const footprintEllipses = [], shadowTransforms = [];
    function context(layer) {
        return new Proxy({
            drawImage: (...args) => draws.push({layer, args}),
            fillText: (...args) => texts.push(args),
            transform: (...args) => {transforms.push(args); if(!layer.id)shadowTransforms.push(args);},
            translate: (...args) => translations.push(args),
            ellipse: (...args) => {ellipses.push(args); if(!layer.id)footprintEllipses.push(args);},
            createLinearGradient: () => ({addColorStop(){}})
        }, {get: (obj, key) => key in obj ? obj[key] : () => {}});
    }
    const sandbox = {console, performance:{now:()=>clock}, URLSearchParams, location:{search:'?view=' + mode}, document:{
        documentElement:{classList:{toggle(){}}},
        createElement: () => {const c = {style:{}}; c.getContext = () => context(c); return c;}
    }, Image:class {
        set src(value) {
            this.url = value; requests.push(value);
            const info = sizes[path.basename(value, '.png')] || {width:100,height:100};
            this.naturalWidth = info.width; this.naturalHeight = info.height;
            pending.push(() => fail ? this.onerror() : this.onload());
        }
    }};
    sandbox.window = sandbox; vm.createContext(sandbox);
    vm.runInContext(read('js/core/map-projection.js'), sandbox);
    vm.runInContext(read('js/core/tile-renderer-v2.js'), sandbox);
    const host = {style:{},appendChild(){},getBoundingClientRect:()=>({left:0,top:0})};
    const renderer = sandbox.TileRendererV2.create(host, {cellPx:144 / Math.SQRT2});
    const render = meta => {
        draws.length = texts.length = transforms.length = translations.length = ellipses.length = 0;
        renderer.render({map:{map_id:'test',width:1,height:1},st:{x:0,y:0},dynamicMetaAt:()=>meta});
    };
    const flush = () => {while(pending.length) pending.shift()();};
    return {render,flush,draws,texts,transforms,translations,ellipses,footprintEllipses,shadowTransforms,requests,renderer,
        advance:ms=>{clock+=ms;}, recover:()=>{fail=false;}};
}
for (const [key, flag] of Object.entries(kinds)) {
    const h = harness(), meta = {[flag+'Station']:true,npc:true,npcId:'npc.station.'+flag+'_base',npcLabel:key};
    h.render(meta);
    assert.equal(h.requests.length,1); assert.ok(h.requests[0].endsWith('/'+key+'.png'), key + ': facility NPC selects device');
    h.flush(); h.render(meta);
    const body = h.draws.find(d => d.layer.id === 'map-grid-canvas-dynamic' && d.args[0].url);
    assert.ok(body, key + ': visible body');
    assert.deepEqual(body.args.slice(1,5),sizes[key].crop,key + ': measured crop');
    assert.ok(body.args[7] <= 72.01 && body.args[8] <= 76,key + ': tile-scale size');
    assert.ok(Math.abs(body.args[6] + body.args[8]) < .1,key + ': bottom anchored without whitespace gap');
    const shadowMatrix=h.shadowTransforms.find(t=>t[0]===1&&t[2]===-.48&&t[3]===-.24);
    assert.ok(shadowMatrix,key + ': silhouette shadow');
    // A coin-shaped base has an area footprint, not a line at its front rim.
    const footprint=h.footprintEllipses.find(e=>e[0]===0);
    assert.ok(footprint && footprint[2]*2>body.args[7]*.8 && footprint[3]>=6,key+': full ground footprint');
    assert.ok(Math.abs(footprint[1]+footprint[3])<.01,key+': footprint front stays under base front');
    assert.ok(h.footprintEllipses.some(e=>e[0]>=4 && e[1]+e[3]>=2),key+': continuous side cast extends right/down');
    assert.ok(Math.abs(shadowMatrix[5]+1.24*footprint[3])<.01,key+': body shadow starts at footprint center');
    const groundDraws=h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic'&&!d.args[0].url);
    assert.equal(groundDraws.length,1,key+': a single merged shadow, no detached second oval');
    const center=h.renderer.getCellCenter(0,0);
    assert.ok(h.translations.some(t=>Math.abs(t[1]-center.y-8)<.01),key + ': ground anchor +8');
    h.render({}); assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0,key + ': hidden body and shadow');
    h.render({...meta,unknownPresence:true}); assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0,key + ': unknown presence does not reveal device');
    h.render(meta); assert.equal(h.requests.length,1,key + ': image cache');
    const broken=harness({fail:true}); broken.render(meta); broken.flush(); broken.render(meta);
    assert.ok(broken.texts.some(t=>t[0]===key.slice(0,6)),key + ': failure label'); assert.equal(broken.requests.length,1);
    const legacy=harness({mode:'legacy'});legacy.render({[flag+'Station']:true});assert.equal(legacy.requests.length,0,key + ': legacy stays text');
}

// Exercise the actual scene metadata closure with different vision states. This
// guards the newly added bed flag in all visibility/occlusion paths.
const sceneCode=read('js/scene-renderer.js').replace(/\r\n/g,'\n');
const start=sceneCode.indexOf('getDynamicMetaAt: function (gx, gy) {')+'getDynamicMetaAt: '.length;
const end=sceneCode.indexOf(',\n            onTileClick:',start);
assert.ok(start>0 && end>start);
let visual=1, identified=1, rear=false;
const env={window:{}, getCtx:()=>({}), st:{x:0,y:0,mapId:'test'},
    E:{isAdjacent:()=>false,isWalkable:()=>false,getPortalAt:()=>null,getEntityAt:()=>null,getInteractNpcIdAt:()=> 'npc.station.bed_base'},
    IE:{},chebyshevDistance:()=>10,getFacingVisionMultiplier:()=>1,isInFieldOfView:()=>false,
    visionProfile:{get visualRadius(){return visual?20:0;},get identifyRadius(){return identified?20:0;},detailRadius:20,adjacentDetailRadius:1},
    occlusionUiCfgForMeta:{enabled:true,stripDynamicOnRearAdjacent:true},facingCfgForVisionMeta:{enabled:true},
    isRearAdjacentTriple:()=>rear,resolvePlayerFacingDir:()=>0};
for(const flag of Object.values(kinds))env.E['is'+flag[0].toUpperCase()+flag.slice(1)+'StationCell']=()=>true;
vm.createContext(env); const metaAt=vm.runInContext('('+sceneCode.slice(start,end)+')',env);
for(const state of [[1,1,false,true],[0,0,false,false],[1,0,false,false],[1,1,true,false]]){
    [visual,identified,rear]=state; const m=metaAt(10,10);
    for(const flag of Object.values(kinds).filter(f=>f!=='observation'))assert.equal(m[flag+'Station'],state[3],flag+': visibility '+state);
    env.E.getInteractNpcIdAt=()=> 'npc.station.observation_base';
    const toolMeta=metaAt(10,10);
    assert.equal(toolMeta.npcId,state[3]?'npc.station.observation_base':null,'toolbench: NPC visibility '+state);
}
console.log('PASS: 8 RGBA sprites, crops/anchors/scale, facility NPC mapping, body/shadow visibility, load/failure cache, legacy fallback, all scene vision gates.');

// Only the existing street thug receives tier-one character art.
{
 const info=inspectPng(path.join(root,'assets/map/isometric/street-thug-v1/standing.png'));
 assert.deepEqual(info.cornerAlpha,[0,0,0,0]);assert.ok(info.transparentFraction>.5);
 sizes.standing=info;
 const h=harness();h.render({enemy:true,enemyId:'enemy.street_thug'});h.flush();
 const body=h.draws.find(d=>d.layer.id==='map-grid-canvas-dynamic'&&d.args[0].url?.includes('street-thug-v1'));
 assert.ok(body,'street thug selects approved standing sprite');
 assert.equal(body.args[7],46,'base matches player width');
 assert.ok(h.footprintEllipses.some(e=>e[2]===23&&e[3]===7),'attached ground footprint');
 h.render({unknownPresence:true,enemyId:'enemy.street_thug'});
 assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0,'unknown thug does not leak art');
 h.render({});assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0,'hidden thug has no shadow');
 const other=harness();other.render({enemy:true,enemyId:'enemy.training_sparring_fast'});other.flush();
 assert.ok(!other.requests.some(u=>u.includes('street-thug-v1')),'other enemies unchanged');
}
console.log('PASS: tier-one street thug selection, scale, transparency, shadow, visibility and other enemy isolation.');

// A temporary server outage must not permanently cache an invisible enemy.
{
 const h=harness({fail:true}), meta={enemy:true,enemyId:'enemy.street_thug'};
 h.render(meta);h.flush();
 for(let i=0;i<20;i++)h.render(meta);
 assert.equal(h.requests.length,1,'failed asset does not retry on every render');
 h.advance(5000);h.render(meta);h.flush();
 assert.equal(h.requests.length,2,'failed asset retries after cooldown');
 h.recover();h.advance(5000);h.render(meta);h.flush();
 assert.ok(h.draws.some(d=>d.layer.id==='map-grid-canvas-dynamic'&&d.args[0].url?.includes('street-thug-v1')),'recovered asset redraws the thug');
 h.advance(5000);h.render(meta);
 assert.equal(h.requests.length,3,'successful image remains cached');
 h.render({});assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0,'recovered art still respects visibility');
}

{
 const info=inspectPng(path.join(root,'assets/npc/npc_supervisor_manager/standing-mailbag-v2.png'));
 assert.deepEqual(info.cornerAlpha,[0,0,0,0]);assert.ok(info.transparentFraction>.5);
 sizes['standing-mailbag-v2']=info;
 const h=harness();h.render({npc:true,npcId:'npc.supervisor.manager',npcLabel:'林经理'});h.flush();
 const body=h.draws.find(d=>d.layer.id==='map-grid-canvas-dynamic'&&d.args[0].url?.includes('standing-mailbag-v2'));
 assert.ok(body,'manager loads approved daily art');assert.equal(body.args[7],46);
 assert.ok(!h.requests.some(u=>u.includes('standing-smoking-v1')||u.includes('lin-battle')),'no old or battle art');
 assert.ok(h.footprintEllipses.some(e=>e[2]===23&&e[3]===7));
 h.render({unknownPresence:true,npcId:'npc.supervisor.manager'});assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0);
 h.render({});assert.equal(h.draws.filter(d=>d.layer.id==='map-grid-canvas-dynamic').length,0);
 const fail=harness({fail:true});fail.render({npc:true,npcId:'npc.supervisor.manager',npcLabel:'林经理'});fail.flush();
 assert.ok(fail.texts.some(t=>t[0]==='林经理'),'failed image retains name');
}
console.log('PASS: manager daily art, scale, transparency, merged shadow, hidden/unknown and load fallback.');

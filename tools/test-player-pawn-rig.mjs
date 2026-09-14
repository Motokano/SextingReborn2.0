import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.argv[2]||new URL('../',import.meta.url);
const path=p=>typeof root==='string'?root+'/'+p:new URL(p,root);
const read=p=>fs.readFileSync(path(p),'utf8');
const parts=['head','chest','abdomen','lhand','rhand','lfoot','rfoot'];
const manifest=JSON.parse(read('assets/map/isometric/player-atlas-v1/manifest.json'));
const requests=[],draws=[];
let fail=false;
const makeElement=()=>{const attrs=new Map(),classes=new Set();return {style:{setProperty(){}},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},getAttribute:k=>attrs.get(k)||null,setAttribute:(k,v)=>attrs.set(k,String(v)),removeAttribute:k=>attrs.delete(k)}};
const sandbox={console,fetch:async()=>({ok:true,json:async()=>manifest}),Image:class {set src(v){requests.push(v);queueMicrotask(()=>fail?this.onerror():this.onload())}},document:{createElement:()=>({getContext:()=>({drawImage:(...a)=>draws.push(a.slice(1))}),toDataURL:()=> 'data:image/png;base64,AA=='})}};
sandbox.window=sandbox;vm.createContext(sandbox);
vm.runInContext(read('js/character-attributes.js'),sandbox);
vm.runInContext(read('js/player-pawn-rig.js'),sandbox);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const ca=sandbox.CharacterAttributes,render=sandbox.PlayerPawnRig;
assert.equal(manifest.states.length,128);
for(let mask=0;mask<128;mask++){
 const state=manifest.states[mask];assert.equal(state.mask,mask);assert.equal(state.file,'L'+String(mask>>3).padStart(2,'0')+'.png');
 const png=fs.readFileSync(path('assets/map/isometric/player-atlas-v1/'+state.file));
 assert.equal(png[25],6,'RGBA PNG');
 assert.ok(state.crop[0]>=0&&state.crop[1]>=0&&state.crop[0]+state.crop[2]<=png.readUInt32BE(16)&&state.crop[1]+state.crop[3]<=png.readUInt32BE(20));
 assert.ok(state.baseWidth>0&&state.anchor[0]>0&&state.anchor[1]<=state.crop[3]);
 ca.setState({part_destroy:Object.fromEntries(parts.map((p,i)=>[p,mask&(1<<i)?ca.getBodyPartDestroyMax(p):ca.getBodyPartDestroyMax(p)-1]))});
 assert.equal(render.readMask(ca),mask);
 const el=makeElement();render.update(el);await flush();assert.equal(el.getAttribute('data-rig-state'),state.id);assert.ok(el.classList.contains('has-atlas-pawn'));
 for(const p of parts)ca.recoverPartDestroy(p,1000);
 assert.equal(render.readMask(ca),0);render.update(el);await flush();assert.equal(el.getAttribute('data-rig-state'),'D000');
}
assert.equal(requests.length,16,'page cache');assert.equal(draws.length,128,'frame cache');
const el=makeElement();render.renderMask(el,127);render.renderMask(el,0);await flush();assert.equal(el.getAttribute('data-rig-state'),'D000','stale result ignored');
assert.throws(()=>render.renderMask(el,128));
// Fresh renderer: failed image load must enable the existing fallback.
vm.runInContext(read('js/player-pawn-rig.js'),sandbox);fail=true;
const broken=makeElement();sandbox.PlayerPawnRig.update(broken);await flush();assert.equal(sandbox.PlayerPawnRig.update(broken),false);assert.ok(!broken.classList.contains('has-atlas-pawn'));
console.log('PASS: 128 real attribute thresholds/recovery, exact atlas mapping/crops, RGBA pages, caches, stale loads and failure fallback.');

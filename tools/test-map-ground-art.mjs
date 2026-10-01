import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {MapProjection} = require('../js/core/map-projection.js');
const code = fs.readFileSync(new URL('../js/core/tile-renderer-v2.js',import.meta.url),'utf8');
for (const mode of ['legacy','isometric']) {
  const calls=[],images=[];
  const contextFor=id=>new Proxy({}, {get(target,key){
    if(key==='createLinearGradient') return ()=>({addColorStop(){}});
    return target[key] ?? ((...args)=>calls.push({id,key,args}));
  },set(t,k,v){t[k]=v;return true}});
  const sandbox={console,Math,Date,MapProjection:{create:(map,px)=>MapProjection.create(map,px,mode)},
    Image:class {constructor(){images.push(this)}},
    document:{createElement(){return {style:{},width:0,height:0,getContext(){return this.ctx ||= contextFor(this.id)}}}},
    requestAnimationFrame(){return 1},cancelAnimationFrame(){}
  };
  vm.runInNewContext(code,sandbox);
  const host={style:{},appendChild(){},getBoundingClientRect(){return {left:0,top:0}}};
  const renderer=sandbox.TileRendererV2.create(host);
  const input={map:{map_id:'ground-art-test',width:3,height:2},st:{x:1,y:1},
    staticMetaAt:(x,y)=>({walkable:x!==0,gathering:x===2}),dynamicMetaAt:()=>({walkable:true}),staticDataKey:'same'};
  renderer.render(input);
  const before=calls.filter(c=>c.id==='map-grid-canvas-static'&&c.key==='fill').length;
  assert.ok(before>0,'fallback colors render before textures load');
  const materials=images.filter(i=>i.src?.startsWith('assets/map/terrain/'));
  assert.equal(materials.length,3);
  for(const image of materials){assert.ok(fs.existsSync(image.src));image.onload()}
  assert.ok(calls.some(c=>c.id==='map-grid-canvas-static'&&c.key==='drawImage'),'loaded texture draws on static layer');
  assert.ok(!calls.some(c=>c.id==='map-grid-canvas-dynamic'&&c.key==='drawImage'),'textures never cover entities on dynamic layer');
  const draws=calls.filter(c=>c.key==='drawImage').length;
  renderer.render(input);
  assert.equal(calls.filter(c=>c.key==='drawImage').length,draws,'unchanged static layer stays cached');
  const center=renderer.getCellCenter(1,1);
  assert.equal(JSON.stringify(renderer.hitTest(center.x,center.y)),JSON.stringify({x:1,y:1}),'art preserves picking');
}
console.log('PASS terrain fallback, asynchronous load, static caching, layer isolation and picking in both views');

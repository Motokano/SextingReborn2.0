import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const id='npc.station.manufacturing_base',map=json('data/maps/M0_Base_Inside_lv_1.json');
const registry=json('data/npc/npc_registry.json').npcs[id],def=json(registry.def),pools=json(registry.dialogue_pools);
assert.deepEqual(map.npcs.filter(n=>n.npc_id===id),[{x:4,y:11,npc_id:id}]);
assert.deepEqual(def.location,{sceneId:map.map_id,x:4,y:11});
assert.equal(map.annotations['4,11'],'制作台');
assert.equal(def.mainMenu.showWorkWhen,'never');
assert.ok(pools.pools[def.fallbackDialoguePoolId].lines[0].includes('没法使用'));
assert.deepEqual(json(registry.triggers).entries,[]);
const blocked=new Set([...map.disabled,...map.blocks,...map.npcs].map(p=>`${p.x},${p.y}`));
const queue=[[8,15]],seen=new Set(['8,15']);
for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
 const x=queue[i][0]+dx,y=queue[i][1]+dy,k=`${x},${y}`;
 if(x>=0&&y>=0&&x<map.width&&y<map.height&&!blocked.has(k)&&!seen.has(k)){seen.add(k);queue.push([x,y]);}
}
assert.ok(seen.has('4,12'),'front access is reachable from the hideout exit');
const asset=json('assets/map/isometric/manufacturing-bench-v1/manifest.json').assets.find(a=>a.id==='unrepaired');
const png=fs.readFileSync('assets/map/isometric/manufacturing-bench-v1/'+asset.file);
const draws=[],translations=[],ellipses=[],pending=[];
function context(canvas){return new Proxy({canvas,drawImage:(...args)=>draws.push({canvas,args}),translate:(...args)=>translations.push(args),ellipse:(...args)=>ellipses.push(args),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{})});}
const g={console,performance:{now:()=>0},URLSearchParams,location:{search:'?view=isometric'},
 document:{documentElement:{classList:{toggle(){}}},createElement:()=>{const c={style:{}};c.getContext=()=>context(c);return c;}},
 Image:class{set src(v){this.url=v;this.naturalWidth=png.readUInt32BE(16);this.naturalHeight=png.readUInt32BE(20);pending.push(()=>this.onload?.());}}};
g.window=g;vm.createContext(g);vm.runInContext(read('js/core/map-projection.js'),g);vm.runInContext(read('js/core/tile-renderer-v2.js'),g);
const renderer=g.TileRendererV2.create({style:{},appendChild(){},getBoundingClientRect:()=>({left:0,top:0})},{cellPx:144/Math.SQRT2});
function render(meta){draws.length=0;renderer.render({map:{map_id:'test',width:1,height:1},st:{x:0,y:0},dynamicMetaAt:()=>meta});while(pending.length)pending.shift()();}
const meta={npc:true,npcId:id,npcLabel:'制作台'};render(meta);render(meta);
const body=draws.find(d=>d.canvas.id==='map-grid-canvas-dynamic'&&d.args[0].url?.endsWith('/unrepaired-v2.png'));
assert.ok(body,'real renderer selects the approved damaged bench');
assert.deepEqual(body.args.slice(1,5),asset.crop);
assert.ok(Math.abs(body.args[7]-asset.crop[2]*asset.scaleAt144)<.001,'uniform size matches the art review');
assert.equal(ellipses.length,0,'a furniture shadow must not add an oval pedestal');
const center=renderer.getCellCenter(0,0);
assert.ok(translations.some(([x,y])=>Math.abs(x-center.x)<.001&&Math.abs(y-center.y)<.001),'native ground center has no old pedestal offset');
const portrait=g.TileRendererV2.getSpeakerPawn(id);assert.ok(portrait.url.endsWith('/unrepaired-v2.png'));
render({...meta,unknownPresence:true});assert.ok(!draws.some(d=>d.canvas.id==='map-grid-canvas-dynamic'));
render({});assert.ok(!draws.some(d=>d.canvas.id==='map-grid-canvas-dynamic'));
console.log('PASS hideout placement, reachable front, registry/inspection text, native size and ground contact, furniture shadow, dialogue image and visibility gates');

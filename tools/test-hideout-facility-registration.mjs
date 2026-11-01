import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const manifest=json('assets/map/isometric/hideout-facilities-v2/manifest.json');
assert.equal(manifest.assets.length,20);
for(const a of manifest.assets){
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(a.file)).digest('hex'),a.sourceSha256,'generated original was not altered');
 assert.deepEqual(a.png.cornerAlpha,[0,0,0,0]);assert.ok(a.png.transparentFraction>.2&&a.png.transparentFraction<.95);
 assert.ok(a.crop[0]>0&&a.crop[1]>0&&a.crop[0]+a.crop[2]<a.png.width&&a.crop[1]+a.crop[3]<a.png.height,'complete silhouette inside canvas');
 assert.ok(a.groundContacts.flat().every(Number.isFinite));
 if(a.state==='damaged'){const b=manifest.assets.find(b=>b.key===a.key&&b.state==='ready');assert.deepEqual(a.groundContacts,b.groundContacts);assert.equal(a.scaleAt144,b.scaleAt144);assert.deepEqual(a.anchor,b.anchor);}
}
const map=json('data/maps/M0_Base_Inside_lv_1.json');
const facilities=[...map.npcs.filter(p=>p.npc_id.startsWith('npc.station.'))];
for(const key of Object.keys(map).filter(k=>/_station_interact_npc_by_cell$/.test(k)))for(const [point,npc_id]of Object.entries(map[key])){const [x,y]=point.split(',').map(Number);facilities.push({x,y,npc_id});}
const blocked=new Set([...map.blocks,...map.disabled,...map.npcs,...facilities].map(p=>p.x+','+p.y));
const seen=new Set(['8,15']),queue=[[8,15]];
for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=queue[i][0]+dx,y=queue[i][1]+dy,k=x+','+y;if(x>=0&&y>=0&&x<map.width&&y<map.height&&!blocked.has(k)&&!seen.has(k)){seen.add(k);queue.push([x,y]);}}
assert.ok(blocked.has('11,14'),'second cot cell blocks passage');
for(const facility of facilities)assert.ok(queue.some(([x,y])=>Math.max(Math.abs(x-facility.x),Math.abs(y-facility.y))===1),facility.npc_id+' remains reachable');
for(const p of map.portals)assert.ok(seen.has(p.x+','+p.y),'exit and test portal stay reachable');
const g={window:null,console};g.window=g;vm.createContext(g);vm.runInContext(read('js/core/base-hideout-art.js'),g);
assert.equal(g.BaseHideoutArt.isStructure(map,11,14),false,'cot extension is not a wall');
assert.equal(g.BaseHideoutArt.materialAt(map,11,14,{}),4,'wood floor continues below cot');
console.log('PASS 20 original PNG hashes, transparency, paired scale/feet, 12 accessible facilities, both exits and two-cell cot floor/collision.');

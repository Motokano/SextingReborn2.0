import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const map=JSON.parse(read('data/maps/M0_Base_Inside_lv_1.json'));
const id='npc.station.sewing_base',npc=map.npcs.filter(n=>n.npc_id===id);
assert.equal(npc.length,1);assert.deepEqual([npc[0].x,npc[0].y],[6,11]);
assert(!map.disabled.some(n=>n.x===6&&n.y===11));assert(!map.blocks.some(n=>n.x===6&&n.y===12),'south approach remains walkable');
const registry=JSON.parse(read('data/npc/npc_registry.json')).npcs[id];
assert.equal(JSON.parse(read(registry.def)).id,id);assert.equal(JSON.parse(read(registry.triggers)).npcId,id);
const copy=v=>JSON.parse(JSON.stringify(v));let flags={},bag={silica_leaf:24},saveOk=true,position={mapId:map.map_id,x:6,y:12},mounted=[];
function node(){return {style:{},setAttribute(){},appendChild(){},focus(){},remove(){mounted=[];}};}
const c={console,document:{activeElement:null,createElement:node,body:{appendChild(n){mounted.push(n)}}},
NPCSystem:{isDemoFlagTrue:k=>flags[k]===true,getFlagValue:k=>flags[k],setDemoFlag:(k,v)=>flags[k]=v,getDemoState:()=>copy(flags),setDemoState:v=>flags=copy(v)},
InventoryEquipment:{countCarriedItemsByTemplateId:id=>bag[id]||0,getState:()=>copy(bag),setState:s=>bag=copy(s),removeCarriedItemsByTemplateId:(id,n)=>{if((bag[id]||0)<n)return {ok:false};bag[id]-=n;return {ok:true}}},
SaveSystem:{saveNow:()=>saveOk}};
c.window=c;vm.createContext(c);vm.runInContext(read('js/game-engine.js'),c);c.GameEngine.setMaps({[map.map_id]:map});c.GameEngine.setState(map.map_id,6,12);
assert.equal(c.GameEngine.getInteractNpcIdAt(6,11),id);
vm.runInContext(read('js/facility-unlock-config.js'),c);vm.runInContext(read('js/sewing-station-panel.js'),c);
const P=c.SewingStationPanel;assert.equal(P.open(),false,'locked station cannot open');flags.sewing_station_unlocked=true;assert.equal(P.open(),true);assert(P.isOpen());
let assembly=null,onAssemblyClose=null,busy=false;
c.SewingSystem={cancel(){},jobState:()=>busy?{}:null};
c.FacilityUnlock={get:()=>({accessible:()=>!flags.sewing_bucket_unlocked})};
c.FacilityUnlockPanel={isOpen:()=>!!assembly,open:(id,cb)=>{assembly=id;onAssemblyClose=cb;}};
busy=true;assert.equal(P.installBucket().ok,false);assert(P.isOpen());busy=false;
assert.equal(P.installBucket().ok,true);assert.equal(assembly,'sewing_bucket');assert(!P.isOpen());
assembly=null;onAssemblyClose();assert(P.isOpen(),'closing bucket assembly returns to sewing');
assert.equal(P.refill(18).ok,false,'bucket has its own unlock');flags.sewing_bucket_unlocked=true;flags.sewing_bucket_stock=32;
assert.equal(P.installBucket().ok,false,'completed bucket cannot be assembled again');
assert.equal(P.refill(19).ok,false);assert.equal(P.refill(1.5).ok,false);assert.equal(P.refill(-1).ok,false);
const before=JSON.stringify({flags,bag});saveOk=false;assert.equal(P.refill(18).ok,false);assert.equal(JSON.stringify({flags,bag}),before,'save failure rolls back inventory and flags');
saveOk=true;assert.equal(P.refill(18).ok,true);assert.equal(flags.sewing_bucket_stock,50);assert.equal(bag.silica_leaf,6);assert.equal(P.refill(1).ok,false);
P.close();assert(!P.isOpen());assert.equal(P.snapshot(),null);assert.equal(P.refill(1).ok,false);
c.GameEngine.setState(map.map_id,10,10);assert.equal(P.open(),false,'remote calls cannot open');
c.GameEngine.setState(map.map_id,6,11);assert.equal(P.open(),false,'same tile is not adjacent');
const chain=['sewing_tape','sewing_scale','sewing_mannequin','sewing','sewing_bucket'];
chain.forEach((key,i)=>{const p=c.FacilityUnlockConfig.projects[key];assert.deepEqual(Array.from(p.position),[6,11]);assert(!p.groups.some(g=>g.id==='parts'));if(i)assert.equal(p.requires,c.FacilityUnlockConfig.projects[chain[i-1]].unlock);});
assert(!read('sewing-station.html').includes('js/sewing-prototype.js'),'live UI never loads demo actions');
assert(read('js/scene-app.js').includes('SewingStationPanel.isOpen()'),'map movement is locked');
assert(read('js/save-system.js').includes('SewingStationPanel.close()'),'load closes stale view');
console.log('PASS: base NPC mapping, unlock chain, adjacency, production UI isolation, bucket bounds, real inventory deductions and save rollback.');

import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {fixture} from './lib/livestock-test-fixture.mjs';
const {ie,ls,mount}=fixture();
for(const species of ['pig','cattle','sheep','chicken']) {
 const payload={species,gender:'female',perks:ls.rollPerks(species)};
 const item={item_id:'live_'+species+'_juvenile',count:1,hunting_juvenile:payload};
 const placed=ie.putItemIntoDefaultContainer(item);
 assert.equal(placed.placed,true);
 const saved=JSON.parse(JSON.stringify(ie.getState()));ie.setState(saved);
 const take=ie.takeItemFromContainer(placed.container,placed.index);
 assert.equal(take.success,true);
 assert.deepEqual(JSON.parse(JSON.stringify(take.item.hunting_juvenile)),JSON.parse(JSON.stringify(payload)));
 const loc=species==='chicken'?'arm1':'z1';
 if(species==='chicken') {
  assert.equal(ls.canAdmitAnimal(species,loc).reason,'no_coop');
  mount('arm1','inner','coop');
 }
 const result=ls.admitAnimal(species,loc,payload);assert.equal(result.ok,true);
 const a=ls.getState().animals.find(a=>a.uid===result.uid);
 assert.equal(a.gender,payload.gender);
 assert.deepEqual(JSON.parse(JSON.stringify(a.perks)),JSON.parse(JSON.stringify(payload.perks)));
 assert.equal(a.age_ticks,0);
}
let remaining=100;
while(ls.canAdmitAnimal('chicken','arm1').ok&&remaining-->0)ls.admitAnimal('chicken','arm1');
assert(remaining>0);assert.equal(ls.canAdmitAnimal('chicken','arm1').reason,'coop_full');
const before=ls.getState().animals.length;assert.equal(ls.admitAnimal('chicken','arm1').ok,false);assert.equal(ls.getState().animals.length,before);
// A full carried inventory can preserve a captured juvenile on the ground through save/restore.
let slots=100;
while(ie.putItemIntoDefaultContainer({item_id:'live_pig_juvenile',count:1}).placed&&slots-->0){}
assert(slots>0);
const overflow={item_id:'live_sheep_juvenile',count:1,hunting_juvenile:{species:'sheep',gender:'male',perks:[]}};
assert.equal(ie.putItemIntoDefaultContainer(overflow).placed,false);
ie.addItemToGround('M0_Field_01',4,5,overflow);
ie.setState(JSON.parse(JSON.stringify(ie.getState())));
assert.deepEqual(JSON.parse(JSON.stringify(ie.getGroundItemsAt('M0_Field_01',4,5).at(-1).hunting_juvenile)),overflow.hunting_juvenile);
console.log('PASS: juvenile inventory save/restore, four species admission, traits and chicken capacity.');

// Exercise the production hunting reward adapter with real one-unit pockets and overflow.
{
 const f=fixture();let host;
 f.ctx.Hunting={configure:(_config,h)=>{host=h;}};
 f.ctx.GameEngine={getState:()=>({mapId:'field',x:1,y:1})};
 f.ctx.GameLog={log:()=>{}};
 vm.runInContext(fs.readFileSync('js/hunting-panel.js','utf8'),f.ctx);
 f.ctx.HuntingPanel.configure(JSON.parse(fs.readFileSync('data/hunting.json','utf8')));
 host.addProficiency(3);host.addProficiency(1);
 assert.equal(f.ie.getState().skills.life_hunting.move_usage.hunting_action,4);
 assert.equal(host.level(),1);
 const progress=JSON.parse(JSON.stringify(f.ie.getState()));f.ie.setState(progress);
 assert.equal(f.ie.getState().skills.life_hunting.move_usage.hunting_action,4,'hunting practice persists in existing life skill');
 host.grant({item_id:'hunt_meat_rabbit',count:8});
 const carried=[...f.ie.getPocketArray(),...f.ie.getVestArray(),...f.ie.getBackpackArray()];
 const ground=f.ie.getGroundItemsAt('field',1,1);
 const total=[...carried,...ground].filter(i=>i?.item_id==='hunt_meat_rabbit').reduce((n,i)=>n+(i.count||1),0);
 assert.equal(total,8,'all portions survive single-slot placement and overflow');
 assert(ground.length>0,'test includes overflow');
 console.log('PASS: multi-portion hunting grant preserves every item across inventory and ground.');
}

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBladeForge} from './blade-forging/core.mjs';
import {createWorkshop} from './forging-workshop/core.mjs';

const f=createBladeForge({mask:['###','###','###'],initial:[3,5,3,5,3,5,3,5,3],scoreIndices:[4]});
for(const kind of ['light','heavy','cross'])for(const type of Object.keys(f.effects)){
 const s=f.create([{index:4,type}],37),original=JSON.stringify(s),a={kind,index:4};
 const next=f.apply(s,a),plain=f.apply(f.create([],37),a);
 assert.deepEqual(next.values,plain.values,'pickup never powers this hammer');
 assert.equal(next.stored[type],1);assert.equal(next.specials.length,0);
 assert.equal(JSON.stringify(s),original,'preview cannot mutate source inventory');
 assert.deepEqual(f.apply(s,a),next,'preview and actual replay are identical');
 assert.equal(f.apply(s,{...a,effect:type}),null,'cannot spend the charge being collected');
 const heated=f.apply(next,{kind:'quench'});
 assert.equal(heated.stored[type],1,'heat preserves stored effects');
 if(kind!=='cross')assert.equal(f.apply(heated,a).stored[type],1,'tile cannot be collected twice');
 assert.equal(f.create([{index:4,type}],37).stored[type],0,'new furnace starts empty');
}
const s=f.create([{index:4,type:'keep'}]);
assert.equal(f.apply(s,{kind:'quench'}).specials.length,1,'heat does not collect');
assert.equal(f.apply(s,{kind:'heavy',index:1}).specials.length,1,'transmission does not collect');
const zero=f.clone(s);zero.values[4]=0;assert.equal(f.apply(zero,{kind:'light',index:4}),null);
const held=f.create();held.stored={keep:1,burst:1,gather:1};
const bank=JSON.stringify(held);
for(const action of [{kind:'light',index:4,effect:'keep'},{kind:'light',index:4,effect:'burst'},{kind:'quench',effect:'keep'},{kind:'finish',effect:'gather'},{kind:'heavy',index:99,effect:'burst'},{kind:'heavy',index:4,effect:['keep','burst']},{kind:'heavy',index:4,effect:'unknown'}])assert.equal(f.apply(held,action),null);
assert.equal(JSON.stringify(held),bank,'invalid actions do not spend charges');
assert.deepEqual(f.apply(held,{kind:'heavy',index:4}).stored,held.stored,'unused charges remain stored');
assert.deepEqual(f.apply(held,{kind:'temper'}).stored,held.stored,'temper does not spend');
const keep=f.apply(held,{kind:'heavy',index:4,effect:'keep'});
assert.equal(keep.values[4],3,'keep works below the old six-point threshold');
assert.deepEqual(keep.stored,{keep:0,burst:1,gather:1});
const burst=f.apply(held,{kind:'heavy',index:4,effect:'burst'});
assert.equal(burst.values[1],11);assert.equal(burst.values[4],0);assert.equal(burst.stored.burst,0);
const gather=f.apply(held,{kind:'light',index:4,effect:'gather'});
assert.equal(gather.values[4],9,'light halves 3 to 1, then pulls floor(5/2) from each neighbor');
for(const j of f.neighbors[4])assert.equal(gather.values[j],3);
assert.equal(f.total(gather),f.total(f.apply(held,{kind:'light',index:4})),'gather conserves the post-hammer total');
const withFlake=f.clone(held);withFlake.opportunity={index:4,type:'flake'};
const flaked=f.apply(withFlake,{kind:'light',index:4,effect:'gather'});
assert.equal(flaked.values[4],9);assert.equal(flaked.values[1],2,'temporary flake resolves after gather');
const locked=f.clone(held);locked.locked[1]=true;
assert.equal(f.apply(locked,{kind:'light',index:4,effect:'gather'}).values[1],3,'locked cells still move values');
const cloned=f.clone(held);cloned.stored.keep=0;assert.equal(held.stored.keep,1);

// Verify the full workshop history, including inventory and random opportunity state.
const data=JSON.parse(await readFile(new URL('./forging-workshop/catalog.json',import.meta.url),'utf8'));
const shop=createWorkshop(data,createBladeForge);shop.fillIron();assert.equal(shop.start(37).ok,true);
const forge=shop.forge(),pickup=shop.state.session.board.specials[0],initial=forge.clone(shop.state.session.board);
assert.equal(shop.strike({kind:'light',index:pickup.index}).ok,true);
const collected=forge.clone(shop.state.session.board);assert.equal(collected.stored[pickup.type],1);
const index=collected.values.findIndex((v,i)=>v>0&&!collected.locked[i]);
assert.equal(shop.strike({kind:forge.effects[pickup.type].modes[0],index,effect:pickup.type}).ok,true);
assert.equal(shop.state.session.board.stored[pickup.type],0);
assert.equal(shop.undo().ok,true);assert.deepEqual(shop.state.session.board,collected);
assert.equal(shop.undo().ok,true);assert.deepEqual(shop.state.session.board,initial);
console.log('Absorption checks passed: collection, storage, optional use, ordering, invalid actions, heat, cross locks, preview and workshop undo.');

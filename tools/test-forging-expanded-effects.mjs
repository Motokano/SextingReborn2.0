import assert from 'node:assert/strict';
import {createBladeForge} from './blade-forging/core.mjs';
const f=createBladeForge({mask:['###','###','###'],initial:[3,5,3,5,3,5,3,5,3],scoreIndices:[4]});
const held=()=>{const s=f.create();for(const key of Object.keys(s.stored))s.stored[key]=1;return s;};
assert.equal(Object.keys(f.effects).length,7);
assert.deepEqual(Object.keys(f.opportunityEffects).sort(),['flake','warmth']);
const spread=f.apply(held(),{kind:'heavy',index:4,effect:'spread'});
assert.deepEqual(spread.values,[6,8,6,8,0,8,6,8,6]);
assert.equal(spread.stored.spread,0);assert.equal(spread.left.h,f.budget.h-1);
const corner=f.apply(held(),{kind:'heavy',index:0,effect:'spread'});
assert.deepEqual(corner.values,[0,8,3,8,6,5,3,5,3],'edge expansion only reaches real nearby cells');
const holes=createBladeForge({mask:['#.#','###','#.#'],initial:[2,1,1,1,1,1,1],scoreIndices:[0]});
const holeStart=holes.create();holeStart.stored.spread=1;
assert.deepEqual(holes.apply(holeStart,{kind:'heavy',index:0,effect:'spread'}).values,[0,1,3,3,1,1,1],'expansion cannot jump over gaps');

const erased=f.apply(held(),{kind:'light',index:4,effect:'erase'});
assert.equal(erased.values[4],0);assert.equal(erased.left.light,2);
const hot=held();hot.opportunity={index:4,type:'warmth'};
assert.equal(f.apply(hot,{kind:'light',index:4,effect:'erase'}).values[4],2,'warmth happens after clearing');

const leveled=f.apply(held(),{kind:'light',index:4,effect:'level'});
assert.deepEqual(leveled.values,[3,5,3,4,4,4,3,4,3],'local remainder goes to highest post-hammer value, then row order');
assert.equal(f.total(leveled),f.total(f.apply(held(),{kind:'light',index:4})));
const edgeLevel=f.apply(held(),{kind:'light',index:0,effect:'level'});
assert.deepEqual(edgeLevel.values,[3,4,3,4,3,5,3,5,3]);
const locked=held();locked.locked[1]=true;
assert.equal(f.apply(locked,{kind:'light',index:4,effect:'level'}).locked[1],true);
const flake=held();flake.opportunity={index:4,type:'flake'};
assert.deepEqual(f.apply(flake,{kind:'light',index:4,effect:'level'}).values,[3,4,3,3,4,3,3,3,3]);

for(const kind of ['light','heavy','cross']){
 const s=held(),snapshot=f.clone(s),a={kind,index:4,effect:'rebound'};
 const n=f.apply(s,a);assert.equal(n.left.h,f.budget.h,'rebound refunds total hammer count');
 assert.equal(n.stored.rebound,0);assert.equal(n.left.light,kind==='light'?2:3);assert.equal(n.left.cross,kind==='cross'?0:1);
 assert.equal(n.locked[4],kind==='cross');assert.deepEqual(s,snapshot);assert.deepEqual(f.apply(s,a),n);
 assert.equal(f.apply(n,{kind:'heavy',index:0,effect:'rebound'}),null,'cannot repeat a spent rebound');
}
const last=held();last.left.h=1;
const refunded=f.apply(last,{kind:'heavy',index:4,effect:'rebound'});
assert.equal(refunded.left.h,1);assert.ok(refunded.opportunity,'last paid hammer can still continue after refund');
const exhausted=held();exhausted.left.h=0;
assert.equal(f.apply(exhausted,{kind:'heavy',index:4,effect:'rebound'}),null);
for(const [effect,kind] of [['spread','light'],['spread','cross'],['erase','heavy'],['erase','cross']])assert.equal(f.apply(held(),{kind,index:4,effect}),null);
for(const effect of ['spread','erase','level','rebound']){
 const s=held();s.values[4]=0;const before=JSON.stringify(s);
 assert.equal(f.apply(s,{kind:f.effects[effect].modes[0],index:4,effect}),null);assert.equal(JSON.stringify(s),before);
}

const seen=new Set(),opportunities=new Set();
for(let seed=0;seed<256;seed++){
 let rng=seed;const special=f.randomSpecials(()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;});
 assert.equal(special.length,2);assert.equal(new Set(special.map(x=>x.index)).size,2);assert.equal(new Set(special.map(x=>x.type)).size,2);
 for(const x of special)seen.add(x.type);
 const n=f.apply(f.create(special,seed),{kind:'heavy',index:4});
 opportunities.add(n.opportunity.type);assert.ok(['warmth','flake'].includes(n.opportunity.type));assert.equal('target' in n.opportunity,false);
}
assert.equal(seen.size,7);assert.equal(opportunities.size,2);
console.log('Expanded effects passed: seven-effect pool, two pickups, spread geometry, clearing, local averaging, rebound limits, ordering, preview, and no swaps.');

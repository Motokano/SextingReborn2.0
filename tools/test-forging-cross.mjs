import assert from 'node:assert/strict';
import {createBladeForge} from './blade-forging/core.mjs';

const initial=Array(25).fill(1);initial[12]=5;
const forge=createBladeForge({mask:Array(5).fill('#####'),initial});
const action={kind:'cross',index:12},near=[7,11,13,17],far=[2,10,14,22];
const start=forge.create([],37),snapshot=forge.clone(start),next=forge.apply(start,action);
for(const j of near)assert.equal(next.values[j],6,'adjacent receives 5');
for(const j of far)assert.equal(next.values[j],3,'distant receives floor(5/2)');
assert.equal(next.values[0],1,'diagonal is untouched');
assert.equal(next.values[12],0);assert.equal(next.locked[12],true);
assert.equal(next.left.cross,0);assert.equal(next.left.h,forge.budget.h-1);
assert.deepEqual(start,snapshot,'preview does not mutate the input');
assert.deepEqual(forge.apply(start,action),next,'preview/replay have identical RNG and values');
assert.equal(forge.apply(next,{kind:'heavy',index:12}),null,'cross source stays locked');

const burst=forge.create([{index:12,type:'burst'},{index:2,type:'gather'}]);
burst.stored.burst=1;
const doubled=forge.apply(burst,{...action,effect:'burst'});
assert.equal(doubled.values[7],11,'burst doubles adjacent transmission');
assert.equal(doubled.values[22],6,'burst happens before distance rounding');
assert.equal(doubled.values[2],6,'uncollected gather has no passive bonus');
assert.equal(doubled.stored.burst,1,'spend one old charge, then collect the new charge');

const small=forge.create([{index:2,type:'gather'}]);small.values[12]=1;
assert.equal(forge.apply(small,action).values[2],1,'zero transmission does not trigger gather');
const kept=forge.create([{index:12,type:'keep'}]);kept.values[12]=7;
kept.stored.keep=1;
const protectedHit=forge.apply(kept,{...action,effect:'keep'});
assert.equal(protectedHit.values[12],7);assert.equal(protectedHit.values[2],4);
assert.equal(protectedHit.locked[12],true,'keep does not bypass the cross lock');

const receiver=forge.create();receiver.locked[2]=true;
const received=forge.apply(receiver,action);
assert.equal(received.values[2],3,'locked cells still receive');
assert.equal(forge.apply(received,{kind:'quench'}).values[2],4);
assert.equal(forge.total(forge.apply(received,{kind:'temper'})),forge.total(received));
const gap=createBladeForge({mask:['#.#'],initial:[5,1],scoreIndices:[1]});
assert.equal(gap.apply(gap.create(),{kind:'cross',index:0}).values[1],3,'holes do not make remote cells adjacent');
const heavy=forge.apply(start,{kind:'heavy',index:12});
for(const j of near)assert.equal(heavy.values[j],6);
for(const j of far)assert.equal(heavy.values[j],1);
assert.equal(heavy.left.cross,1,'ordinary hammer rules are unchanged');
console.log('Cross hammer checks passed: distance, rounding, chosen effects, locks, heat, preview and replay.');

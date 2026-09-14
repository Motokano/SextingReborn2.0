import assert from 'node:assert/strict';
import {fixture} from './lib/livestock-test-fixture.mjs';
const f=fixture();
f.mount('arm1','inner','coop');
const trough=f.mount('arm1','cw_side','feed_trough',5);
for(let i=0;i<5;i++)f.animal('chicken','arm1',{satiety:100,age_ticks:150*144});
function tick(){trough.feed_units=450;f.tick();let count=0;for(const a of f.st.animals){const r=f.ls.collectProduct(a.uid,'egg');if(r.ok)count+=r.count;}return count;}
for(let i=0;i<200;i++)tick(); // Establish sustained nutrition before measuring steady production.
const buffered=()=>f.st.animals.reduce((n,a)=>n+(a.production_buffers.egg||0),0);
const before=buffered();let collected=0;
for(let i=0;i<720;i++)collected+=tick(); // Five game days.
assert.equal(collected,10);
assert(Math.abs(buffered()-before)<1e-8);
assert(f.st.animals.every(a=>a.hp===100&&!a.dead));
console.log('PASS five healthy fed hens produce ten portions in five days, without collection upgrades');

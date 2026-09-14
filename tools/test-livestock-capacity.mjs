import assert from 'node:assert/strict';
import {fixture,species} from './lib/livestock-test-fixture.mjs';
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function supplied(f,n=1){for(let i=0;i<n;i++){for(const arm of Object.values(f.ls.getState().arms))for(const m of Object.values(arm))if(m&&!m.shadow&&m.module_id==='feed_trough')m.feed_units=450;f.tick();}}
function pigs(count,weight=120){const f=fixture();for(const arm of ['arm1','arm2','arm3','arm4']){f.mount(arm,'cw_side','feed_trough',5);f.mount(arm,'ccw_side','feed_trough',5);}for(let i=0;i<count;i++)f.animal('pig','z1',{weight_kg:weight,satiety:100});return f;}
test('soft capacity counts juveniles, forecasts litters and admits animals beyond capacity',()=>{
 const f=pigs(10,.9);assert.equal(f.ls.getCapacityStatus().used,30);assert(f.ls.admitAnimal('pig','z1',{perks:[]}).ok);assert.equal(f.ls.getCapacityStatus().used,33);
 f.st.animals[0].pregnant={remaining_ticks:100,children:[{species_id:'pig',gender:'female',perks:[]}]};assert.equal(f.ls.getCapacityStatus().projected,36);
 f.st.animals[1].dead=true;assert.equal(f.ls.getCapacityStatus().used,30);
 f.mount('arm1','inner','coop');assert(f.ls.admitAnimal('chicken','arm1').ok);assert.equal(f.ls.getCapacityStatus().used,30);
});
test('adding same-size pigs beyond capacity lowers actual total growth despite abundant feed',()=>{
 const totals=[10,11,13,15,20].map(count=>{const f=pigs(count,30);supplied(f);return f.st.animals.reduce((n,a)=>n+a.nutrition_state.last.weight_gain_kg,0);});
 for(let i=1;i<totals.length;i++)assert(totals[i]<totals[i-1]);
});
test('severe crowding has a grace period, resists clinics and survives reload; relief allows paid recovery',()=>{
 const f=pigs(15);for(const arm of ['arm1','arm3']){for(const slot of ['cw_side','ccw_side'])assert(f.ls.dismountModule(arm,slot).ok);f.mount(arm,'inner','clinic_arm',5);}
 supplied(f,1000);assert(f.st.animals.every(a=>a.hp===100));supplied(f,1000);assert(f.st.animals.every(a=>a.hp<97));
 f.ls.setState(JSON.parse(JSON.stringify(f.st)));let st=f.ls.getState();assert.equal(st.crowding_exposure_ticks,2000);
 const before=st.animals[0].hp;supplied(f,1000);assert(st.animals[0].hp<before-7.9);
 st.animals.splice(10);const injury=st.animals[0].nutrition_state.crowding_damage;supplied(f,1000);
 assert(st.animals[0].nutrition_state.crowding_damage<injury-3.9);assert(st.animals[0].nutrition_state.last.recovery_spent>0);
});
test('crowding deaths remain pollution sources and exposure cannot be cleared by a brief border crossing',()=>{
 const f=pigs(20);f.st.crowding_exposure_ticks=2000;for(const a of f.st.animals)a.hp=.001;supplied(f);assert(f.st.animals.every(a=>a.dead&&a.death_cause==='crowding'));assert(f.st.zones.z1.pollution>0);
 const g=pigs(15);g.st.crowding_exposure_ticks=1500;g.st.animals.splice(12);supplied(g);assert.equal(g.st.crowding_exposure_ticks,1500);
});
test('production age is independent of sexual maturity; meat-age chickens cannot lay eggs',()=>{
 const f=fixture();f.mount('arm1','inner','coop');f.mount('arm1','cw_side','feed_trough',5);
 const chicken=f.animal('chicken','arm1',{age_ticks:90*144,weight_kg:2.5});supplied(f,500);assert.equal(chicken.production_buffers.egg||0,0);assert.equal(f.ls.getProductStatus(chicken.uid,'egg').reason,'immature');
 const cow=f.animal('cattle','z1',{age_ticks:450*144,weight_kg:300,gender:'female'});const milk=species.cattle.products.living.find(p=>p.product_id==='milk');assert(f.ls.productEligible(cow,species.cattle,milk));assert(cow.age_ticks<species.cattle.growth.maturity_ticks);
});
test('actual full gestation retains planned children, pays nutrition and does not instantly rebreed',()=>{
 const f=pigs(2);f.st.animals[1].gender='female';f.ctx.Math.random=()=>0;supplied(f);const mother=f.st.animals[1];assert(mother.pregnant);const expected=mother.pregnant.children.length;
 supplied(f,species.pig.reproduction.pregnancy_ticks);assert.equal(f.st.animals.length,2+expected);assert(!mother.pregnant);assert(mother.reproduction_cooldown>0);
});
test('hens live through production age and die at the configured lifespan',()=>{
 const f=fixture();f.mount('arm1','inner','coop');f.mount('arm1','cw_side','feed_trough',5);
 const a=f.animal('chicken','arm1',{age_ticks:species.chicken.lifespan_ticks-1,weight_kg:2.5,satiety:100});supplied(f);assert(a.dead&&a.death_cause==='old');
});
test('slow-growth animals reach exact full weight instead of approaching a missing meat portion forever',()=>{
 const f=fixture();f.mount('arm1','inner','coop');f.mount('arm1','cw_side','feed_trough',5);
 const a=f.animal('chicken','arm1',{weight_kg:2.4999999,perks:['slow_growth_chicken'],satiety:100});supplied(f);
 assert.equal(a.weight_kg,2.5);assert(f.ls.previewSlaughter(a.uid).items.some(x=>x.item_id==='hus_chicken_meat'&&x.count===1));
});
console.log(passed+' capacity/lifecycle tests passed');

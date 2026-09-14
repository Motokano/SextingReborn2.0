import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../js/food-metabolism.js');
const catalog = require('../data/food-balance.json');
const items = require('../data/items.json');
const config = require('../data/survival-config.json');
const cfg = {...config.food_model, exp_mult:config.nutrition_tier_exp_mult};
const food = id => catalog.foods[id];
const menu = ['food_flatbread_plain','food_stew_meat_simple','food_dish_salted_cucumber'];
const freshBody = () => ({satiety:60,nutrition:40,weight_kg:69.7,height_cm:178});
function step(s,b,stamina=1) { s.pendingStamina += stamina; const r=M.tick(s,b,cfg); Object.assign(b,{satiety:r.satiety,nutrition:r.nutrition,weight_kg:r.weight_kg}); return r; }
function trip(s,b,repeats=1,ticks=150,maintenance=false) {
 for(let t=0;t<ticks;t++) { if(t===0||t===75) for(let n=0;n<repeats;n++) for(const id of menu) M.eat(s,id,food(id)); if(maintenance && t===110) M.eat(s,'wild_fruit_purple',food('wild_fruit_purple')); step(s,b); }
 return {...b};
}
const results = {};
{
 const s=M.fresh(), b=freshBody(); results.overeat=[];
 for(let n=0;n<6;n++) results.overeat.push(trip(s,b,3));
 results.recovery=[];
 for(let n=0;n<12;n++) results.recovery.push(trip(s,b));
}
{
 const s=M.fresh(),b=freshBody(); results.normal=[];
 for(let n=0;n<20;n++) results.normal.push(trip(s,b,1,150,true));
}
console.log('Overeat weights:',results.overeat.map(x=>x.weight_kg));
console.log('Recovery weights:',results.recovery.map(x=>x.weight_kg));
console.log('Maintenance:',results.normal.at(-1));
const bmi = b => Math.round(b.weight_kg / (b.height_cm/100)**2*10)/10;
const crossing = results.overeat.findIndex(b=>bmi(b)>=25)+1;
assert.ok(crossing>=5 && crossing<=6,'overweight after 5–6 overeat trips');
const recovered = results.recovery.findIndex(b=>b.weight_kg<=69.8)+1;
assert.ok(recovered>=10 && recovered<=12,'recovery after 10–12 lighter balanced trips');
assert.ok(results.recovery.every(b=>b.satiety>=30),'recovery does not require severe hunger');
assert.ok(results.normal.every(b=>b.satiety>=30 && Math.abs(b.weight_kg-69.7)<=.2),'maintenance does not starve or gain weight');
assert.ok(results.normal.at(-1).nutrition>=99,'ordinary balanced meals can reach highest nutrition');
// Coverage and source contracts.
assert.equal(Object.keys(catalog.foods).length,35);
assert.equal(Object.keys(catalog.exclusions).length,40);
for(const [id,f] of Object.entries(catalog.foods)) {
 assert.deepEqual(items[id].food_profile,f);
 assert.equal(items[id].food_buff_duration_ticks,f.digestion_ticks);
 assert.ok(f.composition.every(x=>x>=0));
 assert.ok(Math.abs(f.composition.reduce((a,b)=>a+b,0)-1)<1e-8);
 assert.ok(f.satiety_total>=0 && f.digestion_ticks>0);
}
for(const id of Object.keys(catalog.exclusions)) assert.equal(items[id].edible,false);
// Duplicate portions keep their own duration and pay no experience at ingestion.
{
 const s=M.fresh(), b=freshBody(); M.eat(s,menu[1],food(menu[1]));
 for(let t=0;t<10;t++) step(s,b,0);
 M.eat(s,menu[1],food(menu[1])); assert.deepEqual(s.portions.map(p=>p.remaining),[35,45]);
 const r=step(s,b,0); assert.ok(Math.abs(r.intake-60/45)<1e-9);
}
// Save/reload is deterministic, including fractions, individual timers, and experience.
{
 const s=M.fresh(),b=freshBody(); for(const id of menu) M.eat(s,id,food(id));
 for(let t=0;t<13;t++) step(s,b);
 const saved=M.restore(s), other={...b};
 for(let t=0;t<100;t++) assert.deepEqual(step(s,b),step(saved,other));
 assert.deepEqual(s,saved);
}
// Tiny vegetable garnish cannot balance ten meat portions; household ratios can.
assert.equal(M.balance([1,1,1,0],cfg).level,'balanced');
assert.notEqual(M.balance([1,10,.1,0],cfg).level,'balanced');
// Overflow becomes surplus, even at the visible cap.
{
 const s=M.fresh(),b={...freshBody(),satiety:150};
 for(let n=0;n<20;n++) M.eat(s,menu[1],food(menu[1]));
 assert.ok(step(s,b).surplus>10);
 assert.ok(s.weightRemainder!==0 || b.weight_kg>69.7);
}
// Exercise real Survival + ItemUse entry points, not a second implementation of formulas.
{
 const ctx=vm.createContext({console});
 for(const file of ['food-metabolism','survival','item-use']) vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),ctx);
 let exp=0; const active=new Map();
 ctx.CharacterAttributes={grantAttributeExp:(_owner,grants)=>{ exp+=grants.reduce((sum,g)=>sum+g.exp,0); return {applied:grants}; }};
 ctx.BuffSystem={applyBuff:(_owner,id)=>{active.set(id,1);return true;},hasBuffByBuffId:()=>false,removeBuffByBuffId:()=>{}};
 ctx.Survival.setConfig(config);
 ctx.Survival.setState({...freshBody(),thirst:50,food_metabolism:null});
 assert.equal(ctx.ItemUse.applyItemUseEffectFromTemplate(menu[1],items[menu[1]]),true);
 assert.equal(ctx.ItemUse.applyItemUseEffectFromTemplate(menu[1],items[menu[1]]),true);
 assert.equal(exp,0);
 assert.equal(ctx.Survival.getState().food_metabolism.portions.length,2);
 for(let n=0;n<45;n++)ctx.Survival.advanceTick();
 assert.equal(exp,2*food(menu[1]).attribute_exp.jingu*1.5);
 assert.equal(ctx.Survival.getState().food_metabolism.portions.length,0);
 assert.equal(active.get(items[menu[1]].edible_buff_id),1);
}
// Exact experience budgets: fractional per-tick grants must not turn 2 XP into 15 XP.
for(const [id,f] of Object.entries(catalog.foods)) {
 const s=M.fresh(),b={...freshBody(),nutrition:50},totals={};
 M.eat(s,id,f);
 for(let t=0;t<f.digestion_ticks;t++) {
  b.nutrition=50;
  for(const g of step(s,b,0).grants) totals[g.attr_id]=(totals[g.attr_id]||0)+g.exp;
 }
 for(const [dim,n] of Object.entries(f.attribute_exp)) assert.ok(Math.abs((totals[dim]||0)+(s.expRemainders[dim]||0)-n*1.5)<1e-7,id+' XP budget');
}
// Legacy migration preserves unfinished food but never re-awards the old immediate experience.
{
 const id=menu[1], f=food(id);
 const s=M.migrateLegacy({instancesByOwner:{player:[{source_id:'item:'+id,buff_id:f.edible_buff_id,started_tick:0,expires_at_tick:45}]}},id=>items[id],15);
 assert.equal(s.portions.length,1); assert.equal(s.portions[0].remaining,30);
 const b=freshBody(); let total=0;
 for(let t=0;t<30;t++) { const r=step(s,b,0); total+=r.intake; assert.equal(r.grants.length,0); }
 assert.ok(Math.abs(total-20)<1e-8);
}
// Real buff templates: repeat refresh, fractional specials, and no legacy saturation/nutrition.
{
 const ctx=vm.createContext({console,fetch:async p=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'))}),GameTime:{tick:0,getState(){return {totalTicks:this.tick,year:1,dayOfYear:1,hour:8,minute:0,timePeriod:'morning'};},advanceTicks(n){this.tick+=n;}}});
 for(const file of ['food-metabolism','survival','character-attributes','buff-system','item-use']) vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),ctx);
 ctx.Survival.setConfig(config); ctx.CharacterAttributes.setConfig(config);ctx.BuffSystem.init();
 for(let n=0;n<20&&!ctx.BuffSystem.getState().loaded;n++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(ctx.BuffSystem.getState().loaded,true);
 ctx.Survival.setState({...freshBody(),dirtyness:50,energy:0,food_metabolism:null});
 const id='food_herb_tea_bitter';
 ctx.ItemUse.applyItemUseEffectFromTemplate(id,items[id]);
 for(let t=0;t<5;t++)ctx.Survival.advanceTick();
 ctx.ItemUse.applyItemUseEffectFromTemplate(id,items[id]);
 assert.equal(ctx.Survival.getState().food_metabolism.portions.length,2);
 const instances=ctx.BuffSystem.getState().instancesByOwner.player.filter(x=>x.buff_id===items[id].edible_buff_id);
 assert.equal(instances.length,1); assert.equal(instances[0].stacks,1);
 assert.equal(instances[0].expires_at_tick,20);
 for(let t=0;t<15;t++)ctx.Survival.advanceTick();
 assert.equal(ctx.Survival.getState().food_metabolism.portions.length,0);
 assert.ok(Math.abs(ctx.Survival.getState().energy-6)<.11,'20 active ticks of 0.3 energy, no duplicate strength');
 assert.ok(ctx.Survival.getState().nutrition<41,'tea cannot pump long-term nutrition');
}
// Shared item details display generated values and translated labels.
{
 const ctx=vm.createContext({});ctx.window=ctx;
 const strings=require('../data/ui_text_zhCN.json');
 ctx.UIText={t:(key,args)=>{assert.ok(strings[key],'missing UI key '+key);return strings[key].replace(/\{(\w+)\}/g,(m,k)=>args?.[k]??m);}};
 vm.runInContext(fs.readFileSync(new URL('../js/item-info-modules.js',import.meta.url),'utf8'),ctx);
 ctx.ItemInfoModules.setTable(require('../data/item-info-modules.json'));
 const fieldRules=require('../data/item-field-display-rules.json');
 assert.equal(fieldRules.fields.edible.renderer,'hidden');
 assert.equal(fieldRules.fields.edible_buff_id.renderer,'hidden');
 assert.equal(fieldRules.fields.food_buff_duration_ticks.renderer,'hidden');
 assert.equal(fieldRules.fields.spoilage_ticks.renderer,'hidden');
 assert.equal(fieldRules.fields.weight_kg.renderer,'hidden');
 for(const id of Object.keys(catalog.foods)) {
  const html=ctx.ItemInfoModules.renderTooltipModulesHtml({tpl:items[id],character:{skills:{life_cooking:{level:3}}}});
  assert.ok(html.includes('消化：'+food(id).digestion_ticks));
  assert.ok(!/[（）()]/.test(html),'food info should not contain parenthetical rule notes');
  assert.ok(!html.includes('[object Object]'));
 }
 const sample=items.food_fish_soup_clear;
 const renderAt=level=>ctx.ItemInfoModules.renderTooltipModulesHtml({tpl:sample,character:{skills:{life_cooking:{level}}}});
 const level0=renderAt(0);
 assert.ok(level0.includes('总饱食：28') && level0.includes('饮水：25') && level0.includes('占盒格数：1'));
 assert.ok(level0.includes('需 烹饪 1 级'));
 assert.ok(!level0.includes('消化：40') && !level0.includes('饮食构成：') && !level0.includes('属性经验：'));
 const level1=renderAt(1);
 assert.ok(level1.includes('消化：40') && level1.includes('饮食构成：蛋白类 90% / 蔬果 10%'));
 assert.ok(!level1.includes('保鲜：600') && !level1.includes('属性经验：'));
 const level2=renderAt(2);
 assert.ok(level2.includes('保鲜：600') && !level2.includes('属性经验：'));
 const level3=renderAt(3);
 assert.ok(level3.includes('属性经验：筋骨 36') && level3.includes('特殊效果：体力 +4 / 精力 +1 / 心情 +2'));
}
console.log('Food balance contracts and runtime integration passed.');
if (process.argv.includes('--report')) fs.writeFileSync(new URL('../docs/reference/food-balance-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');

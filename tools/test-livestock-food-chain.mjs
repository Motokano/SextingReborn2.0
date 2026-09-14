import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {read,items} from './lib/livestock-test-fixture.mjs';
const recipes=JSON.parse(read('data/cooking-recipes.json')).recipes;
const unified=JSON.parse(read('data/recipes.json')).recipes;
const methods=JSON.parse(read('data/cooking-methods.json')).methods;
const produced=[];
const ctx=vm.createContext({console,Math:Object.assign(Object.create(Math),{random:()=>0}),SceneCtx:{},SceneHud:{refresh(){}},UIText:{t:k=>k},GameEngine:{getState:()=>({mapId:'hideout',x:0,y:0})},InventoryEquipment:{getSkillLevel:()=>100,putItemIntoDefaultContainer:x=>{produced.push(x);return {placed:true};}}});ctx.window=ctx;
vm.runInContext(read('js/station-craft-core.js'),ctx);vm.runInContext(read('js/cooking-station.js'),ctx);ctx.CookingStation.setConfig({methods,recipes});
vm.runInContext(read('js/recipe-system.js'),ctx);
const router=ctx.RecipeSystem;router.setTables({recipes:unified},JSON.parse(read('data/recipe-methods.json')),JSON.parse(read('data/life-skill-recipe-interfaces.json')));
const app=read('js/scene-app.js');
vm.runInContext("var cookingRecipeProcessorRegistered=false;var COOKING_DEFAULT_PROCESSOR_ID='processor.life_cooking.default';\n"+app.slice(app.indexOf('    function registerCookingRecipeProcessorIfNeeded()'),app.indexOf('    function registerPharmacyRecipeProcessorIfNeeded()')),ctx);
ctx.registerCookingRecipeProcessorIfNeeded();
for(const [suffix,expected]of [['chop',3],['ground',1]]){
 const r=recipes.find(x=>x.recipe_id==='cook_livestock_cured_pork_'+suffix),u=unified['life_cooking.'+r.recipe_id];
 assert.deepEqual(r.inputs,u.inputs);assert.equal(u.main_output.count,expected);
 for(const route of ['fallback','unified']){
  ctx.RecipeSystem=route==='unified'?router:null;
  if(route==='unified'){const resolved=router.craft({recipe_system:'life_cooking',method_id:u.method_id,inputs:r.inputs});assert(resolved.ok,JSON.stringify(resolved));assert.equal(resolved.recipe_id,u.recipe_id);}
  produced.length=0;ctx.CookingStation.finalizeCraftNow({method_id:'pickle_salt',inputs:r.inputs});
  assert.equal(produced.length,expected);assert(produced.every(x=>x.item_id===r.output_item_id));
 }
 const meatIn=items[r.inputs[0].item_id].weight_kg,meatOut=items[r.output_item_id].weight_kg*expected;assert(meatOut<=meatIn);
}
const food=JSON.parse(read('data/food-balance.json')).foods,cfg=JSON.parse(read('data/survival-config.json')).food_model;
const dailyBase=cfg.base_expenditure*144,egg=food.food_dish_steamed_egg_custard.satiety_total*2,milk=food.food_dish_buffalo_yogurt.satiety_total/2;
assert.equal(egg,40);assert.equal(milk,10);assert((egg+milk)/dailyBase<.36);
const portions=26*3+35,preserve=items.food_dish_herb_cured_pork_slices.spoilage_ticks/144;
assert(preserve>portions*food.food_dish_herb_cured_pork_slices.satiety_total/dailyBase);
const maxCoverage=(egg/(.8*.8)+milk/(.7*.8))/dailyBase;assert(maxCoverage<.56);
const report={maxPerkAndCollectorCoverage:maxCoverage,assumptions:'Successful cooking, all required salt/herbs/tools/fuel/water supplied. Food expenditure excludes physical work. Curing uses all 26 chops + 35 ground-meat items from a healthy 120 kg pig.',dailyBaseSatiety:dailyBase,twoEggDishes:egg,halfYogurt:milk,baselineCoverage:(egg+milk)/dailyBase,yearPigCuredPortions:portions,curedMassKg:portions*.35,curedSatiety:portions*70,baseFoodDays:portions*70/dailyBase,shelfDays:preserve,crafts:61,craftTicks:61*methods.pickle_salt.craft_ticks,fuel:61*methods.pickle_salt.fuel_cost,water:61*methods.pickle_salt.water_cost,stamina:61*methods.pickle_salt.stamina_cost,eachHerbAndSaltItems:61};
fs.writeFileSync(new URL('../docs/reference/livestock-food-chain-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('PASS actual cooking grants 3/1 cured portions in both routes; egg/milk cover '+(report.baselineCoverage*100).toFixed(2)+'% of baseline food demand');

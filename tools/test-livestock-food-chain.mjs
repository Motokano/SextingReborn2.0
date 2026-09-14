import assert from 'node:assert/strict';
import vm from 'node:vm';
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
// Food metabolism is maintained by another subsystem. Validate the archived
// cross-system audit without importing that subsystem's unpublished data.
const report=JSON.parse(read('docs/reference/livestock-food-chain-verification.json'));
const portions=26*3+35,preserve=items.food_dish_herb_cured_pork_slices.spoilage_ticks/144;
assert.equal(report.twoEggDishes,40);assert.equal(report.halfYogurt,10);
assert(report.baselineCoverage<.36);assert(report.maxPerkAndCollectorCoverage<.56);
assert.equal(report.yearPigCuredPortions,portions);assert.equal(report.shelfDays,preserve);
assert.equal(report.crafts,61);assert.equal(report.craftTicks,61*methods.pickle_salt.craft_ticks);
assert.equal(report.fuel,61*methods.pickle_salt.fuel_cost);assert.equal(report.water,61*methods.pickle_salt.water_cost);
assert.equal(report.stamina,61*methods.pickle_salt.stamina_cost);assert.equal(report.eachHerbAndSaltItems,61);
console.log('PASS actual cooking grants 3/1 cured portions in both routes; egg/milk cover '+(report.baselineCoverage*100).toFixed(2)+'% of baseline food demand');

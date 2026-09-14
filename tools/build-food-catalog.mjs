import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (p, x) => fs.writeFileSync(path.join(root, p), JSON.stringify(x, null, 2) + '\n');
// Explicit game portions, not real-world nutritional measurements. No price/rarity nutrition multiplier.
// id, tier, satiety, digestion ticks, staple/meat/veg/other shares, portion units, immediate water, box slots
const rows = [
 ['food_flatbread_plain','home',40,25,[1,0,0,0],1,-5,1],
 ['food_compressed_biscuit','home',65,30,[1,0,0,0],1.3,-15,1],
 ['food_stew_meat_simple','home',30,45,[0,.8,.2,0],1,12,1],
 ['food_fish_soup_clear','home',28,40,[0,.9,.1,0],1,25,1],
 ['food_dish_steamed_bream','home',32,45,[0,.95,.05,0],1,10,1],
 ['food_dish_salt_grilled_whitefish','home',33,45,[0,.95,.05,0],1,0,1],
 ['food_dish_fried_potato_chunks','home',40,40,[.9,0,.1,0],1,-3,1],
 ['food_dish_roasted_potato_herbs','home',35,40,[.9,0,.1,0],1,0,1],
 ['food_dish_salted_cucumber','snack',15,25,[0,0,1,0],1,5,1],
 ['food_dish_steamed_egg_custard','snack',20,25,[0,1,0,0],.7,10,1],
 ['food_dish_buffalo_yogurt','snack',20,25,[0,.8,0,.2],.7,8,1],
 ['food_dish_beet_kvass','snack',12,20,[0,0,.3,.7],.3,30,1],
 ['food_herb_tea_bitter','snack',2,15,[0,0,0,1],.05,25,1],
 ['food_dried_meat_strip','snack',22,30,[0,1,0,0],.65,-5,1],
 ['herb_bitter','snack',3,15,[0,0,1,0],.1,2,1],
 ['herb_green','snack',4,15,[0,0,1,0],.1,3,1],
 ['herb_sweet','snack',5,15,[0,0,1,0],.15,2,1],
 ['wild_fruit_red','snack',8,20,[0,0,1,0],.3,5,1],
 ['wild_fruit_purple','snack',10,20,[0,0,1,0],.3,5,1],
 ['wild_fruit_yellow','snack',12,20,[0,0,1,0],.35,8,1],
 ['herb_pecan','snack',35,35,[.2,.4,0,.4],.7,-3,1],
 ['herb_sour_plum','snack',12,20,[0,0,.8,.2],.5,12,1],
 ['food_cooking_fail_generic','snack',5,15,[0,0,0,1],.25,-3,1],
 ['food_dish_applewood_turkey_roast','refined',50,55,[0,.9,.1,0],1.3,0,1],
 ['food_dish_mustard_beef_tongue','refined',45,50,[0,.9,.1,0],1.1,0,1],
 ['food_dish_beef_onion_stirfry','refined',45,50,[0,.7,.3,0],1.2,3,1],
 ['food_dish_squid_stirfry','refined',40,45,[0,.8,.2,0],1.1,3,1],
 ['food_dish_chicken_dice_stirfry','refined',45,50,[0,.85,.15,0],1.1,2,1],
 ['food_dish_sesame_garlic_salad','refined',30,40,[0,.1,.9,0],1.2,8,1],
 ['food_dish_beef_brisket_stew','banquet',75,75,[.15,.6,.25,0],2,20,2],
 ['food_dish_pig_trotter_bean_soup','banquet',75,75,[.3,.65,.05,0],2,25,2],
 ['food_dish_whitefish_soup_deluxe','banquet',65,65,[.1,.65,.25,0],1.8,30,2],
 ['food_dish_river_shrimp_soft_fry','banquet',65,60,[.25,.7,.05,0],1.5,-3,2],
 ['food_dish_lotus_glutinous_chicken','banquet',85,75,[.55,.3,.15,0],2.3,5,2],
 ['food_dish_herb_cured_pork_slices','banquet',70,70,[0,.95,.05,0],1.5,-10,2]
];
const items = read('data/items.json');
const exp = read('data/survival-config.json').meal_exp_by_tier;
const dims = { snack:['jingu'], home:['jingu'], refined:['jingu','flexibility'], banquet:['jingu','flexibility','breath'] };
const workhorse = new Set(['food_flatbread_plain','food_compressed_biscuit']);
const foods = {};
for (const [id,tier,sat,ticks,composition,units,water,slots] of rows) {
 if (!items[id]) throw Error('Unknown food ' + id);
 const grants = Object.fromEntries(dims[tier].map(d => [d, workhorse.has(id) || id === 'food_cooking_fail_generic' ? 0 : exp[tier]]));
 // Specials are bounded per tick and have independent durations; repeat eating refreshes them.
 let special = { duration_ticks: 20, stamina: .2, energy: .05, mood: .1, speed: 1 };
 if (tier === 'refined') special = { duration_ticks: 40, stamina: .3, energy: .08, mood: .2, speed: 1 };
 if (tier === 'banquet') special = { duration_ticks: 60, stamina: .4, energy: .12, mood: .25, speed: 1 };
 if (tier === 'snack') special = { duration_ticks: 15, stamina: .5, energy: .15, mood: .2, speed: 1 };
 if (id.startsWith('herb_') || id.startsWith('wild_fruit_')) special = { duration_ticks: 15, stamina: .2, energy: .05, mood: .1, speed: 1 };
 if (id === 'food_dried_meat_strip') special.speed = 1.05;
 if (id === 'food_dish_squid_stirfry' || id === 'food_dish_river_shrimp_soft_fry') special.speed = 1.08;
 if (id === 'food_herb_tea_bitter') { special.stamina = 0; special.energy = .3; }
 if (id === 'food_dish_buffalo_yogurt') { special.mood = .5; }
 if (workhorse.has(id) || id === 'food_cooking_fail_generic') special = { duration_ticks: 1, stamina: 0, energy: 0, mood: 0, speed: 1 };
 foods[id] = { name: items[id].sn, meal_tier: tier, satiety_total: sat, digestion_ticks: ticks, composition, portion_units: units,
  thirst_instant: water, slots_taken: slots, workhorse: workhorse.has(id), attribute_exp: grants, special, edible_buff_id: items[id].edible_buff_id };
}
const rawIds = `beef_blood beef_brain beef_heart beef_intestine beef_kidney beef_liver beef_lung beef_marrow beef_omasum beef_steak beef_tripe chicken_blood chicken_breast chicken_gizzard chicken_heart chicken_intestine chicken_liver chicken_thigh mutton_blood mutton_brain mutton_chop mutton_heart mutton_intestine mutton_kidney mutton_leg mutton_liver mutton_lung mutton_tongue mutton_tripe pork_blood pork_brain pork_chop pork_ear pork_heart pork_kidney pork_large_intestine pork_liver pork_lung pork_small_intestine`.split(' ').map(id=>'hus_'+id);
const exclusions = Object.fromEntries([...rawIds,'food_wine'].map(id => [id, { name:items[id].sn, reason: id === 'food_wine' ? '烹饪用酒：原表禁止直接食用，保留原料用途。' : '畜牧生肉/内脏：旧表标记可食用但没有使用效果；明确为待烹饪原料。' }]));
write('data/food-balance.json', { version:1, note:'游戏数值；本表为食物代谢与特殊效果真源，构建进 items.json/buffs.json。composition 顺序为主食、蛋白类（兼容 meat）、蔬果、其他。', foods, exclusions });
console.log('Food catalog:', rows.length, 'edible profiles;', Object.keys(exclusions).length, 'ingredient exclusions');

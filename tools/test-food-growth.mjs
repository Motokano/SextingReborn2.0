import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const cfg=read('data/survival-config.json'), foods=read('data/food-balance.json').foods;
const ctx=vm.createContext({console});
vm.runInContext(fs.readFileSync(new URL('../js/character-attributes.js',import.meta.url),'utf8'),ctx);
const CA=ctx.CharacterAttributes;
assert.deepEqual(Object.fromEntries(Object.entries(cfg.meal_exp_by_tier).filter(([k])=>k!=='_comment')), {snack:12,home:36,refined:120,banquet:390,feast:1500});
for(const [id,f] of Object.entries(foods)) for(const amount of Object.values(f.attribute_exp)) assert.equal(amount,f.workhorse||id==='food_cooking_fail_generic'?0:cfg.meal_exp_by_tier[f.meal_tier]);
function probability(exp) {
 CA.setState({attribute_experience:{jingu:{exp:Math.floor(exp),attribute_level:0,total_gained:0}}});
 return CA.previewAttributeExpProbability('player','jingu').probability;
}
function expectation(gain) {
 let tail=1,mean=0,median=null,p90=null;
 for(let n=1;n<100000;n++) {
  mean+=tail;tail*=1-probability(n*gain);
  if(median===null&&tail<=.5)median=n;
  if(p90===null&&tail<=.1)p90=n;
  if(tail<1e-12)break;
 }
 return {experience:gain,mean:Number(mean.toFixed(2)),median,p90};
}
const menus={
 '家常':['food_flatbread_plain','food_stew_meat_simple','food_dish_salted_cucumber','food_flatbread_plain','food_stew_meat_simple','food_dish_salted_cucumber','wild_fruit_purple'],
 '精致':['food_flatbread_plain','food_dish_beef_onion_stirfry','food_dish_salted_cucumber','food_flatbread_plain','food_dish_beef_onion_stirfry','food_dish_salted_cucumber','wild_fruit_purple'],
 '宴席':['food_dish_lotus_glutinous_chicken','food_dish_lotus_glutinous_chicken','wild_fruit_purple']
};
const rows=Object.entries(menus).map(([name,menu])=>({name,...expectation(menu.reduce((n,id)=>n+(foods[id].attribute_exp.jingu||0),0)*cfg.nutrition_tier_exp_mult.abundant)}));
assert.ok(rows[0].mean>rows[1].mean&&rows[1].mean>rows[2].mean);
assert.ok(Math.abs(probability(5000)-.5)<1e-5,'probability curve unchanged');
// Run the real player-parry handler with forced success; dry-runs must not grant XP.
{
 const c=vm.createContext({console});c.window=c;
 vm.runInContext('Math.random = function () { return 0; };',c);
 vm.runInContext(fs.readFileSync(new URL('../js/combat-pipeline.js',import.meta.url),'utf8'),c);
 let granted=0;
 c.CharacterAttributes={getCfg:(k,d)=>cfg[k]??d,getEffectiveAttr:()=>0,grantAttributeExp:(_owner,grants)=>{granted+=grants.reduce((n,g)=>n+g.exp,0);}};
 c.InventoryEquipment={};
 c.CombatParry={resolveParryPhaseContext:()=>({skip:false,guardLimb:'lhand',parrySkillId:'test',skillLevel:1})};
 c.CombatSkills={getParryValues:()=>({success:1,reduce:0})};
 c.CombatPipeline.setConfig({pipelines:{test:{phases:[{handler:'builtin.parry_player_combat_parry'}]}}});
 c.CombatPipeline.runPipeline('test',{hitRollSuccess:true,rawDamage:10,defender:{kind:'player'}});
 assert.equal(granted,1);
 c.CombatPipeline.runPipeline('test',{hitRollSuccess:true,rawDamage:10,defender:{kind:'player'},simultaneousDryRun:true});
 assert.equal(granted,1);
 c.CombatPipeline.runPipeline('test',{hitRollSuccess:false,rawDamage:10,defender:{kind:'player'}});
 assert.equal(granted,1);
}
console.table(rows);
console.log('PASS: sixfold food XP, unchanged probability curve, low-frequency contribution per parry, no dry-run/miss XP.');
if(process.argv.includes('--report')) {
 const lines=['# 食物属性成长校准（六倍经验）','','用户决定：食物基础经验为旧表的 6 倍，频繁动作只作少量补充。每份每维：小食 12、家常 36、精致 120、宴席 390、盛宴预留 1500；保底粗粮与失败物仍为 0。','','以下为初始成长等级、营养始终充沛 ×1.5、每轮配餐全部消化、每次出征后结算一次睡眠、无其他经验来源时，筋骨下一次 +1 的精确概率期望。失败保留经验，成功清空；不是固定升级次数，也不是按 5000/收入估算。','','| 配餐 | 每轮筋骨经验 | 平均出征次数 | 中位次数 | 90% 在此次数内获得 +1 |','|---|---:|---:|---:|---:|',...rows.map(r=>`| ${r.name} | ${r.experience} | ${r.mean} | ${r.median} | ${r.p90} |`),'','菜单：家常每轮两份粗面饼、杂煮、黄瓜及一份紫苏果；精致以洋葱牛肉替换杂煮；宴席为两份荷叶糯米鸡加一份紫苏果。这是经验收益对照，不代表三种菜单热量相等，也不包含睡眠期间额外配餐和暴食体重代价。','','高频来源：成功招架柔韧 15→1（已接运行时配置）；木桩示例筋骨 30→2、专注 20→1；采集示例身手 18→1、专注 12→1。木桩/采集目前只在登记示例中，未在本轮新增发放入口。罕见事件、药剂示例及调试奖励不按高频动作削减。','','已在胃内的旧份量保留食用时快照的经验预算，已入池经验不追溯放大；新食用份量使用六倍新表。'];
 fs.writeFileSync(new URL('../docs/reference/food-growth-calibration.md',import.meta.url),lines.join('\n')+'\n');
}

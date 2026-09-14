import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const catalog=read('data/food-balance.json'), items=read('data/items.json'), results=read('docs/reference/food-balance-results.json');
const tiers={snack:'小食',home:'家常',refined:'精致',banquet:'宴席'};
const lines=[
'# 食物数据校准表（2026-09-11）','',
'本轮覆盖 35 种现有可食用料理、零食与野食；39 种原来没有食用效果的畜牧生肉/内脏按用户决定明确为烹饪原料，烹饪用酒继续不可直接食用。15 道终局料理仅存在设计文档，没有物品与配方实例，本轮不新建内容。','',
'## 已生效的统一规则','',
'- 每次进食建立一份独立消化记录，同菜与异菜并行，新增食物不刷新旧份量。特殊效果单独计时，同菜只刷新、不叠强度。',
'- 食用时即时结算饮水变化；饱食与属性经验按每份消化进度结算。经验使用各次消化时的长期营养倍率，保留小数余量，睡眠成长判定不变。',
'- 经验已按用户决定提升为旧表六倍：小食 12、家常 36、精致 120、宴席 390；保底粗粮与失败物仍为 0。高频招架仅给柔韧 1 点，成长节奏详见 [六倍经验成长表](food-growth-calibration.md)。',
'- 营养不再按菜品价格或档位直接增加。实际消化的构成按 450 tick 指数记忆累计；主食、蛋白类、蔬果各至少占 15%，且各不超过 65%，视为均衡。这里的蛋白类沿用内部 meat 键，包含肉、蛋、奶、部分豆类；土豆主要计主食，复合菜可贡献多类。',
'- 长期目标：单一 15、搭配 55、均衡 100；每 tick 最多上升 0.03、下降 0.008，摄入过少时目标随有效份量下降，空腹不能仅靠历史标签维持营养。',
'- 身体每 tick 基础消耗 1；每实际消耗 1 体力另计 0.2，休息不会直接消掉体重，体力被动流失不再作为劳动重复计入。',
'- 饱食 100 以上的储备每 tick 转存 5%，显示上限 150 之外的部分也完整转存；累计每 180 单位转存量增加 1 kg。正常区间不清空小数进度。',
'- 高于参考正常体重（BMI 22）且饱食不足 60 时动用体重储备，每补充 10 单位消耗 1 kg，至正常目标停止。更低体型仅在储备真正耗尽后按每 144 单位缺口减 1 kg。增减换算是非对称的游戏节奏系数，不是现实热量或生理模型。',
'- 体型档位效果不变。吃撑保留速度和心情代价，移除旧的额外饱食流失，防止吞掉过量摄入；未新增经验吸收惩罚。','',
'## 全食物表','',
'主/蛋白/蔬果/其他为每份的构成比例，乘以份量点后随消化计入饮食历史。份量点是配餐权重，不是物品重量；总饱食还需扣除同期身体消耗，不能直接当作净恢复。经验为每份基础值，另乘长期营养倍率。','',
'| 食物 | 档位 | 总饱食 | 消化 tick | 单份饱食/tick | 主/蛋白/蔬果/其他 % | 份量点 | 即时饮水 | 格数 | 基础经验 | 特殊效果（总量；速度为持续倍率） | 特效 tick |',
'|---|---|---:|---:|---:|---|---:|---:|---:|---|---|---:|'
];
for(const [id,f] of Object.entries(catalog.foods)) lines.push(`| ${f.name} | ${tiers[f.meal_tier]}${f.workhorse?'·保底':''} | ${f.satiety_total} | ${f.digestion_ticks} | ${(f.satiety_total/f.digestion_ticks).toFixed(2)} | ${f.composition.map(x=>Math.round(x*100)).join('/')} | ${f.portion_units} | ${f.thirst_instant} | ${f.slots_taken} | ${items[id].food_experience_text} | ${items[id].food_special_text} | ${f.special.duration_ticks} |`);
lines.push('','## 出征参考流程与结果','',
'固定参考：178 cm、初始 69.7 kg、饱食 60、营养 40；每次 150 tick，每 tick 实际劳动消耗 1 体力（身体总消耗 1.2）。这是确定性参考序列，不是完整地图、战斗与补水操作的端到端通关测试。','',
'- 基础配餐：粗面饼 + 肉末杂煮 + 盐渍黄瓜，总饱食 85；在第 0 和 75 tick 开始两餐。',
'- 暴食：每个进餐点连续吃三套，共 510 饱食/出征；不在出征边界重置消化、营养或体重。',
'- 恢复：每个进餐点一套，共 170 饱食/出征；参考消耗 180，形成小幅缺口，用体重储备填补。',
'- 维持：两套基础配餐，另在第 110 tick 吃一份紫苏果（10 饱食），共 180；配餐节奏仍保留慢消化。',
'- 参考进餐点按同一时点建立各份消化，是方便复现的配餐测试。实际逐道食用耗时、地牢长度 100～200 tick、休息与战斗比例会改变结果；不是出征次数触发的硬规则。','',
'| 次数 | 持续暴食体重 kg | 随后恢复体重 kg |','|---:|---:|---:|');
for(let i=0;i<12;i++)lines.push(`| ${i+1} | ${results.overeat[i]?.weight_kg??'—'} | ${results.recovery[i].weight_kg} |`);
lines.push('',`正常维持 20 次出征后：体重 ${results.normal.at(-1).weight_kg} kg，饱食 ${results.normal.at(-1).satiety.toFixed(1)}，营养 ${results.normal.at(-1).nutrition}。`,'',
'## 来源与重新校准','',
'- 逐菜数值维护在 `tools/build-food-catalog.mjs` 的显式表，生成 `data/food-balance.json`。',
'- `npm run build:food` 同步食物目录、特殊效果和物品表。CSV 继续维护食物名称、配方相关身份、价格、重量、保质期等；食物代谢字段由目录覆盖，避免下次重建丢失。',
'- `npm run test:food` 验证覆盖、收支目标、重复进食、经验预算、旧档迁移、新档续接、真实食用/生存/效果入口与详情显示。',
'- `node tools/test-food-balance.mjs --report` 更新数值结果，再运行 `node tools/export-food-balance.mjs` 更新本表。',
'- 旧档仍在消化的菜按剩余时长比例迁移，不补发旧制已在进食时发放的经验；旧连续增重计时没有可靠的摄入量可换算，停止使用，保留已有体重。',
'- 饭盒容器本身仍待实现；这里已校准每菜占格和统一食用入口，没有声称完成灶台挂盒、打包或饭盒存档。','',
'## 原料排除清单','', '| 物品 | 处理 |','|---|---|');
for(const x of Object.values(catalog.exclusions))lines.push(`| ${x.name} | ${x.reason} |`);
fs.writeFileSync(new URL('../docs/reference/food-balance-calibration.md',import.meta.url),lines.join('\n')+'\n');
console.log('Exported full food balance review.');

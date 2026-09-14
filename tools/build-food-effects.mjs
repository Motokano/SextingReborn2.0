import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const catalog = read('data/food-balance.json');
const data = read('data/buffs.json');
for (const [id, f] of Object.entries(catalog.foods)) {
 const b = data.buffs.find(x => x.buff_id === f.edible_buff_id);
 if (!b) throw Error('Missing food buff ' + id);
 const special = f.special;
 b.name = f.name + '·余味';
 b.desc = `特殊效果持续 ${special.duration_ticks} 回合；同菜重复刷新，不叠强度。饱食和经验由每份食物独立消化结算。`;
 b.durationTicks = special.duration_ticks;
 b.maxStacks = 1;
 b.food_digest = false;
 b.effects = b.effects.filter(e => e.type !== 'survival_delta' && e.type !== 'battle_move_speed_multiplier');
 const delta = {};
 for (const k of ['stamina','energy','mood']) if (special[k]) delta[k] = special[k];
 if (Object.keys(delta).length) b.effects.unshift({type:'survival_delta',params:delta});
 if (special.speed !== 1) b.effects.push({type:'battle_move_speed_multiplier',params:{multiplier:special.speed}});
 b.expire_effects = (b.expire_effects || []).filter(e => e.type !== 'survival_delta' || !('nutrition' in (e.params || {})));
 b.judgment_tags = {...b.judgment_tags, food_item:id, food_special:true, meal_tier:f.meal_tier};
}
for (const id of ['buff_meal_balance_mixed','buff_meal_balance_balanced']) {
 const b = data.buffs.find(x => x.buff_id === id);
 b.effects = [];
 b.desc = '近期实际消化的食物搭配；长期营养由饮食比例缓慢变化，本状态不直接补营养。';
}
const stuffed = data.buffs.find(x => x.buff_id === 'survival_satiety_stuffed');
for (const e of stuffed.effects) if (e.type === 'survival_delta') delete e.params.satiety;
stuffed.desc = '吃撑：出手速度降低、心情下降；过量摄入按实际份量累计体重，不额外抹除食物收益。';
fs.writeFileSync(fileURLToPath(new URL('../data/buffs.json', import.meta.url)), JSON.stringify(data,null,2)+'\n');
console.log('Built 35 food special buffs and removed legacy direct nutrition grants.');

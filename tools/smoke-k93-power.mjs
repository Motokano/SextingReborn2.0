// 临时冒烟测试：k93 农牧场高级模块耗电字段（requires_power + 生产力墙）
// 运行：node tools/smoke-k93-power.mjs
import { readFileSync } from 'node:fs';

const modules = JSON.parse(readFileSync(new URL('../data/livestock-modules.json', import.meta.url), 'utf8')).modules;

// 建 window/global 桩
const g = { UIText: { t: (k) => k } };
globalThis.global = g;
globalThis.window = g;

const code = readFileSync(new URL('../js/livestock-state.js', import.meta.url), 'utf8');
// 用 Function 执行（文件里引用 window.LivestockState，global 桩上挂）
// eslint-disable-next-line no-eval
(0, eval)(code);

const LS = g.LivestockState;
if (!LS) { console.error('FAIL: LivestockState 未挂载'); process.exit(1); }

// 0) 先挂配置再校验（moduleRequiresPower 读模块表）
LS.setConfig({}, modules, {}, {}, {});

// 1) requires_power 数据完整性：small/medium=false；large（臂）=true；axis 仓储/气候=true，屠宰（手动）例外=false
let bad = 0;
for (const [id, m] of Object.entries(modules)) {
  if (typeof m.requires_power !== 'boolean') { console.error(`FAIL: ${id} 缺 requires_power`); bad++; continue; }
  let expect;
  if (m.tier === 'large') expect = true;
  else if (m.tier === 'axis') expect = id !== 'slaughter'; // 屠宰手动操作不耗电
  else expect = false;
  if (m.requires_power !== expect) { console.error(`FAIL: ${id} requires_power=${m.requires_power} 应=${expect}`); bad++; }
  const got = LS.moduleRequiresPower(id);
  if (got !== expect) { console.error(`FAIL: ${id} moduleRequiresPower=${got} 应=${expect}`); bad++; }
}
console.log(`requires_power 字段校验: ${bad === 0 ? 'PASS' : bad + ' FAIL'}`);

// 2) 生产力墙：断电解耦 tick 效果（k89 后 setState 的 power_available 迁移：false → 储能 0）
LS.setState({ power_available: false, arms: {
  arm1: { inner: null, front: null, bottom: { module_id: 'sprinkler', level: 1 }, top: null, cw_side: null, ccw_side: null },
  arm2: { inner: { module_id: 'pasture_arm', level: 1 }, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
  arm3: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
  arm4: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null }
}, axis: { slot1: { module_id: 'slaughter', level: 1 }, slot2: null }, zones: { z1:{grass_height:0.5,compaction:50,pollution:20}, z2:{grass_height:0.5,compaction:50,pollution:20}, z3:{grass_height:0.5,compaction:50,pollution:20}, z4:{grass_height:0.5,compaction:50,pollution:20} }, animals: [] });

if (LS.isPowerAvailable() !== false) { console.error('FAIL: 断电后 isPowerAvailable 应为 false'); bad++; }
if (!LS.isModulePowered('sprinkler')) { console.error('FAIL: 小型模块 sprinkler 无电也应可转'); bad++; }
if (LS.isModulePowered('pasture_arm')) { console.error('FAIL: 大型臂 pasture_arm 断电应停摆'); bad++; }
if (!LS.isModulePowered('slaughter')) { console.error('FAIL: 屠宰为手动操作，断电也应可转（requires_power:false）'); bad++; }

// 屠宰为手动操作（k93 修订）：断电时猪牛羊屠宰（轴心位）与鸡（鸡笼位）均不受电力墙限制
const st0 = LS.getState();
st0.animals.push({ uid: 'livestock_1', species_id: 'pig', weight_kg: 100, satiety: 80, hp: 100, perks: [], location_type: 'zone', zone_id: 'z1', dead: false, death_cause: null, starvation_ticks: 0, cooldowns: {}, reproduction_cooldown: 0 });
const sl = LS.slaughterAnimal('livestock_1');
// 测试无物种表 → 不应是 no_power（电力墙不拦手动屠宰；此处预期落到 no_products）
if (sl.reason === 'no_power') { console.error(`FAIL: 断电屠宰猪不应被电力墙拦, got=${JSON.stringify(sl)}`); bad++; }
else console.log('断电屠宰猪不受电力墙限制: PASS');

st0.animals.push({ uid: 'livestock_2', species_id: 'chicken', weight_kg: 2, satiety: 80, hp: 100, perks: [], location_type: 'coop', arm_id: 'arm1', dead: false, death_cause: null, starvation_ticks: 0, cooldowns: {}, reproduction_cooldown: 0 });
const slChick = LS.slaughterAnimal('livestock_2');
if (slChick.reason === 'no_power') { console.error(`FAIL: 断电屠宰鸡（鸡笼位）不应被电力墙拦, got=${JSON.stringify(slChick)}`); bad++; }
else console.log('断电鸡笼屠宰不受限: PASS');

// 生产力墙 tick 验证：断电时大型臂 pasture_arm（翻耕）应停摆 → 板结不下降；小型 sprinkler 无电可转
LS.advanceTick();
const zNoPower = LS.getState().zones.z1;
if (zNoPower.compaction !== 50) { console.error(`FAIL: 断电时大型臂应停摆（板结应保持 50，实际 ${zNoPower.compaction}）`); bad++; }
else console.log('断电大型臂停摆（板结不降）: PASS');

// 来电后恢复
LS.setPowerAvailable(true);
if (LS.isPowerAvailable() !== true) { console.error('FAIL: 来电后 isPowerAvailable 应为 true'); bad++; }
if (!LS.isModulePowered('pasture_arm')) { console.error('FAIL: 来电后 pasture_arm 应恢复'); bad++; }
// 来电后模块效果恢复：大型臂 pasture_arm 翻耕 -0.04/tick（作用于夹持区 z2/z3）
LS.advanceTick();
const zPowered = LS.getState().zones.z2;
if (zPowered.compaction >= 50) { console.error(`FAIL: 来电后 pasture_arm 应松土（板结应 < 50，实际 ${zPowered.compaction}）`); bad++; }
else console.log('来电大型臂恢复松土: PASS');

console.log(bad === 0 ? 'ALL PASS' : `${bad} FAIL`);
process.exit(bad === 0 ? 0 : 1);

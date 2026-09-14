// k89 电池→牧场供电最小闭环冒烟测试（headless Node）。
// 运行：node tools/smoke-k89-power-feed.mjs
// 覆盖：
//   1. 模块表 power_drain_per_tick 数据完整性（4 个需电模块均配置）
//   2. 起步储能 + addPowerCharge 注入
//   3. 每 tick 扣电：装了需电模块时 advanceTick 扣 drain；无需电模块不扣
//   4. 储能耗尽 → isPowerAvailable false → 需电模块停摆；塞电池恢复
//   5. setState 旧档迁移（power_available:true/false → power_charge）
import { readFileSync } from 'node:fs';

const modules = JSON.parse(readFileSync(new URL('../data/livestock-modules.json', import.meta.url), 'utf8')).modules;

const g = { UIText: { t: (k) => k } };
globalThis.global = g;
globalThis.window = g;
// eslint-disable-next-line no-eval
(0, eval)(readFileSync(new URL('../js/livestock-state.js', import.meta.url), 'utf8'));
const LS = g.LivestockState;
if (!LS) { console.error('FAIL: LivestockState 未挂载'); process.exit(1); }

LS.setConfig({}, modules, {}, {}, {});

let bad = 0;
const ok = (name) => console.log('  ✓ ' + name);
const fail = (name, detail) => { console.error('FAIL: ' + name + (detail ? ' | ' + detail : '')); bad++; };

// 1) 数据完整性
{
  const powered = Object.values(modules).filter((m) => m.requires_power === true);
  if (powered.length !== 4) fail('需电模块应为 4 个', '实际 ' + powered.length);
  else ok('需电模块 4 个全部存在');
  const missing = powered.filter((m) => m.power_drain_per_tick == null || Number(m.power_drain_per_tick) <= 0);
  if (missing.length) fail('需电模块缺 power_drain_per_tick', missing.map((m) => m.module_id).join(','));
  else ok('power_drain_per_tick 已配置（' + powered.map((m) => m.module_id + '=' + m.power_drain_per_tick).join(' ') + '）');
  // 非需电模块耗电应为 0
  const nonPoweredDrain = Object.values(modules).filter((m) => m.requires_power !== true && LS.modulePowerDrainPerTick(m.module_id) > 0);
  if (nonPoweredDrain.length) fail('非需电模块不应耗电', nonPoweredDrain.map((m) => m.module_id).join(','));
  else ok('非需电模块耗电 0');
}

// 2) 起步储能 + addPowerCharge
{
  LS.ensureState();
  if (LS.getPowerCharge() !== 500) fail('起步储能应为 500', '实际 ' + LS.getPowerCharge());
  else ok('起步储能 500');
  const r = LS.addPowerCharge(400);
  if (!r.ok || LS.getPowerCharge() !== 900) fail('addPowerCharge(400) 后储能应为 900', '实际 ' + LS.getPowerCharge());
  else ok('addPowerCharge 累加 900');
  const badAmt = LS.addPowerCharge(-5);
  if (badAmt.ok) fail('负电量应拒绝');
  else ok('负电量拒绝');
}

// 3) 保留的牧草管理与仓储合计 3/tick；退役气候不再参与。
{
  LS.initDemoState(); const st=LS.getState(); st.power_charge=10;
  st.arms.arm1.inner={module_id:'pasture_arm',level:1};
  if(LS.currentPowerDrainPerTick()!==1)fail('牧草臂应耗电 1');
  LS.advanceTick(); if(st.power_charge!==9)fail('单臂扣电');
  st.axis.slot2={module_id:'warehouse_hub',level:1};
  if(LS.currentPowerDrainPerTick()!==3)fail('牧草臂与仓储应耗电 3');
  LS.advanceTick(); if(st.power_charge!==6)fail('多模块扣电');
  st.power_charge=2; LS.advanceTick(); if(st.power_charge!==2)fail('不足整次供电不得结算');
  else ok('保留模块扣电与不足整次供电检查');
}

// 4) 耗尽停摆 + 塞电池恢复
{
  LS.setState({ power_charge: 2, arms: {
    arm1: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
    arm2: { inner: { module_id: 'pasture_arm', level: 1 }, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
    arm3: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
    arm4: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null }
  }, axis: { slot1: null, slot2: null }, zones: { z1:{grass_height:0.5,compaction:50,pollution:20}, z2:{grass_height:0.5,compaction:50,pollution:20}, z3:{grass_height:0.5,compaction:50,pollution:20}, z4:{grass_height:0.5,compaction:50,pollution:20} }, animals: [] });
  LS.advanceTick(); // 2-1=1
  LS.advanceTick(); // 1-1=0 → 断电
  if (LS.isPowerAvailable()) fail('储能 0 后应断电');
  else ok('储能耗尽 → 断电');
  if (LS.isModulePowered('pasture_arm')) fail('断电后 pasture_arm 应停摆');
  else ok('断电后需电模块停摆');
  // 塞一颗五号（100 电）→ 恢复
  const feed = LS.addPowerCharge(100);
  if (!LS.isPowerAvailable()) fail('塞电池后应恢复供电');
  else ok('塞电池（+100）恢复供电（当前储能 ' + feed.charge + '）');
  if (!LS.isModulePowered('pasture_arm')) fail('来电后 pasture_arm 应恢复');
  else ok('来电后模块恢复');
}

// 5) setState 旧档迁移
{
  LS.setState({ power_available: true, arms: LS.getState().arms, axis: LS.getState().axis, zones: LS.getState().zones, animals: [] });
  if (LS.getPowerCharge() !== 500) fail('旧档 power_available:true 应迁移为储能 500', '实际 ' + LS.getPowerCharge());
  else ok('旧档 true → 储能 500');
  LS.setState({ power_available: false, arms: LS.getState().arms, axis: LS.getState().axis, zones: LS.getState().zones, animals: [] });
  if (LS.getPowerCharge() !== 0 || LS.isPowerAvailable()) fail('旧档 false 应迁移为断电');
  else ok('旧档 false → 断电（储能 0）');
}

console.log(bad === 0 ? 'ALL PASS' : `${bad} FAIL`);
process.exit(bad === 0 ? 0 : 1);

/**
 * k229 疼痛系统冒烟测试（真实模块 node harness，无 DOM）
 *
 * 用 vm 把 js/survival.js、js/character-attributes.js、js/combat-enemies.js、js/buff-system.js
 * 装进同一沙箱（真实数据：data/buffs.json + data/editor/buff_event_registry.json + data/survival-config.json），
 * 验证：
 *  A. 汇率公式（完好 0.1 → 半废 0.55 → 失能 1.0）
 *  B. 玩家受击：损毁账与疼痛账并行（顶满溢出作废不计）
 *  C. 失能部位 Q 均分到其他正常肢体（09 规则），仍全额计增量
 *  D. 档位 debuff 上挂 + 每 tick 心情惩罚 + 镇痛压制（盖住不消除、药效过反扑）
 *  E. 剧痛 disable_actions(move)，镇痛下可移动
 *  F. 疼痛衰减（10 tick 停战后每 4 tick −1）+ 受伤重置计时
 *  G. 敌人侧：疼痛累积/封顶/镜像 buff/出手速度乘区
 *
 * 运行：npm run test:pain
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

const survCfg = loadJson('data/survival-config.json');

const sandbox = {
  console,
  fetch: async (p) => ({ ok: true, json: async () => loadJson(String(p)) }),
  // GameTime 最小替身：驱动 buff 的 world/tick_advanced 事件
  GameTime: {
    tick: 0,
    getState() {
      return { totalTicks: this.tick, year: 1, dayOfYear: 1, hour: 8, minute: 0, timePeriod: 'morning' };
    },
    advanceTicks(n) {
      this.tick += Math.max(0, Math.floor(Number(n) || 0));
    }
  }
};
vm.createContext(sandbox);

function runModule(file) {
  const code = fs.readFileSync(path.join(root, 'js', file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

runModule('survival.js');
runModule('character-attributes.js');
runModule('combat-enemies.js');
runModule('buff-system.js');

const S = sandbox.Survival;
const BS = sandbox.BuffSystem;
const CA = sandbox.CharacterAttributes;
const CE = sandbox.CombatEnemies;

if (!S || !BS || !CA || !CE) {
  console.error('[fatal] module globals missing');
  process.exit(2);
}

S.setConfig(survCfg);
CA.setConfig(survCfg);
BS.init();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitBuffReady() {
  for (let i = 0; i < 100; i++) {
    const st = BS.getState();
    if (st && st.loaded && st.templateCount >= 80) return true;
    await sleep(10);
  }
  return false;
}

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { pass += 1; console.log('  PASS  ' + msg); }
  else { fail += 1; console.log('  FAIL  ' + msg); }
}
function resetBody() {
  CA.setState(CA.getDefaultState());
  S.clearPain();
  // dirtyness=50 → 无「干净清爽(+5心情/tick)」buff 干扰；mood 锚 500（心情回归步进 0）
  S.setState({ mood: 500, dirtyness: 50, stamina: 100, energy: 100 });
}
/** 把玩家疼痛配置临时改为「封顶不随损毁走」，便于按档位直测（测试结束 restorePainConfig） */
function setPainConfigForTier(capBase) {
  S.setConfig({ pain_cap_base: capBase, pain_cap_per_avg_destroy: 0 });
  CA.setConfig({ pain_cap_base: capBase, pain_cap_per_avg_destroy: 0 });
}
function restorePainConfig() {
  S.setConfig({ pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75, pain_rate_base: 0.1, pain_rate_span: 0.9, pain_moderate_recovery_mult: 0.5 });
  CA.setConfig({ pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75 });
}

const ANALGESIC = {
  buff_id: 'test_analgesic_pill',
  name: '镇痛（测试）',
  durationTicks: 200,
  maxStacks: 1,
  stacksAddOnApply: 1,
  effects: [{ type: 'pain_suppression', params: {} }]
};

async function main() {
  const ready = await waitBuffReady();
  ok(ready, 'BuffSystem 载入真实 data/buffs.json（模板数 ≥ 80）');
  if (!ready) { console.error('[fatal] buff config not loaded'); process.exit(2); }
  ok(BS.getState().templateCount >= 81, 'buffs.json 模板数 ≥ 81（含 k229 survival_pain_*；制药矩阵另行叠加）');
  ok(BS.registerRuntimeBuffTemplate(ANALGESIC), '注册测试镇痛 buff 模板');

  // ---------- A. 汇率公式 ----------
  console.log('\n[A] 汇率公式（完好 0.1 / 半废 0.55 / 失能 1.0）');
  ok(S.calcPainIncrement(100, 0, 100) === 10, '100 损毁 × 完好汇率 0.1 → 10');
  ok(S.calcPainIncrement(100, 50, 100) === 55, '100 损毁 × 半废汇率 0.55 → 55');
  ok(S.calcPainIncrement(100, 100, 100) === 100, '100 损毁 × 失能汇率 1.0 → 100');
  ok(S.calcPainIncrement(10, 0, 100) === 1, '10 损毁 × 0.1 → 1（整数累进）');
  ok(S.calcPainIncrement(0, 0, 100) === 0, '无实际损毁 → 0');

  // ---------- B. 玩家受击：损毁账与疼痛账并行；顶满溢出作废 ----------
  console.log('\n[B] 玩家损毁账 → 疼痛账（顶满溢出作废不计）');
  resetBody();
  const chestMx = CA.getBodyPartDestroyMax('chest');
  ok(chestMx === 100, 'chest 损毁上限 = 100（survival-config body_part_destroy_max）');
  CA.applyCombatDestroy('chest', 100); // 0→100，全落
  ok(S.getPainInfo().stored === 10, 'chest 0→100 一记 100 → pain +10（100×0.1）');
  ok(CA.getPartDestroy('chest') === 100, '损毁账同步：chest=100');
  resetBody();
  CA.applyCombatDestroy('lhand', 200); // 顶满溢出 100 作废
  ok(S.getPainInfo().stored === 10, 'lhand 一记 200（上限 100）→ 实际 100 → pain +10（溢出作废不计）');
  ok(CA.getPartDestroy('lhand') === 100, '损毁账：lhand=100（不超上限）');

  // ---------- C. 失能部位 Q 均分去其他正常肢体（09 规则），仍全额计增量 ----------
  console.log('\n[C] 失能部位 Q 均分（09 规则）+ 全额计增量');
  resetBody();
  CA.applyCombatDestroy('lhand', 100); // lhand 失能
  ok(CA.isBodyPartDestroyedForParry('left_arm'), 'lhand 已失能（供招架判定一致）');
  CA.applyCombatDestroy('lhand', 100); // 失能后再中：均分 6 个正常肢体
  const parts = ['head', 'chest', 'abdomen', 'rhand', 'lfoot', 'rfoot'];
  const sumOther = parts.reduce((a, p) => a + CA.getPartDestroy(p), 0);
  ok(sumOther === 100, '均分后其他肢体实际损毁合计 = 100（失能后那击仍全额落地）');
  const infoC = S.getPainInfo();
  ok(infoC.stored === 100, '疼痛账：10 + round(100 × 汇率1.0) = 110 → 夹到 100');
  ok(infoC.tier === 'mild' || infoC.tier === 'moderate', '封顶后档位由平均损毁驱动（' + infoC.tier + '/' + infoC.cap + '）');

  // ---------- D. 档位 buff + 每 tick 心情惩罚 + 镇痛压制（盖住不消除、药效过反扑） ----------
  console.log('\n[D] 档位 buff / 每 tick 心情 / 镇痛压制');
  resetBody();
  setPainConfigForTier(100); // cap=100：档位可直测
  S.debugAddPain(30);
  ok(S.getPainInfo().effective === 30 && S.getPainInfo().tier === 'mild', 'pain=30 → 轻度');
  ok(BS.hasBuffByBuffId('player', 'survival_pain_mild'), '玩家挂上 survival_pain_mild');
  ok(Math.abs(BS.getBattleMoveSpeedMultiplier('player') - 0.9) < 1e-9, '轻度 出手速度乘区 ×0.90');
  // 每 tick 心情 -2（心情回归锚 500 → 步进 0；dirtyness 50 → 无干净清爽干扰）
  S.setState({ mood: 500 });
  S.advanceTick();
  ok(S.getState().mood === 498, '轻度疼痛每 tick 心情 −2（500→498）');
  // 镇痛压制：心情不掉、速度乘区失效、debuff 仍在
  BS.applyBuff('player', 'test_analgesic_pill', 'test');
  ok(BS.hasPainSuppression('player'), '镇痛在场 hasPainSuppression=true');
  S.setState({ mood: 500 });
  S.advanceTick();
  ok(S.getState().mood === 500, '镇痛压制：心情不再掉（盖住）');
  ok(Math.abs(BS.getBattleMoveSpeedMultiplier('player') - 1) < 1e-9, '镇痛压制：出手速度乘区失效（×1.0）');
  ok(BS.hasBuffByBuffId('player', 'survival_pain_mild'), '镇痛压制：debuff 仍在（盖住不消除）');
  // 药效过 → 反扑
  BS.removeBuffByBuffId('player', 'test_analgesic_pill');
  ok(!BS.hasPainSuppression('player'), '药效过：hasPainSuppression=false');
  S.setState({ mood: 500 });
  S.advanceTick();
  ok(S.getState().mood === 498, '药效过反扑：心情恢复 −2/tick');

  // ---------- E. 剧痛 disable_actions(move) + 镇痛下可移动 ----------
  console.log('\n[E] 剧痛禁移动 / 镇痛解禁');
  S.debugAddPain(65); // 30+65=95 → effective 95
  const infoE = S.getPainInfo();
  ok(infoE.tier === 'agony', 'pain=95（cap 100）→ 剧痛');
  ok(BS.hasActionDisabled('player', 'move'), '剧痛 hasActionDisabled(move)=true');
  ok(BS.hasMovementDisabled('player'), '剧痛 hasMovementDisabled=true');
  BS.applyBuff('player', 'test_analgesic_pill', 'test');
  ok(!BS.hasMovementDisabled('player'), '镇痛压制：剧痛可移动（禁移动被盖住）');
  ok(BS.hasBuffByBuffId('player', 'survival_pain_agony'), '剧痛 debuff 仍在（只盖住）');
  BS.removeBuffByBuffId('player', 'test_analgesic_pill');
  ok(BS.hasMovementDisabled('player'), '药效过：禁移动恢复');
  // 剧痛每 tick 心情 −8 / 体力 −3（净扣 ≈3.1，呼吸被动恢复极小量抵消）
  S.setState({ mood: 500, stamina: 100 });
  const stPre = S.getState().stamina;
  S.advanceTick();
  const stPost = S.getState().stamina;
  ok(S.getState().mood === 492, '剧痛每 tick 心情 −8');
  ok(stPre - stPost >= 3.0 && stPre - stPost <= 3.6, '剧痛每 tick 体力净扣 ≈3（实际 ' + (stPre - stPost).toFixed(2) + '）');
  restorePainConfig();

  // ---------- F. 疼痛衰减：10 tick 停战后每 4 tick −1；受伤重置 ----------
  console.log('\n[F] 疼痛衰减');
  resetBody();
  S.setConfig({ pain_cap_base: 100, pain_cap_per_avg_destroy: 0 });
  S.debugAddPain(40);
  for (let i = 0; i < 14; i++) S.advanceTick(); // grace 10 之后第 14 tick 衰减一次
  ok(S.getPainInfo().stored === 39, '40 − 1（第 14 tick 首衰减）→ 39');
  for (let i = 0; i < 4; i++) S.advanceTick(); // 18 → −1
  ok(S.getPainInfo().stored === 38, '每 4 tick −1 → 38');
  CA.applyCombatDestroy('chest', 1); // 1 点实际损毁：painInc=round(0.1)=0 但计时应重置
  const noHitAfterHit = S.getState().pain_no_hit_ticks;
  ok(noHitAfterHit === 0, '受伤（即使汇率取整为 0）也重置衰减计时');
  for (let i = 0; i < 11; i++) S.advanceTick();
  ok(S.getPainInfo().stored === 38, '重置后 11 tick（< 10+4）不衰减');
  for (let i = 0; i < 3; i++) S.advanceTick(); // 14 → −1
  ok(S.getPainInfo().stored === 37, '重置后第 14 tick 衰减 → 37');
  S.clearPain();
  ok(S.getPainInfo().stored === 0 && S.getPainInfo().tier === 'none', 'clearPain 清零');
  S.setConfig({ pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75 });

  // ---------- G. 敌人侧 ----------
  console.log('\n[G] 敌人疼痛（累积/封顶/镜像 buff/出手乘区）');
  CA.setConfig({ pain_cap_base: 90, pain_cap_per_avg_destroy: 0 });
  S.setConfig({ pain_rate_base: 1, pain_rate_span: 0, pain_cap_base: 90, pain_cap_per_avg_destroy: 0 });
  CE.applyEnemyDestroy('mapA', 0, 'chest', 100, 'thug');
  const gInfo = CE.getEnemyPainInfo('mapA', 0);
  ok(gInfo.stored === 100, '敌人一记 100 → pain 100（测试汇率 1.0）');
  ok(gInfo.cap === 90 && gInfo.effective === 90 && gInfo.tier === 'agony', '敌人封顶 90 → 剧痛档');
  ok(BS.hasBuffByBuffId('thug', 'survival_pain_agony'), '敌人档位镜像到 BuffSystem（owner=thug）');
  ok(Math.abs(BS.getBattleMoveSpeedMultiplier('thug') - 0.6) < 1e-9, '敌人剧痛 出手速度乘区 ×0.60（先手交换可读）');
  // 敌人 50~74 中度的汇率线性：打不同损毁部位观察增量按进度变化（新实例）
  CA.setConfig({ pain_cap_base: 100, pain_cap_per_avg_destroy: 0 });
  S.setConfig({ pain_rate_base: 0.1, pain_rate_span: 0.9, pain_cap_base: 100, pain_cap_per_avg_destroy: 0 });
  CE.applyEnemyDestroy('mapA', 1, 'rhand', 50, 'thug'); // 0→50
  const after50 = CE.getEnemyPainInfo('mapA', 1);
  ok(after50.stored === 5, '完好部位 50 损毁 → pain +5（×0.1）');
  CE.applyEnemyDestroy('mapA', 1, 'rhand', 50, 'thug'); // 50→100（半废汇率 0.55）
  const after100 = CE.getEnemyPainInfo('mapA', 1);
  ok(after100.stored === 5 + 28, '半废部位 50 损毁 → pain +round(50×0.55)=28');
  // 恢复默认配置
  CA.setConfig({ pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75 });
  S.setConfig({ pain_rate_base: 0.1, pain_rate_span: 0.9, pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75 });

  // ---------- H. 敌人 AI：剧痛不追击（disable_actions(move)），非剧痛照常移动 ----------
  console.log('\n[H] 敌人 AI 剧痛禁移动（真实 street_thug 模板）');
  CE.setTable(loadJson('data/combat-enemies.json'));
  CA.setConfig({ pain_cap_base: 90, pain_cap_per_avg_destroy: 0 });
  S.setConfig({ pain_rate_base: 1, pain_rate_span: 0, pain_cap_base: 90, pain_cap_per_avg_destroy: 0 });
  // 实例 0：多部位累积 → 剧痛（封顶 90）；实例 1：轻微伤不剧痛
  CE.applyEnemyDestroy('aiMap', 0, 'chest', 28, 'enemy.street_thug');
  CE.applyEnemyDestroy('aiMap', 0, 'abdomen', 24, 'enemy.street_thug');
  CE.applyEnemyDestroy('aiMap', 0, 'lhand', 36, 'enemy.street_thug');
  CE.applyEnemyDestroy('aiMap', 0, 'rhand', 36, 'enemy.street_thug');
  ok(CE.getEnemyPainInfo('aiMap', 0).tier === 'agony', '实例 0 剧痛（有效 90）');
  CE.applyEnemyDestroy('aiMap', 1, 'rhand', 5, 'enemy.street_thug');
  ok(CE.getEnemyPainInfo('aiMap', 1).tier === 'none', '实例 1 低痛（无档位）');
  const plan = CE.updateEnemyAI({
    map: { map_id: 'aiMap', enemies: [
      { enemy_id: 'enemy.street_thug', x: 0, y: 0 },
      { enemy_id: 'enemy.street_thug', x: 2, y: 0 }
    ] },
    playerX: 4,
    playerY: 0,
    tick: 100,
    isWalkable: () => true,
    isBlockedByOther: () => false,
    didActThisTick: () => false
  });
  ok(plan.moves.length === 1 && plan.moves[0].index === 1, '剧痛者不移动，非剧痛者照常追击（moves 仅 idx1）');
  ok(plan.moves.length === 0 || plan.moves[0].toX === 3, '非剧痛者向玩家迈 1 步');
  CA.setConfig({ pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75 });
  S.setConfig({ pain_rate_base: 0.1, pain_rate_span: 0.9, pain_cap_base: 25, pain_cap_per_avg_destroy: 0.75 });

  resetBody();
  setPainConfigForTier(100);
  S.debugAddPain(80);
  BS.applyBuff('player', 'buff_pharm_analgesic_drink_weak', 'test:partial');
  ok(S.getPainEffective() === 80, '粗镇痛口服起效前不降低疼痛');
  function painTick(n) {
    for (let i=0;i<n;i++) { sandbox.GameTime.advanceTicks(1); BS.triggerBuffPipeline({ event_id:'partial:'+sandbox.GameTime.tick, tick:sandbox.GameTime.tick, event_kind:'world', event_name:'tick_advanced', tags:['time','tick'], actor_id:'player' }); }
  }
  painTick(5);
  ok(Math.abs(S.getPainEffective()-64)<1e-9 && S.getPainInfo().stored===80, '20%忽略：真实80不变，有效64');
  ok(BS.hasBuffByBuffId('player','survival_pain_moderate'), '粗药只降到中度惩罚，不全压制');
  ok(S.getPainRecoveryFactor()===0.5, '剩余疼痛中度仍抑制恢复');
  BS.applyBuff('player','buff_pharm_analgesic_inject_potent','test:partial');
  ok(Math.abs(S.getPainEffective()-20)<1e-9, '强效注射忽略75%，多种药取最高值');
  ok(S.getPainRecoveryFactor()===1 && BS.getBattleMoveSpeedMultiplier('player')===1, '降到无惩罚后恢复与速度同步');
  S.debugAddPain(20);
  ok(S.getPainInfo().stored===100 && S.getPainEffective()===25, '药效期间新疼痛实时计入');
  const saved = JSON.parse(JSON.stringify(BS.getState()));
  BS.setState(saved);
  ok(S.getPainEffective()===25, '保存恢复药效后仍按比例计算');
  BS.removeBuffByBuffId('player','buff_pharm_analgesic_inject_potent');
  ok(S.getPainEffective()===80, '强药移除后回退仍有效的20%粗药');
  painTick(26);
  ok(S.getPainEffective()===80, '粗药超过原30tick窗口后仍有效');
  painTick(59);
  ok(S.getPainEffective()===80, '粗药90tick窗口末仍有效');
  painTick(1);
  ok(S.getPainEffective()===100 && S.getPainInfo().stored===100, '粗药90tick到期，恢复当时真实疼痛');
  ok(BS.hasMovementDisabled('player'), '到期恢复剧痛禁移动');
  restorePainConfig();

  console.log('\n========================================');
  console.log('smoke-pain: pass=' + pass + ' fail=' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[harness error]', e);
  process.exit(2);
});

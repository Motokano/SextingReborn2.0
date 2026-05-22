const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHARACTER_ATTR_PATH = path.join(ROOT, 'js', 'character-attributes.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createSandbox() {
  const sandbox = {
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  sandbox.InventoryEquipment = {
    _state: { equipment: {}, skills: {}, combat: {} },
    getState() {
      return this._state;
    },
    getCombatState() {
      return this._state.combat || {};
    },
    getItemTemplate() {
      return null;
    },
    getEnchantEntry() {
      return null;
    }
  };

  sandbox.Survival = {
    _tick: 0,
    _state: { tickCount: 0 },
    getState() {
      return this._state;
    },
    setTick(tick) {
      this._tick = tick;
      this._state.tickCount = tick;
    },
    setDiqiCapLimitFlatBonus() {},
    refreshDiqiMaxFromBreath() {}
  };

  sandbox.CombatSkills = {
    getSkill(skillId) {
      if (skillId === 'combat_basic_fist') {
        return {
          category: 'fist',
          moves: [
            {
              id: 'jab',
              proficiency_attr_unlocks: [
                { min_proficiency_ratio: 0.2, acquired: { jingu: 999 } }
              ]
            }
          ]
        };
      }
      return null;
    },
    getProficiencyRatio() {
      return 1;
    }
  };

  return sandbox;
}

function bootstrapCharacterAttributes() {
  const code = fs.readFileSync(CHARACTER_ATTR_PATH, 'utf8');
  const sandbox = createSandbox();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'character-attributes.js' });
  return sandbox;
}

function makeDefaultState(CA) {
  const st = CA.getDefaultState();
  st.character_creation_completed = true;
  return st;
}

function testGrantNormalAndAbnormal() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  CA.setState(makeDefaultState(CA));
  const ret = CA.grantAttributeExp('player', [
    { attr_id: 'jingu', exp: 120 },
    { attr_id: 'invalid_attr', exp: 300 },
    { attr_id: 'focus', exp: 0 },
    { attr_id: 'breath', exp: -5 },
    { attr_id: 'dexterity', exp: 27.9 }
  ], { source: 'unit-test' });

  assert(ret.ok === true, 'grant 正常返回 ok=true');
  assert(ret.applied.length === 2, '仅合法条目应入账（jingu + dexterity）');

  const expState = CA.getAttributeExpState('player');
  assert(expState.jingu.exp === 120, 'jingu exp 应累加 120');
  assert(expState.dexterity.exp === 27, 'dexterity exp 应 floor 后累加');
  assert(expState.focus.exp === 0, 'focus 非法 exp 不应入账');
  assert(expState.breath.exp === 0, 'breath 非法 exp 不应入账');
}

function testSettleSuccessAndFailurePath() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  CA.setState(makeDefaultState(CA));
  CA.grantAttributeExp('player', [{ attr_id: 'jingu', exp: 999999 }], {});

  // 先失败（rng=1），再成功（rng=0）
  let ret = CA.settleAttributeExpOnce('player', { tick: 100, rng: () => 1 });
  assert(ret.ok === true && ret.any_success === false, '失败路径：any_success=false');
  let st = CA.getAttributeExpState('player');
  assert(st.jingu.exp === 999999, '失败后 exp 应保留');
  assert(st.jingu.attribute_level === 0, '失败后 attribute_level 不变');

  ret = CA.settleAttributeExpOnce('player', { tick: 101, rng: () => 0 });
  assert(ret.ok === true && ret.any_success === true, '成功路径：any_success=true');
  st = CA.getAttributeExpState('player');
  assert(st.jingu.exp === 0, '成功后 exp 清零');
  assert(st.jingu.attribute_level === 1, '成功后 attribute_level +1');
}

function testSameTickDedup() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  CA.setState(makeDefaultState(CA));
  CA.grantAttributeExp('player', [{ attr_id: 'focus', exp: 20000 }], {});

  const ret1 = CA.settleAttributeExpOnce('player', { tick: 200, rng: () => 0 });
  const ret2 = CA.settleAttributeExpOnce('player', { tick: 200, rng: () => 0 });
  assert(ret1.dedup_skipped === false, '同 tick 首次不应去重');
  assert(ret2.dedup_skipped === true, '同 tick 二次应去重');
}

function testReentryLock() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  CA.setState(makeDefaultState(CA));
  CA.grantAttributeExp('player', [{ attr_id: 'breath', exp: 1000 }], {});

  let nestedRet = null;
  const ret = CA.settleAttributeExpOnce('player', {
    tick: 300,
    rng: () => {
      if (!nestedRet) {
        nestedRet = CA.settleAttributeExpOnce('player', { tick: 300, rng: () => 0 });
      }
      return 1;
    }
  });

  assert(ret.ok === true, '外层结算应正常返回');
  assert(nestedRet && nestedRet.lock_skipped === true, '重入应命中锁并被跳过');
}

function testSnapshotAndPerAttrSingleSuccess() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  CA.setState(makeDefaultState(CA));
  CA.grantAttributeExp('player', [
    { attr_id: 'jingu', exp: 999999 },
    { attr_id: 'flexibility', exp: 999999 },
    { attr_id: 'breath', exp: 999999 },
    { attr_id: 'dexterity', exp: 999999 },
    { attr_id: 'focus', exp: 999999 }
  ], {});

  const ret = CA.settleAttributeExpOnce('player', { tick: 400, rng: () => 0 });
  assert(ret.ok === true && ret.any_success === true, '应产生成功结算');
  assert(ret.settled.length === 5, '每次结算应仅判定五属性各一次');
  ret.settled.forEach((row) => {
    assert(row.success === true, `${row.attr_id} 应成功`);
    assert(row.attribute_level_after - row.attribute_level_before === 1, `${row.attr_id} 每次最多 +1`);
  });
}

function testTierClampReuseFor2001Plus() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  CA.setState(makeDefaultState(CA));
  const state = CA.getState();
  state.attribute_experience.jingu = { exp: 5000, attribute_level: 1999, total_gained: 0 };
  state.attribute_experience.flexibility = { exp: 5000, attribute_level: 2001, total_gained: 0 };
  CA.setState(state);

  const p1999 = CA.previewAttributeExpProbability('player', 'jingu');
  const p2001 = CA.previewAttributeExpProbability('player', 'flexibility');
  assert(p1999.ok && p2001.ok, '概率预览应成功');
  assert(Math.abs(p1999.probability - p2001.probability) < 1e-12, '2001+ 应复用 1991-2000 阶梯参数');
}

function testProficiencyNoLongerAddsAcquiredAttrs() {
  const sandbox = bootstrapCharacterAttributes();
  const CA = sandbox.CharacterAttributes;
  CA.setState(makeDefaultState(CA));

  sandbox.InventoryEquipment._state.skills = {
    combat_basic_fist: {
      level: 999,
      move_usage: { jab: 999999 }
    }
  };
  CA.setConfig({
    skill_attr_gain: {
      combat_basic_fist: {
        jingu: { threshold: 1, value: 1000 }
      }
    }
  });

  CA.recalcCharacterStats();
  const st = CA.getState();
  assert(st.acquired.jingu === 0, '战斗技能等级和招式熟练度不应再提供后天五维');
}

function runDeterministicTests() {
  const tests = [
    ['grant正常/异常输入', testGrantNormalAndAbnormal],
    ['settle成功/失败路径', testSettleSuccessAndFailurePath],
    ['同tick去重', testSameTickDedup],
    ['重入锁', testReentryLock],
    ['快照阶梯 + 每属性最多成功一次', testSnapshotAndPerAttrSingleSuccess],
    ['2001+封顶阶梯复用', testTierClampReuseFor2001Plus],
    ['熟练度不再提供后天五维加成', testProficiencyNoLongerAddsAcquiredAttrs]
  ];

  const results = [];
  for (const [name, fn] of tests) {
    try {
      fn();
      results.push({ name, pass: true });
    } catch (err) {
      results.push({ name, pass: false, error: err && err.message ? err.message : String(err) });
    }
  }
  return results;
}

function runProbabilityReplay() {
  const { CharacterAttributes: CA } = bootstrapCharacterAttributes();
  const buckets = [
    { range: '20-59', start: 20, end: 59 },
    { range: '1001-1010', start: 1001, end: 1010 },
    { range: '1991-2000', start: 1991, end: 2000 }
  ];
  const expSamples = [1000, 3000, 5000, 8000];

  const out = [];
  for (const bucket of buckets) {
    const bucketRows = [];
    for (let lv = bucket.start; lv <= bucket.end; lv++) {
      const row = { level: lv, values: {} };
      for (const exp of expSamples) {
        const state = CA.getDefaultState();
        state.character_creation_completed = true;
        state.attribute_experience.jingu = { exp, attribute_level: lv, total_gained: exp };
        CA.setState(state);
        const p = CA.previewAttributeExpProbability('player', 'jingu').probability;
        row.values[exp] = p;
      }
      bucketRows.push(row);
    }
    out.push({ range: bucket.range, rows: bucketRows });
  }
  return out;
}

function summarizeReplay(replay) {
  function avg(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  const expSamples = [1000, 3000, 5000, 8000];
  const lines = [];
  for (const group of replay) {
    const agg = {};
    for (const exp of expSamples) {
      const vals = group.rows.map((r) => r.values[exp]);
      agg[exp] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: avg(vals)
      };
    }
    lines.push({ range: group.range, agg });
  }
  return lines;
}

function main() {
  const deterministic = runDeterministicTests();
  const replay = runProbabilityReplay();
  const replaySummary = summarizeReplay(replay);
  const failures = deterministic.filter((x) => !x.pass);

  const result = {
    deterministic_tests: deterministic,
    deterministic_pass_count: deterministic.length - failures.length,
    deterministic_fail_count: failures.length,
    replay_summary: replaySummary
  };

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main();

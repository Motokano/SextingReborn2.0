import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const config = JSON.parse(fs.readFileSync(new URL('../data/survival-config.json', import.meta.url), 'utf8'));
const context = vm.createContext({ console });
vm.runInContext(
  fs.readFileSync(new URL('../js/survival.js', import.meta.url), 'utf8'),
  context,
  { filename: 'survival.js' }
);

const Survival = context.Survival;
Survival.setConfig(config);

function reset() {
  Survival.setState({
    stamina: 100,
    fatigue: 0,
    satiety: 100,
    thirst: 100,
    energy: 100,
    isResting: false,
    is_stamina_regen_action_active: false,
    is_sit_meditation_active: false,
    isDead: false
  });
}

function spendStamina(points) {
  for (let i = 0; i < points; i += 1) {
    // 出征中可通过恢复、食物或间歇动作补回体力；疲劳衡量累计劳动量。
    if (Survival.getStamina() < 1) Survival.setState({ stamina: 100 });
    Survival.consumeStamina(1);
  }
  return Survival.getFatigue();
}

reset();
Survival.advanceTick();
assert.equal(Survival.getFatigue(), 0, '单纯推进时间不应暗增疲劳');

reset();
const fatigueByExpedition = [];
for (let expedition = 1; expedition <= 6; expedition += 1) {
  fatigueByExpedition.push(spendStamina(150));
}

assert.deepEqual(
  fatigueByExpedition,
  [15, 30, 45, 60, 75, 90],
  '按每次约 150 点累计体力劳动估算：第 4 次开始疲倦，第 6 次进入困倦'
);
assert.equal(config.fatigue_gain_per_stamina_spent, 0.1, '疲劳换算应为每消耗 1 体力增加 0.1 疲劳');

// Match SceneCtx.actions.tryMoveTo: walking pays the configured cost as raw stamina.
// Equal total labor must accumulate equal fatigue regardless of action size or save frequency.
for (const [cost, source, reload] of [
  [config.stamina_intensity_rates.low, 'movement', false],
  [config.stamina_intensity_rates.low, 'movement', true],
  [0.21, 'movement', true], // discounted shoe cost rounded to stamina precision
  [0.01, 'labor', false]
]) {
  reset();
  for (let i = 0; i < 100; i++) {
    Survival.consumeStamina(cost, { raw: true, source });
    if (reload) Survival.setState(JSON.parse(JSON.stringify(Survival.getState())));
  }
  const divided = Survival.getFatigue();
  reset();
  Survival.consumeStamina(100 * cost, { raw: true, source });
  assert.equal(divided, Survival.getFatigue(), `fractional fatigue lost: cost=${cost}, source=${source}, reload=${reload}`);
  assert.ok(Math.abs(divided - 100 * cost * config.fatigue_gain_per_stamina_spent) < 1e-8);
}

reset();
Survival.consumeStamina(config.stamina_intensity_rates.low, { raw: true, source: 'movement' });
Survival.setState({ stamina: 100 });
Survival.advanceTick();
assert.equal(Survival.getFatigue(), 0.04, 'recovery and time must preserve fractional fatigue');
Survival.changeFatigue(1);
assert.equal(Survival.getFatigue(), 1.04, 'direct effects must preserve accumulated fractions');
Survival.changeFatigue(-1);
assert.equal(Survival.getFatigue(), 0.04);
Survival.clearFatigue();
assert.equal(Survival.getFatigue(), 0, 'explicit clearing API clears fractional fatigue too');
Survival.consumeStamina(config.stamina_intensity_rates.low, { raw: true, source: 'movement' });
assert.equal(Survival.getFatigue(), 0.04, 'no pre-clear remainder survives');
Survival.setState({ stamina: 0.1, fatigue: 0 });
Survival.consumeStamina(10, { raw: true });
assert.equal(Survival.getFatigue(), 19.81, '0.1 paid at the ordinary rate and 9.9 unpaid at double');
Survival.setState({ stamina: 0, fatigue: 0 });
Survival.consumeStamina(1, { raw: true, fatiguePerStamina: 1.5 });
assert.equal(Survival.getFatigue(), 2, 'unpaid stamina replaces even a specialized action rate');
Survival.consumeStamina(2, { raw: true, source: 'status_effect' });
Survival.advanceTick();
assert.equal(Survival.getFatigue(), 2, 'status effects and time alone do not incur unpaid action fatigue');
Survival.advanceTick({ source: 'combat' });
assert.equal(Survival.getFatigue(), 4, 'an actual combat tick converts its time cost once');
Survival.setState({ stamina: 0, fatigue: 99.99 });
Survival.consumeStamina(1);
assert.equal(Survival.getFatigue(), 100, 'unpaid fatigue respects the cap');
Survival.setState({ stamina: 100, fatigue: 99.99 });
Survival.consumeStamina(1, { raw: true });
assert.equal(Survival.getFatigue(), 100);
Survival.changeFatigue(-1000);
assert.equal(Survival.getFatigue(), 0);

reset();
for (let tick=0; tick<100; tick++) Survival.advanceTick({source:'combat'});
assert.equal(Survival.getStamina(),0);
assert.equal(Survival.getFatigue(),10);
Survival.advanceTick({source:'combat'});
assert.equal(Survival.getFatigue(),12);

const activeBuffs = new Set();
context.BuffSystem = {
  applyBuff: (owner, id) => activeBuffs.add(id),
  removeBuffByBuffId: (owner, id) => activeBuffs.delete(id),
  hasBuffByBuffId: (owner, id) => activeBuffs.has(id)
};
for (const [fatigue, tired, sleepy] of [
  [50, false, false], [50.04, true, false], [79.975, true, false], [80, false, true]
]) {
  Survival.setState({ fatigue });
  Survival.changeFatigue(0.000001); // exercise the real state-buff synchronization
  Survival.changeFatigue(-0.000001);
  assert.equal(activeBuffs.has('survival_fatigue'), tired, `tired boundary ${fatigue}`);
  assert.equal(activeBuffs.has('survival_fatigue_sleepy'), sleepy, `sleepy boundary ${fatigue}`);
}

reset();
Survival.setState({ stamina: 0 });
for (let tick = 1; tick <= 55; tick++) {
  Survival.advanceTick({ source: 'combat' });
  assert.equal(Survival.isComa(), false);
  assert.equal(activeBuffs.has('survival_coma'), false);
  assert.equal(activeBuffs.has('survival_stamina_exhausted'), true);
  assert.equal(Survival.getFatigue(), Math.min(100, Number((2 * tick).toFixed(2))));
}

assert.equal(Survival.getState().fatigueFullTicks,5,'reaching 100 at the end of tick 50 starts the clock for tick 51');
for (let i=0;i<24;i++) Survival.advanceTick();
assert.equal(Survival.getState().fatigueFullTicks,29);
Survival.changeFatigue(-0.01);
Survival.changeFatigue(0.01);
assert.equal(Survival.getState().fatigueFullTicks,0,'a reduction between ticks breaks the streak');

reset();
Survival.setState({fatigue:100});
for (let i=0;i<29;i++) Survival.advanceTick();
assert.equal(Survival.isComa(),false);
Survival.advanceTick();
assert.equal(Survival.isComa(),true,'positive stamina does not prevent fatigue coma');
assert.equal(activeBuffs.has('survival_fatigue_coma'),true);
assert.equal(Survival.getState().fatigueFullTicks,0);
const staminaAtCollapse = Survival.getStamina();
assert.ok(staminaAtCollapse>0);
Survival.setResting(true);
Survival.setStaminaRegenActionActive(true);
for (let i=1;i<=10;i++) {
  Survival.advanceTick({source:i%2?'sleep':'wait', stepStaminaCost:1});
  assert.equal(Survival.getState().fatigueComaTicksRemaining,10-i);
  assert.equal(Survival.getStamina(),staminaAtCollapse,'unconscious ticks neither charge a step nor grant sleep recovery');
  assert.equal(Survival.getFatigue(),i===10?90:100);
}
assert.equal(Survival.isComa(),false);
assert.equal(activeBuffs.has('survival_fatigue_coma'),false);
Survival.advanceTick();
assert.equal(Survival.getFatigue(),90,'wake relief applies once');
Survival.changeFatigue(10);
for (let i=0;i<30;i++) Survival.advanceTick();
assert.equal(Survival.isComa(),true,'a new full-fatigue streak can trigger another coma');
Survival.setDead('test');
assert.equal(Survival.getState().fatigueComaTicksRemaining,0);
assert.equal(Survival.getFatigue(),100,'death does not grant wake relief');

console.log('fatigue balance: expedition tuning, fractional actions, save/reload, recovery, effects and clamps passed');

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
    isDead: false,
    isComa: false
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

console.log('fatigue balance: 3 assertions passed');

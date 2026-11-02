/* Disposable logic prototype: can one 200-point flask support drinking and equipment builds?
 * Checks whether instance-bound refits survive save/load and disappear on carried-item death.
 * Pure transitions; browser persistence uses a separate disposable prototype save.
 * The bamboo base now grants +60% stored water when filling from a water source. */
export const MODELS = {
  iron: { name: '铁皮水壶', itemId: 'tool_flask_iron_water', sourceMultiplier: 1, detail: '当前对照：水源取水与入壶水量为1∶1。' },
  bamboo: { name: '青竹水壶', itemId: 'tool_flask_bamboo_water', sourceMultiplier: 1.6, detail: '从水源装水时，入壶水量增加60%。' }
};
export const AFFIXES = {
  none: { name: '无词条', detail: '使用基础数值。', cost: 1, recovery: 1 },
  economical: { name: '节流', detail: '单次耗水 −20%。', cost: 0.8, recovery: 1 },
  replenishing: { name: '润泽', detail: '补水总量 +20%。', cost: 1, recovery: 1.2 }
};
export const INSERTS = {
  none: { name: '无改造', detail: '饮用后立即补水。', weight: 0 },
  slow: { name: '缓释内胆', detail: '补水总量 +60%，改为随后5刻分次恢复。', weight: 0.1 },
  breath: { name: '调息内胆', detail: '立即补水，随后3刻共恢复15底气。', weight: 0.15 }
};
// Existing item IDs; quantities and recipes are prototype values, not production inventory.
export const MATERIALS = {
  wood_bamboo_green: { name: '青竹杆', initial: 3 },
  material_iron_blank_common: { name: '普通铁坯', initial: 3 },
  wood_cork: { name: '软木塞', initial: 6 },
  tool_layer_filter_sheet_pharmacy: { name: '分层过滤片', initial: 2 },
  material_steel_wire: { name: '钢丝料', initial: 3 },
  silica_leaf: { name: '硅叶', initial: 2 }
};
export const MODIFICATIONS = {
  none: { name: '恢复普通内胆', ticks: 1, costs: { wood_cork: 1 } },
  slow: { name: '缓释内胆改造', ticks: 3, costs: { material_iron_blank_common: 1, tool_layer_filter_sheet_pharmacy: 1, wood_cork: 1 } },
  breath: { name: '调息内胆改造', ticks: 3, costs: { material_steel_wire: 1, silica_leaf: 1, wood_cork: 1 } }
};
// Snapshot of manufacturing.tool_flask_iron_water in the existing 79 design recipe table.
export const CRAFT_RECIPE = {
  id: 'manufacturing.tool_flask_iron_water', itemId: 'tool_flask_iron_water',
  name: '铁皮水壶', ticks: 8, stamina: 8, output: 1,
  unlock: 'research', benchLevel: 2,
  costs: { material_iron_blank_common: 1, wood_cork: 1 }
};
// Mirrors the same revision-10 recipe table used by the manufacturing prototype.
export const CRAFT_RECIPES = {
  iron: CRAFT_RECIPE,
  bamboo: {
    id: 'manufacturing.tool_flask_bamboo_water', itemId: 'tool_flask_bamboo_water',
    name: '青竹水壶', ticks: 6, stamina: 6, output: 1, unlock: 'research', benchLevel: 1,
    costs: { wood_bamboo_green: 1, wood_cork: 1 }
  }
};
export const SCENARIOS = {
  home: '家中空壶', travel: '缺水外出', full: '饮水已满', low: '余水不足',
  bamboo_source: '青竹空壶＋40点水源', iron_source: '铁皮空壶＋40点水源', bamboo_near_full: '青竹已装190＋40点水源'
};
const round = value => Math.round(value * 10) / 10;
const waterRound = value => Math.round(value * 10000) / 10000;
const waterCeil = value => Math.ceil(value * 10000 - 1e-8) / 10000;
const waterFloor = value => Math.floor(value * 10000 + 1e-8) / 10000;
const labels = { thirst: '饮水', breath: '底气', stamina: '体力' };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const createFlask = (serial, model = 'iron') => ({ id: `prototype-flask-${serial}`, item_id: MODELS[model].itemId, model, water: 0, capacity: 200, affix: 'none', insert: 'none' });

export function initialState() {
  return {
    tick: 0, location: 'home', equipped: true,
    flask: createFlask(1), flaskSerial: 1, plannedCraft: 'iron',
    source: { water: 40 },
    workshop: { recipeKnown: true, manufacturingLevel: 5, benchLevel: 2, metalStation: true, hammer: true },
    plannedInsert: 'slow',
    materials: Object.fromEntries(Object.entries(MATERIALS).map(([id, material]) => [id, material.initial])),
    base: { waterCost: 25, thirst: 25 },
    player: { thirst: 35, breath: 40, stamina: 100 },
    active: [], sequence: 0,
    log: [{ tick: 0, text: '铁皮水壶已装备。可以在家中装满水。', kind: 'info' }]
  };
}

export function profile(state) {
  if (!state.flask) return { cost: 0, effects: [], weight: 0, emptyWeight: 0 };
  const affix = AFFIXES[state.flask.affix];
  const insert = INSERTS[state.flask.insert];
  const effects = [{
    target: 'thirst', amount: round(state.base.thirst * affix.recovery * (state.flask.insert === 'slow' ? 1.6 : 1)),
    ticks: state.flask.insert === 'slow' ? 5 : 0
  }];
  if (state.flask.insert === 'breath') effects.push({ target: 'breath', amount: 15, ticks: 3 });
  return {
    cost: round(state.base.waterCost * affix.cost), effects,
    weight: Math.round((0.7 + insert.weight + state.flask.water * 0.005) * 1000) / 1000,
    emptyWeight: Math.round((0.7 + insert.weight) * 1000) / 1000
  };
}

export function describeEffect(effect) {
  return effect.ticks
    ? `${effect.ticks}刻内恢复${effect.amount}${labels[effect.target]}`
    : `立即恢复${effect.amount}${labels[effect.target]}`;
}

export function drinkReason(state) {
  if (!state.flask) return '没有水壶，请先在家中制作。';
  if (!state.equipped) return '先装备水壶。';
  if (state.active.length) return '上一口的持续效果尚未结束。';
  const current = profile(state);
  if (state.flask.water < current.cost) return `剩余水量不足，需要${current.cost}点水。`;
  if (!current.effects.some(effect => state.player[effect.target] < 100 && effect.amount > 0)) {
    return '本次可恢复的属性都已满。';
  }
  return '';
}

export function refillReason(state) {
  if (!state.flask) return '没有水壶可以装水。';
  if (state.flask.water >= state.flask.capacity) return '水壶已经装满。';
  if (state.location !== 'home' && state.source.water <= 0) return '这个补水点已经没有水。';
  return '';
}

export function refillPlan(state) {
  if (!state.flask) return { taken: 0, gained: 0, multiplier: 1 };
  const multiplier = MODELS[state.flask.model].sourceMultiplier;
  const room = waterRound(state.flask.capacity - state.flask.water);
  const available = state.location === 'home' ? Infinity : state.source.water;
  const taken = Math.min(available, waterCeil(room / multiplier));
  const gained = Math.min(room, waterFloor(taken * multiplier));
  return { taken, gained, multiplier };
}

export function sourceDrinkReason(state) {
  if (state.location !== 'home' && state.source.water <= 0) return '这个补水点已经没有水。';
  if (state.player.thirst >= 100) return '饮水已满。';
  return '';
}

export function modifyReason(state) {
  if (!state.flask) return '请先制作一只水壶，再进行改造。';
  if (state.location !== 'home') return '回家后才能进行材料改造。';
  const recipe = MODIFICATIONS[state.plannedInsert];
  if (!recipe) return '请先选择改造方案。';
  if (state.flask.insert === state.plannedInsert) return '当前已是这个方案，无需重复改造。';
  const missing = Object.entries(recipe.costs)
    .filter(([id, count]) => (state.materials[id] || 0) < count)
    .map(([id, count]) => `${MATERIALS[id].name}×${count - (state.materials[id] || 0)}`);
  return missing.length ? `材料不足，还缺${missing.join('、')}。` : '';
}

export function craftReason(state) {
  const recipe = CRAFT_RECIPES[state.plannedCraft];
  if (state.location !== 'home') return '回到家中制作台才能制作。';
  if (state.flask) return '本页只试玩一只水壶，当前已有水壶。';
  if (!state.workshop.recipeKnown) return `尚未学会${recipe.name}配方。`;
  if (state.workshop.benchLevel < recipe.benchLevel) return `需要${recipe.benchLevel}级制作台。`;
  if (state.plannedCraft === 'iron' && !state.workshop.metalStation) return '需要金工工位。';
  if (state.plannedCraft === 'iron' && !state.workshop.hammer) return '需要修理锤，工具不消耗。';
  if (state.player.stamina < recipe.stamina) return `体力不足，需要${recipe.stamina}体力。`;
  const missing = Object.entries(recipe.costs)
    .filter(([id, count]) => (state.materials[id] || 0) < count)
    .map(([id, count]) => `${MATERIALS[id].name}×${count - (state.materials[id] || 0)}`);
  return missing.length ? `材料不足，还缺${missing.join('、')}。` : '';
}

// One envelope keeps material payment, item state, identity counter and active doses together.
export function encodeSave(state) {
  return JSON.stringify({ prototype: 'water-flask', version: 3, state });
}

export function decodeSave(text) {
  const saved = JSON.parse(text);
  const s = saved?.state;
  if (saved?.prototype === 'water-flask' && saved.version === 1 && s) {
    // Migrate the prior iron-only prototype without recreating lost equipment or changing its contents.
    if (s.flask) s.flask.model = 'iron';
    s.source = { water: 40 };
    saved.version = 2;
  }
  if (saved?.prototype === 'water-flask' && saved.version === 2 && s) {
    s.plannedCraft = s.flask?.model === 'bamboo' ? 'bamboo' : 'iron';
    s.materials.wood_bamboo_green = 0; // Old progress gains no free crafting materials.
    if (s.flask?.model === 'bamboo' && s.flask.item_id === 'prototype_flask_bamboo') s.flask.item_id = MODELS.bamboo.itemId;
    saved.version = 3;
  }
  const number = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(value) && value >= min && value <= max;
  const valid = saved?.prototype === 'water-flask' && saved.version === 3 && s &&
    ['home', 'away'].includes(s.location) && typeof s.equipped === 'boolean' &&
    Number.isSafeInteger(s.tick) && s.tick >= 0 && Number.isSafeInteger(s.flaskSerial) && s.flaskSerial >= 1 &&
    Number.isSafeInteger(s.sequence) && s.sequence >= 0 &&
    number(s.source?.water, 0, 40) &&
    Object.hasOwn(MODIFICATIONS, s.plannedInsert) &&
    Object.hasOwn(CRAFT_RECIPES, s.plannedCraft) &&
    Object.keys(MATERIALS).every(id => Number.isSafeInteger(s.materials?.[id]) && s.materials[id] >= 0) &&
    Object.keys(labels).every(id => number(s.player?.[id], 0, 100)) &&
    number(s.base?.waterCost, 1, 100) && number(s.base?.thirst, 1, 100) &&
    typeof s.workshop?.recipeKnown === 'boolean' && number(s.workshop?.benchLevel, 0) &&
    number(s.workshop?.manufacturingLevel, 0) && typeof s.workshop?.metalStation === 'boolean' && typeof s.workshop?.hammer === 'boolean' &&
    Array.isArray(s.active) && s.active.every(e => ['thirst', 'breath'].includes(e.target) && number(e.remaining, 0) && Number.isSafeInteger(e.ticksLeft) && e.ticksLeft > 0 && typeof e.sourceFlask === 'string') &&
    Array.isArray(s.log) && s.log.every(e => typeof e.text === 'string' && ['info', 'gain', 'blocked'].includes(e.kind) && number(e.tick, 0)) &&
    (s.flask === null ? !s.equipped && s.active.length === 0 :
      s.flask?.id === `prototype-flask-${s.flaskSerial}` && Object.hasOwn(MODELS, s.flask.model) && s.flask.item_id === MODELS[s.flask.model].itemId &&
      s.flask.capacity === 200 && number(s.flask.water, 0, 200) && Object.hasOwn(AFFIXES, s.flask.affix) && Object.hasOwn(INSERTS, s.flask.insert));
  if (!valid) throw new Error('试玩存档格式不兼容。');
  return s;
}

function note(state, text, kind = 'info') {
  state.log.unshift({ tick: state.tick, text, kind });
  state.log = state.log.slice(0, 36);
}

function restore(state, target, amount) {
  const before = state.player[target];
  state.player[target] = waterRound(clamp(before + amount, 0, 100));
  return waterRound(state.player[target] - before);
}

function advance(state, ticks) {
  for (let i = 0; i < ticks; i++) {
    state.tick++;
    const changes = [];
    for (const effect of state.active) {
      const portion = round(effect.remaining / effect.ticksLeft);
      const gained = restore(state, effect.target, portion);
      effect.remaining = round(effect.remaining - portion);
      effect.ticksLeft--;
      changes.push(`${labels[effect.target]} +${gained}${gained < portion ? `（满值截去${round(portion - gained)}）` : ''}`);
    }
    state.active = state.active.filter(effect => effect.ticksLeft > 0);
    if (changes.length) note(state, `持续恢复：${changes.join('，')}。`, 'gain');
  }
}

export function transition(previous, action) {
  const state = structuredClone(previous);
  switch (action.type) {
    case 'drink': {
      const reason = drinkReason(state);
      if (reason) { note(state, reason, 'blocked'); break; }
      const current = profile(state);
      state.flask.water = waterRound(state.flask.water - current.cost);
      advance(state, 1);
      const results = [];
      for (const effect of current.effects) {
        if (effect.ticks) {
          state.active.push({
            id: ++state.sequence, sourceFlask: state.flask.id, sourceInsert: state.flask.insert,
            target: effect.target, remaining: effect.amount, ticksLeft: effect.ticks
          });
          results.push(describeEffect(effect));
        } else {
          const gain = restore(state, effect.target, effect.amount);
          results.push(`${labels[effect.target]} +${gain}${gain < effect.amount ? `（满值截去${round(effect.amount - gain)}）` : ''}`);
        }
      }
      note(state, `饮用：耗水${current.cost}；${results.join('；')}。`, 'gain');
      break;
    }
    case 'refill': {
      const reason = refillReason(state);
      if (reason) { note(state, reason, 'blocked'); break; }
      const plan = refillPlan(state);
      if (state.location !== 'home') state.source.water = waterRound(state.source.water - plan.taken);
      advance(state, 1);
      state.flask.water = waterRound(state.flask.water + plan.gained);
      note(state, `${state.location === 'home' ? '家中水源' : '地牢补水点'}取水${plan.taken} → ${MODELS[state.flask.model].name}存水 +${plan.gained}${plan.multiplier > 1 ? '（取水加成60%）' : ''}，当前${state.flask.water}/${state.flask.capacity}${state.location !== 'home' ? `；水源剩余${state.source.water}` : ''}。`);
      break;
    }
    case 'source-drink': {
      const reason = sourceDrinkReason(state);
      if (reason) { note(state, reason, 'blocked'); break; }
      const taken = waterRound(Math.min(100 - state.player.thirst, state.location === 'home' ? Infinity : state.source.water));
      if (state.location !== 'home') state.source.water = waterRound(state.source.water - taken);
      advance(state, 1);
      const gained = restore(state, 'thirst', taken);
      note(state, `直接从水源饮用：取水${taken}，恢复${gained}饮水，未装入水壶${state.location !== 'home' ? `；水源剩余${state.source.water}` : ''}。`, 'gain');
      break;
    }
    case 'equip':
      if (!state.flask) { note(state, '没有水壶可以装备。', 'blocked'); break; }
      advance(state, 1);
      state.equipped = !state.equipped;
      note(state, state.equipped ? `${MODELS[state.flask.model].name}已装备。` : '水壶已放入背包，剩余水量保留。');
      break;
    case 'scene':
      state.location = state.location === 'home' ? 'away' : 'home';
      note(state, state.location === 'home' ? '已切换到家中水源。' : '已切换到外出情境。');
      break;
    case 'wait': {
      const ticks = action.ticks === 5 ? 5 : 1;
      advance(state, ticks);
      note(state, `已推进${ticks}刻。`);
      break;
    }
    case 'affix': {
      if (!state.flask) { note(state, '没有水壶可以调整词条。', 'blocked'); break; }
      if (state.location !== 'home') { note(state, '回家后才能调整试玩词条。', 'blocked'); break; }
      if (!Object.hasOwn(AFFIXES, action.value) || state.flask.affix === action.value) return state;
      state.flask.affix = action.value;
      note(state, `试玩词条改为「${AFFIXES[action.value].name}」。`);
      break;
    }
    case 'plan-insert': {
      if (!Object.hasOwn(MODIFICATIONS, action.value)) return state;
      state.plannedInsert = action.value;
      break;
    }
    case 'modify': {
      const reason = modifyReason(state);
      if (reason) { note(state, reason, 'blocked'); break; }
      const recipe = MODIFICATIONS[state.plannedInsert];
      const oldInsert = state.flask.insert;
      for (const [id, count] of Object.entries(recipe.costs)) state.materials[id] -= count;
      advance(state, recipe.ticks);
      state.flask.insert = state.plannedInsert;
      const consumed = Object.entries(recipe.costs).map(([id, count]) => `${MATERIALS[id].name}×${count}`).join('、');
      note(state, `${recipe.name}完成：消耗${consumed}，用时${recipe.ticks}刻${oldInsert !== 'none' ? '；原改造已替换，材料不返还' : ''}。`);
      break;
    }
    case 'materials': {
      if (!['empty', 'restock'].includes(action.value)) return state;
      for (const [id, material] of Object.entries(MATERIALS)) state.materials[id] = action.value === 'empty' ? 0 : material.initial;
      note(state, action.value === 'empty' ? '试玩设置：已清空材料。' : '试玩设置：已补充初始材料。');
      break;
    }
    case 'craft': {
      const reason = craftReason(state);
      if (reason) { note(state, reason, 'blocked'); break; }
      const recipe = CRAFT_RECIPES[state.plannedCraft];
      for (const [id, count] of Object.entries(recipe.costs)) state.materials[id] -= count;
      state.player.stamina = round(state.player.stamina - recipe.stamina);
      advance(state, recipe.ticks);
      state.flask = createFlask(++state.flaskSerial, state.plannedCraft);
      state.equipped = false;
      const consumed = Object.entries(recipe.costs).map(([id,count]) => `${MATERIALS[id].name}×${count}`).join('、');
      note(state, `${recipe.name}制作完成，已放入背包：消耗${consumed}、${recipe.stamina}体力，用时${recipe.ticks}刻。新壶为空，无词条、无改造。`);
      break;
    }
    case 'plan-craft':
      if (Object.hasOwn(CRAFT_RECIPES, action.value)) state.plannedCraft = action.value;
      break;
    case 'death': {
      const hadFlask = Boolean(state.flask);
      state.flask = null;
      state.equipped = false;
      state.active = [];
      state.location = 'home';
      state.player = { thirst: 50, breath: 50, stamina: 50 };
      note(state, `模拟死亡并返回家中：${hadFlask ? '随身水壶、词条、改造和存水全部丢失' : '随身没有水壶'}；配方和家中材料保留，未补发水壶。`, 'blocked');
      break;
    }
    case 'base': {
      if (state.location !== 'home' || !['waterCost', 'thirst'].includes(action.field)) return state;
      const value = Number(action.value);
      if (!Number.isFinite(value)) return state;
      state.base[action.field] = round(clamp(value, 1, 100));
      note(state, `基础${action.field === 'waterCost' ? '耗水' : '补水总量'}改为${state.base[action.field]}。`);
      break;
    }
    case 'player': {
      if (!Object.hasOwn(labels, action.field)) return state;
      const value = Number(action.value);
      if (!Number.isFinite(value)) return state;
      state.player[action.field] = round(clamp(value, 0, 100));
      note(state, `试玩调整：${labels[action.field]}设为${state.player[action.field]}。`);
      break;
    }
    case 'scenario': {
      if (!Object.hasOwn(SCENARIOS, action.value)) return state;
      const fresh = initialState();
      if (['bamboo_source', 'iron_source', 'bamboo_near_full'].includes(action.value)) {
        const model = action.value === 'iron_source' ? 'iron' : 'bamboo';
        fresh.flaskSerial = state.flaskSerial + 1;
        fresh.flask = createFlask(fresh.flaskSerial, model);
        fresh.plannedCraft = model;
        fresh.flask.water = action.value === 'bamboo_near_full' ? 190 : 0;
        fresh.location = 'away';
        fresh.materials = state.materials;
        fresh.workshop = state.workshop;
        fresh.base = state.base;
        fresh.sequence = state.sequence;
        fresh.log = [{ tick: 0, text: `试玩样例：${SCENARIOS[action.value]}。替换为无词条、无改造的示例壶，重置补水点供给。`, kind: 'info' }];
        return fresh;
      }
      fresh.base = state.base;
      fresh.flask = state.flask;
      fresh.equipped = state.equipped;
      fresh.flaskSerial = state.flaskSerial;
      fresh.workshop = state.workshop;
      fresh.sequence = state.sequence;
      fresh.plannedInsert = state.plannedInsert;
      fresh.plannedCraft = state.plannedCraft;
      fresh.materials = state.materials;
      fresh.source = state.source;
      if (action.value !== 'home') {
        fresh.location = 'away';
        fresh.player.thirst = action.value === 'full' ? 100 : 35;
        fresh.player.breath = action.value === 'full' ? 20 : 40;
      }
      if (fresh.flask) fresh.flask.water = action.value === 'home' ? 0 : action.value === 'low' ? 10 : 200;
      fresh.log = [{ tick: 0, text: `试玩情境：${SCENARIOS[action.value]}，保留当前配置。`, kind: 'info' }];
      return fresh;
    }
    case 'reset': return initialState();
  }
  return state;
}

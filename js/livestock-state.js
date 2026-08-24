/*
 * 畜牧系统 - 运行时状态 + tick 生态结算
 * 动物归属模型：
 *   - 区域动物（牛/羊/猪）：location_type='zone'，绑定 zone_id，吃草/拱地，旋转时顺时针迁区
 *   - 鸡笼动物（鸡）：location_type='coop'，绑定 arm_id（鸡笼装在机械臂内部），不迁区，清污作用于该臂夹持两区
 */
(function () {
  'use strict';

  var SPECIES = {};
  var MODULES = {};
  var PERKS = {};
  var BUILD_COSTS = {};
  var FEED_CROPS = {};
  var state = null;
  var uidSeq = 1;

  function clamp(v, lo, hi) {
    if (v == null || isNaN(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }
  function randInt(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  function newUid() {
    return 'livestock_' + (uidSeq++);
  }

  function setConfig(species, modules, perks, buildCosts, feedCrops) {
    SPECIES = species || {};
    MODULES = modules || {};
    PERKS = perks || {};
    BUILD_COSTS = buildCosts || {};
    FEED_CROPS = feedCrops || {};
  }

  function getSpecies(speciesId) { return SPECIES[speciesId] || null; }
  function getModule(moduleId) { return MODULES[moduleId] || null; }
  function getPerk(perkId) { return PERKS[perkId] || null; }
  function allSpecies() { return SPECIES; }
  function allModules() { return MODULES; }
  function allPerks() { return PERKS; }

  // §8.3 常见度权重
  var RARITY_WEIGHT = { common: 50, uncommon: 30, rare: 15, very_rare: 5 };

  // 聚合动物身上所有生效 Perk 的指定 modifier（乘法聚合，默认 1）
  function getModifier(animal, key) {
    var mult = 1;
    var perks = (animal && animal.perks) || [];
    for (var i = 0; i < perks.length; i++) {
      var pdef = getPerk(perks[i]);
      if (!pdef || !pdef.modifiers) continue;
      // 跨种 Perk 不生效但保留（§8.5）
      if (pdef.species && pdef.species.indexOf(animal.species_id) < 0) continue;
      if (pdef.requires) {
        if (pdef.requires.gender && animal.gender !== pdef.requires.gender) continue;
      }
      var val = pdef.modifiers[key];
      if (val != null) mult *= Number(val);
    }
    return mult;
  }

  // 按稀有度权重从物种 Perk 池抽 1 个
  function pickPerkByRarity(pool) {
    if (!pool || !pool.length) return null;
    var total = 0;
    var weighted = [];
    pool.forEach(function (pid) {
      var pdef = getPerk(pid);
      var w = pdef && RARITY_WEIGHT[pdef.rarity] ? RARITY_WEIGHT[pdef.rarity] : 1;
      total += w;
      weighted.push({ id: pid, w: w });
    });
    var r = Math.random() * total;
    for (var i = 0; i < weighted.length; i++) {
      r -= weighted[i].w;
      if (r <= 0) return weighted[i].id;
    }
    return weighted.length ? weighted[weighted.length - 1].id : null;
  }

  // §8.1 抽取 0-4 个 Perk（纯随机，可白板）
  function rollPerks(speciesId) {
    var sp = getSpecies(speciesId);
    if (!sp || !sp.perk_pool || !sp.perk_pool.length) return [];
    var count = randInt(0, 4);
    var out = [];
    for (var i = 0; i < count; i++) {
      var perk = pickPerkByRarity(sp.perk_pool);
      if (perk && out.indexOf(perk) < 0) out.push(perk);
    }
    return out;
  }

  // §8.5 遗传：父母各抽 1-2 个，合并去重，最多 4 不补位
  function inheritPerks(fatherPerks, motherPerks) {
    function sample(list) {
      if (!list || !list.length) return [];
      var n = Math.min(list.length, randInt(1, 2));
      var picked = [];
      var idx = list.slice();
      for (var i = 0; i < n && idx.length; i++) {
        var r = Math.floor(Math.random() * idx.length);
        picked.push(idx.splice(r, 1)[0]);
      }
      return picked;
    }
    var merged = sample(fatherPerks).concat(sample(motherPerks));
    var seen = {};
    var out = [];
    merged.forEach(function (p) {
      if (p && !seen[p]) { seen[p] = 1; out.push(p); }
    });
    while (out.length > 4) out.pop();
    return out;
  }

  // 鸡笼动物默认归属：装鸡笼（inner 模块实例的 module_id === 'coop'）的臂
  function findCoopArm(arms) {
    for (var k in arms) {
      if (arms[k] && getSlotModuleId(arms[k].inner) === 'coop') return k;
    }
    return 'arm1';
  }

  // 模块实例：{ module_id, level, upgrading_remaining, feed_units? }
  function makeModuleInstance(moduleId) {
    var inst = { module_id: moduleId, level: 1, upgrading_remaining: 0 };
    if (moduleId === 'feed_trough') inst.feed_units = 0;
    return inst;
  }
  function getSlotModuleId(slot) {
    if (!slot) return null;
    return typeof slot === 'string' ? slot : slot.module_id;
  }
  function normalizeModuleSlot(slot) {
    if (!slot) return null;
    if (typeof slot === 'string') {
      var inst = { module_id: slot, level: 1, upgrading_remaining: 0 };
      if (slot === 'feed_trough') inst.feed_units = 0;
      return inst;
    }
    if (slot.module_id == null) return null;
    if (slot.level == null) slot.level = 1;
    if (slot.upgrading_remaining == null) slot.upgrading_remaining = 0;
    if (slot.module_id === 'feed_trough' && slot.feed_units == null) slot.feed_units = 0;
    return slot;
  }

  function makeAnimal(speciesId, gender, locType, locId, opts) {
    opts = opts || {};
    var sp = getSpecies(speciesId);
    var birth = (sp && sp.growth && sp.growth.birth_weight_kg != null) ? sp.growth.birth_weight_kg : 0;
    var cap = (sp && sp.growth && sp.growth.fatten_cap_kg) ? sp.growth.fatten_cap_kg : birth;
    var a = {
      uid: newUid(),
      species_id: speciesId,
      gender: gender,
      age_ticks: opts.age_ticks || 0,
      weight_kg: opts.weight_kg != null ? opts.weight_kg : cap,
      satiety: opts.satiety != null ? opts.satiety : 80,
      hp: opts.hp != null ? opts.hp : 100,
      perks: opts.perks || [],
      pregnant: opts.pregnant || null,
      reproduction_cooldown: opts.reproduction_cooldown || 0,
      cooldowns: opts.cooldowns || {},
      location_type: locType || 'zone',
      zone_id: locType === 'coop' ? null : locId,
      arm_id: locType === 'coop' ? locId : null,
      dead: false,
      death_cause: null
    };
    return a;
  }

  function initDemoState() {
    var arms = {
      arm1: { inner: makeModuleInstance('coop'), front: null, bottom: { shadow: true, module_id: 'coop' }, top: null, cw_side: null, ccw_side: null },
      arm2: { inner: null, front: null, bottom: null, top: null, cw_side: makeModuleInstance('feed_trough'), ccw_side: null },
      arm3: { inner: null, front: null, bottom: makeModuleInstance('sprinkler'), top: null, cw_side: null, ccw_side: null },
      arm4: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null }
    };

    state = {
      rotation_ticks_remaining: 862,
      rotation_total_ticks: 1000,
      zones: {
        z1: { grass_height: 1.2, compaction: 10, pollution: 5 },
        z2: { grass_height: 0.7, compaction: 30, pollution: 25 },
        z3: { grass_height: 0.1, compaction: 60, pollution: 90 },
        z4: { grass_height: 0.3, compaction: 85, pollution: 55 }
      },
      arm_zones: {
        arm1: ['z1', 'z2'],
        arm2: ['z2', 'z3'],
        arm3: ['z3', 'z4'],
        arm4: ['z4', 'z1']
      },
      arms: arms,
      axis: { slot1: makeModuleInstance('slaughter'), slot2: null },
      animals: [
        // 区域动物（牛/羊/猪）
        makeAnimal('cattle', 'female', 'zone', 'z1', { perks: ['hardy'] }),
        makeAnimal('cattle', 'male', 'zone', 'z1', { weight_kg: 300 }),
        makeAnimal('sheep', 'female', 'zone', 'z1', { perks: ['clean_sheep'] }),
        makeAnimal('cattle', 'female', 'zone', 'z2', { weight_kg: 150 }),
        makeAnimal('sheep', 'female', 'zone', 'z2', {}),
        makeAnimal('sheep', 'male', 'zone', 'z2', {}),
        makeAnimal('sheep', 'female', 'zone', 'z2', {}),
        makeAnimal('sheep', 'female', 'zone', 'z2', {}),
        makeAnimal('pig', 'female', 'zone', 'z2', { pregnant: { father_uid: null, remaining_ticks: 1500 } }),
        makeAnimal('pig', 'male', 'zone', 'z2', {}),
        makeAnimal('sheep', 'female', 'zone', 'z4', {}),
        makeAnimal('sheep', 'male', 'zone', 'z4', {}),
        makeAnimal('sheep', 'female', 'zone', 'z4', {}),
        makeAnimal('pig', 'female', 'zone', 'z4', {}),
        makeAnimal('pig', 'male', 'zone', 'z4', {}),
        makeAnimal('pig', 'female', 'zone', 'z3', {}),
        makeAnimal('pig', 'male', 'zone', 'z3', {}),
        makeAnimal('pig', 'female', 'zone', 'z3', {}),
        makeAnimal('pig', 'female', 'zone', 'z3', {}),
        makeAnimal('pig', 'female', 'zone', 'z3', {}),
        // 鸡笼动物（鸡，在 arm1 的鸡笼）
        makeAnimal('chicken', 'female', 'coop', 'arm1', {}),
        makeAnimal('chicken', 'female', 'coop', 'arm1', {}),
        makeAnimal('chicken', 'female', 'coop', 'arm1', {}),
        makeAnimal('chicken', 'female', 'coop', 'arm1', {}),
        makeAnimal('chicken', 'female', 'coop', 'arm1', {}),
        makeAnimal('chicken', 'female', 'coop', 'arm1', {})
      ]
    };

    // demo 动物设为成年，便于测试繁殖（鸡 maturity 为 null，跳过）
    state.animals.forEach(function (a) {
      var sp = getSpecies(a.species_id);
      if (sp && sp.growth && sp.growth.maturity_ticks != null) {
        a.age_ticks = sp.growth.maturity_ticks;
      }
    });
  }

  function getState() { return state; }
  function ensureState() { if (!state) initDemoState(); return state; }

  function setState(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    if (!incoming.arm_zones) {
      incoming.arm_zones = { arm1: ['z1', 'z2'], arm2: ['z2', 'z3'], arm3: ['z3', 'z4'], arm4: ['z4', 'z1'] };
    }
    // 模块位迁移：旧字符串 → 实例
    if (incoming.arms && typeof incoming.arms === 'object') {
      for (var ak in incoming.arms) {
        var arm = incoming.arms[ak];
        if (!arm || typeof arm !== 'object') continue;
        for (var sk in arm) {
          arm[sk] = normalizeModuleSlot(arm[sk]);
        }
      }
    }
    if (incoming.axis && typeof incoming.axis === 'object') {
      for (var xk in incoming.axis) {
        incoming.axis[xk] = normalizeModuleSlot(incoming.axis[xk]);
      }
    }
    var coopArm = findCoopArm(incoming.arms || {});
    if (Array.isArray(incoming.animals)) {
      incoming.animals.forEach(function (a) {
        if (a.dead == null) a.dead = false;
        if (a.death_cause == null) a.death_cause = null;
        if (!a.cooldowns) a.cooldowns = {};
        if (a.reproduction_cooldown == null) a.reproduction_cooldown = 0;
        // 旧档迁移：无 location_type 的默认为 zone；鸡迁移到鸡笼
        if (!a.location_type) {
          if (a.species_id === 'chicken') {
            a.location_type = 'coop';
            a.arm_id = coopArm;
            a.zone_id = null;
          } else {
            a.location_type = 'zone';
            a.arm_id = null;
            a.zone_id = a.zone_id || 'z1';
          }
        }
      });
    }
    state = incoming;
    var maxSeq = 0;
    if (Array.isArray(state.animals)) {
      state.animals.forEach(function (a) {
        var m = /livestock_(\d+)/.exec(a.uid || '');
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      });
    }
    uidSeq = maxSeq + 1;
  }

  function moveAnimal(uid, zoneId) {
    var st = ensureState();
    var a = null;
    for (var i = 0; i < st.animals.length; i++) {
      if (st.animals[i].uid === uid) { a = st.animals[i]; break; }
    }
    // 只有区域动物可跨区迁移
    if (a && a.location_type === 'zone' && st.zones[zoneId]) {
      a.zone_id = zoneId;
    }
    return a;
  }

  function animalsInZone(zoneId) {
    var st = ensureState();
    return st.animals.filter(function (a) { return a.location_type === 'zone' && a.zone_id === zoneId && !a.dead; });
  }

  function animalsInCoop(armId) {
    var st = ensureState();
    return st.animals.filter(function (a) { return a.location_type === 'coop' && a.arm_id === armId && !a.dead; });
  }

  function findAnimal(uid) {
    var st = ensureState();
    for (var i = 0; i < st.animals.length; i++) {
      if (st.animals[i].uid === uid) return st.animals[i];
    }
    return null;
  }

  // 采集活体产物（奶/毛/血/蛋）。返回 { ok, item_id?, count?, reason? }
  function collectProduct(uid, productId) {
    var a = findAnimal(uid);
    if (!a || a.dead) return { ok: false, reason: 'not_found' };
    var sp = getSpecies(a.species_id);
    var prod = null;
    (sp && sp.products && sp.products.living || []).forEach(function (p) {
      if (p.product_id === productId) prod = p;
    });
    if (!prod) return { ok: false, reason: 'no_product' };
    if ((a.cooldowns && a.cooldowns[productId]) > 0) {
      return { ok: false, reason: 'cooldown', remaining: a.cooldowns[productId] };
    }
    if (prod.min_hp > 0 && a.hp < prod.min_hp) {
      return { ok: false, reason: 'low_hp' };
    }
    a.cooldowns[productId] = Math.round(prod.cooldown_ticks * getModifier(a, 'product_cooldown_mult_' + productId));
    if (prod.hp_cost > 0) {
      a.hp = clamp(a.hp - prod.hp_cost, 0, 100);
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'blood_loss'; }
    }
    return { ok: true, item_id: prod.item_id, count: 1 };
  }

  // 屠宰动物，产出肉/器官/副产物。返回 { ok, items:[{item_id,count}], reason? }
  function slaughterAnimal(uid) {
    var a = findAnimal(uid);
    if (!a || a.dead) return { ok: false, reason: 'not_found' };
    var sp = getSpecies(a.species_id);
    if (!sp || !sp.products || !sp.products.slaughter) return { ok: false, reason: 'no_products' };
    var sl = sp.products.slaughter;
    var items = [];
    var meatBlocks = Math.max(1, Math.floor((a.weight_kg || 0) * 0.5 / 5 * getModifier(a, 'slaughter_yield_mult')));
    if (sl.meat_item_ids && sl.meat_item_ids.length) {
      items.push({ item_id: sl.meat_item_ids[0], count: meatBlocks });
    }
    (sl.offal_item_ids || []).forEach(function (id) { items.push({ item_id: id, count: 1 }); });
    (sl.byproduct_item_ids || []).forEach(function (id) { items.push({ item_id: id, count: 1 }); });
    a.dead = true;
    a.death_cause = 'slaughter';
    return { ok: true, items: items };
  }

  /* ================= 饲料 ================= */

  function getCropNutrition(itemId) {
    return FEED_CROPS[itemId] != null ? Number(FEED_CROPS[itemId]) : null;
  }

  // 找投喂某区域的饲料槽（装在 cw_side，面朝该区）
  function findTroughForZone(zoneId) {
    var st = ensureState();
    for (var ak in st.arms) {
      var arm = st.arms[ak];
      var trough = arm && arm.cw_side;
      if (!trough || isShadowSlot(trough) || getSlotModuleId(trough) !== 'feed_trough') continue;
      var zones = (st.arm_zones && st.arm_zones[ak]) || [];
      // 面朝区域 = arm_zones 第二个
      if (zones[1] === zoneId) return trough;
    }
    return null;
  }

  // 投喂作物到饲料槽（直接投，营养值÷10 = 单位数）
  function addFeedToTrough(armId, cropItemId, count) {
    var nut = getCropNutrition(cropItemId);
    if (nut == null) return { ok: false, reason: 'not_feed_crop' };
    var st = ensureState();
    var arm = st.arms[armId];
    var trough = arm && arm.cw_side;
    if (!trough || isShadowSlot(trough) || getSlotModuleId(trough) !== 'feed_trough') {
      return { ok: false, reason: 'no_trough' };
    }
    if (trough.feed_units == null) trough.feed_units = 0;
    var c = Math.max(1, Math.floor(Number(count) || 1));
    var add = (nut / 10) * c;
    var before = trough.feed_units;
    trough.feed_units = clamp(trough.feed_units + add, 0, 100);
    var added = trough.feed_units - before;
    return { ok: true, added: added, total: trough.feed_units };
  }

  /* ================= 手动操作（§12） ================= */

  function cleanZone(zoneId, amount) {
    var st = ensureState();
    var z = st.zones[zoneId];
    if (!z) return { ok: false, reason: 'no_zone' };
    z.pollution = clamp((z.pollution || 0) - (amount || 10), 0, 100);
    return { ok: true, pollution: z.pollution };
  }

  function tillZone(zoneId, amount) {
    var st = ensureState();
    var z = st.zones[zoneId];
    if (!z) return { ok: false, reason: 'no_zone' };
    z.compaction = clamp((z.compaction || 0) - (amount || 10), 0, 100);
    return { ok: true, compaction: z.compaction };
  }

  function feedChickens(armId) {
    var st = ensureState();
    var chicks = st.animals.filter(function (a) { return a.location_type === 'coop' && a.arm_id === armId && !a.dead; });
    var fed = 0;
    chicks.forEach(function (c) {
      c.satiety = clamp((c.satiety || 0) + 20, 0, 100);
      fed++;
    });
    return { ok: true, fed: fed };
  }

  /* ================= 模块装配 / 拆卸 / 升级 ================= */

  var ARM_SLOT_KEYS = ['inner', 'front', 'bottom', 'top', 'cw_side', 'ccw_side'];

  // 展开模块占用的面（modules.json 的 side 键 → cw_side/ccw_side）
  function expandModuleSlots(m) {
    var out = [];
    var s = (m && m.slots) || {};
    for (var k in s) {
      if (k === 'side') {
        out.push('cw_side');
        if (Number(s[k]) >= 2) out.push('ccw_side');
      } else {
        out.push(k);
      }
    }
    return out;
  }

  function isShadowSlot(slot) {
    return !!(slot && slot.shadow === true);
  }

  function getArmOrAxis(armId) {
    var st = ensureState();
    if (armId === 'axis') return { container: st.axis, isAxis: true };
    if (st.arms && st.arms[armId]) return { container: st.arms[armId], isAxis: false };
    return null;
  }

  // 检查模块能否装到某位（占面/互斥）
  function canBuildModule(armId, slotKey, moduleId) {
    var m = getModule(moduleId);
    if (!m) return { ok: false, reason: 'unknown_module' };
    var holder = getArmOrAxis(armId);
    if (!holder) return { ok: false, reason: 'unknown_arm' };

    if (holder.isAxis) {
      var axisNum = parseInt(String(slotKey).replace('slot', ''), 10);
      if (m.axis_slot !== axisNum) return { ok: false, reason: 'axis_slot_mismatch' };
      if (holder.container[slotKey]) return { ok: false, reason: 'slot_occupied' };
      return { ok: true };
    }

    var slots = expandModuleSlots(m);
    if (slots.indexOf(slotKey) < 0) return { ok: false, reason: 'slot_mismatch' };
    for (var i = 0; i < slots.length; i++) {
      if (holder.container[slots[i]]) return { ok: false, reason: 'slot_occupied' };
    }
    return { ok: true };
  }

  function getBuildStep(tier, fromLevel) {
    var tc = (BUILD_COSTS && BUILD_COSTS[tier]) || null;
    if (!tc || !Array.isArray(tc.steps)) return null;
    for (var i = 0; i < tc.steps.length; i++) {
      if (tc.steps[i].from === fromLevel) return tc.steps[i];
    }
    return null;
  }

  function getUpgradeTicks(tier) {
    var tc = (BUILD_COSTS && BUILD_COSTS[tier]) || null;
    return tc && tc.upgrade_ticks ? tc.upgrade_ticks : 20;
  }

  function tryConsumeMaterials(inputs) {
    var IE = window.InventoryEquipment;
    if (!IE) return { ok: false, reason: 'no_inventory' };
    if (!inputs || !inputs.length) return { ok: true };
    for (var i = 0; i < inputs.length; i++) {
      var have = (typeof IE.countCarriedItemsByTemplateId === 'function')
        ? IE.countCarriedItemsByTemplateId(inputs[i].item_id) : 0;
      if (have < inputs[i].count) {
        return { ok: false, reason: 'lack_material', item_id: inputs[i].item_id, need: inputs[i].count, have: have };
      }
    }
    for (var j = 0; j < inputs.length; j++) {
      if (typeof IE.removeCarriedItemsByTemplateId === 'function') {
        IE.removeCarriedItemsByTemplateId(inputs[j].item_id, inputs[j].count);
      }
    }
    return { ok: true };
  }

  // 装配（= 首次建造，消耗 Lv1→2 档材料；臂上跨面模块：主位存实例，其余面存影子）
  function buildModule(armId, slotKey, moduleId) {
    var m = getModule(moduleId);
    if (!m) return { ok: false, reason: 'unknown_module' };
    var chk = canBuildModule(armId, slotKey, moduleId);
    if (!chk.ok) return chk;
    var step = getBuildStep(m.tier, 1);
    var consume = tryConsumeMaterials(step && step.inputs);
    if (!consume.ok) return consume;
    var holder = getArmOrAxis(armId);
    if (holder.isAxis) {
      holder.container[slotKey] = makeModuleInstance(moduleId);
      return { ok: true };
    }
    holder.container[slotKey] = makeModuleInstance(moduleId);
    var slots = expandModuleSlots(m);
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] !== slotKey) {
        holder.container[slots[i]] = { shadow: true, module_id: moduleId };
      }
    }
    return { ok: true };
  }

  // 拆卸（不退材料；清空主位 + 其影子面）
  function dismountModule(armId, slotKey) {
    var holder = getArmOrAxis(armId);
    if (!holder) return { ok: false, reason: 'unknown_arm' };
    var inst = holder.container[slotKey];
    if (!inst) return { ok: false, reason: 'slot_empty' };
    if (isShadowSlot(inst)) return { ok: false, reason: 'shadow_slot' };
    if (inst.upgrading_remaining > 0) return { ok: false, reason: 'upgrading' };
    var moduleId = inst.module_id;
    holder.container[slotKey] = null;
    for (var sk in holder.container) {
      var v = holder.container[sk];
      if (v && v.shadow && v.module_id === moduleId) holder.container[sk] = null;
    }
    return { ok: true };
  }

  // 开始升级（消耗对应档材料 + 进入工程等待期）
  function startUpgrade(armId, slotKey) {
    var holder = getArmOrAxis(armId);
    if (!holder) return { ok: false, reason: 'unknown_arm' };
    var inst = holder.container[slotKey];
    if (!inst) return { ok: false, reason: 'slot_empty' };
    if (isShadowSlot(inst)) return { ok: false, reason: 'shadow_slot' };
    if (inst.level >= 5) return { ok: false, reason: 'max_level' };
    if (inst.upgrading_remaining > 0) return { ok: false, reason: 'upgrading' };
    var m = getModule(inst.module_id);
    if (!m) return { ok: false, reason: 'unknown_module' };
    var step = getBuildStep(m.tier, inst.level);
    var consume = tryConsumeMaterials(step && step.inputs);
    if (!consume.ok) return consume;
    inst.upgrading_remaining = getUpgradeTicks(m.tier);
    return { ok: true, ticks: inst.upgrading_remaining };
  }

  // 每 tick 推进升级工程（跳过影子位）
  function tickUpgrades() {
    var st = ensureState();
    var containers = [];
    if (st.arms) for (var ak in st.arms) containers.push(st.arms[ak]);
    if (st.axis) containers.push(st.axis);
    for (var c = 0; c < containers.length; c++) {
      var cont = containers[c];
      if (!cont || typeof cont !== 'object') continue;
      for (var sk in cont) {
        var inst = cont[sk];
        if (!inst || typeof inst !== 'object' || isShadowSlot(inst)) continue;
        if (inst.upgrading_remaining > 0) {
          inst.upgrading_remaining--;
          if (inst.upgrading_remaining <= 0) {
            inst.level = clamp(inst.level + 1, 1, 5);
          }
        }
      }
    }
  }

  /* ================= tick 生态结算 ================= */

  var ZONE_NEXT = { z1: 'z2', z2: 'z3', z3: 'z4', z4: 'z1' };

  function rotateClockwise(st) {
    // 区域动物顺时针迁区
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (a.dead || a.location_type !== 'zone') continue;
      a.zone_id = ZONE_NEXT[a.zone_id] || a.zone_id;
    }
    // 装置顺时针转：臂转到下一个位置，夹持区域轮转（arm1 接替 arm2 的位置）
    var old = st.arm_zones || {};
    st.arm_zones = {
      arm1: old.arm2 || ['z2', 'z3'],
      arm2: old.arm3 || ['z3', 'z4'],
      arm3: old.arm4 || ['z4', 'z1'],
      arm4: old.arm1 || ['z1', 'z2']
    };
  }

  function advanceTick() {
    var st = ensureState();

    // 0. 模块升级工程推进
    tickUpgrades();

    // 1. 旋转倒计时
    st.rotation_ticks_remaining--;
    if (st.rotation_ticks_remaining <= 0) {
      rotateClockwise(st);
      st.rotation_ticks_remaining = st.rotation_total_ticks;
    }

    // 2. 区域生态：草自然生长
    for (var zid in st.zones) {
      var z = st.zones[zid];
      var growthFactor = (100 - (z.compaction || 0)) * 0.009 + 0.1;
      z.grass_height = clamp((z.grass_height || 0) + (0.8 / 1000) * growthFactor, 0, 1.5);
    }

    // 3. 每只动物结算
    var births = [];
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (a.dead) continue;
      var sp = getSpecies(a.species_id);
      if (!sp) continue;
      tickAnimal(st, a, sp, births);
    }
    for (var b = 0; b < births.length; b++) st.animals.push(births[b]);
  }

  function tickAnimal(st, a, sp, births) {
    if (a.location_type === 'coop') {
      tickCoopAnimal(st, a, sp);
      return;
    }

    var zone = st.zones[a.zone_id];
    if (!zone) return;

    // 吃草（牛/羊）
    if (sp.graze) {
      var h = zone.grass_height;
      var edible = h >= sp.graze.edible_min_m && (sp.graze.edible_max_m == null || h <= sp.graze.edible_max_m);
      if (edible) {
        var inComfort = h >= sp.graze.comfort_min_m && (sp.graze.comfort_max_m == null || h <= sp.graze.comfort_max_m);
        var rate = sp.graze.comfort_rate_m_per_tick * (inComfort ? 1 : sp.graze.non_comfort_mult) * getModifier(a, 'graze_rate_mult');
        zone.grass_height = Math.max(0, h - rate);
        a.satiety = clamp(a.satiety + sp.graze.satiety_regen_per_tick, 0, 100);
      }
    }

    // 猪：拱地保底 + 松土降污 + 吃饲料（补饱腹 + 长肉）
    if (a.species_id === 'pig') {
      if (a.satiety < 10) a.satiety = Math.min(10, a.satiety + 0.03);
      if (sp.ecosystem_impact) {
        zone.compaction = clamp(zone.compaction + sp.ecosystem_impact.root_clean_per_tick, 0, 100);
        zone.pollution = clamp(zone.pollution + sp.ecosystem_impact.pollution_pct_per_tick, 0, 100);
      }
      var trough = findTroughForZone(a.zone_id);
      if (trough && trough.feed_units > 0) {
        // 补饱腹（1 单位 = 10 饱腹）
        if (a.satiety < 100) {
          var take = Math.min(trough.feed_units, 0.05);
          trough.feed_units = Math.max(0, trough.feed_units - take);
          a.satiety = clamp(a.satiety + take * 10, 0, 100);
        }
        // 长肉（饱腹 > 70 才长，料肉比 × feed_conversion_mult）
        if (a.satiety > 70 && sp.feed && sp.feed.feed_units_per_tick) {
          var growthUnits = sp.feed.feed_units_per_tick;
          if (trough.feed_units >= growthUnits) {
            trough.feed_units -= growthUnits;
            var pigGrowth = growthUnits * 10 / sp.feed.nutrition_per_kg_meat * getModifier(a, 'feed_conversion_mult');
            if (a.weight_kg < sp.growth.fatten_cap_kg) {
              a.weight_kg = Math.min(sp.growth.fatten_cap_kg, a.weight_kg + pigGrowth);
            }
          }
        }
      }
    }

    // 饱腹下降（satiety_drain_mult）
    a.satiety = clamp(a.satiety - sp.satiety.drain_per_tick * getModifier(a, 'satiety_drain_mult'), 0, 100);

    // 体重成长（牛/羊草饲、鸡虫子；猪长肉已在上方饲料分支）
    tickWeight(a, sp);

    // 生态影响：踩踏 / 污染（羊）
    if (sp.ecosystem_impact) {
      zone.compaction = clamp(zone.compaction + sp.ecosystem_impact.trample_per_tick * getModifier(a, 'trample_mult'), 0, 100);
      if (sp.ecosystem_impact.pollution_pct_per_tick > 0) {
        zone.pollution = clamp(zone.pollution + sp.ecosystem_impact.pollution_pct_per_tick * getModifier(a, 'pollution_rate_mult'), 0, 100);
      }
    }

    // 疾病扣血
    tickDisease(a, zone.pollution);

    // 年龄
    a.age_ticks = (a.age_ticks || 0) + 1;

    // 产出冷却递减
    for (var k in a.cooldowns) {
      if (a.cooldowns[k] > 0) a.cooldowns[k]--;
    }

    // 产后冷却递减
    if ((a.reproduction_cooldown || 0) > 0) a.reproduction_cooldown--;

    // 怀孕推进
    if (a.pregnant) {
      a.pregnant.remaining_ticks--;
      if (a.pregnant.remaining_ticks <= 0) {
        giveBirth(st, a, sp, births);
        a.pregnant = null;
      }
    } else {
      // 受孕判定（成年母畜 + 同区公畜 + 条件满足）
      tryReproduce(st, a, sp);
    }
  }

  function tryReproduce(st, a, sp) {
    if (!sp.reproduction) return;
    if (a.gender !== 'female' && a.gender !== 'hermaphrodite') return;
    if (sp.growth.maturity_ticks != null && (a.age_ticks || 0) < sp.growth.maturity_ticks) return;
    if (a.pregnant) return;
    if ((a.reproduction_cooldown || 0) > 0) return;
    if (a.hp <= 90) return;
    var zone = st.zones[a.zone_id];
    if (!zone || zone.pollution >= 30) return;
    var hasMale = st.animals.some(function (other) {
      if (other.dead || other.uid === a.uid) return false;
      if (other.species_id !== a.species_id) return false;
      if (other.location_type !== 'zone' || other.zone_id !== a.zone_id) return false;
      if (other.gender !== 'male' && other.gender !== 'hermaphrodite') return false;
      if (sp.growth.maturity_ticks != null && (other.age_ticks || 0) < sp.growth.maturity_ticks) return false;
      if (other.hp <= 90) return false;
      return true;
    });
    if (!hasMale) return;
    // 找同区公畜作为父本（遗传用）
    var father = null;
    for (var fi = 0; fi < st.animals.length; fi++) {
      var cand = st.animals[fi];
      if (cand.dead || cand.uid === a.uid || cand.species_id !== a.species_id) continue;
      if (cand.location_type !== 'zone' || cand.zone_id !== a.zone_id) continue;
      if (cand.gender !== 'male' && cand.gender !== 'hermaphrodite') continue;
      if (sp.growth.maturity_ticks != null && (cand.age_ticks || 0) < sp.growth.maturity_ticks) continue;
      if (cand.hp <= 90) continue;
      father = cand;
      break;
    }
    if (!father) return;
    var pregRate = (sp.reproduction.base_pregnancy_rate_per_tick || 0.0002) * getModifier(a, 'fertility_mult');
    if (Math.random() < pregRate) {
      a.pregnant = { father_uid: father.uid, remaining_ticks: sp.reproduction.pregnancy_ticks };
    }
  }

  function tickCoopAnimal(st, a, sp) {
    // 鸡笼动物：鸡不吃草、不受区域疾病；吃虫子（鸡笼清污）+ 长肉 + 寿命
    var zones = (st.arm_zones && st.arm_zones[a.arm_id]) || [];
    // 鸡笼清污：每鸡每 tick 降污 7%/1000 = 0.007%，作用于该臂夹持两区
    for (var i = 0; i < zones.length; i++) {
      var z = st.zones[zones[i]];
      if (!z) continue;
      z.pollution = clamp(z.pollution - 0.007, 0, 100);
      // 吃虫子恢复饱腹（污染充足时）
      if (z.pollution > 0) {
        a.satiety = clamp(a.satiety + 0.02, 0, 100);
      }
    }
    a.satiety = clamp(a.satiety - sp.satiety.drain_per_tick * getModifier(a, 'satiety_drain_mult'), 0, 100);
    tickWeight(a, sp);
    a.age_ticks = (a.age_ticks || 0) + 1;
    // 鸡寿命：15000 tick 自然死亡
    if (sp.lifespan_ticks && a.age_ticks >= sp.lifespan_ticks) {
      a.dead = true;
      a.death_cause = 'old';
    }
    for (var k in a.cooldowns) {
      if (a.cooldowns[k] > 0) a.cooldowns[k]--;
    }
  }

  function tickWeight(a, sp) {
    var g = sp.growth;
    var growthMult = getModifier(a, 'growth_rate_mult');
    if (g.graze_growth_rate_kg_per_tick != null) {
      var cap = g.graze_cap_kg != null ? g.graze_cap_kg : g.fatten_cap_kg;
      if (a.satiety > g.satiety_grow_threshold) {
        if (a.weight_kg < cap) a.weight_kg = Math.min(cap, a.weight_kg + g.graze_growth_rate_kg_per_tick * growthMult);
      } else if (a.satiety < g.satiety_stall_threshold) {
        a.weight_kg = Math.max(g.birth_weight_kg, a.weight_kg - g.graze_growth_rate_kg_per_tick);
      }
    }
    // 猪长肉已在 tickAnimal 的饲料分支处理（真实消耗饲料槽饲料）
    if (a.species_id === 'chicken' && a.satiety > 70) {
      if (a.weight_kg < g.fatten_cap_kg) a.weight_kg = Math.min(g.fatten_cap_kg, a.weight_kg + 0.00063 * growthMult);
    }
  }

  function tickDisease(a, pollution) {
    var drain = 0;
    if (pollution < 30) drain = 0;
    else if (pollution < 50) drain = 0.01;
    else if (pollution < 70) drain = 0.02;
    else if (pollution < 90) drain = 0.03;
    else drain = 0.05;
    if (drain > 0) {
      a.hp = clamp(a.hp - drain * getModifier(a, 'disease_resist_mult'), 0, 100);
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'disease'; }
    } else if (pollution < 30 && a.satiety > 70) {
      a.hp = clamp(a.hp + 0.02, 0, 100);
    }
  }

  function giveBirth(st, mother, sp, births) {
    if (!sp.reproduction) return;
    var father = null;
    if (mother.pregnant && mother.pregnant.father_uid) {
      for (var f = 0; f < st.animals.length; f++) {
        if (st.animals[f].uid === mother.pregnant.father_uid) { father = st.animals[f]; break; }
      }
    }
    var litter = randInt(sp.reproduction.litter_size[0], sp.reproduction.litter_size[1]);
    var inherited = inheritPerks(father ? father.perks : [], mother.perks || []);
    for (var i = 0; i < litter; i++) {
      var calf = makeAnimal(
        mother.species_id,
        Math.random() < 0.5 ? 'male' : 'female',
        'zone',
        mother.zone_id,
        { weight_kg: sp.growth.birth_weight_kg, age_ticks: 0, satiety: 80, perks: inherited.slice() }
      );
      births.push(calf);
    }
    // 产后冷却（= 产后冷却 tick）
    mother.reproduction_cooldown = sp.reproduction.postpartum_cooldown_ticks || 0;
  }

  window.LivestockState = {
    setConfig: setConfig,
    initDemoState: initDemoState,
    ensureState: ensureState,
    getState: getState,
    setState: setState,
    getSpecies: getSpecies,
    getModule: getModule,
    getPerk: getPerk,
    allSpecies: allSpecies,
    allModules: allModules,
    allPerks: allPerks,
    moveAnimal: moveAnimal,
    animalsInZone: animalsInZone,
    animalsInCoop: animalsInCoop,
    collectProduct: collectProduct,
    slaughterAnimal: slaughterAnimal,
    buildModule: buildModule,
    dismountModule: dismountModule,
    startUpgrade: startUpgrade,
    canBuildModule: canBuildModule,
    getBuildStep: getBuildStep,
    expandModuleSlots: expandModuleSlots,
    findTroughForZone: findTroughForZone,
    addFeedToTrough: addFeedToTrough,
    getCropNutrition: getCropNutrition,
    getModifier: getModifier,
    rollPerks: rollPerks,
    cleanZone: cleanZone,
    tillZone: tillZone,
    feedChickens: feedChickens,
    advanceTick: advanceTick
  };
})();

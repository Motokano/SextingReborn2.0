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

  // 机制类 Perk 判定（§8.4）：跨种不生效但保留
  function hasPerk(animal, perkId) {
    if (!animal || !Array.isArray(animal.perks) || animal.perks.indexOf(perkId) < 0) return false;
    var pdef = getPerk(perkId);
    if (!pdef) return false;
    if (pdef.species && pdef.species.indexOf(animal.species_id) < 0) return false;
    if (pdef.requires && pdef.requires.gender && animal.gender !== pdef.requires.gender) return false;
    return true;
  }

  // §8.4 相邻区：与某区共享机械臂的所有其他区（如 z1 ↔ arm1(z1,z2) ↔ z2、arm4(z4,z1) ↔ z4）
  function adjacentZones(st, zoneId) {
    var out = [];
    var az = st.arm_zones || {};
    for (var ak in az) {
      var zs = az[ak];
      if (!Array.isArray(zs) || zs.indexOf(zoneId) < 0) continue;
      for (var i = 0; i < zs.length; i++) {
        if (zs[i] !== zoneId && out.indexOf(zs[i]) < 0) out.push(zs[i]);
      }
    }
    return out;
  }

  function isMature(a, sp) {
    return !(sp.growth && sp.growth.maturity_ticks != null && (a.age_ticks || 0) < sp.growth.maturity_ticks);
  }

  // §8.4 标准怀孕条件（不含性别/公畜存在性）
  function canConceive(a, sp, zone) {
    if (!sp.reproduction) return false;
    if (a.pregnant) return false;
    if ((a.reproduction_cooldown || 0) > 0) return false;
    if (a.hp <= 90) return false;
    if (!isMature(a, sp)) return false;
    if (zone && zone.pollution >= 30) return false;
    return true;
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
      death_cause: null,
      starvation_ticks: 0,
      earth_cry_cooldown: 0,
      crossbreed_cooldown: 0,
      pheromone_cooldown: 0
    };
    return a;
  }

  function initDemoState() {
    // 空牧场开局（§8.7 初始不赠送动物）：无模块、无动物、生态全净、草长满
    var arms = {
      arm1: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
      arm2: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
      arm3: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
      arm4: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null }
    };

    state = {
      rotation_ticks_remaining: 862,
      rotation_total_ticks: 1000,
      zones: {
        z1: { grass_height: 1.5, compaction: 0, pollution: 0 },
        z2: { grass_height: 1.5, compaction: 0, pollution: 0 },
        z3: { grass_height: 1.5, compaction: 0, pollution: 0 },
        z4: { grass_height: 1.5, compaction: 0, pollution: 0 }
      },
      arm_zones: {
        arm1: ['z1', 'z2'],
        arm2: ['z2', 'z3'],
        arm3: ['z3', 'z4'],
        arm4: ['z4', 'z1']
      },
      arms: arms,
      axis: { slot1: null, slot2: null },
      animals: []
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
    // 防御：zones 缺省/坏项兜底（损坏档健壮性）
    if (!incoming.zones || typeof incoming.zones !== 'object') {
      incoming.zones = { z1: { grass_height: 1.5, compaction: 0, pollution: 0 }, z2: { grass_height: 1.5, compaction: 0, pollution: 0 }, z3: { grass_height: 1.5, compaction: 0, pollution: 0 }, z4: { grass_height: 1.5, compaction: 0, pollution: 0 } };
    }
    for (var zn in incoming.zones) {
      var zc = incoming.zones[zn];
      if (!zc || typeof zc !== 'object') incoming.zones[zn] = { grass_height: 1.5, compaction: 0, pollution: 0 };
    }
    // 防御：animals 非数组/含 null 项过滤
    if (!Array.isArray(incoming.animals)) incoming.animals = [];
    incoming.animals = incoming.animals.filter(function (a) { return a && typeof a === 'object'; });
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
        if (a.starvation_ticks == null) a.starvation_ticks = 0;
        if (a.earth_cry_cooldown == null) a.earth_cry_cooldown = 0;
        if (a.crossbreed_cooldown == null) a.crossbreed_cooldown = 0;
        if (a.pheromone_cooldown == null) a.pheromone_cooldown = 0;
        if (!a.cooldowns) a.cooldowns = {};
        if (a.reproduction_cooldown == null) a.reproduction_cooldown = 0;
        // 防御：pregnant 必须是对象或 null（损坏档兜底）
        if (a.pregnant != null && (typeof a.pregnant !== 'object' || Array.isArray(a.pregnant))) a.pregnant = null;
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
  // cooldownMult（可选）：模块冷却减免，如 0.95 = 冷却 -5%
  function collectProduct(uid, productId, cooldownMult) {
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
    var cm = (cooldownMult != null && cooldownMult > 0) ? cooldownMult : 1;
    a.cooldowns[productId] = Math.round(prod.cooldown_ticks * getModifier(a, 'product_cooldown_mult_' + productId) * cm);
    if (prod.hp_cost > 0) {
      a.hp = clamp(a.hp - prod.hp_cost, 0, 100);
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'blood_loss'; }
    }
    return { ok: true, item_id: prod.item_id, count: 1 };
  }

  // 屠宰动物，产出肉/器官/副产物。返回 { ok, items:[{item_id,count}], reason? }
  function slaughterAnimal(uid) {
    var st = ensureState();
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
    // 屠宰即清（§3.3）：正常屠宰已即时产出肉皮骨，尸体不留场
    var idx = st.animals.indexOf(a);
    if (idx >= 0) st.animals.splice(idx, 1);
    return { ok: true, items: items };
  }

  // 清理尸体（病死/饿死/失血/老死），返回 { ok, cause? }
  function cleanCorpse(uid) {
    var st = ensureState();
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (a.uid === uid && a.dead) {
        var cause = a.death_cause || 'unknown';
        st.animals.splice(i, 1);
        return { ok: true, cause: cause };
      }
    }
    return { ok: false, reason: 'not_found' };
  }

  /* ================= 饲料 ================= */

  function getCropNutrition(itemId) {
    return FEED_CROPS[itemId] != null ? Number(FEED_CROPS[itemId]) : null;
  }

  // 找投喂某区域的饲料槽（装在 cw_side，面朝该区）
  function findTroughForZone(zoneId) {
    var st = ensureState();
    var zone = st.zones[zoneId];
    for (var ak in st.arms) {
      var arm = st.arms[ak];
      var trough = arm && arm.cw_side;
      if (!trough || isShadowSlot(trough) || getSlotModuleId(trough) !== 'feed_trough') continue;
      var zones = (st.arm_zones && st.arm_zones[ak]) || [];
      // 面朝区域 = arm_zones 第二个
      if (zones[1] === zoneId) return trough;
    }
    // 联动（§11.5.1 grass_feed）：草高 >1.0 时切换投喂优先级——该区动物可吃任意面朝区槽
    if (zone && zone._feed_priority) {
      for (var ak2 in st.arms) {
        var arm2 = st.arms[ak2];
        var t2 = arm2 && arm2.cw_side;
        if (!t2 || isShadowSlot(t2) || getSlotModuleId(t2) !== 'feed_trough') continue;
        if (t2.feed_units > 0) return t2;
      }
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

  /* ================= 模块效果（§11.4 数值） ================= */

  var MODULE_EFFECTS = {
    sprinkler:    { growth: [0.15, 0.20, 0.25, 0.30, 0.40], decompact: [0, 0, 0.002, 0, 0.004] },
    clean_brush:  { per_round: [3, 4, 5, 6, 8] },
    tiller:       { per_tick: [0.04, 0.05, 0.06, 0.08, 0.10] },
    seeder:       { threshold: [0.3, 0.4, 0.4, 0.5, 0.5], growth: [0.50, 0.50, 0.75, 0.75, 1.00] },
    manure_net:   { sheep_reduce: [0.50, 0.55, 0.60, 0.65, 0.75], trample_reduce: [0, 0, 0, 0.10, 0.15] },
    pasture_arm:  { per_tick: [0.04, 0.05, 0.06, 0.08, 0.10], growth: [0.20, 0.25, 0.30, 0.35, 0.40], seed_growth: [0.50, 0.50, 0.75, 0.75, 1.00], seed_threshold: 0.4 },
    clinic_arm:   { heal: [0.01, 0.02, 0.03, 0.05, 0.08], count: [2, 3, 4, 5, 6] },
    auto_collect: { cooldown_mult: [1.00, 0.95, 0.90, 0.85, 0.80], clean_corpse: [false, false, false, true, true] },
    warehouse_hub: { capacity: [50, 80, 120, 160, 200] },
    // 饲料预处理（§10.3/§11.3.2）：投入作物 → 标准饲料自动入同臂槽（营养值÷10 = 单位）
    feed_preprocess: { transfer_units_per_tick: [0.5, 0.75, 1.0, 1.5, 2.0] },
    // 饲料精加工臂（§11.4）：预处理 + 自动补槽 + 精加工倍率
    feed_refine: { refine_mult: [1.2, 1.25, 1.3, 1.35, 1.4], cache_capacity: [0, 0, 0, 0, 50] },
    // 气候调控塔（§11.6.2）：三模式全局（模式在实例 mode 字段）
    climate_control: {
      sunny:    { grass: 0.25, satiety: 0.20 },
      shade:    { grass: -0.15, satiety: -0.20 },
      humid:    { pollution_clean: 0.01, compaction_up: 0.003 }
    },
    // 联动作业臂（§11.5.1）：调度点数/轮
    link_schedule: { dispatch_points: [2, 2, 3, 3, 4], rules_enabled: [1, 2, 2, 2, 2] },
    // 废热回收臂（§11.5.2）：转化率（按模式）
    waste_heat_recycle: { convert_rate: [0.20, 0.20, 0.25, 0.25, 0.35] }
  };

  function healAnimalsInZones(st, zoneList, heal, count) {
    var candidates = [];
    st.animals.forEach(function (a) {
      if (a.dead || a.location_type !== 'zone') return;
      var z = st.zones[a.zone_id];
      if (z && zoneList.indexOf(z) >= 0 && a.hp < 100) candidates.push(a);
    });
    candidates.sort(function (a, b) { return a.hp - b.hp; });
    for (var i = 0; i < Math.min(count, candidates.length); i++) {
      candidates[i].hp = clamp(candidates[i].hp + heal, 0, 100);
    }
  }

  function t(key, vars) {
    if (global && global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key, vars);
    return key;
  }

  // 模块效果文案（供面板展示；数值与 MODULE_EFFECTS 一一对应）
  function getModuleEffectText(moduleId, level) {
    var eff = MODULE_EFFECTS[moduleId];
    if (!eff) return '';
    var lv = clamp(level || 1, 1, 5);
    var idx = lv - 1;
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var arr = function (a) { return a[idx]; };
    if (moduleId === 'sprinkler') {
      var parts = [t('livestock.effect.grass_growth', { v: pct(arr(eff.growth)) })];
      if (arr(eff.decompact) > 0) parts.push(t('livestock.effect.decompact', { v: (arr(eff.decompact) * 1000).toFixed(0) }));
      return parts.join('；');
    }
    if (moduleId === 'clean_brush') {
      return t('livestock.effect.clean_brush', { v: (arr(eff.per_round) / 10).toFixed(1) });
    }
    if (moduleId === 'tiller') {
      return t('livestock.effect.tiller', { v: (arr(eff.per_tick) * 100).toFixed(0) });
    }
    if (moduleId === 'seeder') {
      return t('livestock.effect.seeder', { threshold: pct(arr(eff.threshold)), v: pct(arr(eff.growth)) });
    }
    if (moduleId === 'manure_net') {
      var mp = [t('livestock.effect.sheep_reduce', { v: pct(arr(eff.sheep_reduce)) })];
      if (arr(eff.trample_reduce) > 0) mp.push(t('livestock.effect.trample_reduce', { v: pct(arr(eff.trample_reduce)) }));
      return mp.join('；');
    }
    if (moduleId === 'pasture_arm') {
      var pp = [t('livestock.effect.tiller', { v: (arr(eff.per_tick) * 100).toFixed(0) }), t('livestock.effect.grass_growth', { v: pct(arr(eff.growth)) })];
      pp.push(t('livestock.effect.seeder', { threshold: pct(eff.seed_threshold), v: pct(arr(eff.seed_growth)) }));
      return pp.join('；');
    }
    if (moduleId === 'clinic_arm') {
      return t('livestock.effect.clinic', { v: (arr(eff.heal) * 100).toFixed(0), n: arr(eff.count) });
    }
    if (moduleId === 'auto_collect') {
      var ap = [t('livestock.effect.auto_collect')];
      if (arr(eff.cooldown_mult) < 1) ap.push(t('livestock.effect.cooldown_reduce', { v: Math.round((1 - arr(eff.cooldown_mult)) * 100) }));
      if (arr(eff.clean_corpse)) ap.push(t('livestock.effect.auto_clean_corpse'));
      return ap.join('；');
    }
    if (moduleId === 'warehouse_hub') {
      return t('livestock.effect.warehouse_hub', { v: arr(eff.capacity) });
    }
    if (moduleId === 'feed_preprocess') {
      return t('livestock.effect.feed_preprocess');
    }
    if (moduleId === 'feed_refine') {
      var fp = [t('livestock.effect.refine', { v: arr(eff.refine_mult).toFixed(2).replace(/0$/, '') })];
      if (arr(eff.cache_capacity) > 0) fp.push(t('livestock.effect.cache_priority', { v: arr(eff.cache_capacity) }));
      return fp.join('；');
    }
    if (moduleId === 'climate_control') {
      return t('livestock.effect.climate_control');
    }
    if (moduleId === 'link_schedule') {
      return t('livestock.effect.link_schedule', { v: arr(eff.dispatch_points), n: arr(eff.rules_enabled) });
    }
    if (moduleId === 'waste_heat_recycle') {
      return t('livestock.effect.waste_heat', { v: Math.round(arr(eff.convert_rate) * 100) });
    }
    return '';
  }

  // 每 tick 结算模块效果：作用于该臂夹持两区（通过 zone 临时字段传递）
  function tickModules(st) {
    for (var ak in st.arms) {
      var arm = st.arms[ak];
      if (!arm || typeof arm !== 'object') continue;
      var zones = (st.arm_zones && st.arm_zones[ak]) || [];
      var zoneList = [];
      for (var zi = 0; zi < zones.length; zi++) {
        var z = st.zones[zones[zi]];
        if (z) zoneList.push(z);
      }
      if (!zoneList.length) continue;

      var growthBonus = 0, decompact = 0, cleanPerTick = 0;
      var seedThreshold = null, seedGrowth = 0;
      var sheepReduce = 0, trampleReduce = 0;
      var clinicHeal = 0, clinicCount = 0;
      var autoCollectActive = false, autoCdMult = 1, autoCleanCorpse = false;

      var mods = [arm.inner, arm.front, arm.bottom, arm.top, arm.cw_side, arm.ccw_side];
      for (var mi = 0; mi < mods.length; mi++) {
        var inst = mods[mi];
        if (!inst || inst.shadow || !inst.module_id) continue;
        var mid = inst.module_id;
        var lv = Math.max(1, Math.min(5, inst.level || 1));
        var idx = lv - 1;
        var eff = MODULE_EFFECTS[mid];
        if (!eff) continue;
        if (mid === 'sprinkler') {
          growthBonus += eff.growth[idx];
          decompact += eff.decompact[idx] || 0;
        } else if (mid === 'clean_brush') {
          cleanPerTick += eff.per_round[idx] / 1000;
        } else if (mid === 'tiller') {
          decompact += eff.per_tick[idx];
        } else if (mid === 'seeder') {
          seedThreshold = Math.max(seedThreshold || 0, eff.threshold[idx]);
          seedGrowth = Math.max(seedGrowth, eff.growth[idx]);
        } else if (mid === 'manure_net') {
          sheepReduce = Math.max(sheepReduce, eff.sheep_reduce[idx]);
          trampleReduce = Math.max(trampleReduce, eff.trample_reduce[idx]);
        } else if (mid === 'pasture_arm') {
          decompact += eff.per_tick[idx];
          growthBonus += eff.growth[idx];
          seedThreshold = Math.max(seedThreshold || 0, eff.seed_threshold);
          seedGrowth = Math.max(seedGrowth, eff.seed_growth[idx]);
        } else if (mid === 'clinic_arm') {
          clinicHeal = Math.max(clinicHeal, eff.heal[idx]);
          clinicCount = Math.max(clinicCount, eff.count[idx]);
        } else if (mid === 'auto_collect') {
          // 多臂多采集臂取最优（冷却减免最小 / 清尸能力）
          autoCollectActive = true;
          autoCdMult = Math.min(autoCdMult, eff.cooldown_mult[idx] || 1);
          if (eff.clean_corpse && eff.clean_corpse[idx]) autoCleanCorpse = true;
        } else if (mid === 'feed_preprocess') {
          // 饲料预处理（§10.3）：作物 → 标准饲料自动入同臂槽
          tickFeedProcessing(st, inst, 1);
        } else if (mid === 'feed_refine') {
          // 饲料精加工臂（§11.4）：倍率加工 + 自动补槽
          var rmult = eff.refine_mult[idx] || 1.2;
          tickFeedProcessing(st, inst, rmult);
          // Lv4 自动补相邻臂的饲料槽（向同臂之外的所有槽匀补精加工缓存）
          if (lv >= 4 && inst.refine_cache > 0) {
            for (var oak in st.arms) {
              var oarm = st.arms[oak];
              var otrough = findTroughOnArm(oarm);
              if (otrough && otrough !== findTroughOnArm(arm)) {
                var give = Math.min(inst.refine_cache, 1);
                inst.refine_cache -= give;
                addUnitsToTrough(otrough, give);
                if (inst.refine_cache <= 0) break;
              }
            }
          }
        }
      }

      zoneList.forEach(function (z) {
        if (decompact > 0) z.compaction = clamp(z.compaction - decompact, 0, 100);
        if (cleanPerTick > 0) z.pollution = clamp(z.pollution - cleanPerTick, 0, 100);
        z._mg = (z._mg || 1) * (1 + growthBonus);
        if (seedThreshold != null && z.grass_height != null && z.grass_height < seedThreshold) {
          z._mg = z._mg * (1 + seedGrowth);
        }
        if (sheepReduce > 0) z._sr = Math.max(z._sr || 0, sheepReduce);
        if (trampleReduce > 0) z._tr = Math.max(z._tr || 0, trampleReduce);
      });
      if (clinicHeal > 0) healAnimalsInZones(st, zoneList, clinicHeal, clinicCount);

      // 手动采集臂（§11.4）：自动收割夹持两区冷却完毕的活体产物；Lv4+ 自动清尸
      if (autoCollectActive) {
        // 有中央仓储枢纽（§11.6.1）时产物入轴心缓存，否则进背包队列
        var hasHub = !!getWarehouseHub();
        st.pending_auto_items = st.pending_auto_items || [];
        // 自动采集（不给经验，§9.3 只给手动）
        st.animals.forEach(function (a) {
          if (a.dead || a.location_type !== 'zone') return;
          if (zones.indexOf(a.zone_id) < 0) return;
          var asp = getSpecies(a.species_id);
          if (!asp || !asp.products || !asp.products.living) return;
          asp.products.living.forEach(function (p) {
            var r = collectProduct(a.uid, p.product_id, autoCdMult);
            if (r.ok) {
              if (hasHub) {
                warehouseAdd(r.item_id);
              } else {
                st.pending_auto_items.push({ item_id: r.item_id, count: r.count, uid: a.uid });
              }
            }
          });
        });
        // Lv4+ 自动清尸（§9.3 不给经验，尸体直接移除）
        if (autoCleanCorpse) {
          for (var ci = st.animals.length - 1; ci >= 0; ci--) {
            var c = st.animals[ci];
            if (c.dead && c.location_type === 'zone' && zones.indexOf(c.zone_id) >= 0) {
              st.animals.splice(ci, 1);
            }
          }
        }
      }
    }
  }

  function clearModuleTempFields() {
    var st = ensureState();
    for (var zid in st.zones) {
      var z = st.zones[zid];
      if (z._mg != null) delete z._mg;
      if (z._sr != null) delete z._sr;
      if (z._tr != null) delete z._tr;
      if (z._seed_once != null) delete z._seed_once;
      if (z._feed_priority != null) delete z._feed_priority;
    }
  }

  // 取出并清空自动采集队列（手动采集臂产出，场景层消费发背包）
  function drainAutoCollectItems() {
    var st = ensureState();
    var out = Array.isArray(st.pending_auto_items) ? st.pending_auto_items : [];
    st.pending_auto_items = [];
    return out;
  }

  // 轴心位2 的中央仓储枢纽实例（§11.6.1）；未装返回 null
  function getWarehouseHub() {
    var st = ensureState();
    var axis = st.axis || {};
    var inst = axis.slot2;
    if (!inst || isShadowSlot(inst) || inst.module_id !== 'warehouse_hub') return null;
    if (!inst.cache || typeof inst.cache !== 'object') inst.cache = { items: {}, capacity: undefined };
    return inst;
  }

  // 仓储缓存容量（按等级；未装返回 0）
  function getWarehouseCapacity() {
    var hub = getWarehouseHub();
    if (!hub) return 0;
    var lv = Math.max(1, Math.min(5, hub.level || 1));
    var eff = MODULE_EFFECTS.warehouse_hub;
    return (eff && eff.capacity[lv - 1]) || 50;
  }

  // 仓储当前占用（格数，每种产物 1 格）
  function getWarehouseUsage() {
    var hub = getWarehouseHub();
    if (!hub || !hub.cache || !hub.cache.items) return 0;
    return Object.keys(hub.cache.items).length;
  }

  // 产物入缓存（有仓储枢纽时）；满则返回 false（产物仍走背包）
  function warehouseAdd(itemId) {
    var hub = getWarehouseHub();
    if (!hub || !hub.cache) return false;
    var cap = getWarehouseCapacity();
    if (getWarehouseUsage() >= cap) return false;
    var items = hub.cache.items;
    if (items[itemId] == null) items[itemId] = 0;
    items[itemId]++;
    return true;
  }

  // 找某臂上的饲料槽实例（cw/ccw_side）
  function findTroughOnArm(arm) {
    if (!arm) return null;
    var t = arm.cw_side;
    if (t && !isShadowSlot(t) && getSlotModuleId(t) === 'feed_trough') return t;
    t = arm.ccw_side;
    if (t && !isShadowSlot(t) && getSlotModuleId(t) === 'feed_trough') return t;
    return null;
  }

  // 向饲料槽补单位（返回实际补入量）
  function addUnitsToTrough(trough, units) {
    if (!trough) return 0;
    if (trough.feed_units == null) trough.feed_units = 0;
    var before = trough.feed_units;
    trough.feed_units = clamp(trough.feed_units + units, 0, 100);
    return trough.feed_units - before;
  }

  // 投入作物到预处理/精加工臂：消耗玩家背包作物，入加工队列（§10.3）
  // 返回 { ok, added_units?, reason? }
  function feedProcessInput(armId, cropItemId, count) {
    var st = ensureState();
    var arm = st.arms[armId];
    var inst = null;
    if (arm) {
      for (var s = 0; s < ARM_SLOT_KEYS.length; s++) {
        var sl = arm[ARM_SLOT_KEYS[s]];
        if (sl && !isShadowSlot(sl) && (sl.module_id === 'feed_preprocess' || sl.module_id === 'feed_refine')) { inst = sl; break; }
      }
    }
    if (!inst) return { ok: false, reason: 'no_processor' };
    var nut = getCropNutrition(cropItemId);
    if (nut == null) return { ok: false, reason: 'not_feed_crop' };
    var c = Math.max(1, Math.floor(Number(count) || 1));
    var IE = window.InventoryEquipment;
    if (!IE || typeof IE.takeItemFromDefaultContainer !== 'function') return { ok: false, reason: 'no_inventory' };
    var removed = 0;
    for (var i = 0; i < c; i++) {
      var r = IE.takeItemFromDefaultContainer(cropItemId, 1);
      if (r && r.success) removed++;
      else break;
    }
    if (removed <= 0) return { ok: false, reason: 'not_enough_crop' };
    if (!inst.input_queue) inst.input_queue = [];
    // 同类作物合并队列项
    var merged = null;
    for (var qi = 0; qi < inst.input_queue.length; qi++) {
      if (inst.input_queue[qi].item_id === cropItemId && inst.input_queue[qi].nutrition === nut) { merged = inst.input_queue[qi]; break; }
    }
    if (merged) merged.count += removed;
    else inst.input_queue.push({ item_id: cropItemId, nutrition: nut, count: removed });
    return { ok: true, added: removed };
  }

  // 每 tick 加工队列 → 标准饲料入槽（预处理/精加工共用；refine 有倍率）
  function tickFeedProcessing(st, inst, refineMult) {
    if (!inst || !inst.input_queue || !inst.input_queue.length) return;
    var arm = findArmForModuleInstance(st, inst);
    var trough = arm ? findTroughOnArm(arm) : null;
    // 精加工 Lv5：可缓存 50 单位（优先入缓存，缓存满再入槽）
    var cacheCap = 0;
    var eff = MODULE_EFFECTS.feed_refine;
    if (inst.module_id === 'feed_refine' && eff) {
      cacheCap = eff.cache_capacity[Math.max(0, Math.min(4, (inst.level || 1) - 1))] || 0;
    }
    if (!inst.refine_cache) inst.refine_cache = 0;
    var mult = refineMult || 1;
    var q = inst.input_queue[0];
    // 单 tick 处理 1 个作物 → nutrition÷10 × mult 单位
    var units = (q.nutrition / 10) * mult;
    q.count--;
    if (q.count <= 0) inst.input_queue.shift();
    var left = units;
    if (cacheCap > 0 && inst.refine_cache < cacheCap) {
      var intoCache = Math.min(left, cacheCap - inst.refine_cache);
      inst.refine_cache += intoCache;
      left -= intoCache;
    }
    if (left > 0 && trough) {
      addUnitsToTrough(trough, left);
    }
  }

  function findArmForModuleInstance(st, targetInst) {
    for (var ak in st.arms) {
      var arm = st.arms[ak];
      if (!arm || typeof arm !== 'object') continue;
      for (var s = 0; s < ARM_SLOT_KEYS.length; s++) {
        if (arm[ARM_SLOT_KEYS[s]] === targetInst) return arm;
      }
    }
    return null;
  }

  // 轴心位2 的气候调控塔实例（§11.6.2）；未装返回 null
  function getClimateControl() {
    var st = ensureState();
    var axis = st.axis || {};
    var inst = axis.slot2;
    if (!inst || isShadowSlot(inst) || inst.module_id !== 'climate_control') return null;
    if (inst.mode == null) inst.mode = 'off';
    if (inst.mode_switch_cooldown == null) inst.mode_switch_cooldown = 0;
    return inst;
  }

  // 切换气候模式（§11.6.2）：晴朗/阴凉/湿润/关闭；冷却 2000 tick（Lv3 1500 / Lv5 1000）
  function climateSetMode(mode) {
    var inst = getClimateControl();
    if (!inst) return { ok: false, reason: 'no_climate_tower' };
    if (mode === inst.mode) return { ok: true, mode: mode };
    if ((inst.mode_switch_cooldown || 0) > 0) {
      return { ok: false, reason: 'cooldown', remaining: inst.mode_switch_cooldown };
    }
    var lv = Math.max(1, Math.min(5, inst.level || 1));
    // 模式解锁：Lv1 晴+阴；Lv2 湿润
    if (mode === 'humid' && lv < 2) return { ok: false, reason: 'locked', need_level: 2 };
    if (mode !== 'off' && mode !== 'sunny' && mode !== 'shade' && mode !== 'humid') {
      return { ok: false, reason: 'unknown_mode' };
    }
    inst.mode = mode;
    var cd = lv >= 5 ? 1000 : (lv >= 3 ? 1500 : 2000);
    inst.mode_switch_cooldown = cd;
    return { ok: true, mode: mode, cooldown: cd };
  }

  // 当前气候修正（供 tick 应用）：返回 { grassMult, satietyMult, pollutionClean, compactionUp }
  function getClimateModifiers() {
    var inst = getClimateControl();
    if (!inst || !inst.mode || inst.mode === 'off') {
      return { grassMult: 1, satietyMult: 1, pollutionClean: 0, compactionUp: 0 };
    }
    var eff = MODULE_EFFECTS.climate_control;
    var cfg = eff && eff[inst.mode];
    if (!cfg) return { grassMult: 1, satietyMult: 1, pollutionClean: 0, compactionUp: 0 };
    var lv = Math.max(1, Math.min(5, inst.level || 1));
    // Lv4 效果强度 +50%（增益和代价同步）
    var k = lv >= 4 ? 1.5 : 1;
    return {
      grassMult: 1 + (cfg.grass || 0) * k,
      satietyMult: 1 + (cfg.satiety || 0) * k,
      pollutionClean: (cfg.pollution_clean || 0) * k,
      compactionUp: (cfg.compaction_up || 0) * k
    };
  }

  // 废热回收臂实例（§11.5.2）；未装返回 null
  function getWasteHeatRecycle() {
    var st = ensureState();
    for (var ak in st.arms) {
      var arm = st.arms[ak];
      if (!arm || typeof arm !== 'object') continue;
      for (var s = 0; s < ARM_SLOT_KEYS.length; s++) {
        var sl = arm[ARM_SLOT_KEYS[s]];
        if (sl && !isShadowSlot(sl) && sl.module_id === 'waste_heat_recycle') return sl;
      }
    }
    return null;
  }

  // 切换废热回收模式（§11.5.2）：肥料/燃料/饲料；冷却 500 tick；Lv2 燃料 / Lv4 饲料
  function wasteHeatSetMode(mode) {
    var inst = getWasteHeatRecycle();
    if (!inst) return { ok: false, reason: 'no_heat_arm' };
    if (mode === inst.mode) return { ok: true, mode: mode };
    if ((inst.mode_switch_cooldown || 0) > 0) {
      return { ok: false, reason: 'cooldown', remaining: inst.mode_switch_cooldown };
    }
    var lv = Math.max(1, Math.min(5, inst.level || 1));
    if (mode === 'fuel' && lv < 2) return { ok: false, reason: 'locked', need_level: 2 };
    if (mode === 'feed' && lv < 4) return { ok: false, reason: 'locked', need_level: 4 };
    if (mode !== 'fertilizer' && mode !== 'fuel' && mode !== 'feed') {
      return { ok: false, reason: 'unknown_mode' };
    }
    inst.mode = mode;
    inst.mode_switch_cooldown = 500;
    return { ok: true, mode: mode };
  }

  // 废热回收产出映射
  function wasteHeatOutputItem(mode) {
    return mode === 'fuel' ? 'hus_biogas' : (mode === 'feed' ? 'hus_insect_powder' : 'fertilizer_basic');
  }

  // 每 tick 结算废热回收：全 tick 污染净下降量 × 转化率 = 资源点；100 点 = 1 份产出
  // 基线在 advanceTick 开头记录（st._waste_heat_baseline），覆盖鸡笼/猪/清污刷/手动/湿润等所有降污来源
  function tickWasteHeat(st) {
    var inst = getWasteHeatRecycle();
    if (!inst) return;
    if ((inst.mode_switch_cooldown || 0) > 0) inst.mode_switch_cooldown--;
    var lv = Math.max(1, Math.min(5, inst.level || 1));
    var eff = MODULE_EFFECTS.waste_heat_recycle;
    var rate = (eff && eff.convert_rate[lv - 1]) || 0.2;
    if (!inst.points) inst.points = 0;
    var drop = 0;
    var base = st._waste_heat_baseline || {};
    // 作用范围（§11.5.2）：Lv1-2 该臂夹持两区；Lv3+ 全四区（可回收相邻区域）
    var grasp = null;
    if (lv < 3) {
      var heatArm = null;
      for (var hak in st.arms) {
        var hArm = st.arms[hak];
        if (!hArm || typeof hArm !== 'object') continue;
        for (var hs = 0; hs < ARM_SLOT_KEYS.length; hs++) {
          var hsl = hArm[ARM_SLOT_KEYS[hs]];
          if (hsl && !isShadowSlot(hsl) && hsl.module_id === 'waste_heat_recycle') { heatArm = hArm; break; }
        }
        if (heatArm) { grasp = (st.arm_zones && st.arm_zones[hak]) || []; break; }
      }
    }
    for (var zid in st.zones) {
      if (grasp && grasp.indexOf(zid) < 0) continue;
      var b = base[zid] != null ? base[zid] : 0;
      var now = st.zones[zid].pollution || 0;
      if (now < b) drop += (b - now);
    }
    st._waste_heat_baseline = null;
    if (drop > 0) {
      inst.points += drop * 100 * rate; // 污染 1% = 100 点当量
    }
    if (!inst.output_queue) inst.output_queue = [];
    while (inst.points >= 100) {
      inst.points -= 100;
      inst.output_queue.push({ item_id: wasteHeatOutputItem(inst.mode || 'fertilizer'), count: 1 });
    }
  }

  // 提取废热回收产出
  function wasteHeatTakeAll() {
    var inst = getWasteHeatRecycle();
    if (!inst || !inst.output_queue || !inst.output_queue.length) return [];
    var out = inst.output_queue.slice();
    inst.output_queue = [];
    return out;
  }

  // 联动作业臂实例（§11.5.1）；未装返回 null
  function getLinkSchedule() {
    var st = ensureState();
    for (var ak in st.arms) {
      var arm = st.arms[ak];
      if (!arm || typeof arm !== 'object') continue;
      for (var s = 0; s < ARM_SLOT_KEYS.length; s++) {
        var sl = arm[ARM_SLOT_KEYS[s]];
        if (sl && !isShadowSlot(sl) && sl.module_id === 'link_schedule') {
          return { inst: sl, arm: arm, armId: ak };
        }
      }
    }
    return null;
  }

  // 切换联动规则启用（§11.5.1 Lv2+ 手动切换）：rules = ['till_seed','grass_feed','clean_collect']
  function linkScheduleToggleRule(ruleId) {
    var ls = getLinkSchedule();
    if (!ls) return { ok: false, reason: 'no_link_arm' };
    var lv = Math.max(1, Math.min(5, ls.inst.level || 1));
    var eff = MODULE_EFFECTS.link_schedule;
    var maxRules = (eff && eff.rules_enabled[lv - 1]) || 1;
    if (!ls.inst.enabled_rules) ls.inst.enabled_rules = [];
    if (ls.inst.enabled_rules.indexOf(ruleId) >= 0) {
      ls.inst.enabled_rules = ls.inst.enabled_rules.filter(function (r) { return r !== ruleId; });
      return { ok: true, enabled: ls.inst.enabled_rules };
    }
    if (ls.inst.enabled_rules.length >= maxRules) {
      return { ok: false, reason: 'rule_limit', limit: maxRules };
    }
    ls.inst.enabled_rules.push(ruleId);
    return { ok: true, enabled: ls.inst.enabled_rules.slice() };
  }

  // 每轮旋转前结算联动（§11.5.1）：调度点数/轮，检测夹持两区条件触发接力
  function tickLinkSchedule(st) {
    var ls = getLinkSchedule();
    if (!ls || !ls.inst || !ls.inst.enabled_rules || !ls.inst.enabled_rules.length) return;
    var lv = Math.max(1, Math.min(5, ls.inst.level || 1));
    var eff = MODULE_EFFECTS.link_schedule;
    if (ls.inst.dispatch == null) ls.inst.dispatch = (eff && eff.dispatch_points[lv - 1]) || 2;
    ls.inst.dispatch = (eff && eff.dispatch_points[lv - 1]) || 2; // 每轮重置
    var points = ls.inst.dispatch;
    var zones = (st.arm_zones && st.arm_zones[ls.armId]) || [];
    ls.inst.enabled_rules.forEach(function (ruleId) {
      if (points <= 0) return;
      var z = zones.length ? st.zones[zones[0]] : null;
      var z2 = zones.length > 1 ? st.zones[zones[1]] : null;
      if (ruleId === 'till_seed') {
        // 板结 < 20 → 播种（草低时加速生长）
        [z, z2].forEach(function (zz) {
          if (!zz || points <= 0) return;
          if ((zz.compaction || 0) < 20 && (zz.grass_height || 0) < 0.8) {
            zz._seed_once = 0.5; // 播种一次：草生长当轮 +50%
            points--;
          }
        });
      } else if (ruleId === 'grass_feed') {
        // 草高 > 1.0 → 该臂夹持区投喂优先级（饲料槽优先补饱腹）
        [z, z2].forEach(function (zz) {
          if (!zz || points <= 0) return;
          if ((zz.grass_height || 0) > 1.0) {
            zz._feed_priority = true;
            points--;
          }
        });
      } else if (ruleId === 'clean_collect') {
        // 污染 < 10% → 自动采集一轮（直接触发一次采集）
        [z, z2].forEach(function (zz) {
          if (!zz || points <= 0) return;
          if ((zz.pollution || 0) < 10) {
            st.animals.forEach(function (a) {
              if (a.dead || a.location_type !== 'zone' || a.zone_id !== zones[zones.indexOf(zz)]) return;
              var asp = getSpecies(a.species_id);
              if (!asp || !asp.products || !asp.products.living) return;
              asp.products.living.forEach(function (p) {
                var r = collectProduct(a.uid, p.product_id, 1);
                if (r.ok) {
                  if (getWarehouseHub()) warehouseAdd(r.item_id);
                  else {
                    st.pending_auto_items = st.pending_auto_items || [];
                    st.pending_auto_items.push({ item_id: r.item_id, count: r.count, uid: a.uid });
                  }
                }
              });
            });
            points--;
          }
        });
      }
    });
    ls.inst.dispatch = points;
  }

  // 提取缓存全部产物；返回 [{item_id, count}]，并清空缓存
  function warehouseTakeAll() {
    var hub = getWarehouseHub();
    if (!hub || !hub.cache || !hub.cache.items) return [];
    var out = [];
    var items = hub.cache.items;
    for (var k in items) {
      if (items[k] > 0) out.push({ item_id: k, count: items[k] });
    }
    hub.cache.items = {};
    return out;
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

  // §8.4 每轮旋转前结算的机制 Perk（地鸣 / 越界播种）
  function tickRotationPerks(st) {
    var zones = st.zones || {};
    st.animals.forEach(function (male) {
      if (male.dead || male.location_type !== 'zone') return;
      var sp = getSpecies(male.species_id);
      if (!sp || !sp.reproduction) return;

      // 地鸣（§8.4）：公畜所在区域共享机械臂的相邻两区，所有同物种成年母畜独立过一遍怀孕判定；判定后公畜冷却 10000 tick
      if (male.gender === 'male' && hasPerk(male, 'earth_cry') && (male.earth_cry_cooldown || 0) <= 0) {
        var adj = adjacentZones(st, male.zone_id);
        var acted = false;
        // 每轮一次结算 → 概率用「一轮等效概率」= 1-(1-p)^1000（羊≈31%、猪≈39%、牛≈18%）
        var baseP = sp.reproduction.base_pregnancy_rate_per_tick || 0.0002;
        var roundP = 1 - Math.pow(1 - baseP, 1000);
        adj.forEach(function (zid) {
          var zone = zones[zid];
          if (!zone || zone.pollution >= 30) return;
          st.animals.forEach(function (female) {
            if (female.dead || female.uid === male.uid) return;
            if (female.species_id !== male.species_id) return;
            if (female.location_type !== 'zone' || female.zone_id !== zid) return;
            if (female.gender !== 'female' && female.gender !== 'hermaphrodite') return;
            if (!canConceive(female, sp, zone)) return;
            acted = true;
            var pregRate = roundP * getModifier(female, 'fertility_mult');
            if (Math.random() < pregRate) {
              female.pregnant = { father_uid: male.uid, remaining_ticks: sp.reproduction.pregnancy_ticks };
            }
          });
        });
        if (acted) male.earth_cry_cooldown = 10000;
      }

      // 越界播种（§8.4）：猪公 → 相邻两区成年母羊 15% 产猪崽（Perk 池从父猪+母羊合并）；成功后冷却 10000 tick
      if (male.species_id === 'pig' && male.gender === 'male' && hasPerk(male, 'crossbreed_swine') && (male.crossbreed_cooldown || 0) <= 0) {
        var adjZ = adjacentZones(st, male.zone_id);
        var sheepSp = getSpecies('sheep');
        adjZ.forEach(function (zid) {
          var zone = zones[zid];
          if (!zone || zone.pollution >= 30) return;
          st.animals.forEach(function (ewe) {
            if (ewe.dead || ewe.uid === male.uid) return;
            if (ewe.species_id !== 'sheep') return;
            if (ewe.location_type !== 'zone' || ewe.zone_id !== zid) return;
            if (ewe.gender !== 'female') return;
            if (!canConceive(ewe, sheepSp, zone)) return;
            if (Math.random() < 0.15) {
              ewe.pregnant = { father_uid: male.uid, remaining_ticks: sheepSp.reproduction.pregnancy_ticks, crossbreed: true };
              male.crossbreed_cooldown = 10000;
            }
          });
        });
      }
    });
  }

  function advanceTick() {
    var st = ensureState();

    // 0. 清理上轮模块临时字段
    clearModuleTempFields();
    st._waste_heat_drop = 0;
    // 废热回收（§11.5.2）：记录本 tick 四区污染基线，全程追踪所有降污来源
    st._waste_heat_baseline = {};
    for (var pzid in st.zones) st._waste_heat_baseline[pzid] = st.zones[pzid].pollution || 0;

    // 1. 模块升级工程推进
    tickUpgrades();

    // 2. 旋转倒计时
    st.rotation_ticks_remaining--;
    if (st.rotation_ticks_remaining <= 0) {
      // 旋转前结算机制 Perk（地鸣/越界播种，§8.4）
      tickRotationPerks(st);
      // 旋转前结算联动臂（§11.5.1）
      tickLinkSchedule(st);
      rotateClockwise(st);
      st.rotation_ticks_remaining = st.rotation_total_ticks;
    }

    // 3. 模块效果结算（作用于夹持区域，写入 _mg/_sr/_tr 临时字段）
    tickModules(st);

    // 4. 区域生态：草自然生长（受模块加成 + 气候）
    var climate = getClimateModifiers();
    for (var zid in st.zones) {
      var z = st.zones[zid];
      var growthFactor = (100 - (z.compaction || 0)) * 0.009 + 0.1;
      var seedMult = z._seed_once != null ? (1 + z._seed_once) : 1; // 联动播种（§11.5.1 till_seed）
      z.grass_height = clamp((z.grass_height || 0) + (0.8 / 1000) * growthFactor * (z._mg || 1) * climate.grassMult * seedMult, 0, 1.5);
      // 湿润模式：污染自然消散 / 板结恶化（§11.6.2）
      if (climate.pollutionClean > 0) {
        z.pollution = clamp((z.pollution || 0) - climate.pollutionClean, 0, 100);
      }
      if (climate.compactionUp > 0) {
        z.compaction = clamp((z.compaction || 0) + climate.compactionUp, 0, 100);
      }
    }

    // 5. 每只动物结算
    var births = [];
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (a.dead) continue;
      var sp = getSpecies(a.species_id);
      if (!sp) continue;
      tickAnimal(st, a, sp, births);
    }
    for (var b = 0; b < births.length; b++) st.animals.push(births[b]);

    // 6. 尸体持续污染（§3.3）
    tickCorpses(st);

    // 7. 废热回收结算（§11.5.2，消费本 tick 降污量）
    tickWasteHeat(st);

    // 8. 清理本轮临时字段
    clearModuleTempFields();
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

    // 牛/羊育肥（§10.5）：草饲到顶后需饲料槽才能继续增重至育肥上限；
    // 饲料只长肉不补饱腹（饱腹靠吃草），饱腹 > 70 才吃
    if ((a.species_id === 'cattle' || a.species_id === 'sheep') && sp.feed && sp.feed.feed_units_per_tick) {
      var grazeTop = sp.growth.graze_cap_kg != null ? sp.growth.graze_cap_kg : sp.growth.fatten_cap_kg;
      if (a.weight_kg >= grazeTop && a.weight_kg < sp.growth.fatten_cap_kg && a.satiety > 70) {
        var fTrough = findTroughForZone(a.zone_id);
        if (fTrough && fTrough.feed_units > 0) {
          var fUnits = sp.feed.feed_units_per_tick;
          if (fTrough.feed_units >= fUnits) {
            fTrough.feed_units -= fUnits;
            var fGrowth = fUnits * 10 / sp.feed.nutrition_per_kg_meat * getModifier(a, 'feed_conversion_mult');
            a.weight_kg = Math.min(sp.growth.fatten_cap_kg, a.weight_kg + fGrowth);
          }
        }
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

    // 饱腹下降（satiety_drain_mult × 气候）
    var climateSat = getClimateModifiers().satietyMult;
    a.satiety = clamp(a.satiety - sp.satiety.drain_per_tick * getModifier(a, 'satiety_drain_mult') * climateSat, 0, 100);

    // 饿死链（§4.2/§5.4）：饱腹归零进入濒死倒计时，倒计时结束饿死；喂食可挽救
    // 猪例外（§4.6）：拱地保底饱腹 10，不会饿死，只会瘦到皮包骨
    if (a.species_id !== 'pig') {
      if (a.satiety <= 0) {
        a.starvation_ticks = (a.starvation_ticks || 0) + 1;
        if (sp.satiety.starvation_dying_ticks && a.starvation_ticks >= sp.satiety.starvation_dying_ticks) {
          a.dead = true;
          a.death_cause = 'starvation';
        }
      } else {
        a.starvation_ticks = 0;
      }
    }

    // 体重成长（牛/羊草饲、鸡虫子；猪长肉已在上方饲料分支）
    tickWeight(a, sp);

    // 生态影响：踩踏 / 污染（羊）
    if (sp.ecosystem_impact) {
      var trampleMult = getModifier(a, 'trample_mult');
      var trampleReduce = zone._tr || 0;
      zone.compaction = clamp(zone.compaction + sp.ecosystem_impact.trample_per_tick * trampleMult * (1 - trampleReduce), 0, 100);
      if (sp.ecosystem_impact.pollution_pct_per_tick > 0) {
        var pollMult = getModifier(a, 'pollution_rate_mult');
        var sheepReduce = (a.species_id === 'sheep') ? (zone._sr || 0) : 0;
        zone.pollution = clamp(zone.pollution + sp.ecosystem_impact.pollution_pct_per_tick * pollMult * (1 - sheepReduce), 0, 100);
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

    // 机制 Perk 冷却递减（地鸣/越界播种/信息素）
    if ((a.earth_cry_cooldown || 0) > 0) a.earth_cry_cooldown--;
    if ((a.crossbreed_cooldown || 0) > 0) a.crossbreed_cooldown--;
    if ((a.pheromone_cooldown || 0) > 0) a.pheromone_cooldown--;

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
    var zone = st.zones[a.zone_id];
    if (!canConceive(a, sp, zone)) return;

    // 雌雄同体（§8.4）：可与自己配对（父本=自己）
    var selfMale = a.gender === 'hermaphrodite';

    // 同区公畜候选
    function maleCandidates(sameZone) {
      var list = [];
      st.animals.forEach(function (other) {
        if (other.dead || other.uid === a.uid) return;
        if (other.species_id !== a.species_id) return;
        if (other.location_type !== 'zone') return;
        if (sameZone && other.zone_id !== a.zone_id) return;
        if (other.gender !== 'male' && other.gender !== 'hermaphrodite') return;
        if (!isMature(other, sp)) return;
        if (other.hp <= 90) return;
        list.push(other);
      });
      return list;
    }

    // 标准怀孕判定（按 fertility_mult）
    function rollPregnancy(father) {
      var pregRate = (sp.reproduction.base_pregnancy_rate_per_tick || 0.0002) * getModifier(a, 'fertility_mult');
      if (Math.random() < pregRate) {
        a.pregnant = { father_uid: father ? father.uid : null, remaining_ticks: sp.reproduction.pregnancy_ticks };
        return true;
      }
      return false;
    }

    // 孤雌（§8.4）：不需要公畜即可自主受孕
    if (hasPerk(a, 'parthenogenesis')) {
      if (rollPregnancy(null)) {
        triggerChainPregnancy(st, a, sp);
      }
      return;
    }

    // 常规：同区公畜
    var same = maleCandidates(true);
    var father = same.length ? same[0] : null;
    if (!father && selfMale) father = a; // 雌雄同体自配
    if (father) {
      if (rollPregnancy(father)) {
        triggerChainPregnancy(st, a, sp);
      }
      return;
    }

    // 信息素（§8.4）：同区无公畜时，邻区公畜以 50% 概率纳入候选；每轮每只母畜限一次（冷却=一轮）
    if (hasPerk(a, 'pheromone') && (a.pheromone_cooldown || 0) <= 0) {
      var adj = adjacentZones(st, a.zone_id);
      var adjFather = null;
      // 邻区中的同物种公畜
      for (var ai = 0; ai < adj.length && !adjFather; ai++) {
        var cands = maleCandidates(false);
        for (var ci = 0; ci < cands.length; ci++) {
          if (cands[ci].zone_id === adj[ai]) { adjFather = cands[ci]; break; }
        }
      }
      if (adjFather && Math.random() < 0.5) {
        if (rollPregnancy(adjFather)) {
          triggerChainPregnancy(st, a, sp);
        }
      }
      a.pheromone_cooldown = 1000; // 每轮一次
    }
  }

  // 连坐（§8.4）：持有者成功怀孕时，同区同物种其他成年母畜 10% 同时怀孕（父本取同区公畜）；连坐怀孕的不再触发连坐
  function triggerChainPregnancy(st, mother, sp) {
    if (!hasPerk(mother, 'chain_pregnancy')) return;
    var chainFather = null;
    for (var i = 0; i < st.animals.length; i++) {
      var c = st.animals[i];
      if (c.dead || c.uid === mother.uid || c.species_id !== mother.species_id) continue;
      if (c.location_type !== 'zone' || c.zone_id !== mother.zone_id) continue;
      if (c.gender !== 'male' && c.gender !== 'hermaphrodite') continue;
      if (!isMature(c, sp) || c.hp <= 90) continue;
      chainFather = c;
      break;
    }
    st.animals.forEach(function (other) {
      if (other.dead || other.uid === mother.uid) return;
      if (other.species_id !== mother.species_id) return;
      if (other.location_type !== 'zone' || other.zone_id !== mother.zone_id) return;
      if (other.gender !== 'female' && other.gender !== 'hermaphrodite') return;
      if (!canConceive(other, sp, st.zones[other.zone_id])) return;
      if (Math.random() < 0.1) {
        other.pregnant = { father_uid: chainFather ? chainFather.uid : null, remaining_ticks: sp.reproduction.pregnancy_ticks, chained: true };
      }
    });
  }

  // 尸体污染（§3.3）：尸体不清理则持续向所在区域加污染
  function tickCorpses(st) {
    var rates = { disease: 0.006, starvation: 0.003, blood_loss: 0.002, old: 0.002 };
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (!a.dead) continue;
      var rate = rates[a.death_cause] != null ? rates[a.death_cause] : 0;
      if (rate <= 0) continue;
      if (a.location_type === 'coop' && a.arm_id) {
        // 鸡尸体在鸡笼内，作用于该臂夹持两区（同鸡笼清污口径）
        var zones = (st.arm_zones && st.arm_zones[a.arm_id]) || [];
        for (var zi = 0; zi < zones.length; zi++) {
          var cz = st.zones[zones[zi]];
          if (cz) cz.pollution = clamp(cz.pollution + rate, 0, 100);
        }
      } else if (a.zone_id) {
        var z = st.zones[a.zone_id];
        if (z) z.pollution = clamp(z.pollution + rate, 0, 100);
      }
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
    // 鸡吃同臂饲料槽（§11.3.1）：无虫子可吃时吃饲料补饱腹（维持虫子长肉满速）
    var coopArm = st.arms[a.arm_id];
    var cTrough = findTroughOnArm(coopArm);
    if (cTrough && cTrough.feed_units > 0 && a.satiety < 90) {
      var cTake = Math.min(cTrough.feed_units, 0.01);
      cTrough.feed_units = Math.max(0, cTrough.feed_units - cTake);
      // 1 单位 = 10 营养 = 10 饱腹（§10.5 口径）
      a.satiety = clamp(a.satiety + cTake * 10, 0, 100);
    }
    a.satiety = clamp(a.satiety - sp.satiety.drain_per_tick * getModifier(a, 'satiety_drain_mult') * getClimateModifiers().satietyMult, 0, 100);
    // 鸡饿死链（§4.2）：饱腹归零进入濒死倒计时
    if (a.satiety <= 0) {
      a.starvation_ticks = (a.starvation_ticks || 0) + 1;
      if (sp.satiety.starvation_dying_ticks && a.starvation_ticks >= sp.satiety.starvation_dying_ticks) {
        a.dead = true;
        a.death_cause = 'starvation';
      }
    } else {
      a.starvation_ticks = 0;
    }
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
    // 猪不吃草（§4.6）：长肉全程靠饲料槽，已在 tickAnimal 饲料分支处理，此处跳过避免双倍长肉
    if (a.species_id !== 'pig' && g.graze_growth_rate_kg_per_tick != null) {
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
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'disease'; return; }
      // 即死判定（§5.4）：污染 > 90% 每 tick 0.1% 概率当场死亡，即使血量仍高
      if (pollution > 90 && Math.random() < 0.001) {
        a.dead = true;
        a.death_cause = 'disease';
        return;
      }
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
    // 越界播种（§8.4）：猪公×羊母产猪崽，Perk 池从父猪+母羊合并抽取
    var crossbreed = mother.pregnant && mother.pregnant.crossbreed === true;
    var calfSpecies = crossbreed ? 'pig' : mother.species_id;
    var calfSp = getSpecies(calfSpecies) || sp;
    // 孤雌（§8.4）：后代全雌，父本为空 → 多一次随机补位
    var partheno = !father && hasPerk(mother, 'parthenogenesis');
    var inherited;
    if (partheno) {
      inherited = inheritPerks([], mother.perks || []);
      var extra = pickPerkByRarity((calfSp && calfSp.perk_pool) || []);
      if (extra && inherited.indexOf(extra) < 0) inherited.push(extra);
      while (inherited.length > 4) inherited.pop();
    } else {
      inherited = inheritPerks(father ? father.perks : [], mother.perks || []);
    }
    var litter = randInt(sp.reproduction.litter_size[0], sp.reproduction.litter_size[1]);
    for (var i = 0; i < litter; i++) {
      // 物种突变（§8.4）：持有者（猪）正常繁殖时猪崽 20% 变羊
      var finalSpecies = calfSpecies;
      var mutant = hasPerk(father, 'species_mutant') || hasPerk(mother, 'species_mutant');
      if (mutant && calfSpecies === 'pig' && Math.random() < 0.2) finalSpecies = 'sheep';
      var finalSp = getSpecies(finalSpecies) || calfSp;
      var calf = makeAnimal(
        finalSpecies,
        partheno ? 'female' : (Math.random() < 0.5 ? 'male' : 'female'),
        'zone',
        mother.zone_id,
        { weight_kg: finalSp.growth.birth_weight_kg, age_ticks: 0, satiety: 80, perks: inherited.slice() }
      );
      births.push(calf);
    }
    // 产后冷却（= 产后冷却 tick）；四季如春（§8.4）消除产后冷却
    mother.reproduction_cooldown = hasPerk(mother, 'eternal_spring') ? 0 : (sp.reproduction.postpartum_cooldown_ticks || 0);
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
    cleanCorpse: cleanCorpse,
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
    getModuleEffectText: getModuleEffectText,
    drainAutoCollectItems: drainAutoCollectItems,
    getWarehouseHub: getWarehouseHub,
    getWarehouseCapacity: getWarehouseCapacity,
    getWarehouseUsage: getWarehouseUsage,
    warehouseTakeAll: warehouseTakeAll,
    feedProcessInput: feedProcessInput,
    getClimateControl: getClimateControl,
    climateSetMode: climateSetMode,
    getClimateModifiers: getClimateModifiers,
    getWasteHeatRecycle: getWasteHeatRecycle,
    wasteHeatSetMode: wasteHeatSetMode,
    wasteHeatTakeAll: wasteHeatTakeAll,
    getLinkSchedule: getLinkSchedule,
    linkScheduleToggleRule: linkScheduleToggleRule,
    advanceTick: advanceTick
  };
})();

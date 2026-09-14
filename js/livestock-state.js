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
  var PASTURE_RULES = {};
  var state = null;
  var uidSeq = 1;
  var RETIRED_MODULES = { link_schedule: true, waste_heat_recycle: true, climate_control: true };

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

  function setConfig(species, modules, perks, buildCosts, feedCrops, pastureRules) {
    SPECIES = species || {};
    MODULES = {};
    Object.keys(modules || {}).forEach(function (id) { if (!RETIRED_MODULES[id]) MODULES[id] = modules[id]; });
    PERKS = perks || {};
    BUILD_COSTS = buildCosts || {};
    FEED_CROPS = feedCrops || {};
    PASTURE_RULES = pastureRules || {};
    MODULE_EFFECTS = {};
    Object.keys(MODULES).forEach(function (id) { if (MODULES[id].effects) MODULE_EFFECTS[id] = JSON.parse(JSON.stringify(MODULES[id].effects)); });
    if (state) {
      migrateRetiredModules(state);
      (state.animals || []).forEach(function (a) { initializeNutrition(a, getSpecies(a.species_id)); });
    }
  }

  function getSpecies(speciesId) { return SPECIES[speciesId] || null; }
  function getModule(moduleId) { return MODULES[moduleId] || null; }
  function getPerk(perkId) { return PERKS[perkId] || null; }
  function allSpecies() { return SPECIES; }
  function allModules() { return MODULES; }
  function allPerks() { return PERKS; }

  // 模块是否需电（k93）：读 requires_power 字段；缺省按 tier 回退——small/medium 无电可转，large（臂）/axis（屠宰/仓储/气候）需电
  function moduleRequiresPower(moduleId) {
    var m = getModule(moduleId);
    if (!m) return false;
    if (typeof m.requires_power === 'boolean') return m.requires_power;
    return m.tier === 'large' || m.tier === 'axis';
  }

  // 牧场是否供电（k89 电池经济最小闭环：由 power_charge 储能驱动；power_available 为派生缓存）
  // 每 tick 扣电：需电模块合计 power_drain_per_tick；储能耗尽 → 供电中断 → 需电模块停摆（k93 生产力墙）
  function isPowerAvailable() {
    var st = ensureState();
    return st.power_charge > 0 && st.power_charge >= currentPowerDrainPerTick();
  }
  // 兼容旧接口：true = 塞一块起步电（1 点）使供电恢复；false = 清空储能（断电）
  function setPowerAvailable(v) {
    var st = ensureState();
    if (v === false) st.power_charge = 0;
    else if ((st.power_charge || 0) <= 0) st.power_charge = 1;
    return st.power_charge > 0;
  }
  /** 每 tick 各需电模块耗电速率（数据源：模块表 power_drain_per_tick；缺省按 tier 回退，非需电模块恒为 0）。 */
  function modulePowerDrainPerTick(moduleId) {
    var m = getModule(moduleId);
    if (!m) return 0;
    if (!moduleRequiresPower(moduleId)) return 0;
    if (m.power_drain_per_tick != null && isFinite(Number(m.power_drain_per_tick))) {
      return Math.max(0, Number(m.power_drain_per_tick));
    }
    if (m.tier === 'large') return 1;
    if (m.tier === 'axis') return 2;
    return 0;
  }
  /** 当前装配中的需电模块合计每 tick 耗电（含轴心位，影子位不重复计算）。 */
  function currentPowerDrainPerTick() {
    var st = ensureState();
    var total = 0;
    var containers = [];
    if (st.arms) for (var ak in st.arms) containers.push(st.arms[ak]);
    if (st.axis) containers.push(st.axis);
    for (var c = 0; c < containers.length; c++) {
      var cont = containers[c];
      if (!cont || typeof cont !== 'object') continue;
      for (var sk in cont) {
        var inst = cont[sk];
        if (!inst || typeof inst !== 'object' || inst.shadow) continue;
        if (!inst.module_id || !moduleRequiresPower(inst.module_id)) continue;
        total += modulePowerDrainPerTick(inst.module_id);
      }
    }
    return total;
  }
  /** 每 tick 扣电（advanceTick 开头调用）：有电且装了需电模块才扣。 */
  function drainPowerForTick() {
    var st = ensureState();
    var drain = currentPowerDrainPerTick();
    if (drain <= 0 || !isPowerAvailable()) return st.power_charge || 0;
    st.power_charge = Math.max(0, (st.power_charge || 0) - drain);
    return st.power_charge;
  }
  /** 塞入储能（电池充电入口；amount 为电量点数，负值忽略）。 */
  function addPowerCharge(amount) {
    var st = ensureState();
    var a = Math.floor(Number(amount) || 0);
    if (a <= 0) return { ok: false, charge: st.power_charge || 0, reason: 'invalid_amount' };
    st.power_charge = (st.power_charge || 0) + a;
    return { ok: true, charge: st.power_charge, added: a };
  }
  function getPowerCharge() {
    var st = ensureState();
    return st.power_charge || 0;
  }
  // 模块当前是否可产出（生产力墙：需电模块缺电 → 停摆；非分档锁，装配/升级不受 tier 限制）
  function isModulePowered(moduleId) {
    if (RETIRED_MODULES[moduleId]) return false;
    return !moduleRequiresPower(moduleId) || isPowerAvailable();
  }

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
        if (pdef.requires.gender && !hasGender(animal, pdef.requires.gender)) continue;
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
    if (pdef.requires && pdef.requires.gender && !hasGender(animal, pdef.requires.gender)) return false;
    return true;
  }

  function hasGender(animal, gender) {
    if (!animal) return false;
    if (animal.gender === gender || animal.gender === 'hermaphrodite') return true;
    var p = getPerk('hermaphrodite');
    return !!(p && (animal.perks || []).indexOf('hermaphrodite') >= 0 &&
      (!p.species || p.species.indexOf(animal.species_id) >= 0));
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
    var g = sp.growth || {};
    var weight = g.wean_weight_kg || g.graze_cap_kg || g.production_min_weight_kg || 0;
    return (a.age_ticks || 0) >= (g.maturity_ticks || 0) && (a.weight_kg || 0) + 1e-8 >= weight;
  }

  function productEligible(a, sp, p) {
    return (p.min_age_ticks == null ? isMature(a, sp) :
      a.age_ticks >= p.min_age_ticks && a.weight_kg >= (p.min_weight_kg ?? 0)) &&
      (!p.requires_gender || hasGender(a, p.requires_gender));
  }

  function getCapacityStatus() {
    var st = ensureState(), used = 0, pending = 0;
    function cost(kind) { var sp = getSpecies(kind); return sp ? (sp.capacity_cost ?? ({ cattle: 6, pig: 3, sheep: 2 }[kind] || 0)) : 0; }
    st.animals.forEach(function (a) {
      if (a.dead) return;
      used += cost(a.species_id);
      if (a.pregnant && a.pregnant.children) a.pregnant.children.forEach(function (c) { pending += cost(c.species_id); });
    });
    var capacity = PASTURE_RULES.capacity ?? 30, ratio = used / Math.max(1, capacity), x = Math.max(0, ratio - 1);
    var output = Math.exp(-(PASTURE_RULES.output_linear ?? 1.5) * x - (PASTURE_RULES.output_quadratic ?? 2.5) * x * x);
    return { used: used, pending: pending, projected: used + pending, capacity: capacity, ratio: ratio,
      output: output, fertility: output * output, maintenance: 1 + (PASTURE_RULES.maintenance_excess ?? 0.5) * x,
      ecology: 1 + (PASTURE_RULES.ecology_linear ?? 2) * x + (PASTURE_RULES.ecology_quadratic ?? 4) * x * x,
      exposure_ticks: st.crowding_exposure_ticks || 0 };
  }

  function crowdingOutput(a) { return a.species_id === 'chicken' ? 1 : getCapacityStatus().output; }
  function tickCrowding(st) {
    var c = getCapacityStatus(), grace = PASTURE_RULES.grace_ticks ?? 1000, ramp = PASTURE_RULES.ramp_ticks ?? 1000;
    var exposure = st.crowding_exposure_ticks || 0;
    if (c.ratio > (PASTURE_RULES.damage_threshold ?? 1.25)) exposure += 1;
    else if (c.ratio <= (PASTURE_RULES.recovery_threshold ?? 1.1)) exposure -= PASTURE_RULES.exposure_recovery_per_tick ?? 2;
    st.crowding_exposure_ticks = clamp(exposure, 0, grace + ramp);
    var damage = Math.min(PASTURE_RULES.max_damage_per_round ?? 40, (PASTURE_RULES.damage_factor ?? 128) * Math.pow(Math.max(0, c.ratio - (PASTURE_RULES.damage_threshold ?? 1.25)), 2)) / 1000 * clamp((exposure - grace) / Math.max(1, ramp), 0, 1);
    st.animals.forEach(function (a) {
      if (a.dead || a.species_id === 'chicken' || !a.nutrition_state) return;
      var loss = Math.min(a.hp, damage);
      a.hp -= loss; a.nutrition_state.crowding_damage = (a.nutrition_state.crowding_damage || 0) + loss;
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'crowding'; }
    });
  }

  // Piecewise mass progression: food shortage delays progress rather than creating age-based catch-up growth.
  function lifecycleGrowth(a, sp) {
    var g = sp.growth, span = g.fatten_cap_kg - g.birth_weight_kg;
    var fraction = clamp((a.weight_kg - g.birth_weight_kg) / span, 0, 1), previousMass = 0, previousTime = 0;
    var stages = g.growth_stages || [{ mass_fraction: 1, time_fraction: 1 }];
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      if (fraction < s.mass_fraction - 1e-12) return span * (s.mass_fraction - previousMass) / ((s.time_fraction - previousTime) * g.target_fatten_ticks);
      previousMass = s.mass_fraction; previousTime = s.time_fraction;
    }
    return 0;
  }

  // §8.4 标准怀孕条件（不含性别/公畜存在性）
  function canConceive(a, sp, zone) {
    if (!sp.reproduction) return false;
    var breeding = getBreedingStatus(a.species_id);
    if (breeding.live + breeding.pending >= breeding.limit) return false;
    if (a.pregnant) return false;
    if ((a.reproduction_cooldown || 0) > 0) return false;
    if (a.hp <= 90) return false;
    if (a.dead || a.satiety <= 70) return false;
    if (a.nutrition_state && a.nutrition_state.last && a.nutrition_state.last.intake + 1e-9 < a.nutrition_state.last.maintenance_required) return false;
    if (!isMature(a, sp)) return false;
    if (zone && zone.pollution >= 30) return false;
    return true;
  }

  function fedForBreeding(a) { var n = a && a.nutrition_state && a.nutrition_state.last; return !!(n && n.intake + 1e-9 >= n.maintenance_required); }

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

  function perkParam(id, key, fallback) {
    var p = getPerk(id), value = p && p.params && p.params[key];
    return value == null ? fallback : value;
  }

  function createPregnancy(mother, father, sp, flags) {
    var pregnancy = Object.assign({ father_uid: father ? father.uid : null, remaining_ticks: sp.reproduction.pregnancy_ticks }, flags || {});
    function snapshot(a) { return a ? { uid: a.uid, species_id: a.species_id, gender: a.gender, perks: (a.perks || []).slice() } : null; }
    pregnancy.mother = snapshot(mother); pregnancy.father = snapshot(father);
    var partheno = !father && hasPerk(mother, 'parthenogenesis');
    var baseSpecies = pregnancy.crossbreed ? 'pig' : mother.species_id;
    var mutant = hasPerk(father, 'species_mutant') || hasPerk(mother, 'species_mutant');
    var litter = randInt(sp.reproduction.litter_size[0], sp.reproduction.litter_size[1]);
    pregnancy.children = [];
    for (var i = 0; i < litter; i++) {
      var kind = baseSpecies;
      if (mutant && kind === 'pig' && Math.random() < perkParam('species_mutant', 'mutate_chance', 0.2)) kind = perkParam('species_mutant', 'mutate_to', 'sheep');
      if (!getSpecies(kind)) kind = baseSpecies;
      var inherited = inheritPerks(father ? father.perks : [], mother.perks || []);
      if (partheno) { var extra = pickPerkByRarity(getSpecies(kind).perk_pool || []); if (extra && inherited.indexOf(extra) < 0 && inherited.length < 4) inherited.push(extra); }
      pregnancy.children.push({ species_id: kind, gender: partheno ? 'female' : (Math.random() < 0.5 ? 'male' : 'female'), perks: inherited });
    }
    var needed = {};
    pregnancy.children.forEach(function (c) { needed[c.species_id] = (needed[c.species_id] || 0) + 1; });
    if (Object.keys(needed).some(function (kind) { var status = getBreedingStatus(kind); return status.live + status.pending + needed[kind] > status.limit; })) return null;
    return pregnancy;
  }

  function getBreedingStatus(kind) {
    var st = ensureState(), sp = getSpecies(kind), live = 0, pending = 0;
    st.animals.forEach(function (a) {
      if (a.dead) return;
      if (a.species_id === kind) live++;
      if (a.pregnant && a.pregnant.children) a.pregnant.children.forEach(function (c) { if (c.species_id === kind) pending++; });
    });
    return { live: live, pending: pending, limit: st.breeding_limits && st.breeding_limits[kind] != null ? st.breeding_limits[kind] : (sp && sp.reproduction ? sp.reproduction.default_population_limit ?? 16 : 0) };
  }
  function setBreedingLimit(kind, limit) {
    if (['cattle','sheep','pig'].indexOf(kind) < 0 || !Number.isInteger(limit) || limit < 0 || limit > 100) return { ok: false, reason: 'invalid_amount' };
    var st = ensureState(); st.breeding_limits = st.breeding_limits || {}; st.breeding_limits[kind] = limit; return { ok: true };
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
      rotation_ticks_remaining: 1000,
      rotation_total_ticks: 1000,
      // 牧场储能（k89 电池经济最小闭环）：起步 500 点；需电模块每 tick 扣电，耗尽停摆 → 需塞电池（数值 k87 精调）
      power_charge: 500,
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
  function ensureState() { if (!state) initDemoState(); migrateRetiredModules(state); return state; }

  // One-way retirement migration. Frozen records are audit data, never executable machinery.
  function migrateRetiredModules(st) {
    var storage = st.retired_module_storage;
    function getStorage() {
      if (!storage) storage = st.retired_module_storage = { version: 1, records: [], items: {} };
      return storage;
    }
    var holders = Object.keys(st.arms || {}).map(function (id) { return { id: id, slots: st.arms[id] }; });
    if (st.axis) holders.push({ id: 'axis', slots: st.axis });
    holders.forEach(function (holder) {
      Object.keys(holder.slots || {}).forEach(function (slot) {
        var inst = holder.slots[slot], id = getSlotModuleId(inst);
        if (!RETIRED_MODULES[id]) return;
        if (!(inst && inst.shadow)) {
          var snapshot = typeof inst === 'string' ? { module_id: id, level: 1 } : JSON.parse(JSON.stringify(inst));
          var box = getStorage();
          box.records.push({ arm_id: holder.id, slot: slot, snapshot: snapshot, material_refund_pending: true });
          (snapshot.output_queue || []).forEach(function (p) {
            if (p && p.item_id && Number.isFinite(p.count) && p.count > 0) box.items[p.item_id] = (box.items[p.item_id] || 0) + Math.floor(p.count);
          });
        }
        holder.slots[slot] = null;
      });
    });
    Object.keys(st.zones || {}).forEach(function (id) {
      var z = st.zones[id]; if (!z) return;
      delete z.link_seed_ticks; delete z.link_feed_ticks; delete z.link_owner;
      delete z._seed_once; delete z._feed_priority;
    });
    delete st.pollution_recovery;
    if (!storage) return;
    storage.records.forEach(function (record) {
      if (!record.material_refund_pending) return;
      var inst = record.snapshot, tier = inst.module_id === 'climate_control' ? 'axis' : 'large';
      var table = BUILD_COSTS[tier];
      if (!table || !Array.isArray(table.steps)) return; // Config may load after the save.
      var level = clamp(inst.level || 1, 1, 5), fromLevels = [1]; // Initial construction uses the 1→2 material row.
      for (var from = 1; from < level; from++) fromLevels.push(from);
      if (inst.upgrading_remaining > 0 && level < 5) fromLevels.push(level);
      var steps = fromLevels.map(function (from) { return table.steps.filter(function (s) { return s.from === from; })[0]; });
      if (steps.some(function (s) { return !s; })) return;
      steps.forEach(function (s) { (s.inputs || []).forEach(function (p) {
        if (p.item_id && p.count > 0) storage.items[p.item_id] = (storage.items[p.item_id] || 0) + p.count;
      }); });
      record.material_refund_pending = false;
    });
  }

  function getRetiredModuleStorage() {
    var box = ensureState().retired_module_storage;
    return box ? JSON.parse(JSON.stringify(box)) : { version: 1, records: [], items: {} };
  }

  // Deliver one physical item at a time. Full inventory leaves the remainder claimable.
  function claimRetiredModuleItems() {
    var st = ensureState(), box = st.retired_module_storage, IE = window.InventoryEquipment;
    if (!box) return { ok: false, reason: 'no_retired_items', placed: 0 };
    if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function') return { ok: false, reason: 'no_inventory', placed: 0 };
    var placed = 0;
    Object.keys(box.items).sort().forEach(function (id) {
      while (box.items[id] >= 1) {
        var r = IE.putItemIntoDefaultContainer({ item_id: id, count: 1 });
        if (!r || !r.placed) break;
        box.items[id]--; placed++;
      }
      if (box.items[id] <= 0) delete box.items[id];
    });
    return { ok: placed > 0, placed: placed, remaining: Object.keys(box.items).reduce(function (n, id) { return n + box.items[id]; }, 0) };
  }

  function validateState(incoming) {
    if (incoming == null) return { ok: true };
    try {
      if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('state');
      function finite(value) {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('number');
        if (value && typeof value === 'object') Object.keys(value).forEach(function (key) { finite(value[key]); });
      }
      finite(incoming);
      if (incoming.crowding_exposure_ticks != null && (typeof incoming.crowding_exposure_ticks !== 'number' || incoming.crowding_exposure_ticks < 0)) throw new Error('crowding_exposure');
      var ids = Object.create(null);
      if (incoming.breeding_limits != null) {
        Object.keys(incoming.breeding_limits).forEach(function (kind) {
          var n = incoming.breeding_limits[kind];
          if (['cattle','sheep','pig'].indexOf(kind) < 0 || !Number.isInteger(n) || n < 0 || n > 100) throw new Error('breeding_limit');
        });
      }
      if (incoming.animals != null && !Array.isArray(incoming.animals)) throw new Error('animals');
      (incoming.animals || []).forEach(function (a) {
        if (!a || typeof a.uid !== 'string' || ids[a.uid]) throw new Error('animal_uid'); ids[a.uid] = true;
        if (Object.keys(SPECIES).length && !getSpecies(a.species_id)) throw new Error('species');
        ['hp', 'satiety'].forEach(function (key) { if (a[key] != null && (typeof a[key] !== 'number' || a[key] < 0 || a[key] > 100)) throw new Error(key); });
        if (typeof a.weight_kg !== 'number' || a.weight_kg < 0) throw new Error('weight');
        if (a.age_ticks != null && (typeof a.age_ticks !== 'number' || a.age_ticks < 0)) throw new Error('age');
        if (a.pregnant && a.pregnant.children != null) {
          if (!Array.isArray(a.pregnant.children)) throw new Error('children');
          a.pregnant.children.forEach(function (c) {
            if (!c || (Object.keys(SPECIES).length && !getSpecies(c.species_id)) || !Array.isArray(c.perks) || ['male','female'].indexOf(c.gender) < 0) throw new Error('child');
          });
        }
      });
      return { ok: true };
    } catch (e) { return { ok: false, reason: 'invalid_livestock_state' }; }
  }

  function setState(incoming) {
    var check = validateState(incoming); if (!check.ok) throw new Error(check.reason);
    if (incoming == null) { initDemoState(); return { ok: true }; }
    incoming = JSON.parse(JSON.stringify(incoming));
    // 储能迁移（k89 电池经济最小闭环）：旧档 power_available=true → 给起步 500；false → 0（断电）
    if (incoming.power_charge == null) {
      incoming.power_charge = (incoming.power_available === false) ? 0 : 500;
    }
    incoming.power_charge = Math.max(0, Math.floor(Number(incoming.power_charge) || 0));
    delete incoming.power_available;
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
    migrateRetiredModules(state);
    (state.animals || []).forEach(function (a) { initializeNutrition(a, getSpecies(a.species_id)); });
    var maxSeq = 0;
    if (Array.isArray(state.animals)) {
      state.animals.forEach(function (a) {
        var m = /livestock_(\d+)/.exec(a.uid || '');
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      });
    }
    uidSeq = maxSeq + 1;
    return { ok: true };
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
    if (prod.nutrition_per_item > 0) {
      var status = getProductStatus(uid, productId);
      if (!status.ready) return { ok: false, reason: status.reason };
      a.production_buffers[productId] = Math.max(0, a.production_buffers[productId] - 1);
      return { ok: true, item_id: prod.item_id, count: 1 };
    }
    if (!isMature(a, sp)) return { ok: false, reason: 'immature' };
    if (prod.requires_gender && !hasGender(a, prod.requires_gender)) return { ok: false, reason: 'wrong_gender' };
    if (a.satiety <= 70) return { ok: false, reason: 'hungry' };
    if ((a.cooldowns && a.cooldowns[productId]) > 0) {
      return { ok: false, reason: 'cooldown', remaining: a.cooldowns[productId] };
    }
    if (prod.min_hp > 0 && a.hp < prod.min_hp) {
      return { ok: false, reason: 'low_hp' };
    }
    var cm = Math.min((cooldownMult != null && cooldownMult > 0) ? cooldownMult : 1, bestCollectorMultiplier(a));
    a.cooldowns[productId] = Math.max(1, Math.ceil(prod.cooldown_ticks * getModifier(a, 'product_cooldown_mult_' + productId) * cm / Math.max(1e-12, crowdingOutput(a))));
    if (prod.hp_cost > 0) {
      initializeNutrition(a, sp);
      a.nutrition_state.blood_damage = (a.nutrition_state.blood_damage || 0) + Math.min(a.hp, prod.hp_cost);
      a.hp = clamp(a.hp - prod.hp_cost, 0, 100);
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'blood_loss'; }
    }
    return { ok: true, item_id: prod.item_id, count: 1 };
  }

  // 屠宰动物，产出肉/器官/副产物。返回 { ok, items:[{item_id,count}], reason? }
  function previewSlaughter(uid) {
    var a = findAnimal(uid);
    if (!a || a.dead) return { ok: false, reason: 'not_found' };
    // 屠宰为手动操作（k93）：猪牛羊走轴心屠宰位、鸡走鸡笼（§11.3.4）均不耗电，无电力墙
    var sp = getSpecies(a.species_id);
    if (!sp || !sp.products || !sp.products.slaughter) return { ok: false, reason: 'no_products' };
    var st = ensureState();
    if (a.species_id === 'chicken' ? !hasCoop(st, a.arm_id) : !(st.axis && st.axis.slot1 && !st.axis.slot1.shadow && st.axis.slot1.module_id === 'slaughter')) return { ok: false, reason: a.species_id === 'chicken' ? 'no_coop' : 'no_slaughter' };
    var sl = sp.products.slaughter;
    var items = [];
    var weight = Math.max(0, Number(a.weight_kg) || 0);
    var floor = sl.health_floor == null ? 0.2 : sl.health_floor;
    var healthMult = floor + (1 - floor) * clamp(a.hp / 100, 0, 1);
    var itemWeights = sl.item_weights_kg || {};
    function unitWeight(id) {
      var IE = window.InventoryEquipment;
      var tpl = IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(id) : null;
      return Number(tpl && tpl.weight_kg != null ? tpl.weight_kg : itemWeights[id]);
    }
    var productIds = (sl.meat_item_ids || []).concat(sl.offal_item_ids || [], sl.byproduct_item_ids || []);
    if (productIds.some(function (id) { return !(unitWeight(id) > 0); })) return { ok: false, reason: 'missing_product_weight' };
    var meatFraction = (sl.meat_fraction == null ? 0.5 : sl.meat_fraction) * getModifier(a, 'slaughter_yield_mult');
    if (a.species_id !== 'chicken') {
      var slaughter = st.axis.slot1;
      meatFraction *= MODULE_EFFECTS.slaughter.yield_recovery[clamp(slaughter.level || 1, 1, 5) - 1];
    }
    var offalFraction = sl.offal_fraction == null ? 0.08 : sl.offal_fraction;
    var byFraction = sl.byproduct_fraction == null ? 0.12 : sl.byproduct_fraction;
    var normalize = Math.max(1, meatFraction + offalFraction + byFraction);
    var meatBudget = weight * healthMult * meatFraction / normalize;
    var shares = sl.meat_shares || sl.meat_item_ids.map(function () { return 1 / sl.meat_item_ids.length; });
    var shareTotal = shares.reduce(function (n, v) { return n + v; }, 0);
    var minimumWeight = Infinity, meatCount = 0, mass = 0;
    function add(id, budget) {
      var count = Math.floor((budget + 1e-9) / unitWeight(id));
      if (count > 0) { items.push({ item_id: id, count: count }); mass += count * unitWeight(id); }
      return count;
    }
    sl.meat_item_ids.forEach(function (id, i) {
      var share = shares[i] / shareTotal;
      if (share > 0 && meatFraction > 0) minimumWeight = Math.min(minimumWeight, unitWeight(id) * normalize / (healthMult * meatFraction * share));
      meatCount += add(id, meatBudget * share);
    });
    if (meatCount < 1) return { ok: false, reason: 'slaughter_underweight', minimum_weight_kg: Number.isFinite(minimumWeight) ? minimumWeight : null };
    // Anatomical shares use fixed item mass proportions; fractional parts never move into another cut.
    function addGroup(ids, fraction) {
      var total = ids.reduce(function (n, id) { return n + unitWeight(id); }, 0);
      ids.forEach(function (id) { add(id, weight * healthMult * fraction / normalize * unitWeight(id) / total); });
    }
    addGroup(sl.offal_item_ids || [], offalFraction); addGroup(sl.byproduct_item_ids || [], byFraction);
    return { ok: true, items: items, minimum_weight_kg: minimumWeight, output_mass_kg: mass, usable_meat_kg: meatBudget, health_multiplier: healthMult };
  }

  function slaughterAnimal(uid) {
    var result = previewSlaughter(uid);
    if (!result.ok) return result;
    var st = ensureState(), a = findAnimal(uid);
    releaseStoredProducts(st, a);
    // 预览与实际结算共用产出规则，失败时不删除动物。
    var idx = st.animals.indexOf(a);
    if (idx >= 0) st.animals.splice(idx, 1);
    return result;
  }

  // 清理尸体（病死/饿死/失血/老死），返回 { ok, cause? }
  function cleanCorpse(uid) {
    var st = ensureState();
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (a.uid === uid && a.dead) {
        var cause = a.death_cause || 'unknown';
        releaseStoredProducts(st, a);
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
    return troughsForAnimal({ location_type: 'zone', zone_id: zoneId })[0] || null;
  }

  // 投喂作物到饲料槽（直接投，营养值÷10 = 单位数）
  function addFeedToTrough(armId, cropItemId, count, slotKey) {
    var nut = getCropNutrition(cropItemId);
    if (nut == null) return { ok: false, reason: 'not_feed_crop' };
    var st = ensureState();
    var arm = st.arms[armId];
    var trough = slotKey ? arm && arm[slotKey] : findTroughOnArm(arm);
    if (!trough || isShadowSlot(trough) || getSlotModuleId(trough) !== 'feed_trough') {
      return { ok: false, reason: 'no_trough' };
    }
    if (trough.feed_units == null) trough.feed_units = 0;
    var c = Math.max(1, Math.floor(Number(count) || 1));
    var add = (nut / 10) * c;
    var before = trough.feed_units;
    if (!(nut > 0) || !(Number(count == null ? 1 : count) > 0)) return { ok: false, reason: 'invalid_amount' };
    if (before + add > getTroughCapacity(trough) + 1e-9) return { ok: false, reason: 'full' };
    var paid = consumeCrop(cropItemId, c);
    if (!paid.ok) return paid;
    trough.feed_units = clamp(trough.feed_units + add, 0, getTroughCapacity(trough));
    var added = trough.feed_units - before;
    return { ok: true, added: added, total: trough.feed_units };
  }

  /* ================= 手动操作（§12） ================= */

  function cleanZone(zoneId, amount) {
    var st = ensureState();
    var z = st.zones[zoneId];
    if (!z) return { ok: false, reason: 'no_zone' };
    removePollution(st, zoneId, amount || 10, true);
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
    if (!hasCoop(st, armId)) return { ok: false, reason: 'no_coop' };
    var troughs = troughsForAnimal({ location_type: 'coop', arm_id: armId });
    var requests = chicks.map(function (a) {
      var sp = getSpecies(a.species_id); initializeNutrition(a, sp);
      return { animal: a, sources: troughs, need: Math.max(0, nutritionConfig(sp).maintenance_per_tick * 20 - a.nutrition_state.feed_buffer) / 10, given: 0 };
    });
    distributeFeed(requests);
    var fed = 0;
    requests.forEach(function (r) { if (r.given > 0) { r.animal.nutrition_state.feed_buffer += r.given * 10; fed++; } });
    return { ok: fed > 0, fed: fed, reason: fed ? null : 'no_feed' };
  }

  /* ================= 模块装配 / 拆卸 / 升级 ================= */

  var ARM_SLOT_KEYS = ['inner', 'front', 'bottom', 'top', 'cw_side', 'ccw_side'];

  // 展开模块占用的面（modules.json 的 side 键 → cw_side/ccw_side）
  function expandModuleSlots(m, side) {
    var out = [];
    var s = (m && m.slots) || {};
    for (var k in s) {
      if (k === 'side') {
        out.push(Number(s[k]) >= 2 ? 'cw_side' : (side === 'ccw_side' ? side : 'cw_side'));
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
    if (RETIRED_MODULES[moduleId]) return { ok: false, reason: 'module_retired' };
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

    var slots = expandModuleSlots(m, slotKey);
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
    if (RETIRED_MODULES[moduleId]) return { ok: false, reason: 'module_retired' };
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
    var slots = expandModuleSlots(m, slotKey);
    holder.container[slotKey].occupied_slots = slots.slice();
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] !== slotKey) {
        holder.container[slots[i]] = { shadow: true, module_id: moduleId };
      }
    }
    return { ok: true };
  }

  function getModuleStorage() { var st = ensureState(); return st.module_storage || { records: [], items: {}, capacity: 32 }; }
  function claimModuleMaterials() {
    var box = getModuleStorage(), IE = window.InventoryEquipment, placed = 0;
    if (!IE || !IE.putItemIntoDefaultContainer) return { ok: false, reason: 'no_inventory' };
    Object.keys(box.items).forEach(function (id) {
      while (box.items[id] > 0) { var r = IE.putItemIntoDefaultContainer({ item_id: id }); if (!r || !r.placed) break; box.items[id]--; placed++; }
      if (!box.items[id]) delete box.items[id];
    });
    return { ok: placed > 0, placed: placed };
  }
  function restoreModuleResources(recordId, armId, slot) {
    var box = getModuleStorage(), record = box.records.filter(function (r) { return r.id === recordId; })[0];
    var holder = getArmOrAxis(armId), target = holder && holder.container[slot];
    if (!record || !target || target.shadow || target.module_id !== record.module_id) return { ok: false, reason: 'no_resource_receiver' };
    var src = record.resources;
    if ((src.feed_units || 0) + (target.feed_units || 0) > getTroughCapacity(target) + 1e-9) return { ok: false, reason: 'full' };
    var cap = target.module_id === 'feed_refine' ? MODULE_EFFECTS.feed_refine.cache_capacity[clamp(target.level || 1, 1, 5) - 1] : 0;
    if ((src.refine_cache || 0) + (target.refine_cache || 0) > cap + 1e-9) return { ok: false, reason: 'full' };
    if (src.cache && src.cache.items) {
      var count = Object.values(src.cache.items).reduce(function (n, c) { return n + c; }, 0);
      if (count + getWarehouseUsage() > getWarehouseCapacity()) return { ok: false, reason: 'full' };
    }
    ['feed_units','refine_cache','processing_units'].forEach(function (key) { if (src[key]) target[key] = (target[key] || 0) + src[key]; });
    ['input_queue','output_queue'].forEach(function (key) { if (src[key]) target[key] = (target[key] || []).concat(src[key]); });
    if (src.cache && src.cache.items) {
      target.cache = target.cache || { items: {} }; target.cache.items = target.cache.items || {};
      Object.keys(src.cache.items).forEach(function (id) { target.cache.items[id] = (target.cache.items[id] || 0) + src.cache.items[id]; });
    }
    box.records.splice(box.records.indexOf(record), 1); return { ok: true };
  }

  // Disassembly returns paid materials and preserves intermediate resources without converting them again.
  function dismountModule(armId, slotKey) {
    var holder = getArmOrAxis(armId);
    if (!holder) return { ok: false, reason: 'unknown_arm' };
    var inst = holder.container[slotKey];
    if (!inst) return { ok: false, reason: 'slot_empty' };
    if (isShadowSlot(inst)) return { ok: false, reason: 'shadow_slot' };
    var moduleId = inst.module_id;
    if (moduleId === 'coop' && ensureState().animals.some(function (a) { return a.location_type === 'coop' && a.arm_id === armId; })) return { ok: false, reason: 'coop_occupied' };
    var hasResources = (inst.feed_units || 0) > 0 || (inst.refine_cache || 0) > 0 || (inst.processing_units || 0) > 0 ||
      (inst.input_queue && inst.input_queue.length) || (inst.output_queue && inst.output_queue.length) ||
      (inst.cache && inst.cache.items && Object.keys(inst.cache.items).some(function (id) { return inst.cache.items[id] > 0; }));
    var box = getModuleStorage();
    if (hasResources && box.records.length >= box.capacity) return { ok: false, reason: 'transfer_full' };
    var refunds = {}, module = getModule(moduleId);
    function refundStep(step) { (step && step.inputs || []).forEach(function (i) { refunds[i.item_id] = (refunds[i.item_id] || 0) + i.count; }); }
    refundStep(getBuildStep(module.tier, 1));
    for (var level = 1; level < (inst.level || 1); level++) refundStep(getBuildStep(module.tier, level));
    if (inst.upgrading_remaining > 0) refundStep(getBuildStep(module.tier, inst.level || 1));
    ensureState().module_storage = box;
    Object.keys(refunds).forEach(function (id) { box.items[id] = (box.items[id] || 0) + refunds[id]; });
    if (hasResources) {
      var resources = {};
      ['feed_units','refine_cache','processing_units','input_queue','output_queue','cache'].forEach(function (key) { if (inst[key] != null) resources[key] = JSON.parse(JSON.stringify(inst[key])); });
      box.sequence = (box.sequence || 0) + 1;
      box.records.push({ id: 'transfer_' + box.sequence, module_id: moduleId, resources: resources });
    }
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

  var MODULE_EFFECTS = {}; // The module JSON owns all level effects.

  function healShared(st, clinics) {
    var animals = st.animals.filter(function (a) { return !a.dead && a.location_type === 'zone' && a.hp < 100 - nutritionInjury(a) - 1e-9; });
    animals.sort(function (a,b) { return a.hp - b.hp || (a.clinic_last_served || 0) - (b.clinic_last_served || 0) || String(a.uid).localeCompare(String(b.uid)); });
    animals.forEach(function (a) {
      var eligible = clinics.filter(function (c) { return c.remaining > 0 && c.zones.indexOf(a.zone_id) >= 0; });
      eligible.sort(function (a,b) { return b.heal - a.heal; });
      if (!eligible.length) return;
      var clinic = eligible[0]; clinic.remaining--;
      a.hp = Math.min(100 - nutritionInjury(a), a.hp + clinic.heal);
      a.clinic_last_served = st.elapsed_ticks || 1;
    });
  }

  function t(key, vars) {
    // 本文件为无参 IIFE（浏览器挂 window.LivestockState），不能裸引 global；
    // Node 冒烟测试设 globalThis.global，浏览器回退 window
    var root = (typeof global !== 'undefined' && global) || (typeof window !== 'undefined' ? window : globalThis);
    if (root && root.UIText && typeof root.UIText.t === 'function') return root.UIText.t(key, vars);
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
    if (moduleId === 'feed_trough') return t('livestock.effect.trough', { capacity: arr(eff.capacity), throughput: arr(eff.throughput) });
    if (moduleId === 'coop') return t('livestock.effect.coop', { capacity: arr(eff.capacity) });
    if (moduleId === 'slaughter') return t('livestock.effect.slaughter', { v: Math.round((arr(eff.yield_recovery) - 1) * 100) });
    if (moduleId === 'sprinkler') {
      var parts = [t('livestock.effect.grass_growth', { v: pct(arr(eff.growth)) })];
      if (arr(eff.decompact) > 0) parts.push(t('livestock.effect.decompact', { v: arr(eff.decompact).toFixed(3) }));
      return parts.join('；');
    }
    if (moduleId === 'clean_brush') {
      return t('livestock.effect.clean_brush', { v: arr(eff.per_round).toFixed(1) });
    }
    if (moduleId === 'tiller') {
      return t('livestock.effect.tiller', { v: arr(eff.per_tick).toFixed(3) });
    }
    if (moduleId === 'seeder') {
      return t('livestock.effect.seeder', { threshold: arr(eff.threshold).toFixed(1) + ' m', v: pct(arr(eff.growth)) });
    }
    if (moduleId === 'manure_net') {
      var mp = [t('livestock.effect.sheep_reduce', { v: pct(arr(eff.sheep_reduce)) })];
      if (arr(eff.trample_reduce) > 0) mp.push(t('livestock.effect.trample_reduce', { v: pct(arr(eff.trample_reduce)) }));
      return mp.join('；');
    }
    if (moduleId === 'pasture_arm') {
      var pp = [t('livestock.effect.tiller', { v: arr(eff.per_tick).toFixed(3) }), t('livestock.effect.grass_growth', { v: pct(arr(eff.growth)) })];
      pp.push(t('livestock.effect.seeder', { threshold: eff.seed_threshold.toFixed(1) + ' m', v: pct(arr(eff.seed_growth)) }));
      return pp.join('；');
    }
    if (moduleId === 'clinic_arm') {
      return t('livestock.effect.clinic', { v: arr(eff.heal).toFixed(3), n: arr(eff.count) });
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
    return '';
  }

  // 每 tick 结算模块效果：作用于该臂夹持两区（通过 zone 临时字段传递）
  function tickModules(st) {
    var clinics = [];
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
        // 生产力墙（k93）：需电模块缺电 → 本 tick 停摆（效果不结算）；非分档锁，装配/升级不受影响
        if (!isModulePowered(mid)) continue;
        var lv = Math.max(1, Math.min(5, inst.level || 1));
        var idx = lv - 1;
        var eff = MODULE_EFFECTS[mid];
        if (!eff) continue;
        if (mid === 'seeder' || mid === 'manure_net') {
          var side = (inst.occupied_slots || []).indexOf('ccw_side') >= 0 ? 0 : 1;
          var target = st.zones[zones[side]];
          if (target && mid === 'seeder' && target.grass_height < eff.threshold[idx]) target._mg = (target._mg || 1) * (1 + eff.growth[idx]);
          if (target && mid === 'manure_net') { target._sr = Math.max(target._sr || 0, eff.sheep_reduce[idx]); target._tr = Math.max(target._tr || 0, eff.trample_reduce[idx]); }
          continue;
        }
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
          autoCdMult = Math.min(autoCdMult, eff.cooldown_mult[idx] ?? 1);
          if (eff.clean_corpse && eff.clean_corpse[idx]) autoCleanCorpse = true;
        } else if (mid === 'feed_preprocess') {
          // 饲料预处理（§10.3）：作物 → 标准饲料自动入同臂槽
          tickFeedProcessing(st, inst, 1);
        } else if (mid === 'feed_refine') {
          // 饲料精加工臂（§11.4）：倍率加工 + 自动补槽
          var rmult = eff.refine_mult[idx] ?? 1.2;
          tickFeedProcessing(st, inst, rmult);

        }
      }

      zoneList.forEach(function (z) {
        if (decompact > 0) z._decompact_request = (z._decompact_request || 0) + decompact;
        if (cleanPerTick > 0) z._clean_request = (z._clean_request || 0) + cleanPerTick;
        z._mg = (z._mg || 1) * (1 + growthBonus);
        if (seedThreshold != null && z.grass_height != null && z.grass_height < seedThreshold) {
          z._mg = z._mg * (1 + seedGrowth);
        }
        if (sheepReduce > 0) z._sr = Math.max(z._sr || 0, sheepReduce);
        if (trampleReduce > 0) z._tr = Math.max(z._tr || 0, trampleReduce);
      });
      if (clinicHeal > 0) clinics.push({ zones: zones, heal: clinicHeal, remaining: clinicCount });

      // 手动采集臂（§11.4）：自动收割夹持两区冷却完毕的活体产物；Lv4+ 自动清尸
      if (autoCollectActive) {
        // 有中央仓储枢纽（§11.6.1）时产物入轴心缓存，否则进背包队列；
        // 枢纽为需电模块（k93）：缺电时采集产物回落背包，不入缓存
        var hasHub = isModulePowered('warehouse_hub') && !!getWarehouseHub();
        st.pending_auto_items = st.pending_auto_items || [];
        // 自动采集（不给经验，§9.3 只给手动）
        st.animals.forEach(function (a) {
          if (a.dead) return;
          if (a.location_type === 'coop' ? a.arm_id !== ak : zones.indexOf(a.zone_id) < 0) return;
          var asp = getSpecies(a.species_id);
          if (!asp || !asp.products || !asp.products.living) return;
          asp.products.living.forEach(function (p) {
            var r = collectProduct(a.uid, p.product_id, autoCdMult);
            if (r.ok) {
              if (!hasHub || !warehouseAdd(r.item_id)) {
                st.pending_auto_items.push({ item_id: r.item_id, count: r.count, uid: a.uid });
              }
            }
          });
        });
        // Lv4+ 自动清尸（§9.3 不给经验，尸体直接移除）
        if (autoCleanCorpse) {
          for (var ci = st.animals.length - 1; ci >= 0; ci--) {
            var c = st.animals[ci];
            if (c.dead && (c.location_type === 'coop' ? c.arm_id === ak : zones.indexOf(c.zone_id) >= 0)) {
              releaseStoredProducts(st, c);
              st.animals.splice(ci, 1);
            }
          }
        }
      }
    }
    healShared(st, clinics);
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
      delete z._clean_request;
      delete z._decompact_request;
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
    return (eff && eff.capacity[lv - 1]) ?? 50;
  }

  // 仓储当前占用（格数，每种产物 1 格）
  function getWarehouseUsage() {
    var hub = getWarehouseHub();
    if (!hub || !hub.cache || !hub.cache.items) return 0;
    return Object.keys(hub.cache.items).reduce(function (n, id) { return n + Math.max(0, Number(hub.cache.items[id]) || 0); }, 0);
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
    trough.feed_units = clamp(trough.feed_units + units, 0, getTroughCapacity(trough));
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
    if (!(nut > 0) || !(Number(count == null ? 1 : count) > 0)) return { ok: false, reason: 'invalid_amount' };
    var paid = consumeCrop(cropItemId, c);
    if (!paid.ok) return paid;
    var removed = c;
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
    if (!inst) return;
    var arm = findArmForModuleInstance(st, inst);
    var receivers = [];
    function addReceivers(a) { ['cw_side', 'ccw_side'].forEach(function (s) {
      var t = a && a[s]; if (t && !t.shadow && t.module_id === 'feed_trough') receivers.push(t);
    }); }
    addReceivers(arm);
    var lv = clamp(inst.level || 1, 1, 5);
    if (inst.module_id === 'feed_refine' && MODULE_EFFECTS.feed_refine.adjacent_delivery[lv - 1]) {
      var keys = Object.keys(st.arms).sort(), index = keys.indexOf(Object.keys(st.arms).filter(function (k) { return st.arms[k] === arm; })[0]);
      if (index >= 0) { addReceivers(st.arms[keys[(index + 1) % keys.length]]); addReceivers(st.arms[keys[(index + keys.length - 1) % keys.length]]); }
    }
    var cacheCap = inst.module_id === 'feed_refine' ? MODULE_EFFECTS.feed_refine.cache_capacity[lv - 1] : 0;
    inst.refine_cache = Math.max(0, inst.refine_cache || 0);
    var speed = MODULE_EFFECTS[inst.module_id].transfer_units_per_tick[lv - 1];
    function deliver(amount) {
      var space = receivers.reduce(function (n, t) { return n + Math.max(0, getTroughCapacity(t) - (t.feed_units || 0)); }, 0);
      var out = Math.min(amount, space);
      if (space > 0) receivers.forEach(function (t) { addUnitsToTrough(t, out * Math.max(0, getTroughCapacity(t) - (t.feed_units || 0)) / space); });
      return out;
    }
    var flushed = deliver(Math.min(speed, inst.refine_cache));
    inst.refine_cache -= flushed; speed -= flushed;
    var space = receivers.reduce(function (n, t) { return n + Math.max(0, getTroughCapacity(t) - (t.feed_units || 0)); }, 0) + Math.max(0, cacheCap - inst.refine_cache);
    if (space <= 1e-9 || speed <= 1e-9) return;
    while (speed > 1e-9 && space > 1e-9) {
      if (!(inst.processing_units > 1e-9)) {
        var q = inst.input_queue && inst.input_queue[0];
        if (!q || !(q.nutrition > 0) || !(q.count > 0)) break;
        inst.processing_units = q.nutrition / 10 * (refineMult ?? 1);
        q.count--; if (q.count <= 0) inst.input_queue.shift();
      }
      var transfer = Math.min(speed, space, inst.processing_units);
      var delivered = deliver(transfer);
      inst.refine_cache += transfer - delivered;
      inst.processing_units = Math.max(0, inst.processing_units - transfer);
      speed -= transfer; space -= transfer;
    }
  }

  function consumeCrop(itemId, count) {
    var IE = window.InventoryEquipment;
    if (!IE || typeof IE.removeCarriedItemsByTemplateId !== 'function') return { ok: false, reason: 'no_inventory' };
    var r = IE.removeCarriedItemsByTemplateId(itemId, count);
    return r && r.ok ? { ok: true } : { ok: false, reason: 'not_enough_crop' };
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

  // Compatibility tombstones: retired modules cannot be reactivated.
  function getClimateControl() { return null; }
  function climateSetMode() { return { ok: false, reason: 'module_retired' }; }
  function getClimateModifiers() { return { grassMult: 1, satietyMult: 1, pollutionClean: 0, compactionUp: 0 }; }
  function getWasteHeatRecycle() { return null; }
  function wasteHeatSetMode() { return { ok: false, reason: 'module_retired' }; }
  function wasteHeatTakeAll() { return []; }
  function getLinkSchedule() { return null; }
  function linkScheduleToggleRule() { return { ok: false, reason: 'module_retired' }; }

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

  function hasCoop(st, armId) {
    var arm = st.arms[armId];
    return !!(arm && ARM_SLOT_KEYS.some(function (s) { var m = arm[s]; return m && !m.shadow && m.module_id === 'coop'; }));
  }

  function getTroughCapacity(inst) { var e = MODULE_EFFECTS.feed_trough; return e ? e.capacity[clamp(inst.level || 1, 1, 5) - 1] : 100; }
  function getTroughThroughput(inst) { var e = MODULE_EFFECTS.feed_trough; return e ? e.throughput[clamp(inst.level || 1, 1, 5) - 1] : 0.25; }
  function feedAvailable(inst) { return Math.min(Math.max(0, inst.feed_units || 0), inst._feed_remaining == null ? getTroughThroughput(inst) : inst._feed_remaining); }
  function getCoopCapacity(armId) {
    var arm = ensureState().arms[armId], capacity = 0;
    ARM_SLOT_KEYS.forEach(function (slot) { var m = arm && arm[slot]; if (m && !m.shadow && m.module_id === 'coop') capacity = MODULE_EFFECTS.coop.capacity[clamp(m.level || 1, 1, 5) - 1]; });
    return capacity;
  }
  function canAdmitAnimal(speciesId, locId) {
    if (!getSpecies(speciesId)) return { ok: false, reason: 'unknown_species' };
    var st = ensureState();
    if (speciesId !== 'chicken') return st.zones[locId] ? { ok: true } : { ok: false, reason: 'no_zone' };
    var cap = getCoopCapacity(locId);
    if (!cap) return { ok: false, reason: 'no_coop' };
    var used = st.animals.filter(function (a) { return a.location_type === 'coop' && a.arm_id === locId; }).length;
    return used < cap ? { ok: true } : { ok: false, reason: 'coop_full' };
  }
  // External capture/merchant adapters transfer a paid juvenile through this capacity-checked boundary.
  function admitAnimal(speciesId, locId, opts) {
    var check = canAdmitAnimal(speciesId, locId); if (!check.ok) return check;
    var sp = getSpecies(speciesId); opts = opts || {};
    var a = makeAnimal(speciesId, speciesId === 'chicken' ? 'female' : (opts.gender || (Math.random() < 0.5 ? 'male' : 'female')), speciesId === 'chicken' ? 'coop' : 'zone', locId,
      { weight_kg: sp.growth.birth_weight_kg, age_ticks: 0, satiety: 80, perks: opts.perks || rollPerks(speciesId) });
    initializeNutrition(a, sp); ensureState().animals.push(a); return { ok: true, uid: a.uid };
  }

  function troughsForAnimal(a) {
    var st = ensureState(), out = [];
    Object.keys(st.arms || {}).sort().forEach(function (ak) {
      var arm = st.arms[ak], zones = st.arm_zones[ak] || [];
      ['ccw_side', 'cw_side'].forEach(function (s, i) {
        var t = arm[s];
        if (!t || t.shadow || t.module_id !== 'feed_trough') return;
        if (a.location_type === 'coop' ? a.arm_id === ak && hasCoop(st, ak) : a.zone_id === zones[i]) out.push(t);
      });
    });
    return out;
  }

  // Simultaneous proportional allocation. Each source is debited only once per pass.
  // A request may draw from both adjacent troughs, but cannot borrow an unreachable source.
  function distributeFeed(requests) {
    requests.sort(function (a, b) { return String(a.animal.uid).localeCompare(String(b.animal.uid)); });
    for (var pass = 0; pass < 8; pass++) {
      var sources = [], totals = [], offers = [];
      requests.forEach(function (r) {
        var remaining = Math.max(0, r.need - r.given);
        var available = r.sources.reduce(function (n, s) { return n + feedAvailable(s); }, 0);
        if (remaining < 1e-12 || available < 1e-12) return;
        r.sources.forEach(function (s) {
          var amount = remaining * feedAvailable(s) / available;
          var index = sources.indexOf(s);
          if (index < 0) { index = sources.length; sources.push(s); totals.push(0); }
          totals[index] += amount; offers.push({ request: r, source: index, amount: amount });
        });
      });
      if (!offers.length) break;
      var used = sources.map(function () { return 0; });
      offers.forEach(function (o) {
        var amount = o.amount * Math.min(1, feedAvailable(sources[o.source]) / totals[o.source]);
        o.request.given += amount; used[o.source] += amount;
      });
      sources.forEach(function (s, i) { s.feed_units = Math.max(0, (s.feed_units || 0) - used[i]); s._feed_remaining = Math.max(0, (s._feed_remaining == null ? getTroughThroughput(s) : s._feed_remaining) - used[i]); });
    }
  }

  function removePollution(st, zoneId, amount, recoverable) {
    var z = st.zones[zoneId];
    if (!z) return 0;
    var actual = Math.min(Math.max(0, z.pollution || 0), Math.max(0, amount || 0));
    z.pollution = Math.max(0, (z.pollution || 0) - actual);
    return actual;
  }

  function nutritionConfig(sp) {
    return sp.nutrition || { maintenance_per_tick: sp.satiety.drain_per_tick / 10, grass_nutrition_per_m: 3000,
      full_supply_ratio: 4, full_entry_ratio: 3.8, supply_smoothing_ticks: 60, feed_max_units_per_tick: 0.1,
      reserve_refill_fraction: 0.5, hunger_damage_hp_per_tick: 100 / (sp.satiety.starvation_dying_ticks || 1000),
      hunger_recovery_hp_per_tick: 0.05, recovery_nutrition_per_hp: 0.1 };
  }

  function nutritionInjury(a) { var n = a.nutrition_state || {}; return (n.hunger_damage || 0) + (n.blood_damage || 0) + (n.crowding_damage || 0); }

  function bodyLoad(a, sp) {
    var cfg = sp && sp.nutrition && sp.nutrition.body_load;
    if (!cfg) return 1;
    var weight = clamp(Number(a.weight_kg) || 0, 0, sp.growth.fatten_cap_kg);
    return Math.max(cfg.minimum, Math.pow(weight / cfg.reference_weight_kg, cfg.exponent));
  }

  function getAnimalLoad(uid) {
    var a = findAnimal(uid), sp = a && getSpecies(a.species_id);
    if (!sp) return null;
    var current = bodyLoad(a, sp), full = bodyLoad({ weight_kg: sp.growth.fatten_cap_kg }, sp);
    return { current: current, at_full_weight: full,
      maintenance: nutritionConfig(sp).maintenance_per_tick * current * getModifier(a, 'satiety_drain_mult'),
      maintenance_at_full_weight: nutritionConfig(sp).maintenance_per_tick * full * getModifier(a, 'satiety_drain_mult') };
  }

  function getGrazingStatus(uid) {
    var a = findAnimal(uid), sp = a && getSpecies(a.species_id);
    if (!sp || !sp.graze || a.dead || a.location_type !== 'zone') return null;
    var zone = ensureState().zones[a.zone_id], g = sp.graze;
    if (!zone) return null;
    if (g.edible_max_m != null && zone.grass_height > g.edible_max_m) return 'too_high';
    if (zone.grass_height <= g.edible_min_m) return 'too_low';
    return 'available';
  }

  function initializeNutrition(a, sp) {
    if (!a || !sp) return;
    if (a.nutrition_state && a.nutrition_state.version === 1) { delete a.starvation_ticks; return; }
    var cfg = nutritionConfig(sp), damage = Math.min(a.hp || 0, Math.max(0, a.starvation_ticks || 0) * cfg.hunger_damage_hp_per_tick);
    a.hp = clamp((a.hp == null ? 100 : a.hp) - damage, 0, 100);
    a.satiety = clamp(a.satiety, 0, 100);
    a.nutrition_state = { version: 1, average_supply: 0, hunger_damage: damage, feed_buffer: 0, tier: 'insufficient' };
    a.production_buffers = a.production_buffers || {};
    delete a.starvation_ticks;
    if (a.species_id === 'chicken') a.gender = 'female';
    if (a.hp <= 0 && !a.dead) { a.dead = true; a.death_cause = 'starvation'; }
  }

  function getNutritionStatus(uid) {
    var a = findAnimal(uid), n = a && a.nutrition_state;
    return n ? JSON.parse(JSON.stringify(n)) : { tier: 'unsettled', average_supply: 0 };
  }

  function bestCollectorMultiplier(a) {
    var st = ensureState(), best = 1;
    Object.keys(st.arms || {}).forEach(function (ak) {
      var covered = a.location_type === 'coop' ? a.arm_id === ak && hasCoop(st, ak) : (st.arm_zones[ak] || []).indexOf(a.zone_id) >= 0;
      if (!covered) return;
      ARM_SLOT_KEYS.forEach(function (slot) {
        var m = st.arms[ak][slot];
        if (m && !m.shadow && m.module_id === 'auto_collect') best = Math.min(best, MODULE_EFFECTS.auto_collect.cooldown_mult[clamp(m.level || 1, 1, 5) - 1]);
      });
    });
    return best;
  }

  function productPlans(a, sp) {
    if (a.dead || a.hp <= 0) return [];
    if (a.location_type === 'coop' && !hasCoop(ensureState(), a.arm_id)) return [];
    var best = bestCollectorMultiplier(a);
    return (sp.products && sp.products.living || []).filter(function (p) {
      return p.nutrition_per_item > 0 && productEligible(a, sp, p);
    }).map(function (p) {
      var stored = Math.max(0, (a.production_buffers || {})[p.product_id] || 0);
      var period = Math.max(1, p.cooldown_ticks * getModifier(a, 'product_cooldown_mult_' + p.product_id) * best);
      var step = Math.min(Math.max(0, (p.storage_capacity ?? 1) - stored), a.hp / 100 * crowdingOutput(a) / period);
      return { product: p, step: step, need: step * p.nutrition_per_item };
    }).filter(function (p) { return p.need > 1e-12; });
  }

  function getProductStatus(uid, productId) {
    var a = findAnimal(uid), sp = a && getSpecies(a.species_id);
    var p = (sp && sp.products && sp.products.living || []).filter(function (p) { return p.product_id === productId; })[0];
    if (!a || a.dead || !p) return { ready: false, reason: 'not_found' };
    if (p.nutrition_per_item > 0) {
      var progress = (a.production_buffers || {})[productId] || 0;
      if (progress < 1 - 1e-9 && p.requires_gender && !hasGender(a, p.requires_gender)) return { ready: false, progress: progress, reason: 'wrong_gender' };
      if (progress < 1 - 1e-9 && !productEligible(a, sp, p)) return { ready: false, progress: progress, reason: 'immature', min_age_ticks: p.min_age_ticks ?? sp.growth.maturity_ticks };
      return { ready: progress >= 1 - 1e-9, progress: progress, reason: progress >= 1 - 1e-9 ? null : 'not_ready' };
    }
    return { ready: isMature(a, sp) && a.satiety > 70 && a.hp >= (p.min_hp || 0) && !((a.cooldowns || {})[productId] > 0), remaining: (a.cooldowns || {})[productId] || 0 };
  }

  // Preserve already completed products when the animal dies or is slaughtered.
  function releaseStoredProducts(st, a) {
    var sp = getSpecies(a.species_id);
    (sp && sp.products && sp.products.living || []).forEach(function (p) {
      if (!(p.nutrition_per_item > 0)) return;
      var count = Math.floor(((a.production_buffers || {})[p.product_id] || 0) + 1e-9);
      if (count < 1) return;
      st.pending_auto_items = st.pending_auto_items || [];
      st.pending_auto_items.push({ item_id: p.item_id, count: count, uid: a.uid });
      a.production_buffers[p.product_id] = Math.max(0, a.production_buffers[p.product_id] - count);
    });
  }

  function settleHerdResources(st) {
    var crowd = getCapacityStatus();
    st.animals.forEach(function (a) { initializeNutrition(a, getSpecies(a.species_id)); });
    var live = st.animals.filter(function (a) { return !a.dead && getSpecies(a.species_id); })
      .sort(function (a, b) { return String(a.uid).localeCompare(String(b.uid)); });
    var rows = live.map(function (a) {
      var sp = getSpecies(a.species_id), cfg = nutritionConfig(sp), ns = a.nutrition_state;
      var load = bodyLoad(a, sp);
      var maintenance = cfg.maintenance_per_tick * load * getModifier(a, 'satiety_drain_mult') * (a.species_id === 'chicken' ? 1 : crowd.maintenance);
      var buffer = Math.min(Math.max(0, ns.feed_buffer || 0), cfg.feed_max_units_per_tick * 10 * load);
      ns.feed_buffer = Math.max(0, (ns.feed_buffer || 0) - buffer);
      return { a: a, sp: sp, cfg: cfg, load: load, maintenance: maintenance, intake: buffer, feed: buffer,
        grass: 0, pollution: 0, grassTaken: 0, maxFeed: Math.max(0, cfg.feed_max_units_per_tick * 10 * load - buffer) };
    });
    Object.keys(st.zones).sort().forEach(function (zid) {
      var z = st.zones[zid], residents = rows.filter(function (r) { return r.a.location_type === 'zone' && r.a.zone_id === zid; });
      var pollution = 0, clean = z._clean_request || 0, compact = -(z._decompact_request || 0), uproot = 0;
      residents.forEach(function (r) {
        var imp = r.sp.ecosystem_impact || {}, a = r.a;
        compact += r.load * ((imp.trample_per_tick || 0) * getModifier(a, 'trample_mult') * (1 - (z._tr || 0)) * crowd.ecology + (imp.root_clean_per_tick || 0));
        var p = (imp.pollution_pct_per_tick || 0) * r.load;
        if (p > 0) pollution += p * crowd.ecology * getModifier(a, 'pollution_rate_mult') * (1 - (z._sr || 0)); else clean -= p;
        if (imp.uproots_grass) uproot += r.load * (imp.root_grass_m_per_tick == null ? 1.5 : imp.root_grass_m_per_tick);
      });
      z.compaction = clamp(z.compaction + compact, 0, 100);
      z.pollution = clamp(z.pollution + pollution, 0, 100);
      removePollution(st, zid, clean, false);
      if (uproot > 0) z.grass_height = Math.max(0, z.grass_height - uproot);
      var initialHeight = z.grass_height, height = initialHeight;
      var requests = residents.filter(function (r) {
        var g = r.sp.graze;
        return g && initialHeight > g.edible_min_m && (g.edible_max_m == null || initialHeight <= g.edible_max_m);
      }).map(function (r) {
        var g = r.sp.graze, comfort = initialHeight >= g.comfort_min_m && (g.comfort_max_m == null || initialHeight <= g.comfort_max_m);
        return { row: r, floor: g.edible_min_m, remaining: g.comfort_rate_m_per_tick * r.load * (comfort ? 1 : g.non_comfort_mult) * getModifier(r.a, 'graze_rate_mult') };
      });
      // Work from the top down; a grazer never receives a layer below its own floor.
      while (requests.length) {
        var active = requests.filter(function (r) { return r.remaining > 1e-12 && height > r.floor + 1e-12; });
        if (!active.length) break;
        var nextFloor = Math.max.apply(null, active.map(function (r) { return r.floor; }));
        var demand = active.reduce(function (n, r) { return n + r.remaining; }, 0);
        var take = Math.min(height - nextFloor, demand);
        active.forEach(function (r) {
          var eaten = take * r.remaining / demand;
          r.remaining = Math.max(0, r.remaining - eaten); r.row.grassTaken += eaten;
          var nutrition = eaten * r.row.cfg.grass_nutrition_per_m;
          r.row.grass += nutrition; r.row.intake += nutrition;
        });
        height = Math.max(nextFloor, height - take);
        if (take >= demand - 1e-12) break;
      }
      z.grass_height = height;
    });
    var cleaning = {};
    rows.filter(function (r) { return r.a.location_type === 'coop' && hasCoop(st, r.a.arm_id); }).forEach(function (r) {
      var cfg = r.sp.coop_nutrition || {}, zones = (st.arm_zones[r.a.arm_id] || []).filter(function (id) { return st.zones[id]; });
      var total = zones.reduce(function (n, id) { return n + st.zones[id].pollution; }, 0);
      zones.forEach(function (id) {
        var demand = total > 0 ? (cfg.clean_per_tick == null ? 0.007 : cfg.clean_per_tick) * r.load * st.zones[id].pollution / total : 0;
        (cleaning[id] || (cleaning[id] = [])).push({ row: r, demand: demand, conversion: cfg.nutrition_per_pollution == null ? 1.8 : cfg.nutrition_per_pollution });
      });
    });
    Object.keys(cleaning).sort().forEach(function (id) {
      var req = cleaning[id], total = req.reduce(function (n, r) { return n + r.demand; }, 0);
      var actual = removePollution(st, id, Math.min(total, st.zones[id].pollution * 0.5), false);
      req.forEach(function (r) {
        var n = total > 0 ? actual * r.demand / total * r.conversion : 0;
        r.row.intake += n; r.row.pollution += n;
      });
    });
    function requestFeed(target) {
      var req = rows.map(function (r) { return { animal: r.a, row: r, sources: troughsForAnimal(r.a), need: Math.min(r.maxFeed, Math.max(0, target(r) - r.intake)) / 10, given: 0 }; });
      distributeFeed(req);
      req.forEach(function (q) { var n = q.given * 10; q.row.intake += n; q.row.feed += n; q.row.maxFeed = Math.max(0, q.row.maxFeed - n); });
    }
    // Shared supply pays everyone's maintenance before growth/production requests.
    requestFeed(function (r) { return r.maintenance; });
    rows.forEach(function (r) {
      var a = r.a, g = r.sp.growth, cfg = r.cfg;
      r.reservePerSatiety = cfg.maintenance_per_tick * (r.sp.satiety.starvation_to_zero_ticks || 2000) / 100;
      r.refill = Math.min(Math.max(0, 100 - a.satiety) * r.reservePerSatiety, r.maintenance * cfg.reserve_refill_fraction);
      r.crowdRecovery = crowd.ratio <= (PASTURE_RULES.recovery_threshold ?? 1.1) ? Math.min(a.nutrition_state.crowding_damage || 0, (PASTURE_RULES.recovery_hp_per_round ?? 4) / 1000) : 0;
      r.recovery = (Math.min((a.nutrition_state.hunger_damage || 0) + (a.nutrition_state.blood_damage || 0), cfg.hunger_recovery_hp_per_tick) + r.crowdRecovery) * cfg.recovery_nutrition_per_hp;
      var juvenile = r.sp.graze && a.weight_kg < g.graze_cap_kg;
      var rate = juvenile ? g.graze_growth_rate_kg_per_tick : (r.sp.feed.feed_units_per_tick || 0) * 10 / r.sp.feed.nutrition_per_kg_meat;
      if (!juvenile && r.sp.graze && g.fatten_ramp_end_kg > g.graze_cap_kg) {
        var fattenBlend = clamp((a.weight_kg - g.graze_cap_kg) / (g.fatten_ramp_end_kg - g.graze_cap_kg), 0, 1);
        rate = g.graze_growth_rate_kg_per_tick * (1 - fattenBlend) + rate * fattenBlend;
      }
      if (a.location_type === 'coop') rate = ((r.sp.coop_nutrition || {}).growth_nutrition_per_tick || 0.0126) / r.sp.feed.nutrition_per_kg_meat;
      if (g.target_fatten_ticks > 0) rate = lifecycleGrowth(a, r.sp);
      rate *= (a.species_id === "chicken" ? 1 : crowd.output) * a.hp / 100;
      r.growthCap = g.fatten_cap_kg;
      r.conversion = getModifier(a, 'feed_conversion_mult');
      r.growthKg = Math.min(Math.max(0, r.growthCap - a.weight_kg), Math.max(0, rate) * getModifier(a, 'growth_rate_mult') * r.conversion);
      r.growthNeed = r.growthKg * r.sp.feed.nutrition_per_kg_meat / r.conversion;
      r.plans = productPlans(a, r.sp);
      r.productNeed = r.plans.reduce(function (n, p) { return n + p.need; }, 0);
      r.gestationNeed = a.pregnant && r.sp.reproduction ? (r.sp.reproduction.gestation_nutrition_per_tick ?? 0) : 0;
    });
    requestFeed(function (r) {
      var demand = r.maintenance + r.refill + r.recovery + r.growthNeed + r.productNeed + r.gestationNeed;
      return r.plans.length ? Math.max(demand, r.maintenance * r.cfg.full_supply_ratio) : demand;
    });
    rows.forEach(function (r) {
      var a = r.a, ns = a.nutrition_state, cfg = r.cfg;
      var usedMaintenance = Math.min(r.intake, r.maintenance), remaining = Math.max(0, r.intake - usedMaintenance);
      var deficit = Math.max(0, r.maintenance - usedMaintenance), reserveUsed = Math.min(deficit, a.satiety * r.reservePerSatiety);
      a.satiety = clamp(a.satiety - reserveUsed / r.reservePerSatiety, 0, 100); deficit -= reserveUsed;
      var damage = Math.min(a.hp, cfg.hunger_damage_hp_per_tick * deficit / r.maintenance);
      if (damage > 0) { a.hp = Math.max(0, a.hp - damage); ns.hunger_damage = Math.min(100 - a.hp, ns.hunger_damage + damage); }
      var refilled = Math.min(remaining, r.refill); remaining -= refilled;
      a.satiety = clamp(a.satiety + refilled / r.reservePerSatiety, 0, 100);
      var recoverySpent = Math.min(remaining, r.recovery); remaining -= recoverySpent;
      var recoveredHp = cfg.recovery_nutrition_per_hp > 0 ? recoverySpent / cfg.recovery_nutrition_per_hp : 0;
      var hungerHealed = Math.min(ns.hunger_damage, recoveredHp);
      ns.hunger_damage = Math.max(0, ns.hunger_damage - hungerHealed);
      var bloodHealed = Math.min(ns.blood_damage || 0, Math.max(0, recoveredHp - hungerHealed));
      ns.blood_damage = Math.max(0, (ns.blood_damage || 0) - bloodHealed);
      ns.crowding_damage = Math.max(0, (ns.crowding_damage || 0) - Math.max(0, recoveredHp - hungerHealed - bloodHealed));
      a.hp = clamp(a.hp + recoveredHp, 0, 100);
      var coverage = r.intake / r.maintenance;
      ns.average_supply += (Math.min(8, coverage) - ns.average_supply) / cfg.supply_smoothing_ticks;
      ns.tier = coverage < 1 - 1e-9 ? 'insufficient' : (coverage >= cfg.full_entry_ratio && ns.average_supply >= cfg.full_entry_ratio ? 'full' : 'growth');
      var productionNeed = ns.tier === 'full' ? r.productNeed : 0;
      var demand = r.growthNeed + productionNeed + r.gestationNeed;
      var scale = demand > 0 ? Math.min(1, remaining / demand) : 0;
      var growthSpent = r.growthNeed * scale, productionSpent = productionNeed * scale;
      var gestationSpent = r.gestationNeed * scale;
      remaining -= growthSpent + productionSpent + gestationSpent;
      var gain = growthSpent / r.sp.feed.nutrition_per_kg_meat * r.conversion;
      a.weight_kg = Math.min(r.growthCap, a.weight_kg + gain);
      if (productionSpent > 0) r.plans.forEach(function (p) {
        var id = p.product.product_id;
        a.production_buffers[id] = Math.min(p.product.storage_capacity ?? 1, (a.production_buffers[id] || 0) + p.step * scale);
      });
      var lostWeight = 0;
      if (coverage < 1 && a.satiety < 30) {
        lostWeight = Math.min(Math.max(0, a.weight_kg - r.sp.growth.birth_weight_kg), (r.sp.growth.graze_growth_rate_kg_per_tick || 0.0001) * (1 - coverage));
        a.weight_kg -= lostWeight;
      }
      ns.last = { intake: r.intake, grass: r.grass, grass_taken_m: r.grassTaken, feed: r.feed, pollution_food: r.pollution,
        maintenance_required: r.maintenance, maintenance_paid: usedMaintenance + reserveUsed, reserve_used: reserveUsed,
        reserve_refilled: refilled, recovery_spent: recoverySpent, growth_spent: growthSpent, production_spent: productionSpent,
        gestation_spent: gestationSpent, gestation_progress: r.gestationNeed > 0 ? scale : (a.pregnant && coverage >= 1 ? 1 : 0),
        unused: Math.max(0, remaining), shortfall: deficit, weight_gain_kg: gain, weight_loss_kg: lostWeight };
      if (a.hp <= 1e-9) { a.hp = 0; a.dead = true; a.death_cause = 'starvation'; }
    });
  }

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
      if (hasGender(male, 'male') && isMature(male, sp) && male.satiety > 70 && male.hp > 90 && fedForBreeding(male) && hasPerk(male, 'earth_cry') && (male.earth_cry_cooldown || 0) <= 0) {
        var adj = adjacentZones(st, male.zone_id);
        var acted = false;
        // 每轮一次结算 → 概率用「一轮等效概率」= 1-(1-p)^1000（羊≈31%、猪≈39%、牛≈18%）
        var baseP = sp.reproduction.base_pregnancy_rate_per_tick ?? 0.0002;
        var roundP = 1 - Math.pow(1 - baseP, st.rotation_total_ticks);
        adj.forEach(function (zid) {
          var zone = zones[zid];
          if (!zone || zone.pollution >= 30) return;
          st.animals.forEach(function (female) {
            if (female.dead || female.uid === male.uid) return;
            if (female.species_id !== male.species_id) return;
            if (female.location_type !== 'zone' || female.zone_id !== zid) return;
            if (!hasGender(female, 'female')) return;
            if (!canConceive(female, sp, zone)) return;
            acted = true;
            var pregRate = roundP * getModifier(female, 'fertility_mult') * getCapacityStatus().fertility;
            if (Math.random() < pregRate) {
              female.pregnant = createPregnancy(female, male, sp);
            }
          });
        });
        if (acted) male.earth_cry_cooldown = perkParam('earth_cry', 'cooldown_ticks', 10000);
      }

      // 越界播种（§8.4）：猪公 → 相邻两区成年母羊 15% 产猪崽（Perk 池从父猪+母羊合并）；成功后冷却 10000 tick
      if (male.species_id === 'pig' && hasGender(male, 'male') && isMature(male, sp) && male.satiety > 70 && male.hp > 90 && fedForBreeding(male) && hasPerk(male, 'crossbreed_swine') && (male.crossbreed_cooldown || 0) <= 0) {
        var adjZ = adjacentZones(st, male.zone_id);
        var sheepSp = getSpecies('sheep');
        adjZ.forEach(function (zid) {
          var zone = zones[zid];
          if (!zone || zone.pollution >= 30) return;
          st.animals.forEach(function (ewe) {
            if (ewe.dead || ewe.uid === male.uid) return;
            if (ewe.species_id !== 'sheep') return;
            if (ewe.location_type !== 'zone' || ewe.zone_id !== zid) return;
            if (!hasGender(ewe, 'female')) return;
            if (!canConceive(ewe, sheepSp, zone)) return;
            if (Math.random() < perkParam('crossbreed_swine', 'trigger_chance', 0.15) * getCapacityStatus().fertility) {
              ewe.pregnant = createPregnancy(ewe, male, sheepSp, { crossbreed: true });
              male.crossbreed_cooldown = perkParam('crossbreed_swine', 'cooldown_ticks', 10000);
            }
          });
        });
      }
    });
  }

  function advanceTick() {
    var st = ensureState();
    st.elapsed_ticks = (st.elapsed_ticks || 0) + 1;
    Object.keys(st.arms).forEach(function (ak) { ARM_SLOT_KEYS.forEach(function (slot) { var m = st.arms[ak][slot]; if (m && !m.shadow && m.module_id === 'feed_trough') m._feed_remaining = getTroughThroughput(m); }); });
    st.animals.forEach(function (a) { initializeNutrition(a, getSpecies(a.species_id)); });

    st.animals.forEach(function (a) {
      var sp = getSpecies(a.species_id);
      if (a.pregnant && !a.pregnant.children && sp && sp.reproduction) {
        var old = a.pregnant;
        a.pregnant = createPregnancy(a, findAnimal(old.father_uid), sp, { remaining_ticks: old.remaining_ticks, crossbreed: old.crossbreed === true });
      }
    });

    tickCrowding(st);

    // 0. 清理上轮模块临时字段
    clearModuleTempFields();
    var tower = getClimateControl();
    if (tower && tower.mode_switch_cooldown > 0) tower.mode_switch_cooldown--;

    // 1. 模块升级工程推进
    tickUpgrades();

    // 2. 旋转倒计时
    st.rotation_ticks_remaining--;
    if (st.rotation_ticks_remaining <= 0) {
      // 旋转前结算机制 Perk（地鸣/越界播种，§8.4）
      tickRotationPerks(st);

      rotateClockwise(st);
      st.rotation_ticks_remaining = st.rotation_total_ticks;
    }

    // 3. 模块效果结算（作用于夹持区域，写入 _mg/_sr/_tr 临时字段）
    tickModules(st);

    // 4. 区域生态：草自然生长（受现行模块加成）
    for (var zid in st.zones) {
      var z = st.zones[zid];
      var growthFactor = (100 - (z.compaction || 0)) * 0.009 + 0.1;
      z.grass_height = clamp((z.grass_height || 0) + (0.8 / 1000) * growthFactor * (z._mg || 1), 0, 1.5);
    }

    // 5. 每只动物结算
    settleHerdResources(st);
    var births = [];
    var ordered = st.animals.slice().sort(function (a, b) { return String(a.uid).localeCompare(String(b.uid)); });
    for (var i = 0; i < ordered.length; i++) {
      var a = ordered[i];
      if (a.dead) continue;
      var sp = getSpecies(a.species_id);
      if (!sp) continue;
      tickAnimal(st, a, sp, births);
      // Publish births before the next mother checks available breeding reservations.
      while (births.length) st.animals.push(births.shift());
    }
    for (var b = 0; b < births.length; b++) st.animals.push(births[b]);

    // 6. 尸体持续污染（§3.3）
    st.animals.forEach(function (a) { if (a.dead) releaseStoredProducts(st, a); });
    tickCorpses(st);



    // 7.5 供电扣电（k89 电池经济最小闭环）：本 tick 结算用到的电在 tick 末扣除，
    //     储能耗尽 → 下一 tick 需电模块停摆（isPowerAvailable 由 power_charge>0 派生）
    drainPowerForTick();

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

    // 疾病扣血
    tickDisease(a, zone.pollution);
    if (a.dead) return;

    // 年龄
    a.age_ticks = (a.age_ticks || 0) + 1;

    if (sp.lifespan_ticks && a.age_ticks >= sp.lifespan_ticks) { a.dead = true; a.death_cause = 'old'; return; }

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
    if (a.pregnant && a.satiety > 70 && isMature(a, sp)) {
      a.pregnant.remaining_ticks = Math.max(0, a.pregnant.remaining_ticks - ((a.nutrition_state.last || {}).gestation_progress || 0));
      if (a.pregnant.remaining_ticks <= 1e-9) {
        if (giveBirth(st, a, sp, births)) a.pregnant = null;
      }
    } else if (!a.pregnant) {
      // 受孕判定（成年母畜 + 同区公畜 + 条件满足）
      tryReproduce(st, a, sp);
    }
  }

  function tryReproduce(st, a, sp) {
    if (!sp.reproduction) return;
    if (!hasGender(a, 'female')) return;
    var zone = st.zones[a.zone_id];
    if (!canConceive(a, sp, zone)) return;

    // 雌雄同体（§8.4）：可与自己配对（父本=自己）
    var selfMale = hasGender(a, 'male');

    // 同区公畜候选
    function maleCandidates(sameZone) {
      var list = [];
      st.animals.forEach(function (other) {
        if (other.dead || other.uid === a.uid) return;
        if (!fedForBreeding(other)) return;
        if (other.species_id !== a.species_id) return;
        if (other.location_type !== 'zone') return;
        if (sameZone && other.zone_id !== a.zone_id) return;
        if (!hasGender(other, 'male') || other.satiety <= 70) return;
        if (!isMature(other, sp)) return;
        if (other.hp <= 90) return;
        list.push(other);
      });
      return list;
    }

    // 标准怀孕判定（按 fertility_mult）
    function rollPregnancy(father) {
      var pregRate = (sp.reproduction.base_pregnancy_rate_per_tick ?? 0.0002) * getModifier(a, 'fertility_mult') * getCapacityStatus().fertility;
      if (Math.random() < pregRate) {
        a.pregnant = createPregnancy(a, father, sp);
        return !!a.pregnant;
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
      var roundChance = (1 - Math.pow(1 - (sp.reproduction.base_pregnancy_rate_per_tick ?? 0.0002), st.rotation_total_ticks)) * perkParam('pheromone', 'trigger_chance', 0.5) * getModifier(a, 'fertility_mult') * getCapacityStatus().fertility;
      if (adjFather && Math.random() < roundChance) {
        a.pregnant = createPregnancy(a, adjFather, sp);
        if (a.pregnant) triggerChainPregnancy(st, a, sp);
      }
      a.pheromone_cooldown = st.rotation_total_ticks; // 每轮一次
    }
  }

  // 连坐（§8.4）：持有者成功怀孕时，同区同物种其他成年母畜 10% 同时怀孕（父本取同区公畜）；连坐怀孕的不再触发连坐
  function triggerChainPregnancy(st, mother, sp) {
    if (!hasPerk(mother, 'chain_pregnancy')) return;
    var chainFather = null;
    for (var i = 0; i < st.animals.length; i++) {
      var c = st.animals[i];
      if (c.dead || c.uid === mother.uid || c.species_id !== mother.species_id) continue;
      if (!fedForBreeding(c)) continue;
      if (c.location_type !== 'zone' || c.zone_id !== mother.zone_id) continue;
      if (!hasGender(c, 'male') || c.satiety <= 70) continue;
      if (!isMature(c, sp) || c.hp <= 90) continue;
      chainFather = c;
      break;
    }
    if (!chainFather) return;
    st.animals.forEach(function (other) {
      if (other.dead || other.uid === mother.uid) return;
      if (other.species_id !== mother.species_id) return;
      if (other.location_type !== 'zone' || other.zone_id !== mother.zone_id) return;
      if (!hasGender(other, 'female')) return;
      if (!canConceive(other, sp, st.zones[other.zone_id])) return;
      if (Math.random() < perkParam('chain_pregnancy', 'trigger_chance', 0.1) * getCapacityStatus().fertility) {
        other.pregnant = createPregnancy(other, chainFather, sp, { chained: true });
      }
    });
  }

  // 尸体分解的污染总量有限；同一尸体不能永久供养清污/回收装置。
  function tickCorpses(st) {
    var rates = { disease: 0.006, starvation: 0.003, blood_loss: 0.002, old: 0.002, crowding: 0.003 };
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (!a.dead) continue;
      var rate = rates[a.death_cause] != null ? rates[a.death_cause] : 0;
      if (rate <= 0) continue;
      var sp = getSpecies(a.species_id);
      var factor = sp && sp.corpse_pollution_per_kg != null ? sp.corpse_pollution_per_kg : 1;
      if (a.corpse_pollution_remaining == null) a.corpse_pollution_remaining = Math.max(0, a.weight_kg || 0) * factor;
      var zones = a.location_type === 'coop' ? ((st.arm_zones && st.arm_zones[a.arm_id]) || []) : [a.zone_id];
      zones = zones.filter(function (zid) { return !!st.zones[zid]; });
      if (!zones.length) continue;
      var released = Math.min(rate, Math.max(0, a.corpse_pollution_remaining));
      a.corpse_pollution_remaining = Math.max(0, a.corpse_pollution_remaining - released);
      zones.forEach(function (zid) { st.zones[zid].pollution = clamp(st.zones[zid].pollution + released / zones.length, 0, 100); });
    }
  }

  function tickCoopAnimal(st, a, sp) {
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
      a.hp = clamp(a.hp + 0.02, 0, 100 - nutritionInjury(a));
    }
  }

  function giveBirth(st, mother, sp, births) {
    var pregnancy = mother.pregnant;
    if (!pregnancy || !pregnancy.children) return false;
    var birthMass = pregnancy.children.reduce(function (n, c) { return n + getSpecies(c.species_id).growth.birth_weight_kg; }, 0);
    if (mother.weight_kg - birthMass < sp.growth.birth_weight_kg) return false;
    // Newborn reserves are transferred from the mother, never created per child.
    var reserveUnit = nutritionConfig(sp).maintenance_per_tick * sp.satiety.starvation_to_zero_ticks / 100;
    var transferred = mother.satiety * reserveUnit * 0.25;
    mother.satiety -= transferred / reserveUnit;
    mother.weight_kg -= birthMass;
    pregnancy.children.forEach(function (plan) {
      var childSp = getSpecies(plan.species_id);
      var childReserveUnit = nutritionConfig(childSp).maintenance_per_tick * childSp.satiety.starvation_to_zero_ticks / 100;
      births.push(makeAnimal(plan.species_id, plan.gender, 'zone', mother.zone_id, {
        age_ticks: 0, weight_kg: childSp.growth.birth_weight_kg,
        satiety: Math.min(100, transferred / pregnancy.children.length / childReserveUnit), perks: plan.perks.slice()
      }));
    });
    mother.reproduction_cooldown = hasPerk(pregnancy.mother, 'eternal_spring') ? 0 : (sp.reproduction.postpartum_cooldown_ticks ?? 0);
    return true;
  }

  // ===== 畜牧生活技能（life_animal_husbandry）习得 + move_usage 曲线升级（scene-app 组合根化拆解迁入）=====
  var LIVESTOCK_MAX_PROFICIENCY_USES = 5000000;
  var LIVESTOCK_SKILL_MAX_LEVEL = 100;

  var uiDeps = {};
  function setUiDeps(deps) {
    if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
  }
  /** 重算角色属性（依赖注入；对应 scene-app recalcCharacterStatsFromIE）。 */
  function recalcCharacterStats() {
    if (typeof uiDeps.recalcCharacterStats === 'function') uiDeps.recalcCharacterStats();
  }

  function getLivestockLevelByUses(uses) {
    var u = Math.max(0, parseInt(uses, 10) || 0);
    var ratio = Math.max(0, Math.min(1, u / LIVESTOCK_MAX_PROFICIENCY_USES));
    return Math.max(1, Math.min(LIVESTOCK_SKILL_MAX_LEVEL, 1 + Math.floor(ratio * (LIVESTOCK_SKILL_MAX_LEVEL - 1))));
  }

  function ensureLifeAnimalHusbandrySkillEntry() {
    var IE = window.InventoryEquipment;
    if (!IE || typeof IE.getState !== 'function') return false;
    var st = IE.getState();
    if (!st || typeof st !== 'object') return false;
    if (!st.skills || typeof st.skills !== 'object') st.skills = {};
    if (!st.skills.life_animal_husbandry || typeof st.skills.life_animal_husbandry !== 'object') {
      st.skills.life_animal_husbandry = { level: 1, move_usage: {} };
      recalcCharacterStats();
      return true;
    }
    var changed = false;
    var ent = st.skills.life_animal_husbandry;
    var lv = Math.max(0, parseInt(ent.level, 10) || 0);
    if (lv < 1) { ent.level = 1; changed = true; }
    if (!ent.move_usage || typeof ent.move_usage !== 'object') { ent.move_usage = {}; changed = true; }
    var uses = Math.max(0, parseInt(ent.move_usage.livestock_action, 10) || 0);
    var mappedLv = getLivestockLevelByUses(uses);
    // 只升不降：曲线等级高于当前才升，低于当前保持（兼容手动调试改等级）
    if (mappedLv > Math.max(1, parseInt(ent.level, 10) || 1)) {
      ent.level = mappedLv;
      changed = true;
    }
    if (changed) recalcCharacterStats();
    return true;
  }

  function addLivestockProficiency(delta) {
    var IE = window.InventoryEquipment;
    if (!IE || typeof IE.incrementSkillMoveUsage !== 'function' || typeof IE.getState !== 'function') return;
    if (!ensureLifeAnimalHusbandrySkillEntry()) return;
    var d = Math.max(1, parseInt(delta, 10) || 1);
    var newUses = IE.incrementSkillMoveUsage('life_animal_husbandry', 'livestock_action', d);
    var st = IE.getState();
    if (!st || !st.skills || !st.skills.life_animal_husbandry) return;
    var ent = st.skills.life_animal_husbandry;
    var nextLv = getLivestockLevelByUses(newUses);
    var curLv = Math.max(1, parseInt(ent.level, 10) || 1);
    if (nextLv > curLv) {
      ent.level = nextLv;
      recalcCharacterStats();
    }
  }

  window.LivestockState = {
    setConfig: setConfig,
    initDemoState: initDemoState,
    ensureState: ensureState,
    getState: getState,
    getRetiredModuleStorage: getRetiredModuleStorage,
    claimRetiredModuleItems: claimRetiredModuleItems,
    setState: setState,
    validateState: validateState,
    getCapacityStatus: getCapacityStatus,
    isMature: isMature,
    productEligible: productEligible,
    lifecycleGrowth: lifecycleGrowth,
    getSpecies: getSpecies,
    getModule: getModule,
    getPerk: getPerk,
    allSpecies: allSpecies,
    allModules: allModules,
    allPerks: allPerks,
    moduleRequiresPower: moduleRequiresPower,
    isPowerAvailable: isPowerAvailable,
    setPowerAvailable: setPowerAvailable,
    modulePowerDrainPerTick: modulePowerDrainPerTick,
    currentPowerDrainPerTick: currentPowerDrainPerTick,
    drainPowerForTick: drainPowerForTick,
    addPowerCharge: addPowerCharge,
    getPowerCharge: getPowerCharge,
    isModulePowered: isModulePowered,
    moveAnimal: moveAnimal,
    animalsInZone: animalsInZone,
    animalsInCoop: animalsInCoop,
    collectProduct: collectProduct,
    slaughterAnimal: slaughterAnimal,
    previewSlaughter: previewSlaughter,
    cleanCorpse: cleanCorpse,
    buildModule: buildModule,
    dismountModule: dismountModule,
    getModuleStorage: getModuleStorage,
    claimModuleMaterials: claimModuleMaterials,
    restoreModuleResources: restoreModuleResources,
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
    getNutritionStatus: getNutritionStatus,
    getAnimalLoad: getAnimalLoad,
    getTroughCapacity: getTroughCapacity,
    getCoopCapacity: getCoopCapacity,
    canAdmitAnimal: canAdmitAnimal,
    admitAnimal: admitAnimal,
    getBreedingStatus: getBreedingStatus,
    setBreedingLimit: setBreedingLimit,
    getGrazingStatus: getGrazingStatus,
    getProductStatus: getProductStatus,
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
    advanceTick: advanceTick,
    setUiDeps: setUiDeps,
    getLivestockLevelByUses: getLivestockLevelByUses,
    ensureLifeAnimalHusbandrySkillEntry: ensureLifeAnimalHusbandrySkillEntry,
    addLivestockProficiency: addLivestockProficiency
  };
})();

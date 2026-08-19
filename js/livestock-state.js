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

  function setConfig(species, modules, perks) {
    SPECIES = species || {};
    MODULES = modules || {};
    PERKS = perks || {};
  }

  function getSpecies(speciesId) { return SPECIES[speciesId] || null; }
  function getModule(moduleId) { return MODULES[moduleId] || null; }
  function getPerk(perkId) { return PERKS[perkId] || null; }
  function allSpecies() { return SPECIES; }
  function allModules() { return MODULES; }
  function allPerks() { return PERKS; }

  // 鸡笼动物默认归属：装鸡笼（inner === 'coop'）的臂
  function findCoopArm(arms) {
    for (var k in arms) {
      if (arms[k] && arms[k].inner === 'coop') return k;
    }
    return 'arm1';
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
      arm1: { inner: 'coop', front: null, bottom: 'sprinkler', top: null, cw_side: null, ccw_side: null },
      arm2: { inner: null, front: null, bottom: null, top: null, cw_side: 'feed_trough', ccw_side: null },
      arm3: { inner: null, front: null, bottom: null, top: null, cw_side: null, ccw_side: null },
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
      axis: { slot1: 'slaughter', slot2: null },
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
  }

  function getState() { return state; }
  function ensureState() { if (!state) initDemoState(); return state; }

  function setState(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    if (!incoming.arm_zones) {
      incoming.arm_zones = { arm1: ['z1', 'z2'], arm2: ['z2', 'z3'], arm3: ['z3', 'z4'], arm4: ['z4', 'z1'] };
    }
    var coopArm = findCoopArm(incoming.arms || {});
    if (Array.isArray(incoming.animals)) {
      incoming.animals.forEach(function (a) {
        if (a.dead == null) a.dead = false;
        if (a.death_cause == null) a.death_cause = null;
        if (!a.cooldowns) a.cooldowns = {};
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
    a.cooldowns[productId] = prod.cooldown_ticks;
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
    var meatBlocks = Math.max(1, Math.floor((a.weight_kg || 0) * 0.5 / 5));
    if (sl.meat_item_ids && sl.meat_item_ids.length) {
      items.push({ item_id: sl.meat_item_ids[0], count: meatBlocks });
    }
    (sl.offal_item_ids || []).forEach(function (id) { items.push({ item_id: id, count: 1 }); });
    (sl.byproduct_item_ids || []).forEach(function (id) { items.push({ item_id: id, count: 1 }); });
    a.dead = true;
    a.death_cause = 'slaughter';
    return { ok: true, items: items };
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
        var rate = sp.graze.comfort_rate_m_per_tick * (inComfort ? 1 : sp.graze.non_comfort_mult);
        zone.grass_height = Math.max(0, h - rate);
        a.satiety = clamp(a.satiety + sp.graze.satiety_regen_per_tick, 0, 100);
      }
    }

    // 猪：拱地保底 + 松土 + 降污
    if (a.species_id === 'pig') {
      if (a.satiety < 10) a.satiety = Math.min(10, a.satiety + 0.03);
      if (sp.ecosystem_impact) {
        zone.compaction = clamp(zone.compaction + sp.ecosystem_impact.root_clean_per_tick, 0, 100);
        zone.pollution = clamp(zone.pollution + sp.ecosystem_impact.pollution_pct_per_tick, 0, 100);
      }
    }

    // 饱腹下降
    a.satiety = clamp(a.satiety - sp.satiety.drain_per_tick, 0, 100);

    // 体重成长
    tickWeight(a, sp);

    // 生态影响：踩踏 / 污染（羊）
    if (sp.ecosystem_impact) {
      zone.compaction = clamp(zone.compaction + sp.ecosystem_impact.trample_per_tick, 0, 100);
      if (sp.ecosystem_impact.pollution_pct_per_tick > 0) {
        zone.pollution = clamp(zone.pollution + sp.ecosystem_impact.pollution_pct_per_tick, 0, 100);
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

    // 怀孕推进
    if (a.pregnant) {
      a.pregnant.remaining_ticks--;
      if (a.pregnant.remaining_ticks <= 0) {
        giveBirth(st, a, sp, births);
        a.pregnant = null;
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
    a.satiety = clamp(a.satiety - sp.satiety.drain_per_tick, 0, 100);
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
    if (g.graze_growth_rate_kg_per_tick != null) {
      var cap = g.graze_cap_kg != null ? g.graze_cap_kg : g.fatten_cap_kg;
      if (a.satiety > g.satiety_grow_threshold) {
        if (a.weight_kg < cap) a.weight_kg = Math.min(cap, a.weight_kg + g.graze_growth_rate_kg_per_tick);
      } else if (a.satiety < g.satiety_stall_threshold) {
        a.weight_kg = Math.max(g.birth_weight_kg, a.weight_kg - g.graze_growth_rate_kg_per_tick);
      }
    }
    if (a.species_id === 'pig' && a.satiety > 70 && sp.feed && sp.feed.feed_units_per_tick) {
      var pigGrowth = sp.feed.feed_units_per_tick * 10 / sp.feed.nutrition_per_kg_meat;
      if (a.weight_kg < g.fatten_cap_kg) a.weight_kg = Math.min(g.fatten_cap_kg, a.weight_kg + pigGrowth);
    }
    if (a.species_id === 'chicken' && a.satiety > 70) {
      if (a.weight_kg < g.fatten_cap_kg) a.weight_kg = Math.min(g.fatten_cap_kg, a.weight_kg + 0.00063);
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
      a.hp = clamp(a.hp - drain, 0, 100);
      if (a.hp <= 0) { a.dead = true; a.death_cause = 'disease'; }
    } else if (pollution < 30 && a.satiety > 70) {
      a.hp = clamp(a.hp + 0.02, 0, 100);
    }
  }

  function giveBirth(st, mother, sp, births) {
    if (!sp.reproduction) return;
    var litter = randInt(sp.reproduction.litter_size[0], sp.reproduction.litter_size[1]);
    for (var i = 0; i < litter; i++) {
      var calf = makeAnimal(
        mother.species_id,
        Math.random() < 0.5 ? 'male' : 'female',
        'zone',
        mother.zone_id,
        { weight_kg: sp.growth.birth_weight_kg, age_ticks: 0, satiety: 80 }
      );
      births.push(calf);
    }
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
    advanceTick: advanceTick
  };
})();

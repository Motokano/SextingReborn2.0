/*
 * 畜牧系统 - 运行时状态 + tick 生态结算
 * 负责：加载三表配置、维护牧场运行时状态、每 tick 结算（吃草/饥饿/成长/疾病/旋转/繁殖）、存档读写。
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

  function makeAnimal(speciesId, gender, zoneId, opts) {
    opts = opts || {};
    var sp = getSpecies(speciesId);
    var birth = (sp && sp.growth && sp.growth.birth_weight_kg != null) ? sp.growth.birth_weight_kg : 0;
    var cap = (sp && sp.growth && sp.growth.fatten_cap_kg) ? sp.growth.fatten_cap_kg : birth;
    return {
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
      zone_id: zoneId,
      dead: false,
      death_cause: null
    };
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
      arms: arms,
      axis: { slot1: 'slaughter', slot2: null },
      animals: [
        makeAnimal('cattle', 'female', 'z1', { perks: ['hardy'] }),
        makeAnimal('cattle', 'male', 'z1', { weight_kg: 300 }),
        makeAnimal('sheep', 'female', 'z1', { perks: ['clean_sheep'] }),
        makeAnimal('chicken', 'female', 'z1', {}), makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('chicken', 'female', 'z1', {}), makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('cattle', 'female', 'z2', { weight_kg: 150 }),
        makeAnimal('sheep', 'female', 'z2', {}), makeAnimal('sheep', 'male', 'z2', {}),
        makeAnimal('sheep', 'female', 'z2', {}), makeAnimal('sheep', 'female', 'z2', {}),
        makeAnimal('pig', 'female', 'z2', { pregnant: { father_uid: null, remaining_ticks: 1500 } }),
        makeAnimal('pig', 'male', 'z2', {}),
        makeAnimal('sheep', 'female', 'z4', {}), makeAnimal('sheep', 'male', 'z4', {}),
        makeAnimal('sheep', 'female', 'z4', {}),
        makeAnimal('pig', 'female', 'z4', {}), makeAnimal('pig', 'male', 'z4', {}),
        makeAnimal('pig', 'female', 'z3', {}), makeAnimal('pig', 'male', 'z3', {}),
        makeAnimal('pig', 'female', 'z3', {}), makeAnimal('pig', 'female', 'z3', {}),
        makeAnimal('pig', 'female', 'z3', {}),
        makeAnimal('chicken', 'female', 'z3', {})
      ]
    };
  }

  function getState() { return state; }
  function ensureState() { if (!state) initDemoState(); return state; }

  function setState(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    if (Array.isArray(incoming.animals)) {
      incoming.animals.forEach(function (a) {
        if (a.dead == null) a.dead = false;
        if (a.death_cause == null) a.death_cause = null;
        if (!a.cooldowns) a.cooldowns = {};
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
    if (a && st.zones[zoneId]) a.zone_id = zoneId;
    return a;
  }

  function animalsInZone(zoneId) {
    var st = ensureState();
    return st.animals.filter(function (a) { return a.zone_id === zoneId && !a.dead; });
  }

  /* ================= tick 生态结算 ================= */

  var ZONE_NEXT = { z1: 'z2', z2: 'z3', z3: 'z4', z4: 'z1' };

  function rotateClockwise(st) {
    for (var i = 0; i < st.animals.length; i++) {
      var a = st.animals[i];
      if (a.dead) continue;
      a.zone_id = ZONE_NEXT[a.zone_id] || a.zone_id;
    }
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

    // 疾病扣血（鸡笼隔离，鸡不参与）
    if (a.species_id !== 'chicken') tickDisease(a, zone.pollution);

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

  function tickWeight(a, sp) {
    var g = sp.growth;
    // 草饲阶段（牛/羊）：饱腹三段式
    if (g.graze_growth_rate_kg_per_tick != null) {
      var cap = g.graze_cap_kg != null ? g.graze_cap_kg : g.fatten_cap_kg;
      if (a.satiety > g.satiety_grow_threshold) {
        if (a.weight_kg < cap) a.weight_kg = Math.min(cap, a.weight_kg + g.graze_growth_rate_kg_per_tick);
      } else if (a.satiety < g.satiety_stall_threshold) {
        a.weight_kg = Math.max(g.birth_weight_kg, a.weight_kg - g.graze_growth_rate_kg_per_tick);
      }
    }
    // 猪：饲料料肉比（饱腹 >70 才长，生长 = feed_units × 10 / 每kg肉营养）
    if (a.species_id === 'pig' && a.satiety > 70 && sp.feed && sp.feed.feed_units_per_tick) {
      var pigGrowth = sp.feed.feed_units_per_tick * 10 / sp.feed.nutrition_per_kg_meat;
      if (a.weight_kg < g.fatten_cap_kg) a.weight_kg = Math.min(g.fatten_cap_kg, a.weight_kg + pigGrowth);
    }
    // 鸡：虫子长肉（约 0.63kg/轮 → 0.00063/tick）
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
    advanceTick: advanceTick
  };
})();

/*
 * 畜牧系统 - 运行时状态（MVP）
 * 负责：加载三表配置、维护牧场运行时状态、提供查询接口。
 * 本 MVP 不包含 tick 生态结算（后续按 docs/design/32 补）；此处只做「可交互的静态数据」。
 */
(function () {
  'use strict';

  var SPECIES = {};
  var MODULES = {};
  var PERKS = {};
  var state = null;
  var uidSeq = 1;

  function newUid() {
    return 'livestock_' + (uidSeq++);
  }

  function setConfig(species, modules, perks) {
    SPECIES = species || {};
    MODULES = modules || {};
    PERKS = perks || {};
  }

  function getSpecies(speciesId) {
    return SPECIES[speciesId] || null;
  }
  function getModule(moduleId) {
    return MODULES[moduleId] || null;
  }
  function getPerk(perkId) {
    return PERKS[perkId] || null;
  }
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
      zone_id: zoneId
    };
  }

  function initDemoState() {
    // 模块装配示例（与 live_ui.html 俯视图一致）
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
        makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('chicken', 'female', 'z1', {}),
        makeAnimal('cattle', 'female', 'z2', { weight_kg: 150 }),
        makeAnimal('sheep', 'female', 'z2', {}),
        makeAnimal('sheep', 'male', 'z2', {}),
        makeAnimal('sheep', 'female', 'z2', {}),
        makeAnimal('sheep', 'female', 'z2', {}),
        makeAnimal('pig', 'female', 'z2', { pregnant: { father_uid: null, remaining_ticks: 1500 } }),
        makeAnimal('pig', 'male', 'z2', {}),
        makeAnimal('sheep', 'female', 'z4', {}),
        makeAnimal('sheep', 'male', 'z4', {}),
        makeAnimal('sheep', 'female', 'z4', {}),
        makeAnimal('pig', 'female', 'z4', {}),
        makeAnimal('pig', 'male', 'z4', {}),
        makeAnimal('pig', 'female', 'z3', {}),
        makeAnimal('pig', 'male', 'z3', {}),
        makeAnimal('pig', 'female', 'z3', {}),
        makeAnimal('pig', 'female', 'z3', {}),
        makeAnimal('pig', 'female', 'z3', {}),
        makeAnimal('chicken', 'female', 'z3', {})
      ]
    };
  }

  function getState() {
    return state;
  }

  function ensureState() {
    if (!state) initDemoState();
    return state;
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
    return st.animals.filter(function (a) { return a.zone_id === zoneId; });
  }

  window.LivestockState = {
    setConfig: setConfig,
    initDemoState: initDemoState,
    ensureState: ensureState,
    getState: getState,
    getSpecies: getSpecies,
    getModule: getModule,
    getPerk: getPerk,
    allSpecies: allSpecies,
    allModules: allModules,
    allPerks: allPerks,
    moveAnimal: moveAnimal,
    animalsInZone: animalsInZone
  };
})();

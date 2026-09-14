/*
 * 畜牧系统 - 控制面板渲染（MVP）
 * 渲染四 Tab：总览(装置俯视图) / 动物 / 模块 / 产出。
 * 读 window.LivestockState 的数据；不跑 tick 结算。
 */
(function () {
  'use strict';

  var currentTab = 'overview';
  var selectedAnimalUid = null;
  var selectedZoneId = null;
  var feedbackMsg = null;
  var selectedModuleId = null;
  var productMode = 'daily';
  var selectedSlaughterUid = null;
  var animalFilter = 'all';
  var attentionOnly = false;
  var breedingOpen = false;
  var moveOpen = false;
  var selectedArmId = 'arm1';
  var upgradePreview = null;

  function getLivestockLevel() {
    // 读生活技能 life_animal_husbandry 等级；未习得（0 级）时回退 90 展示完整信息（MVP 测试友好）
    try {
      if (window.InventoryEquipment && typeof window.InventoryEquipment.getSkillLevel === 'function') {
        var lv = window.InventoryEquipment.getSkillLevel('life_animal_husbandry');
        if (lv > 0) return lv;
      }
    } catch (e) { /* ignore */ }
    return 90;
  }

  function t(key, vars) {
    if (window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(key, vars);
    return key;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function grassStage(h) {
    if (h == null) return t('livestock.grass.bare');
    if (h < 0.3) return t('livestock.grass.bare');
    if (h < 0.6) return t('livestock.grass.sparse');
    if (h < 1.0) return t('livestock.grass.moderate');
    return t('livestock.grass.lush');
  }
  function compactionStage(c) {
    if (c == null) return t('livestock.compact.loose');
    if (c < 30) return t('livestock.compact.loose');
    if (c < 55) return t('livestock.compact.slightly_hard');
    if (c < 80) return t('livestock.compact.crusty');
    return t('livestock.compact.severe');
  }
  function pollutionStage(p) {
    if (p == null) return t('livestock.pollution.clean');
    if (p < 30) return t('livestock.pollution.clean');
    if (p < 50) return t('livestock.pollution.slight');
    if (p < 70) return t('livestock.pollution.moderate');
    return t('livestock.pollution.severe');
  }

  function speciesIcon(speciesId) {
    var sp = window.LivestockState.getSpecies(speciesId);
    return sp && sp.icon ? sp.icon : '❓';
  }
  function speciesName(speciesId) {
    var sp = window.LivestockState.getSpecies(speciesId);
    return sp && sp.name ? sp.name : speciesId;
  }
  function genderGlyph(g) {
    if (g === 'female') return '♀';
    if (g === 'male') return '♂';
    if (g === 'hermaphrodite') return '⚥';
    return '';
  }

  function el(id) { return document.getElementById(id); }

  function setTab(tabId) {
    currentTab = tabId;
    var tabs = document.querySelectorAll('#modal-livestock .tab-btn');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabId);
    }
    var views = document.querySelectorAll('#modal-livestock .lv-view');
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('hidden', views[j].getAttribute('data-view') !== tabId);
    }
    render();
  }

  function render() {
    var st = window.LivestockState.ensureState();
    var lv = getLivestockLevel();
    // 旋转倒计时
    var badge = el('livestock-rotate-badge');
    if (badge) { badge.textContent = '下次轮转 · ' + (st.rotation_ticks_remaining / 144).toFixed(1) + ' 天'; badge.title = st.rotation_ticks_remaining + ' tick'; }
    var lvBadge = el('livestock-level-badge');
    if (lvBadge) lvBadge.textContent = t('livestock.badge.level', { v: lv });
    var powerBadge = el('livestock-power-badge');
    if (powerBadge) {
      var on = window.LivestockState.isPowerAvailable();
      var charge = window.LivestockState.getPowerCharge();
      var drain = window.LivestockState.currentPowerDrainPerTick();
      if (on) {
        powerBadge.textContent = t('livestock.power.on_charge', { v: charge, d: drain });
      } else {
        powerBadge.textContent = t('livestock.power.off');
      }
      powerBadge.style.borderColor = on ? '#4d4d45' : '#b91c1c';
      powerBadge.style.color = on ? '#8e8e8e' : '#ff8c00';
    }
    var footer = document.querySelector('#modal-livestock .lv-footer');
    if (footer) footer.textContent = feedbackMsg || t('livestock.footer.hint');

    renderOverview(st, lv);
    renderAnimals(st, lv);
    renderModules(st, lv);
    renderProducts(st, lv);
  }

  /* ---------- 总览：装置俯视图 ---------- */
  function renderOverview(st, lv) {
    var grid = el('livestock-overview-grid');
    if (!grid) return;
    var zoneOrder = ['z1', 'z2', 'z3', 'z4'];
    var zoneLabel = { z1: t('livestock.zone.z1'), z2: t('livestock.zone.z2'), z3: t('livestock.zone.z3'), z4: t('livestock.zone.z4') };
    var armOrder = ['arm1', 'arm4', 'arm2', 'arm3'];

    var cells = [];
    // 3x3: z1, arm1, z2, arm4, axis, arm2, z4, arm3, z3
    function zoneHtml(zoneId) {
      var z = st.zones[zoneId] || {};
      var animals = st.animals.filter(function (a) { return a.location_type === 'zone' && a.zone_id === zoneId && !a.dead; });
      var eco = [];
      // 生态阶段（三段式模糊提示）始终可见，玩家任何等级都能感知区域状态
      eco.push('🌿 ' + grassStage(z.grass_height));
      eco.push('☢️ ' + pollutionStage(z.pollution));
      eco.push('🪨 ' + compactionStage(z.compaction));
      // 精确数值按等级解锁
      if (lv >= 40) eco.push(t('livestock.eco.grass', { v: (z.grass_height == null ? '-' : z.grass_height.toFixed(2)) }));
      if (lv >= 50) eco.push(t('livestock.eco.pollution', { v: (z.pollution == null ? '-' : Math.round(z.pollution)) }));
      if (lv >= 60) eco.push(t('livestock.eco.compaction', { v: (z.compaction == null ? '-' : Math.round(z.compaction)) }));
      var ecoHtml = eco.map(function (e) { return '<div class="eco-line">' + e + '</div>'; }).join('');
      var ecoText = ecoHtml || '<div class="eco-line">' + t('livestock.eco.locked') + '</div>';
      var sel = selectedZoneId === zoneId ? ' selected' : '';
      var animalHtml = animals.map(function (a) { return animalChip(a); }).join('') ||
        '<div class="empty-hint" style="padding:2px;font-size:11px;">' + t('livestock.empty') + '</div>';
      var corpses = st.animals.filter(function (a) { return a.location_type === 'zone' && a.zone_id === zoneId && a.dead; });
      var corpseHtml = corpses.length
        ? '<div class="corpse-line" title="' + corpses.map(function (c) { return speciesName(c.species_id) + '（' + corpseCauseText(c) + '）'; }).join(t('livestock.join.sep')) + '">' + t('livestock.corpse.zone', { n: corpses.length, cause: corpses.map(function (c) { return corpsePollutionText(c.death_cause); })[0] }) + '<button type="button" class="lv-btn" data-clean-zone-corpse="' + zoneId + '">' + t('livestock.btn.clear_corpse') + '</button></div>'
        : '';
      return '<div class="zone-cell' + sel + '" data-zone="' + zoneId + '">' +
        '<div class="eco-overlay ' + ecoOverlayClass(zoneId, z) + '"></div>' +
        '<div class="zone-header"><span>' + zoneLabel[zoneId] + ' · ' + animals.length + ' 只 → ' + ({z1:'Z2',z2:'Z3',z3:'Z4',z4:'Z1'}[zoneId]) + '</span><div class="zone-eco">' + ecoText + '</div></div>' +
        '<div class="animal-list">' + animalHtml + '</div>' +
        corpseHtml +
        '<div class="zone-actions">' +
        '<button type="button" class="lv-btn" data-clean="' + zoneId + '">' + t('livestock.btn.clean') + '</button>' +
        '<button type="button" class="lv-btn" data-till="' + zoneId + '">' + t('livestock.btn.till') + '</button>' +
        '</div></div>';
    }
    function armHtml(armId, vertical) {
      var a = st.arms[armId] || {};
      var mods = [a.inner, a.front, a.bottom, a.top, a.cw_side, a.ccw_side].filter(function (inst) { return inst && !inst.shadow; });
      var chips = mods.map(moduleChip).join('');
      if (!chips) chips = '<span class="ov-module-chip ov-module-empty">' + t('livestock.empty') + '</span>';
      var lbl = { arm1: t('livestock.arm.1'), arm2: t('livestock.arm.2'), arm3: t('livestock.arm.3'), arm4: t('livestock.arm.4') }[armId];
      var chickens = st.animals.filter(function (x) { return x.location_type === 'coop' && x.arm_id === armId && !x.dead; });
      var chickenHtml = chickens.length ? '<div class="coop-animals">' + chickens.map(function (c) { return animalChip(c, true); }).join('') + '</div>' : '';
      var deadChickens = st.animals.filter(function (x) { return x.location_type === 'coop' && x.arm_id === armId && x.dead; });
      if (deadChickens.length) {
        chickenHtml += '<div class="corpse-line" title="' + deadChickens.map(function (c) { return speciesName(c.species_id) + '（' + corpseCauseText(c) + '）'; }).join(t('livestock.join.sep')) + '">' + t('livestock.corpse.arm', { n: deadChickens.length }) +
          '<button type="button" class="lv-btn" data-clean-arm-corpse="' + armId + '">' + t('livestock.btn.clear_corpse') + '</button></div>';
      }
      return '<div class="arm-cell ' + (vertical ? 'arm-vertical' : 'arm-horizontal') + '" data-arm="' + armId + '">' +
        '<span class="arm-label">' + lbl + '</span><div class="module-slots">' + chips + '</div>' + chickenHtml + '</div>';
    }
    function axisHtml() {
      var mods = [st.axis.slot1, st.axis.slot2].filter(function (inst) { return inst && !inst.shadow; });
      var chips = mods.map(moduleChip).join('') || '<span class="ov-module-chip ov-module-empty">' + t('livestock.empty') + '</span>';
      return '<div class="axis-cell" data-arm="axis"><span class="arm-label">' + t('livestock.axis') + '</span>' +
        '<div class="module-slots">' + chips + '</div>' +
        '<div class="rotate-indicator">⟳</div></div>';
    }

    var cap = window.LivestockState.getCapacityStatus();
    var crowdText = cap.ratio > 1 ? t('livestock.capacity.over', { output: Math.round(cap.output * 100), feed: Math.round((cap.maintenance - 1) * 100) }) : t('livestock.capacity.normal');
    var summary = el('livestock-overview-summary');
    if (!summary) { summary = document.createElement('div'); summary.id = 'livestock-overview-summary'; grid.before(summary); }
    var live = st.animals.filter(function (a) { return !a.dead; });
    var ready = routineProducts(st);
    var alerts = [];
    if (cap.ratio > 1) alerts.push(crowdText + (cap.ratio > 1.25 ? ' ' + t('livestock.capacity.health') : ''));
    var sick = live.filter(function (a) { return a.hp < 70; }).length;
    var hungry = live.filter(function (a) { return a.satiety <= 70; }).length;
    if (sick) alerts.push(sick + ' 只动物健康偏低');
    if (hungry) alerts.push(hungry + ' 只动物饱食不足');
    var underfed = live.filter(function (a) { return window.LivestockState.getNutritionStatus(a.uid).tier === 'insufficient'; }).length;
    if (underfed) alerts.push(underfed + ' 只动物营养不足 · 检查饲料与牧草');
    if (st.animals.length > live.length) alerts.push((st.animals.length - live.length) + ' 具尸体待清理');
    if (!window.LivestockState.isPowerAvailable()) alerts.push('供电中断 · 电力装置停工');
    summary.innerHTML = '<div class="lv-summary-cards"><div class="capacity-summary"><span class="lv-eyebrow">牧场承载</span><strong>' + cap.used + '/' + cap.capacity + '</strong><progress max="' + Math.max(cap.capacity, cap.used) + '" value="' + cap.used + '"></progress><span>含待出生：' + cap.projected + ' · 鸡舍独立计容</span><span>' + esc(crowdText) + '</span></div>' +
      '<div><span class="lv-eyebrow">可领取产物</span><strong>' + ready.length + ' 份</strong><span>' + esc(readySummary(ready)) + '</span><button class="lv-btn lv-primary" data-go-products>前往收取</button></div>' +
      '<div><span class="lv-eyebrow">需要照看</span><strong>' + (alerts.length ? alerts.length + ' 项' : '平稳') + '</strong><span>' + esc(alerts.join('；') || '暂无健康、饱食、容量或供电警报') + '</span></div></div>' +
      '<div class="lv-map-caption"><b>同步轮牧</b><span>Z1 → Z2 → Z3 → Z4 → Z1 · 动物与作业臂同步顺时针移动</span></div>';
    summary.querySelector('[data-go-products]').onclick = function () { productMode = 'daily'; setTab('products'); };
    function armAt(z1, z2, fallback) {
      return Object.keys(st.arms).filter(function (id) { var zs = (st.arm_zones || {})[id] || []; return zs.indexOf(z1) >= 0 && zs.indexOf(z2) >= 0; })[0] || fallback;
    }
    grid.innerHTML = zoneHtml('z1') + armHtml(armAt('z1', 'z2', 'arm1'), true) + zoneHtml('z2') +
      armHtml(armAt('z4', 'z1', 'arm4'), false) + axisHtml() + armHtml(armAt('z2', 'z3', 'arm2'), false) +
      zoneHtml('z4') + armHtml(armAt('z3', 'z4', 'arm3'), true) + zoneHtml('z3');

    bindZoneClicks();
    bindArmClicks();
    bindDragDrop();
    bindZoneActions();
  }

  function animalChip(a, isCoop) {
    var draggable = !isCoop ? ' draggable="true"' : '';
    var g = genderGlyph(a.gender);
    var title = speciesName(a.species_id) + ' ' + g + ' · ' + a.weight_kg.toFixed(1) + 'kg';
    var zoneAttr = a.location_type === 'zone' ? ' data-zone="' + a.zone_id + '"' : '';
    return '<div class="animal-item' + (isCoop ? ' animal-coop' : '') + '"' + draggable + zoneAttr +
      ' data-uid="' + a.uid + '" title="' + title + '">' +
      '<span class="icon-' + a.species_id + '">' + speciesIcon(a.species_id) + '</span>' + esc(speciesName(a.species_id)) + g + '</div>';
  }
  function moduleIcon(moduleId) {
    var m = window.LivestockState.getModule(moduleId);
    if (!m) return '➖';
    var map = { feed_trough: '🥣', sprinkler: '🚿', clean_brush: '🧹', auto_collect: '🤖', coop: '🐔', feed_preprocess: '🌾', tiller: '⛏️', seeder: '🌱', manure_net: '🕸️', pasture_arm: '🌿', heal: '💉', feed_refine: '⚙️', link_schedule: '🔗', waste_heat_recycle: '♻️', slaughter: '🔪', warehouse_hub: '📦', climate_control: '🌤️' };
    return map[m.effect_type] || '⚙️';
  }
  function moduleChip(inst) {
    var m = inst && inst.module_id ? window.LivestockState.getModule(inst.module_id) : null;
    if (!m) return '';
    var upgrading = inst.upgrading_remaining > 0;
    var stalled = (m.requires_power && !window.LivestockState.isPowerAvailable());
    var cls = 'ov-module-chip' + (upgrading ? ' upgrading' : '') + (stalled ? ' stalled' : '');
    var lvText = 'Lv' + inst.level + (upgrading ? '⏳' : '');
    return '<span class="' + cls + '" title="' + m.name + ' Lv' + inst.level + (upgrading ? t('livestock.module.upgrading_title', { v: inst.upgrading_remaining }) : '') + ' · ' + m.desc + '">' +
      moduleIcon(inst.module_id) + ' ' + m.name + ' ' + lvText + (stalled ? ' ⚡' : '') + '</span>';
  }
  function ecoOverlayClass(zoneId, z) {
    var cls = [];
    if (z.grass_height != null && z.grass_height < 0.5) cls.push('eco-grass-low');
    if (z.pollution != null && z.pollution > 50) cls.push('eco-pollution');
    if (z.compaction != null && z.compaction > 55) cls.push('eco-compact');
    return cls.join(' ');
  }

  function bindZoneClicks() {
    var zones = document.querySelectorAll('#livestock-overview-grid .zone-cell');
    for (var i = 0; i < zones.length; i++) {
      zones[i].addEventListener('click', function () {
        selectedZoneId = this.getAttribute('data-zone');
        render();
      });
    }
  }
  function bindZoneActions() {
    var cleans = document.querySelectorAll('#livestock-overview-grid [data-clean]');
    for (var i = 0; i < cleans.length; i++) {
      cleans[i].addEventListener('click', function (e) {
        e.stopPropagation();
        doClean(this.getAttribute('data-clean'));
      });
    }
    var tills = document.querySelectorAll('#livestock-overview-grid [data-till]');
    for (var j = 0; j < tills.length; j++) {
      tills[j].addEventListener('click', function (e) {
        e.stopPropagation();
        doTill(this.getAttribute('data-till'));
      });
    }
    var zoneCorpses = document.querySelectorAll('#livestock-overview-grid [data-clean-zone-corpse]');
    for (var zc = 0; zc < zoneCorpses.length; zc++) {
      zoneCorpses[zc].addEventListener('click', function (e) {
        e.stopPropagation();
        doCleanZoneCorpses(this.getAttribute('data-clean-zone-corpse'));
      });
    }
    var armCorpses = document.querySelectorAll('#livestock-overview-grid [data-clean-arm-corpse]');
    for (var ac = 0; ac < armCorpses.length; ac++) {
      armCorpses[ac].addEventListener('click', function (e) {
        e.stopPropagation();
        doCleanArmCorpses(this.getAttribute('data-clean-arm-corpse'));
      });
    }
  }
  function bindArmClicks() {
    var arms = document.querySelectorAll('#livestock-overview-grid [data-arm]');
    for (var i = 0; i < arms.length; i++) {
      arms[i].addEventListener('click', function () {
        selectedArmId = this.getAttribute('data-arm');
        selectedModuleId = null;
        setTab('modules');
      });
    }
  }

  var dragState = null;

  function clearDragHighlight() {
    var zones = document.querySelectorAll('#livestock-overview-grid .zone-cell.drop-target');
    for (var i = 0; i < zones.length; i++) zones[i].classList.remove('drop-target');
  }

  function bindDragDrop() {
    var items = document.querySelectorAll('#livestock-overview-grid .animal-item[draggable="true"]');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('dragstart', function (e) {
        dragState = {
          uid: this.getAttribute('data-uid'),
          fromZone: this.getAttribute('data-zone')
        };
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', dragState.uid); } catch (err) { /* ignore */ }
        }
      });
      items[i].addEventListener('dragend', function () {
        dragState = null;
        clearDragHighlight();
      });
    }

    var zones = document.querySelectorAll('#livestock-overview-grid .zone-cell');
    for (var j = 0; j < zones.length; j++) {
      zones[j].addEventListener('dragover', function (e) {
        if (!dragState) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        this.classList.add('drop-target');
      });
      zones[j].addEventListener('dragleave', function (e) {
        this.classList.remove('drop-target');
      });
      zones[j].addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drop-target');
        var targetZone = this.getAttribute('data-zone');
        if (!dragState || dragState.fromZone === targetZone) {
          dragState = null;
          return;
        }
        window.LivestockState.moveAnimal(dragState.uid, targetZone);
        dragState = null;
        render();
      });
    }
  }

  /* ---------- 动物 ---------- */
  function renderAnimals(st, lv) {
    var list = el('livestock-animal-list');
    if (!list) return;
    var existingBreeding = document.querySelector('.breeding-controls');
    if (existingBreeding) breedingOpen = existingBreeding.open;
    var live = st.animals.filter(function (a) { return !a.dead; });
    var visible = live.filter(function (a) { return (animalFilter === 'all' || animalFilter === a.species_id) && (!attentionOnly || needsAttention(a)); });
    var troubledSpecies = {}; visible.forEach(function (a) { if (needsAttention(a)) troubledSpecies[a.species_id] = true; });
    visible.sort(function (a, b) { return Number(!!troubledSpecies[b.species_id]) - Number(!!troubledSpecies[a.species_id]) || a.species_id.localeCompare(b.species_id) || Number(needsAttention(b)) - Number(needsAttention(a)) || String(a.uid).localeCompare(String(b.uid), undefined, { numeric: true }); });
    if (!visible.some(function (a) { return a.uid === selectedAnimalUid; })) selectedAnimalUid = visible.length ? visible[0].uid : null;
    var previousSpecies = null;
    var rows = visible.map(function (a) {
      var heading = previousSpecies === a.species_id ? '' : '<h3 class="lv-group-title">' + speciesName(a.species_id) + ' · ' + visible.filter(function (b) { return b.species_id === a.species_id; }).length + ' 只</h3>';
      previousSpecies = a.species_id;
      var sel = a.uid === selectedAnimalUid ? ' selected' : '';
      var sat = (lv >= 10) ? a.satiety.toFixed(0) : satietyStage(a.satiety);
      var hp = (lv >= 70) ? a.hp.toFixed(0) : hpStage(a.hp);
      var preg = (a.pregnant && lv >= 30) ? '<span class="badge-preg">' + t('livestock.pregnant') + '</span>' : '';
      var perk = (lv >= 50) ? perkText(a.perks, lv) : '';
      return heading + '<button type="button" class="animal-row' + sel + '" data-uid="' + a.uid + '">' +
        '<span class="animal-ico">' + speciesIcon(a.species_id) + '</span>' +
        '<span class="animal-name">' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' #' + esc(String(a.uid).split('_').pop()) + preg + '</span>' +
        '<span class="animal-meta">' + t('livestock.animal.meta', { w: a.weight_kg.toFixed(1), sat: sat, hp: hp, loc: locationName(a) }) + '</span>' +
        '<span class="animal-perk">' + animalProgress(a, window.LivestockState.getSpecies(a.species_id)) + '</span>' +
        (needsAttention(a) ? '<span class="lv-attention">需要照看 · ' + attentionReason(a) + '</span>' : '') + '</button>';
    }).join('');
    var limits = '<details class="breeding-controls"' + (breedingOpen ? ' open' : '') + '><summary>繁殖设置</summary><p>' + t('livestock.breeding.hint') + '</p>' + ['cattle','sheep','pig'].map(function (kind) {
      var status = window.LivestockState.getBreedingStatus(kind);
      return '<div>' + speciesName(kind) + ' ' + t('livestock.breeding.limit', { n: status.limit }) +
        '<button class="lv-btn" data-breeding-limit="' + kind + '|-1">−</button><button class="lv-btn" data-breeding-limit="' + kind + '|1">+</button></div>';
    }).join('') + '</details>';
    var filters = '<div class="lv-filter-bar">' + ['all','cattle','sheep','pig','chicken'].map(function (id) { return '<button class="lv-btn' + (animalFilter === id ? ' active' : '') + '" data-animal-filter="' + id + '">' + (id === 'all' ? '全部' : speciesName(id)) + ' ' + live.filter(function (a) { return id === 'all' || a.species_id === id; }).length + '</button>'; }).join('') + '<button class="lv-btn' + (attentionOnly ? ' active' : '') + '" data-attention-only>只看需照看</button></div>';
    list.innerHTML = filters + limits + (rows || '<div class="empty-hint">' + t('livestock.animal.none') + '</div>');
    var limitButtons = document.querySelectorAll('#livestock-animal-list [data-breeding-limit]');
    for (var bi = 0; bi < limitButtons.length; bi++) limitButtons[bi].addEventListener('click', function () {
      var p = this.getAttribute('data-breeding-limit').split('|');
      window.LivestockState.setBreedingLimit(p[0], Math.max(0, Math.min(100, window.LivestockState.getBreedingStatus(p[0]).limit + Number(p[1])))); render();
    });
    document.querySelectorAll('[data-animal-filter]').forEach(function (btn) { btn.onclick = function () { animalFilter = btn.dataset.animalFilter; render(); }; });
    var attentionButton = document.querySelector('[data-attention-only]');
    if (attentionButton) attentionButton.onclick = function () { attentionOnly = !attentionOnly; render(); };
    var breedingDetails = document.querySelector('.breeding-controls');
    if (breedingDetails) breedingDetails.ontoggle = function () { if (this.isConnected) breedingOpen = this.open; };
    bindAnimalRows();

    renderAnimalDetail(st, lv);
  }

  function needsAttention(a) { return a.hp < 70 || a.satiety <= 70 || window.LivestockState.getNutritionStatus(a.uid).tier === 'insufficient'; }
  function attentionReason(a) { return [a.hp < 70 ? '健康偏低' : '', a.satiety <= 70 ? '饱食不足' : '', window.LivestockState.getNutritionStatus(a.uid).tier === 'insufficient' ? '营养不足' : ''].filter(Boolean).join(' · '); }
  function satietyStage(s) { if (s == null) return '-'; if (s < 30) return t('livestock.satiety.hungry'); if (s < 70) return t('livestock.satiety.normal'); return t('livestock.satiety.full'); }
  function hpStage(h) { if (h == null) return '-'; if (h < 30) return t('livestock.hp.critical'); if (h < 60) return t('livestock.hp.sick'); if (h < 90) return t('livestock.hp.subhealthy'); return t('livestock.hp.healthy'); }
  function zoneName(z) { return { z1: 'Z1', z2: 'Z2', z3: 'Z3', z4: 'Z4' }[z] || z; }
  function locationName(a) {
    if (a.location_type === 'coop') {
      return { arm1: t('livestock.location.coop_arm', { arm: t('livestock.arm.1') }), arm2: t('livestock.location.coop_arm', { arm: t('livestock.arm.2') }), arm3: t('livestock.location.coop_arm', { arm: t('livestock.arm.3') }), arm4: t('livestock.location.coop_arm', { arm: t('livestock.arm.4') }) }[a.arm_id] || (a.arm_id + t('livestock.location.coop_arm', { arm: '' }));
    }
    return zoneName(a.zone_id);
  }
  function perkText(perks, lv) {
    if (!perks || !perks.length) return '';
    var names = perks.map(function (p) {
      var pdef = window.LivestockState.getPerk(p);
      return pdef ? pdef.name : p;
    });
    return t('livestock.perk.label', { names: names.join(t('livestock.join.sep')) });
  }

  var PRODUCT_NAMES = { milk: '奶', wool: '毛', blood: '血', egg: '蛋' };
  function productName(id) {
    return PRODUCT_NAMES[id] || id;
  }

  function renderAnimalDetail(st, lv) {
    var box = el('livestock-animal-detail');
    if (!box) return;
    var existingMove = document.querySelector('.lv-move-settings');
    if (existingMove) moveOpen = existingMove.open;
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].uid === selectedAnimalUid) { a = st.animals[i]; break; }
    if (!a) { box.innerHTML = '<div class="empty-hint">' + t('livestock.animal.detail_empty') + '</div>'; return; }
    var sp = window.LivestockState.getSpecies(a.species_id);
    var prod = (sp && sp.products && sp.products.living) ? sp.products.living : [];
    var load = window.LivestockState.getAnimalLoad(a.uid);
    var grazing = window.LivestockState.getGrazingStatus(a.uid);
    var prodRows = prod.map(function (p) {
      return '<div class="kv-row"><span>' + productName(p.product_id) + '</span><span>' + productionStatusText(a, p) + '</span></div>';
    }).join('') || '<div class="kv-row"><span>' + t('livestock.product.living') + '</span><span>' + t('livestock.product.none') + '</span></div>';
    box.innerHTML =
      '<div class="detail-title">' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' #' + esc(String(a.uid).split('_').pop()) + '</div>' +
      '<p class="lv-note">' + animalProgress(a, sp) + '</p>' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span>' + t('livestock.detail.stage') + '</span><span>' + (!window.LivestockState.isMature(a, sp) ? t('livestock.age.young') : t('livestock.age.adult')) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.weight') + '</span><span>' + a.weight_kg.toFixed(1) + ' kg</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.satiety') + '</span><span>' + ((lv >= 10) ? a.satiety.toFixed(0) : satietyStage(a.satiety)) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.nutrition') + '</span><span>' + t('livestock.nutrition.' + window.LivestockState.getNutritionStatus(a.uid).tier) + '</span></div>' +
      (load && !a.dead ? '<div class="kv-row"><span>' + t('livestock.detail.future_load') + '</span><span>' + t(load.at_full_weight > load.current * 1.05 ? 'livestock.load.growing' : 'livestock.load.stable') + '</span></div>' : '') +
      (grazing ? '<div class="kv-row"><span>' + t('livestock.detail.grazing') + '</span><span>' + t('livestock.grazing.' + grazing) + '</span></div>' : '') +
      '<div class="kv-row"><span>' + t('livestock.detail.hp') + '</span><span>' + ((lv >= 70) ? a.hp.toFixed(0) : hpStage(a.hp)) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.pregnant') + '</span><span>' + ((lv >= 30 && a.pregnant) ? t('livestock.pregnant.remaining', { v: a.pregnant.remaining_ticks }) : ((lv >= 30) ? t('livestock.none') : t('livestock.invisible'))) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.location') + '</span><span>' + locationName(a) + '</span></div>' +
      '</div>' +
      '<div class="detail-perk">' + ((lv >= 50) ? (perkText(a.perks, lv) || t('livestock.perk.none')) : t('livestock.perk.locked')) + '</div>' +
      '<div class="kv-list">' + prodRows + '</div>' +
      '<details class="lv-move-settings"' + (moveOpen ? ' open' : '') + '><summary>调整分区</summary><p class="lv-note">日常轮牧会自动同步迁移。这里用于调整饲养分区。</p><div class="detail-actions">' +
      (a.location_type === 'zone'
        ? '<button type="button" class="lv-btn' + (a.zone_id === 'z1' ? ' active' : '') + '" data-move="z1">' + t('livestock.btn.move_to', { zone: 'Z1' }) + '</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z2' ? ' active' : '') + '" data-move="z2">' + t('livestock.btn.move_to', { zone: 'Z2' }) + '</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z3' ? ' active' : '') + '" data-move="z3">' + t('livestock.btn.move_to', { zone: 'Z3' }) + '</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z4' ? ' active' : '') + '" data-move="z4">' + t('livestock.btn.move_to', { zone: 'Z4' }) + '</button>'
        : '<span class="empty-hint" style="padding:0;">' + t('livestock.coop_no_move') + '</span>') +
      '</div></details>';
    var moveDetails = document.querySelector('.lv-move-settings');
    if (moveDetails) moveDetails.ontoggle = function () { if (this.isConnected) moveOpen = this.open; };
    bindMoveButtons();
  }

  function bindAnimalRows() {
    var rows = document.querySelectorAll('#livestock-animal-list .animal-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function () {
        selectedAnimalUid = this.getAttribute('data-uid');
        render();
      });
    }
  }
  function bindMoveButtons() {
    var btns = document.querySelectorAll('#livestock-animal-detail [data-move]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var zoneId = this.getAttribute('data-move');
        if (selectedAnimalUid && window.LivestockState) {
          window.LivestockState.moveAnimal(selectedAnimalUid, zoneId);
        }
        render();
      });
    }
  }

  /* ---------- 模块 ---------- */
  function renderModules(st, lv) {
    var box = el('livestock-module-content');
    if (!box) return;
    var armNames = { arm1: t('livestock.arm.1'), arm2: t('livestock.arm.2'), arm3: t('livestock.arm.3'), arm4: t('livestock.arm.4'), axis: t('livestock.axis') };
    var armSlotLabels = { inner: t('livestock.slot.inner'), front: t('livestock.slot.front'), bottom: t('livestock.slot.bottom'), top: t('livestock.slot.top'), cw_side: t('livestock.slot.cw'), ccw_side: t('livestock.slot.ccw') };
    var armHtml = Object.keys(armNames).filter(function (aid) { return aid === selectedArmId; }).map(function (aid) {
      var slots = (aid === 'axis') ? { slot1: st.axis.slot1, slot2: st.axis.slot2 } : st.arms[aid];
      var slotHtml = Object.keys(slots).map(function (sk) {
        var inst = slots[sk];
        var mid = inst && inst.module_id;
        var m = mid ? window.LivestockState.getModule(mid) : null;
        var label = (aid === 'axis') ? (t('livestock.axis_slot_prefix') + sk.replace('slot', '')) : armSlotLabels[sk];
        if (inst && inst.shadow) {
          // 影子位：被跨面模块占用
          return '<div class="module-slot shadow-slot">' +
            '<span class="slot-key">' + label + '</span>' +
            '<span class="slot-val">' + t('livestock.slot.occupied_by', { name: (m ? m.name : mid) }) + '</span></div>';
        }
        if (m) {
          var upgrading = inst.upgrading_remaining > 0;
          var lvText = 'Lv' + inst.level + (upgrading ? t('livestock.module.upgrading', { v: inst.upgrading_remaining }) : '');
          var extra = '';
          var extraActions = '';
          if (mid === 'feed_trough') {
            extra = t('livestock.feed_units', { v: (inst.feed_units != null ? inst.feed_units.toFixed(1) : '0'), capacity: window.LivestockState.getTroughCapacity(inst) });
            extraActions = '<button type="button" class="lv-btn" data-feed="' + aid + '|' + sk + '">' + t('livestock.btn.feed') + '</button>';
          } else if (mid === 'coop') {
            extraActions = '<button type="button" class="lv-btn" data-feed-chickens="' + aid + '">' + t('livestock.btn.feed_chickens') + '</button>';
          } else if (mid === 'feed_preprocess' || mid === 'feed_refine') {
            var queueN = inst.input_queue ? inst.input_queue.reduce(function (s, q) { return s + q.count; }, 0) : 0;
            extra = t('livestock.queue_crops', { n: queueN }) + (mid === 'feed_refine' && inst.refine_cache > 0 ? t('livestock.refine_cache', { v: inst.refine_cache.toFixed(1) }) : '');
            if (inst.processing_units > 0) extra += t('livestock.processing_remainder', { v: inst.processing_units.toFixed(2) });
            extraActions = '<button type="button" class="lv-btn" data-process="' + aid + '">' + t('livestock.btn.process') + '</button>';
          } else if (mid === 'warehouse_hub') {
            var cap = window.LivestockState.getWarehouseCapacity();
            var usage = window.LivestockState.getWarehouseUsage();
            var lvHub = Math.max(1, Math.min(5, inst.level || 1));
            extra = t('livestock.cache_usage', { v: usage, cap: cap });
            if (lvHub >= 2 && cap > 0 && usage / cap > 0.8) extra += ' ⚠️';
            if (usage > 0) {
              extraActions = '<button type="button" class="lv-btn" data-warehouse-take="axis">' + t('livestock.btn.extract') + '</button>';
            }
          }
          var effText = window.LivestockState.getModuleEffectText(mid, inst.level);
          var nextStep = window.LivestockState.getBuildStep(m.tier, inst.level);
          var upgradeHtml = upgradePreview === aid + '|' + sk && inst.level < 5 ? '<div class="lv-upgrade-preview"><b>Lv' + inst.level + ' → Lv' + (inst.level + 1) + '</b><p>当前：' + esc(effText) + '</p><p>升级后：' + esc(window.LivestockState.getModuleEffectText(mid, inst.level + 1)) + '</p><p>材料：' + (nextStep ? nextStep.inputs.map(function (it) { return esc(itemDisplayName(it.item_id)) + ' ×' + it.count; }).join('、') : '暂无材料配置') + '</p><button class="lv-btn lv-primary" data-upgrade="' + aid + '|' + sk + '"' + (upgrading || !nextStep ? ' disabled' : '') + '>确认升级</button></div>' : '';
          var coverage = moduleCoverage(st, aid, sk, m, inst);
          // 生产力墙（k93）：需电模块缺电 → 停摆标记
          var stalled = (m.requires_power && !window.LivestockState.isPowerAvailable()) ? ' <span class="module-stalled">' + t('livestock.power.stalled') + '</span>' : '';
          return '<div class="module-slot filled' + (stalled ? ' stalled' : '') + '" data-arm="' + aid + '" data-slot="' + sk + '">' +
            '<span class="slot-key">' + label + '</span>' +
            '<span class="slot-val">' + m.name + ' ' + lvText + extra + stalled + '</span>' +
            '<span class="lv-coverage-label">作用：' + esc(coverage) + '</span>' + upgradeHtml +
            (effText ? '<span class="module-effect slot-effect">' + effText + '</span>' : '') +
            '<span class="slot-actions">' +
            extraActions +
            '<button type="button" class="lv-btn" data-upgrade-preview="' + aid + '|' + sk + '"' + (inst.level >= 5 || upgrading ? ' disabled' : '') + '>' + (inst.level >= 5 ? '已满级' : upgrading ? '升级中' : '比较升级') + '</button>' +
            '<button type="button" class="lv-btn" data-dismount="' + aid + '|' + sk + '">' + t('livestock.btn.dismount') + '</button>' +
            '</span></div>';
        }
        var mountable = selectedModuleId ? canMountHere(aid, sk, selectedModuleId) : false;
        var emptyCls = mountable ? ' empty-slot mountable' : ' empty-slot';
        var emptyVal = mountable ? t('livestock.slot.mountable') : t('livestock.empty');
        return '<div class="module-slot' + emptyCls + '" data-arm="' + aid + '" data-slot="' + sk + '">' +
          '<span class="slot-key">' + label + '</span>' +
          '<span class="slot-val">' + emptyVal + '</span></div>';
      }).join('');
      return '<div class="arm-card"><div class="arm-card-title">' + armNames[aid] + '</div><div class="arm-slots">' + slotHtml + '</div></div>';
    }).join('');

    var slotNames = { inner: t('livestock.slot.inner'), front: t('livestock.slot.front'), bottom: t('livestock.slot.bottom'), top: t('livestock.slot.top'), cw_side: t('livestock.slot.cw'), ccw_side: t('livestock.slot.ccw') };
    var mods = window.LivestockState.allModules();
    var tierOrder = { [t('livestock.tier.1')]: 1, [t('livestock.tier.2')]: 2, [t('livestock.axis')]: 3 };
    var modList = Object.keys(mods).map(function (k) { return mods[k]; })
      .filter(function (m) { return selectedArmId === 'axis' ? m.axis_slot != null : m.axis_slot == null; })
      .sort(function (a, b) { return (tierOrder[a.layer] - tierOrder[b.layer]) || a.name.localeCompare(b.name, 'zh'); })
      .map(function (m) {
        var sel = selectedModuleId === m.module_id ? ' selected' : '';
        var step = window.LivestockState.getBuildStep(m.tier, 1);
        var cost = step && step.inputs ? step.inputs.map(function (i) { return itemDisplayName(i.item_id) + '×' + i.count; }).join(' ') : '';
        var faces = (m.axis_slot != null)
          ? t('livestock.axis_slot_full', { v: m.axis_slot })
          : window.LivestockState.expandModuleSlots(m).map(function (s) { return slotNames[s] || s; }).join('+');
        var effText = window.LivestockState.getModuleEffectText(m.module_id, 1);
        var powerTag = m.requires_power ? '<span class="module-power">' + t('livestock.power.requires') + '</span>' : '';
        return '<div class="module-card' + sel + '" data-module="' + m.module_id + '">' +
          '<span class="module-ico">' + moduleIcon(m.module_id) + '</span>' +
          '<span class="module-name">' + m.name + '</span>' +
          '<span class="module-tier">' + m.layer + ' · ' + tierLabel(m.tier) + '</span>' +
          powerTag +
          '<span class="module-desc">' + m.desc + '</span>' +
          (effText ? '<span class="module-effect">' + t('livestock.effect_label', { v: effText }) + '</span>' : '') +
          '<span class="module-cost">' + t('livestock.cost_label', { faces: faces, cost: (cost || '—') }) + '</span></div>';
      }).join('');

    var retired = window.LivestockState.getRetiredModuleStorage();
    var returnedIds = Object.keys(retired.items);
    var retirementNotice = retired.records.length ? '<div class="module-card"><span>' + t('livestock.retired.notice') + '</span>' +
      '<span>' + (returnedIds.length ? returnedIds.map(function (id) { return esc(itemDisplayName(id)) + ' ×' + retired.items[id]; }).join('、') : t('livestock.retired.empty')) + '</span>' +
      (returnedIds.length ? '<button type="button" class="lv-btn" data-retired-claim>' + t('livestock.retired.claim') + '</button>' : '') + '</div>' : '';
    var transfer = window.LivestockState.getModuleStorage();
    var transferNotice = '';
    if (Object.keys(transfer.items).length || transfer.records.length) {
      transferNotice = '<div class="module-storage"><h3>' + t('livestock.transfer.title') + '</h3>';
      if (Object.keys(transfer.items).length) transferNotice += '<p>' + Object.keys(transfer.items).map(function (id) { return esc(itemDisplayName(id)) + ' ×' + transfer.items[id]; }).join('、') + '</p><button class="lv-btn" data-material-claim>' + t('livestock.transfer.claim') + '</button>';
      transfer.records.forEach(function (record) {
        var buttons = [];
        ['arm1','arm2','arm3','arm4','axis'].forEach(function (aid) {
          var holder = aid === 'axis' ? st.axis : st.arms[aid];
          Object.keys(holder || {}).forEach(function (slot) { var m = holder[slot];
            if (m && !m.shadow && m.module_id === record.module_id) buttons.push('<button class="lv-btn" data-resource-restore="' + record.id + '|' + aid + '|' + slot + '">' + t('livestock.transfer.restore') + ' ' + esc(armNames[aid] + ' / ' + (armSlotLabels[slot] || slot.replace('slot', ''))) + '</button>');
          });
        });
        var module = window.LivestockState.getModule(record.module_id);
        transferNotice += '<p>' + esc(module ? module.name : record.module_id) + ' ' + (buttons.join(' ') || t('livestock.transfer.rebuild')) + '</p>';
      });
      transferNotice += '</div>';
    }
    var covered = selectedArmId === 'axis' ? [] : (st.arm_zones[selectedArmId] || []);
    var navigation = '<div class="lv-arm-navigation"><div class="lv-filter-bar">' + Object.keys(armNames).map(function (id) { return '<button class="lv-btn' + (selectedArmId === id ? ' active' : '') + '" data-select-arm="' + id + '">' + armNames[id] + '</button>'; }).join('') + '</div><div class="lv-coverage-map">' + ['z1','z2','z4','z3'].map(function (z) { return '<span class="' + (covered.indexOf(z) >= 0 ? 'covered' : '') + '">' + z.toUpperCase() + (covered.indexOf(z) >= 0 ? ' · 相邻区域' : '') + '</span>'; }).join('') + '</div><p class="lv-note">' + (selectedArmId === 'axis' ? '轴心为牧场共用设施，作用对象见各装置说明。' : '高亮区域与本臂相邻。侧面装置只作用于朝向的一侧，鸡舍随本臂移动。') + '</p></div>';
    box.innerHTML = navigation + '<div class="lv-module-columns">' +
      '<div class="module-left">' + retirementNotice + transferNotice + '<h3 class="section-title">' + t('livestock.module_slots_title') + '</h3>' + armHtml + '</div>' +
      '<div class="module-right"><h3 class="section-title">' + t('livestock.module_library_title') + '</h3><div class="module-list">' + modList + '</div></div></div>';

    document.querySelectorAll('[data-select-arm]').forEach(function (btn) { btn.onclick = function () { selectedArmId = btn.dataset.selectArm; selectedModuleId = null; upgradePreview = null; render(); }; });
    document.querySelectorAll('[data-upgrade-preview]').forEach(function (btn) { btn.onclick = function () { upgradePreview = btn.dataset.upgradePreview; render(); }; });
    bindModuleButtons();
  }
  function moduleCoverage(st, aid, slot, m, inst) {
    if (aid === 'axis') return m.module_id === 'slaughter' ? '牧场动物（按屠宰条件）' : '牧场仓储';
    var zones = st.arm_zones[aid] || [];
    if (m.coverage === 'side') return (zones[(inst.occupied_slots || [slot]).indexOf('ccw_side') >= 0 ? 0 : 1] || '—').toUpperCase();
    if (m.module_id === 'coop') return '本臂鸡舍';
    if (m.module_id === 'feed_preprocess' || m.module_id === 'feed_refine') return '饲料加工与输送（见装置说明）';
    return zones.map(function (z) { return z.toUpperCase(); }).join(' / ') + (m.module_id === 'auto_collect' ? '及本臂鸡舍' : '');
  }
  function tierLabel(tier) { var m = { small: t('livestock.tier.small'), medium: t('livestock.tier.medium'), large: t('livestock.tier.large'), axis: t('livestock.tier.axis') }; return m[tier] || tier; }

  function canMountHere(armId, slotKey, moduleId) {
    return window.LivestockState.canBuildModule(armId, slotKey, moduleId).ok;
  }

  function itemDisplayName(itemId) {
    var IE = window.InventoryEquipment;
    if (!IE || typeof IE.getItemTemplate !== 'function') return itemId;
    var tpl = IE.getItemTemplate(itemId);
    if (!tpl) return itemId;
    if (typeof IE.getDisplayName === 'function') {
      var char = window.SceneCtx && window.SceneCtx.character;
      return String(IE.getDisplayName(tpl, null, char) || tpl.sn || itemId);
    }
    return tpl.sn || itemId;
  }

  function reasonText(r) {
    if (typeof r === 'string') r = { reason: r };
    r = r || { reason: 'unknown' };
    if (['no_slaughter','coop_full','transfer_full','no_resource_receiver'].indexOf(r.reason) >= 0) return t('livestock.reason.' + r.reason);
    if (r.reason === 'module_retired') return t('livestock.reason.module_retired');
    if (r.reason === 'slaughter_underweight') return t('livestock.reason.slaughter_underweight', { v: r.minimum_weight_kg == null ? '—' : (Math.ceil(r.minimum_weight_kg * 100) / 100).toFixed(2) });
    var map = {
      unknown_module: t('livestock.reason.unknown_module'), unknown_arm: t('livestock.reason.unknown_arm'), axis_slot_mismatch: t('livestock.reason.axis_slot_mismatch'),
      slot_mismatch: t('livestock.reason.slot_mismatch'), inner_occupied: t('livestock.reason.inner_occupied'), slot_occupied: t('livestock.reason.slot_occupied'),
      lack_material: t('livestock.reason.lack_material'), slot_empty: t('livestock.reason.slot_empty'), upgrading: t('livestock.reason.upgrading'), max_level: t('livestock.reason.max_level'),
      shadow_slot: t('livestock.reason.shadow_slot'),
      no_power: t('livestock.reason.no_power'),
      full: t('livestock.reason.full'), no_feed: t('livestock.reason.no_feed'), no_coop: t('livestock.reason.no_coop'),
      immature: t('livestock.reason.immature'), wrong_gender: t('livestock.reason.wrong_gender'), hungry: t('livestock.reason.hungry'),
      coop_occupied: t('livestock.reason.coop_occupied'), contains_resources: t('livestock.reason.contains_resources'),
      not_enough_crop: t('livestock.reason.not_enough_crop'), no_inventory: t('livestock.reason.no_inventory'),
      no_trough: t('livestock.reason.no_trough'), missing_product_weight: t('livestock.reason.missing_product_weight'),
      not_ready: t('livestock.reason.not_ready'), not_found: t('livestock.reason.not_found'), no_product: t('livestock.reason.no_product'), cooldown: t('livestock.reason.cooldown'), low_hp: t('livestock.reason.low_hp')
    };
    var base = map[r.reason] || r.reason;
    if (r.reason === 'lack_material') {
      base += t('livestock.reason.lack_material_detail', { item: itemDisplayName(r.item_id), need: r.need, have: (r.have || 0) });
    }
    if (r.reason === 'cooldown' && r.remaining != null) {
      base += t('livestock.reason.cooldown_detail', { v: r.remaining });
    }
    return base;
  }

  function doBuild(armId, slotKey, moduleId) {
    var m = window.LivestockState.getModule(moduleId);
    var r = window.LivestockState.buildModule(armId, slotKey, moduleId);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.assembled', { name: (m ? m.name : moduleId) });
      logMsg(t('livestock.log.assemble', { name: (m ? m.name : moduleId) }), 'success');
    } else {
      feedbackMsg = t('livestock.msg.assemble_fail', { reason: reasonText(r) });
      logMsg(t('livestock.msg.assemble_fail', { reason: reasonText(r) }), 'warn');
    }
    selectedModuleId = null;
    render();
  }

  var feedTargetArm = null;
  var feedTargetSlot = null;
  var feedPickerMode = null;
  var initBound = false;

  function listFeedCropsInInventory() {
    var IE = window.InventoryEquipment;
    var crops = [];
    if (!IE) return crops;
    var containers = [];
    if (typeof IE.getPocketArray === 'function') containers = containers.concat(IE.getPocketArray() || []);
    if (typeof IE.getVestArray === 'function') containers = containers.concat(IE.getVestArray() || []);
    if (typeof IE.getBackpackArray === 'function') containers = containers.concat(IE.getBackpackArray() || []);
    var seen = {};
    containers.forEach(function (cell) {
      if (!cell || !cell.item_id) return;
      if (window.LivestockState.getCropNutrition(cell.item_id) == null) return;
      if (seen[cell.item_id]) return;
      seen[cell.item_id] = 1;
      var cnt = (typeof IE.countCarriedItemsByTemplateId === 'function')
        ? IE.countCarriedItemsByTemplateId(cell.item_id) : (cell.count || 1);
      crops.push({ item_id: cell.item_id, count: cnt });
    });
    crops.sort(function (a, b) { return (window.LivestockState.getCropNutrition(b.item_id) - window.LivestockState.getCropNutrition(a.item_id)); });
    return crops;
  }

  function openFeedPicker(armId, mode, slotKey) {
    feedTargetArm = armId;
    feedTargetSlot = slotKey || null;
    feedPickerMode = mode || 'feed';
    var picker = el('livestock-feed-picker');
    if (!picker) return;
    renderFeedPicker();
    picker.classList.remove('hidden');
  }

  function closeFeedPicker() {
    feedTargetArm = null;
    feedTargetSlot = null;
    feedPickerMode = null;
    var picker = el('livestock-feed-picker');
    if (picker) picker.classList.add('hidden');
  }

  /* ---------- 电池投喂（k89 电池经济最小闭环）：把背包电池整格塞入牧场储能 ---------- */
  function listBatteriesInInventory() {
    var IE = window.InventoryEquipment;
    var out = [];
    if (!IE) return out;
    var containers = [];
    if (typeof IE.getPocketArray === 'function') containers = containers.concat(IE.getPocketArray() || []);
    if (typeof IE.getVestArray === 'function') containers = containers.concat(IE.getVestArray() || []);
    if (typeof IE.getBackpackArray === 'function') containers = containers.concat(IE.getBackpackArray() || []);
    if (typeof IE.getVehicleArray === 'function') containers = containers.concat(IE.getVehicleArray() || []);
    containers.forEach(function (cell) {
      if (!cell || !cell.item_id) return;
      if (String(cell.item_id).indexOf('battery_') !== 0) return;
      out.push({ item_id: cell.item_id, count: cell.count || 1 });
    });
    out.sort(function (a, b) { return a.item_id.localeCompare(b.item_id); });
    return out;
  }

  function openPowerPicker() {
    var picker = el('livestock-power-picker');
    if (!picker) return;
    renderPowerPicker();
    picker.classList.remove('hidden');
  }
  function closePowerPicker() {
    var picker = el('livestock-power-picker');
    if (picker) picker.classList.add('hidden');
  }

  function renderPowerPicker() {
    var list = el('livestock-power-picker-list');
    if (!list) return;
    var bats = listBatteriesInInventory();
    var cap = window.LivestockState.getPowerCharge();
    if (!bats.length) {
      list.innerHTML = '<div class="empty-hint">' + t('livestock.power.no_battery') + '</div>';
      return;
    }
    list.innerHTML = bats.map(function (b) {
      var tpl = itemDisplayName(b.item_id);
      return '<div class="lv-feed-row">' +
        '<span class="feed-name">' + tpl + '</span>' +
        '<span class="feed-meta">' + t('livestock.power.battery_meta', { n: b.count }) + '</span>' +
        '<button type="button" class="lv-btn" title="' + t('livestock.power.feed_hint') + '" data-power-feed="' + b.item_id + '">' + t('livestock.power.feed_btn') + '</button>' +
        '</div>';
    }).join('');
    var btns = list.querySelectorAll('[data-power-feed]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        doPowerFeed(this.getAttribute('data-power-feed'));
      });
    }
  }

  /** 整格塞入一颗电池：取背包电池实例 → 电量并入储能 → 该格清空 */
  function doPowerFeed(batteryId) {
    var IE = window.InventoryEquipment;
    if (!IE) return;
    var containers = [
      { key: 'pocket', arr: typeof IE.getPocketArray === 'function' ? IE.getPocketArray() : [] },
      { key: 'vest', arr: typeof IE.getVestArray === 'function' ? IE.getVestArray() : [] },
      { key: 'backpack', arr: typeof IE.getBackpackArray === 'function' ? IE.getBackpackArray() : [] },
      { key: 'vehicle', arr: typeof IE.getVehicleArray === 'function' ? IE.getVehicleArray() : [] }
    ];
    var found = null;
    for (var c = 0; c < containers.length && !found; c++) {
      var arr = containers[c].arr || [];
      for (var i = 0; i < arr.length; i++) {
        var cell = arr[i];
        if (cell && cell.item_id === batteryId) {
          // 整格塞入：可供电量 = 实例 battery_charge（掉落半电）；实例无该字段 = 满电，用模板电量/容量
          // 注意：实例显式 battery_charge:0（废电）也必须尊重，不回退模板满电（k89 边界）
          var tpl = (typeof IE.getItemTemplate === 'function') ? IE.getItemTemplate(batteryId) : null;
          var amount = 0;
          if (cell.battery_charge != null) {
            amount = Number(cell.battery_charge);
          } else if (tpl && tpl.battery_charge != null) {
            amount = Number(tpl.battery_charge);
          } else if (tpl && tpl.battery_capacity != null) {
            amount = Number(tpl.battery_capacity);
          }
          if (!(amount > 0)) { found = { empty: true }; break; }
          var taken = (typeof IE.takeItemFromContainer === 'function')
            ? IE.takeItemFromContainer(containers[c].key, i)
            : null;
          if (!taken || !taken.success) { found = { empty: true }; break; }
          var r = window.LivestockState.addPowerCharge(Math.floor(amount));
          found = { added: Math.floor(amount), charge: r.charge };
          break;
        }
      }
    }
    closePowerPicker();
    if (found && found.empty) {
      feedbackMsg = t('livestock.power.feed_fail_no_charge');
      logMsg(t('livestock.power.feed_fail_no_charge'), 'warn');
    } else if (found && found.added) {
      feedbackMsg = t('livestock.power.feed_ok', { v: found.added, total: found.charge });
      logMsg(t('livestock.power.feed_ok', { v: found.added, total: found.charge }), 'success');
    } else {
      feedbackMsg = t('livestock.power.no_battery');
    }
    render();
  }

  function renderFeedPicker() {
    var list = el('livestock-feed-picker-list');
    if (!list) return;
    var crops = listFeedCropsInInventory();
    if (!crops.length) {
      list.innerHTML = '<div class="empty-hint">' + t('livestock.feed.empty_crops') + '</div>';
      return;
    }
    var modeLabel = feedPickerMode === 'process' ? t('livestock.feed.mode_process') : t('livestock.feed.mode_feed');
    list.innerHTML = crops.map(function (c) {
      var nut = window.LivestockState.getCropNutrition(c.item_id);
      return '<div class="lv-feed-row">' +
        '<span class="feed-name">' + itemDisplayName(c.item_id) + '</span>' +
        '<span class="feed-meta">' + t('livestock.feed.meta', { nut: nut, n: c.count }) + '</span>' +
        '<button type="button" class="lv-btn" data-feed-crop="' + c.item_id + '">' + modeLabel + '</button>' +
        '</div>';
    }).join('');
    var btns = list.querySelectorAll('[data-feed-crop]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        doFeedCrop(this.getAttribute('data-feed-crop'));
      });
    }
  }

  function doFeedCrop(cropId) {
    if (!feedTargetArm) { closeFeedPicker(); render(); return; }
    if (feedPickerMode === 'process') {
      var rp = window.LivestockState.feedProcessInput(feedTargetArm, cropId, 1);
      if (rp.ok) {
        feedbackMsg = t('livestock.msg.feed_add', { name: itemDisplayName(cropId) });
        logMsg(t('livestock.log.feed_add', { name: itemDisplayName(cropId) }), 'success');
      } else {
        feedbackMsg = t('livestock.msg.process_fail', { reason: reasonText(rp) });
      }
    } else {
      var r = window.LivestockState.addFeedToTrough(feedTargetArm, cropId, 1, feedTargetSlot);
      if (r.ok) {
        feedbackMsg = t('livestock.msg.feed', { name: itemDisplayName(cropId), added: r.added.toFixed(1), total: r.total.toFixed(1) });
        logMsg(t('livestock.log.feed', { name: itemDisplayName(cropId) }), 'success');
      } else {
        feedbackMsg = t('livestock.msg.feed_fail', { reason: reasonText(r) });
      }
    }
    renderFeedPicker();
    render();
  }

  function doDismount(armId, slotKey) {
    var r = window.LivestockState.dismountModule(armId, slotKey);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.dismantled');
      logMsg(t('livestock.log.dismantle'), 'info');
    } else {
      feedbackMsg = t('livestock.msg.dismantle_fail', { reason: reasonText(r) });
    }
    render();
  }

  function doUpgrade(armId, slotKey) {
    var r = window.LivestockState.startUpgrade(armId, slotKey);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.upgrade_start', { ticks: r.ticks });
      logMsg(t('livestock.log.upgrade_start', { ticks: r.ticks }), 'success');
    } else {
      feedbackMsg = t('livestock.msg.upgrade_fail', { reason: reasonText(r) });
      logMsg(t('livestock.msg.upgrade_fail', { reason: reasonText(r) }), 'warn');
    }
    render();
  }

  function trySpendStamina(amount) {
    var Surv = window.Survival;
    if (!Surv) return { ok: true };
    if (typeof Surv.canPerformStaminaOrEnergyAction === 'function' && !Surv.canPerformStaminaOrEnergyAction()) {
      return { ok: false, reason: 'stamina_blocked' };
    }
    if (typeof Surv.consumeStamina === 'function') {
      Surv.consumeStamina(amount || 10);
    }
    return { ok: true };
  }

  function doClean(zoneId) {
    var spend = trySpendStamina(10);
    if (!spend.ok) { feedbackMsg = t('livestock.msg.no_stamina_clean'); logMsg(t('livestock.log.clean_fail_stamina'), 'warn'); render(); return; }
    var r = window.LivestockState.cleanZone(zoneId, 10);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.clean_done', { p: Math.round(r.pollution) });
      logMsg(t('livestock.log.clean_zone', { zone: zoneName(zoneId) }), 'success');
    }
    render();
  }

  function doTill(zoneId) {
    var spend = trySpendStamina(10);
    if (!spend.ok) { feedbackMsg = t('livestock.msg.no_stamina_till'); logMsg(t('livestock.log.till_fail_stamina'), 'warn'); render(); return; }
    var r = window.LivestockState.tillZone(zoneId, 10);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.till_done', { c: Math.round(r.compaction) });
      logMsg(t('livestock.log.till_zone', { zone: zoneName(zoneId) }), 'success');
    }
    render();
  }

  function doFeedChickens(armId) {
    var r = window.LivestockState.feedChickens(armId);
    if (r.ok && r.fed > 0) {
      feedbackMsg = t('livestock.msg.fed', { n: r.fed });
      logMsg(t('livestock.log.feed_chickens', { n: r.fed }), 'success');
    } else {
      feedbackMsg = r.reason ? reasonText(r) : t('livestock.msg.no_chickens');
    }
    render();
  }

  function bindModuleButtons() {
    var materialClaim = document.querySelector('#livestock-module-content [data-material-claim]');
    if (materialClaim) materialClaim.addEventListener('click', function () { window.LivestockState.claimModuleMaterials(); render(); });
    var restores = document.querySelectorAll('#livestock-module-content [data-resource-restore]');
    for (var ri = 0; ri < restores.length; ri++) restores[ri].addEventListener('click', function () {
      var parts = this.getAttribute('data-resource-restore').split('|');
      var result = window.LivestockState.restoreModuleResources(parts[0], parts[1], parts[2]);
      feedbackMsg = result.ok ? t('livestock.transfer.restored') : reasonText(result); render();
    });
    var retiredClaim = document.querySelector('#livestock-module-content [data-retired-claim]');
    if (retiredClaim) retiredClaim.addEventListener('click', function () {
      var r = window.LivestockState.claimRetiredModuleItems();
      feedbackMsg = t('livestock.retired.claim_result', { n: r.placed || 0, remaining: r.remaining == null ? '?' : r.remaining });
      render();
    });
    var cards = document.querySelectorAll('#livestock-module-content .module-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        selectedModuleId = this.getAttribute('data-module');
        feedbackMsg = t('livestock.msg.select_module_first');
        render();
      });
    }
    var empties = document.querySelectorAll('#livestock-module-content .module-slot.empty-slot.mountable');
    for (var j = 0; j < empties.length; j++) {
      empties[j].addEventListener('click', function () {
        if (!selectedModuleId) return;
        doBuild(this.getAttribute('data-arm'), this.getAttribute('data-slot'), selectedModuleId);
      });
    }
    var dismounts = document.querySelectorAll('#livestock-module-content [data-dismount]');
    for (var k = 0; k < dismounts.length; k++) {
      dismounts[k].addEventListener('click', function (e) {
        e.stopPropagation();
        var p = this.getAttribute('data-dismount').split('|');
        doDismount(p[0], p[1]);
      });
    }
    var upgrades = document.querySelectorAll('#livestock-module-content [data-upgrade]');
    for (var m2 = 0; m2 < upgrades.length; m2++) {
      upgrades[m2].addEventListener('click', function (e) {
        e.stopPropagation();
        var p = this.getAttribute('data-upgrade').split('|');
        doUpgrade(p[0], p[1]);
      });
    }
    var feeds = document.querySelectorAll('#livestock-module-content [data-feed]');
    for (var f = 0; f < feeds.length; f++) {
      feeds[f].addEventListener('click', function (e) {
        e.stopPropagation();
        var target = this.getAttribute('data-feed').split('|');
        openFeedPicker(target[0], 'feed', target[1]);
      });
    }
    var feedChickens = document.querySelectorAll('#livestock-module-content [data-feed-chickens]');
    for (var fc = 0; fc < feedChickens.length; fc++) {
      feedChickens[fc].addEventListener('click', function (e) {
        e.stopPropagation();
        doFeedChickens(this.getAttribute('data-feed-chickens'));
      });
    }
    var whTakes = document.querySelectorAll('#livestock-module-content [data-warehouse-take]');
    for (var wt = 0; wt < whTakes.length; wt++) {
      whTakes[wt].addEventListener('click', function (e) {
        e.stopPropagation();
        doWarehouseTake();
      });
    }
    var processBtns = document.querySelectorAll('#livestock-module-content [data-process]');
    for (var pb = 0; pb < processBtns.length; pb++) {
      processBtns[pb].addEventListener('click', function (e) {
        e.stopPropagation();
        openFeedPicker(this.getAttribute('data-process'), 'process');
      });
    }
  }

  function doWarehouseTake() {
    var items = window.LivestockState.warehouseTakeAll();
    if (!items || !items.length) {
      feedbackMsg = t('livestock.msg.cache_empty');
      render();
      return;
    }
    var gres = giveItems(items);
    feedbackMsg = t('livestock.msg.cache_extract', { n: gres.placed, extra: gres.dropped > 0 ? t('livestock.msg.dropped_suffix', { n: gres.dropped }) : '' });
    logMsg(feedbackMsg, 'success');
    render();
  }

  /* ---------- 产出 ---------- */
  function renderProducts(st, lv) {
    var box = el('livestock-product-content');
    if (!box) return;
    var collectRows = [];
    var slaughterRows = [];
    var corpseRows = [];
    st.animals.forEach(function (a) {
      var sp = window.LivestockState.getSpecies(a.species_id);
      if (!sp) return;
      if (a.dead) {
        var cause = corpseCauseText(a);
        var loc = a.location_type === 'coop' ? t('livestock.loc.coop', { v: (a.arm_id || '') }) : (a.zone_id ? t('livestock.loc.zone', { v: a.zone_id.toUpperCase() }) : '');
        var pollHint = corpsePollutionText(a.death_cause);
        corpseRows.push('<div class="product-row">💀 ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' · ' + esc('#' + String(a.uid).split('_').pop()) +
          ' <span class="meta">' + cause + ' · ' + loc + ' · ' + pollHint + '</span>' +
          '<button type="button" class="lv-btn" data-clean-corpse="' + a.uid + '">' + t('livestock.btn.clean_corpse50') + '</button></div>');
        return;
      }
      if (!sp.products) return;
      if (sp.products.living && sp.products.living.length) {
        // C2：每个产物独立按钮 + 「全部」批量
        var prodBtns = sp.products.living.filter(function (p) { return productMode === 'special' ? p.hp_cost > 0 : !(p.hp_cost > 0); }).map(function (p) {
          var status = window.LivestockState.getProductStatus(a.uid, p.product_id);
          var ready = status.ready;
          return '<button type="button" class="lv-btn' + (ready ? '' : ' lv-btn-dim') + '" data-collect-one="' + a.uid + '|' + p.product_id + '"' +
            (ready ? '' : ' disabled') + '>' + productName(p.product_id) + (p.hp_cost > 0 ? '（健康 −' + p.hp_cost + '）' : '') + '</button>';
        }).join('');
        if (prodBtns) collectRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' #' + esc(String(a.uid).split('_').pop()) +
          ' <span class="meta">' + animalProgress(a, sp) + '<br>' + livingText(a, sp) + '</span>' +
          '<span class="product-btns">' + prodBtns +
          '</span></div>');
      }
      var preview = window.LivestockState.previewSlaughter(a.uid);
      var slaughterHint = preview.ok ? preview.items.map(function (p) { return itemDisplayName(p.item_id) + ' ×' + p.count; }).join('、') : reasonText(preview);
      slaughterRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) +
        ' <span class="meta">' + a.weight_kg.toFixed(1) + ' kg · ' + animalProgress(a, sp) + '</span>' +
        '<button class="lv-btn" data-slaughter-select="' + a.uid + '">查看收益</button>' + (selectedSlaughterUid === a.uid ? '<span class="lv-slaughter-preview">' + esc(slaughterHint) + '</span>' +
        '<button type="button" class="lv-btn" data-slaughter="' + a.uid + '"' + (preview.ok ? '' : ' disabled') + '>' + '确认屠宰' + '</button>' : '') + '</div>');
    });
    var ready = routineProducts(st);
    box.innerHTML = '<div class="lv-product-head"><div><span class="lv-eyebrow">日常收获</span><h3>可领取 ' + ready.length + ' 份</h3><p>' + esc(readySummary(ready)) + '</p></div><button class="lv-btn lv-primary" data-routine-collect' + (ready.length ? '' : ' disabled') + '>收取蛋、奶与毛</button></div>' +
      '<div class="lv-product-nav">' + [['daily','日常采集'],['slaughter','计划屠宰'],['special','抽血'],['corpse','尸体处理 · ' + corpseRows.length]].map(function (entry) { return '<button class="lv-btn' + (productMode === entry[0] ? ' active' : '') + '" data-product-mode="' + entry[0] + '">' + entry[1] + '</button>'; }).join('') + '</div>' +
      '<div class="product-col">' + ((productMode === 'daily' || productMode === 'special') ? (collectRows.join('') || '<p class="empty-hint">' + (productMode === 'special' ? '暂无可抽血的物种。' : '养成后可在这里收蛋、挤奶与剪毛。') + '</p>') : productMode === 'slaughter' ? '<p class="lv-note">选择动物查看收益。屠宰后无法继续产奶、产蛋或繁殖。</p>' + (slaughterRows.join('') || '<p class="empty-hint">暂无动物</p>') : (corpseRows.join('') || '<p class="empty-hint">牧场没有待清理的尸体。</p>')) + '</div>';
    box.querySelectorAll('[data-product-mode]').forEach(function (btn) { btn.onclick = function () { productMode = btn.dataset.productMode; render(); }; });
    box.querySelector('[data-routine-collect]').onclick = collectRoutineProducts;
    box.querySelectorAll('[data-slaughter-select]').forEach(function (btn) { btn.onclick = function () { selectedSlaughterUid = btn.dataset.slaughterSelect; render(); }; });
    bindProductButtons();
  }
  function animalProgress(a, sp) {
    var age = Math.floor((a.age_ticks || 0) / 144);
    var target = sp.growth.fatten_cap_kg;
    var progress = target ? Math.min(100, Math.floor(a.weight_kg / target * 100)) : 0;
    var next = (sp.products.living || []).filter(function (p) { return p.nutrition_per_item > 0 && (!p.requires_gender || a.gender === p.requires_gender || a.gender === 'hermaphrodite') && p.min_age_ticks > a.age_ticks; }).sort(function (a, b) { return a.min_age_ticks - b.min_age_ticks; })[0];
    return age + ' 日龄 · 育肥 ' + progress + '%' + (next ? ' · 再过 ' + Math.ceil((next.min_age_ticks - a.age_ticks) / 144) + ' 天达到产' + productName(next.product_id) + '年龄（仍需体重与营养达标）' : '');
  }
  function routineProducts(st) {
    var rows = [];
    st.animals.forEach(function (a) {
      if (a.dead) return;
      var sp = window.LivestockState.getSpecies(a.species_id);
      (sp && sp.products && sp.products.living || []).forEach(function (p) {
        if (p.hp_cost > 0 || p.product_id === 'blood') return;
        if (window.LivestockState.getProductStatus(a.uid, p.product_id).ready) rows.push({ uid: a.uid, product: p.product_id });
      });
    });
    return rows;
  }
  function readySummary(rows) {
    var counts = {};
    rows.forEach(function (r) { counts[r.product] = (counts[r.product] || 0) + 1; });
    return Object.keys(counts).map(function (id) { return productName(id) + ' ×' + counts[id]; }).join(' · ') || '尚无完成的蛋、奶或毛';
  }
  function collectRoutineProducts() {
    var rows = routineProducts(window.LivestockState.ensureState());
    var count = 0, dropped = 0;
    rows.forEach(function (row) {
      var result = window.LivestockState.collectProduct(row.uid, row.product);
      if (!result.ok) return;
      var given = giveItems([{ item_id: result.item_id, count: result.count }]);
      count += result.count; dropped += given.dropped; addExp(100);
    });
    feedbackMsg = '已收取 ' + count + ' 份产物' + (dropped ? '，背包已满，' + dropped + ' 份放在地面' : '');
    logMsg(feedbackMsg, 'success');
    render();
  }
  function corpseCauseText(a) {
    var map = { disease: t('livestock.corpse_cause.disease'), starvation: t('livestock.corpse_cause.starvation'), blood_loss: t('livestock.corpse_cause.blood_loss'), old: t('livestock.corpse_cause.old'), crowding: t('livestock.corpse_cause.crowding') };
    return map[a.death_cause] || t('livestock.corpse_cause.death');
  }
  function corpsePollutionText(cause) {
    var rate = { disease: 0.006, starvation: 0.003, blood_loss: 0.002, old: 0.002, crowding: 0.003 }[cause] || 0;
    if (rate <= 0) return t('livestock.pollution.none');
    return t('livestock.pollution.rate', { v: (rate * 1000).toFixed(0) });
  }
  function livingText(a, sp) {
    var parts = [t('livestock.nutrition.' + window.LivestockState.getNutritionStatus(a.uid).tier)];
    sp.products.living.filter(function (p) { return productMode === 'special' ? p.hp_cost > 0 : !(p.hp_cost > 0); }).forEach(function (p) {
      parts.push(productName(p.product_id) + ' ' + productionStatusText(a, p));
    });
    return parts.join(' ');
  }
  function productionStatusText(a, p) {
    var status = window.LivestockState.getProductStatus(a.uid, p.product_id);
    if (status.ready) return t('livestock.collectable');
    if (status.reason === 'wrong_gender') return t('livestock.reason.wrong_gender');
    if (status.reason === 'immature') return t('livestock.production.age', { days: Math.ceil((status.min_age_ticks || 0) / 144) });
    if (status.progress != null) return '积累 ' + Math.min(100, Math.floor(status.progress * 100)) + '% · ' + t('livestock.nutrition.' + window.LivestockState.getNutritionStatus(a.uid).tier);
    return status.remaining > 0 ? t('livestock.cooldown', { v: status.remaining }) : t('livestock.product.unavailable');
  }

  function giveItems(items) {
    var IE = window.InventoryEquipment;
    if (!IE) return { placed: 0, dropped: 0 };
    var E = window.GameEngine;
    var pos = E && typeof E.getState === 'function' ? E.getState() : null;
    var placed = 0, dropped = 0;
    items.forEach(function (it) {
      var c = Math.max(1, Math.floor(it.count) || 1);
      for (var i = 0; i < c; i++) {
        var inst = { item_id: it.item_id, count: 1 };
        var pr = (typeof IE.putItemIntoDefaultContainer === 'function') ? IE.putItemIntoDefaultContainer(inst) : null;
        if (pr && pr.placed) {
          placed++;
        } else if (pos && typeof IE.addItemToGround === 'function') {
          IE.addItemToGround(pos.mapId, pos.x, pos.y, inst);
          dropped++;
        }
      }
    });
    return { placed: placed, dropped: dropped };
  }

  function addExp(delta) {
    if (window.SceneApp && typeof window.SceneApp.addLivestockProficiency === 'function') {
      window.SceneApp.addLivestockProficiency(delta);
    }
  }

  function logMsg(msg, type) {
    if (window.GameLog && typeof window.GameLog.log === 'function') {
      window.GameLog.log(msg, type || 'info');
    }
  }

  function collectAllProducts(uid) {
    var st = window.LivestockState.getState();
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].uid === uid) { a = st.animals[i]; break; }
    if (!a) return;
    var sp = window.LivestockState.getSpecies(a.species_id);
    var got = [];
    var dropped = 0;
    var hpBefore = a.hp;
    (sp && sp.products && sp.products.living || []).forEach(function (p) {
      var r = window.LivestockState.collectProduct(uid, p.product_id);
      if (r.ok) {
        var gres = giveItems([{ item_id: r.item_id, count: r.count }]);
        dropped += gres.dropped;
        got.push(p.product_id);
      }
    });
    if (got.length) {
      addExp(100);
      logMsg(t('livestock.log.collect', { species: speciesName(a.species_id), gender: genderGlyph(a.gender), items: got.map(productName).join(t('livestock.join.sep')) }), 'success');
      if (hpBefore !== a.hp) {
        logMsg(t('livestock.log.blood', { species: speciesName(a.species_id), from: hpBefore, to: a.hp }), 'warn');
      }
      if (dropped > 0) {
        logMsg(t('livestock.log.backpack_full', { n: dropped }), 'warn');
      }
    }
    feedbackMsg = got.length ? t('livestock.msg.collected_multi', { items: got.map(productName).join(t('livestock.join.sep')) }) : t('livestock.msg.collect_none');
    render();
  }

  // C2：采集单个产物（挤奶/剪毛/抽血/收蛋分开点选）
  function collectSingleProduct(uid, productId) {
    var st = window.LivestockState.getState();
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].uid === uid) { a = st.animals[i]; break; }
    if (!a) return;
    var sp = window.LivestockState.getSpecies(a.species_id);
    var hpBefore = a.hp;
    var r = window.LivestockState.collectProduct(uid, productId);
    if (r.ok) {
      var gres = giveItems([{ item_id: r.item_id, count: r.count }]);
      addExp(100);
      var msg = t('livestock.log.collect_one', { species: speciesName(a.species_id), gender: genderGlyph(a.gender), item: productName(productId) });
      if (hpBefore !== a.hp) msg += t('livestock.log.blood_suffix', { from: hpBefore, to: a.hp });
      if (gres.dropped > 0) msg += t('livestock.log.dropped_suffix2', { n: gres.dropped });
      logMsg(msg, 'success');
      feedbackMsg = t('livestock.msg.collected', { item: productName(productId) });
    } else {
      feedbackMsg = t('livestock.msg.collect_fail', { reason: reasonText(r) });
      logMsg(feedbackMsg, 'warn');
    }
    render();
  }

  function slaughterExp(speciesId, weight) {
    if (speciesId === 'chicken') return 25;
    return Math.max(1, Math.floor(weight));
  }

  function doSlaughter(uid) {
    var st = window.LivestockState.getState();
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].uid === uid) { a = st.animals[i]; break; }
    var spName = a ? speciesName(a.species_id) : '';
    var weight = a ? a.weight_kg : 0;
    var speciesId = a ? a.species_id : '';
    var r = window.LivestockState.slaughterAnimal(uid);
    if (r.ok) {
      var gres = giveItems(r.items);
      var n = gres.placed;
      var exp = slaughterExp(speciesId, weight);
      addExp(exp);
      logMsg(t('livestock.log.slaughter', { species: spName, weight: weight.toFixed(1), n: n, extra: gres.dropped > 0 ? t('livestock.msg.dropped_suffix', { n: gres.dropped }) : '', exp: exp }), 'success');
      feedbackMsg = t('livestock.msg.slaughter_done', { n: n });
    } else {
      feedbackMsg = t('livestock.msg.slaughter_fail') + '：' + reasonText(r);
    }
    render();
  }

  function doCleanCorpse(uid) {
    var r = window.LivestockState.cleanCorpse(uid);
    if (r.ok) {
      addExp(50);
      logMsg(t('livestock.log.corpse_clean'), 'success');
      feedbackMsg = t('livestock.msg.corpse_cleaned');
    } else {
      feedbackMsg = t('livestock.msg.no_corpse');
    }
    render();
  }

  function cleanCorpsesWhere(matchFn) {
    var st = window.LivestockState.getState();
    var n = 0;
    for (var i = st.animals.length - 1; i >= 0; i--) {
      var a = st.animals[i];
      if (a.dead && matchFn(a)) {
        st.animals.splice(i, 1);
        n++;
      }
    }
    if (n > 0) {
      addExp(50 * n);
      logMsg(t('livestock.log.corpse_clean_n', { n: n, exp: (50 * n) }), 'success');
      feedbackMsg = t('livestock.msg.corpse_clean_n', { n: n });
    } else {
      feedbackMsg = t('livestock.msg.no_corpse_here');
    }
    render();
  }
  function doCleanZoneCorpses(zoneId) {
    cleanCorpsesWhere(function (a) { return a.location_type === 'zone' && a.zone_id === zoneId; });
  }
  function doCleanArmCorpses(armId) {
    cleanCorpsesWhere(function (a) { return a.location_type === 'coop' && a.arm_id === armId; });
  }

  function bindProductButtons() {
    var collects = document.querySelectorAll('#livestock-product-content [data-collect]');
    for (var i = 0; i < collects.length; i++) {
      collects[i].addEventListener('click', function () {
        collectAllProducts(this.getAttribute('data-collect'));
      });
    }
    var collectOnes = document.querySelectorAll('#livestock-product-content [data-collect-one]');
    for (var o = 0; o < collectOnes.length; o++) {
      collectOnes[o].addEventListener('click', function () {
        var p = this.getAttribute('data-collect-one').split('|');
        collectSingleProduct(p[0], p[1]);
      });
    }
    var slaughters = document.querySelectorAll('#livestock-product-content [data-slaughter]');
    for (var j = 0; j < slaughters.length; j++) {
      slaughters[j].addEventListener('click', function () {
        doSlaughter(this.getAttribute('data-slaughter'));
      });
    }
    var corpses = document.querySelectorAll('#livestock-product-content [data-clean-corpse]');
    for (var c = 0; c < corpses.length; c++) {
      corpses[c].addEventListener('click', function () {
        doCleanCorpse(this.getAttribute('data-clean-corpse'));
      });
    }
  }

  /* ---------- 入口 ---------- */
  function syncAutoTickToggle(enabled) {
    var btn = el('livestock-tick-toggle');
    if (!btn) return;
    btn.classList.toggle('on', !!enabled);
    btn.textContent = enabled ? t('livestock.timeflow.on') : t('livestock.timeflow.off');
  }

  function init() {
    // 防重复绑定：多次调用（如场景层重载/热更新）不叠加事件监听
    if (initBound) return;
    initBound = true;
    var close = el('livestock-close');
    if (close) close.addEventListener('click', function () {
      if (window.SceneApp && typeof window.SceneApp.closeLivestockPanel === 'function') window.SceneApp.closeLivestockPanel();
    });
    var toggle = el('livestock-tick-toggle');
    if (toggle) toggle.addEventListener('click', function () {
      var SceneApp = window.SceneApp;
      if (!SceneApp || typeof SceneApp.setLivestockAutoTickEnabled !== 'function') return;
      var next = !(typeof SceneApp.isLivestockAutoTickEnabled === 'function' && SceneApp.isLivestockAutoTickEnabled());
      SceneApp.setLivestockAutoTickEnabled(next);
    });
    var tabs = document.querySelectorAll('#modal-livestock .tab-btn');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { setTab(this.getAttribute('data-tab')); });
    }
    var feedClose = el('livestock-feed-picker-close');
    if (feedClose) feedClose.addEventListener('click', function () { closeFeedPicker(); });
    var powerFeedBtn = el('livestock-power-feed-btn');
    if (powerFeedBtn) powerFeedBtn.addEventListener('click', function () { openPowerPicker(); });
    var powerClose = el('livestock-power-picker-close');
    if (powerClose) powerClose.addEventListener('click', function () { closePowerPicker(); });
  }

  window.LivestockPanel = {
    init: init,
    render: render,
    setTab: setTab,
    syncAutoTickToggle: syncAutoTickToggle,
    setSelectedAnimal: function (uid) { selectedAnimalUid = uid; }
  };
})();

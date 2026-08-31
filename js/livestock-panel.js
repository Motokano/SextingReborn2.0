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
    if (badge) badge.textContent = t('livestock.badge.rotate', { v: st.rotation_ticks_remaining });
    var lvBadge = el('livestock-level-badge');
    if (lvBadge) lvBadge.textContent = t('livestock.badge.level', { v: lv });
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
        '<div class="zone-header"><span>' + zoneLabel[zoneId] + '</span><div class="zone-eco">' + ecoText + '</div></div>' +
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

    grid.innerHTML =
      zoneHtml('z1') + armHtml('arm1', true) + zoneHtml('z2') +
      armHtml('arm4', false) + axisHtml() + armHtml('arm2', false) +
      zoneHtml('z4') + armHtml('arm3', true) + zoneHtml('z3');

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
      '<span class="icon-' + a.species_id + '">' + speciesIcon(a.species_id) + '</span>' + g + '</div>';
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
    var cls = 'ov-module-chip' + (upgrading ? ' upgrading' : '');
    var lvText = 'Lv' + inst.level + (upgrading ? '⏳' : '');
    return '<span class="' + cls + '" title="' + m.name + ' Lv' + inst.level + (upgrading ? t('livestock.module.upgrading_title', { v: inst.upgrading_remaining }) : '') + ' · ' + m.desc + '">' +
      moduleIcon(inst.module_id) + ' ' + m.name + ' ' + lvText + '</span>';
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
    var rows = st.animals.filter(function (a) { return !a.dead; }).map(function (a) {
      var sel = a.uid === selectedAnimalUid ? ' selected' : '';
      var sat = (lv >= 10) ? a.satiety.toFixed(0) : satietyStage(a.satiety);
      var hp = (lv >= 70) ? a.hp.toFixed(0) : hpStage(a.hp);
      var preg = (a.pregnant && lv >= 30) ? '<span class="badge-preg">' + t('livestock.pregnant') + '</span>' : '';
      var perk = (lv >= 50) ? perkText(a.perks, lv) : '';
      return '<div class="animal-row' + sel + '" data-uid="' + a.uid + '">' +
        '<span class="animal-ico">' + speciesIcon(a.species_id) + '</span>' +
        '<span class="animal-name">' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + preg + '</span>' +
        '<span class="animal-meta">' + t('livestock.animal.meta', { w: a.weight_kg.toFixed(1), sat: sat, hp: hp, loc: locationName(a) }) + '</span>' +
        '<span class="animal-perk">' + perk + '</span>' +
        '</div>';
    }).join('');
    list.innerHTML = rows || '<div class="empty-hint">' + t('livestock.animal.none') + '</div>';
    bindAnimalRows();

    renderAnimalDetail(st, lv);
  }

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
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].uid === selectedAnimalUid) { a = st.animals[i]; break; }
    if (!a) { box.innerHTML = '<div class="empty-hint">' + t('livestock.animal.detail_empty') + '</div>'; return; }
    var sp = window.LivestockState.getSpecies(a.species_id);
    var prod = (sp && sp.products && sp.products.living) ? sp.products.living : [];
    var prodRows = prod.map(function (p) {
      var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
      return '<div class="kv-row"><span>' + productName(p.product_id) + '</span><span>' + (cd > 0 ? t('livestock.cooldown', { v: cd }) : t('livestock.collectable')) + '</span></div>';
    }).join('') || '<div class="kv-row"><span>' + t('livestock.product.living') + '</span><span>' + t('livestock.product.none') + '</span></div>';
    box.innerHTML =
      '<div class="detail-title">' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + '</div>' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span>' + t('livestock.detail.stage') + '</span><span>' + (a.age_ticks < (sp && sp.growth && sp.growth.maturity_ticks ? sp.growth.maturity_ticks : 0) ? t('livestock.age.young') : t('livestock.age.adult')) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.weight') + '</span><span>' + a.weight_kg.toFixed(1) + ' kg</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.satiety') + '</span><span>' + ((lv >= 10) ? a.satiety.toFixed(0) : satietyStage(a.satiety)) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.hp') + '</span><span>' + ((lv >= 70) ? a.hp.toFixed(0) : hpStage(a.hp)) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.pregnant') + '</span><span>' + ((lv >= 30 && a.pregnant) ? t('livestock.pregnant.remaining', { v: a.pregnant.remaining_ticks }) : ((lv >= 30) ? t('livestock.none') : t('livestock.invisible'))) + '</span></div>' +
      '<div class="kv-row"><span>' + t('livestock.detail.location') + '</span><span>' + locationName(a) + '</span></div>' +
      '</div>' +
      '<div class="detail-perk">' + ((lv >= 50) ? (perkText(a.perks, lv) || t('livestock.perk.none')) : t('livestock.perk.locked')) + '</div>' +
      '<div class="kv-list">' + prodRows + '</div>' +
      '<div class="detail-actions">' +
      (a.location_type === 'zone'
        ? '<button type="button" class="lv-btn' + (a.zone_id === 'z1' ? ' active' : '') + '" data-move="z1">' + t('livestock.btn.move_to', { zone: 'Z1' }) + '</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z2' ? ' active' : '') + '" data-move="z2">' + t('livestock.btn.move_to', { zone: 'Z2' }) + '</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z3' ? ' active' : '') + '" data-move="z3">' + t('livestock.btn.move_to', { zone: 'Z3' }) + '</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z4' ? ' active' : '') + '" data-move="z4">' + t('livestock.btn.move_to', { zone: 'Z4' }) + '</button>'
        : '<span class="empty-hint" style="padding:0;">' + t('livestock.coop_no_move') + '</span>') +
      '</div>';
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
    var armHtml = Object.keys(armNames).map(function (aid) {
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
            extra = t('livestock.feed_units', { v: (inst.feed_units != null ? inst.feed_units.toFixed(1) : '0') });
            extraActions = '<button type="button" class="lv-btn" data-feed="' + aid + '">' + t('livestock.btn.feed') + '</button>';
          } else if (mid === 'coop') {
            extraActions = '<button type="button" class="lv-btn" data-feed-chickens="' + aid + '">' + t('livestock.btn.feed_chickens') + '</button>';
          } else if (mid === 'feed_preprocess' || mid === 'feed_refine') {
            var queueN = inst.input_queue ? inst.input_queue.reduce(function (s, q) { return s + q.count; }, 0) : 0;
            extra = t('livestock.queue_crops', { n: queueN }) + (mid === 'feed_refine' && inst.refine_cache > 0 ? t('livestock.refine_cache', { v: inst.refine_cache.toFixed(1) }) : '');
            extraActions = '<button type="button" class="lv-btn" data-process="' + aid + '">' + t('livestock.btn.process') + '</button>';
          } else if (mid === 'climate_control') {
            var modeNames = { off: t('livestock.mode.off'), sunny: t('livestock.mode.sunny'), shade: t('livestock.mode.shade'), humid: t('livestock.mode.humid') };
            var cdC = inst.mode_switch_cooldown || 0;
            extra = t('livestock.mode_label', { mode: (modeNames[inst.mode] || t('livestock.mode.off')) }) + (cdC > 0 ? t('livestock.switch_cooldown', { v: cdC }) : '');
            extraActions =
              '<button type="button" class="lv-btn" data-climate="sunny">' + t('livestock.mode.sunny') + '</button>' +
              '<button type="button" class="lv-btn" data-climate="shade">' + t('livestock.mode.shade') + '</button>' +
              (inst.level >= 2 ? '<button type="button" class="lv-btn" data-climate="humid">' + t('livestock.mode.humid') + '</button>' : '') +
              '<button type="button" class="lv-btn" data-climate="off">' + t('livestock.mode.off') + '</button>';
          } else if (mid === 'waste_heat_recycle') {
            var hmNames = { fertilizer: t('livestock.mode.fertilizer'), fuel: t('livestock.mode.fuel'), feed: t('livestock.mode.feed') };
            var outN = inst.output_queue ? inst.output_queue.reduce(function (s, q) { return s + q.count; }, 0) : 0;
            extra = t('livestock.mode_label', { mode: (hmNames[inst.mode] || t('livestock.mode.fertilizer')) }) + t('livestock.output_count', { n: outN }) + (inst.points ? t('livestock.points_suffix', { v: inst.points.toFixed(0) }) : '');
            extraActions =
              '<button type="button" class="lv-btn" data-heat-mode="fertilizer">' + t('livestock.mode.fertilizer') + '</button>' +
              (inst.level >= 2 ? '<button type="button" class="lv-btn" data-heat-mode="fuel">' + t('livestock.mode.fuel') + '</button>' : '') +
              (inst.level >= 4 ? '<button type="button" class="lv-btn" data-heat-mode="feed">' + t('livestock.mode.feed') + '</button>' : '') +
              (outN > 0 ? '<button type="button" class="lv-btn" data-heat-take="1">' + t('livestock.btn.extract') + '</button>' : '');
          } else if (mid === 'link_schedule') {
            var rulesOn = inst.enabled_rules || [];
            var ruleNames = { till_seed: t('livestock.rule.till_seed'), grass_feed: t('livestock.rule.grass_feed'), clean_collect: t('livestock.rule.clean_collect') };
            extra = t('livestock.link_label', { rules: (rulesOn.length ? rulesOn.map(function (r) { return ruleNames[r] || r; }).join(t('livestock.join.sep')) : t('livestock.link_none')) });
            extraActions = Object.keys(ruleNames).map(function (rid) {
              var on = rulesOn.indexOf(rid) >= 0;
              return '<button type="button" class="lv-btn ' + (on ? 'lv-toggle on' : 'lv-toggle') + '" data-link-rule="' + rid + '">' + ruleNames[rid] + '</button>';
            }).join('');
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
          return '<div class="module-slot filled" data-arm="' + aid + '" data-slot="' + sk + '">' +
            '<span class="slot-key">' + label + '</span>' +
            '<span class="slot-val">' + m.name + ' ' + lvText + extra + '</span>' +
            (effText ? '<span class="module-effect slot-effect">' + effText + '</span>' : '') +
            '<span class="slot-actions">' +
            extraActions +
            '<button type="button" class="lv-btn" data-upgrade="' + aid + '|' + sk + '">' + t('livestock.btn.upgrade') + '</button>' +
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
      .sort(function (a, b) { return (tierOrder[a.layer] - tierOrder[b.layer]) || a.name.localeCompare(b.name, 'zh'); })
      .map(function (m) {
        var sel = selectedModuleId === m.module_id ? ' selected' : '';
        var step = window.LivestockState.getBuildStep(m.tier, 1);
        var cost = step && step.inputs ? step.inputs.map(function (i) { return itemDisplayName(i.item_id) + '×' + i.count; }).join(' ') : '';
        var faces = (m.axis_slot != null)
          ? t('livestock.axis_slot_full', { v: m.axis_slot })
          : window.LivestockState.expandModuleSlots(m).map(function (s) { return slotNames[s] || s; }).join('+');
        var effText = window.LivestockState.getModuleEffectText(m.module_id, 1);
        return '<div class="module-card' + sel + '" data-module="' + m.module_id + '">' +
          '<span class="module-ico">' + moduleIcon(m.module_id) + '</span>' +
          '<span class="module-name">' + m.name + '</span>' +
          '<span class="module-tier">' + m.layer + ' · ' + tierLabel(m.tier) + '</span>' +
          '<span class="module-desc">' + m.desc + '</span>' +
          (effText ? '<span class="module-effect">' + t('livestock.effect_label', { v: effText }) + '</span>' : '') +
          '<span class="module-cost">' + t('livestock.cost_label', { faces: faces, cost: (cost || '—') }) + '</span></div>';
      }).join('');

    box.innerHTML =
      '<div class="module-left"><h3 class="section-title">' + t('livestock.module_slots_title') + '</h3>' + armHtml + '</div>' +
      '<div class="module-right"><h3 class="section-title">' + t('livestock.module_library_title') + '</h3><div class="module-list">' + modList + '</div></div>';

    bindModuleButtons();
  }
  function tierLabel(t) { var m = { small: t('livestock.tier.small'), medium: t('livestock.tier.medium'), large: t('livestock.tier.large'), axis: t('livestock.tier.axis') }; return m[t] || t; }

  function canMountHere(armId, slotKey, moduleId) {
    var m = window.LivestockState.getModule(moduleId);
    if (!m) return false;
    if (armId === 'axis') {
      var axisNum = parseInt(String(slotKey).replace('slot', ''), 10);
      return m.axis_slot === axisNum;
    }
    var slots = window.LivestockState.expandModuleSlots(m);
    return slots.indexOf(slotKey) >= 0;
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
    var map = {
      unknown_module: t('livestock.reason.unknown_module'), unknown_arm: t('livestock.reason.unknown_arm'), axis_slot_mismatch: t('livestock.reason.axis_slot_mismatch'),
      slot_mismatch: t('livestock.reason.slot_mismatch'), inner_occupied: t('livestock.reason.inner_occupied'), slot_occupied: t('livestock.reason.slot_occupied'),
      lack_material: t('livestock.reason.lack_material'), slot_empty: t('livestock.reason.slot_empty'), upgrading: t('livestock.reason.upgrading'), max_level: t('livestock.reason.max_level'),
      shadow_slot: t('livestock.reason.shadow_slot'),
      not_found: t('livestock.reason.not_found'), no_product: t('livestock.reason.no_product'), cooldown: t('livestock.reason.cooldown'), low_hp: t('livestock.reason.low_hp')
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

  function openFeedPicker(armId, mode) {
    feedTargetArm = armId;
    feedPickerMode = mode || 'feed';
    var picker = el('livestock-feed-picker');
    if (!picker) return;
    renderFeedPicker();
    picker.classList.remove('hidden');
  }

  function closeFeedPicker() {
    feedTargetArm = null;
    feedPickerMode = null;
    var picker = el('livestock-feed-picker');
    if (picker) picker.classList.add('hidden');
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
    var IE = window.InventoryEquipment;
    if (IE && typeof IE.removeCarriedItemsByTemplateId === 'function') {
      var rem = IE.removeCarriedItemsByTemplateId(cropId, 1);
      if (!rem.ok) { feedbackMsg = t('livestock.msg.deduct_crop_fail'); renderFeedPicker(); return; }
    }
    if (feedPickerMode === 'process') {
      var rp = window.LivestockState.feedProcessInput(feedTargetArm, cropId, 1);
      if (rp.ok) {
        feedbackMsg = t('livestock.msg.feed_add', { name: itemDisplayName(cropId) });
        logMsg(t('livestock.log.feed_add', { name: itemDisplayName(cropId) }), 'success');
      } else {
        feedbackMsg = t('livestock.msg.process_fail', { reason: reasonText(rp) });
      }
    } else {
      var r = window.LivestockState.addFeedToTrough(feedTargetArm, cropId, 1);
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
      feedbackMsg = t('livestock.msg.no_chickens');
    }
    render();
  }

  function bindModuleButtons() {
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
        openFeedPicker(this.getAttribute('data-feed'));
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
    var climateBtns = document.querySelectorAll('#livestock-module-content [data-climate]');
    for (var cb = 0; cb < climateBtns.length; cb++) {
      climateBtns[cb].addEventListener('click', function (e) {
        e.stopPropagation();
        doClimateMode(this.getAttribute('data-climate'));
      });
    }
    var heatModeBtns = document.querySelectorAll('#livestock-module-content [data-heat-mode]');
    for (var hb = 0; hb < heatModeBtns.length; hb++) {
      heatModeBtns[hb].addEventListener('click', function (e) {
        e.stopPropagation();
        doHeatMode(this.getAttribute('data-heat-mode'));
      });
    }
    var heatTakes = document.querySelectorAll('#livestock-module-content [data-heat-take]');
    for (var ht = 0; ht < heatTakes.length; ht++) {
      heatTakes[ht].addEventListener('click', function (e) {
        e.stopPropagation();
        doHeatTake();
      });
    }
    var linkBtns = document.querySelectorAll('#livestock-module-content [data-link-rule]');
    for (var lb = 0; lb < linkBtns.length; lb++) {
      linkBtns[lb].addEventListener('click', function (e) {
        e.stopPropagation();
        doLinkToggle(this.getAttribute('data-link-rule'));
      });
    }
  }

  function doClimateMode(mode) {
    var r = window.LivestockState.climateSetMode(mode);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.climate_mode', { mode: ({ sunny: t('livestock.mode.sunny'), shade: t('livestock.mode.shade'), humid: t('livestock.mode.humid'), off: t('livestock.mode.off') }[mode] || mode), cooldown: r.cooldown ? t('livestock.msg.cooldown_suffix', { v: r.cooldown }) : '' });
      logMsg(feedbackMsg, 'success');
    } else {
      feedbackMsg = t('livestock.msg.switch_fail', { reason: reasonText(r) });
      logMsg(feedbackMsg, 'warn');
    }
    render();
  }

  function doHeatMode(mode) {
    var r = window.LivestockState.wasteHeatSetMode(mode);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.heat_mode', { mode: ({ fertilizer: t('livestock.mode.fertilizer'), fuel: t('livestock.mode.fuel'), feed: t('livestock.mode.feed') }[mode] || mode) });
      logMsg(feedbackMsg, 'success');
    } else {
      feedbackMsg = t('livestock.msg.switch_fail', { reason: reasonText(r) });
    }
    render();
  }

  function doHeatTake() {
    var items = window.LivestockState.wasteHeatTakeAll();
    if (!items || !items.length) { feedbackMsg = t('livestock.msg.no_output'); render(); return; }
    var gres = giveItems(items);
    feedbackMsg = t('livestock.msg.heat_extract', { n: gres.placed, extra: gres.dropped > 0 ? t('livestock.msg.dropped_suffix', { n: gres.dropped }) : '' });
    logMsg(feedbackMsg, 'success');
    render();
  }

  function doLinkToggle(ruleId) {
    var r = window.LivestockState.linkScheduleToggleRule(ruleId);
    if (r.ok) {
      feedbackMsg = t('livestock.msg.rule_toggled', { state: r.enabled.indexOf(ruleId) >= 0 ? t('livestock.state.enabled') : t('livestock.state.disabled') });
      logMsg(feedbackMsg, 'success');
    } else {
      feedbackMsg = t('livestock.msg.switch_fail', { reason: reasonText(r) });
    }
    render();
  }

  // 提取中央仓储枢纽缓存全部产物（§11.6.1）
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
        corpseRows.push('<div class="product-row">💀 ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) +
          ' <span class="meta">' + cause + ' · ' + loc + ' · ' + pollHint + '</span>' +
          '<button type="button" class="lv-btn" data-clean-corpse="' + a.uid + '">' + t('livestock.btn.clean_corpse50') + '</button></div>');
        return;
      }
      if (!sp.products) return;
      if (sp.products.living && sp.products.living.length) {
        // C2：每个产物独立按钮 + 「全部」批量
        var prodBtns = sp.products.living.map(function (p) {
          var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
          var ready = cd <= 0;
          return '<button type="button" class="lv-btn' + (ready ? '' : ' lv-btn-dim') + '" data-collect-one="' + a.uid + '|' + p.product_id + '"' +
            (ready ? '' : ' disabled') + '>' + productName(p.product_id) + (cd > 0 ? ' ' + cd : '') + '</button>';
        }).join('');
        collectRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) +
          ' <span class="meta">' + livingText(a, sp) + '</span>' +
          '<span class="product-btns">' + prodBtns +
          '<button type="button" class="lv-btn" data-collect="' + a.uid + '">' + t('livestock.btn.collect_all') + '</button></span></div>');
      }
      slaughterRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) +
        ' <span class="meta">' + a.weight_kg.toFixed(1) + ' kg</span>' +
        '<button type="button" class="lv-btn" data-slaughter="' + a.uid + '">' + t('livestock.btn.slaughter') + '</button></div>');
    });
    box.innerHTML =
      '<div class="product-col"><h3 class="section-title">' + t('livestock.tab.collect') + '</h3>' + (collectRows.join('') || '<div class="empty-hint">' + t('livestock.collect.none') + '</div>') + '</div>' +
      '<div class="product-col"><h3 class="section-title">' + t('livestock.tab.slaughter') + '</h3>' + (slaughterRows.join('') || '<div class="empty-hint">' + t('livestock.slaughter.none') + '</div>') + '</div>' +
      '<div class="product-col"><h3 class="section-title">' + t('livestock.tab.corpse') + '</h3>' + (corpseRows.join('') || '<div class="empty-hint">' + t('livestock.corpse.none') + '</div>') + '</div>';
    bindProductButtons();
  }
  function corpseCauseText(a) {
    var map = { disease: t('livestock.corpse_cause.disease'), starvation: t('livestock.corpse_cause.starvation'), blood_loss: t('livestock.corpse_cause.blood_loss'), old: t('livestock.corpse_cause.old') };
    return map[a.death_cause] || t('livestock.corpse_cause.death');
  }
  function corpsePollutionText(cause) {
    var rate = { disease: 0.006, starvation: 0.003, blood_loss: 0.002, old: 0.002 }[cause] || 0;
    if (rate <= 0) return t('livestock.pollution.none');
    return t('livestock.pollution.rate', { v: (rate * 1000).toFixed(0) });
  }
  function livingText(a, sp) {
    var parts = [];
    sp.products.living.forEach(function (p) {
      var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
      parts.push(productName(p.product_id) + (cd > 0 ? t('livestock.product.cooldown', { v: cd }) : '✓'));
    });
    return parts.join(' ');
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
      feedbackMsg = t('livestock.msg.slaughter_fail');
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
  }

  window.LivestockPanel = {
    init: init,
    render: render,
    setTab: setTab,
    syncAutoTickToggle: syncAutoTickToggle,
    setSelectedAnimal: function (uid) { selectedAnimalUid = uid; }
  };
})();

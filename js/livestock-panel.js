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

  function getLivestockLevel() {
    // MVP：默认 90 展示完整信息；后续接 InventoryEquipment.skills.survival_livestock.level
    try {
      if (window.InventoryEquipment && typeof window.InventoryEquipment.getSkillLevel === 'function') {
        var lv = window.InventoryEquipment.getSkillLevel('survival_livestock');
        if (lv != null) return lv;
      }
    } catch (e) { /* ignore */ }
    return 90;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function grassStage(h) {
    if (h == null) return '秃';
    if (h < 0.3) return '秃';
    if (h < 0.6) return '稀疏';
    if (h < 1.0) return '适中';
    return '茂盛';
  }
  function compactionStage(c) {
    if (c == null) return '疏松';
    if (c < 30) return '疏松';
    if (c < 55) return '略硬';
    if (c < 80) return '板结';
    return '严重';
  }
  function pollutionStage(p) {
    if (p == null) return '干净';
    if (p < 30) return '干净';
    if (p < 50) return '轻微';
    if (p < 70) return '中度';
    return '严重';
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
    if (badge) badge.textContent = '⟳ 下次旋转 ' + st.rotation_ticks_remaining + ' tick';
    var lvBadge = el('livestock-level-badge');
    if (lvBadge) lvBadge.textContent = '畜牧 Lv.' + lv;

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
    var zoneLabel = { z1: 'Z1 左上区域', z2: 'Z2 右上区域', z3: 'Z3 右下区域', z4: 'Z4 左下区域' };
    var armOrder = ['arm1', 'arm4', 'arm2', 'arm3'];

    var cells = [];
    // 3x3: z1, arm1, z2, arm4, axis, arm2, z4, arm3, z3
    function zoneHtml(zoneId) {
      var z = st.zones[zoneId] || {};
      var animals = st.animals.filter(function (a) { return a.location_type === 'zone' && a.zone_id === zoneId && !a.dead; });
      var eco = [];
      if (lv >= 10) eco.push('🌿 ' + grassStage(z.grass_height));
      if (lv >= 20) eco.push('☢️ ' + pollutionStage(z.pollution));
      if (lv >= 30) eco.push('🪨 ' + compactionStage(z.compaction));
      if (lv >= 40) eco.push('草 ' + (z.grass_height == null ? '-' : z.grass_height.toFixed(2)) + 'm');
      if (lv >= 60) eco.push('板结 ' + (z.compaction == null ? '-' : z.compaction));
      var ecoText = eco.join(' · ') || '（生态信息未解锁）';
      var sel = selectedZoneId === zoneId ? ' selected' : '';
      var animalHtml = animals.map(function (a) { return animalChip(a); }).join('') ||
        '<div class="empty-hint" style="padding:2px;font-size:11px;">空</div>';
      return '<div class="zone-cell' + sel + '" data-zone="' + zoneId + '">' +
        '<div class="eco-overlay ' + ecoOverlayClass(zoneId, z) + '"></div>' +
        '<div class="zone-header"><span>' + zoneLabel[zoneId] + '</span><span>' + ecoText + '</span></div>' +
        '<div class="animal-list">' + animalHtml + '</div></div>';
    }
    function armHtml(armId, vertical) {
      var a = st.arms[armId] || {};
      var mods = [a.inner, a.front, a.bottom, a.top, a.cw_side, a.ccw_side].filter(Boolean);
      var icons = mods.map(function (m) { return moduleIcon(m); }).join('');
      if (!icons) icons = '➖';
      var lbl = { arm1: '一号臂', arm2: '二号臂', arm3: '三号臂', arm4: '四号臂' }[armId];
      var chickens = st.animals.filter(function (x) { return x.location_type === 'coop' && x.arm_id === armId && !x.dead; });
      var chickenHtml = chickens.length ? '<div class="coop-animals">' + chickens.map(function (c) { return animalChip(c, true); }).join('') + '</div>' : '';
      return '<div class="arm-cell ' + (vertical ? 'arm-vertical' : 'arm-horizontal') + '" data-arm="' + armId + '">' +
        '<span class="arm-label">' + lbl + '</span><div class="module-slots">' + icons + '</div>' + chickenHtml + '</div>';
    }
    function axisHtml() {
      var mods = [st.axis.slot1, st.axis.slot2].filter(Boolean);
      var icons = mods.map(moduleIcon).join('') || '➖';
      return '<div class="axis-cell" data-arm="axis"><span class="arm-label">轴心</span>' +
        '<div class="module-slots">' + icons + '</div>' +
        '<div class="rotate-indicator">⟳</div></div>';
    }

    grid.innerHTML =
      zoneHtml('z1') + armHtml('arm1', true) + zoneHtml('z2') +
      armHtml('arm4', false) + axisHtml() + armHtml('arm2', false) +
      zoneHtml('z4') + armHtml('arm3', true) + zoneHtml('z3');

    bindZoneClicks();
    bindArmClicks();
    bindDragDrop();
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
      var preg = (a.pregnant && lv >= 30) ? '<span class="badge-preg">孕</span>' : '';
      var perk = (lv >= 50) ? perkText(a.perks, lv) : '';
      return '<div class="animal-row' + sel + '" data-uid="' + a.uid + '">' +
        '<span class="animal-ico">' + speciesIcon(a.species_id) + '</span>' +
        '<span class="animal-name">' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + preg + '</span>' +
        '<span class="animal-meta">' + a.weight_kg.toFixed(1) + 'kg · 饱 ' + sat + ' · 血 ' + hp + ' · ' + locationName(a) + '</span>' +
        '<span class="animal-perk">' + perk + '</span>' +
        '</div>';
    }).join('');
    list.innerHTML = rows || '<div class="empty-hint">暂无动物</div>';
    bindAnimalRows();

    renderAnimalDetail(st, lv);
  }

  function satietyStage(s) { if (s == null) return '-'; if (s < 30) return '饥饿'; if (s < 70) return '正常'; return '饱足'; }
  function hpStage(h) { if (h == null) return '-'; if (h < 30) return '重病'; if (h < 60) return '患病'; if (h < 90) return '亚健康'; return '健康'; }
  function zoneName(z) { return { z1: 'Z1', z2: 'Z2', z3: 'Z3', z4: 'Z4' }[z] || z; }
  function locationName(a) {
    if (a.location_type === 'coop') {
      return { arm1: '一号臂·鸡笼', arm2: '二号臂·鸡笼', arm3: '三号臂·鸡笼', arm4: '四号臂·鸡笼' }[a.arm_id] || (a.arm_id + '·鸡笼');
    }
    return locationName(a);
  }
  function perkText(perks, lv) {
    if (!perks || !perks.length) return '';
    var names = perks.map(function (p) {
      var pdef = window.LivestockState.getPerk(p);
      if (!pdef) return p;
      if (lv >= 90 && pdef.modifiers) {
        var mods = Object.keys(pdef.modifiers).map(function (k) { return k + ' ' + pdef.modifiers[k]; }).join(' ');
        return pdef.name + '(' + mods + ')';
      }
      return pdef.name;
    });
    return 'Perk: ' + names.join('、');
  }

  function renderAnimalDetail(st, lv) {
    var box = el('livestock-animal-detail');
    if (!box) return;
    var a = null;
    for (var i = 0; i < st.animals.length; i++) if (st.animals[i].uid === selectedAnimalUid) { a = st.animals[i]; break; }
    if (!a) { box.innerHTML = '<div class="empty-hint">选中一只动物查看详情</div>'; return; }
    var sp = window.LivestockState.getSpecies(a.species_id);
    var prod = (sp && sp.products && sp.products.living) ? sp.products.living : [];
    var prodRows = prod.map(function (p) {
      var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
      return '<div class="kv-row"><span>' + p.product_id + '</span><span>' + (cd > 0 ? '冷却 ' + cd + ' tick' : '可采集') + '</span></div>';
    }).join('') || '<div class="kv-row"><span>活体产出</span><span>无</span></div>';
    box.innerHTML =
      '<div class="detail-title">' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + '</div>' +
      '<div class="kv-list">' +
      '<div class="kv-row"><span>阶段</span><span>' + (a.age_ticks < (sp && sp.growth && sp.growth.maturity_ticks ? sp.growth.maturity_ticks : 0) ? '幼体' : '成年') + '</span></div>' +
      '<div class="kv-row"><span>体重</span><span>' + a.weight_kg.toFixed(1) + ' kg</span></div>' +
      '<div class="kv-row"><span>饱腹</span><span>' + ((lv >= 10) ? a.satiety.toFixed(0) : satietyStage(a.satiety)) + '</span></div>' +
      '<div class="kv-row"><span>血量</span><span>' + ((lv >= 70) ? a.hp.toFixed(0) : hpStage(a.hp)) + '</span></div>' +
      '<div class="kv-row"><span>怀孕</span><span>' + ((lv >= 30 && a.pregnant) ? '剩余 ' + a.pregnant.remaining_ticks + ' tick' : ((lv >= 30) ? '无' : '不可见')) + '</span></div>' +
      '<div class="kv-row"><span>所在区</span><span>' + locationName(a) + '</span></div>' +
      '</div>' +
      '<div class="detail-perk">' + ((lv >= 50) ? (perkText(a.perks, lv) || '无 Perk') : 'Perk 不可见（畜牧 Lv.50 解锁）') + '</div>' +
      '<div class="kv-list">' + prodRows + '</div>' +
      '<div class="detail-actions">' +
      (a.location_type === 'zone'
        ? '<button type="button" class="lv-btn' + (a.zone_id === 'z1' ? ' active' : '') + '" data-move="z1">迁到 Z1</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z2' ? ' active' : '') + '" data-move="z2">迁到 Z2</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z3' ? ' active' : '') + '" data-move="z3">迁到 Z3</button>' +
          '<button type="button" class="lv-btn' + (a.zone_id === 'z4' ? ' active' : '') + '" data-move="z4">迁到 Z4</button>'
        : '<span class="empty-hint" style="padding:0;">鸡笼动物，不参与区域迁移</span>') +
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
    var armNames = { arm1: '一号臂', arm2: '二号臂', arm3: '三号臂', arm4: '四号臂', axis: '轴心' };
    var armSlotLabels = { inner: '内部', front: '前端', bottom: '底面', top: '上表面', cw_side: '顺侧', ccw_side: '逆侧' };
    var armHtml = Object.keys(armNames).map(function (aid) {
      var slots = (aid === 'axis') ? { slot1: st.axis.slot1, slot2: st.axis.slot2 } : st.arms[aid];
      var slotHtml = Object.keys(slots).map(function (sk) {
        var mod = slots[sk];
        var m = mod ? window.LivestockState.getModule(mod) : null;
        return '<div class="module-slot' + (mod ? ' filled' : '') + '"><span class="slot-key">' + (aid === 'axis' ? ('位' + sk.replace('slot', '')) : armSlotLabels[sk]) + '</span>' +
          '<span class="slot-val">' + (m ? m.name : '空') + '</span></div>';
      }).join('');
      return '<div class="arm-card"><div class="arm-card-title">' + armNames[aid] + '</div><div class="arm-slots">' + slotHtml + '</div></div>';
    }).join('');

    var mods = window.LivestockState.allModules();
    var tierOrder = { '第一层': 1, '第二层': 2, '轴心': 3 };
    var modList = Object.keys(mods).map(function (k) { return mods[k]; })
      .sort(function (a, b) { return (tierOrder[a.layer] - tierOrder[b.layer]) || a.name.localeCompare(b.name, 'zh'); })
      .map(function (m) {
        return '<div class="module-card" data-module="' + m.module_id + '">' +
          '<span class="module-ico">' + moduleIcon(m.module_id) + '</span>' +
          '<span class="module-name">' + m.name + '</span>' +
          '<span class="module-tier">' + m.layer + ' · ' + (window.LivestockState.getState() && false ? '' : '') + tierLabel(m.tier) + '</span>' +
          '<span class="module-desc">' + m.desc + '</span></div>';
      }).join('');

    box.innerHTML =
      '<div class="module-left"><h3 class="section-title">装置模块位</h3>' + armHtml + '</div>' +
      '<div class="module-right"><h3 class="section-title">模块库</h3><div class="module-list">' + modList + '</div></div>';
  }
  function tierLabel(t) { return { small: '小型', medium: '中型', large: '大型', axis: '轴心' }[t] || t; }

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
        corpseRows.push('<div class="product-row">💀 ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' <span class="meta">' + (a.death_cause === 'disease' ? '病死' : '饿死') + '</span></div>');
        return;
      }
      if (!sp.products) return;
      if (sp.products.living && sp.products.living.length) {
        collectRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' <span class="meta">' + livingText(a, sp) + '</span></div>');
      }
      slaughterRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' <span class="meta">' + a.weight_kg.toFixed(1) + ' kg</span></div>');
    });
    box.innerHTML =
      '<div class="product-col"><h3 class="section-title">活体采集</h3>' + (collectRows.join('') || '<div class="empty-hint">无可采集动物</div>') + '</div>' +
      '<div class="product-col"><h3 class="section-title">屠宰</h3>' + (slaughterRows.join('') || '<div class="empty-hint">无可屠宰动物</div>') + '</div>' +
      '<div class="product-col"><h3 class="section-title">尸体</h3>' + (corpseRows.join('') || '<div class="empty-hint">无尸体</div>') + '</div>';
  }
  function livingText(a, sp) {
    var parts = [];
    sp.products.living.forEach(function (p) {
      var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
      parts.push(p.product_id + (cd > 0 ? '(冷却' + cd + ')' : '✓'));
    });
    return parts.join(' ');
  }

  /* ---------- 入口 ---------- */
  function syncAutoTickToggle(enabled) {
    var btn = el('livestock-tick-toggle');
    if (!btn) return;
    btn.classList.toggle('on', !!enabled);
    btn.textContent = enabled ? '时间流逝：开' : '时间流逝：关';
  }

  function init() {
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
  }

  window.LivestockPanel = {
    init: init,
    render: render,
    setTab: setTab,
    syncAutoTickToggle: syncAutoTickToggle,
    setSelectedAnimal: function (uid) { selectedAnimalUid = uid; }
  };
})();

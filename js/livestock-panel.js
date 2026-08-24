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
    var footer = document.querySelector('#modal-livestock .lv-footer');
    if (footer) footer.textContent = feedbackMsg || '旋转不可控 · 动物随顺时针迁移 · 畜牧等级提升可解锁更多信息';

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
      // 生态阶段（三段式模糊提示）始终可见，玩家任何等级都能感知区域状态
      eco.push('🌿 ' + grassStage(z.grass_height));
      eco.push('☢️ ' + pollutionStage(z.pollution));
      eco.push('🪨 ' + compactionStage(z.compaction));
      // 精确数值按等级解锁
      if (lv >= 40) eco.push('草 ' + (z.grass_height == null ? '-' : z.grass_height.toFixed(2)) + 'm');
      if (lv >= 50) eco.push('☢️ ' + (z.pollution == null ? '-' : Math.round(z.pollution)) + '%');
      if (lv >= 60) eco.push('🪨 ' + (z.compaction == null ? '-' : Math.round(z.compaction)));
      var ecoHtml = eco.map(function (e) { return '<div class="eco-line">' + e + '</div>'; }).join('');
      var ecoText = ecoHtml || '<div class="eco-line">生态信息未解锁</div>';
      var sel = selectedZoneId === zoneId ? ' selected' : '';
      var animalHtml = animals.map(function (a) { return animalChip(a); }).join('') ||
        '<div class="empty-hint" style="padding:2px;font-size:11px;">空</div>';
      return '<div class="zone-cell' + sel + '" data-zone="' + zoneId + '">' +
        '<div class="eco-overlay ' + ecoOverlayClass(zoneId, z) + '"></div>' +
        '<div class="zone-header"><span>' + zoneLabel[zoneId] + '</span><div class="zone-eco">' + ecoText + '</div></div>' +
        '<div class="animal-list">' + animalHtml + '</div>' +
        '<div class="zone-actions">' +
        '<button type="button" class="lv-btn" data-clean="' + zoneId + '">清扫</button>' +
        '<button type="button" class="lv-btn" data-till="' + zoneId + '">松土</button>' +
        '</div></div>';
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
    return zoneName(a.zone_id);
  }
  function perkText(perks, lv) {
    if (!perks || !perks.length) return '';
    var names = perks.map(function (p) {
      var pdef = window.LivestockState.getPerk(p);
      return pdef ? pdef.name : p;
    });
    return '特性：' + names.join('、');
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
    if (!a) { box.innerHTML = '<div class="empty-hint">选中一只动物查看详情</div>'; return; }
    var sp = window.LivestockState.getSpecies(a.species_id);
    var prod = (sp && sp.products && sp.products.living) ? sp.products.living : [];
    var prodRows = prod.map(function (p) {
      var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
      return '<div class="kv-row"><span>' + productName(p.product_id) + '</span><span>' + (cd > 0 ? '冷却 ' + cd + ' tick' : '可采集') + '</span></div>';
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
      '<div class="detail-perk">' + ((lv >= 50) ? (perkText(a.perks, lv) || '无特性') : '特性不可见（畜牧 Lv.50 解锁）') + '</div>' +
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
        var inst = slots[sk];
        var mid = inst && inst.module_id;
        var m = mid ? window.LivestockState.getModule(mid) : null;
        var label = (aid === 'axis') ? ('位' + sk.replace('slot', '')) : armSlotLabels[sk];
        if (inst && inst.shadow) {
          // 影子位：被跨面模块占用
          return '<div class="module-slot shadow-slot">' +
            '<span class="slot-key">' + label + '</span>' +
            '<span class="slot-val">被 ' + (m ? m.name : mid) + ' 占用</span></div>';
        }
        if (m) {
          var upgrading = inst.upgrading_remaining > 0;
          var lvText = 'Lv' + inst.level + (upgrading ? ' · 升级中 ' + inst.upgrading_remaining + 't' : '');
          var extra = '';
          var extraActions = '';
          if (mid === 'feed_trough') {
            extra = ' 饲料 ' + (inst.feed_units != null ? inst.feed_units.toFixed(1) : '0') + '/100';
            extraActions = '<button type="button" class="lv-btn" data-feed="' + aid + '">投喂</button>';
          } else if (mid === 'coop') {
            extraActions = '<button type="button" class="lv-btn" data-feed-chickens="' + aid + '">喂鸡</button>';
          }
          return '<div class="module-slot filled" data-arm="' + aid + '" data-slot="' + sk + '">' +
            '<span class="slot-key">' + label + '</span>' +
            '<span class="slot-val">' + m.name + ' ' + lvText + extra + '</span>' +
            '<span class="slot-actions">' +
            extraActions +
            '<button type="button" class="lv-btn" data-upgrade="' + aid + '|' + sk + '">升级</button>' +
            '<button type="button" class="lv-btn" data-dismount="' + aid + '|' + sk + '">拆</button>' +
            '</span></div>';
        }
        var mountable = selectedModuleId ? canMountHere(aid, sk, selectedModuleId) : false;
        var emptyCls = mountable ? ' empty-slot mountable' : ' empty-slot';
        var emptyVal = mountable ? '点此装配' : '空';
        return '<div class="module-slot' + emptyCls + '" data-arm="' + aid + '" data-slot="' + sk + '">' +
          '<span class="slot-key">' + label + '</span>' +
          '<span class="slot-val">' + emptyVal + '</span></div>';
      }).join('');
      return '<div class="arm-card"><div class="arm-card-title">' + armNames[aid] + '</div><div class="arm-slots">' + slotHtml + '</div></div>';
    }).join('');

    var slotNames = { inner: '内部', front: '前端', bottom: '底面', top: '上表面', cw_side: '顺侧', ccw_side: '逆侧' };
    var mods = window.LivestockState.allModules();
    var tierOrder = { '第一层': 1, '第二层': 2, '轴心': 3 };
    var modList = Object.keys(mods).map(function (k) { return mods[k]; })
      .sort(function (a, b) { return (tierOrder[a.layer] - tierOrder[b.layer]) || a.name.localeCompare(b.name, 'zh'); })
      .map(function (m) {
        var sel = selectedModuleId === m.module_id ? ' selected' : '';
        var step = window.LivestockState.getBuildStep(m.tier, 1);
        var cost = step && step.inputs ? step.inputs.map(function (i) { return itemDisplayName(i.item_id) + '×' + i.count; }).join(' ') : '';
        var faces = (m.axis_slot != null)
          ? ('轴心位' + m.axis_slot)
          : window.LivestockState.expandModuleSlots(m).map(function (s) { return slotNames[s] || s; }).join('+');
        return '<div class="module-card' + sel + '" data-module="' + m.module_id + '">' +
          '<span class="module-ico">' + moduleIcon(m.module_id) + '</span>' +
          '<span class="module-name">' + m.name + '</span>' +
          '<span class="module-tier">' + m.layer + ' · ' + tierLabel(m.tier) + '</span>' +
          '<span class="module-desc">' + m.desc + '</span>' +
          '<span class="module-cost">占面：' + faces + ' · 建造：' + (cost || '—') + '</span></div>';
      }).join('');

    box.innerHTML =
      '<div class="module-left"><h3 class="section-title">装置模块位（点模块库选中，再点空位装配）</h3>' + armHtml + '</div>' +
      '<div class="module-right"><h3 class="section-title">模块库</h3><div class="module-list">' + modList + '</div></div>';

    bindModuleButtons();
  }
  function tierLabel(t) { return { small: '小型', medium: '中型', large: '大型', axis: '轴心' }[t] || t; }

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
      unknown_module: '未知模块', unknown_arm: '未知位置', axis_slot_mismatch: '轴心位不匹配',
      slot_mismatch: '该模块不能装在此面', inner_occupied: '内部空间已被占用', slot_occupied: '该位已有模块',
      lack_material: '材料不足', slot_empty: '该位为空', upgrading: '升级中', max_level: '已满级',
      shadow_slot: '该面被跨面模块占用'
    };
    var base = map[r.reason] || r.reason;
    if (r.reason === 'lack_material') {
      base += '（' + itemDisplayName(r.item_id) + ' 需 ' + r.need + '，现有 ' + (r.have || 0) + '）';
    }
    return base;
  }

  function doBuild(armId, slotKey, moduleId) {
    var m = window.LivestockState.getModule(moduleId);
    var r = window.LivestockState.buildModule(armId, slotKey, moduleId);
    if (r.ok) {
      feedbackMsg = '已装配 ' + (m ? m.name : moduleId);
      logMsg('装配模块 ' + (m ? m.name : moduleId), 'success');
    } else {
      feedbackMsg = '装配失败：' + reasonText(r);
      logMsg('装配失败：' + reasonText(r), 'warn');
    }
    selectedModuleId = null;
    render();
  }

  var feedTargetArm = null;

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

  function openFeedPicker(armId) {
    feedTargetArm = armId;
    var picker = el('livestock-feed-picker');
    if (!picker) return;
    renderFeedPicker();
    picker.classList.remove('hidden');
  }

  function closeFeedPicker() {
    feedTargetArm = null;
    var picker = el('livestock-feed-picker');
    if (picker) picker.classList.add('hidden');
  }

  function renderFeedPicker() {
    var list = el('livestock-feed-picker-list');
    if (!list) return;
    var crops = listFeedCropsInInventory();
    if (!crops.length) {
      list.innerHTML = '<div class="empty-hint">背包没有可作饲料的作物</div>';
      return;
    }
    list.innerHTML = crops.map(function (c) {
      var nut = window.LivestockState.getCropNutrition(c.item_id);
      return '<div class="lv-feed-row">' +
        '<span class="feed-name">' + itemDisplayName(c.item_id) + '</span>' +
        '<span class="feed-meta">营养 ' + nut + ' · 库存 ' + c.count + '</span>' +
        '<button type="button" class="lv-btn" data-feed-crop="' + c.item_id + '">投 1</button>' +
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
      if (!rem.ok) { feedbackMsg = '扣除作物失败'; renderFeedPicker(); return; }
    }
    var r = window.LivestockState.addFeedToTrough(feedTargetArm, cropId, 1);
    if (r.ok) {
      feedbackMsg = '投喂 ' + itemDisplayName(cropId) + '，饲料 +' + r.added.toFixed(1) + '（当前 ' + r.total.toFixed(1) + '/100）';
      logMsg('投喂 ' + itemDisplayName(cropId) + ' 到饲料槽', 'success');
    } else {
      feedbackMsg = '投喂失败：' + reasonText(r);
    }
    renderFeedPicker();
    render();
  }

  function doDismount(armId, slotKey) {
    var r = window.LivestockState.dismountModule(armId, slotKey);
    if (r.ok) {
      feedbackMsg = '已拆卸（材料不退还）';
      logMsg('拆卸模块（材料不退还）', 'info');
    } else {
      feedbackMsg = '拆卸失败：' + reasonText(r);
    }
    render();
  }

  function doUpgrade(armId, slotKey) {
    var r = window.LivestockState.startUpgrade(armId, slotKey);
    if (r.ok) {
      feedbackMsg = '开始升级（工程 ' + r.ticks + ' tick）';
      logMsg('开始模块升级（工程 ' + r.ticks + ' tick）', 'success');
    } else {
      feedbackMsg = '升级失败：' + reasonText(r);
      logMsg('升级失败：' + reasonText(r), 'warn');
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
    if (!spend.ok) { feedbackMsg = '体力不足，无法清扫'; logMsg('清扫失败：体力不足', 'warn'); render(); return; }
    var r = window.LivestockState.cleanZone(zoneId, 10);
    if (r.ok) {
      feedbackMsg = '清扫完成：区域污染 → ' + Math.round(r.pollution) + '%（-10 体力）';
      logMsg('清扫区域 ' + zoneName(zoneId) + '，污染 -10%', 'success');
    }
    render();
  }

  function doTill(zoneId) {
    var spend = trySpendStamina(10);
    if (!spend.ok) { feedbackMsg = '体力不足，无法松土'; logMsg('松土失败：体力不足', 'warn'); render(); return; }
    var r = window.LivestockState.tillZone(zoneId, 10);
    if (r.ok) {
      feedbackMsg = '松土完成：区域板结 → ' + Math.round(r.compaction) + '（-10 体力）';
      logMsg('松土区域 ' + zoneName(zoneId) + '，板结 -10', 'success');
    }
    render();
  }

  function doFeedChickens(armId) {
    var r = window.LivestockState.feedChickens(armId);
    if (r.ok && r.fed > 0) {
      feedbackMsg = '已喂食 ' + r.fed + ' 只鸡（饱腹 +20）';
      logMsg('喂食鸡笼 ' + r.fed + ' 只鸡', 'success');
    } else {
      feedbackMsg = '鸡笼里没有鸡';
    }
    render();
  }

  function bindModuleButtons() {
    var cards = document.querySelectorAll('#livestock-module-content .module-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        selectedModuleId = this.getAttribute('data-module');
        feedbackMsg = '已选中模块，点击左侧空位装配';
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
        var cause = a.death_cause === 'disease' ? '病死' : (a.death_cause === 'slaughter' ? '屠宰' : (a.death_cause === 'blood_loss' ? '失血' : '饿死'));
        corpseRows.push('<div class="product-row">💀 ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + ' <span class="meta">' + cause + '</span></div>');
        return;
      }
      if (!sp.products) return;
      if (sp.products.living && sp.products.living.length) {
        collectRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) +
          ' <span class="meta">' + livingText(a, sp) + '</span>' +
          '<button type="button" class="lv-btn" data-collect="' + a.uid + '">采集</button></div>');
      }
      slaughterRows.push('<div class="product-row">' + speciesIcon(a.species_id) + ' ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) +
        ' <span class="meta">' + a.weight_kg.toFixed(1) + ' kg</span>' +
        '<button type="button" class="lv-btn" data-slaughter="' + a.uid + '">屠宰</button></div>');
    });
    box.innerHTML =
      '<div class="product-col"><h3 class="section-title">活体采集</h3>' + (collectRows.join('') || '<div class="empty-hint">无可采集动物</div>') + '</div>' +
      '<div class="product-col"><h3 class="section-title">屠宰</h3>' + (slaughterRows.join('') || '<div class="empty-hint">无可屠宰动物</div>') + '</div>' +
      '<div class="product-col"><h3 class="section-title">尸体</h3>' + (corpseRows.join('') || '<div class="empty-hint">无尸体</div>') + '</div>';
    bindProductButtons();
  }
  function livingText(a, sp) {
    var parts = [];
    sp.products.living.forEach(function (p) {
      var cd = (a.cooldowns && a.cooldowns[p.product_id]) || 0;
      parts.push(productName(p.product_id) + (cd > 0 ? '(冷却' + cd + ')' : '✓'));
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
        var inst = { item_id: it.item_id, count: 1, quality_tier: 0 };
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
      logMsg('采集 ' + speciesName(a.species_id) + ' ' + genderGlyph(a.gender) + '：' + got.map(productName).join('、') + '，畜牧经验 +100', 'success');
      if (hpBefore !== a.hp) {
        logMsg('抽血使 ' + speciesName(a.species_id) + ' 血量 ' + hpBefore + ' → ' + a.hp, 'warn');
      }
      if (dropped > 0) {
        logMsg('背包已满，' + dropped + ' 件产物掉落在地面', 'warn');
      }
    }
    feedbackMsg = got.length ? ('已采集：' + got.map(productName).join('、') + ' → 已入背包') : '无可采集（冷却中或血量不足）';
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
      logMsg('屠宰 ' + spName + '（' + weight.toFixed(1) + 'kg），获得 ' + n + ' 件物品' + (gres.dropped > 0 ? '（' + gres.dropped + ' 件掉落地面）' : '') + '，畜牧经验 +' + exp, 'success');
      feedbackMsg = '屠宰完成：' + n + ' 件物品已入背包';
    } else {
      feedbackMsg = '屠宰失败';
    }
    render();
  }

  function bindProductButtons() {
    var collects = document.querySelectorAll('#livestock-product-content [data-collect]');
    for (var i = 0; i < collects.length; i++) {
      collects[i].addEventListener('click', function () {
        collectAllProducts(this.getAttribute('data-collect'));
      });
    }
    var slaughters = document.querySelectorAll('#livestock-product-content [data-slaughter]');
    for (var j = 0; j < slaughters.length; j++) {
      slaughters[j].addEventListener('click', function () {
        doSlaughter(this.getAttribute('data-slaughter'));
      });
    }
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

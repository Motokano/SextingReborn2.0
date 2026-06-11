(function (global) {
    'use strict';

    var GRID_SIZE = 11;
    var TASK_TICKS_DEFAULT = 10;
    var CROP_STRUCTURE_IDS = [
        'support_frame',
        'protection_cage',
        'binding_strap',
        'water_storage_ridge',
        'deep_pool',
        'shade_cover',
        'canopy'
    ];

    var uiState = {
        selected: { x: 0, y: 0 },
        statusMsg: '',
        bound: false
    };

    function t(key, params) {
        if (global.UIText && typeof global.UIText.t === 'function') {
            return global.UIText.t(key, params);
        }
        return key;
    }

    function getSceneApp() {
        return global.SceneApp || null;
    }

    function getMapApi() {
        return global.AgricultureMap || null;
    }

    function getMapStateMutable() {
        if (global.SceneCtx && global.SceneCtx.agriculture_map_state) {
            return global.SceneCtx.agriculture_map_state;
        }
        var SA = getSceneApp();
        if (SA && typeof SA.getAgricultureMapStateMutable === 'function') {
            return SA.getAgricultureMapStateMutable();
        }
        return null;
    }

    function cellAt(st, x, y) {
        if (!st || !st.map) return null;
        var AM = getMapApi();
        if (AM && typeof AM.cell === 'function') return AM.cell(st, x, y);
        if (!st.map[y]) return null;
        return st.map[y][x] || null;
    }

    function isVenturiCell(c) {
        return !!(c && c.kind === 'venturi_fertilizer');
    }

    function isBuriedJarCell(c) {
        return !!(c && c.kind === 'buried_pot_jar');
    }

    function isSuperFusionCell(c) {
        return !!(c && c.kind === 'super_fusion');
    }

    function hasCropStructure(c) {
        return !!(c && c.cropStructure);
    }

    function canBuildLand(c) {
        return !!(c && c.kind === 'land' && !c.crop && !hasCropStructure(c));
    }

    function canTill(c) {
        return !!(c && c.kind === 'land' && !c.tilled && !c.crop);
    }

    function canRemoveTilled(c) {
        return !!(c && c.kind === 'land' && c.tilled && !c.crop && !hasCropStructure(c));
    }

    function canHarvest(c) {
        return !!(c && c.crop && c.crop.settled);
    }

    function canRemoveChannel(c) {
        return !!(c && c.kind === 'channel');
    }

    function getDefaultChannelCapacity() {
        var AM = getMapApi();
        if (AM && AM.constants && AM.constants.defaultChannelCapacity != null) {
            return Math.max(1, Math.floor(Number(AM.constants.defaultChannelCapacity) || 2));
        }
        return 2;
    }

    function canUpgradeChannel(c) {
        return !!(c && c.kind === 'channel');
    }

    function canDowngradeChannel(c) {
        if (!c || c.kind !== 'channel') return false;
        return (Number(c.capacity) || getDefaultChannelCapacity()) > getDefaultChannelCapacity();
    }

    function getPoolLevel(st) {
        var AM = getMapApi();
        if (AM && typeof AM.getPoolLevel === 'function') return AM.getPoolLevel(st);
        return Math.max(1, Math.floor(Number(st && st.pool_level) || 1));
    }

    function getPoolMaxLevel() {
        var AC = global.AgricultureConfig;
        if (AC && typeof AC.getPoolMaxLevel === 'function') return AC.getPoolMaxLevel();
        var AM = getMapApi();
        if (AM && AM.constants && AM.constants.poolMaxLevel != null) return AM.constants.poolMaxLevel;
        return 4;
    }

    function getVenturiConcRange(c) {
        var AM = getMapApi();
        var lv = Math.max(1, Math.floor(Number(c && c.venturiLevel) || 1));
        if (AM && typeof AM.venturiConcRangeForLevel === 'function') return AM.venturiConcRangeForLevel(lv);
        return { min: 5, max: 10 };
    }

    function taskTicksTotal(st) {
        var AC = global.AgricultureConfig;
        if (AC && typeof AC.getTaskDefaults === 'function') {
            return Math.max(1, Math.floor(Number(AC.getTaskDefaults().task_ticks) || TASK_TICKS_DEFAULT));
        }
        var AM = getMapApi();
        if (AM && AM.constants && AM.constants.taskTicks) return AM.constants.taskTicks;
        return TASK_TICKS_DEFAULT;
    }

    function taskTypeLabel(type, task) {
        var key = 'agriculture.task.' + String(type || 'view');
        if (type === 'build_crop_structure' && task && task.structureId) {
            return t('agriculture.task.build_crop_structure', {
                name: t('agriculture.structure.' + task.structureId)
            });
        }
        if (type === 'upgrade_venturi') return t('agriculture.task.upgrade_venturi');
        if (type === 'upgrade_pool') return t('agriculture.task.upgrade_pool');
        var s = t(key);
        return s === key ? String(type || '') : s;
    }

    function cellKindLabel(c) {
        if (!c) return '';
        if (c.kind === 'pool') return t('agriculture.cell.pool');
        if (c.kind === 'channel') return t('agriculture.cell.channel');
        if (isVenturiCell(c)) return t('agriculture.cell.venturi');
        if (isBuriedJarCell(c)) return t('agriculture.cell.jar');
        if (isSuperFusionCell(c)) return t('agriculture.cell.fusion');
        return t('agriculture.cell.land');
    }

    function cellShortLabel(c) {
        if (!c) return '';
        if (c.kind === 'pool') return t('agriculture.cell.abbr.pool');
        if (c.kind === 'channel') return t('agriculture.cell.abbr.channel');
        if (isVenturiCell(c)) return t('agriculture.cell.abbr.venturi');
        if (isBuriedJarCell(c)) return t('agriculture.cell.abbr.jar');
        if (isSuperFusionCell(c)) return t('agriculture.cell.abbr.fusion');
        if (c.crop) {
            if (c.crop.settled) return t('agriculture.cell.abbr.crop_ready');
            return t('agriculture.cell.abbr.crop');
        }
        if (c.tilled) return t('agriculture.cell.abbr.tilled');
        return t('agriculture.cell.abbr.land');
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getItemDisplayName(itemId) {
        var id = String(itemId || '').trim();
        if (!id) return '';
        var IE = global.InventoryEquipment;
        if (!IE || typeof IE.getItemTemplate !== 'function') return id;
        try {
            var tpl = IE.getItemTemplate(id);
            var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
            var tier0 = IE.getItemDisplayTier ? IE.getItemDisplayTier(id, char0) : 0;
            if (tpl && IE.getDisplayName) {
                return String(IE.getDisplayName(tpl, tier0, char0) || tpl.sn || id);
            }
        } catch (eName) { /* ignore */ }
        return id;
    }

    function countOwnedItem(itemId) {
        var API = global.AgriculturePlayerItems;
        if (API && typeof API.countItemId === 'function') {
            return Math.max(0, Math.floor(Number(API.countItemId(itemId)) || 0));
        }
        return 0;
    }

    function resolveActionCostSpec(meta) {
        if (!meta || typeof meta !== 'object') return null;
        var AC = global.AgricultureConfig;
        if (meta.buildId && AC && typeof AC.getBuildSpec === 'function') {
            return AC.getBuildSpec(meta.buildId);
        }
        if (meta.upgradeKind === 'venturi' && AC && typeof AC.getVenturiUpgradeSpec === 'function') {
            return AC.getVenturiUpgradeSpec(meta.fromLevel);
        }
        if (meta.upgradeKind === 'pool' && AC && typeof AC.getPoolUpgradeSpec === 'function') {
            return AC.getPoolUpgradeSpec(meta.fromLevel);
        }
        if (Array.isArray(meta.inputs)) {
            return {
                inputs: meta.inputs,
                task_ticks: meta.task_ticks,
                stamina_per_tick: meta.stamina_per_tick
            };
        }
        return null;
    }

    function buildActionCostTooltipHtml(titleLabel, meta) {
        var SA = getSceneApp();
        if (!SA || typeof SA.buildItemTooltipHtml !== 'function') return '';
        var spec = resolveActionCostSpec(meta);
        var desc = '';
        if (meta && meta.instant) {
            desc = t('agriculture.tooltip.instant_use');
        } else {
            var ticks = 10;
            var perStamina = 5;
            if (spec) {
                if (spec.task_ticks != null) ticks = Math.max(1, Math.floor(Number(spec.task_ticks) || 10));
                if (spec.stamina_per_tick != null) perStamina = Math.max(0, Number(spec.stamina_per_tick) || 5);
            } else {
                ticks = taskTicksTotal(null);
                var ACdef = global.AgricultureConfig;
                if (ACdef && typeof ACdef.getTaskDefaults === 'function') {
                    var def = ACdef.getTaskDefaults();
                    if (def.task_ticks != null) ticks = Math.max(1, Math.floor(Number(def.task_ticks) || ticks));
                    if (def.stamina_per_tick != null) perStamina = Math.max(0, Number(def.stamina_per_tick) || perStamina);
                }
            }
            var totalStamina = ticks * perStamina;
            desc = t('agriculture.tooltip.task_cost', {
                ticks: ticks,
                stamina: perStamina,
                total: totalStamina
            });
        }
        var lines = [t('agriculture.tooltip.materials_header')];
        var inputs = spec && Array.isArray(spec.inputs) ? spec.inputs : [];
        var ii;
        if (!inputs.length) {
            lines.push(t('agriculture.tooltip.no_materials'));
        } else {
            for (ii = 0; ii < inputs.length; ii++) {
                var row = inputs[ii];
                if (!row || !row.item_id) continue;
                var need = Math.max(1, Math.floor(Number(row.count) || 1));
                lines.push(t('agriculture.tooltip.material_line', {
                    name: getItemDisplayName(row.item_id),
                    need: need,
                    have: countOwnedItem(row.item_id)
                }));
            }
        }
        if (spec && spec.refund_inputs_on_cancel) {
            lines.push(t('agriculture.tooltip.refund_on_cancel'));
        }
        return SA.buildItemTooltipHtml(titleLabel, desc, lines.join('\n'));
    }

    function bindActionCostTooltip(btn, titleLabel, meta) {
        if (!meta) return;
        var SA = getSceneApp();
        if (!SA || typeof SA.showItemTooltip !== 'function') return;
        btn.addEventListener('mouseenter', function () {
            var html = buildActionCostTooltipHtml(titleLabel, meta);
            if (html) SA.showItemTooltip(html, btn);
        });
        btn.addEventListener('mouseleave', function () {
            if (typeof SA.hideItemTooltip === 'function') SA.hideItemTooltip();
        });
    }

    function hideActionTooltip() {
        var SA = getSceneApp();
        if (SA && typeof SA.hideItemTooltip === 'function') SA.hideItemTooltip();
    }

    function setStatus(msgKey, params, fallback) {
        uiState.statusMsg = msgKey ? t(msgKey, params) : (fallback || '');
        var el = document.getElementById('agriculture-status-msg');
        if (el) el.textContent = uiState.statusMsg;
    }

    function runAction(actionId, params) {
        var SA = getSceneApp();
        if (!SA || typeof SA.tryAgricultureAction !== 'function') {
            setStatus('agriculture.msg.api_missing');
            return null;
        }
        var res = SA.tryAgricultureAction(actionId, params || {});
        if (!res || !res.ok) {
            var reason = res && res.reason ? String(res.reason) : 'failed';
            var rk = 'agriculture.msg.fail.' + reason;
            var txt = t(rk);
            setStatus(txt === rk ? 'agriculture.msg.fail.generic' : rk, { reason: reason });
            return res;
        }
        setStatus('agriculture.msg.ok.' + actionId, null, t('agriculture.msg.ok.generic'));
        if (typeof SA.updateAgriculturePanel === 'function') {
            SA.updateAgriculturePanel();
        } else {
            update(getMapStateMutable());
        }
        return res;
    }

    function syncAutoTickToggle(enabled) {
        var btn = document.getElementById('agriculture-auto-tick-toggle');
        if (!btn) return;
        btn.classList.toggle('toggle-on', !!enabled);
        btn.textContent = t(enabled ? 'agriculture.btn.auto_tick.on' : 'agriculture.btn.auto_tick.off');
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    function renderWorldStrip() {
        var el = document.getElementById('agriculture-world-strip');
        if (!el) return;
        var parts = [];
        if (global.GameTime && typeof global.GameTime.getDisplayString === 'function') {
            parts.push(global.GameTime.getDisplayString());
        }
        var Surv = global.Survival;
        if (Surv && typeof Surv.getState === 'function') {
            var s = Surv.getState() || {};
            parts.push(t('status.label.satiety') + ' ' + (s.satiety != null ? s.satiety : '-'));
            parts.push(t('status.label.thirst') + ' ' + (s.thirst != null ? s.thirst : '-'));
            parts.push(t('status.label.stamina') + ' ' + (s.stamina != null ? s.stamina : '-'));
        }
        el.textContent = parts.join(' · ');
    }

    function bindControlsOnce() {
        if (uiState.bound) return;
        uiState.bound = true;
        var closeBtn = document.getElementById('agriculture-panel-close');
        if (closeBtn && !closeBtn.__agriPanelBound) {
            closeBtn.__agriPanelBound = true;
            closeBtn.addEventListener('click', function () {
                var SA = getSceneApp();
                if (SA && typeof SA.closeAgriculturePanel === 'function') SA.closeAgriculturePanel();
            });
        }
        var advBtn = document.getElementById('agriculture-advance-tick');
        if (advBtn && !advBtn.__agriPanelBound) {
            advBtn.__agriPanelBound = true;
            advBtn.addEventListener('click', function () {
                runAction('advance_ticks', { n: 1 });
            });
        }
        var autoBtn = document.getElementById('agriculture-auto-tick-toggle');
        if (autoBtn && !autoBtn.__agriPanelBound) {
            autoBtn.__agriPanelBound = true;
            autoBtn.addEventListener('click', function () {
                var SA = getSceneApp();
                if (!SA || typeof SA.setAgricultureAutoTickEnabled !== 'function') return;
                var next = !(SA.isAgricultureAutoTickEnabled && SA.isAgricultureAutoTickEnabled());
                SA.setAgricultureAutoTickEnabled(next);
                syncAutoTickToggle(next);
            });
        }
        var cancelBtn = document.getElementById('agriculture-cancel-task');
        if (cancelBtn && !cancelBtn.__agriPanelBound) {
            cancelBtn.__agriPanelBound = true;
            cancelBtn.addEventListener('click', function () {
                runAction('cancel_task', {});
            });
        }
    }

    function renderGrid(st) {
        var grid = document.getElementById('agriculture-grid');
        if (!grid) return;
        var size = GRID_SIZE;
        var AM = getMapApi();
        if (AM && AM.constants && AM.constants.size) size = AM.constants.size;
        var html = '';
        var y;
        var x;
        var total = taskTicksTotal(st);
        for (y = 0; y < size; y++) {
            for (x = 0; x < size; x++) {
                var c = cellAt(st, x, y);
                var cls = ['agri-cell'];
                if (c) {
                    if (c.kind === 'pool') cls.push('pool');
                    else if (c.kind === 'channel') {
                        cls.push('channel');
                        if (c.isTrunk) cls.push('trunk');
                        if ((Number(c.water) || 0) > 0) cls.push('has-water');
                    } else if (isVenturiCell(c)) cls.push('venturi');
                    else if (isBuriedJarCell(c)) cls.push('jar');
                    else if (isSuperFusionCell(c)) cls.push('fusion');
                    else {
                        cls.push('land');
                        if (c.tilled) cls.push('tilled');
                    }
                    if (c.crop) {
                        if (c.crop.settled) {
                            var bad = c.crop.result === 'withered' || c.crop.result === 'flooded' || c.crop.result === 'trace_toxic';
                            cls.push(bad ? 'crop-fail' : 'crop-ready');
                        } else cls.push('crop-growing');
                    }
                }
                if (x === uiState.selected.x && y === uiState.selected.y) cls.push('selected');
                var inner = escapeHtml(cellShortLabel(c));
                if (st.task && st.task.x === x && st.task.y === y) {
                    var prog = Math.floor(Number(st.task.progress) || 0);
                    inner = '<span class="agri-cell-task">' + prog + '/' + total + '</span>';
                }
                html += '<button type="button" class="' + cls.join(' ') + '" data-x="' + x + '" data-y="' + y + '" title="' +
                    escapeHtml(x + ',' + y) + '">' + inner + '</button>';
            }
        }
        grid.innerHTML = html;
        var cells = grid.querySelectorAll('.agri-cell');
        var i;
        for (i = 0; i < cells.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    uiState.selected.x = Number(btn.getAttribute('data-x'));
                    uiState.selected.y = Number(btn.getAttribute('data-y'));
                    update(getMapStateMutable());
                });
            })(cells[i]);
        }
    }

    function renderTaskBar(st) {
        var el = document.getElementById('agriculture-task-bar');
        if (!el) return;
        if (!st || !st.task) {
            el.textContent = t('agriculture.task.none');
            return;
        }
        var total = taskTicksTotal(st);
        var prog = Math.floor(Number(st.task.progress) || 0);
        el.textContent = t('agriculture.task.progress', {
            label: taskTypeLabel(st.task.type, st.task),
            cur: prog,
            max: total
        });
    }

    function renderDetail(st, c, x, y) {
        var el = document.getElementById('agriculture-cell-detail');
        if (!el) return;
        if (!c) {
            el.innerHTML = '<div class="agri-kv"><div class="agri-v">' + escapeHtml(t('agriculture.detail.empty')) + '</div></div>';
            return;
        }
        var rows = [];
        rows.push({ k: t('agriculture.detail.coord'), v: x + ', ' + y });
        rows.push({ k: t('agriculture.detail.kind'), v: cellKindLabel(c) });
        if (c.kind === 'land' || c.tilled) {
            rows.push({ k: t('agriculture.detail.soil'), v: (c.soilType || c.soilId || '-') });
            rows.push({
                k: t('agriculture.detail.tilled'),
                v: c.tilled ? t('agriculture.detail.yes') : t('agriculture.detail.no')
            });
        }
        if (c.kind === 'channel') {
            rows.push({ k: t('agriculture.detail.water'), v: String((Number(c.water) || 0).toFixed(1)) });
            rows.push({ k: t('agriculture.detail.capacity'), v: String(c.capacity || 0) });
        }
        if (c.kind === 'pool' && st) {
            rows.push({ k: t('agriculture.detail.pool'), v: String((Number(st.poolCurrent) || 0).toFixed(1)) });
            rows.push({
                k: t('agriculture.detail.pool_level'),
                v: t('agriculture.pool.level.' + getPoolLevel(st))
            });
            if (st.last_pool_weather_factor != null) {
                rows.push({
                    k: t('agriculture.detail.pool_weather'),
                    v: String((Number(st.last_pool_weather_factor) * 100).toFixed(0)) + '%'
                });
            }
            if (getPoolLevel(st) >= 3 && st.pool_reservoir) {
                rows.push({
                    k: t('agriculture.detail.pool_reservoir'),
                    v: String((Number(st.pool_reservoir.stored) || 0).toFixed(1))
                });
            }
        }
        if (isVenturiCell(c)) {
            rows.push({ k: t('agriculture.detail.venturi_level'), v: String(c.venturiLevel || 1) });
            var concRange = getVenturiConcRange(c);
            rows.push({
                k: t('agriculture.detail.venturi_conc'),
                v: String(c.seaweedSetConcentration || '-') + ' (' + concRange.min + '–' + concRange.max + ')'
            });
        }
        if (isBuriedJarCell(c) && c.jarLiquid && c.jarLiquid.itemId) {
            rows.push({
                k: t('agriculture.detail.jar_liquid'),
                v: (c.jarLiquid.name || c.jarLiquid.itemId) + ' ×' + (c.jarLiquid.units || 0)
            });
        }
        if (hasCropStructure(c)) {
            rows.push({
                k: t('agriculture.detail.structure'),
                v: t('agriculture.structure.' + c.cropStructure)
            });
        }
        if (c.crop) {
            rows.push({ k: t('agriculture.detail.crop'), v: c.crop.name || c.crop.cropId || '-' });
            rows.push({
                k: t('agriculture.detail.crop_progress'),
                v: c.crop.settled
                    ? (c.crop.resultLabel || c.crop.result || t('agriculture.detail.settled'))
                    : (Math.max(0, c.crop.remainingTicks || 0) + ' tick')
            });
            if (c.crop.settled && c.crop.harvestCount != null) {
                rows.push({ k: t('agriculture.detail.harvest_count'), v: String(c.crop.harvestCount) });
            }
            rows.push({
                k: t('agriculture.detail.trace_absorbed'),
                v: String(c.crop.traceAbsorbed != null ? c.crop.traceAbsorbed : 0)
            });
            rows.push({
                k: t('agriculture.detail.fertilizer_absorbed'),
                v: String(c.crop.fertilizerAbsorbed != null ? c.crop.fertilizerAbsorbed : 0)
            });
        }
        var html = '';
        var i;
        for (i = 0; i < rows.length; i++) {
            html += '<div class="agri-kv"><div class="agri-k">' + escapeHtml(rows[i].k) + '</div><div class="agri-v">' +
                escapeHtml(rows[i].v) + '</div></div>';
        }
        el.innerHTML = html;
    }

    function addActionButton(container, label, disabled, onClick, tooltipMeta) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'agri-act-btn';
        btn.textContent = label;
        btn.disabled = !!disabled;
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            if (btn.disabled) return;
            onClick();
        });
        bindActionCostTooltip(btn, label, tooltipMeta);
        container.appendChild(btn);
    }

    function addBuildTaskButton(container, label, buildId, x, y, disabled) {
        addActionButton(container, label, disabled, function () {
            runAction('start_build_task', { buildId: buildId, x: x, y: y });
        }, { buildId: buildId });
    }

    function addActionGroup(container, title) {
        var g = document.createElement('div');
        g.className = 'agri-act-group';
        g.textContent = title;
        container.appendChild(g);
    }

    function renderActions(st, c, x, y) {
        var el = document.getElementById('agriculture-actions');
        if (!el) return;
        el.innerHTML = '';
        if (!c) return;
        if (st && st.task) {
            addActionButton(el, t('agriculture.btn.cancel_task'), false, function () {
                runAction('cancel_task', {});
            });
            return;
        }

        var SA = getSceneApp();
        var busy = false;

        if (c.kind === 'land') {
            addActionGroup(el, t('agriculture.action.group.land'));
            if (canTill(c)) {
                addBuildTaskButton(el, t('agriculture.action.land_reclaim'), 'land_reclaim', x, y, busy);
            }
            if (canRemoveTilled(c)) {
                addBuildTaskButton(el, t('agriculture.action.land_remove_reclaim'), 'land_remove_reclaim', x, y, busy);
            }
            if (canBuildLand(c)) {
                addBuildTaskButton(el, t('agriculture.action.channel_dig'), 'channel_dig', x, y, busy);
                addBuildTaskButton(el, t('agriculture.action.venturi_fertilizer'), 'venturi_fertilizer', x, y, busy);
                addBuildTaskButton(el, t('agriculture.action.buried_pot_jar'), 'buried_pot_jar', x, y, busy);
                addBuildTaskButton(el, t('agriculture.action.super_fusion'), 'super_fusion', x, y, busy);
            }
            if (c.tilled && !c.crop && !hasCropStructure(c) && SA && typeof SA.getAgriculturePlantOptions === 'function') {
                var plants = SA.getAgriculturePlantOptions();
                if (plants.length) {
                    addActionGroup(el, t('agriculture.action.group.plant'));
                    var pi;
                    for (pi = 0; pi < plants.length; pi++) {
                        (function (opt) {
                            addActionButton(el, t('agriculture.action.plant_fmt', {
                                name: opt.name,
                                count: opt.count
                            }), busy, function () {
                                runAction('plant', {
                                    x: x,
                                    y: y,
                                    cropId: opt.cropId,
                                    seedItemId: opt.seedItemId
                                });
                            });
                        })(plants[pi]);
                    }
                }
            }
            if (c.tilled && !c.crop) {
                addActionGroup(el, t('agriculture.action.group.structure'));
                var si;
                for (si = 0; si < CROP_STRUCTURE_IDS.length; si++) {
                    (function (sid) {
                        addBuildTaskButton(el, t('agriculture.action.build_structure_fmt', {
                            name: t('agriculture.structure.' + sid)
                        }), 'crop_structure_' + sid, x, y, busy);
                    })(CROP_STRUCTURE_IDS[si]);
                }
            }
            if (hasCropStructure(c)) {
                addBuildTaskButton(el, t('agriculture.action.crop_structure_remove'), 'crop_structure_remove', x, y, busy);
            }
            if (SA && typeof SA.getAgricultureSoilAmendmentOptions === 'function') {
                var amends = SA.getAgricultureSoilAmendmentOptions();
                if (amends.length) {
                    addActionGroup(el, t('agriculture.action.group.soil'));
                    var ai;
                    for (ai = 0; ai < amends.length; ai++) {
                        (function (opt) {
                            addActionButton(el, t('agriculture.action.soil_amend_fmt', {
                                name: opt.name,
                                count: opt.count
                            }), busy, function () {
                                runAction('start_soil_amend_task', { x: x, y: y, itemId: opt.itemId });
                            }, { inputs: [{ item_id: opt.itemId, count: 1 }] });
                        })(amends[ai]);
                    }
                }
            }
            if (canHarvest(c)) {
                addActionButton(el, t('agriculture.action.harvest'), busy, function () {
                    var res = runAction('harvest', { x: x, y: y });
                    if (res && res.ok && res.placedCount != null) {
                        setStatus('agriculture.msg.harvest', {
                            count: res.placedCount,
                            total: res.harvestCount || res.placedCount
                        });
                    }
                });
            }
        }

        if (c.kind === 'channel' && canRemoveChannel(c)) {
            addActionGroup(el, t('agriculture.action.group.channel'));
            if (canUpgradeChannel(c)) {
                addBuildTaskButton(el, t('agriculture.action.channel_upgrade'), 'channel_upgrade', x, y, busy);
            }
            if (canDowngradeChannel(c)) {
                addBuildTaskButton(el, t('agriculture.action.channel_downgrade'), 'channel_downgrade', x, y, busy);
            }
            addBuildTaskButton(el, t('agriculture.action.channel_remove'), 'channel_remove', x, y, busy);
        }

        if (c.kind === 'pool') {
            addActionGroup(el, t('agriculture.action.group.pool'));
            if (getPoolLevel(st) < getPoolMaxLevel()) {
                addActionButton(el, t('agriculture.action.pool_upgrade'), busy, function () {
                    runAction('start_pool_upgrade', { x: x, y: y });
                }, { upgradeKind: 'pool', fromLevel: getPoolLevel(st) });
            }
            if (getPoolLevel(st) >= 2) {
                var theft = (st && st.pool_theft) || { enabled: false, victim_branch_index: 1, gain_branch_index: 2 };
                var theftWrap = document.createElement('div');
                theftWrap.className = 'agri-theft-panel';
                var theftLabel = document.createElement('label');
                theftLabel.className = 'agri-theft-toggle';
                var theftCb = document.createElement('input');
                theftCb.type = 'checkbox';
                theftCb.checked = !!theft.enabled;
                theftCb.addEventListener('change', function () {
                    runAction('pool_theft_set', {
                        enabled: theftCb.checked,
                        victim_branch_index: Number(victimSel.value) || 1,
                        gain_branch_index: Number(gainSel.value) || 2
                    });
                });
                theftLabel.appendChild(theftCb);
                theftLabel.appendChild(document.createTextNode(' ' + t('agriculture.action.pool_theft_enable')));
                theftWrap.appendChild(theftLabel);
                var theftRow = document.createElement('div');
                theftRow.className = 'agri-theft-row';
                var victimLbl = document.createElement('span');
                victimLbl.textContent = t('agriculture.action.pool_theft_victim');
                var victimSel = document.createElement('select');
                victimSel.className = 'agri-theft-select';
                var gainLbl = document.createElement('span');
                gainLbl.textContent = t('agriculture.action.pool_theft_gain');
                var gainSel = document.createElement('select');
                gainSel.className = 'agri-theft-select';
                var bi;
                for (bi = 1; bi <= 3; bi++) {
                    victimSel.appendChild(new Option('#' + bi, String(bi)));
                    gainSel.appendChild(new Option('#' + bi, String(bi)));
                }
                victimSel.value = String(theft.victim_branch_index || 1);
                gainSel.value = String(theft.gain_branch_index || 2);
                function syncTheftSelects() {
                    runAction('pool_theft_set', {
                        enabled: theftCb.checked,
                        victim_branch_index: Number(victimSel.value) || 1,
                        gain_branch_index: Number(gainSel.value) || 2
                    });
                }
                victimSel.addEventListener('change', syncTheftSelects);
                gainSel.addEventListener('change', syncTheftSelects);
                theftRow.appendChild(victimLbl);
                theftRow.appendChild(victimSel);
                theftRow.appendChild(gainLbl);
                theftRow.appendChild(gainSel);
                theftWrap.appendChild(theftRow);
                el.appendChild(theftWrap);
            }
        }

        if (isVenturiCell(c)) {
            addActionGroup(el, t('agriculture.action.group.venturi'));
            if (SA && typeof SA.getAgricultureInjectables === 'function') {
                var vLiq = SA.getAgricultureInjectables('venturi_fertilizer');
                var vi;
                for (vi = 0; vi < vLiq.length; vi++) {
                    (function (opt) {
                        addActionButton(el, t('agriculture.action.inject_fmt', {
                            name: opt.name,
                            count: opt.count
                        }), busy, function () {
                            runAction('inject_facility', {
                                x: x,
                                y: y,
                                facilityKind: 'venturi_fertilizer',
                                itemId: opt.itemId
                            });
                        }, { inputs: [{ item_id: opt.itemId, count: 1 }], instant: true });
                    })(vLiq[vi]);
                }
            }
            var maxLv = 3;
            if (global.AgricultureConfig && typeof global.AgricultureConfig.getVenturiMaxLevel === 'function') {
                maxLv = global.AgricultureConfig.getVenturiMaxLevel();
            }
            if ((Number(c.venturiLevel) || 1) < maxLv) {
                addActionButton(el, t('agriculture.action.venturi_upgrade'), busy, function () {
                    runAction('start_venturi_upgrade', { x: x, y: y });
                }, { upgradeKind: 'venturi', fromLevel: Number(c.venturiLevel) || 1 });
            }
            var concRange = getVenturiConcRange(c);
            var concVal = Number(c.seaweedSetConcentration);
            if (!(concVal >= 0)) concVal = 7;
            var concWrap = document.createElement('div');
            concWrap.className = 'agri-venturi-conc';
            var concTitle = document.createElement('div');
            concTitle.className = 'agri-act-group';
            concTitle.textContent = t('agriculture.action.venturi_conc_title');
            concWrap.appendChild(concTitle);
            var concRow = document.createElement('div');
            concRow.className = 'agri-venturi-conc-row';
            var concMinus = document.createElement('button');
            concMinus.type = 'button';
            concMinus.className = 'agri-act-btn agri-conc-step';
            concMinus.textContent = '−';
            concMinus.disabled = concVal <= concRange.min || busy;
            concMinus.addEventListener('click', function (e) {
                e.preventDefault();
                runAction('step_venturi_concentration', { x: x, y: y, delta: -1 });
            });
            var concDisplay = document.createElement('span');
            concDisplay.className = 'agri-conc-val';
            concDisplay.textContent = String(concVal);
            var concPlus = document.createElement('button');
            concPlus.type = 'button';
            concPlus.className = 'agri-act-btn agri-conc-step';
            concPlus.textContent = '＋';
            concPlus.disabled = concVal >= concRange.max || busy;
            concPlus.addEventListener('click', function (e) {
                e.preventDefault();
                runAction('step_venturi_concentration', { x: x, y: y, delta: 1 });
            });
            concRow.appendChild(concMinus);
            concRow.appendChild(concDisplay);
            concRow.appendChild(concPlus);
            concWrap.appendChild(concRow);
            el.appendChild(concWrap);
            addBuildTaskButton(el, t('agriculture.action.venturi_fertilizer_remove'), 'venturi_fertilizer_remove', x, y, busy);
        }

        if (isBuriedJarCell(c)) {
            addActionGroup(el, t('agriculture.action.group.jar'));
            if (SA && typeof SA.getAgricultureInjectables === 'function') {
                var jLiq = SA.getAgricultureInjectables('buried_pot_jar');
                var ji;
                for (ji = 0; ji < jLiq.length; ji++) {
                    (function (opt) {
                        addActionButton(el, t('agriculture.action.inject_fmt', {
                            name: opt.name,
                            count: opt.count
                        }), busy, function () {
                            runAction('inject_facility', {
                                x: x,
                                y: y,
                                facilityKind: 'buried_pot_jar',
                                itemId: opt.itemId
                            });
                        }, { inputs: [{ item_id: opt.itemId, count: 1 }], instant: true });
                    })(jLiq[ji]);
                }
            }
            addBuildTaskButton(el, t('agriculture.action.buried_pot_jar_remove'), 'buried_pot_jar_remove', x, y, busy);
        }

        if (isSuperFusionCell(c)) {
            addActionGroup(el, t('agriculture.action.group.fusion'));
            addBuildTaskButton(el, t('agriculture.action.super_fusion_remove'), 'super_fusion_remove', x, y, busy);
        }
    }

    function render(mapState) {
        hideActionTooltip();
        bindControlsOnce();
        var modal = document.getElementById('modal-agriculture');
        if (modal && global.UIText && typeof global.UIText.applyDom === 'function') {
            try { global.UIText.applyDom(modal); } catch (eUi) { /* ignore */ }
        }
        var st = mapState || getMapStateMutable();
        if (!st) return;
        var AM = getMapApi();
        if (AM && AM.constants && AM.constants.size) GRID_SIZE = AM.constants.size;
        uiState.selected.x = Math.max(0, Math.min(GRID_SIZE - 1, uiState.selected.x));
        uiState.selected.y = Math.max(0, Math.min(GRID_SIZE - 1, uiState.selected.y));
        var c = cellAt(st, uiState.selected.x, uiState.selected.y);
        renderGrid(st);
        renderTaskBar(st);
        renderDetail(st, c, uiState.selected.x, uiState.selected.y);
        renderActions(st, c, uiState.selected.x, uiState.selected.y);
        var cancelBtn = document.getElementById('agriculture-cancel-task');
        if (cancelBtn) cancelBtn.disabled = !(st && st.task);
        var SA2 = getSceneApp();
        syncAutoTickToggle(SA2 && typeof SA2.isAgricultureAutoTickEnabled === 'function' && SA2.isAgricultureAutoTickEnabled());
        renderWorldStrip();
    }

    function update(mapState) {
        render(mapState);
    }

    global.AgriculturePanel = {
        render: render,
        update: update,
        syncAutoTickToggle: syncAutoTickToggle
    };
})(typeof window !== 'undefined' ? window : global);

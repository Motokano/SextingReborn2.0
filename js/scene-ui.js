/**
 * SceneUi — 场景 UI 工具（scene-app 组合根化拆解 P5）
 *
 * 来源：自 js/scene-app.js 迁出（物品 tooltip 簇 6 函数 + tooltipEl/tooltipHideTimer）。
 * 语义零变。
 *
 * 职责：
 * - showItemTooltip/hideItemTooltip：#item-tooltip 浮层定位与显隐（rAF 定位，视口内夹取）。
 * - buildItemTooltipHtml / buildItemTooltipHtmlForTemplate / formatItemAttributes /
 *   buildItemFieldRulesHtmlAppend：物品悬浮提示 HTML 组装（含 InfoModule / 字段规则 / 消化 buff 摘要）。
 *
 * 依赖：window.InventoryEquipment（IE）、ItemFieldDisplayRules、ItemInfoModules、BuffSystem；
 * ui() 经 setUiDeps({ ui }) 注入。
 */
(function (global) {
    'use strict';

    var IE = global.InventoryEquipment;

    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }

    var tooltipEl = null;
    var tooltipHideTimer = null;

    function showItemTooltip(html, anchorEl) {
        if (!tooltipEl) tooltipEl = document.getElementById('item-tooltip');
        if (!tooltipEl || !html) return;
        tooltipEl.innerHTML = html;
        tooltipEl.style.left = '-9999px';
        tooltipEl.style.top = '0';
        tooltipEl.classList.add('show');
        if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
        requestAnimationFrame(function () {
            var rect = anchorEl.getBoundingClientRect();
            var tr = tooltipEl.getBoundingClientRect();
            var tw = tr.width || 220;
            var th = tr.height || 100;
            var pad = 12;
            var left = rect.right + pad;
            var top = rect.top;
            if (left + tw > window.innerWidth - pad) left = rect.left - tw - pad;
            if (left < pad) left = pad;
            if (top + th > window.innerHeight - pad) top = window.innerHeight - th - pad;
            if (top < pad) top = pad;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
        });
    }

    function hideItemTooltip() {
        if (!tooltipEl) tooltipEl = document.getElementById('item-tooltip');
        if (tooltipEl) tooltipEl.classList.remove('show');
    }

    function formatItemAttributes(tpl, inst) {
        if (!tpl) return '';
        var lines = [];
        // 仅保留通用属性（重量/背包减重/技能系数——武器与装备共用）；
        // 装备专属细节（口袋/背心栏/形态系数/词条槽/先天要求等）改由 info_module（module.equipment_armor）按技能解锁显示。
        if (tpl.weight_kg != null) lines.push(ui('item.attr.weight', { v: tpl.weight_kg }));
        if (tpl.backpack_weight_factor != null) lines.push(ui('item.attr.backpack_weight_factor', { v: Math.round(tpl.backpack_weight_factor * 100) }));
        if (tpl.skill_coef != null) lines.push(ui('item.attr.skill_coef', { v: tpl.skill_coef }));
        return lines.length ? lines.join('\n') : '';
    }

    function buildItemTooltipHtml(name, desc, attrs) {
        var html = '<div class="tooltip-name">' + (name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        if (desc) html += '<div class="tooltip-desc">' + (desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        if (attrs) html += '<div class="tooltip-attrs">' + (attrs || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        return html;
    }

    function buildItemFieldRulesHtmlAppend(itemId, tpl, inst, character) {
        try {
            if (!global.ItemFieldDisplayRules || typeof global.ItemFieldDisplayRules.renderFieldBlocksHtml !== 'function') return '';
            return global.ItemFieldDisplayRules.renderFieldBlocksHtml({
                itemId: itemId,
                tpl: tpl,
                inst: inst,
                character: character,
                buffLookup: function (buffId) {
                    if (!global.BuffSystem || typeof global.BuffSystem.getBuffTemplate !== 'function') return null;
                    try {
                        var bt = global.BuffSystem.getBuffTemplate(buffId);
                        if (!bt) return null;
                        // 汇总 survival_delta（每 tick 恢复）供食物恢复摘要渲染（k35，43 消化模型）
                        var sd = { satiety: 0, thirst: 0, nutrition: 0 };
                        if (Array.isArray(bt.effects)) {
                            for (var ei = 0; ei < bt.effects.length; ei++) {
                                var ef = bt.effects[ei];
                                if (ef && ef.type === 'survival_delta' && ef.params && typeof ef.params === 'object') {
                                    var p = ef.params;
                                    if (p.satiety != null) sd.satiety += Number(p.satiety) || 0;
                                    if (p.thirst != null) sd.thirst += Number(p.thirst) || 0;
                                    if (p.nutrition != null) sd.nutrition += Number(p.nutrition) || 0;
                                }
                            }
                        }
                        return {
                            name: bt.name || '',
                            buff_id: bt.buff_id || buffId,
                            durationTicks: bt.durationTicks != null ? (parseInt(bt.durationTicks, 10) || 0) : 0,
                            survivalDelta: sd
                        };
                    } catch (eB) { return null; }
                }
            }) || '';
        } catch (e) { return ''; }
    }

    function buildItemTooltipHtmlForTemplate(itemId, tpl, inst, character) {
        var tier = IE && IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, character) : 0;
        var name = tpl && IE && IE.getDisplayName ? IE.getDisplayName(tpl, tier, character) : String(itemId || '');
        var desc = tpl && IE && IE.getDisplayDesc ? IE.getDisplayDesc(tpl, tier, character) : '';
        var attrsText = (typeof formatItemAttributes === 'function') ? formatItemAttributes(tpl, inst) : '';
        var html = buildItemTooltipHtml(name, desc, attrsText);
        try {
            if (global.ItemInfoModules && typeof global.ItemInfoModules.renderTooltipModulesHtml === 'function') {
                var modulesHtml = global.ItemInfoModules.renderTooltipModulesHtml({
                    itemId: itemId,
                    tpl: tpl,
                    character: character
                });
                if (modulesHtml) html += modulesHtml;
            }
        } catch (e) { /* ignore */ }
        var fieldRulesHtml = buildItemFieldRulesHtmlAppend(itemId, tpl, inst, character);
        if (fieldRulesHtml) html += fieldRulesHtml;
        return html;
    }

    global.SceneUi = {
        setUiDeps: setUiDeps,
        showItemTooltip: showItemTooltip,
        hideItemTooltip: hideItemTooltip,
        buildItemTooltipHtml: buildItemTooltipHtml,
        buildItemTooltipHtmlForTemplate: buildItemTooltipHtmlForTemplate,
        formatItemAttributes: formatItemAttributes,
        buildItemFieldRulesHtmlAppend: buildItemFieldRulesHtmlAppend
    };
})(typeof window !== 'undefined' ? window : globalThis);

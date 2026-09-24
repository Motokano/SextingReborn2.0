/**
 * 真实部件连接的信息显示适配器（设计 63/65）。
 *
 * 只公开玩家当前可检查的连接事实：认识档名称、槽位、是否连接和组合重量。
 * 不显示 instance_id、内部类型代码、兼容表或部件性能；性能继续由原信息规则过滤。
 */
(function (global) {
    'use strict';

    var SLOT_LABEL_KEYS = {
        reel: 'item.assembly.slot.reel',
        lure: 'item.assembly.slot.lure',
        main_line: 'item.assembly.slot.main_line',
        float: 'item.assembly.slot.float',
        sinker: 'item.assembly.slot.sinker',
        leader: 'item.assembly.slot.leader',
        hook: 'item.assembly.slot.hook',
        bait: 'item.assembly.slot.bait'
    };

    function inventory() { return global.InventoryEquipment || null; }
    function assembly() { return global.ItemAssembly || null; }
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function t(key, vars) {
        if (global.UIText && typeof global.UIText.t === 'function') {
            try {
                var out = global.UIText.t(key, vars);
                if (out != null && out !== key) return String(out);
            } catch (e) { /* 未登记的内部失败码统一落到通用文案 */ }
        }
        var fallback = {
            'item.assembly.slot.reel': '摇柄部件连接',
            'item.assembly.slot.lure': '末端连接',
            'item.assembly.title': '连接结构',
            'item.assembly.complete': '连接完整',
            'item.assembly.incomplete': '尚未接全',
            'item.assembly.empty': '尚未连接',
            'item.assembly.attach': '连接',
            'item.assembly.detach': '拆下',
            'item.assembly.no_candidate': '库存中没有兼容部件',
            'item.assembly.choose': '选择库存部件',
            'item.assembly.combined_weight': '组合重量：{v} kg'
        };
        var text = fallback[key] || key;
        Object.keys(vars || {}).forEach(function (name) {
            text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), String(vars[name]));
        });
        return text;
    }
    function formatWeight(value) {
        var n = Number(value) || 0;
        return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0';
    }
    function displayName(inst, character) {
        var IE = inventory();
        if (!IE || !inst || !inst.item_id) return '';
        var tpl = IE.getItemTemplate ? IE.getItemTemplate(inst.item_id) : null;
        var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(inst.item_id, character) : 0;
        return tpl && IE.getDisplayName ? IE.getDisplayName(tpl, tier, character) : inst.item_id;
    }
    function slotLabel(slotId) {
        var key = SLOT_LABEL_KEYS[String(slotId || '')];
        if (key) return t(key);
        return t('item.assembly.slot.generic', { v: String(slotId || '') });
    }

    function buildView(root, character) {
        var A = assembly();
        var IE = inventory();
        if (!A || !root || !root.item_id) return null;
        var hasAnyAssembly = false;
        function node(inst, viaSlot) {
            var specs = A.getSlotSpecs(inst);
            var slots = [];
            Object.keys(specs).forEach(function (slotId) {
                hasAnyAssembly = true;
                var child = A.getConnectionPart(inst, slotId);
                slots.push({
                    slot_id: slotId,
                    label: slotLabel(slotId),
                    required: !!(specs[slotId] && specs[slotId].required === true),
                    child: child ? node(child, slotId) : null
                });
            });
            return {
                instance: inst,
                via_slot: viaSlot || null,
                name: displayName(inst, character),
                combined_weight_kg: IE && IE.getItemCombinedWeight ? IE.getItemCombinedWeight(inst) : 0,
                slots: slots
            };
        }
        var rootNode = node(root, null);
        if (!hasAnyAssembly && !(root.connections && Object.keys(root.connections).length)) return null;
        var validation = A.validateAssembly(root, { requireComplete: true });
        return { root: rootNode, complete: !!validation.ok, validation: validation };
    }

    function listCompatibleCandidates(host, slotId, character) {
        var IE = inventory();
        var A = assembly();
        if (!IE || !A || !host) return [];
        var sources = [
            ['pocket', IE.getPocketArray ? IE.getPocketArray() : []],
            ['vest', IE.getVestArray ? IE.getVestArray() : []],
            ['backpack', IE.getBackpackArray ? IE.getBackpackArray() : []],
            ['vehicle', IE.getVehicleArray ? IE.getVehicleArray() : []]
        ];
        var out = [];
        sources.forEach(function (entry) {
            var arr = entry[1] || [];
            for (var i = 0; i < arr.length; i++) {
                var candidate = arr[i];
                if (!candidate || !candidate.item_id) continue;
                var check = A.validateAttach(host, slotId, candidate);
                if (!check.ok) continue;
                out.push({
                    source: entry[0],
                    index: i,
                    name: displayName(candidate, character),
                    count: Math.max(1, Number(candidate.count) || 1)
                });
            }
        });
        return out;
    }

    function assemblyText(key, wording) { return wording && wording[key] != null ? wording[key] : t(key); }
    function renderNode(node, character, interactive, depth, wording) {
        var html = '';
        for (var i = 0; i < node.slots.length; i++) {
            var slot = node.slots[i];
            var hostId = node.instance && node.instance.instance_id ? String(node.instance.instance_id) : '';
            html += '<div class="item-assembly-slot depth-' + Math.min(depth, 4) + '">';
            html += '<div class="item-assembly-slot-head"><span class="item-assembly-slot-label">' + esc(wording && wording.slots && wording.slots[slot.slot_id] || slot.label) + '</span>';
            if (slot.child) {
                html += '<span class="item-assembly-part-name">' + esc(slot.child.name) + '</span>';
                if (interactive) html += '<button type="button" class="item-assembly-action" data-assembly-detach="1" data-host-instance="' + esc(hostId) + '" data-slot-id="' + esc(slot.slot_id) + '">' + esc(assemblyText('item.assembly.detach', wording)) + '</button>';
                html += '</div>';
                if (slot.child.slots.length) html += '<div class="item-assembly-children">' + renderNode(slot.child, character, interactive, depth + 1, wording) + '</div>';
            } else {
                html += '<span class="item-assembly-empty">' + esc(assemblyText('item.assembly.empty', wording)) + '</span></div>';
                if (interactive) {
                    var candidates = listCompatibleCandidates(node.instance, slot.slot_id, character);
                    html += '<div class="item-assembly-picker">';
                    if (candidates.length) {
                        html += '<select data-assembly-candidate="1" aria-label="' + esc(assemblyText('item.assembly.choose', wording)) + '">';
                        for (var c = 0; c < candidates.length; c++) {
                            var candidate = candidates[c];
                            var qty = candidate.count > 1 ? ' ×' + candidate.count : '';
                            html += '<option value="' + esc(candidate.source + ':' + candidate.index) + '">' + esc(candidate.name + qty) + '</option>';
                        }
                        html += '</select><button type="button" class="item-assembly-action" data-assembly-attach="1" data-host-instance="' + esc(hostId) + '" data-slot-id="' + esc(slot.slot_id) + '">' + esc(assemblyText('item.assembly.attach', wording)) + '</button>';
                    } else {
                        html += '<span class="item-assembly-no-candidate">' + esc(assemblyText('item.assembly.no_candidate', wording)) + '</span>';
                    }
                    html += '</div>';
                }
            }
            html += '</div>';
        }
        return html;
    }

    function renderAssemblyHtml(args) {
        var wording = args && args.wording;
        var root = args && args.inst;
        var character = args && args.character;
        var interactive = !!(args && args.interactive);
        var showWeight = !(args && args.showWeight === false);
        var view = buildView(root, character);
        if (!view) return '';
        var stateText = view.complete ? assemblyText('item.assembly.complete', wording) : assemblyText('item.assembly.incomplete', wording);
        var html = '<div class="item-assembly-view' + (interactive ? ' is-interactive' : '') + '">';
        html += '<div class="item-assembly-title"><span>' + esc(assemblyText('item.assembly.title', wording)) + '</span><span class="item-assembly-state ' + (view.complete ? 'complete' : 'incomplete') + '">' + esc(stateText) + '</span></div>';
        if (showWeight) html += '<div class="item-assembly-weight">' + esc(t('item.assembly.combined_weight', { v: formatWeight(view.root.combined_weight_kg) })) + '</div>';
        html += renderNode(view.root, character, interactive, 0, wording);
        html += '</div>';
        return html;
    }

    function messageForReason(reason) {
        var key = 'item.assembly.error.' + String(reason || 'unknown');
        var text = t(key);
        return text === key ? t('item.assembly.error.unknown') : text;
    }

    global.ItemAssemblyDisplay = {
        buildView: buildView,
        displayName: displayName,
        slotLabel: slotLabel,
        listCompatibleCandidates: listCompatibleCandidates,
        renderAssemblyHtml: renderAssemblyHtml,
        messageForReason: messageForReason,
        formatWeight: formatWeight
    };
})(typeof window !== 'undefined' ? window : globalThis);

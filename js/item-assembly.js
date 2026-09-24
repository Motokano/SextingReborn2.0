/**
 * 通用真实部件连接（设计 65 / k278）。
 * 连接存放在宿主实例 connections[slot].part 中；只有组合根占库存格，
 * 子部件仍保留完整实例、稳定身份和自身状态。
 */
(function (global) {
    'use strict';

    var CONNECTION_SCHEMA_VERSION = 1;

    function inventory() { return global.InventoryEquipment || null; }
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

    function templateValue(instanceOrId, field) {
        var IE = inventory();
        if (!IE) return undefined;
        var id = typeof instanceOrId === 'string' ? instanceOrId : (instanceOrId && instanceOrId.item_id);
        var tpl = id && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(id) : null;
        return typeof IE.getItemTemplateValue === 'function' ? IE.getItemTemplateValue(tpl, field) : (tpl ? tpl[field] : undefined);
    }

    function getSlotSpecs(host) {
        var raw = templateValue(host, 'assembly_slots');
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    }

    function getPartTypes(part) {
        var raw = templateValue(part, 'assembly_types');
        if (!Array.isArray(raw)) return [];
        return raw.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
    }

    function getConnectionPart(host, slotId) {
        if (!host || !host.connections || !host.connections[slotId]) return null;
        var record = host.connections[slotId];
        return record.part && record.part.item_id ? record.part : (record.item_id ? record : null);
    }

    function ensureConnections(host) {
        if (!host.connections || typeof host.connections !== 'object' || Array.isArray(host.connections)) host.connections = {};
        return host.connections;
    }

    function childEntries(inst) {
        var IE = inventory();
        if (IE && typeof IE.getItemInstanceChildren === 'function') return IE.getItemInstanceChildren(inst);
        var out = [];
        if (inst && inst.connections && typeof inst.connections === 'object') {
            Object.keys(inst.connections).forEach(function (key) {
                var part = getConnectionPart(inst, key);
                if (part) out.push({ instance: part, relation: 'connection', key: key, path: '.connections.' + key + '.part' });
            });
        }
        return out;
    }

    function treeContains(root, instanceId) {
        var wanted = String(instanceId || '');
        if (!root || !wanted) return false;
        if (String(root.instance_id || '') === wanted) return true;
        var children = childEntries(root);
        for (var i = 0; i < children.length; i++) if (treeContains(children[i].instance, wanted)) return true;
        return false;
    }

    function partMatchesSlot(part, spec) {
        var accepted = spec && Array.isArray(spec.accepts) ? spec.accepts.map(String) : [];
        if (!accepted.length) return false;
        var types = getPartTypes(part);
        for (var i = 0; i < types.length; i++) if (accepted.indexOf(types[i]) >= 0) return true;
        return false;
    }

    function validateAttach(host, slotId, part) {
        if (!host || !host.item_id || !host.instance_id) return { ok: false, reason: 'invalid_host' };
        if (!part || !part.item_id || !part.instance_id) return { ok: false, reason: 'invalid_part' };
        var key = String(slotId || '');
        var specs = getSlotSpecs(host);
        if (!Object.prototype.hasOwnProperty.call(specs, key)) return { ok: false, reason: 'unknown_slot' };
        if (getConnectionPart(host, key)) return { ok: false, reason: 'slot_occupied' };
        if (!partMatchesSlot(part, specs[key])) return { ok: false, reason: 'incompatible_part' };
        if (host.instance_id === part.instance_id || treeContains(part, host.instance_id)) return { ok: false, reason: 'cycle' };
        if (treeContains(host, part.instance_id)) return { ok: false, reason: 'duplicate_instance_id' };
        return { ok: true };
    }

    function validateAssembly(root, options) {
        var opts = options || {};
        var requireComplete = opts.requireComplete === true;
        var errors = [];
        var seen = {};
        function visit(inst, path, ancestors) {
            if (!inst || !inst.item_id) { errors.push({ code: 'invalid_part', path: path }); return; }
            var id = String(inst.instance_id || '');
            if (!id) errors.push({ code: 'missing_instance_id', path: path });
            else if (ancestors[id]) errors.push({ code: 'cycle', path: path, instance_id: id });
            else if (seen[id]) errors.push({ code: 'duplicate_instance_id', path: path, first: seen[id], instance_id: id });
            else seen[id] = path;
            var nextAncestors = Object.assign({}, ancestors);
            if (id) nextAncestors[id] = true;
            var specs = getSlotSpecs(inst);
            var connections = inst.connections && typeof inst.connections === 'object' ? inst.connections : {};
            Object.keys(connections).forEach(function (slotId) {
                if (!Object.prototype.hasOwnProperty.call(specs, slotId)) {
                    errors.push({ code: 'unknown_slot', path: path + '.connections.' + slotId });
                    return;
                }
                var part = getConnectionPart(inst, slotId);
                if (!part) {
                    errors.push({ code: 'invalid_connection', path: path + '.connections.' + slotId });
                    return;
                }
                if (!partMatchesSlot(part, specs[slotId])) errors.push({ code: 'incompatible_part', path: path + '.connections.' + slotId, item_id: part.item_id });
                visit(part, path + '.connections.' + slotId + '.part', nextAncestors);
            });
            if (requireComplete) Object.keys(specs).forEach(function (slotId) {
                if (specs[slotId] && specs[slotId].required === true && !getConnectionPart(inst, slotId)) {
                    errors.push({ code: 'required_slot_empty', path: path + '.connections.' + slotId });
                }
            });
        }
        visit(root, 'root', {});
        return { ok: errors.length === 0, errors: errors, instance_count: Object.keys(seen).length };
    }

    function containerArray(IE, containerType) {
        if (containerType === 'pocket' && typeof IE.getPocketArray === 'function') return IE.getPocketArray();
        if (containerType === 'vest' && typeof IE.getVestArray === 'function') return IE.getVestArray();
        if (containerType === 'backpack' && typeof IE.getBackpackArray === 'function') return IE.getBackpackArray();
        if (containerType === 'vehicle' && typeof IE.getVehicleArray === 'function') return IE.getVehicleArray();
        return null;
    }

    function restore(IE, snapshot, reason, extra) {
        IE.setState(snapshot);
        return Object.assign({ ok: false, reason: reason }, extra || {});
    }

    function isLocked(instanceId) {
        return !!(global.FishingSession && typeof global.FishingSession.isInstanceLocked === 'function' && global.FishingSession.isInstanceLocked(instanceId));
    }

    /** 从一个携带容器取一份真实物品并连接到指定宿主；全成或全败。 */
    function attachFromContainer(hostInstanceId, slotId, containerType, index) {
        var IE = inventory();
        if (!IE || typeof IE.findItemInstanceRecord !== 'function' || typeof IE.takeItemFromContainer !== 'function') return { ok: false, reason: 'inventory_unavailable' };
        var hostRecord = IE.findItemInstanceRecord(hostInstanceId);
        if (!hostRecord) return { ok: false, reason: 'host_not_found' };
        if (isLocked(hostInstanceId)) return { ok: false, reason: 'item_locked' };
        var arr = containerArray(IE, containerType);
        var idx = Math.floor(Number(index));
        if (!arr || !isFinite(idx) || idx < 0 || idx >= arr.length || !arr[idx]) return { ok: false, reason: 'source_not_found' };
        var source = arr[idx];
        var preview = source;
        var precheck = validateAttach(hostRecord.instance, slotId, preview);
        if (!precheck.ok) return precheck;
        var snapshot = clone(IE.getState());
        var taken = IE.takeItemFromContainer(containerType, idx);
        if (!taken || !taken.success || !taken.item) return restore(IE, snapshot, 'take_failed');
        hostRecord = IE.findItemInstanceRecord(hostInstanceId);
        if (!hostRecord) return restore(IE, snapshot, 'host_missing_after_take');
        var checked = validateAttach(hostRecord.instance, slotId, taken.item);
        if (!checked.ok) return restore(IE, snapshot, checked.reason);
        var connections = ensureConnections(hostRecord.instance);
        connections[String(slotId)] = { connection_schema_version: CONNECTION_SCHEMA_VERSION, part: taken.item };
        var validation = validateAssembly(hostRecord.instance, { requireComplete: false });
        var audit = typeof IE.auditItemOwnership === 'function' ? IE.auditItemOwnership() : { ok: true };
        if (!validation.ok || !audit.ok) return restore(IE, snapshot, !validation.ok ? 'invalid_assembly' : 'ownership_invalid', { validation: validation, audit: audit });
        return {
            ok: true,
            host_instance_id: hostInstanceId,
            slot_id: String(slotId),
            part_instance_id: taken.item.instance_id,
            combined_weight_kg: typeof IE.getItemCombinedWeight === 'function' ? IE.getItemCombinedWeight(hostRecord.instance) : null
        };
    }

    /** 拆下一个槽位中的整棵子组合并放入默认容器；没有空间时完整回滚。 */
    function detachToInventory(hostInstanceId, slotId) {
        var IE = inventory();
        if (!IE || typeof IE.findItemInstanceRecord !== 'function' || typeof IE.putItemIntoDefaultContainer !== 'function') return { ok: false, reason: 'inventory_unavailable' };
        var hostRecord = IE.findItemInstanceRecord(hostInstanceId);
        if (!hostRecord) return { ok: false, reason: 'host_not_found' };
        if (isLocked(hostInstanceId)) return { ok: false, reason: 'item_locked' };
        var part = getConnectionPart(hostRecord.instance, String(slotId));
        if (!part) return { ok: false, reason: 'slot_empty' };
        var snapshot = clone(IE.getState());
        var partId = part.instance_id;
        delete hostRecord.instance.connections[String(slotId)];
        if (!Object.keys(hostRecord.instance.connections).length) delete hostRecord.instance.connections;
        var placed = IE.putItemIntoDefaultContainer(part);
        if (!placed || !placed.placed) return restore(IE, snapshot, 'inventory_full');
        var audit = typeof IE.auditItemOwnership === 'function' ? IE.auditItemOwnership() : { ok: true };
        if (!audit.ok) return restore(IE, snapshot, 'ownership_invalid', { audit: audit });
        return { ok: true, part_instance_id: partId, placed: placed };
    }

    /**
     * 从连接树移除并销毁一个完整子组合。仅供已经结算的消耗、断裂或切线使用；
     * 玩家主动拆装仍必须走 detachToInventory，避免绕过接收空间检查。
     */
    function discardConnectionSubtree(hostInstanceId, slotId) {
        var IE = inventory();
        if (!IE || typeof IE.findItemInstanceRecord !== 'function') return { ok: false, reason: 'inventory_unavailable' };
        var hostRecord = IE.findItemInstanceRecord(hostInstanceId);
        if (!hostRecord) return { ok: false, reason: 'host_not_found' };
        var key = String(slotId || '');
        var part = getConnectionPart(hostRecord.instance, key);
        if (!part) return { ok: false, reason: 'slot_empty' };
        var snapshot = clone(IE.getState());
        var lost = [];
        (function collect(inst) {
            if (!inst || !inst.item_id) return;
            lost.push({
                item_id: inst.item_id,
                instance_id: inst.instance_id || null,
                count: Math.max(1, Number(inst.count) || 1)
            });
            childEntries(inst).forEach(function (entry) { collect(entry.instance); });
        })(part);
        var lostWeight = typeof IE.getItemCombinedWeight === 'function' ? IE.getItemCombinedWeight(part) : null;
        delete hostRecord.instance.connections[key];
        if (!Object.keys(hostRecord.instance.connections).length) delete hostRecord.instance.connections;
        var validation = validateAssembly(hostRecord.instance, { requireComplete: false });
        var audit = typeof IE.auditItemOwnership === 'function' ? IE.auditItemOwnership() : { ok: true };
        if (!validation.ok || !audit.ok) return restore(IE, snapshot, !validation.ok ? 'invalid_assembly' : 'ownership_invalid', { validation: validation, audit: audit });
        return {
            ok: true,
            host_instance_id: hostInstanceId,
            slot_id: key,
            lost_root_instance_id: part.instance_id || null,
            lost_weight_kg: lostWeight,
            lost_items: lost
        };
    }

    function describeTree(root) {
        function build(inst, slotId) {
            var node = {
                slot_id: slotId || null,
                item_id: inst.item_id,
                instance_id: inst.instance_id,
                own_weight_kg: Number((templateValue(inst, 'weight_kg') || 0)),
                children: []
            };
            var specs = getSlotSpecs(inst);
            Object.keys(specs).forEach(function (key) {
                var child = getConnectionPart(inst, key);
                if (child) node.children.push(build(child, key));
            });
            var IE = inventory();
            node.combined_weight_kg = IE && typeof IE.getItemCombinedWeight === 'function' ? IE.getItemCombinedWeight(inst) : node.own_weight_kg;
            return node;
        }
        return root && root.item_id ? build(root, null) : null;
    }

    global.ItemAssembly = {
        CONNECTION_SCHEMA_VERSION: CONNECTION_SCHEMA_VERSION,
        getSlotSpecs: getSlotSpecs,
        getPartTypes: getPartTypes,
        getConnectionPart: getConnectionPart,
        validateAttach: validateAttach,
        validateAssembly: validateAssembly,
        attachFromContainer: attachFromContainer,
        detachToInventory: detachToInventory,
        discardConnectionSubtree: discardConnectionSubtree,
        describeTree: describeTree,
        treeContains: treeContains
    };
})(typeof window !== 'undefined' ? window : globalThis);

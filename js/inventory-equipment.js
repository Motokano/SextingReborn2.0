/**
 * 物品栏与装备栏系统 - 按设计文档 02-regions、05、14-implementation
 * 四类容器：口袋、背心、背包、载具；15 个装备槽；快捷腰带 = 口袋 + 背心（先口袋后背心）
 * getItemTemplate 先 equipment 再 items；装备穿戴校验；死亡清空、新游戏仅 default_equipment
 */
(function (global) {
    'use strict';

    /** 装备槽位 ID（呼吸法、轻功为技能而非装备，不占装备槽） */
    var EQUIP_SLOT_IDS = [
        'head', 'clothing', 'vest', 'backpack',
        'weapon_left', 'weapon_right',
        'glove_left', 'glove_right',
        'shoe_left', 'shoe_right',
        'parry_left', 'parry_right', 'accessory'
    ];

    /** 品质六档：粗糙→普通→精良→稀有→史诗→传说，0～5 */
    var QUALITY_TIERS = [0, 1, 2, 3, 4, 5];
    var QUALITY_NAMES = ['粗糙', '普通', '精良', '稀有', '史诗', '传说'];

    var equipmentTable = {};
    var itemsTable = {};
    var enchantTable = {};
    var defaultEquipmentConfig = {};
    var displayTierThreshold1 = null;
    var displayTierThreshold2 = null;

    /** 地面物品：key = "mapId_x_y"，value = 该格子上物品实例数组 */
    var state = {
        equipment: {},
        inventory_pocket: [],
        inventory_vest: [],
        inventory_backpack: [],
        inventory_vehicle: [],
        bound_vehicle_id: null,
        skills: {},
        ground_items: {}
    };

    /** 技能等级获取：未习得为 0 */
    function getSkillLevel(skillId) {
        var s = state.skills[skillId];
        if (!s || s.level == null) return 0;
        return Math.max(0, parseInt(s.level, 10));
    }

    function initEquipmentSlots() {
        var i;
        for (i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            var slot = EQUIP_SLOT_IDS[i];
            if (state.equipment[slot] === undefined) state.equipment[slot] = null;
        }
    }

    /**
     * 先查 equipment、再查 items；无则返回 null
     */
    function getItemTemplate(itemId) {
        if (!itemId) return null;
        if (equipmentTable[itemId]) return equipmentTable[itemId];
        if (itemsTable[itemId]) return itemsTable[itemId];
        return null;
    }

    /**
     * 根据技能等级返回展示档位 0/1/2，用于 name_0/1/2、desc_0/1/2
     * 档位阈值可留空，留空时默认档位 0
     */
    function getItemDisplayTier(itemId, character) {
        var tpl = getItemTemplate(itemId);
        if (!tpl || !tpl.display_skill_id) return 0;
        var skillId = tpl.display_skill_id;
        var level = character && character.skills && character.skills[skillId]
            ? Math.max(0, parseInt(character.skills[skillId].level, 10))
            : 0;
        var t1 = displayTierThreshold1 != null ? displayTierThreshold1 : Infinity;
        var t2 = displayTierThreshold2 != null ? displayTierThreshold2 : Infinity;
        if (level >= t2) return 2;
        if (level >= t1) return 1;
        return 0;
    }

    function getDisplayName(tpl, tier) {
        if (!tpl) return '?';
        var key = 'name_' + (tier || 0);
        return tpl[key] != null ? tpl[key] : (tpl.name_0 || tpl.name || tpl.id || '?');
    }

    function getDisplayDesc(tpl, tier) {
        if (!tpl) return '';
        var key = 'desc_' + (tier || 0);
        return tpl[key] != null ? tpl[key] : (tpl.desc_0 || tpl.desc || '');
    }

    /** 当前装备提供的口袋格数（来自衣服） */
    function getPocketSlots() {
        var clothing = state.equipment.clothing;
        if (!clothing || !clothing.item_id) return 0;
        var tpl = getItemTemplate(clothing.item_id);
        return (tpl && tpl.pocket_slots != null) ? Math.max(0, parseInt(tpl.pocket_slots, 10)) : 0;
    }

    /** 当前装备提供的背心格数 */
    function getVestSlots() {
        var vest = state.equipment.vest;
        if (!vest || !vest.item_id) return 0;
        var tpl = getItemTemplate(vest.item_id);
        return (tpl && tpl.vest_slots != null) ? Math.max(0, parseInt(tpl.vest_slots, 10)) : 0;
    }

    /** 当前装备提供的背包格数 */
    function getBackpackSlots() {
        var backpack = state.equipment.backpack;
        if (!backpack || !backpack.item_id) return 0;
        var tpl = getItemTemplate(backpack.item_id);
        return (tpl && tpl.backpack_slots != null) ? Math.max(0, parseInt(tpl.backpack_slots, 10)) : 0;
    }

    /** 快捷腰带总格数 = 口袋 + 背心；格序先口袋、后背心 */
    function getQuickBeltSlots() {
        return getPocketSlots() + getVestSlots();
    }

    /** 快捷腰带索引 → 容器类型与格位 { type: 'pocket'|'vest', index: number } */
    function getQuickBeltSlotSource(beltIndex) {
        var pocket = getPocketSlots();
        if (beltIndex < pocket) return { type: 'pocket', index: beltIndex };
        return { type: 'vest', index: beltIndex - pocket };
    }

    /** 取口袋/背心/背包数组（按当前装备长度截断） */
    function getPocketArray() {
        var max = getPocketSlots();
        var arr = state.inventory_pocket.slice(0, max);
        while (arr.length < max) arr.push(null);
        return arr.slice(0, max);
    }

    function getVestArray() {
        var max = getVestSlots();
        var arr = state.inventory_vest.slice(0, max);
        while (arr.length < max) arr.push(null);
        return arr.slice(0, max);
    }

    function getBackpackArray() {
        var max = getBackpackSlots();
        var arr = state.inventory_backpack.slice(0, max);
        while (arr.length < max) arr.push(null);
        return arr.slice(0, max);
    }

    /**
     * 尝试将物品放入默认顺序：背包 → 载具 → 背心 → 口袋
     * 返回 { placed: boolean, container?: string, index?: number, dropped?: boolean }
     */
    function putItemIntoDefaultContainer(itemInstance) {
        if (!itemInstance || !itemInstance.item_id) return { placed: false, dropped: true };

        var backpackSlots = getBackpackSlots();
        if (backpackSlots > 0) {
            var arr = state.inventory_backpack.slice();
            var canStack = canStackInSlot(itemInstance, null);
            for (var i = 0; i < backpackSlots; i++) {
                var existing = arr[i] || null;
                if (canStack && existing && existing.item_id === itemInstance.item_id && !(existing.enchants && existing.enchants.length)) {
                    var count = (existing.count || 1) + (itemInstance.count || 1);
                    var maxStack = getMaxStack(itemInstance.item_id);
                    if (count <= maxStack) {
                        arr[i] = { item_id: existing.item_id, count: count, quality_tier: existing.quality_tier };
                        state.inventory_backpack = arr;
                        return { placed: true, container: 'backpack', index: i };
                    }
                }
                if (!existing) {
                    arr[i] = copyItemInstance(itemInstance);
                    state.inventory_backpack = arr;
                    return { placed: true, container: 'backpack', index: i };
                }
            }
        }

        if (state.bound_vehicle_id && state.inventory_vehicle) {
            var varr = state.inventory_vehicle.slice();
            for (var j = 0; j < varr.length; j++) {
                if (!varr[j]) {
                    varr[j] = copyItemInstance(itemInstance);
                    state.inventory_vehicle = varr;
                    return { placed: true, container: 'vehicle', index: j };
                }
            }
            varr.push(copyItemInstance(itemInstance));
            state.inventory_vehicle = varr;
            return { placed: true, container: 'vehicle', index: varr.length - 1 };
        }

        var vestSlots = getVestSlots();
        if (vestSlots > 0) {
            var v = state.inventory_vest.slice();
            for (var k = 0; k < vestSlots; k++) {
                if (!v[k]) {
                    v[k] = copyItemInstance(itemInstance);
                    if (v[k].count > 1) v[k].count = 1;
                    state.inventory_vest = v;
                    return { placed: true, container: 'vest', index: k };
                }
            }
        }

        var pocketSlots = getPocketSlots();
        if (pocketSlots > 0) {
            var p = state.inventory_pocket.slice();
            for (var m = 0; m < pocketSlots; m++) {
                if (!p[m]) {
                    p[m] = copyItemInstance(itemInstance);
                    if (p[m].count > 1) p[m].count = 1;
                    state.inventory_pocket = p;
                    return { placed: true, container: 'pocket', index: m };
                }
            }
        }

        return { placed: false, dropped: true };
    }

    /** 是否至少有一个容器能再放一件物品（用于采集等判定“背包是否满”） */
    function canAcceptItem() {
        var pocketSlots = getPocketSlots(), vestSlots = getVestSlots(), backpackSlots = getBackpackSlots();
        var pocketUsed = state.inventory_pocket.filter(Boolean).length;
        var vestUsed = state.inventory_vest.filter(Boolean).length;
        var backpackUsed = state.inventory_backpack.filter(Boolean).length;
        if (pocketSlots > 0 && pocketUsed < pocketSlots) return true;
        if (vestSlots > 0 && vestUsed < vestSlots) return true;
        if (backpackSlots > 0 && backpackUsed < backpackSlots) return true;
        if (state.bound_vehicle_id && state.inventory_vehicle) return true;
        return false;
    }

    function canStackInSlot(instance, existing) {
        var tpl = getItemTemplate(instance.item_id);
        if (!tpl) return false;
        if (tpl.enchant_slots != null && tpl.enchant_slots > 0) return false;
        if (instance.enchants && instance.enchants.length) return false;
        if (existing && (existing.enchants && existing.enchants.length)) return false;
        return true;
    }

    function getMaxStack(itemId) {
        var tpl = getItemTemplate(itemId);
        if (!tpl) return 1;
        if (tpl.enchant_slots != null && tpl.enchant_slots > 0) return 1;
        return (tpl.stack_max != null) ? Math.max(1, parseInt(tpl.stack_max, 10)) : 99;
    }

    function copyItemInstance(inst) {
        var c = { item_id: inst.item_id };
        if (inst.count != null) c.count = inst.count;
        if (inst.quality_tier != null) c.quality_tier = inst.quality_tier;
        if (inst.enchants && inst.enchants.length) c.enchants = inst.enchants.slice();
        return c;
    }

    /**
     * 穿戴装备：校验 equip_slot 一致、enchants 数量不超过 enchant_slots
     * 返回 { success: boolean, message?: string }
     */
    function equip(slotId, instance) {
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) return { success: false, message: '无效槽位' };
        if (!instance || !instance.item_id) return { success: false, message: '无效物品' };
        var tpl = getItemTemplate(instance.item_id);
        if (!tpl) return { success: false, message: '未知物品' };
        if (tpl.equip_slot !== slotId) return { success: false, message: '装备槽位不匹配' };
        var maxEnchants = (tpl.enchant_slots != null) ? parseInt(tpl.enchant_slots, 10) : 6;
        var enc = instance.enchants;
        if (enc && enc.length > maxEnchants) return { success: false, message: '词条数量超过上限' };

        state.equipment[slotId] = copyItemInstance(instance);
        return { success: true };
    }

    /**
     * 从指定容器取出指定格位的物品（从栏位移除并返回实例；可堆叠时取 1 个单位）
     * @param {string} containerType - 'pocket' | 'vest' | 'backpack' | 'vehicle'
     * @param {number} index - 格位索引
     * @returns {{ item: object|null, success: boolean }}
     */
    function takeItemFromContainer(containerType, index) {
        var key = 'inventory_' + containerType;
        if (key !== 'inventory_pocket' && key !== 'inventory_vest' && key !== 'inventory_backpack' && key !== 'inventory_vehicle') return { item: null, success: false };
        var arr = state[key];
        if (!arr || index < 0 || index >= arr.length) return { item: null, success: false };
        var raw = arr[index];
        if (!raw || !raw.item_id) return { item: null, success: false };
        var taken = copyItemInstance(raw);
        if (raw.count != null && raw.count > 1) {
            raw.count -= 1;
            taken.count = 1;
        } else {
            arr[index] = null;
        }
        return { item: taken, success: true };
    }

    /**
     * 脱下指定槽位装备；若为背心/背包/衣服，先迁移物品再置空容器
     * @param {string} slotId
     * @param {{ mapId: string, x: number, y: number }|undefined} optGroundPos - 迁移时放不下的物品掉落到该格子
     */
    function unequip(slotId, optGroundPos) {
        if (EQUIP_SLOT_IDS.indexOf(slotId) < 0) return null;
        var current = state.equipment[slotId];
        state.equipment[slotId] = null;

        if (slotId === 'vest') {
            migrateContainerToBackpack(state.inventory_vest, optGroundPos);
            state.inventory_vest = [];
        }
        if (slotId === 'backpack') {
            migrateContainerToBackpack(state.inventory_backpack, optGroundPos);
            state.inventory_backpack = [];
        }
        if (slotId === 'clothing') {
            migrateContainerToBackpack(state.inventory_pocket, optGroundPos);
            state.inventory_pocket = [];
        }

        return current;
    }

    /** 地面物品 key */
    function getGroundItemKey(mapId, x, y) {
        if (mapId == null || x == null || y == null) return '';
        return String(mapId) + '_' + x + '_' + y;
    }

    /** 获取指定格子上的地面物品列表（副本） */
    function getGroundItemsAt(mapId, x, y) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || !arr.length) return [];
        return arr.slice();
    }

    /** 将物品放到指定格子地面 */
    function addItemToGround(mapId, x, y, itemInstance) {
        if (!itemInstance || !itemInstance.item_id) return;
        var key = getGroundItemKey(mapId, x, y);
        if (!key) return;
        if (!state.ground_items[key]) state.ground_items[key] = [];
        state.ground_items[key].push(copyItemInstance(itemInstance));
    }

    /** 从地面移除并返回指定索引的物品 */
    function removeItemFromGround(mapId, x, y, index) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || index < 0 || index >= arr.length) return null;
        var item = arr.splice(index, 1)[0];
        if (arr.length === 0) delete state.ground_items[key];
        return item;
    }

    /**
     * 从容器取出物品并丢到指定格子地面（主动丢弃）
     * @returns {{ success: boolean, message?: string }}
     */
    function dropItemToGround(containerType, index, mapId, x, y) {
        var taken = takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) return { success: false, message: '无法取出物品' };
        addItemToGround(mapId, x, y, taken.item);
        return { success: true };
    }

    /**
     * 从地面拾取指定索引的物品，尝试放入默认容器
     * @returns {{ success: boolean, placed?: boolean, message?: string }}
     */
    function pickUpFromGround(mapId, x, y, index) {
        var key = getGroundItemKey(mapId, x, y);
        var arr = state.ground_items[key];
        if (!arr || index < 0 || index >= arr.length) return { success: false, message: '该位置无物品' };
        var item = removeItemFromGround(mapId, x, y, index);
        if (!item) return { success: false, message: '拾取失败' };
        var placed = putItemIntoDefaultContainer(item);
        if (placed.placed) return { success: true, placed: true };
        addItemToGround(mapId, x, y, item);
        return { success: false, placed: false, message: '背包已满' };
    }

    /** 将容器内物品尝试移入背包，放不下的若提供 optGroundPos 则掉落到该格子 */
    function migrateContainerToBackpack(fromArr, optGroundPos) {
        if (!fromArr || !fromArr.length) return;
        var backpackSlots = getBackpackSlots();
        var toArr = state.inventory_backpack.slice();
        for (var i = 0; i < fromArr.length; i++) {
            var item = fromArr[i];
            if (!item) continue;
            var placed = false;
            for (var j = 0; j < backpackSlots; j++) {
                if (!toArr[j]) {
                    toArr[j] = copyItemInstance(item);
                    if (toArr[j].count > 1 && getPocketSlots() === 0 && getVestSlots() === 0) { }
                    else if (toArr[j].count > 1) toArr[j].count = 1;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                for (var k = 0; k < backpackSlots; k++) {
                    var ex = toArr[k];
                    if (ex && ex.item_id === item.item_id && !(ex.enchants && ex.enchants.length) && (ex.count || 1) < getMaxStack(item.item_id)) {
                        ex.count = (ex.count || 1) + (item.count || 1);
                        placed = true;
                        break;
                    }
                }
            }
            if (!placed && optGroundPos && optGroundPos.mapId != null && optGroundPos.x != null && optGroundPos.y != null) {
                addItemToGround(optGroundPos.mapId, optGroundPos.x, optGroundPos.y, item);
            }
        }
        state.inventory_backpack = toArr;
    }

    /** 死亡时：清空全部装备与四类物品栏、载具绑定（地面物品保留） */
    function clearAllOnDeath() {
        var slot;
        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            slot = EQUIP_SLOT_IDS[i];
            state.equipment[slot] = null;
        }
        state.inventory_pocket = [];
        state.inventory_vest = [];
        state.inventory_backpack = [];
        state.inventory_vehicle = [];
        state.bound_vehicle_id = null;
    }

    /** 新游戏初始化：四类物品栏为空，仅根据 default_equipment 穿戴；地面物品清空 */
    function initNewGame() {
        state.inventory_pocket = [];
        state.inventory_vest = [];
        state.inventory_backpack = [];
        state.inventory_vehicle = [];
        state.bound_vehicle_id = null;
        state.ground_items = {};
        initEquipmentSlots();
        var slot;
        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            slot = EQUIP_SLOT_IDS[i];
            state.equipment[slot] = null;
        }
        var def = defaultEquipmentConfig;
        for (var key in def) {
            if (def.hasOwnProperty(key) && key !== '_comment' && EQUIP_SLOT_IDS.indexOf(key) >= 0) {
                var itemId = def[key];
                if (itemId) state.equipment[key] = { item_id: itemId, enchants: [] };
            }
        }
    }

    function setConfig(cfg) {
        if (cfg.equipment) equipmentTable = cfg.equipment;
        if (cfg.items) itemsTable = cfg.items;
        if (cfg.enchant) enchantTable = cfg.enchant;
        if (cfg.default_equipment) defaultEquipmentConfig = cfg.default_equipment;
        if (cfg.item_display_tier_threshold_1 !== undefined) displayTierThreshold1 = cfg.item_display_tier_threshold_1;
        if (cfg.item_display_tier_threshold_2 !== undefined) displayTierThreshold2 = cfg.item_display_tier_threshold_2;
    }

    function setState(s) {
        if (!s) return;
        if (s.equipment) {
            state.equipment = {};
            initEquipmentSlots();
            for (var k in s.equipment) {
                if (EQUIP_SLOT_IDS.indexOf(k) >= 0) state.equipment[k] = s.equipment[k];
            }
        }
        if (s.inventory_pocket) state.inventory_pocket = s.inventory_pocket.slice();
        if (s.inventory_vest) state.inventory_vest = s.inventory_vest.slice();
        if (s.inventory_backpack) state.inventory_backpack = s.inventory_backpack.slice();
        if (s.inventory_vehicle) state.inventory_vehicle = s.inventory_vehicle.slice();
        if (s.bound_vehicle_id !== undefined) state.bound_vehicle_id = s.bound_vehicle_id;
        if (s.skills) state.skills = s.skills;
        if (s.ground_items && typeof s.ground_items === 'object') {
            state.ground_items = {};
            for (var gk in s.ground_items) {
                if (s.ground_items.hasOwnProperty(gk) && Array.isArray(s.ground_items[gk]))
                    state.ground_items[gk] = s.ground_items[gk].slice();
            }
        }
    }

    function getState() {
        var eq = {};
        for (var i = 0; i < EQUIP_SLOT_IDS.length; i++) {
            var id = EQUIP_SLOT_IDS[i];
            eq[id] = state.equipment[id];
        }
        var groundCopy = {};
        for (var gk in state.ground_items) {
            if (state.ground_items.hasOwnProperty(gk))
                groundCopy[gk] = state.ground_items[gk].slice();
        }
        return {
            equipment: eq,
            inventory_pocket: state.inventory_pocket.slice(),
            inventory_vest: state.inventory_vest.slice(),
            inventory_backpack: state.inventory_backpack.slice(),
            inventory_vehicle: state.inventory_vehicle.slice(),
            bound_vehicle_id: state.bound_vehicle_id,
            skills: state.skills,
            ground_items: groundCopy
        };
    }

    function getCharacterForDisplay() {
        return { skills: state.skills };
    }

    global.InventoryEquipment = {
        EQUIP_SLOT_IDS: EQUIP_SLOT_IDS,
        QUALITY_TIERS: QUALITY_TIERS,
        QUALITY_NAMES: QUALITY_NAMES,
        setConfig: setConfig,
        setState: setState,
        getState: getState,
        getItemTemplate: getItemTemplate,
        getItemDisplayTier: getItemDisplayTier,
        getDisplayName: getDisplayName,
        getDisplayDesc: getDisplayDesc,
        getPocketSlots: getPocketSlots,
        getVestSlots: getVestSlots,
        getBackpackSlots: getBackpackSlots,
        getQuickBeltSlots: getQuickBeltSlots,
        getQuickBeltSlotSource: getQuickBeltSlotSource,
        getPocketArray: getPocketArray,
        getVestArray: getVestArray,
        getBackpackArray: getBackpackArray,
        putItemIntoDefaultContainer: putItemIntoDefaultContainer,
        canAcceptItem: canAcceptItem,
        equip: equip,
        unequip: unequip,
        takeItemFromContainer: takeItemFromContainer,
        getGroundItemKey: getGroundItemKey,
        getGroundItemsAt: getGroundItemsAt,
        addItemToGround: addItemToGround,
        removeItemFromGround: removeItemFromGround,
        dropItemToGround: dropItemToGround,
        pickUpFromGround: pickUpFromGround,
        clearAllOnDeath: clearAllOnDeath,
        initNewGame: initNewGame,
        getSkillLevel: getSkillLevel,
        getCharacterForDisplay: getCharacterForDisplay
    };
})(typeof window !== 'undefined' ? window : this);

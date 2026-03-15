/**
 * 采集系统 - 按设计文档 11-skills 8.2.2
 * 灌木丛(gathering_bush)、草丛(gathering_grass)，成功率 base + base*(熟练度%*0.003)，
 * 五百万次满熟练度，品质上修：熟练度每高 5% 有 5% 概率上修一档（最高传说）
 */
(function (global) {
    'use strict';

    var GATHERING_MAX_PROFICIENCY = 5000000;
    var STAMINA_COST = 2;
    var MAX_INVENTORY_SLOTS = 30;
    var QUALITY_NAMES = ['', '粗糙', '普通', '精良', '稀有', '史诗', '传说'];

    var config = {
        gathering_points: {},
        loot_tables: {},
        items: {}
    };

    var character = {
        stamina: 100,
        stamina_max: 100,
        inventory: [],
        proficiency_count: 0
    };

    function useSurvival() {
        var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
        return g && g.Survival && typeof g.Survival.getStamina === 'function';
    }

    function setConfig(cfg) {
        if (cfg.gathering_points) config.gathering_points = cfg.gathering_points;
        if (cfg.loot_tables) config.loot_tables = cfg.loot_tables;
        if (cfg.items) config.items = cfg.items;
    }

    function getCharacterState() {
        var g = useSurvival() ? (typeof window !== 'undefined' ? window : global).Survival : null;
        var stamina = g ? g.getStamina() : character.stamina;
        var stamina_max = g ? g.getStaminaMax() : character.stamina_max;
        return {
            stamina: stamina,
            stamina_max: stamina_max,
            inventory: character.inventory.slice(),
            proficiency_count: character.proficiency_count,
            proficiency_percent: (character.proficiency_count / GATHERING_MAX_PROFICIENCY) * 100
        };
    }

    function setCharacterState(s) {
        if (s.stamina !== undefined) character.stamina = Math.max(0, s.stamina);
        if (s.stamina_max !== undefined) character.stamina_max = s.stamina_max;
        if (s.inventory !== undefined) character.inventory = s.inventory.slice();
        if (s.proficiency_count !== undefined) character.proficiency_count = Math.max(0, s.proficiency_count);
        if (useSurvival()) {
            var Surv = (typeof window !== 'undefined' ? window : global).Survival;
            Surv.setState({ stamina: character.stamina, stamina_max: character.stamina_max });
        }
    }

    function getProficiencyPercent() {
        return (character.proficiency_count / GATHERING_MAX_PROFICIENCY) * 100;
    }

    function isInventoryFull() {
        var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
        if (g && g.InventoryEquipment && typeof g.InventoryEquipment.canAcceptItem === 'function') {
            return !g.InventoryEquipment.canAcceptItem();
        }
        return character.inventory.length >= MAX_INVENTORY_SLOTS;
    }

    function getGatheringPointConfig(entityId) {
        return config.gathering_points[entityId] || null;
    }

    function rollLootRow(lootTable) {
        if (!lootTable || lootTable.length === 0) return null;
        var total = 0;
        for (var i = 0; i < lootTable.length; i++) total += lootTable[i].weight;
        if (total <= 0) return lootTable[0] || null;
        var r = Math.random() * total;
        for (var j = 0; j < lootTable.length; j++) {
            r -= lootTable[j].weight;
            if (r <= 0) return lootTable[j];
        }
        return lootTable[lootTable.length - 1];
    }

    function tryQualityUpgrade(qualityTier) {
        if (qualityTier >= 6) return 6;
        var pct = getProficiencyPercent();
        var chance = Math.min(1, pct / 100);
        if (Math.random() < chance) return Math.min(6, qualityTier + 1);
        return qualityTier;
    }

    /**
     * 执行一次采集
     * @param {string} entityId - gathering_bush | gathering_grass
     * @returns {{ success: boolean, gathered?: { item_id, quality_tier, item_name, quality_name }, message: string }}
     */
    function doGather(entityId) {
        var point = getGatheringPointConfig(entityId);
        if (!point) return { success: false, message: '未知采集点' };

        var Surv = useSurvival() ? (typeof window !== 'undefined' ? window : global).Survival : null;
        if (Surv && !Surv.canPerformStaminaOrEnergyAction()) {
            return { success: false, message: '饱食度过低或体力耗尽，无法进行消耗体力/精力的动作' };
        }
        var staminaNow = Surv ? Surv.getStamina() : character.stamina;
        var cost = point.stamina_cost != null ? point.stamina_cost : STAMINA_COST;
        if (staminaNow < cost) return { success: false, message: '体力不足' };
        if (isInventoryFull()) return { success: false, message: '背包已满' };

        var base = point.base_gathering_success_rate != null ? point.base_gathering_success_rate : 0.6;
        var proficiencyPct = getProficiencyPercent();
        var successRate = base + base * (proficiencyPct * 0.003);
        successRate = Math.min(1, successRate);

        if (Surv) Surv.consumeStamina(cost); else { character.stamina -= cost; if (character.stamina < 0) character.stamina = 0; }

        var roll = Math.random();
        if (roll >= successRate) {
            return { success: false, message: '采集失败', consumedStamina: true };
        }

        var lootTableId = point.loot_table_id;
        var lootTable = config.loot_tables[lootTableId];
        if (!lootTable || lootTable.length === 0) {
            character.proficiency_count += 1;
            return { success: true, message: '采集成功但无产出', consumedStamina: true };
        }

        var row = rollLootRow(lootTable);
        if (!row) {
            character.proficiency_count += 1;
            return { success: true, message: '采集成功但无产出', consumedStamina: true };
        }

        var qualityTier = row.quality_tier != null ? Math.max(1, Math.min(6, row.quality_tier)) : 1;
        qualityTier = tryQualityUpgrade(qualityTier);

        var itemDef = config.items[row.item_id];
        var itemName = itemDef && itemDef.name ? itemDef.name : row.item_id;
        var qualityName = QUALITY_NAMES[qualityTier] || '粗糙';

        var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
        if (g && g.InventoryEquipment && typeof g.InventoryEquipment.putItemIntoDefaultContainer === 'function') {
            var itemInstance = { item_id: row.item_id, quality_tier: qualityTier, count: 1 };
            var placed = g.InventoryEquipment.putItemIntoDefaultContainer(itemInstance);
            if (!placed.placed) {
                if (g.GameEngine && typeof g.GameEngine.getState === 'function') {
                    var pos = g.GameEngine.getState();
                    if (pos && pos.mapId != null && pos.x != null && pos.y != null)
                        g.InventoryEquipment.addItemToGround(pos.mapId, pos.x, pos.y, itemInstance);
                }
                character.proficiency_count += 1;
                if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.advanceTick === 'function') {
                    global.Survival.advanceTick();
                }
                return { success: true, message: '获得 ' + qualityName + ' ' + itemName + '（已掉落在脚下）', consumedStamina: true };
            }
        } else {
            character.inventory.push({ item_id: row.item_id, quality_tier: qualityTier });
        }
        character.proficiency_count += 1;

        if (Surv && typeof Surv.advanceTick === 'function') Surv.advanceTick();
        return {
            success: true,
            gathered: {
                item_id: row.item_id,
                quality_tier: qualityTier,
                item_name: itemName,
                quality_name: qualityName
            },
            message: '获得 ' + qualityName + ' ' + itemName,
            consumedStamina: true
        };
    }

    global.Gathering = {
        GATHERING_MAX_PROFICIENCY: GATHERING_MAX_PROFICIENCY,
        QUALITY_NAMES: QUALITY_NAMES,
        MAX_INVENTORY_SLOTS: MAX_INVENTORY_SLOTS,
        setConfig: setConfig,
        getCharacterState: getCharacterState,
        setCharacterState: setCharacterState,
        getProficiencyPercent: getProficiencyPercent,
        getGatheringPointConfig: getGatheringPointConfig,
        isInventoryFull: isInventoryFull,
        canGather: function (entityId) {
            var point = getGatheringPointConfig(entityId);
            if (!point) return false;
            var Surv = useSurvival() ? (typeof window !== 'undefined' ? window : global).Survival : null;
            if (Surv && !Surv.canPerformStaminaOrEnergyAction()) return false;
            var stamina = Surv ? Surv.getStamina() : character.stamina;
            var cost = point.stamina_cost != null ? point.stamina_cost : STAMINA_COST;
            if (stamina < cost) return false;
            if (isInventoryFull()) return false;
            return true;
        },
        doGather: doGather
    };
})(typeof window !== 'undefined' ? window : this);

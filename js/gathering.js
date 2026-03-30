/**
 * 采集系统 — 设计见 docs/design/11-skills.md 8.2.2 + gathering_point_instances
 * 地图格 entity_id 为视觉键；可选 gathering_instance_id 引用 data/gathering_point_instances.json 中的实例。
 * 不枯竭；每行 loot 可配 quality_tier_max（1～6）为熟练度上修后的硬上限。
 */
(function (global) {
    'use strict';

    var GATHERING_MAX_PROFICIENCY = 5000000;
    var STAMINA_COST = 2;
    var MAX_INVENTORY_SLOTS = 30;
    var QUALITY_NAMES = ['粗糙', '普通', '精良', '稀有', '史诗', '传说'];

    var config = {
        gathering_points: {},
        loot_tables: {},
        items: {},
        instanceDefaults: {},
        instances: {}
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

    function synthesizeInstancesFromLegacy(points, lootTables) {
        var defaults = {};
        var instances = {};
        if (!points || typeof points !== 'object') return { defaults: defaults, instances: instances };
        for (var key in points) {
            if (!Object.prototype.hasOwnProperty.call(points, key)) continue;
            var p = points[key];
            var gid = p.gathering_point_id || key;
            defaults[key] = gid;
            var loot = (p.loot_table_id && lootTables && lootTables[p.loot_table_id]) ? lootTables[p.loot_table_id] : [];
            var rows = [];
            for (var i = 0; i < loot.length; i++) {
                var r = loot[i];
                rows.push({
                    item_id: r.item_id,
                    weight: r.weight,
                    quality_tier: r.quality_tier,
                    quality_tier_max: r.quality_tier_max != null ? r.quality_tier_max : 6
                });
            }
            instances[gid] = {
                instance_id: gid,
                map_entity_id: key,
                wild_interaction_category: 'gathering',
                display_name: p.display_name || key,
                base_gathering_success_rate: p.base_gathering_success_rate != null ? p.base_gathering_success_rate : 0.6,
                stamina_cost: p.stamina_cost != null ? p.stamina_cost : STAMINA_COST,
                tool_required: !!p.tool_required,
                loot_rows: rows
            };
        }
        return { defaults: defaults, instances: instances };
    }

    function setConfig(cfg) {
        if (cfg.gathering_points) config.gathering_points = cfg.gathering_points;
        if (cfg.loot_tables) config.loot_tables = cfg.loot_tables;
        if (cfg.items) config.items = cfg.items;

        var bundle = cfg.gathering_point_instances;
        if (bundle && typeof bundle === 'object' && bundle.instances && typeof bundle.instances === 'object' && Object.keys(bundle.instances).length > 0) {
            config.instanceDefaults = bundle.defaults && typeof bundle.defaults === 'object' ? bundle.defaults : {};
            config.instances = bundle.instances;
        } else {
            var syn = synthesizeInstancesFromLegacy(config.gathering_points, config.loot_tables);
            config.instanceDefaults = syn.defaults;
            config.instances = syn.instances;
        }
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

    /** 徒手采集熟练度计数 +delta，并写入调试日志（GameLog） */
    function addGatheringProficiencyDelta(delta) {
        var d = parseInt(delta, 10);
        if (!isFinite(d) || d <= 0) return;
        character.proficiency_count += d;
        var root = typeof window !== 'undefined' ? window : global;
        if (root && root.GameLog && root.UIText && typeof root.UIText.t === 'function') {
            root.GameLog.log(root.UIText.t('log.debug.proficiency.gathering', {
                delta: String(d),
                total: String(character.proficiency_count)
            }), 'system');
        }
    }

    function isInventoryFull() {
        var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
        if (g && g.InventoryEquipment && typeof g.InventoryEquipment.canAcceptItem === 'function') {
            return !g.InventoryEquipment.canAcceptItem();
        }
        return character.inventory.length >= MAX_INVENTORY_SLOTS;
    }

    function normalizeQualityTier(rawTier) {
        if (rawTier == null) return 0;
        var v = Number(rawTier);
        if (Number.isNaN(v)) return 0;
        if (v >= 1 && v <= 6) return Math.max(0, Math.min(5, v - 1));
        return Math.max(0, Math.min(5, v));
    }

    /** 行级品质上限：1～6 → 最大允许 internal tier（0～5）；缺省 6 = 传说 */
    function rowMaxQualityInternal(row) {
        if (!row || row.quality_tier_max == null) return 5;
        return normalizeQualityTier(row.quality_tier_max);
    }

    function resolveInstanceId(mapEntityId, instanceIdOpt) {
        if (instanceIdOpt && config.instances[instanceIdOpt]) return instanceIdOpt;
        if (mapEntityId && config.instanceDefaults[mapEntityId]) return config.instanceDefaults[mapEntityId];
        if (mapEntityId && config.instances[mapEntityId]) return mapEntityId;
        return null;
    }

    function resolveGatheringPoint(mapEntityId, instanceIdOpt) {
        var iid = resolveInstanceId(mapEntityId, instanceIdOpt);
        if (!iid || !config.instances[iid]) return null;
        var inst = config.instances[iid];
        if (inst.map_entity_id && mapEntityId && inst.map_entity_id !== mapEntityId) {
            /* 宽松：仍以实例为准，避免旧图错配直接失效 */
        }
        return inst;
    }

    function rollLootRow(lootTable) {
        if (!lootTable || lootTable.length === 0) return null;
        var total = 0;
        for (var i = 0; i < lootTable.length; i++) total += Number(lootTable[i].weight) || 0;
        if (total <= 0) return lootTable[0] || null;
        var r = Math.random() * total;
        for (var j = 0; j < lootTable.length; j++) {
            r -= Number(lootTable[j].weight) || 0;
            if (r <= 0) return lootTable[j];
        }
        return lootTable[lootTable.length - 1];
    }

    function tryQualityUpgrade(qualityTier) {
        qualityTier = normalizeQualityTier(qualityTier);
        if (qualityTier >= 5) return 5;
        var pct = getProficiencyPercent();
        var chance = Math.min(1, pct / 100);
        if (Math.random() < chance) return Math.min(5, qualityTier + 1);
        return qualityTier;
    }

    /**
     * @param {string} mapEntityId - 地图 entity_id（视觉/键）
     * @param {string} [gatheringInstanceId] - 可选实例 id
     */
    function doGather(mapEntityId, gatheringInstanceId) {
        var point = resolveGatheringPoint(mapEntityId, gatheringInstanceId);
        if (!point) return { success: false, message: '未知采集点' };

        var cat = point.wild_interaction_category || 'gathering';
        if (cat !== 'gathering') {
            return { success: false, message: '该资源需要「' + cat + '」类技能互动（当前仅开放徒手采集类）' };
        }

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

        var lootTable = point.loot_rows;
        if (!lootTable || lootTable.length === 0) {
            if (cat === 'gathering') addGatheringProficiencyDelta(1);
            return { success: true, message: '采集成功但无产出', consumedStamina: true };
        }

        var row = rollLootRow(lootTable);
        if (!row) {
            if (cat === 'gathering') addGatheringProficiencyDelta(1);
            return { success: true, message: '采集成功但无产出', consumedStamina: true };
        }

        var qualityTier = normalizeQualityTier(row.quality_tier);
        qualityTier = tryQualityUpgrade(qualityTier);
        var capInt = rowMaxQualityInternal(row);
        qualityTier = Math.min(qualityTier, capInt);

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
                if (cat === 'gathering') addGatheringProficiencyDelta(1);
                if (typeof global !== 'undefined' && global.Survival && typeof global.Survival.advanceTick === 'function') {
                    global.Survival.advanceTick();
                }
                return { success: true, message: '获得 ' + qualityName + ' ' + itemName + '（已掉落在脚下）', consumedStamina: true };
            }
        } else {
            character.inventory.push({ item_id: row.item_id, quality_tier: qualityTier });
        }
        if (cat === 'gathering') addGatheringProficiencyDelta(1);

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

    function canGather(mapEntityId, gatheringInstanceId) {
        var point = resolveGatheringPoint(mapEntityId, gatheringInstanceId);
        if (!point) return false;
        if ((point.wild_interaction_category || 'gathering') !== 'gathering') return false;
        var Surv = useSurvival() ? (typeof window !== 'undefined' ? window : global).Survival : null;
        if (Surv && !Surv.canPerformStaminaOrEnergyAction()) return false;
        var stamina = Surv ? Surv.getStamina() : character.stamina;
        var cost = point.stamina_cost != null ? point.stamina_cost : STAMINA_COST;
        if (stamina < cost) return false;
        if (isInventoryFull()) return false;
        return true;
    }

    global.Gathering = {
        GATHERING_MAX_PROFICIENCY: GATHERING_MAX_PROFICIENCY,
        QUALITY_NAMES: QUALITY_NAMES,
        MAX_INVENTORY_SLOTS: MAX_INVENTORY_SLOTS,
        setConfig: setConfig,
        getCharacterState: getCharacterState,
        setCharacterState: setCharacterState,
        getProficiencyPercent: getProficiencyPercent,
        resolveGatheringPoint: resolveGatheringPoint,
        resolveInstanceId: resolveInstanceId,
        getGatheringPointConfig: function (entityId) {
            return config.gathering_points[entityId] || null;
        },
        isInventoryFull: isInventoryFull,
        canGather: canGather,
        doGather: doGather
    };
})(typeof window !== 'undefined' ? window : this);

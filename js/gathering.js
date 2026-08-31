/**
 * 采集系统 — 设计见 docs/design/11-skills.md 8.2.2 + gathering_point_instances
 * 地图格 entity_id 为视觉键；可选 gathering_instance_id 引用 data/gathering_point_instances.json 中的实例。
 * 不枯竭；每行 loot 为 item_id + weight；行可选 rare_weight（100% 熟练度时稀有行的权重倍率加成）。
 */
(function (global) {
    'use strict';

    var GATHERING_MAX_PROFICIENCY = 5000000;
    var STAMINA_COST = 2;
    var MAX_INVENTORY_SLOTS = 30;
    function t(key, vars) {
        if (global && global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key, vars);
        return key;
    }

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

    function isGatherActionDisabled() {
        var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
        if (!g || !g.BuffSystem || typeof g.BuffSystem.hasActionDisabled !== 'function') return false;
        return !!g.BuffSystem.hasActionDisabled('player', 'gather');
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
                    rare_weight: r.rare_weight != null ? Number(r.rare_weight) : 0
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

    /**
     * 按权重抽取一行；行可选 rare_weight（0～∞）：熟练度 P% 时该行权重 ×（1 + P/100 × rare_weight），
     * 实现「熟练度提高稀有物品行权重」（设计 11-skills 8.2.2 步骤 3）。
     */
    function rollLootRow(lootTable, proficiencyPct) {
        if (!lootTable || lootTable.length === 0) return null;
        var pct = Math.max(0, Math.min(100, Number(proficiencyPct) || 0));
        var total = 0;
        var weights = [];
        for (var i = 0; i < lootTable.length; i++) {
            var w = Number(lootTable[i].weight) || 0;
            var rw = Number(lootTable[i].rare_weight) || 0;
            var eff = w * (1 + (pct / 100) * rw);
            weights.push(eff);
            total += eff;
        }
        if (total <= 0) return lootTable[0] || null;
        var r = Math.random() * total;
        for (var j = 0; j < lootTable.length; j++) {
            r -= weights[j];
            if (r <= 0) return lootTable[j];
        }
        return lootTable[lootTable.length - 1];
    }

    /**
     * @param {string} mapEntityId - 地图 entity_id（视觉/键）
     * @param {string} [gatheringInstanceId] - 可选实例 id
     */
    function doGather(mapEntityId, gatheringInstanceId) {
        if (isGatherActionDisabled()) return { success: false, message: t('gathering.msg.action_disabled') };
        var point = resolveGatheringPoint(mapEntityId, gatheringInstanceId);
        if (!point) return { success: false, message: t('gathering.msg.unknown_point') };

        var cat = point.wild_interaction_category || 'gathering';
        if (cat !== 'gathering') {
            return { success: false, message: t('gathering.msg.need_skill', { skill: cat }) };
        }

        var Surv = useSurvival() ? (typeof window !== 'undefined' ? window : global).Survival : null;
        if (Surv && !Surv.canPerformStaminaOrEnergyAction()) {
            return { success: false, message: t('gathering.msg.low_stamina_full') };
        }
        var staminaNow = Surv ? Surv.getStamina() : character.stamina;
        var cost = point.stamina_cost != null ? point.stamina_cost : STAMINA_COST;
        if (staminaNow < cost) return { success: false, message: t('gathering.msg.no_stamina') };
        if (isInventoryFull()) return { success: false, message: t('gathering.msg.inventory_full') };

        var base = point.base_gathering_success_rate != null ? point.base_gathering_success_rate : 0.6;
        var proficiencyPct = getProficiencyPercent();
        var successRate = base + base * (proficiencyPct * 0.003);
        successRate = Math.min(1, successRate);

        if (Surv) Surv.consumeStamina(cost); else { character.stamina -= cost; if (character.stamina < 0) character.stamina = 0; }

        var roll = Math.random();
        if (roll >= successRate) {
            return { success: false, message: t('gathering.msg.fail'), consumedStamina: true };
        }

        var lootTable = point.loot_rows;
        if (!lootTable || lootTable.length === 0) {
            if (cat === 'gathering') addGatheringProficiencyDelta(1);
            return { success: true, message: t('gathering.msg.no_output'), consumedStamina: true };
        }

        var row = rollLootRow(lootTable, getProficiencyPercent());
        if (!row) {
            if (cat === 'gathering') addGatheringProficiencyDelta(1);
            return { success: true, message: t('gathering.msg.no_output'), consumedStamina: true };
        }

        var itemDef = config.items[row.item_id];
        var itemName = itemDef && itemDef.name ? itemDef.name : row.item_id;
        var gIE = typeof window !== 'undefined' ? window.InventoryEquipment : null;
        if (gIE && typeof gIE.getItemTemplate === 'function' && typeof gIE.getDisplayName === 'function') {
            var tplG = gIE.getItemTemplate(row.item_id);
            if (tplG) {
                var chG = gIE.getCharacterForDisplay ? gIE.getCharacterForDisplay() : null;
                var tierG = gIE.getItemDisplayTier ? gIE.getItemDisplayTier(row.item_id, chG) : 0;
                itemName = gIE.getDisplayName(tplG, tierG, chG);
            }
        }
        var g = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null);
        if (g && g.InventoryEquipment && typeof g.InventoryEquipment.putItemIntoDefaultContainer === 'function') {
            var itemInstance = { item_id: row.item_id, count: 1 };
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
                return { success: true, message: t('gathering.msg.dropped', { item: itemName }), consumedStamina: true };
            }
        } else {
            character.inventory.push({ item_id: row.item_id });
        }
        if (cat === 'gathering') addGatheringProficiencyDelta(1);

        if (Surv && typeof Surv.advanceTick === 'function') Surv.advanceTick();
        return {
            success: true,
            gathered: {
                item_id: row.item_id,
                item_name: itemName
            },
            message: t('gathering.msg.got', { item: itemName }),
            consumedStamina: true
        };
    }

    function canGather(mapEntityId, gatheringInstanceId) {
        if (isGatherActionDisabled()) return false;
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

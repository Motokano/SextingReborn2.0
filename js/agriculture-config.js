(function (global) {

    'use strict';



    var buildTable = null;

    var itemParamsTable = null;

    var poolUpgradesTable = null;



    function normalizeInputs(raw) {

        if (!Array.isArray(raw)) return [];

        var out = [];

        var i;

        for (i = 0; i < raw.length; i++) {

            var row = raw[i];

            if (!row || !row.item_id) continue;

            var count = Math.max(1, Math.floor(Number(row.count) || 0));

            if (count < 1) continue;

            out.push({ item_id: String(row.item_id).trim(), count: count });

        }

        return out;

    }



    function normalizeTaskSpec(spec, defaults) {

        var def = defaults && typeof defaults === 'object' ? defaults : {};

        var src = spec && typeof spec === 'object' ? spec : {};

        return {

            inputs: normalizeInputs(src.inputs),

            task_ticks: Math.max(1, Math.floor(Number(src.task_ticks != null ? src.task_ticks : def.task_ticks) || 10)),

            stamina_per_tick: Math.max(0, Number(src.stamina_per_tick != null ? src.stamina_per_tick : def.stamina_per_tick) || 5),

            refund_inputs_on_cancel: src.refund_inputs_on_cancel === true,

            label_key: src.label_key ? String(src.label_key) : ''

        };

    }



    function findUpgradeStep(block, fromLevel) {

        if (!block || !Array.isArray(block.steps)) return null;

        var lv = Math.max(1, Math.floor(Number(fromLevel) || 1));

        var i;

        for (i = 0; i < block.steps.length; i++) {

            var step = block.steps[i];

            if (Math.floor(Number(step.from_level) || 0) === lv) {

                return step;

            }

        }

        return null;

    }



    function setTables(buildCostsJson, itemParamsJson, poolUpgradesJson) {

        buildTable = buildCostsJson && typeof buildCostsJson === 'object' ? buildCostsJson : null;

        itemParamsTable = itemParamsJson && typeof itemParamsJson === 'object' ? itemParamsJson : null;

        poolUpgradesTable = poolUpgradesJson && typeof poolUpgradesJson === 'object' ? poolUpgradesJson : null;

    }



    function getTaskDefaults() {

        var def = buildTable && buildTable.task_defaults ? buildTable.task_defaults : {};

        return {

            task_ticks: Math.max(1, Math.floor(Number(def.task_ticks) || 10)),

            stamina_per_tick: Math.max(0, Number(def.stamina_per_tick) || 5)

        };

    }



    function getBuildSpec(buildId) {

        var id = String(buildId || '').trim();

        if (!id || !buildTable || !buildTable.builds || !buildTable.builds[id]) return null;

        return normalizeTaskSpec(buildTable.builds[id], getTaskDefaults());

    }



    function getVenturiUpgradeSpec(fromLevel) {

        var block = buildTable && buildTable.upgrades ? buildTable.upgrades.venturi_fertilizer_level : null;

        var step = findUpgradeStep(block, fromLevel);

        return step ? normalizeTaskSpec(step, getTaskDefaults()) : null;

    }



    function getVenturiMaxLevel() {

        var block = buildTable && buildTable.upgrades ? buildTable.upgrades.venturi_fertilizer_level : null;

        return Math.max(1, Math.floor(Number(block && block.max_level) || 3));

    }



    function getPoolUpgradeSpec(fromLevel) {

        var block = buildTable && buildTable.upgrades ? buildTable.upgrades.pool_level : null;

        var step = findUpgradeStep(block, fromLevel);

        return step ? normalizeTaskSpec(step, getTaskDefaults()) : null;

    }



    function getPoolMaxLevel() {

        var block = buildTable && buildTable.upgrades ? buildTable.upgrades.pool_level : null;

        if (block && block.max_level != null) {

            return Math.max(1, Math.floor(Number(block.max_level) || 4));

        }

        if (poolUpgradesTable && poolUpgradesTable.levels && typeof poolUpgradesTable.levels === 'object') {

            var maxLv = 1;

            var k;

            for (k in poolUpgradesTable.levels) {

                if (!Object.prototype.hasOwnProperty.call(poolUpgradesTable.levels, k)) continue;

                var n = Math.floor(Number(k) || 0);

                if (n > maxLv) maxLv = n;

            }

            return maxLv;

        }

        return 4;

    }



    function getItemTemplate(itemId) {

        var IE = global.InventoryEquipment;

        if (!IE || typeof IE.getItemTemplate !== 'function') return null;

        return IE.getItemTemplate(itemId);

    }



    function getInjectableParams(itemId) {

        var id = String(itemId || '').trim();

        if (!id) return null;

        var tpl = getItemTemplate(id);

        var fb = itemParamsTable && itemParamsTable.injectables ? itemParamsTable.injectables[id] : null;

        var injectFacility = (tpl && tpl.inject_facility) || (fb && fb.inject_facility) || '';

        var out = {

            item_id: id,

            inject_facility: String(injectFacility || '').trim(),

            agriculture_venturi_injectable: !!(tpl && tpl.agriculture_venturi_injectable) || !!(fb && fb.agriculture_venturi_injectable),

            agriculture_buried_jar_injectable: !!(tpl && tpl.agriculture_buried_jar_injectable) || !!(fb && fb.agriculture_buried_jar_injectable),

            agriculture_fertilizer_per_tick: null,

            agriculture_venturi_effect_duration_ticks: null,

            is_anaerobic_fertilizer: !!(tpl && tpl.is_anaerobic_fertilizer) || !!(fb && fb.is_anaerobic_fertilizer)

        };

        if (tpl && tpl.agriculture_fertilizer_per_tick != null) {

            out.agriculture_fertilizer_per_tick = Number(tpl.agriculture_fertilizer_per_tick);

        } else if (fb && fb.agriculture_fertilizer_per_tick != null) {

            out.agriculture_fertilizer_per_tick = Number(fb.agriculture_fertilizer_per_tick);

        }

        if (tpl && tpl.agriculture_venturi_effect_duration_ticks != null) {

            out.agriculture_venturi_effect_duration_ticks = Math.max(1, Math.floor(Number(tpl.agriculture_venturi_effect_duration_ticks)));

        } else if (fb && fb.agriculture_venturi_effect_duration_ticks != null) {

            out.agriculture_venturi_effect_duration_ticks = Math.max(1, Math.floor(Number(fb.agriculture_venturi_effect_duration_ticks)));

        }

        return out;

    }



    function getGrantsSoilId(itemId) {

        var id = String(itemId || '').trim();

        if (!id) return '';

        var tpl = getItemTemplate(id);

        if (tpl && tpl.grants_soil_id) return String(tpl.grants_soil_id).trim();

        var map = itemParamsTable && itemParamsTable.soil_amend_fallback;

        if (map && map[id]) return String(map[id]).trim();

        return '';

    }



    global.AgricultureConfig = {

        setTables: setTables,

        getTaskDefaults: getTaskDefaults,

        getBuildSpec: getBuildSpec,

        getVenturiUpgradeSpec: getVenturiUpgradeSpec,

        getVenturiMaxLevel: getVenturiMaxLevel,

        getPoolUpgradeSpec: getPoolUpgradeSpec,

        getPoolMaxLevel: getPoolMaxLevel,

        getInjectableParams: getInjectableParams,

        getGrantsSoilId: getGrantsSoilId

    };

})(typeof window !== 'undefined' ? window : global);


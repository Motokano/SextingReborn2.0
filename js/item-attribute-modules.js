/**
 * Formal runtime adapter for the modular item catalogue (design 63 / k278).
 * Source data stays nested; legacy fields are projected into an in-memory view
 * while existing gameplay consumers are migrated to getTemplateValue/getInstanceValue.
 */
(function (global) {
    'use strict';
    var SCHEMA_VERSION = 2;
    var categories = ['base', 'food', 'production', 'medicine', 'equipment', 'structure', 'energy', 'organism'];
    var fieldPaths = {};
    var definitions = {
        base: { identity: ['name','name_0','name_1','name_2','sn','placeholder_name','fn_before','fn','desc','desc_0','desc_1','desc_2','display_skill_id'], stacking: ['stack_limit','stack_max','pocketable'], trade: ['base_value','price_class','volatility','region_restrict'], currency: ['accept_code','convert_to_high','usable_regions'], spoilage: ['spoilage_ticks'], presentation: ['info_module_set_id'], provenance: ['source','production_lines'] },
        food: { edible: ['edible','edible_buff_id','food_profile','meal_tier','satiety_total','digestion_ticks','food_buff_duration_ticks','meal_composition','workhorse','food_thirst_instant','food_special_ticks','food_composition_text','food_experience_text','food_special_text'], packing: ['slots_taken'] },
        production: { cooking: ['cooking_ingredient'], fuel: ['fuel_points'], water: ['water_points'], pharmacy: ['pharmacy_ingredient','chem_class','pharm_family','pharm_effect','pharm_toxicity','concentration_cost','adjuvant_strength','pharmacy_active_components'], compost: ['fert_c','fert_n','compost_inoculant_aerobic','compost_inoculant_anaerobic'], fertilizer: ['inject_facility','agriculture_venturi_injectable','agriculture_buried_jar_injectable','agriculture_nutrient_per_bottle','is_anaerobic_fertilizer'], soil: ['grants_soil_id'], seed: ['harvest_item_id','seed_tier'] },
        medicine: { use: ['usable','use_action','use_buff_id','use_charges','use_effect'], compound: ['pharmacy_compound','concentration_capacity'], effects: ['pharmacy_addiction_gain','pharmacy_relief_stages','pharmacy_oral_toxicity','pharmacy_extra_toxicity_decay','pharmacy_legacy'] },
        equipment: { wearable: ['equip_slot','req_innate_jingu'], combat: ['weapon_attack_power','attack_power','skill_coef','form_coefs','limb_tags','parry_coef','speed_coef','move_cost_mod','damage_type_effects'], fishing_tackle: ['fishing_load_rating','fishing_length_dm','fishing_cast_range_dm'], armor: ['damage_reduce_blunt_pct','damage_reduce_pierce_pct','damage_reduce_slash_pct','base_shield'], effects: ['activation_cost_pct','effects','segments','special','special_effect'], enchantment: ['enchant_slot','enchant_slots'] },
        structure: { storage: ['pocket_slots','vest_slots','backpack_slots','backpack_weight_factor'], host: ['module_slots'], attachment: ['install_slots','occupies','max_per_armor'], assembly_host: ['assembly_slots'], assembly_part: ['assembly_types'] },
        energy: { storage: ['battery_capacity','battery_charge'] }, organism: {}
    };
    Object.keys(definitions).forEach(function (category) {
        Object.keys(definitions[category]).forEach(function (group) {
            definitions[category][group].forEach(function (field) {
                if (fieldPaths[field]) throw new Error('[ItemAttributeModules] duplicate field owner: ' + field);
                fieldPaths[field] = [category, group, field];
            });
        });
    });
    function own(o, key) { return !!o && Object.prototype.hasOwnProperty.call(o, key); }
    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }
    function getNested(obj, path) {
        var cur = obj;
        for (var i = 0; i < path.length; i++) {
            if (!cur || typeof cur !== 'object' || !own(cur, path[i])) return undefined;
            cur = cur[path[i]];
        }
        return cur;
    }
    function getModule(template, category) {
        if (!template || !template.attribute_modules || categories.indexOf(category) < 0) return null;
        var value = template.attribute_modules[category];
        return value && typeof value === 'object' ? value : null;
    }
    function hasGroup(template, category, group) {
        var module = getModule(template, category);
        return !!(module && own(module, group) && module[group] && typeof module[group] === 'object');
    }
    function getTemplateValue(template, fieldOrPath) {
        if (!template) return undefined;
        var field = String(fieldOrPath || '');
        var mapped = fieldPaths[field];
        if (mapped) {
            var value = getNested(template.attribute_modules, mapped);
            if (value !== undefined) return value;
        }
        if (field.indexOf('.') >= 0) return getNested(template, field.split('.'));
        return own(template, field) ? template[field] : undefined;
    }
    function getInstanceValue(instance, template, field) {
        if (field === 'battery_charge') {
            var charge = getNested(instance, ['attribute_state','energy','storage','charge']);
            if (charge !== undefined) return charge;
        }
        if (field === 'spoilage_elapsed_ticks') {
            var elapsed = getNested(instance, ['attribute_state','base','spoilage','elapsed_ticks']);
            if (elapsed !== undefined) return elapsed;
        }
        if (instance && own(instance, field)) return instance[field];
        if (instance && String(field || '').indexOf('.') >= 0) {
            var nested = getNested(instance, String(field).split('.'));
            if (nested !== undefined) return nested;
        }
        return getTemplateValue(template, field);
    }
    function hydrateTemplate(item) {
        if (!item || typeof item !== 'object') return null;
        if (!item.attribute_modules) return item;
        var out = {};
        Object.keys(item).forEach(function (key) { if (key !== 'editor_name') out[key] = deepClone(item[key]); });
        Object.keys(item.attribute_modules).forEach(function (category) {
            var groups = item.attribute_modules[category];
            if (!groups || typeof groups !== 'object') return;
            Object.keys(groups).forEach(function (group) {
                var values = groups[group];
                if (!values || typeof values !== 'object') return;
                Object.keys(values).forEach(function (field) { out[field] = deepClone(values[field]); });
            });
        });
        return out;
    }
    function hydrateCatalog(raw) {
        if (!raw || typeof raw !== 'object') return {};
        var source = raw.items && Number(raw.schema_version) === SCHEMA_VERSION ? raw.items : raw;
        var out = {};
        Object.keys(source).forEach(function (id) {
            if (id.charAt(0) === '_') return;
            var item = hydrateTemplate(source[id]);
            if (item) out[id] = item;
        });
        return out;
    }
    function ensureStatePath(instance, category, group) {
        if (!instance.attribute_state || typeof instance.attribute_state !== 'object') instance.attribute_state = {};
        if (!instance.attribute_state[category] || typeof instance.attribute_state[category] !== 'object') instance.attribute_state[category] = {};
        if (!instance.attribute_state[category][group] || typeof instance.attribute_state[category][group] !== 'object') instance.attribute_state[category][group] = {};
        return instance.attribute_state[category][group];
    }
    function normalizeInstance(instance, template) {
        if (!instance || typeof instance !== 'object') return instance;
        var out = deepClone(instance);
        if (template && hasGroup(template, 'energy', 'storage')) {
            var energy = ensureStatePath(out, 'energy', 'storage');
            if (!own(energy, 'charge')) {
                var legacyCharge = own(out, 'battery_charge') ? Number(out.battery_charge) : Number(getTemplateValue(template, 'battery_charge'));
                var capacity = Math.max(0, Math.floor(Number(getTemplateValue(template, 'battery_capacity')) || 0));
                energy.charge = Math.max(0, Math.min(capacity, Math.floor(isFinite(legacyCharge) ? legacyCharge : capacity)));
            }
            out.battery_charge = energy.charge;
        }
        if (template && hasGroup(template, 'base', 'spoilage')) {
            var spoilage = ensureStatePath(out, 'base', 'spoilage');
            if (own(out, 'spoilage_elapsed_ticks')) spoilage.elapsed_ticks = Math.max(0, Math.floor(Number(out.spoilage_elapsed_ticks) || 0));
            else if (!own(spoilage, 'elapsed_ticks')) spoilage.elapsed_ticks = 0;
            out.spoilage_elapsed_ticks = spoilage.elapsed_ticks;
        }
        if (out.attribute_state && !Object.keys(out.attribute_state).length) delete out.attribute_state;
        return out;
    }
    function setInstanceValue(instance, template, field, value) {
        if (!instance || typeof instance !== 'object') return false;
        if (field === 'battery_charge' && template && hasGroup(template, 'energy', 'storage')) {
            var energy = ensureStatePath(instance, 'energy', 'storage');
            var capacity = Math.max(0, Math.floor(Number(getTemplateValue(template, 'battery_capacity')) || 0));
            energy.charge = Math.max(0, Math.min(capacity, Math.floor(Number(value) || 0)));
            instance.battery_charge = energy.charge;
            return true;
        }
        if (field === 'spoilage_elapsed_ticks' && template && hasGroup(template, 'base', 'spoilage')) {
            var spoilage = ensureStatePath(instance, 'base', 'spoilage');
            spoilage.elapsed_ticks = Math.max(0, Math.floor(Number(value) || 0));
            instance.spoilage_elapsed_ticks = spoilage.elapsed_ticks;
            return true;
        }
        if (String(field || '').indexOf('.') >= 0) {
            var parts = String(field).split('.');
            var target = instance;
            for (var i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
                target = target[parts[i]];
            }
            target[parts[parts.length - 1]] = deepClone(value);
            return true;
        }
        instance[field] = deepClone(value);
        return true;
    }
    global.ItemAttributeModules = {
        SCHEMA_VERSION: SCHEMA_VERSION,
        getDefinitions: function () { return deepClone(definitions); },
        getFieldPath: function (field) { return fieldPaths[field] ? fieldPaths[field].slice() : null; },
        getModule: getModule,
        hasGroup: hasGroup,
        getTemplateValue: getTemplateValue,
        getInstanceValue: getInstanceValue,
        hydrateTemplate: hydrateTemplate,
        hydrateCatalog: hydrateCatalog,
        normalizeInstance: normalizeInstance,
        setInstanceValue: setInstanceValue,
        deepClone: deepClone
    };
})(typeof window !== 'undefined' ? window : globalThis);

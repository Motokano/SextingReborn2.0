/**
 * SceneConfig — 场景配置加载与默认数据.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var G = window.Gathering;
    var IE = window.InventoryEquipment;
    var defaultGatheringPoints, defaultLootTables, defaultItems;

    function parseCookingSystemConfigCsv(text) {
        var out = {
            cooking_global_failure_item_id: 'food_cooking_fail_generic',
            cooking_temp_station_lifetime_ticks: 50
        };
        if (!text || typeof text !== 'string') return out;
        var lines = text.split(/\r?\n/);
        var li;
        for (li = 0; li < lines.length; li++) {
            var line = String(lines[li] || '').trim();
            if (!line || line.indexOf('#') === 0) continue;
            var comma = line.indexOf(',');
            if (comma < 0) continue;
            var key = line.slice(0, comma).trim();
            var rest = line.slice(comma + 1);
            var comma2 = rest.indexOf(',');
            var val = (comma2 >= 0 ? rest.slice(0, comma2) : rest).trim();
            if (key === 'cooking_global_failure_item_id' && val) out.cooking_global_failure_item_id = val;
            if (key === 'cooking_temp_station_lifetime_ticks') {
                var life = Math.max(1, Math.floor(Number(val) || 0));
                if (life > 0) out.cooking_temp_station_lifetime_ticks = life;
            }
        }
        return out;
    }

    function parseCompostEventActionsCsv(text) {
        var map = {};
        if (!text || typeof text !== 'string') return map;
        var lines = text.split(/\r?\n/);
        if (!lines.length) return map;
        var headers = String(lines[0] || '').split(',');
        var idIdx = headers.indexOf('action_id');
        var displayIdx = headers.indexOf('display');
        if (displayIdx < 0) displayIdx = headers.indexOf('display_name');
        if (idIdx < 0 || displayIdx < 0) return map;
        for (var i = 1; i < lines.length; i++) {
            var line = String(lines[i] || '').trim();
            if (!line) continue;
            var cells = line.split(',');
            var id = String(cells[idIdx] || '').trim();
            var display = String(cells[displayIdx] || '').trim();
            if (!id || !display) continue;
            map[id] = display;
        }
        return map;
    }

    function loadConfig() {
        var base = 'data/';
        return Promise.all([
            fetch(base + 'ui_text_zhCN.json').then(function (r) { return r.ok ? r.json() : null; }),
            fetch(base + 'gathering_points.json').then(function (r) { return r.ok ? r.json() : defaultGatheringPoints; }).catch(function () { return defaultGatheringPoints; }),
            fetch(base + 'loot_tables.json').then(function (r) { return r.ok ? r.json() : defaultLootTables; }).catch(function () { return defaultLootTables; }),
            fetch(base + 'item-catalog-v2.json').then(function (r) {
                if (r.ok) return r.json();
                return fetch(base + 'items.json').then(function (legacy) { return legacy.ok ? legacy.json() : defaultItems; });
            }).catch(function () { return defaultItems; }),
            fetch(base + 'survival-config.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'equipment-catalog-v2.json').then(function (r) {
                if (r.ok) return r.json();
                return fetch(base + 'equipment.json').then(function (legacy) { return legacy.ok ? legacy.json() : {}; });
            }).catch(function () { return {}; }),
            fetch(base + 'enchant.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'default_equipment.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'combat-skills.json').then(function (r) { return r.ok ? r.json() : { constants: {}, categories: [], skills: {} }; }).catch(function () { return { constants: {}, categories: [], skills: {} }; }),
            fetch(base + 'combat-pipeline.json').then(function (r) { return r.ok ? r.json() : { pipelines: {} }; }).catch(function () { return { pipelines: {} }; }),
            fetch(base + 'move-variants.json').then(function (r) { return r.ok ? r.json() : { variants: {} }; }).catch(function () { return { variants: {} }; }),
            fetch(base + 'post-effects.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'survival-skills.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'gathering_point_instances.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'combat-enemies.json').then(function (r) { return r.ok ? r.json() : { enemies: {} }; }).catch(function () { return { enemies: {} }; }),
            fetch(base + 'cooking-methods.json').then(function (r) { return r.ok ? r.json() : { methods: {} }; }).catch(function () { return { methods: {} }; }),
            fetch(base + 'cooking-recipes.json').then(function (r) { return r.ok ? r.json() : { recipes: [] }; }).catch(function () { return { recipes: [] }; }),
            fetch(base + 'cooking-system-config.csv').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
            fetch(base + 'recipes.json').then(function (r) { return r.ok ? r.json() : { recipes: {} }; }).catch(function () { return { recipes: {} }; }),
            fetch(base + 'recipe-methods.json').then(function (r) { return r.ok ? r.json() : { methods: {} }; }).catch(function () { return { methods: {} }; }),
            fetch(base + 'life-skill-recipe-interfaces.json').then(function (r) { return r.ok ? r.json() : { interfaces: {} }; }).catch(function () { return { interfaces: {} }; }),
            fetch(base + 'item-info-modules.json').then(function (r) { return r.ok ? r.json() : { module_sets: {} }; }).catch(function () { return { module_sets: {} }; }),
            fetch(base + 'item-field-display-rules.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'compost-events.json').then(function (r) { return r.ok ? r.json() : { events: {} }; }).catch(function () { return { events: {} }; }),
            fetch(base + 'compost-event-actions.csv').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
            fetch(base + 'agriculture-build-costs.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'agriculture-item-params.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'agriculture-crop-defs.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'agriculture-soils.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'agriculture-pool-upgrades.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'warehouse-upgrades.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'livestock-species.json').then(function (r) { return r.ok ? r.json() : { species: {} }; }).catch(function () { return { species: {} }; }),
            fetch(base + 'livestock-modules.json').then(function (r) { return r.ok ? r.json() : { modules: {} }; }).catch(function () { return { modules: {} }; }),
            fetch(base + 'livestock-perks.json').then(function (r) { return r.ok ? r.json() : { perks: {} }; }).catch(function () { return { perks: {} }; }),
            fetch(base + 'livestock-build-costs.json').then(function (r) { return r.ok ? r.json() : { costs: {} }; }).catch(function () { return { costs: {} }; }),
            fetch(base + 'livestock-feed-crops.json').then(function (r) { return r.ok ? r.json() : { crops: {} }; }).catch(function () { return { crops: {} }; }),
            fetch(base + 'attachment-catalog-v2.json').then(function (r) {
                if (r.ok) return r.json();
                return fetch(base + 'modules.json').then(function (legacy) { return legacy.ok ? legacy.json() : {}; });
            }).catch(function () { return {}; }),
            fetch(base + 'enemy_drops.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'pharmacy-system-config.csv').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
            fetch(base + 'pharmacy-conflict-rules.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'hunting.json').then(function (r) { if (!r.ok) throw new Error('hunting config unavailable'); return r.json(); }),
            fetch(base + 'fishing-session-config.json').then(function (r) { if (!r.ok) throw new Error('fishing session config unavailable'); return r.json(); }),
            Promise.all(['fishing-pond.json','fishing-facts.json','fishing-feedback.json'].map(function(file){return fetch(base+file).then(function(r){if(!r.ok)throw new Error(file+' unavailable');return r.json();});})).then(function(parts){parts[0].fact_rules=parts[1];parts[0].feedback_rules=parts[2];return parts[0];}),
            fetch(base + 'weather-config.json').then(function(r){if(!r.ok)throw new Error('weather config unavailable');return r.json();})
        ]).then(function (arr) {
            window.Weather.configure(arr.pop());
            window.Weather.subscribe(function(text){ window.SceneFeedback.showMsg(text, 'info'); });
            if (!arr[0]) throw new Error('[SceneApp] ui_text_zhCN.json missing');
            if (!window.UIText || typeof window.UIText.setDict !== 'function') throw new Error('[SceneApp] UIText module missing');
            window.UIText.setDict(arr[0]);
            window.UIText.applyDom(document);
            if (window.HuntingPanel) window.HuntingPanel.configure(arr[arr.length - 3]);
            if (window.FishingSession) window.FishingSession.configure(arr[arr.length - 2]);
            if (window.FishingPanel) window.FishingPanel.configure(arr[arr.length - 1]);
            var runtimeItems = (window.ItemAttributeModules && typeof window.ItemAttributeModules.hydrateCatalog === 'function')
                ? window.ItemAttributeModules.hydrateCatalog(arr[3])
                : ((arr[3] && arr[3].items && typeof arr[3].items === 'object') ? arr[3].items : arr[3]);
            if (window.ForgingConfig) Object.assign(runtimeItems, window.ItemAttributeModules.hydrateCatalog(window.ForgingConfig.catalog));
            G.setConfig({
                gathering_points: arr[1],
                loot_tables: arr[2],
                items: runtimeItems,
                gathering_point_instances: arr[13] || null
            });
            if (window.Survival) window.Survival.setConfig(arr[4]);
            var survCfg = arr[4] || {};
            var idleSec = Number(survCfg.idle_seconds_per_tick);
            if (isFinite(idleSec) && idleSec > 0) {
                window.PlayerActions.idleTickMs = Math.max(200, Math.round(idleSec * 1000));
            } else {
                window.PlayerActions.idleTickMs = 3000;
            }
            if (window.ProductionQuality && typeof window.ProductionQuality.setConfig === 'function') {
                window.ProductionQuality.setConfig(survCfg);
            }
            var starterEquipFallback = {
                head: 'eq_head_leather_helm',
                clothing: 'eq_clothing_combat_suit',
                vest: 'eq_vest_hoodie',
                shoe_left: 'eq_shoe_left_sport',
                shoe_right: 'eq_shoe_right_sport'
            };
            if (window.CombatSkills && arr[8]) window.CombatSkills.setConfig(arr[8]);
            if (window.CombatPipeline && arr[9]) window.CombatPipeline.setConfig(arr[9]);
            if (window.CombatVariants && arr[10]) window.CombatVariants.setTable(arr[10]);
            if (window.PostEffects && arr[11]) window.PostEffects.setTable(arr[11]);
            if (window.SurvivalSkills && typeof window.SurvivalSkills.setTable === 'function' && arr[12]) {
                window.SurvivalSkills.setTable(arr[12]);
            }
            if (window.CombatEnemies && arr[14]) window.CombatEnemies.setTable(arr[14]);
            if (window.EnemyDrops && typeof window.EnemyDrops.setConfig === 'function') {
                window.EnemyDrops.setConfig(arr[37] || null);
            }
            var cookCfgParsed = parseCookingSystemConfigCsv(arr[17] != null ? String(arr[17]) : '');
            // 站点配置所有权 → CookingStation / PharmacyStation（P1b-1）；读取侧改走模块 getter
            if (window.CookingStation && typeof window.CookingStation.setConfig === 'function') {
                window.CookingStation.setConfig({
                    methods: (arr[15] && arr[15].methods && typeof arr[15].methods === 'object') ? arr[15].methods : {},
                    recipes: (arr[16] && Array.isArray(arr[16].recipes)) ? arr[16].recipes : [],
                    failureItemId: cookCfgParsed.cooking_global_failure_item_id || 'food_cooking_fail_generic',
                    tempStationLifetimeTicks: Math.max(1, Math.floor(Number(cookCfgParsed.cooking_temp_station_lifetime_ticks) || 50))
                });
            }
            if (window.PharmacyStation && typeof window.PharmacyStation.setConfig === 'function') {
                // 制药全局配置（data/pharmacy-system-config.csv，47 §1.1②）：失败物 id + 熟练度曲线 + ❓数值占位。
                var pharmacyCfgParsed = (window.PharmacyConfig && typeof window.PharmacyConfig.parseCsv === 'function')
                    ? window.PharmacyConfig.parseCsv(arr[38] != null ? String(arr[38]) : '')
                    : null;
                window.PharmacyStation.setConfig({
                    methods: (arr[19] && arr[19].methods && typeof arr[19].methods === 'object') ? arr[19].methods : {},
                    recipes: (arr[18] && arr[18].recipes && typeof arr[18].recipes === 'object') ? Object.keys(arr[18].recipes).map(function (k) { return arr[18].recipes[k]; }) : [],
                    systemConfig: pharmacyCfgParsed,
                    failureItemId: pharmacyCfgParsed && pharmacyCfgParsed.pharmacy_global_failure_item_id
                        ? String(pharmacyCfgParsed.pharmacy_global_failure_item_id)
                        : undefined
                });
                // 药物负担/毒性运行时（47 §4/§9.2，k242/k240）：配置同源，状态落 SceneCtx.pharmacy_effects。
                if (window.PharmacyEffects && typeof window.PharmacyEffects.setConfig === 'function') {
                    window.PharmacyEffects.setConfig(pharmacyCfgParsed || (window.PharmacyStation.getSystemConfig ? window.PharmacyStation.getSystemConfig() : null));
                    // 配药模式规则（47 §9，k231）：浓度预算 / 净药效 / 净毒性 / 相冲表
                    if (window.PharmacyCompounding && typeof window.PharmacyCompounding.setConfig === 'function') {
                        window.PharmacyCompounding.setConfig(pharmacyCfgParsed, arr[39] || null);
                    }
                    // 入体药 buff 进出 → 即时刷新 §4.4 压制判定（断药/只剩低档立刻显形）
                    if (window.BuffSystem && typeof window.BuffSystem.setBuffStateListener === 'function') {
                        window.BuffSystem.setBuffStateListener(function (ownerId) {
                            window.PharmacyEffects.onBuffStateChanged(ownerId);
                        });
                    }
                }
            }
            if (window.RecipeSchema && typeof window.RecipeSchema.validateRecipeTables === 'function') {
                try {
                    var schemaReport = window.RecipeSchema.validateRecipeTables(arr[18], arr[19], arr[20], {});
                    if (window.SceneCtx) window.SceneCtx.recipe_schema_validation_report = schemaReport || { errors: [], warnings: [] };
                    var schemaErrors = (schemaReport && Array.isArray(schemaReport.errors)) ? schemaReport.errors : [];
                    var schemaWarnings = (schemaReport && Array.isArray(schemaReport.warnings)) ? schemaReport.warnings : [];
                    if (schemaErrors.length > 0) {
                        console.error('[RecipeSchema] validation failed:', {
                            error_count: schemaErrors.length,
                            warning_count: schemaWarnings.length
                        });
                        schemaErrors.forEach(function (e, idx) {
                            console.error('[RecipeSchema][Error#' + (idx + 1) + ']', e);
                        });
                    } else if (schemaWarnings.length > 0) {
                        console.warn('[RecipeSchema] validation warnings:', {
                            error_count: 0,
                            warning_count: schemaWarnings.length
                        });
                        schemaWarnings.forEach(function (w, idx) {
                            console.warn('[RecipeSchema][Warn#' + (idx + 1) + ']', w);
                        });
                    }
                } catch (eSchema) {
                    console.error('[RecipeSchema] validator runtime error:', eSchema);
                    if (window.SceneCtx) {
                        window.SceneCtx.recipe_schema_validation_report = {
                            errors: [{
                                entry_type: 'runtime',
                                id: 'recipe_schema_validator',
                                error_code: 'VALIDATOR_RUNTIME_ERROR',
                                message: (eSchema && eSchema.message) ? String(eSchema.message) : String(eSchema)
                            }],
                            warnings: []
                        };
                    }
                }
            }
            if (window.RecipeSystem && typeof window.RecipeSystem.setTables === 'function') {
                window.RecipeSystem.setTables(arr[18], arr[19], arr[20]);
                window.StationActions.registerCookingRecipeProcessorIfNeeded();
                if (typeof window.StationActions.registerPharmacyRecipeProcessorIfNeeded === 'function') {
                    window.StationActions.registerPharmacyRecipeProcessorIfNeeded();
                }
            }
            if (window.ItemInfoModules && typeof window.ItemInfoModules.setTable === 'function') {
                window.ItemInfoModules.setTable(arr[21]);
            }
            if (window.ItemFieldDisplayRules && typeof window.ItemFieldDisplayRules.setTable === 'function') {
                window.ItemFieldDisplayRules.setTable(arr[22] && typeof arr[22] === 'object' ? arr[22] : null);
            }
            if (window.AgricultureConfig && typeof window.AgricultureConfig.setTables === 'function') {
                window.AgricultureConfig.setTables(arr[25], arr[26], arr[29]);
            }
            window.AgricultureActions.agricultureCropDefsDoc = arr[27] && typeof arr[27] === 'object' ? arr[27] : null;
            window.AgricultureActions.agricultureSoilsDoc = arr[28] && typeof arr[28] === 'object' ? arr[28] : null;
            if (window.HideoutWarehouse && typeof window.HideoutWarehouse.setUpgradeTable === 'function') {
                window.HideoutWarehouse.setUpgradeTable(arr[30] && typeof arr[30] === 'object' ? arr[30] : null);
            }
            if (window.LivestockState && typeof window.LivestockState.setConfig === 'function') {
                window.LivestockState.setConfig(
                    (arr[31] && arr[31].species) || {},
                    (arr[32] && arr[32].modules) || {},
                    (arr[33] && arr[33].perks) || {},
                    (arr[34] && arr[34].costs) || {},
                    (arr[35] && arr[35].crops) || {},
                    (arr[31] && arr[31].pasture_rules) || {}
                );
            }
            if (window.AgricultureMap && typeof window.AgricultureMap.bindEnv === 'function') {
                try { window.AgricultureMap.bindEnv(window.AgricultureActions.buildAgricultureEnv()); } catch (eAgEnv) { /* ignore */ }
            }
            if (window.CompostSystem) {
                if (typeof window.CompostSystem.setEventsTable === 'function') {
                    window.CompostSystem.setEventsTable(arr[23]);
                }
                CompostPanel.setEventActionDisplayById = parseCompostEventActionsCsv(arr[24] != null ? String(arr[24]) : '');
                if (typeof window.CompostSystem.setConfig === 'function') {
                    window.CompostSystem.setConfig({
                        aerobic_duration_ticks: 288,
                        anaerobic_duration_ticks: 1008
                    });
                }
                if (typeof window.CompostSystem.setHooks === 'function') {
                    window.CompostSystem.setHooks({
                        on_batch_started: function () { CompostPanel.addCompostProficiencyForAction('compost_batch_started'); },
                        on_window_interacted: function () { CompostPanel.addCompostProficiencyForAction('compost_window_interacted'); }
                    });
                }
            }
            window.SceneDebug.renderRecipeSchemaValidationDebugList();
            var defEqFetched = (arr[7] && typeof arr[7] === 'object') ? arr[7] : {};
            var defaultEquipMerged = {};
            var sk;
            for (sk in starterEquipFallback) {
                if (starterEquipFallback.hasOwnProperty(sk)) defaultEquipMerged[sk] = starterEquipFallback[sk];
            }
            for (sk in defEqFetched) {
                if (!defEqFetched.hasOwnProperty(sk) || sk === '_comment' || !defEqFetched[sk]) continue;
                if (IE.EQUIP_SLOT_IDS.indexOf(sk) >= 0) defaultEquipMerged[sk] = defEqFetched[sk];
            }
            IE.setConfig({
                equipment: (window.ItemAttributeModules && typeof window.ItemAttributeModules.hydrateCatalog === 'function') ? window.ItemAttributeModules.hydrateCatalog(arr[5]) : arr[5],
                items: runtimeItems,
                enchant: arr[6],
                modules: (window.ItemAttributeModules && typeof window.ItemAttributeModules.hydrateCatalog === 'function') ? window.ItemAttributeModules.hydrateCatalog(arr[36] || {}) : (arr[36] || {}),
                default_equipment: defaultEquipMerged,
                item_display_tier_threshold_1: survCfg.item_display_tier_threshold_1,
                item_display_tier_threshold_2: survCfg.item_display_tier_threshold_2
            });
            IE.initNewGame();
            if (window.CharacterAttributes) {
                window.CharacterAttributes.setConfig(survCfg);
                window.CharacterAttributes.setState(window.CharacterAttributes.getDefaultState());
                window.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return IE.getState().equipment; },
                    getSkillsState: function () { return IE.getState().skills; },
                    getItemTemplate: IE.getItemTemplate,
                    getEnchantEntry: IE.getEnchantEntry,
                    getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
                });
            }
            if (window.Survival && window.Survival.setCharacterCallbacks && window.CharacterAttributes) {
                window.Survival.setCharacterCallbacks({
                    getBreathActual: window.CharacterAttributes.getBreathActual,
                    getNingqiBonus: function () {
                        var lv = (IE && typeof IE.getSkillLevel === 'function') ? (IE.getSkillLevel('survival_ningqi') || 0) : 0;
                        var per = Number(survCfg.ningqi_regen_bonus_per_level);
                        if (!isFinite(per) || per < 0) per = 0.01;
                        return Math.max(0, lv) * per;
                    }
                });
            }
        });
    }

    function initialize() {
        defaultGatheringPoints = { gathering_bush: { gathering_point_id: 'gathering_bush', display_name: 'gathering_bush', base_gathering_success_rate: 0.6, loot_table_id: 'loot_bush', stamina_cost: 0.6, tool_required: false }, gathering_grass: { gathering_point_id: 'gathering_grass', display_name: 'gathering_grass', base_gathering_success_rate: 0.6, loot_table_id: 'loot_grass', stamina_cost: 0.6, tool_required: false } };
        defaultLootTables = { loot_bush: [ { item_id: 'wild_fruit_red', weight: 72 }, { item_id: 'wild_fruit_purple', weight: 35 }, { item_id: 'wild_fruit_yellow', weight: 20 } ], loot_grass: [ { item_id: 'herb_green', weight: 72 }, { item_id: 'herb_bitter', weight: 35 }, { item_id: 'herb_sweet', weight: 20 } ] };
        defaultItems = { wild_fruit_red: { item_id: 'wild_fruit_red', name: 'wild_fruit_red', weight_kg: 0.1 }, wild_fruit_purple: { item_id: 'wild_fruit_purple', name: 'wild_fruit_purple', weight_kg: 0.1 }, wild_fruit_yellow: { item_id: 'wild_fruit_yellow', name: 'wild_fruit_yellow', weight_kg: 0.1 }, herb_green: { item_id: 'herb_green', name: 'herb_green', weight_kg: 0.1 }, herb_bitter: { item_id: 'herb_bitter', name: 'herb_bitter', weight_kg: 0.1 }, herb_sweet: { item_id: 'herb_sweet', name: 'herb_sweet', weight_kg: 0.1 } };
    }

    function bind() {

    }

    window.SceneConfig = {
        initialize: initialize,
        bind: bind,
        loadConfig: loadConfig
    };
})(window);

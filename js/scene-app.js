// Main scene entry
(function () {
    var E = window.GameEngine;
    var G = window.Gathering;
    var IE = window.InventoryEquipment;
    var CELL_PX = E.CELL_PX;
    var CENTER_OFFSET_X = E.CENTER_OFFSET_X;
    var CENTER_OFFSET_Y = E.CENTER_OFFSET_Y;

    var IDLE_TICK_MS = 3000;
    var gatheringIdleTimer = null;
    var gatheringIdleAt = null;
    var timeHudVisible = true;
    var combatRenderProfileTimer = null;

    // Shared context for renderer/systems
    window.SceneCtx = {
        E: E,
        G: G,
        IE: IE,
        CELL_PX: CELL_PX,
        CENTER_OFFSET_X: CENTER_OFFSET_X,
        CENTER_OFFSET_Y: CENTER_OFFSET_Y,
        actions: {},
        dirtyCells: [],
        renderProfile: 'normal',
        pushDirtyCell: function (x, y) {
            if (x == null || y == null) return;
            this.dirtyCells.push({ x: x, y: y });
        },
        /**
         * 标脏蹑步选点相关地图格，供 tile-renderer-v2 在「partial dirty」模式下重画。
         * 机制：V2 在 dirtyCells 非空时只对列表内格子 clearRect + drawDynamicCell；未列入的格保留旧 canvas 像素。
         * 因此除高亮环（切比雪夫 1..r）外，再包含中心格与外扩一圈（切比雪夫 ≤ r+1 的整块方形），
         * 覆盖「身边 8 格」、邻接白雾、leap 描边线宽造成的视觉外溢，避免关模式后仍残留青色框。
         */
        pushDirtyNieBuRing: function (cx, cy, r) {
            var map = E.getMap();
            if (!map || cx == null || cy == null) return;
            var radius = Math.max(1, parseInt(r, 10) || 2);
            var pad = 1;
            var maxD = radius + pad;
            var dy;
            for (dy = -maxD; dy <= maxD; dy++) {
                var dx;
                for (dx = -maxD; dx <= maxD; dx++) {
                    var px = cx + dx;
                    var py = cy + dy;
                    if (px < 0 || py < 0 || px >= map.width || py >= map.height) continue;
                    this.pushDirtyCell(px, py);
                }
            }
        },
        /**
         * 关闭蹑步选点。动态层清理由 scene-renderer 在 footworkNieBuMode true→false 当帧强制整视野重画（V2 partial dirty 无法可靠覆盖环上全部格）。
         * 参数保留供调用方语义一致；环心/半径不再在此处标脏。
         */
        exitFootworkNieBuMode: function (ringCX, ringCY, radiusOpt) {
            if (!this.footworkNieBuMode) return;
            this.footworkNieBuMode = false;
        },
        isTimeHudVisible: function () { return !!timeHudVisible; },
        footworkNieBuMode: false,
        nieBuLeapRadius: 2
    };

    function showMsg(text, logType) {
        if (window.GameLog && text) window.GameLog.log(text, logType || 'info');
    }
    window.SceneCtx.showMsg = showMsg;

    function ui(key, vars) {
        try {
            if (!window.UIText || typeof window.UIText.t !== 'function') throw new Error('[SceneApp] UIText not ready');
            return window.UIText.t(key, vars);
        } catch (e) {
            var msg = '[E_UI_CALL] ' + JSON.stringify({ module: 'SceneApp', key: String(key || ''), fix_hint: 'Usually add/fix key in data/ui_text_zhCN.json' });
            var err = new Error(msg + ' cause=' + (e && e.message ? e.message : String(e)));
            err.code = 'E_UI_CALL';
            err.details = { module: 'SceneApp', key: String(key || '') };
            err.cause = e;
            throw err;
        }
    }

    function isStoryMovementLocked() {
        if (window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen()) return true;
        var ov = document.getElementById('character-creation-overlay');
        if (ov && !ov.classList.contains('hidden')) return true;
        return false;
    }

    function isPreCreationGameplayRestricted() {
        var CA = window.CharacterAttributes;
        return !!(CA && typeof CA.isCharacterCreationCompleted === 'function' && !CA.isCharacterCreationCompleted());
    }

    function showIntroBlockedMsg() {
        try {
            showMsg(ui('intro.blocked.action'), 'info');
        } catch (e0) {
            showMsg('现在还无法使用。', 'info');
        }
    }

    function syncIntroShellUi() {
        var CA = window.CharacterAttributes;
        var done = CA && typeof CA.isCharacterCreationCompleted === 'function' && CA.isCharacterCreationCompleted();
        if (document.body) {
            if (done) document.body.classList.remove('intro-shell-active');
            else document.body.classList.add('intro-shell-active');
        }
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
    }

    // Route NPC messages into game log
    if (window.NPCSystem && typeof window.NPCSystem.configure === 'function') {
        window.NPCSystem.configure({ log: showMsg });
    }

    function normalizePortal(p, fallback) {
        var out = {
            x: p.x,
            y: p.y,
            target_map_id: p.target_map_id,
            target_x: (p.target_x != null) ? p.target_x : (fallback && fallback.target_x != null ? fallback.target_x : 0),
            target_y: (p.target_y != null) ? p.target_y : (fallback && fallback.target_y != null ? fallback.target_y : 0),
            label: p.label
        };
        return out;
    }

    function mergeMapData(base, loaded) {
        var m = {};
        for (var k in base) m[k] = base[k];
        for (var k2 in loaded) m[k2] = loaded[k2];

        // portals: fill missing target_x/target_y for old maps
        if (Array.isArray(loaded.portals)) {
            var basePortals = Array.isArray(base.portals) ? base.portals : [];
            m.portals = loaded.portals.map(function (p) {
                var fb = null;
                for (var i = 0; i < basePortals.length; i++) {
                    var bp = basePortals[i];
                    if (bp && bp.x === p.x && bp.y === p.y && bp.target_map_id === p.target_map_id) { fb = bp; break; }
                }
                return normalizePortal(p, fb);
            });
        }
        if (!Array.isArray(m.blocks)) m.blocks = [];
        if (!Array.isArray(m.portals)) m.portals = [];
        if (!Array.isArray(m.entities)) m.entities = m.entities ? m.entities : undefined;
        if (!Array.isArray(m.npcs)) m.npcs = m.npcs ? m.npcs : undefined;
        return m;
    }

    function bootstrapMapsFromJson() {
        if (!E || typeof E.getMaps !== 'function' || typeof E.setMaps !== 'function') return;
        var baseMaps = E.getMaps();
        var ids = Object.keys(baseMaps || {});
        if (!ids.length || typeof fetch !== 'function') return;

        return Promise.all(ids.map(function (id) {
            return fetch('data/maps/' + id + '.json')
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (json) { return { id: id, json: json }; })
                .catch(function () { return { id: id, json: null }; });
        })).then(function (rows) {
            var next = {};
            for (var i = 0; i < ids.length; i++) next[ids[i]] = baseMaps[ids[i]];
            for (var j = 0; j < rows.length; j++) {
                var row = rows[j];
                if (!row || !row.id || !row.json) continue;
                next[row.id] = mergeMapData(baseMaps[row.id] || {}, row.json);
            }
            E.setMaps(next);
            render();
        });
    }

    var playerSpriteUrls = { down: '', up: '', left: '', right: '' };
    var currentFacing = 'down';

    function updatePlayerAvatarImage() {
        var wrap = document.getElementById('player-avatar');
        var img = document.getElementById('player-avatar-img');
        if (!wrap || !img) return;
        var url = playerSpriteUrls[currentFacing] || '';
        if (!url) {
            img.src = '';
            img.removeAttribute('src');
            wrap.classList.remove('avatar-has-image');
            return;
        }
        img.onload = function () {
            wrap.classList.add('avatar-has-image');
        };
        img.onerror = function () {
            wrap.classList.remove('avatar-has-image');
        };
        img.src = url;
    }

    function setFacingFromMove(dx, dy) {
        if (dx > 0) currentFacing = 'right';
        else if (dx < 0) currentFacing = 'left';
        else if (dy > 0) currentFacing = 'down';
        else if (dy < 0) currentFacing = 'up';
        updatePlayerAvatarImage();
    }
    window.SceneCtx.setFacingFromMove = setFacingFromMove;

    function setPlayerAvatar(url) {
        var u = (url != null && url !== '') ? url : '';
        playerSpriteUrls.down = playerSpriteUrls.up = playerSpriteUrls.left = playerSpriteUrls.right = u;
        updatePlayerAvatarImage();
        if (window.EntityAppearance) window.EntityAppearance.setEntityAppearanceSilent('player', u);
    }

    function setPlayerAvatarSprites(urls) {
        if (urls && typeof urls === 'object') {
            if (urls.down != null) playerSpriteUrls.down = urls.down ? String(urls.down) : '';
            if (urls.up != null) playerSpriteUrls.up = urls.up ? String(urls.up) : '';
            if (urls.left != null) playerSpriteUrls.left = urls.left ? String(urls.left) : '';
            if (urls.right != null) playerSpriteUrls.right = urls.right ? String(urls.right) : '';
        }
        updatePlayerAvatarImage();
    }

    window.setPlayerAvatar = setPlayerAvatar;
    window.setPlayerAvatarSprites = setPlayerAvatarSprites;

    if (window.EntityAppearance) {
        EntityAppearance.onAppearanceChange(function (entityId, imageUrl) {
            if (entityId === 'player') setPlayerAvatar(imageUrl);
        });
    }

    var defaultGatheringPoints = { gathering_bush: { gathering_point_id: 'gathering_bush', display_name: 'gathering_bush', base_gathering_success_rate: 0.6, loot_table_id: 'loot_bush', stamina_cost: 2, tool_required: false }, gathering_grass: { gathering_point_id: 'gathering_grass', display_name: 'gathering_grass', base_gathering_success_rate: 0.6, loot_table_id: 'loot_grass', stamina_cost: 2, tool_required: false } };
    var defaultLootTables = { loot_bush: [ { item_id: 'wild_fruit_red', weight: 40, quality_tier: 1 }, { item_id: 'wild_fruit_red', weight: 30, quality_tier: 2 }, { item_id: 'wild_fruit_purple', weight: 25, quality_tier: 2 }, { item_id: 'wild_fruit_yellow', weight: 15, quality_tier: 3 }, { item_id: 'wild_fruit_purple', weight: 10, quality_tier: 4 }, { item_id: 'wild_fruit_yellow', weight: 5, quality_tier: 5 }, { item_id: 'wild_fruit_red', weight: 2, quality_tier: 6 } ], loot_grass: [ { item_id: 'herb_green', weight: 40, quality_tier: 1 }, { item_id: 'herb_green', weight: 30, quality_tier: 2 }, { item_id: 'herb_bitter', weight: 25, quality_tier: 2 }, { item_id: 'herb_sweet', weight: 15, quality_tier: 3 }, { item_id: 'herb_bitter', weight: 10, quality_tier: 4 }, { item_id: 'herb_sweet', weight: 5, quality_tier: 5 }, { item_id: 'herb_green', weight: 2, quality_tier: 6 } ] };
    var defaultItems = { wild_fruit_red: { item_id: 'wild_fruit_red', name: 'wild_fruit_red', weight_kg: 0.1 }, wild_fruit_purple: { item_id: 'wild_fruit_purple', name: 'wild_fruit_purple', weight_kg: 0.1 }, wild_fruit_yellow: { item_id: 'wild_fruit_yellow', name: 'wild_fruit_yellow', weight_kg: 0.1 }, herb_green: { item_id: 'herb_green', name: 'herb_green', weight_kg: 0.1 }, herb_bitter: { item_id: 'herb_bitter', name: 'herb_bitter', weight_kg: 0.1 }, herb_sweet: { item_id: 'herb_sweet', name: 'herb_sweet', weight_kg: 0.1 } };

    var EQUIP_SLOT_LABELS = { head: 'equip.slot.head', clothing: 'equip.slot.clothing', vest: 'equip.slot.vest', backpack: 'equip.slot.backpack', weapon_left: 'equip.slot.weapon_left', weapon_right: 'equip.slot.weapon_right', glove_left: 'equip.slot.glove_left', glove_right: 'equip.slot.glove_right', shoe_left: 'equip.slot.shoe_left', shoe_right: 'equip.slot.shoe_right', ring_left: 'equip.slot.ring_left', ring_right: 'equip.slot.ring_right', earring_left: 'equip.slot.earring_left', earring_right: 'equip.slot.earring_right', necklace: 'equip.slot.necklace' };
    var BODY_PART_IDS = ['head', 'chest', 'belly', 'lhand', 'rhand', 'lfoot', 'rfoot'];
    var BODY_PART_LABELS = { head: 'body.part.head', chest: 'body.part.chest', belly: 'body.part.belly', lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
    var ARM_ACTION_TAGS = ['combat.action.punch', 'combat.action.push_palm', 'combat.action.finger_jab'];
    var FOOT_ACTION_TAGS = ['combat.action.snap_kick', 'combat.action.stomp', 'combat.action.toe_kick'];
    var COMBAT_LIMB_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];
    var limbActionTags = {
        lhand: ARM_ACTION_TAGS.slice(),
        rhand: ARM_ACTION_TAGS.slice(),
        lfoot: FOOT_ACTION_TAGS.slice(),
        rfoot: FOOT_ACTION_TAGS.slice()
    };

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
        if (tpl.weight_kg != null) lines.push(ui('item.attr.weight', { v: tpl.weight_kg }));
        if (tpl.pocket_slots != null) lines.push(ui('item.attr.pocket_slots', { v: tpl.pocket_slots }));
        if (tpl.vest_slots != null) lines.push(ui('item.attr.vest_slots', { v: tpl.vest_slots }));
        if (tpl.backpack_slots != null) lines.push(ui('item.attr.backpack_slots', { v: tpl.backpack_slots }));
        if (tpl.backpack_weight_factor != null) lines.push(ui('item.attr.backpack_weight_factor', { v: Math.round(tpl.backpack_weight_factor * 100) }));
        if (tpl.damage_reduce_slash_pct != null || tpl.damage_reduce_pierce_pct != null || tpl.damage_reduce_blunt_pct != null) {
            var dr = [];
            if (tpl.damage_reduce_slash_pct != null && tpl.damage_reduce_slash_pct > 0) dr.push(ui('item.attr.dr.slash', { v: Math.round(tpl.damage_reduce_slash_pct * 100) }));
            if (tpl.damage_reduce_pierce_pct != null && tpl.damage_reduce_pierce_pct > 0) dr.push(ui('item.attr.dr.pierce', { v: Math.round(tpl.damage_reduce_pierce_pct * 100) }));
            if (tpl.damage_reduce_blunt_pct != null && tpl.damage_reduce_blunt_pct > 0) dr.push(ui('item.attr.dr.blunt', { v: Math.round(tpl.damage_reduce_blunt_pct * 100) }));
            if (dr.length) lines.push(ui('item.attr.damage_reduce', { v: dr.join(ui('punct.join.dot')) }));
        }
        if (tpl.skill_coef != null) lines.push(ui('item.attr.skill_coef', { v: tpl.skill_coef }));
        if (tpl.req_innate_jingu != null) lines.push(ui('item.attr.req_innate_jingu', { v: tpl.req_innate_jingu }));
        if (tpl.enchant_slots != null) lines.push(ui('item.attr.enchant_slots', { v: tpl.enchant_slots }));
        var q = (inst && inst.quality_tier != null) ? inst.quality_tier : tpl.quality_tier;
        if (q != null && IE && IE.QUALITY_NAMES) lines.push(ui('item.attr.quality', { v: (IE.QUALITY_NAMES[q] || ui('common.dash')) }));
        return lines.length ? lines.join('\n') : '';
    }
    function buildItemTooltipHtml(name, desc, attrs) {
        var html = '<div class="tooltip-name">' + (name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        if (desc) html += '<div class="tooltip-desc">' + (desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        if (attrs) html += '<div class="tooltip-attrs">' + (attrs || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        return html;
    }

    function loadConfig() {
        var base = 'data/';
        return Promise.all([
            fetch(base + 'ui_text_zhCN.json').then(function (r) { return r.ok ? r.json() : null; }),
            fetch(base + 'gathering_points.json').then(function (r) { return r.ok ? r.json() : defaultGatheringPoints; }).catch(function () { return defaultGatheringPoints; }),
            fetch(base + 'loot_tables.json').then(function (r) { return r.ok ? r.json() : defaultLootTables; }).catch(function () { return defaultLootTables; }),
            fetch(base + 'items.json').then(function (r) { return r.ok ? r.json() : defaultItems; }).catch(function () { return defaultItems; }),
            fetch(base + 'survival-config.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'equipment.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'enchant.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'default_equipment.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'combat-skills.json').then(function (r) { return r.ok ? r.json() : { constants: {}, categories: [], skills: {} }; }).catch(function () { return { constants: {}, categories: [], skills: {} }; }),
            fetch(base + 'combat-pipeline.json').then(function (r) { return r.ok ? r.json() : { pipelines: {} }; }).catch(function () { return { pipelines: {} }; }),
            fetch(base + 'post-effects.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'survival-skills.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        ]).then(function (arr) {
            if (!arr[0]) throw new Error('[SceneApp] ui_text_zhCN.json missing');
            if (!window.UIText || typeof window.UIText.setDict !== 'function') throw new Error('[SceneApp] UIText module missing');
            window.UIText.setDict(arr[0]);
            window.UIText.applyDom(document);
            G.setConfig({
                gathering_points: arr[1],
                loot_tables: arr[2],
                items: arr[3]
            });
            if (window.Survival) window.Survival.setConfig(arr[4]);
            var survCfg = arr[4] || {};
            if (window.ProductionQuality && typeof window.ProductionQuality.setConfig === 'function') {
                window.ProductionQuality.setConfig(survCfg);
            }
            var starterEquipFallback = {
                clothing: 'eq_clothing_commute',
                vest: 'eq_vest_hoodie',
                shoe_left: 'eq_shoe_left_sport',
                shoe_right: 'eq_shoe_right_sport'
            };
            if (window.CombatSkills && arr[8]) window.CombatSkills.setConfig(arr[8]);
            if (window.CombatPipeline && arr[9]) window.CombatPipeline.setConfig(arr[9]);
            if (window.CombatPostEffects && arr[10]) window.CombatPostEffects.setTable(arr[10]);
            if (window.SurvivalSkills && typeof window.SurvivalSkills.setTable === 'function' && arr[11]) {
                window.SurvivalSkills.setTable(arr[11]);
            }
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
                equipment: arr[5],
                items: arr[3],
                enchant: arr[6],
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
                window.Survival.setCharacterCallbacks({ getBreathActual: window.CharacterAttributes.getBreathActual });
            }
            hideCreationOverlay();
            updateRoleNameFromCharacter();
            syncIntroShellUi();
        });
    }

    var CREATION_ATTR_LABELS = { jingu: 'status.attr.jingu', flexibility: 'status.attr.flexibility', breath: 'status.attr.breath', dexterity: 'status.attr.dexterity', focus: 'status.attr.focus' };
    var creationInnate = { jingu: 10, flexibility: 10, breath: 10, dexterity: 10, focus: 10 };
    var CREATION_ATTR_MAX = 29;

    function getCreationInnateSum() {
        return creationInnate.jingu + creationInnate.flexibility + creationInnate.breath + creationInnate.dexterity + creationInnate.focus;
    }

    function getCreationFreePoints() {
        var sum = getCreationInnateSum();
        return Math.max(0, 100 - sum);
    }

    function updateCreationPointsDisplay() {
        var el = document.getElementById('creation-points');
        if (!el) return;
        var free = getCreationFreePoints();
        el.textContent = ui('creation.points.left', { free: free });
        el.classList.remove('ok');
        if (free === 0) el.classList.add('ok');
    }

    function updateCreationConfirmButton() {
        var btn = document.getElementById('btn-confirm-creation');
        var nameEl = document.getElementById('creation-name');
        if (!btn) return;
        var nameOk = nameEl && String(nameEl.value || '').trim().length > 0;
        btn.disabled = !nameOk;
    }

    function randomDistributeCreationRemainingPoints() {
        var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        var remaining = getCreationFreePoints();
        while (remaining > 0) {
            var candidates = attrIds.filter(function (id) {
                return creationInnate[id] < CREATION_ATTR_MAX;
            });
            if (!candidates.length) break;
            var pick = candidates[Math.floor(Math.random() * candidates.length)];
            creationInnate[pick]++;
            remaining--;
        }
    }

    function initCreationUI() {
        var CA = window.CharacterAttributes;
        if (!CA) return;
        var state = CA.getState();
        creationInnate = {
            jingu: state.innate.jingu != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.jingu)) : 1,
            flexibility: state.innate.flexibility != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.flexibility)) : 1,
            breath: state.innate.breath != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.breath)) : 1,
            dexterity: state.innate.dexterity != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.dexterity)) : 1,
            focus: state.innate.focus != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.focus)) : 1
        };
        var container = document.getElementById('creation-attr-rows');
        if (!container) return;
        container.innerHTML = '';
        var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        var creationRowControls = [];
        function refreshCreationAllRows() {
            var sum = getCreationInnateSum();
            creationRowControls.forEach(function (r) {
                r.valueSpan.textContent = creationInnate[r.attrId];
                r.btnMinus.disabled = creationInnate[r.attrId] <= 0;
                r.btnPlus.disabled = creationInnate[r.attrId] >= CREATION_ATTR_MAX || sum >= 100;
            });
            var ids = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
            ids.forEach(function (id) {
                var el = document.getElementById('status-attr-' + id);
                if (el) {
                    var aq = CA.getAcquiredAttr ? CA.getAcquiredAttr(id) : 0;
                    var total = creationInnate[id] + aq;
                    el.textContent = aq ? creationInnate[id] + '+' + aq + '=' + total : String(total);
                }
            });
            updateCreationPointsDisplay();
            updateCreationConfirmButton();
        }
        attrIds.forEach(function (attrId) {
            var row = document.createElement('div');
            row.className = 'attr-row';
            var label = document.createElement('span');
            label.className = 'attr-label';
            label.textContent = ui(CREATION_ATTR_LABELS[attrId]);
            var controls = document.createElement('div');
            controls.className = 'attr-controls';
            var btnMinus = document.createElement('button');
            btnMinus.type = 'button';
            btnMinus.className = 'attr-btn';
            btnMinus.textContent = '−';
            btnMinus.setAttribute('aria-label', ui('creation.attr.minus'));
            var valueSpan = document.createElement('span');
            valueSpan.className = 'attr-value';
            valueSpan.textContent = creationInnate[attrId];
            var btnPlus = document.createElement('button');
            btnPlus.type = 'button';
            btnPlus.className = 'attr-btn';
            btnPlus.textContent = '+';
            btnPlus.setAttribute('aria-label', ui('creation.attr.plus'));
            creationRowControls.push({ attrId: attrId, valueSpan: valueSpan, btnMinus: btnMinus, btnPlus: btnPlus });
            btnMinus.onclick = function () {
                if (creationInnate[attrId] > 0) {
                    creationInnate[attrId]--;
                    refreshCreationAllRows();
                }
            };
            btnPlus.onclick = function () {
                var s = getCreationInnateSum();
                if (creationInnate[attrId] < CREATION_ATTR_MAX && s < 100) {
                    creationInnate[attrId]++;
                    refreshCreationAllRows();
                }
            };
            controls.appendChild(btnMinus);
            controls.appendChild(valueSpan);
            controls.appendChild(btnPlus);
            row.appendChild(label);
            row.appendChild(controls);
            container.appendChild(row);
        });
        refreshCreationAllRows();

        var nameEl = document.getElementById('creation-name');
        if (nameEl) nameEl.value = '';
        if (nameEl && !nameEl.__sceneAppCreationInputBound) {
            nameEl.__sceneAppCreationInputBound = true;
            nameEl.addEventListener('input', updateCreationConfirmButton);
        }
        updateCreationConfirmButton();
        var btnConfirm = document.getElementById('btn-confirm-creation');
        if (btnConfirm && !btnConfirm.__sceneAppCreationConfirmBound) {
            btnConfirm.__sceneAppCreationConfirmBound = true;
            btnConfirm.onclick = function () {
            if (btnConfirm.disabled) return;
            var name = (nameEl && nameEl.value) ? String(nameEl.value).trim() : '';
            if (!name) return;
            if (getCreationFreePoints() > 0) {
                randomDistributeCreationRemainingPoints();
                refreshCreationAllRows();
                if (window.GameLog) window.GameLog.log(ui('log.system.creation.points.auto'), 'system');
            }
            if (typeof IE.initNewGame === 'function') {
                IE.initNewGame();
                if (window.GameLog) window.GameLog.log(ui('log.system.starter.equip'), 'system');
            }
            var handEl = document.querySelector('input[name="creation-hand"]:checked');
            var legEl = document.querySelector('input[name="creation-leg"]:checked');
            var genderEl = document.querySelector('input[name="creation-gender"]:checked');
            var gender = (genderEl && genderEl.value === 'female') ? 'female' : 'male';
            var prevHidden = [];
            try {
                var pst = CA.getState();
                if (pst && Array.isArray(pst.hidden_epithets)) prevHidden = pst.hidden_epithets.slice();
            } catch (eH) { prevHidden = []; }
            if (typeof CA.innateAllTwentyForUselessPerson === 'function' && CA.innateAllTwentyForUselessPerson(creationInnate)) {
                var uselessLabel = CA.HIDDEN_EPITHET_USELESS || '无用之人';
                if (prevHidden.indexOf(uselessLabel) < 0) prevHidden.push(uselessLabel);
            }
            CA.setState({
                characterName: name,
                characterGender: gender,
                character_creation_completed: true,
                innate: { jingu: creationInnate.jingu, flexibility: creationInnate.flexibility, breath: creationInnate.breath, dexterity: creationInnate.dexterity, focus: creationInnate.focus },
                dominant_hand: (handEl && handEl.value === 'left') ? 'left' : 'right',
                dominant_leg: (legEl && legEl.value === 'left') ? 'left' : 'right',
                hidden_epithets: prevHidden
            });
            if (window.Survival && window.Survival.setState) {
                window.Survival.setState({ gender_value: gender === 'female' ? 100 : 0 });
            }
            CA.recalcCharacterStats({
                getEquipmentState: function () { return IE.getState().equipment; },
                getSkillsState: function () { return IE.getState().skills; },
                getItemTemplate: IE.getItemTemplate,
                getEnchantEntry: IE.getEnchantEntry,
                getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
            });
            if (window.Survival && typeof window.Survival.initBattleResourcesFull === 'function') {
                window.Survival.initBattleResourcesFull();
            }
            hideCreationOverlay();
            updateRoleNameFromCharacter();
            syncIntroShellUi();
            if (window.GameLog) window.GameLog.log(ui('log.system.creation.done', { name: name }), 'system');
            render();
        };
        }
    }

    function hideCreationOverlay() {
        var el = document.getElementById('character-creation-overlay');
        if (el) el.classList.add('hidden');
    }

    function showCreationOverlay() {
        var el = document.getElementById('character-creation-overlay');
        if (el) el.classList.remove('hidden');
    }

    function openCharacterCreationAfterIntro() {
        showCreationOverlay();
        initCreationUI();
    }

    function updateRoleNameFromCharacter() {
        var el = document.getElementById('status-role-name');
        if (!el) return;
        var name = window.CharacterAttributes && window.CharacterAttributes.getCharacterName();
        el.textContent = (name && name.length) ? name : ui('status.role.default');
        var gEl = document.getElementById('status-gender-line');
        if (gEl && window.CharacterAttributes && window.CharacterAttributes.getCharacterGenderLabel) {
            gEl.textContent = ui('status.gender.prefix', { gender: window.CharacterAttributes.getCharacterGenderLabel() });
        }
    }

    function render() {
        refreshRenderProfile();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') {
            window.SceneRenderer.render();
        }
    }

    // NOTE: bootstrapMapsFromJson 会触发 render()，而此时 SceneApp.init 里还未完成 ui_text_zhCN.json 的加载。
    // 放到 init() 的 loadConfig 成功后再执行，避免出现 UIText 未加载导致的崩溃。

    function setTimeHudVisible(visible) {
        timeHudVisible = (visible !== false);
        var wrap = document.getElementById('top-hud');
        if (wrap) wrap.style.display = timeHudVisible ? '' : 'none';
    }

    function isTimeHudVisible() {
        return !!timeHudVisible;
    }

    window.HUD = window.HUD || {};
    window.HUD.setTimeHudVisible = setTimeHudVisible;
    window.HUD.isTimeHudVisible = isTimeHudVisible;

    document.addEventListener('hud:time', function (ev) {
        var v = ev && ev.detail ? ev.detail.visible : undefined;
        if (v === undefined) return;
        setTimeHudVisible(!!v);
    });

    function getSatietyLabel(zone) {
        var labels = { normal: 'survival.satiety.normal', mild: 'survival.satiety.mild', moderate: 'survival.satiety.moderate', severe: 'survival.satiety.severe', starvation: 'survival.satiety.starvation' };
        return ui(labels[zone] || 'common.dash');
    }
    function getThirstLabel(thirst, normalMin) {
        normalMin = normalMin != null ? normalMin : 60;
        if (thirst >= normalMin) return ui('survival.thirst.normal');
        if (thirst > 0) return ui('survival.thirst.thirsty');
        return ui('survival.thirst.dehydrated');
    }
    function updateLimbBlock() {
        var container = document.getElementById('limb-rows');
        if (!container || !BODY_PART_IDS || !BODY_PART_LABELS) return;
        container.innerHTML = '';
        for (var i = 0; i < BODY_PART_IDS.length; i++) {
            var partId = BODY_PART_IDS[i];
                var labelKey = BODY_PART_LABELS[partId] != null ? BODY_PART_LABELS[partId] : partId;
                var label = ui(labelKey);
            var row = document.createElement('div');
            row.className = 'limb-row';
            row.innerHTML = '<div class="row"><span>' + (label.replace(/</g, '&lt;')) + '</span><span id="limb-' + partId + '">' + ui('body.part.status.ok') + '</span></div>';
            (function (pid, partLabel) {
                row.addEventListener('mouseenter', function () {
                    var statusEl = document.getElementById('limb-' + pid);
                    var statusText = statusEl ? statusEl.textContent : '—';
                    var esc = function (s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
                    var html = '<div class="tooltip-name">' + esc(partLabel) + '</div>';
                    html += '<div class="tooltip-desc">' + ui('tooltip.status', { v: esc(statusText) }).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                    if (COMBAT_LIMB_IDS.indexOf(pid) >= 0) {
                        var arr = (window.getLimbActionTagLabels ? window.getLimbActionTagLabels(pid) : (limbActionTags[pid] || [])).map(esc);
                        var tagStr = arr.length ? arr.join(ui('punct.join.dot')) : ui('common.dash');
                        html += '<div class="tooltip-attrs">' + ui('tooltip.action.tags', { v: tagStr }).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                    }
                    showItemTooltip(html, row);
                });
                row.addEventListener('mouseleave', hideItemTooltip);
            })(partId, label);
            container.appendChild(row);
        }
    }
    function getLimbActionTags(limbId) {
        if (!limbActionTags[limbId]) return [];
        return limbActionTags[limbId].slice();
    }

    function getLimbActionTagLabels(limbId) {
        var tags = getLimbActionTags(limbId);
        return tags.map(function (k) {
            try { return ui(k); } catch (e) { return k; }
        });
    }
    function setLimbActionTags(limbId, tags) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return;
        limbActionTags[limbId] = Array.isArray(tags) ? tags.slice() : [];
    }
    function addLimbActionTag(limbId, tag) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0 || !tag) return;
        var arr = limbActionTags[limbId];
        if (!arr) limbActionTags[limbId] = [];
        if (limbActionTags[limbId].indexOf(tag) < 0) limbActionTags[limbId].push(tag);
    }
    function removeLimbActionTag(limbId, tag) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0 || !limbActionTags[limbId]) return;
        var i = limbActionTags[limbId].indexOf(tag);
        if (i >= 0) limbActionTags[limbId].splice(i, 1);
    }
    function hasLimbActionTag(limbId, tag) {
        return limbActionTags[limbId] && limbActionTags[limbId].indexOf(tag) >= 0;
    }
    window.getLimbActionTags = getLimbActionTags;
    window.getLimbActionTagLabels = getLimbActionTagLabels;
    window.setLimbActionTags = setLimbActionTags;
    window.addLimbActionTag = addLimbActionTag;
    window.removeLimbActionTag = removeLimbActionTag;
    window.hasLimbActionTag = hasLimbActionTag;
    window.ARM_ACTION_TAGS = ARM_ACTION_TAGS;
    window.FOOT_ACTION_TAGS = FOOT_ACTION_TAGS;
    window.COMBAT_LIMB_IDS = COMBAT_LIMB_IDS;

    var playerActionsSubmenuOpen = false;
    var playerActionsOutsideClickBound = false;

    function hubAdjacentForBreathActions() {
        return !!(window.SceneCtx && typeof window.SceneCtx.hasAdjacentEnemyForCombat === 'function' && window.SceneCtx.hasAdjacentEnemyForCombat());
    }

    /** 右侧「动作」菜单：切换蹑步选点（与地图点击 tryFootworkNieBuJump 配套） */
    function toggleFootworkNieBuModeFromMenu() {
        var SKILL_ID = 'combat_basic_footwork';
        var ACTION_ID = 'nie_bu';
        var IE = window.InventoryEquipment;
        if (!IE || !window.SceneCtx) return;
        if (!IE.getSkillLevel || IE.getSkillLevel(SKILL_ID) < 1) {
            showMsg(ui('player.action.niebu.fail.no_skill'), 'info');
            return;
        }
        var hubsNb = IE.getCombatState ? IE.getCombatState().hubs : null;
        if (!hubsNb || hubsNb.footwork !== SKILL_ID) {
            showMsg(ui('player.action.niebu.fail.hub'), 'info');
            return;
        }
        var cdNb = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(SKILL_ID, ACTION_ID) : 0;
        if (cdNb > 0) {
            showMsg(ui('player.action.niebu.fail.cooldown', { ticks: cdNb }), 'info');
            return;
        }
        if (window.SceneCtx.footworkNieBuMode) {
            if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') window.SceneCtx.exitFootworkNieBuMode();
            return;
        }
        var rNb = 2;
        var CSNb = window.CombatSkills;
        if (CSNb && typeof CSNb.getSkill === 'function') {
            var skNb = CSNb.getSkill(SKILL_ID);
            if (skNb && skNb.hub_actions) {
                var hnb;
                for (hnb = 0; hnb < skNb.hub_actions.length; hnb++) {
                    if (skNb.hub_actions[hnb].id === ACTION_ID && skNb.hub_actions[hnb].leap_radius != null) {
                        rNb = parseInt(skNb.hub_actions[hnb].leap_radius, 10) || 2;
                        break;
                    }
                }
            }
        }
        var stNb = E.getState();
        var mapNb = E.getMap();
        window.SceneCtx.footworkNieBuMode = true;
        window.SceneCtx.nieBuLeapRadius = rNb;
        showMsg(ui('player.action.niebu.hint'), 'info');
        if (mapNb && typeof window.SceneCtx.pushDirtyNieBuRing === 'function') {
            window.SceneCtx.pushDirtyNieBuRing(stNb.x, stNb.y, rNb);
        }
    }

    function closePlayerActionsSubmenu() {
        var sub = document.getElementById('player-actions-submenu');
        if (!sub) return;
        sub.classList.remove('open');
        sub.setAttribute('aria-hidden', 'true');
        playerActionsSubmenuOpen = false;
    }

    function rebuildPlayerActionsSubmenu(sub) {
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        var Surv = window.Survival;
        var CHA = window.CombatHubActions;
        sub.innerHTML = '';
        if (!IE) return;
        var breathId = 'combat_basic_breath';
        var footworkId = 'combat_basic_footwork';
        var hubs = IE.getCombatState && IE.getCombatState().hubs ? IE.getCombatState().hubs : {};
        var breathLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(breathId) : 0;
        if (CS && breathLv >= 1) {
            var sk = typeof CS.getSkill === 'function' ? CS.getSkill(breathId) : null;
            if (sk && sk.hub_actions) {
                var mounted = hubs.breath === breathId;
                var adj = hubAdjacentForBreathActions();
                var i;
                for (i = 0; i < sk.hub_actions.length; i++) {
                    var ha = sk.hub_actions[i];
                    var ul = ha.unlock_level != null ? ha.unlock_level : 1;
                    if (breathLv < ul) continue;
                    var btnRow = document.createElement('button');
                    btnRow.type = 'button';
                    btnRow.className = 'player-action-item';
                    btnRow.setAttribute('role', 'menuitem');
                    btnRow.textContent = ha.name || ha.id;
                    var cd = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(breathId, ha.id) : 0;
                    var cdCfg = ha.cooldown_ticks != null ? parseInt(ha.cooldown_ticks, 10) : 0;
                    var dis = false;
                    var hint = '';
                    if (!mounted) {
                        dis = true;
                        hint = ui('combat.hub.fail.hub_mount');
                    } else if (cd > 0 && isFinite(cdCfg) && cdCfg > 0) {
                        dis = true;
                        hint = ui('combat.hub.fail.cooldown', { ticks: cd });
                        btnRow.textContent = (ha.name || ha.id) + ' · ' + cd + 't';
                    } else if (ha.battle_only && !adj) {
                        dis = true;
                        hint = ui('combat.hub.fail.battle_only');
                    } else if (ha.id === 'diqi_huti' && Surv && typeof Surv.getDiqiShieldRemaining === 'function' && Surv.getDiqiShieldRemaining() > 0) {
                        dis = true;
                        hint = ui('combat.hub.fail.shield_active');
                    }
                    btnRow.disabled = !!dis;
                    if (hint) btnRow.title = hint;
                    (function (actionId) {
                        btnRow.addEventListener('click', function (ev) {
                            ev.stopPropagation();
                            if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') return;
                            var r = CHA.tryExecuteHubAction(breathId, actionId, { isBattleContext: hubAdjacentForBreathActions });
                            if (!r.ok) {
                                var vars = {};
                                if (r.cooldown_ticks != null) vars.ticks = r.cooldown_ticks;
                                showMsg(ui(r.reason_key, vars), 'info');
                                return;
                            }
                            if (actionId === 'tu_na') showMsg(ui(r.reason_key, { n: r.qi_li_restored != null ? r.qi_li_restored : 0 }), 'success');
                            else if (actionId === 'diqi_huti') showMsg(ui(r.reason_key, { shield: r.shield_value != null ? r.shield_value : 0 }), 'success');
                            else if (actionId === 'xue_qi_hua_jing') showMsg(ui('combat.hub.ok.xue_qi'), 'success');
                            else if (actionId === 'tu_qi_na_jing') showMsg(ui('combat.hub.ok.tu_qi', { e: r.energy_gain != null ? r.energy_gain : 1 }), 'success');
                            else if (actionId === 'tiao_xi_once') showMsg(ui('combat.hub.ok.tiao_xi', { n: r.diqi_gained != null ? r.diqi_gained : 0 }), 'success');
                            else showMsg(ui(r.reason_key || 'combat.hub.ok.tu_na', { n: 0 }), 'success');
                            closePlayerActionsSubmenu();
                            if (window.SceneRenderer) window.SceneRenderer.render();
                            updateStatusPanel();
                        });
                    })(ha.id);
                    sub.appendChild(btnRow);
                }
            }
        }
        var fwLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(footworkId) : 0;
        if (fwLv >= 1) {
            var nieLabel = ui('player.action.niebu');
            var nieCd = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(footworkId, 'nie_bu') : 0;
            var hubFw = hubs.footwork === footworkId;
            var inNie = window.SceneCtx && window.SceneCtx.footworkNieBuMode;
            var btnNie = document.createElement('button');
            btnNie.type = 'button';
            btnNie.className = 'player-action-item';
            btnNie.setAttribute('role', 'menuitem');
            if (nieCd > 0) {
                btnNie.textContent = ui('player.action.niebu.cooldown', { ticks: nieCd });
                btnNie.disabled = true;
                btnNie.title = ui('player.action.niebu.fail.cooldown', { ticks: nieCd });
            } else if (!hubFw) {
                btnNie.textContent = nieLabel;
                btnNie.disabled = true;
                btnNie.title = ui('player.action.niebu.fail.hub');
            } else {
                btnNie.textContent = inNie ? ui('player.action.niebu.cancel') : nieLabel;
                btnNie.disabled = false;
                btnNie.title = inNie ? ui('player.action.niebu.cancel') : ui('player.action.niebu.hint');
            }
            btnNie.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (btnNie.disabled) return;
                toggleFootworkNieBuModeFromMenu();
                closePlayerActionsSubmenu();
                if (window.SceneRenderer) window.SceneRenderer.render();
                updateStatusPanel();
            });
            sub.appendChild(btnNie);
        }
    }

    function openPlayerActionsSubmenu() {
        var sub = document.getElementById('player-actions-submenu');
        if (!sub) return;
        rebuildPlayerActionsSubmenu(sub);
        sub.classList.add('open');
        sub.setAttribute('aria-hidden', 'false');
        playerActionsSubmenuOpen = true;
    }

    function refreshPlayerActionsMenuUi() {
        var wrap = document.getElementById('player-actions-hud-wrap');
        var btn = document.getElementById('btn-player-actions');
        var sub = document.getElementById('player-actions-submenu');
        if (!wrap || !btn || !sub) return;
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        var breathId = 'combat_basic_breath';
        var cnt = 0;
        if (IE && typeof IE.getSkillLevel === 'function' && CS && typeof CS.getSkill === 'function' && IE.getSkillLevel(breathId) >= 1) {
            var sk = CS.getSkill(breathId);
            if (sk && sk.hub_actions) {
                var lv = IE.getSkillLevel(breathId);
                var hi;
                for (hi = 0; hi < sk.hub_actions.length; hi++) {
                    var h = sk.hub_actions[hi];
                    var ul = h.unlock_level != null ? h.unlock_level : 1;
                    if (lv >= ul) cnt++;
                }
            }
        }
        if (IE && typeof IE.getSkillLevel === 'function' && IE.getSkillLevel('combat_basic_footwork') >= 1) cnt++;
        wrap.style.display = cnt > 0 ? 'flex' : 'none';
        if (!playerActionsSubmenuOpen) return;
        rebuildPlayerActionsSubmenu(sub);
    }

    function updateStatusPanel(gatherState) {
        updateLimbBlock();
        updateRoleNameFromCharacter();
        var CA = window.CharacterAttributes;
        if (CA && typeof CA.getEffectiveAttr === 'function') {
            var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
            attrIds.forEach(function (id) {
                var el = document.getElementById('status-attr-' + id);
                if (!el) return;
                var baseInn = CA.getBaseInnateAttr ? CA.getBaseInnateAttr(id) : (CA.getInnateAttr ? CA.getInnateAttr(id) : 0);
                var eff = CA.getEffectiveAttr(id);
                var extra = Math.max(0, eff - baseInn);
                if (extra > 0) el.textContent = baseInn + '+' + extra + '=' + eff;
                else el.textContent = String(eff);
            });
        }
        var Surv = window.Survival;
        var satietyText = document.getElementById('status-satiety-text');
        var satietyBar = document.getElementById('status-satiety-bar');
        var thirstText = document.getElementById('status-thirst-text');
        var thirstBar = document.getElementById('status-thirst-bar');
        var staminaText = document.getElementById('status-stamina-text');
        var staminaBar = document.getElementById('status-stamina-bar');
        var energyText = document.getElementById('status-energy-text');
        var energyBar = document.getElementById('status-energy-bar');
        var weightEl = document.getElementById('status-weight');
        if (!satietyText || !weightEl) {
            refreshPlayerActionsMenuUi();
            return;
        }

        if (Surv && typeof Surv.getState === 'function') {
            var s = Surv.getState();
            var zone = Surv.getSatietyZone ? Surv.getSatietyZone() : 'normal';
            satietyText.textContent = getSatietyLabel(zone);
            satietyText.className = zone === 'normal' ? 'value ok' : (zone === 'starvation' || zone === 'severe' ? 'value danger' : 'value warn');
            var satMax = 120;
            var satPct = Math.min(100, (s.satiety / satMax) * 100);
            satietyBar.style.width = satPct + '%';

            thirstText.textContent = getThirstLabel(s.thirst);
            thirstText.className = s.thirst >= 60 ? 'value ok' : (s.thirst <= 0 ? 'value danger' : 'value warn');
            thirstBar.style.width = s.thirst + '%';

            var stamMax = s.stamina_max || 100;
            staminaText.textContent = s.stamina.toFixed(1) + ' / ' + stamMax;
            staminaText.className = s.stamina <= 0 ? 'value danger' : (s.stamina < stamMax * 0.3 ? 'value warn' : 'value ok');
            staminaBar.style.width = stamMax > 0 ? (s.stamina / stamMax * 100) + '%' : '0%';

            var enMax = s.energy_max || 100;
            energyText.textContent = s.energy.toFixed(1) + ' / ' + enMax;
            energyText.className = s.energy <= 0 ? 'value danger' : (s.energy < enMax * 0.3 ? 'value warn' : 'value ok');
            energyBar.style.width = enMax > 0 ? (s.energy / enMax * 100) + '%' : '0%';

            var battleWrap = document.getElementById('status-battle-resources');
            var showBattleRes = window.SceneCtx && typeof window.SceneCtx.hasAdjacentEnemyForCombat === 'function' && window.SceneCtx.hasAdjacentEnemyForCombat();
            if (battleWrap) {
                battleWrap.style.display = showBattleRes ? '' : 'none';
                if (showBattleRes) {
                    var qm = s.qi_li_max != null ? s.qi_li_max : (Surv.getQiLiMax ? Surv.getQiLiMax() : 100);
                    var qc = s.qi_li_current != null ? s.qi_li_current : 0;
                    var dmax = s.diqi_max != null ? s.diqi_max : 0;
                    var dc = s.diqi_current != null ? s.diqi_current : 0;
                    var dsh = s.diqi_shield_remaining != null ? s.diqi_shield_remaining : 0;
                    var qiText = document.getElementById('status-qi-li-text');
                    var qiBar = document.getElementById('status-qi-li-bar');
                    var dqText = document.getElementById('status-diqi-text');
                    var dqBar = document.getElementById('status-diqi-bar');
                    var shText = document.getElementById('status-diqi-shield-text');
                    if (qiText) qiText.textContent = qc.toFixed(0) + ' / ' + qm;
                    if (qiBar) qiBar.style.width = qm > 0 ? (Math.min(100, (qc / qm) * 100)) + '%' : '0%';
                    if (dqText) dqText.textContent = dmax > 0 ? (dc.toFixed(1) + ' / ' + dmax) : '—';
                    if (dqBar) dqBar.style.width = dmax > 0 ? (Math.min(100, (dc / dmax) * 100)) + '%' : '0%';
                    if (shText) shText.textContent = dsh > 0 ? String(Math.floor(dsh)) : '—';
                }
            }

            weightEl.textContent = s.weight_kg + ' kg';
            var carryEl = document.getElementById('status-carry');
            if (carryEl) {
                var cap = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function')
                    ? window.CharacterAttributes.getCarryCapacity() : null;
                var current = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
                if (cap != null && current != null)
                    carryEl.textContent = current.toFixed(1) + ' / ' + cap.toFixed(1) + ' kg';
                else if (cap != null)
                    carryEl.textContent = '— / ' + cap.toFixed(1) + ' kg';
                else
                    carryEl.textContent = '—';
            }
        } else {
            satietyText.textContent = '—';
            satietyBar.style.width = '100%';
            thirstText.textContent = '—';
            thirstBar.style.width = '100%';
            if (gatherState) {
                staminaText.textContent = gatherState.stamina + ' / ' + gatherState.stamina_max;
                staminaBar.style.width = (gatherState.stamina_max > 0 ? (gatherState.stamina / gatherState.stamina_max * 100) : 0) + '%';
            } else {
                staminaText.textContent = '—';
                staminaBar.style.width = '100%';
            }
            energyText.textContent = '—';
            energyBar.style.width = '100%';
            weightEl.textContent = '—';
            var carryEl = document.getElementById('status-carry');
            if (carryEl) {
                var cap = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function') ? window.CharacterAttributes.getCarryCapacity() : null;
                var current = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
                if (cap != null && current != null) carryEl.textContent = current.toFixed(1) + ' / ' + cap.toFixed(1) + ' kg';
                else if (cap != null) carryEl.textContent = '— / ' + cap.toFixed(1) + ' kg';
                else carryEl.textContent = '—';
            }
        }
        refreshPlayerActionsMenuUi();
    }
    window.SceneCtx.updateStatusPanel = updateStatusPanel;

    function stopGatheringIdle() {
        if (gatheringIdleTimer) {
            clearInterval(gatheringIdleTimer);
            gatheringIdleTimer = null;
            gatheringIdleAt = null;
        }
    }
    window.SceneCtx.isGatheringIdling = function () { return !!gatheringIdleTimer; };

    function markCellDirty(mapId, x, y) {
        if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
            window.SceneCtx.pushDirtyCell(x, y);
        }
    }

    function hasAdjacentEnemyNow() {
        if (!E || typeof E.getState !== 'function' || typeof E.getEnemyAt !== 'function') return false;
        var st = E.getState();
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var eid = E.getEnemyAt(st.x + dx, st.y + dy);
                if (eid) return true;
            }
        }
        return false;
    }
    window.SceneCtx.hasAdjacentEnemyForCombat = hasAdjacentEnemyNow;

    function refreshRenderProfile(burstMs) {
        if (!window.SceneCtx) return;
        var contextualCombat = !!combatPanelOpen || hasAdjacentEnemyNow();
        if (contextualCombat) {
            window.SceneCtx.renderProfile = 'combat';
            if (combatRenderProfileTimer) {
                clearTimeout(combatRenderProfileTimer);
                combatRenderProfileTimer = null;
            }
            return;
        }
        if (burstMs != null && burstMs > 0) {
            window.SceneCtx.renderProfile = 'combat';
            if (combatRenderProfileTimer) clearTimeout(combatRenderProfileTimer);
            combatRenderProfileTimer = setTimeout(function () {
                combatRenderProfileTimer = null;
                refreshRenderProfile();
            }, Math.max(120, burstMs || 600));
            return;
        }
        if (!combatRenderProfileTimer) {
            window.SceneCtx.renderProfile = 'normal';
        }
    }

    function bumpCombatRenderProfile(ms) {
        refreshRenderProfile(ms || 600);
    }

    function onGatherTick() {
        var st = E.getState();
        var entityId = E.getEntityAt(st.x, st.y);
        if (!entityId || !G.canGather(entityId)) {
            stopGatheringIdle();
            if (!G.canGather(entityId) && entityId) showMsg(ui('log.warn.gather.stop.full_or_tired'));
            markCellDirty(st.mapId, st.x, st.y);
            render();
            return;
        }
        var result = G.doGather(entityId);
        if (result.success && result.gathered) showMsg(result.message, 'success');
        else if (!result.success) showMsg(result.message, 'warn');
        markCellDirty(st.mapId, st.x, st.y);
        render();
    }

    function onGatherClick() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        var st = E.getState();
        var entityId = E.getEntityAt(st.x, st.y);
        if (!entityId || !G.canGather(entityId)) return;
        if (gatheringIdleTimer) return;
        gatheringIdleAt = { mapId: st.mapId, x: st.x, y: st.y };
        onGatherTick();
        gatheringIdleTimer = setInterval(onGatherTick, IDLE_TICK_MS);
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function onGatherStopClick() {
        stopGatheringIdle();
        showMsg(ui('log.info.gather.stop'), 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    var backpackPanelOpen = false;

    function updateBackpackPanel() {
        if (!IE) return;
        var char = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var st = E.getState();
        var groundPos = { mapId: st.mapId, x: st.x, y: st.y };

        function renderInvGrid(containerId, containerType, getArr) {
            var grid = document.getElementById('inv-grid-' + containerType);
            var region = document.getElementById('inv-region-' + containerType);
            if (!grid || !region) return;
            var arr = getArr();
            grid.innerHTML = '';
            for (var i = 0; i < arr.length; i++) {
                var slot = document.createElement('div');
                slot.className = 'inv-slot';
                var it = arr[i];
                if (it && it.item_id) {
                    var tpl = IE.getItemTemplate(it.item_id);
                    var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(it.item_id, char) : 0;
                    var name = tpl ? IE.getDisplayName(tpl, tier) : it.item_id;
                    var qty = (it.count != null && it.count > 1) ? ' x' + it.count : '';
                    var label = document.createElement('div');
                    label.className = 'inv-slot-label';
                    label.textContent = (name || '').slice(0, 8) + qty;
                    slot.appendChild(label);
                    var dropBtn = document.createElement('button');
                    dropBtn.type = 'button';
                    dropBtn.className = 'inv-slot-drop';
                    dropBtn.textContent = ui('inv.drop');
                    dropBtn.onclick = (function (ct, idx) {
                        return function () {
                            var pos = E.getState();
                            var r = IE.dropItemToGround(ct, idx, pos.mapId, pos.x, pos.y);
                            if (r.success) showMsg(ui('log.info.dropped'), 'info');
                            else if (r.message) showMsg(r.message, 'warn');
                            markCellDirty(pos.mapId, pos.x, pos.y);
                            updateBackpackPanel();
                            render();
                        };
                    })(containerType, i);
                    slot.appendChild(dropBtn);
                    var tplAttrs = formatItemAttributes(tpl, it);
                    var tipHtml = buildItemTooltipHtml(name, tpl ? IE.getDisplayDesc(tpl, tier) : '', tplAttrs);
                    slot.addEventListener('mouseenter', function (h, el) { return function () { showItemTooltip(h, el); }; }(tipHtml, slot));
                    slot.addEventListener('mouseleave', hideItemTooltip);
                    if (tpl && tpl.equip_slot) slot.classList.add('inv-slot-equip');
                } else {
                    slot.textContent = '—';
                }
                grid.appendChild(slot);
            }
        }

        renderInvGrid('inv-grid-pocket', 'pocket', function () { return IE.getPocketArray ? IE.getPocketArray() : []; });
        renderInvGrid('inv-grid-vest', 'vest', function () { return IE.getVestArray ? IE.getVestArray() : []; });
        renderInvGrid('inv-grid-backpack', 'backpack', function () { return IE.getBackpackArray ? IE.getBackpackArray() : []; });

        var ieState = IE.getState ? IE.getState() : {};
        var hasVehicle = !!(ieState.bound_vehicle_id);
        var vehicleRegion = document.getElementById('inv-region-vehicle');
        if (vehicleRegion) vehicleRegion.style.display = hasVehicle ? '' : 'none';
        if (hasVehicle) {
            var vArr = ieState.inventory_vehicle || [];
            var vPadded = vArr.slice();
            while (vPadded.length < 4) vPadded.push(null);
            renderInvGrid('inv-grid-vehicle', 'vehicle', function () { return vPadded; });
        }

        var groundList = document.getElementById('ground-items-list');
        if (groundList) {
            var groundItems = IE.getGroundItemsAt ? IE.getGroundItemsAt(st.mapId, st.x, st.y) : [];
            groundList.innerHTML = '';
            for (var g = 0; g < groundItems.length; g++) {
                var row = document.createElement('div');
                row.className = 'ground-item-row';
                var it = groundItems[g];
                var tpl = it && it.item_id ? IE.getItemTemplate(it.item_id) : null;
                var tier = it && it.item_id && IE.getItemDisplayTier ? IE.getItemDisplayTier(it.item_id, char) : 0;
                var gName = tpl ? IE.getDisplayName(tpl, tier) : (it ? it.item_id : '—');
                var gQty = (it && it.count != null && it.count > 1) ? ' x' + it.count : '';
                row.innerHTML = '<span class="ground-item-name">' + String(gName + gQty).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
                var pickupBtn = document.createElement('button');
                pickupBtn.type = 'button';
                pickupBtn.className = 'btn-pickup';
                pickupBtn.textContent = ui('inv.pickup');
                pickupBtn.onclick = (function (idx) {
                    return function () {
                        var r = IE.pickUpFromGround(st.mapId, st.x, st.y, idx);
                        if (r.success) showMsg(ui('log.success.picked'), 'success');
                        else if (r.message) showMsg(r.message, 'warn');
                        markCellDirty(st.mapId, st.x, st.y);
                        updateBackpackPanel();
                        render();
                    };
                })(g);
                row.appendChild(pickupBtn);
                if (tpl && tpl.equip_slot) {
                    var eqBtn = document.createElement('button');
                    eqBtn.type = 'button';
                    eqBtn.className = 'btn-pickup btn-equip-from-ground';
                    eqBtn.textContent = ui('inv.equip');
                    eqBtn.onclick = (function (idx) {
                        return function () {
                            var r = IE.equipFromGround(st.mapId, st.x, st.y, idx);
                            if (r.success) showMsg(ui('log.success.equipped'), 'success');
                            else if (r.message) showMsg(r.message, 'warn');
                            markCellDirty(st.mapId, st.x, st.y);
                            updateBackpackPanel();
                            render();
                        };
                    })(g);
                    row.appendChild(eqBtn);
                }
                groundList.appendChild(row);
            }
        }

        var equipList = document.getElementById('equip-list');
        if (equipList && IE.EQUIP_SLOT_IDS) {
            equipList.innerHTML = '';
            var eqState = ieState.equipment || {};
            for (var s = 0; s < IE.EQUIP_SLOT_IDS.length; s++) {
                var slotId = IE.EQUIP_SLOT_IDS[s];
                var row = document.createElement('div');
                row.className = 'equip-row';
                var labelKey = EQUIP_SLOT_LABELS[slotId] || slotId;
                var label = (labelKey && String(labelKey).indexOf('equip.slot.') === 0) ? ui(labelKey) : labelKey;
                var eq = eqState[slotId];
                var itemName = '—';
                if (eq && eq.item_id) {
                    var eqTpl = IE.getItemTemplate(eq.item_id);
                    var eqTier = IE.getItemDisplayTier ? IE.getItemDisplayTier(eq.item_id, char) : 0;
                    itemName = eqTpl ? IE.getDisplayName(eqTpl, eqTier) : eq.item_id;
                }
                row.innerHTML = '<span class="slot-name">' + String(label).replace(/</g, '&lt;') + '</span><span class="item-name">' + String(itemName).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
                var unequipBtn = document.createElement('button');
                unequipBtn.type = 'button';
                unequipBtn.className = 'btn-unequip';
                unequipBtn.textContent = ui('inv.unequip');
                unequipBtn.disabled = !eq || !eq.item_id;
                unequipBtn.onclick = (function (sid) {
                    return function () {
                        var old = IE.unequip(sid, groundPos);
                        if (old) {
                            var placed = IE.putItemIntoDefaultContainer(old);
                            if (!placed.placed && groundPos && groundPos.mapId != null && groundPos.x != null && groundPos.y != null) {
                                IE.addItemToGround(groundPos.mapId, groundPos.x, groundPos.y, old);
                            }
                            showMsg(ui('log.info.unequipped'), 'info');
                            markCellDirty(groundPos.mapId, groundPos.x, groundPos.y);
                        }
                        updateBackpackPanel();
                        render();
                    };
                })(slotId);
                row.appendChild(unequipBtn);
                equipList.appendChild(row);
            }
        }
    }

    function openBackpackPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (backpackPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        backpackPanelOpen = true;
        document.getElementById('modal-backpack').classList.add('show');
        updateBackpackPanel();
        render();
    }
    function closeBackpackPanel() {
        if (!backpackPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        backpackPanelOpen = false;
        document.getElementById('modal-backpack').classList.remove('show');
        render();
    }
    if (document.getElementById('btn-backpack')) {
        document.getElementById('btn-backpack').addEventListener('click', function () {
            if (backpackPanelOpen) closeBackpackPanel(); else openBackpackPanel();
        });
    }
    if (document.getElementById('player-action-ground-items')) {
        document.getElementById('player-action-ground-items').addEventListener('click', function () {
            if (!backpackPanelOpen) openBackpackPanel();
        });
    }
    (function () {
        var btn = document.getElementById('btn-reset-demo-save');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var ok = window.confirm(ui('confirm.reset.demo'));
            if (!ok) return;
            try {
                if (window.SaveSystem && typeof window.SaveSystem.clearAllLocalProgress === 'function') {
                    window.SaveSystem.clearAllLocalProgress();
                } else {
                    localStorage.removeItem('cabi_realtime_save_v1');
                    localStorage.removeItem('cabi_demo_flags_v1');
                    localStorage.removeItem('cabi_demo_triggered_entries_v1');
                }
            } catch (e) { /* ignore */ }
            try { window.location.reload(); } catch (e2) { /* ignore */ }
        });
    })();
    if (document.getElementById('backpack-panel-close')) {
        document.getElementById('backpack-panel-close').addEventListener('click', closeBackpackPanel);
    }

    var combatPanelOpen = false;
    var combatUIState = {
        mode: 'skills',
        curCat: 'unarmed',
        curSkillId: null,
        curPart: 'rhand',
        curSlot: 'active',
        editingSlot: null,
        curAcupointCat: 'du',
        curAcupointId: null,
        acupointPage: 0
    };
    var LIMB_LABELS = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
    var LIMB_ICONS = { lhand: '🤚', rhand: '🤚', lfoot: '👣', rfoot: '👣' };

    var survivalPanelOpen = false;
    var acupointPanelOpen = false;
    var specialPanelOpen = false;
    var savePanelOpen = false;

    function getSaveCredentials() {
        var accEl = document.getElementById('save-input-account');
        var pwEl = document.getElementById('save-input-password');
        return {
            account: accEl && accEl.value ? String(accEl.value).trim() : '',
            password: pwEl && pwEl.value ? String(pwEl.value) : ''
        };
    }

    function openSavePanel() {
        if (savePanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        savePanelOpen = true;
        var modal = document.getElementById('modal-save');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
    }

    function closeSavePanel() {
        if (!savePanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        savePanelOpen = false;
        var modal = document.getElementById('modal-save');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    function openCombatPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (combatPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        combatPanelOpen = true;
        refreshRenderProfile();
        var firstCat = window.CombatSkills && window.CombatSkills.getCategories().length ? window.CombatSkills.getCategories()[0].id : 'unarmed';
        combatUIState.curCat = firstCat;
        var skillsInCat = window.CombatSkills ? window.CombatSkills.getSkillsByCategory(firstCat) : [];
        combatUIState.curSkillId = (skillsInCat.length && skillsInCat[0].id) ? skillsInCat[0].id : null;
        combatUIState.curPart = 'rhand';
        combatUIState.curSlot = 'active';
        combatUIState.editingSlot = null;
        combatUIState.mode = 'skills';
        document.getElementById('modal-combat').classList.add('show');
        document.getElementById('left-hud').style.opacity = '0.1';
        document.getElementById('left-hud').style.pointerEvents = 'none';
        renderCombatModal();
    }

    function closeCombatPanel() {
        if (!combatPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        combatPanelOpen = false;
        refreshRenderProfile();
        document.getElementById('modal-combat').classList.remove('show');
        document.getElementById('left-hud').style.opacity = '';
        document.getElementById('left-hud').style.pointerEvents = '';
        document.getElementById('picker-move').classList.remove('show');
        var postPicker = document.getElementById('picker-post-effect');
        if (postPicker) postPicker.classList.remove('show');
        combatUIState.editingSlot = null;
        render();
    }

    function getCombatSkillName(skillId) {
        if (!skillId) return ui('combat.empty');
        var sk = window.CombatSkills && window.CombatSkills.getSkill(skillId);
        return (sk && sk.name) ? sk.name : skillId;
    }

    function renderCombatModal() {
        var CS = window.CombatSkills;
        var AP = window.Acupoints;
        var combatState = IE && IE.getCombatState ? IE.getCombatState() : { limbs: {}, hubs: { breath: null, footwork: null }, move_sequences: {}, skill_move_sequences: {}, post_effect_sequences: {} };
        var limbIds = IE && IE.COMBAT_LIMB_IDS ? IE.COMBAT_LIMB_IDS.slice() : ['lhand', 'rhand', 'lfoot', 'rfoot'];

        var mainTabs = document.querySelectorAll('#modal-combat .combat-main-tab');
        var isAcupointMode = combatUIState.mode === 'acupoints';

        if (mainTabs && mainTabs.length) {
            mainTabs.forEach(function (btn) {
                var mode = btn.getAttribute('data-mode') || 'skills';
                btn.classList.toggle('active', combatUIState.mode === mode);
                btn.onclick = function () {
                    combatUIState.mode = mode;
                    if (mode === 'acupoints') combatUIState.acupointPage = 0;
                    renderCombatModal();
                };
            });
        }

        var catBox = document.getElementById('category-tabs');
        var skillListEl = document.getElementById('skill-list');
        var acListEl = document.getElementById('acupoint-list');

        if (catBox) catBox.innerHTML = '';
        if (skillListEl) {
            skillListEl.style.display = isAcupointMode ? 'none' : 'flex';
            if (!isAcupointMode) skillListEl.innerHTML = '';
        }
        if (acListEl) {
            acListEl.style.display = isAcupointMode ? 'flex' : 'none';
            if (isAcupointMode) acListEl.innerHTML = '';
        }

        if (CS && !isAcupointMode) {
            var cats = CS.getCategories();
            if (catBox) {
                cats.forEach(function (c) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'combat-cat-btn' + (combatUIState.curCat === c.id ? ' active' : '');
                    btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                    btn.onclick = function () {
                        combatUIState.curCat = c.id;
                        var list = CS.getSkillsByCategory(c.id);
                        combatUIState.curSkillId = (list.length && list[0]) ? list[0].id : null;
                        renderCombatModal();
                    };
                    catBox.appendChild(btn);
                });
            }

            if (skillListEl) {
                var list = CS.getSkillsByCategory(combatUIState.curCat);
                list.forEach(function (s) {
                    var div = document.createElement('div');
                    div.className = 'combat-skill-item' + (combatUIState.curSkillId === s.id ? ' selected' : '');
                    var level = IE && IE.getSkillLevel ? IE.getSkillLevel(s.id) : 0;
                    var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
                    var moveUsage = (skillsState[s.id] && skillsState[s.id].move_usage) ? skillsState[s.id].move_usage : {};
                    var profPct = Math.floor(CS.getSkillTotalProficiency(s.id, moveUsage) * 100);
                    var metaStr = (s.category === 'footwork')
                        ? ui('combat.skill.meta.footwork', { level: level })
                        : ui('combat.skill.meta', { level: level, profPct: profPct });
                    div.innerHTML = '<div class="skill-icon">' + (s.icon || '') + '</div><div class="skill-info"><div class="skill-name">' + (s.name || s.id) + '</div><div class="skill-meta">' + metaStr + '</div></div>';
                    div.onclick = function () {
                        combatUIState.curSkillId = s.id;
                        renderCombatModal();
                    };
                    skillListEl.appendChild(div);
                });
            }
        }

        var hubBreath = document.getElementById('hub-breath');
        var hubFootwork = document.getElementById('hub-footwork');
        var valBreath = document.getElementById('val-breath');
        var valFootwork = document.getElementById('val-footwork');
        if (hubBreath) hubBreath.classList.toggle('active', !!combatState.hubs.breath);
        if (hubFootwork) hubFootwork.classList.toggle('active', !!combatState.hubs.footwork);
        if (valBreath) { valBreath.textContent = getCombatSkillName(combatState.hubs.breath) || ui('combat.not.loaded'); valBreath.classList.toggle('empty', !combatState.hubs.breath); }
        if (valFootwork) { valFootwork.textContent = getCombatSkillName(combatState.hubs.footwork) || ui('combat.not.loaded'); valFootwork.classList.toggle('empty', !combatState.hubs.footwork); }

        var limbBox = document.getElementById('limb-container');
        if (limbBox && combatState.limbs) {
            limbBox.innerHTML = '';
            var isGlobal = combatUIState.curCat === 'breath' || combatUIState.curCat === 'footwork';
            limbBox.style.opacity = isGlobal ? '0.2' : '1';
            limbBox.style.pointerEvents = isGlobal ? 'none' : 'auto';
            limbIds.forEach(function (lid) {
                var limb = combatState.limbs[lid] || { active: null, parry: null, priority: 1 };
                var div = document.createElement('div');
                div.className = 'combat-limb-item';
                var activeName = getCombatSkillName(limb.active);
                var parryName = getCombatSkillName(limb.parry);
                var isActiveSel = combatUIState.curPart === lid && combatUIState.curSlot === 'active';
                var isParrySel = combatUIState.curPart === lid && combatUIState.curSlot === 'parry';
                div.innerHTML = '<div class="limb-header"><span>' + (LIMB_ICONS[lid] || '') + ' ' + ui(LIMB_LABELS[lid] || lid) + '</span><span class="limb-priority">' + ui('combat.priority', { v: (limb.priority || 1) }) + '</span></div><div class="limb-slots"><div class="combat-limb-slot' + (isActiveSel ? ' selected' : '') + '" data-part="' + lid + '" data-slot="active"><span class="slot-type">' + ui('combat.slot.active') + '</span><span class="slot-skill">' + activeName + '</span></div><div class="combat-limb-slot' + (isParrySel ? ' selected' : '') + '" data-part="' + lid + '" data-slot="parry"><span class="slot-type">' + ui('combat.slot.parry') + '</span><span class="slot-skill">' + parryName + '</span></div></div>';
                div.querySelectorAll('.combat-limb-slot').forEach(function (slotEl) {
                    slotEl.onclick = function () {
                        combatUIState.curPart = slotEl.getAttribute('data-part');
                        combatUIState.curSlot = slotEl.getAttribute('data-slot');
                        renderCombatModal();
                    };
                });
                limbBox.appendChild(div);
            });
        }

        var selSkill = CS && combatUIState.curSkillId ? CS.getSkill(combatUIState.curSkillId) : null;
        var titleEl = document.getElementById('skill-title');
        var levelEl = document.getElementById('skill-level');
        var profEl = document.getElementById('skill-prof');
        if (titleEl) {
            if (!isAcupointMode) {
                titleEl.textContent = selSkill ? selSkill.name : '--';
            } else if (AP && combatUIState.curAcupointId) {
                var catId = combatUIState.curAcupointCat;
                var listApTitle = AP.getAcupointsByCategory(catId);
                var curAp = listApTitle.find(function (x) { return x.id === combatUIState.curAcupointId; });
                titleEl.textContent = curAp ? curAp.name : '--';
            } else {
                titleEl.textContent = '--';
            }
        }
        var skillLevel = IE && combatUIState.curSkillId ? IE.getSkillLevel(combatUIState.curSkillId) : 0;
        var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        var moveUsage = (combatUIState.curSkillId && skillsState[combatUIState.curSkillId] && skillsState[combatUIState.curSkillId].move_usage) ? skillsState[combatUIState.curSkillId].move_usage : {};
        var profPct = selSkill && CS && selSkill.category !== 'footwork' ? Math.floor(CS.getSkillTotalProficiency(combatUIState.curSkillId, moveUsage) * 100) : 0;
        if (levelEl) levelEl.textContent = ui('combat.level', { v: skillLevel });
        if (profEl) profEl.textContent = (selSkill && selSkill.category === 'footwork') ? ui('combat.prof.not_applicable') : ui('combat.prof.total', { v: profPct });

        // Deploy slot validation:
        // - 进攻槽（active）只能放非招架技能
        // - 招架槽（parry）只能放招架技能（only_parry / category=parry）
        var btnDeploy = document.getElementById('btn-deploy-combat');
        if (btnDeploy) {
            var canDeploy = true;
            if (isAcupointMode) {
                canDeploy = !!combatUIState.curAcupointId;
            } else if (combatUIState.curCat !== 'breath' && combatUIState.curCat !== 'footwork') {
                if (!selSkill) {
                    canDeploy = false;
                } else {
                    var skillIsParry = !!(selSkill.only_parry || selSkill.category === 'parry');
                    var slotIsParry = combatUIState.curSlot === 'parry';
                    canDeploy = (skillIsParry === slotIsParry);
                }
            }
            btnDeploy.disabled = !canDeploy;
        }

        function getPostEffectName(postId) {
            if (!postId || !window.CombatPostEffects || typeof window.CombatPostEffects.getPostEffect !== 'function') return '';
            var pe = window.CombatPostEffects.getPostEffect(postId);
            if (!pe) return String(postId);
            if (pe.name_key && window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(pe.name_key);
            return pe.id || String(postId);
        }

        function getLimbPostEffectMap(combatState, limbId) {
            if (!combatState || !combatState.post_effect_sequences || !combatState.post_effect_sequences[limbId]) return {};
            return combatState.post_effect_sequences[limbId];
        }

        function isPostEffectDuplicateOnLimb(combatState, limbId, postId, curSkillId, curSlotIndex) {
            if (!postId) return false;
            var limbMap = getLimbPostEffectMap(combatState, limbId);
            for (var sid in limbMap) {
                if (!Object.prototype.hasOwnProperty.call(limbMap, sid) || !Array.isArray(limbMap[sid])) continue;
                var arr = limbMap[sid];
                for (var pi = 0; pi < arr.length; pi++) {
                    if (sid === curSkillId && pi === curSlotIndex) continue;
                    if (arr[pi] === postId) return true;
                }
            }
            return false;
        }

        var seqBox = document.getElementById('move-sequence');
        if (!isAcupointMode && seqBox && selSkill && selSkill.moves && selSkill.moves.length && selSkill.category !== 'breath' && selSkill.category !== 'footwork' && selSkill.category !== 'parry') {
            seqBox.innerHTML = '';
            var maxSlots = CS.getMaxSlotsForLevel(combatUIState.curSkillId, skillLevel);
            var unlocked = CS.getUnlockedMoves(combatUIState.curSkillId, skillLevel);
            var seq = (combatState.skill_move_sequences && combatState.skill_move_sequences[combatUIState.curSkillId]) ? combatState.skill_move_sequences[combatUIState.curSkillId].slice() : [];
            var limbIdForPost = combatUIState.curPart || 'lhand';
            var postMap = getLimbPostEffectMap(combatState, limbIdForPost);
            var postSeq = (postMap && postMap[combatUIState.curSkillId] && Array.isArray(postMap[combatUIState.curSkillId])) ? postMap[combatUIState.curSkillId].slice() : [];
            while (seq.length < maxSlots) seq.push(unlocked.length ? unlocked[0].id : '');
            seq = seq.slice(0, maxSlots);
            while (postSeq.length < maxSlots) postSeq.push(null);
            postSeq = postSeq.slice(0, maxSlots);
            for (var i = 0; i < maxSlots; i++) {
                var moveId = seq[i] || (unlocked[0] ? unlocked[0].id : '');
                var moveObj = unlocked.find(function (m) { return m.id === moveId; }) || unlocked[0];
                var moveName = moveObj ? moveObj.name : moveId;
                var useCount = (moveUsage && moveObj && moveUsage[moveObj.id] != null) ? moveUsage[moveObj.id] : 0;
                var nodeProf = moveObj ? Math.floor(CS.getMoveProficiencyRatio(useCount) * 100) : 0;
                var postIdAtSlot = postSeq[i] || null;
                var postText = postIdAtSlot ? getPostEffectName(postIdAtSlot) : '无后遗症';
                var slotCap = moveObj && moveObj.post_effect_slot_max != null ? Math.max(0, parseInt(moveObj.post_effect_slot_max, 10) || 0) : 0;
                var node = document.createElement('div');
                node.className = 'combat-move-node' + (combatUIState.editingSlot === i ? ' editing' : '');
                node.innerHTML = '<span class="node-index">' + String(i + 1).padStart(2, '0') + '</span><span class="node-name">' + moveName + '</span><span class="node-prof">' + ui('combat.prof.node', { v: nodeProf }) + '</span><span class="node-post' + (postIdAtSlot ? '' : ' empty') + '">' + postText + '</span>';

                var btnPost = document.createElement('button');
                btnPost.type = 'button';
                btnPost.className = 'btn-post-slot';
                btnPost.textContent = '后遗症';
                if (slotCap < 1 || !moveObj || !moveObj.id) {
                    btnPost.disabled = true;
                    btnPost.title = '该招式没有后遗症槽位';
                } else {
                    btnPost.onclick = function (slotIdx, anchorEl, moveEntry, limbId, skillId) {
                        return function (e) {
                            e.stopPropagation();
                            openPostEffectPicker(slotIdx, anchorEl, moveEntry, limbId, skillId);
                        };
                    }(i, node, moveObj, limbIdForPost, combatUIState.curSkillId);
                }
                node.appendChild(btnPost);

                // Debug: 一键让该招式熟练度 +10%（用于测试 post-effects）
                var debugBtn = document.createElement('button');
                debugBtn.type = 'button';
                debugBtn.className = 'debug-move-prof-btn';
                debugBtn.textContent = '+10%';
                var thisMoveId = moveObj && moveObj.id ? String(moveObj.id) : '';
                debugBtn.disabled = !thisMoveId;
                debugBtn.onclick = function (skillId, mid, moveTemplate) {
                    return function (e) {
                        e.stopPropagation();
                        if (!skillId || !mid) return;
                        var curLevel = IE.getSkillLevel(skillId);
                        if (curLevel < 1) {
                            var st = IE.getState();
                            if (!st.skills || typeof st.skills !== 'object') st.skills = {};
                            if (!st.skills[skillId] || typeof st.skills[skillId] !== 'object') st.skills[skillId] = { level: 1, move_usage: {} };
                            if (st.skills[skillId].level == null) st.skills[skillId].level = 1;
                            if (!st.skills[skillId].move_usage || typeof st.skills[skillId].move_usage !== 'object') st.skills[skillId].move_usage = {};
                        }

                        var maxU = (moveTemplate && moveTemplate.proficiency_max_uses != null)
                            ? moveTemplate.proficiency_max_uses
                            : (CS && typeof CS.getMoveProficiencyMax === 'function' ? CS.getMoveProficiencyMax() : 50000);
                        var dUses = Math.floor(Number(maxU) * 0.1);
                        if (!isFinite(dUses) || dUses <= 0) dUses = 1;
                        IE.incrementSkillMoveUsage(skillId, mid, dUses);
                        renderCombatModal();
                    };
                }(combatUIState.curSkillId, thisMoveId, moveObj);
                node.appendChild(debugBtn);
                node.onclick = function (idx, el) {
                    return function (e) {
                        e.stopPropagation();
                        combatUIState.editingSlot = idx;
                        openMovePicker(idx, el);
                        renderCombatModal();
                    };
                }(i, node);
                seqBox.appendChild(node);
            }
        } else if (seqBox) {
            seqBox.innerHTML = '';
        }

        var targetEl = document.getElementById('target-indicator');
        if (targetEl) {
            if (!isAcupointMode) {
                if (combatUIState.curCat === 'breath') targetEl.textContent = ui('combat.target.hub.breath');
                else if (combatUIState.curCat === 'footwork') targetEl.textContent = ui('combat.target.hub.footwork');
                else targetEl.textContent = ui('combat.target.limb', { limb: ui(LIMB_LABELS[combatUIState.curPart] || combatUIState.curPart), slot: ui(combatUIState.curSlot === 'active' ? 'combat.slot.active' : 'combat.slot.parry') });
            } else {
                targetEl.textContent = ui('combat.target.acupoint');
            }
        }

        if (AP && isAcupointMode && catBox && acListEl) {
            var acCats = AP.getCategories();
            if (!combatUIState.curAcupointCat && acCats.length) combatUIState.curAcupointCat = acCats[0].id;
            acCats.forEach(function (c) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'combat-cat-btn' + (combatUIState.curAcupointCat === c.id ? ' active' : '');
                btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                btn.onclick = function () {
                    combatUIState.curAcupointCat = c.id;
                    combatUIState.acupointPage = 0;
                    var listAp2 = AP.getAcupointsByCategory(c.id);
                    combatUIState.curAcupointId = listAp2.length ? listAp2[0].id : null;
                    renderCombatModal();
                };
                catBox.appendChild(btn);
            });

            var listAp = AP.getAcupointsByCategory(combatUIState.curAcupointCat);
            var pageSize = 18;
            var total = listAp.length;
            var maxPage = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0;
            if (combatUIState.acupointPage > maxPage) combatUIState.acupointPage = maxPage;
            if (combatUIState.acupointPage < 0) combatUIState.acupointPage = 0;
            var start = combatUIState.acupointPage * pageSize;
            var end = Math.min(start + pageSize, total);

            for (var i = start; i < end; i++) {
                var a = listAp[i];
                var div = document.createElement('div');
                var isSel = combatUIState.curAcupointId === a.id;
                div.className = 'combat-acupoint-item' + (isSel ? ' selected' : '');
                var meta = ui(AP.isUnlocked(a.id) ? 'acupoint.meta.unlocked' : 'acupoint.meta.locked', { effects: (a.effectsText || '') });
                div.innerHTML = '<div class="acupoint-name">' + a.name + '</div><div class="acupoint-meta">' + meta + '</div>';
                div.onclick = function (id) {
                    return function () {
                        combatUIState.curAcupointId = id;
                        renderCombatModal();
                    };
                }(a.id);
                acListEl.appendChild(div);
            }

            if (total > pageSize) {
                var pager = document.createElement('div');
                pager.style.marginTop = '8px';
                pager.style.display = 'flex';
                pager.style.justifyContent = 'space-between';
                pager.style.alignItems = 'center';
                pager.style.fontSize = '11px';
                pager.style.color = '#a8a29e';

                var btnPrev = document.createElement('button');
                btnPrev.type = 'button';
                btnPrev.textContent = ui('pager.prev');
                btnPrev.disabled = combatUIState.acupointPage <= 0;
                btnPrev.style.padding = '4px 10px';
                btnPrev.style.borderRadius = '9999px';
                btnPrev.style.border = '1px solid #4d3f35';
                btnPrev.style.background = '#120e0c';
                btnPrev.style.color = '#e8e6e3';
                btnPrev.style.cursor = btnPrev.disabled ? 'default' : 'pointer';
                if (!btnPrev.disabled) {
                    btnPrev.onclick = function () {
                        combatUIState.acupointPage--;
                        renderCombatModal();
                    };
                } else {
                    btnPrev.style.opacity = '0.4';
                }

                var info = document.createElement('span');
                info.textContent = ui('pager.info', { cur: (combatUIState.acupointPage + 1), max: (maxPage + 1), total: total });

                var btnNext = document.createElement('button');
                btnNext.type = 'button';
                btnNext.textContent = ui('pager.next');
                btnNext.disabled = combatUIState.acupointPage >= maxPage;
                btnNext.style.padding = '4px 10px';
                btnNext.style.borderRadius = '9999px';
                btnNext.style.border = '1px solid #4d3f35';
                btnNext.style.background = '#120e0c';
                btnNext.style.color = '#e8e6e3';
                btnNext.style.cursor = btnNext.disabled ? 'default' : 'pointer';
                if (!btnNext.disabled) {
                    btnNext.onclick = function () {
                        combatUIState.acupointPage++;
                        renderCombatModal();
                    };
                } else {
                    btnNext.style.opacity = '0.4';
                }

                pager.appendChild(btnPrev);
                pager.appendChild(info);
                pager.appendChild(btnNext);
                acListEl.appendChild(pager);
            }
        }
    }

    function openMovePicker(idx, anchorEl) {
        var CS = window.CombatSkills;
        var picker = document.getElementById('picker-move');
        var listEl = document.getElementById('picker-list');
        if (!picker || !listEl || !CS || !combatUIState.curSkillId) return;
        var skillLevel = IE ? IE.getSkillLevel(combatUIState.curSkillId) : 0;
        var unlocked = CS.getUnlockedMoves(combatUIState.curSkillId, skillLevel);
        var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        var moveUsage = (combatUIState.curSkillId && skillsState[combatUIState.curSkillId] && skillsState[combatUIState.curSkillId].move_usage) ? skillsState[combatUIState.curSkillId].move_usage : {};
        listEl.innerHTML = '';
        unlocked.forEach(function (m) {
            var count = moveUsage[m.id] != null ? moveUsage[m.id] : 0;
            var pct = Math.floor(CS.getMoveProficiencyRatio(count) * 100);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = '<span>' + m.name + '</span><span class="move-prof">' + ui('combat.prof.short', { v: pct }) + '</span>';
            btn.onclick = function () {
                var combat = IE.getCombatState();
                if (!combat.skill_move_sequences[combatUIState.curSkillId]) combat.skill_move_sequences[combatUIState.curSkillId] = [];
                var seq = combat.skill_move_sequences[combatUIState.curSkillId];
                while (seq.length <= idx) seq.push(unlocked[0] ? unlocked[0].id : '');
                seq[idx] = m.id;
                IE.setCombatState({ skill_move_sequences: combat.skill_move_sequences });

                // 招式替换后，若该槽已装配后遗症但不再匹配 valid_*，则自动清空该槽
                var limbId = combatUIState.curPart || 'lhand';
                var postSeqMap = (combat.post_effect_sequences && combat.post_effect_sequences[limbId]) ? combat.post_effect_sequences[limbId] : null;
                var postSeq = postSeqMap && Array.isArray(postSeqMap[combatUIState.curSkillId]) ? postSeqMap[combatUIState.curSkillId] : null;
                if (postSeq && postSeq[idx] && window.CombatPostEffects && typeof window.CombatPostEffects.getPostEffect === 'function') {
                    var pe = window.CombatPostEffects.getPostEffect(postSeq[idx]);
                    var mismatch = false;
                    if (pe && Array.isArray(pe.valid_skill_ids) && pe.valid_skill_ids.length && pe.valid_skill_ids.indexOf(combatUIState.curSkillId) < 0) mismatch = true;
                    if (pe && Array.isArray(pe.valid_move_ids) && pe.valid_move_ids.length && pe.valid_move_ids.indexOf(m.id) < 0) mismatch = true;
                    if (mismatch) {
                        postSeq[idx] = null;
                        IE.setCombatState({ post_effect_sequences: combat.post_effect_sequences });
                    }
                }
                combatUIState.editingSlot = null;
                picker.classList.remove('show');
                renderCombatModal();
            };
            listEl.appendChild(btn);
        });
        var rect = anchorEl.getBoundingClientRect();
        picker.style.left = (rect.left) + 'px';
        picker.style.top = (rect.top - 200) + 'px';
        picker.classList.add('show');
    }

    function openPostEffectPicker(slotIdx, anchorEl, moveObj, limbId, skillId) {
        var picker = document.getElementById('picker-post-effect');
        var listEl = document.getElementById('picker-post-effect-list');
        if (!picker || !listEl || !moveObj || !moveObj.id || !limbId || !skillId || !IE) return;
        listEl.innerHTML = '';

        var postCap = moveObj.post_effect_slot_max != null ? Math.max(0, parseInt(moveObj.post_effect_slot_max, 10) || 0) : 0;
        if (postCap < 1) return;

        var obtainedIds = (window.CharacterAttributes && typeof window.CharacterAttributes.getPostEffectsObtainedIds === 'function')
            ? window.CharacterAttributes.getPostEffectsObtainedIds()
            : [];
        var allPost = (window.CombatPostEffects && typeof window.CombatPostEffects.getAllPostEffects === 'function')
            ? window.CombatPostEffects.getAllPostEffects()
            : [];
        var combat = IE.getCombatState ? IE.getCombatState() : null;
        if (!combat) return;
        if (!combat.post_effect_sequences || typeof combat.post_effect_sequences !== 'object') combat.post_effect_sequences = {};
        if (!combat.post_effect_sequences[limbId] || typeof combat.post_effect_sequences[limbId] !== 'object') combat.post_effect_sequences[limbId] = {};
        var postSeq = combat.post_effect_sequences[limbId][skillId];
        if (!Array.isArray(postSeq)) postSeq = [];
        while (postSeq.length <= slotIdx) postSeq.push(null);

        function isDuplicateOnLimb(postId) {
            var limbMap = combat.post_effect_sequences[limbId] || {};
            for (var sid in limbMap) {
                if (!Object.prototype.hasOwnProperty.call(limbMap, sid) || !Array.isArray(limbMap[sid])) continue;
                for (var i = 0; i < limbMap[sid].length; i++) {
                    if (sid === skillId && i === slotIdx) continue;
                    if (limbMap[sid][i] === postId) return true;
                }
            }
            return false;
        }

        function isAllowedBySocket(pe) {
            if (!pe) return false;
            if (Array.isArray(pe.valid_skill_ids) && pe.valid_skill_ids.length && pe.valid_skill_ids.indexOf(skillId) < 0) return false;
            if (Array.isArray(pe.valid_move_ids) && pe.valid_move_ids.length && pe.valid_move_ids.indexOf(moveObj.id) < 0) return false;
            return true;
        }

        function addOption(label, desc, onClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = '<span>' + label + '</span>' + (desc ? ('<span class="post-desc">' + desc + '</span>') : '');
            btn.onclick = onClick;
            listEl.appendChild(btn);
        }

        addOption('清空槽位', '移除当前装配', function () {
            postSeq[slotIdx] = null;
            combat.post_effect_sequences[limbId][skillId] = postSeq.slice();
            IE.setCombatState({ post_effect_sequences: combat.post_effect_sequences });
            picker.classList.remove('show');
            renderCombatModal();
        });

        var hasAny = false;
        for (var ai = 0; ai < allPost.length; ai++) {
            var pe = allPost[ai];
            if (!pe || !pe.id) continue;
            if (obtainedIds.indexOf(pe.id) < 0) continue;
            if (!isAllowedBySocket(pe)) continue;
            hasAny = true;
            var name = pe.name_key && window.UIText && typeof window.UIText.t === 'function' ? window.UIText.t(pe.name_key) : pe.id;
            var desc = pe.desc_key && window.UIText && typeof window.UIText.t === 'function' ? window.UIText.t(pe.desc_key) : '';
            addOption(name, desc, (function (postId) {
                return function () {
                    if (isDuplicateOnLimb(postId)) {
                        showMsg('同一肢体上同一后遗症只能装配 1 份。', 'warn');
                        return;
                    }
                    postSeq[slotIdx] = postId;
                    combat.post_effect_sequences[limbId][skillId] = postSeq.slice();
                    IE.setCombatState({ post_effect_sequences: combat.post_effect_sequences });
                    picker.classList.remove('show');
                    renderCombatModal();
                };
            })(pe.id));
        }

        if (!hasAny) {
            addOption('暂无可装后遗症', '先通过熟练度解锁并满足该招式可装配限制', function () {});
            listEl.lastChild.disabled = true;
        }

        var rect = anchorEl.getBoundingClientRect();
        picker.style.left = (rect.left) + 'px';
        picker.style.top = (rect.top - 260) + 'px';
        picker.classList.add('show');
    }

    function handleDeployCombat() {
        var CS = window.CombatSkills;
        var AP = window.Acupoints;

        if (combatUIState.mode === 'acupoints') {
            if (!AP || !combatUIState.curAcupointId) return;
            var changed = AP.unlock(combatUIState.curAcupointId);
            if (changed && window.GameLog) {
                window.GameLog.log(ui('log.system.acupoint.unlocked', { id: combatUIState.curAcupointId }), 'system');
            }
            renderCombatModal();
            return;
        }

        var skillId = combatUIState.curSkillId;
        if (!skillId || !IE || !IE.setCombatState) return;
        var sk = CS && CS.getSkill(skillId);
        if (!sk) return;
        var combat = IE.getCombatState();
        if (combatUIState.curCat === 'breath') {
            combat.hubs.breath = skillId;
            IE.setCombatState({ hubs: { breath: skillId } });
        } else if (combatUIState.curCat === 'footwork') {
            combat.hubs.footwork = skillId;
            IE.setCombatState({ hubs: { footwork: skillId } });
        } else {
            var slotIsParry = combatUIState.curSlot === 'parry';
            var skillIsParry = !!(sk.only_parry || sk.category === 'parry');
            if (slotIsParry !== skillIsParry) {
                showMsg(slotIsParry ? '该槽位只能装配招架技能。' : '招架技能不能装配到进攻槽位。', 'warn');
                return;
            }
            combat.limbs[combatUIState.curPart][combatUIState.curSlot] = skillId;
            IE.setCombatState({ limbs: combat.limbs });
            var seq = (combat.skill_move_sequences && combat.skill_move_sequences[skillId]) ? combat.skill_move_sequences[skillId].slice() : [];
            if (seq.length) {
                var moveSeqs = {};
                moveSeqs[combatUIState.curPart] = seq;
                IE.setCombatState({ move_sequences: moveSeqs });
            }
        }
        if (window.GameLog) window.GameLog.log(ui('log.system.combat.deployed', { name: (sk.name || skillId) }), 'system');
        renderCombatModal();
    }

    if (document.getElementById('btn-combat')) {
        document.getElementById('btn-combat').addEventListener('click', function () {
            if (combatPanelOpen) closeCombatPanel(); else openCombatPanel();
        });
    }
    if (document.getElementById('combat-modal-close')) {
        document.getElementById('combat-modal-close').addEventListener('click', closeCombatPanel);
    }
    if (document.getElementById('btn-deploy-combat')) {
        document.getElementById('btn-deploy-combat').addEventListener('click', handleDeployCombat);
    }
    if (document.getElementById('btn-debug-combat-skill-plus50')) {
        document.getElementById('btn-debug-combat-skill-plus50').addEventListener('click', function () {
            var skillId = combatUIState.curSkillId;
            if (!skillId || !IE || typeof IE.getState !== 'function') return;
            var st = IE.getState();
            if (!st.skills || typeof st.skills !== 'object') st.skills = {};
            if (!st.skills[skillId] || typeof st.skills[skillId] !== 'object') st.skills[skillId] = { level: 0, move_usage: {} };

            var curLv = IE.getSkillLevel(skillId);
            st.skills[skillId].level = Math.max(0, parseInt(curLv, 10) || 0) + 50;
            if (!st.skills[skillId].move_usage || typeof st.skills[skillId].move_usage !== 'object') st.skills[skillId].move_usage = {};

            if (window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function') {
                window.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return IE.getState().equipment; },
                    getSkillsState: function () { return IE.getState().skills; },
                    getItemTemplate: IE.getItemTemplate,
                    getEnchantEntry: IE.getEnchantEntry,
                    getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
                });
            }
            if (typeof updateStatusPanel === 'function') updateStatusPanel();
            if (combatPanelOpen) refreshRenderProfile();
            renderCombatModal();
        });
    }
    document.addEventListener('click', function () {
        var hadOpenPicker = false;
        var movePickerAny = document.getElementById('picker-move');
        var postPickerAny = document.getElementById('picker-post-effect');
        if (movePickerAny && movePickerAny.classList.contains('show')) hadOpenPicker = true;
        if (postPickerAny && postPickerAny.classList.contains('show')) hadOpenPicker = true;
        if (combatUIState.editingSlot != null) {
            combatUIState.editingSlot = null;
            var picker = document.getElementById('picker-move');
            if (picker) picker.classList.remove('show');
            var postPicker = document.getElementById('picker-post-effect');
            if (postPicker) postPicker.classList.remove('show');
            if (combatPanelOpen) renderCombatModal();
            return;
        }
        if (hadOpenPicker) {
            if (movePickerAny) movePickerAny.classList.remove('show');
            if (postPickerAny) postPickerAny.classList.remove('show');
        }
    });

    function renderSurvivalModal() {
        var wrap = document.getElementById('survival-skill-table');
        if (!wrap) return;
        wrap.innerHTML = '';
        var list = (window.SurvivalSkills && typeof window.SurvivalSkills.getAll === 'function')
            ? window.SurvivalSkills.getAll()
            : [];
        var IE = window.InventoryEquipment;
        list.forEach(function (sk) {
            var row = document.createElement('div');
            row.className = 'survival-row';
            var nameEl = document.createElement('div');
            nameEl.className = 'survival-name';
            nameEl.textContent = sk.name;
            var levelEl = document.createElement('div');
            levelEl.className = 'survival-level';
            var lv = IE && typeof IE.getSkillLevel === 'function'
                ? IE.getSkillLevel(sk.id)
                : 0;
            levelEl.textContent = (lv || 0) + ' 级';
            row.appendChild(nameEl);
            row.appendChild(levelEl);
            wrap.appendChild(row);
        });
    }

    function renderAcupointModal() {
        var AP = window.Acupoints;
        var catBox = document.getElementById('acupoint-cat-tabs');
        var table = document.getElementById('acupoint-table');
        var pagerBox = document.getElementById('acupoint-pager');
        if (!AP || !catBox || !table) return;

        catBox.innerHTML = '';
        table.innerHTML = '';
        if (pagerBox) pagerBox.innerHTML = '';

        var acCats = AP.getCategories ? AP.getCategories() : [];
        if (!combatUIState.curAcupointCat && acCats.length) combatUIState.curAcupointCat = acCats[0].id;

        catBox.style.display = 'flex';
        catBox.style.flexWrap = 'wrap';
        catBox.style.gap = '8px';
        catBox.style.marginBottom = '12px';

        acCats.forEach(function (c) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'combat-cat-btn' + (combatUIState.curAcupointCat === c.id ? ' active' : '');
            btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
            btn.onclick = function () {
                combatUIState.curAcupointCat = c.id;
                combatUIState.acupointPage = 0;
                var listAp2 = AP.getAcupointsByCategory(c.id);
                combatUIState.curAcupointId = listAp2.length ? listAp2[0].id : null;
                renderAcupointModal();
            };
            catBox.appendChild(btn);
        });

        var listAp = AP.getAcupointsByCategory(combatUIState.curAcupointCat);
        var pageSize = 18;
        var total = listAp.length;
        var maxPage = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0;
        if (combatUIState.acupointPage > maxPage) combatUIState.acupointPage = maxPage;
        if (combatUIState.acupointPage < 0) combatUIState.acupointPage = 0;
        var start = combatUIState.acupointPage * pageSize;
        var end = Math.min(start + pageSize, total);

        for (var i = start; i < end; i++) {
            var a = listAp[i];
            var row = document.createElement('div');
            var unlocked = AP.isUnlocked ? AP.isUnlocked(a.id) : false;
            row.className = 'survival-row';

            var infoWrap = document.createElement('div');
            infoWrap.className = 'acupoint-info';

            var nameEl = document.createElement('div');
            nameEl.className = 'acupoint-name-main';
            nameEl.textContent = a.name;

            var metaEl = document.createElement('div');
            metaEl.className = 'acupoint-meta';
            var metaText = ui(unlocked ? 'acupoint.meta.unlocked' : 'acupoint.meta.locked', { effects: (a.effectsText || '') });
            metaEl.textContent = metaText;

            infoWrap.appendChild(nameEl);
            infoWrap.appendChild(metaEl);
            row.appendChild(infoWrap);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'acupoint-unlock-btn' + (unlocked ? ' unlocked' : '');
            btn.textContent = unlocked ? ui('acupoint.btn.unlocked') : ui('acupoint.btn.unlock');
            btn.disabled = !!unlocked;
            if (!unlocked) {
                (function (acupointId, acupointName) {
                    btn.onclick = function () {
                        if (!AP || !AP.unlock) return;
                        var changed = AP.unlock(acupointId);
                        if (changed) {
                            if (window.GameLog) {
                                window.GameLog.log(
                                    ui('log.system.acupoint.unlocked', { id: (acupointName || acupointId) }),
                                    'system'
                                );
                            }
                            if (window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function' && window.InventoryEquipment) {
                                window.CharacterAttributes.recalcCharacterStats({
                                    getEquipmentState: function () { return window.InventoryEquipment.getState().equipment; },
                                    getSkillsState: function () { return window.InventoryEquipment.getState().skills; },
                                    getItemTemplate: window.InventoryEquipment.getItemTemplate,
                                    getEnchantEntry: window.InventoryEquipment.getEnchantEntry,
                                    getStrengthLevel: function () { return window.InventoryEquipment.getSkillLevel('survival_strength'); }
                                });
                            }
                            if (typeof updateStatusPanel === 'function') {
                                updateStatusPanel();
                            }
                        }
                        renderAcupointModal();
                    };
                })(a.id, a.name);
            }
            row.appendChild(btn);

            table.appendChild(row);
        }

        if (pagerBox && total > pageSize) {
            pagerBox.innerHTML = '';
            pagerBox.style.marginTop = '8px';
            pagerBox.style.display = 'flex';
            pagerBox.style.justifyContent = 'space-between';
            pagerBox.style.alignItems = 'center';
            pagerBox.style.fontSize = '11px';
            pagerBox.style.color = '#a8a29e';

            var btnPrev = document.createElement('button');
            btnPrev.type = 'button';
            btnPrev.textContent = ui('pager.prev');
            btnPrev.disabled = combatUIState.acupointPage <= 0;
            btnPrev.style.padding = '4px 10px';
            btnPrev.style.borderRadius = '9999px';
            btnPrev.style.border = '1px solid #4d3f35';
            btnPrev.style.background = '#120e0c';
            btnPrev.style.color = '#e8e6e3';
            btnPrev.style.cursor = btnPrev.disabled ? 'default' : 'pointer';
            if (!btnPrev.disabled) {
                btnPrev.onclick = function () {
                    combatUIState.acupointPage--;
                    renderAcupointModal();
                };
            } else {
                btnPrev.style.opacity = '0.4';
            }

            var info = document.createElement('span');
            info.textContent = ui('pager.info', { cur: (combatUIState.acupointPage + 1), max: (maxPage + 1), total: total });

            var btnNext = document.createElement('button');
            btnNext.type = 'button';
            btnNext.textContent = ui('pager.next');
            btnNext.disabled = combatUIState.acupointPage >= maxPage;
            btnNext.style.padding = '4px 10px';
            btnNext.style.borderRadius = '9999px';
            btnNext.style.border = '1px solid #4d3f35';
            btnNext.style.background = '#120e0c';
            btnNext.style.color = '#e8e6e3';
            btnNext.style.cursor = btnNext.disabled ? 'default' : 'pointer';
            if (!btnNext.disabled) {
                btnNext.onclick = function () {
                    combatUIState.acupointPage++;
                    renderAcupointModal();
                };
            } else {
                btnNext.style.opacity = '0.4';
            }

            pagerBox.appendChild(btnPrev);
            pagerBox.appendChild(info);
            pagerBox.appendChild(btnNext);
        }
    }

    function openSurvivalPanel() {
        if (survivalPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        survivalPanelOpen = true;
        var modal = document.getElementById('modal-survival');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
        renderSurvivalModal();
    }

    function openAcupointPanel() {
        if (acupointPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        acupointPanelOpen = true;
        var modal = document.getElementById('modal-acupoints');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
        var AP = window.Acupoints;
        if (AP && AP.getCategories) {
            var acCats = AP.getCategories();
            if (!combatUIState.curAcupointCat && acCats.length) combatUIState.curAcupointCat = acCats[0].id;
            var listAp = combatUIState.curAcupointCat && AP.getAcupointsByCategory
                ? AP.getAcupointsByCategory(combatUIState.curAcupointCat)
                : [];
            if (!combatUIState.curAcupointId && listAp.length) {
                combatUIState.curAcupointId = listAp[0].id;
            }
        }
        renderAcupointModal();
    }

    function closeAcupointPanel() {
        if (!acupointPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        acupointPanelOpen = false;
        var modal = document.getElementById('modal-acupoints');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    function closeSurvivalPanel() {
        if (!survivalPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        survivalPanelOpen = false;
        var modal = document.getElementById('modal-survival');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    function openSpecialPanel() {
        if (specialPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        specialPanelOpen = true;
        var modal = document.getElementById('modal-special');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
    }

    function closeSpecialPanel() {
        if (!specialPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        specialPanelOpen = false;
        var modal = document.getElementById('modal-special');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    if (document.getElementById('btn-survival')) {
        document.getElementById('btn-survival').addEventListener('click', function () {
            if (survivalPanelOpen) closeSurvivalPanel(); else openSurvivalPanel();
        });
    }
    if (document.getElementById('survival-modal-close')) {
        document.getElementById('survival-modal-close').addEventListener('click', closeSurvivalPanel);
    }

    if (document.getElementById('btn-life')) {
        document.getElementById('btn-life').addEventListener('click', function () {
            if (specialPanelOpen) closeSpecialPanel(); else openSpecialPanel();
        });
    }
    if (document.getElementById('special-modal-close')) {
        document.getElementById('special-modal-close').addEventListener('click', closeSpecialPanel);
    }

    if (document.getElementById('btn-acupoints')) {
        document.getElementById('btn-acupoints').addEventListener('click', function () {
            if (acupointPanelOpen) closeAcupointPanel(); else openAcupointPanel();
        });
    }
    if (document.getElementById('acupoint-modal-close')) {
        document.getElementById('acupoint-modal-close').addEventListener('click', closeAcupointPanel);
    }

    if (document.getElementById('btn-save')) {
        document.getElementById('btn-save').addEventListener('click', function () {
            if (savePanelOpen) closeSavePanel(); else openSavePanel();
        });
    }
    if (document.getElementById('save-modal-close')) {
        document.getElementById('save-modal-close').addEventListener('click', closeSavePanel);
    }
    if (document.getElementById('btn-save-local-now')) {
        document.getElementById('btn-save-local-now').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.saveNow !== 'function') {
                showMsg(ui('save.msg.localFail'), 'error');
                return;
            }
            var ok = window.SaveSystem.saveNow();
            showMsg(ok ? ui('save.msg.localOk') : ui('save.msg.localFail'), ok ? 'info' : 'error');
        });
    }
    if (document.getElementById('btn-save-export')) {
        document.getElementById('btn-save-export').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.exportSaveCode !== 'function') {
                showMsg(ui('save.msg.exportFail'), 'error');
                return;
            }
            var cred = getSaveCredentials();
            if (!cred.account || !cred.password) {
                showMsg(ui('save.msg.needAccountPassword'), 'warning');
                return;
            }
            window.SaveSystem.exportSaveCode(cred).then(function (code) {
                var ta = document.getElementById('save-textarea-export');
                if (ta) ta.value = code || '';
                showMsg(ui('save.msg.exportOk'), 'info');
            }).catch(function (e) {
                var m = e && e.message ? String(e.message) : '';
                if (m.indexOf('WebCrypto') >= 0 || m.indexOf('busy') >= 0) {
                    showMsg(m.indexOf('busy') >= 0 ? ui('save.msg.busy') : ui('save.msg.exportFail'), 'error');
                } else {
                    showMsg(ui('save.msg.exportFail'), 'error');
                }
            });
        });
    }
    if (document.getElementById('btn-save-copy-code')) {
        document.getElementById('btn-save-copy-code').addEventListener('click', function () {
            var ta = document.getElementById('save-textarea-export');
            var v = ta && ta.value ? String(ta.value).trim() : '';
            if (!v) {
                showMsg(ui('save.msg.copyFail'), 'warning');
                return;
            }
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(v).then(function () {
                    showMsg(ui('save.msg.copyOk'), 'info');
                }).catch(function () {
                    showMsg(ui('save.msg.copyFail'), 'warning');
                });
            } else {
                showMsg(ui('save.msg.copyFail'), 'warning');
            }
        });
    }
    if (document.getElementById('btn-save-import')) {
        document.getElementById('btn-save-import').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.importSaveCode !== 'function') {
                showMsg(ui('save.msg.importFail'), 'error');
                return;
            }
            var taIn = document.getElementById('save-textarea-import');
            var code = taIn && taIn.value ? String(taIn.value).trim() : '';
            var cred = getSaveCredentials();
            if (!cred.account || !cred.password) {
                showMsg(ui('save.msg.needAccountPassword'), 'warning');
                return;
            }
            if (!code) {
                showMsg(ui('save.msg.importFail'), 'warning');
                return;
            }
            window.SaveSystem.importSaveCode(code, cred).then(function (r) {
                if (!r || !r.ok) {
                    if (r && r.reason === 'older') showMsg(ui('save.msg.importRejectedOlder'), 'warning');
                    else showMsg(ui('save.msg.importFail'), 'error');
                    return;
                }
                hideCreationOverlay();
                updateRoleNameFromCharacter();
                showMsg(ui('save.msg.importOk'), 'info');
                closeSavePanel();
                render();
            }).catch(function () {
                showMsg(ui('save.msg.importFail'), 'error');
            });
        });
    }

    function init() {
        loadConfig().then(function () {
            // i18n 已就绪（UIText.setDict 已完成）后再进行地图合并渲染
            if (window.SaveSystem && typeof window.SaveSystem.init === 'function') {
                window.SaveSystem.init({ saveIntervalTicks: 50 });
            }
            var mapsPromise = bootstrapMapsFromJson();
            function afterMaps() {
                if (window.SaveSystem && typeof window.SaveSystem.loadRealtime === 'function') {
                    var ok = window.SaveSystem.loadRealtime();
                    if (ok) {
                        // 读档成功后，确保 UI 状态与角色数据一致。
                        hideCreationOverlay();
                        updateRoleNameFromCharacter();
                        syncIntroShellUi();
                        if (window.GameLog) window.GameLog.log('[SaveSystem] loaded realtime save', 'system');
                    }
                    if (window.InventoryEquipment && typeof window.InventoryEquipment.ensureCombatBasicsMigrated === 'function') {
                        window.InventoryEquipment.ensureCombatBasicsMigrated();
                    }
                    if (!ok && window.Survival && typeof window.Survival.initBattleResourcesFull === 'function') {
                        window.Survival.initBattleResourcesFull();
                    }
                }
                // 读档后再渲染一次，避免出现“短暂默认状态闪屏”。
                render();
            }
            if (mapsPromise && typeof mapsPromise.then === 'function') mapsPromise.then(afterMaps);
            else afterMaps();
            setPlayerAvatarSprites({
                down: 'image/player_down.png',
                up: 'image/player_up.png',
                left: 'image/player_left.png',
                right: 'image/player_right.png'
            });
            if (window.GameLog) window.GameLog.log(ui('log.system.enter.scene'), 'system');
            window.SceneCtx.actions = window.SceneCtx.actions || {};
            window.SceneCtx.actions.tryMoveTo = function (tx, ty, dx, dy) {
                if (isStoryMovementLocked()) return;
                var st = E.getState();
                var ddx = (dx != null) ? dx : (tx - st.x);
                var ddy = (dy != null) ? dy : (ty - st.y);
                var fromX = st.x;
                var fromY = st.y;
                if (E.moveTo(tx, ty)) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                        window.SceneCtx.pushDirtyCell(fromX, fromY);
                        window.SceneCtx.pushDirtyCell(tx, ty);
                    }
                    if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                        window.SceneAnimation.emit('move:step', {
                            mapId: st.mapId,
                            fromX: fromX,
                            fromY: fromY,
                            toX: tx,
                            toY: ty,
                            dx: ddx,
                            dy: ddy
                        });
                    }
                }
            };
            window.SceneCtx.actions.attackEnemy = function (enemyId, ctxMeta) {
                if (isPreCreationGameplayRestricted()) {
                    showIntroBlockedMsg();
                    return;
                }
                ctxMeta = ctxMeta || {};
                if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode();
                }
                if (window.CombatPipeline && typeof window.CombatPipeline.runPipeline === 'function') {
                    var rawDmg = ctxMeta.raw_damage != null ? Number(ctxMeta.raw_damage) : 10;
                    if (!isFinite(rawDmg) || rawDmg < 0) rawDmg = 10;
                    var pipeName = ctxMeta.pipeline || 'melee_hit_enemy_defender';
                    var postIds = ctxMeta.post_effect_ids;
                    if (!postIds && ctxMeta.post_effect_id) postIds = [ctxMeta.post_effect_id];
                    var atkCtx = {
                        eventIdSuffix: String(enemyId) + '_' + String(ctxMeta.move_id || 'jab'),
                        hitRollSuccess: ctxMeta.hit_roll_success !== false,
                        hitPart: ctxMeta.hit_part || 'chest',
                        moveId: ctxMeta.move_id || 'jab',
                        skillId: ctxMeta.skill_id || 'combat_basic_unarmed',
                        limbId: ctxMeta.limb_id || 'lhand',
                        rawDamage: rawDmg,
                        attacker: {
                            kind: 'player',
                            postEffectIds: Array.isArray(postIds) ? postIds.slice() : []
                        },
                        defender: {
                            kind: 'enemy',
                            enemyId: enemyId,
                            parry_rate: ctxMeta.enemy_parry_rate != null ? Number(ctxMeta.enemy_parry_rate) : 0,
                            parry_damage_reduce: ctxMeta.enemy_parry_reduce != null ? Number(ctxMeta.enemy_parry_reduce) : 0
                        }
                    };
                    window.CombatPipeline.runPipeline(pipeName, atkCtx);
                    if (window.GameLog && atkCtx.finalDamage != null) {
                        window.GameLog.log(ui('log.combat.pipeline.hit_stub', {
                            dmg: String(Math.round(atkCtx.finalDamage)),
                            parry: atkCtx.parrySucceeded ? ui('log.combat.pipeline.parry_yes') : ui('log.combat.pipeline.parry_no')
                        }), 'info');
                    }
                }
                showMsg(ui('log.system.attack.enemy', { enemyId: enemyId }), 'system');
                if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                    var stNow = E.getState ? E.getState() : null;
                    window.SceneAnimation.emit('combat:attack', {
                        enemyId: enemyId,
                        x: ctxMeta.x,
                        y: ctxMeta.y,
                        fromX: ctxMeta.fromX != null ? ctxMeta.fromX : (stNow ? stNow.x : null),
                        fromY: ctxMeta.fromY != null ? ctxMeta.fromY : (stNow ? stNow.y : null),
                        source: ctxMeta.source || 'unknown',
                        damageText: ctxMeta.damageText != null ? ctxMeta.damageText : null
                    });
                }
                if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                    if (ctxMeta.fromX != null && ctxMeta.fromY != null) window.SceneCtx.pushDirtyCell(ctxMeta.fromX, ctxMeta.fromY);
                    if (ctxMeta.x != null && ctxMeta.y != null) window.SceneCtx.pushDirtyCell(ctxMeta.x, ctxMeta.y);
                }
                bumpCombatRenderProfile(700);
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick();
                }
                if (window.GameLog && ctxMeta.source === 'keyboard') {
                    window.GameLog.log(ui('log.system.attack.intent.keyboard'), 'info');
                }
                render();
            };
            window.SceneCtx.actions.interactNpc = function (npcId) {
                if (typeof showMsg === 'function') showMsg(ui('log.system.try.interact.npc', { npcId: npcId }), 'system');
                if (window.NPCSystem && typeof window.NPCSystem.openMenu === 'function') window.NPCSystem.openMenu(npcId);
            };
            window.SceneCtx.actions.tryIntentMove = function (tx, ty, dx, dy, source) {
                if (isStoryMovementLocked()) return;
                var st = E.getState();
                var ddx = (dx != null) ? dx : (tx - st.x);
                var ddy = (dy != null) ? dy : (ty - st.y);
                if (!ddx && !ddy) return;
                if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1) return;
                var targetX = st.x + ddx;
                var targetY = st.y + ddy;

                // 固定优先级：敌人攻击 > NPC 对话 > 普通移动
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(targetX, targetY) : null;
                if (enemyId) {
                    if (isPreCreationGameplayRestricted()) {
                        showIntroBlockedMsg();
                        return;
                    }
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (window.SceneCtx.actions && typeof window.SceneCtx.actions.attackEnemy === 'function') {
                        window.SceneCtx.actions.attackEnemy(enemyId, {
                            source: source || 'unknown',
                            x: targetX,
                            y: targetY,
                            fromX: st.x,
                            fromY: st.y
                        });
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                var npcId = (typeof E.getNpcAt === 'function') ? E.getNpcAt(targetX, targetY) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                if (npcId) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (window.SceneCtx.actions && typeof window.SceneCtx.actions.interactNpc === 'function') {
                        window.SceneCtx.actions.interactNpc(npcId);
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                if (window.SceneCtx.actions && typeof window.SceneCtx.actions.tryMoveTo === 'function') {
                    window.SceneCtx.actions.tryMoveTo(targetX, targetY, ddx, ddy);
                }
            };
            window.SceneCtx.actions.tryFootworkNieBuJump = function (gx, gy) {
                if (isStoryMovementLocked()) return false;
                if (isPreCreationGameplayRestricted()) {
                    showIntroBlockedMsg();
                    return false;
                }
                var SKILL_ID = 'combat_basic_footwork';
                var ACTION_ID = 'nie_bu';
                if (!window.SceneCtx || !window.SceneCtx.footworkNieBuMode) return false;
                var st0 = E.getState();
                var fromX = st0.x;
                var fromY = st0.y;
                if (gx === fromX && gy === fromY) return false;
                if (!IE || !IE.getSkillLevel || IE.getSkillLevel(SKILL_ID) < 1) {
                    showMsg(ui('player.action.niebu.fail.no_skill'), 'info');
                    if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    render();
                    return false;
                }
                var hubs = IE.getCombatState ? IE.getCombatState().hubs : null;
                if (!hubs || hubs.footwork !== SKILL_ID) {
                    showMsg(ui('player.action.niebu.fail.hub'), 'info');
                    if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    render();
                    return false;
                }
                var cdRem = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(SKILL_ID, ACTION_ID) : 0;
                if (cdRem > 0) {
                    showMsg(ui('player.action.niebu.fail.cooldown', { ticks: cdRem }), 'info');
                    return false;
                }
                var ha = null;
                var CS = window.CombatSkills;
                if (CS && typeof CS.getSkill === 'function') {
                    var skTpl = CS.getSkill(SKILL_ID);
                    if (skTpl && skTpl.hub_actions) {
                        for (var hi = 0; hi < skTpl.hub_actions.length; hi++) {
                            if (skTpl.hub_actions[hi].id === ACTION_ID) {
                                ha = skTpl.hub_actions[hi];
                                break;
                            }
                        }
                    }
                }
                var radius = ha && ha.leap_radius != null ? (parseInt(ha.leap_radius, 10) || 2) : 2;
                var cooldownTicks = ha && ha.cooldown_ticks != null ? (parseInt(ha.cooldown_ticks, 10) || 10) : 10;
                if (!E.jumpTo || !E.jumpTo(gx, gy, radius)) {
                    showMsg(ui('player.action.niebu.fail.bad_target'), 'info');
                    return false;
                }
                if (IE.setHubActionCooldownRemaining) IE.setHubActionCooldownRemaining(SKILL_ID, ACTION_ID, cooldownTicks);
                stopGatheringIdle();
                if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode(fromX, fromY, radius);
                }
                setFacingFromMove(gx - fromX, gy - fromY);
                if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                    window.SceneCtx.pushDirtyCell(fromX, fromY);
                    window.SceneCtx.pushDirtyCell(gx, gy);
                }
                var stAfter = E.getState();
                if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                    window.SceneAnimation.emit('move:step', {
                        mapId: stAfter.mapId,
                        fromX: fromX,
                        fromY: fromY,
                        toX: stAfter.x,
                        toY: stAfter.y,
                        dx: stAfter.x - fromX,
                        dy: stAfter.y - fromY
                    });
                }
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick();
                }
                var tickSnap = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState().tickCount : 0;
                if (window.BuffSystem && typeof window.BuffSystem.triggerBuffPipeline === 'function') {
                    window.BuffSystem.triggerBuffPipeline({
                        event_kind: 'action',
                        event_name: 'footwork_nie_bu_resolved',
                        event_id: 'footwork_nie_bu_' + String(tickSnap) + '_' + fromX + '_' + fromY + '_' + gx + '_' + gy,
                        tags: ['footwork_nie_bu', 'hub_action', 'move'],
                        payload: { hub_skill_id: SKILL_ID, hub_action_id: ACTION_ID, from_x: fromX, from_y: fromY, to_x: stAfter.x, to_y: stAfter.y }
                    });
                }
                render();
                return true;
            };
            window.SceneCtx.actions.startGatheringIdle = onGatherClick;
            window.SceneCtx.actions.stopGatheringIdle = function (withMsg) {
                stopGatheringIdle();
                if (withMsg) showMsg(ui('log.info.gather.stop'), 'info');
                if (window.SceneRenderer) window.SceneRenderer.render();
            };
            window.SceneCtx.actions.onEngineChanged = function () {
                if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode();
                }
                if (gatheringIdleTimer && gatheringIdleAt) {
                    var st2 = E.getState();
                    if (st2.mapId !== gatheringIdleAt.mapId || st2.x !== gatheringIdleAt.x || st2.y !== gatheringIdleAt.y)
                        stopGatheringIdle();
                }
                refreshRenderProfile();
                if (window.SceneRenderer) window.SceneRenderer.render();
            };

            function hubAdjacentBattleContext() {
                return !!(window.SceneCtx && typeof window.SceneCtx.hasAdjacentEnemyForCombat === 'function' && window.SceneCtx.hasAdjacentEnemyForCombat());
            }
            var breathHubSkillId = 'combat_basic_breath';
            var tuNaBtnEl = document.getElementById('player-action-tu-na');
            if (tuNaBtnEl) {
                tuNaBtnEl.addEventListener('click', function () {
                    var CHA = window.CombatHubActions;
                    if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') return;
                    var r = CHA.tryExecuteHubAction(breathHubSkillId, 'tu_na', { isBattleContext: hubAdjacentBattleContext });
                    if (!r.ok) {
                        var vars = {};
                        if (r.cooldown_ticks != null) vars.ticks = r.cooldown_ticks;
                        showMsg(ui(r.reason_key, vars), 'info');
                        return;
                    }
                    showMsg(ui(r.reason_key, { n: r.qi_li_restored != null ? r.qi_li_restored : 0 }), 'success');
                    if (window.SceneRenderer) window.SceneRenderer.render();
                    if (typeof updateStatusPanel === 'function') updateStatusPanel();
                });
            }
            var diqiHutiBtnEl = document.getElementById('player-action-diqi-huti');
            if (diqiHutiBtnEl) {
                diqiHutiBtnEl.addEventListener('click', function () {
                    var CHA2 = window.CombatHubActions;
                    if (!CHA2 || typeof CHA2.tryExecuteHubAction !== 'function') return;
                    var r2 = CHA2.tryExecuteHubAction(breathHubSkillId, 'diqi_huti', { isBattleContext: hubAdjacentBattleContext });
                    if (!r2.ok) {
                        var vars2 = {};
                        if (r2.cooldown_ticks != null) vars2.ticks = r2.cooldown_ticks;
                        showMsg(ui(r2.reason_key, vars2), 'info');
                        return;
                    }
                    showMsg(ui(r2.reason_key, { shield: r2.shield_value != null ? r2.shield_value : 0 }), 'success');
                    if (window.SceneRenderer) window.SceneRenderer.render();
                    if (typeof updateStatusPanel === 'function') updateStatusPanel();
                });
            }

            var btnPlayerActions = document.getElementById('btn-player-actions');
            if (btnPlayerActions && !btnPlayerActions._boundPlayerActions) {
                btnPlayerActions._boundPlayerActions = true;
                btnPlayerActions.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    if (playerActionsSubmenuOpen) closePlayerActionsSubmenu();
                    else openPlayerActionsSubmenu();
                });
            }
            if (!playerActionsOutsideClickBound) {
                playerActionsOutsideClickBound = true;
                document.addEventListener('click', function (ev) {
                    var sub = document.getElementById('player-actions-submenu');
                    var b = document.getElementById('btn-player-actions');
                    if (!sub || !sub.classList.contains('open')) return;
                    var t = ev.target;
                    if (b && (t === b || b.contains(t))) return;
                    if (sub === t || sub.contains(t)) return;
                    closePlayerActionsSubmenu();
                });
            }

            if (window.SceneSystems && typeof window.SceneSystems.init === 'function') window.SceneSystems.init();
            if (window.SceneRenderer) window.SceneRenderer.render();
        }).catch(function () { render(); });
    }

    // Expose entrypoints for bootstrap.js
    window.SceneApp = window.SceneApp || {};
    window.SceneApp.init = init;
    window.SceneApp.loadConfig = loadConfig;
    window.SceneApp.render = render;
    window.SceneApp.openCharacterCreationAfterIntro = openCharacterCreationAfterIntro;
    window.SceneApp.isStoryMovementLocked = isStoryMovementLocked;
    window.SceneApp.isPreCreationGameplayRestricted = isPreCreationGameplayRestricted;
})();


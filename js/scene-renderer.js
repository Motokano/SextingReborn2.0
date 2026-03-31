// 主场景渲染层：只做 DOM/UI 渲染，不做规则运算
(function () {
    function getCtx() {
        return window.SceneCtx || null;
    }

    function isDialogueBlockingWorldInput() {
        return !!(window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen());
    }

    var tooltipEl = null;
    var tooltipHideTimer = null;
    var tileRenderer = null;
    var interactionBound = false;
    var latestFrame = null;
    var lastStaticDataKey = '';
    var prevRenderState = null;
    var prevDynamicCellMarks = {};
    var dynamicDiffTick = 0;
    /** 上一帧是否处于蹑步选点；用于检测 true→false 并强制整层动态重画（见 render 内说明） */
    var prevFootworkNieBuMode = false;
    var quickBeltCacheKey = '';
    var hoverRafId = 0;
    var hoverPendingClientX = 0;
    var hoverPendingClientY = 0;

    function buildDirtyCells(prev, cur, radius) {
        var out = [];
        var seen = {};
        var r = radius != null ? radius : 1;
        function add(x, y) {
            var k = x + ',' + y;
            if (seen[k]) return;
            seen[k] = true;
            out.push({ x: x, y: y });
        }
        function addAround(x, y) {
            for (var yy = y - r; yy <= y + r; yy++) {
                for (var xx = x - r; xx <= x + r; xx++) add(xx, yy);
            }
        }
        if (prev && cur && prev.mapId === cur.mapId) {
            addAround(prev.x, prev.y);
            addAround(cur.x, cur.y);
        }
        return out;
    }

    function mergeDirtyCells(primary, extra) {
        var out = [];
        var seen = {};
        function push(c) {
            if (!c || c.x == null || c.y == null) return;
            var k = (c.x | 0) + ',' + (c.y | 0);
            if (seen[k]) return;
            seen[k] = true;
            out.push({ x: (c.x | 0), y: (c.y | 0) });
        }
        var a = Array.isArray(primary) ? primary : [];
        var b = Array.isArray(extra) ? extra : [];
        for (var i = 0; i < a.length; i++) push(a[i]);
        for (var j = 0; j < b.length; j++) push(b[j]);
        return out;
    }

    function collectDynamicCellMarks(map, mapId, E, IE, range) {
        var marks = {};
        if (!map) return marks;
        var minX = 0, minY = 0, maxX = map.width - 1, maxY = map.height - 1;
        if (range) {
            minX = Math.max(0, range.minX | 0);
            minY = Math.max(0, range.minY | 0);
            maxX = Math.min(map.width - 1, range.maxX | 0);
            maxY = Math.min(map.height - 1, range.maxY | 0);
        }
        for (var gy = minY; gy <= maxY; gy++) {
            for (var gx = minX; gx <= maxX; gx++) {
                var k = gx + ',' + gy;
                var npcId = (typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null;
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(gx, gy) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                var groundCount = 0;
                if (IE && typeof IE.getGroundItemsAt === 'function' && mapId != null) {
                    var arr = IE.getGroundItemsAt(mapId, gx, gy);
                    groundCount = Array.isArray(arr) ? arr.length : 0;
                }
                if (npcId || enemyId || groundCount > 0) {
                    marks[k] = (npcId ? ('n:' + npcId) : '-') + '|' + (enemyId ? ('e:' + enemyId) : '-') + '|g:' + groundCount;
                }
            }
        }
        return marks;
    }

    function buildDirtyFromDynamicDiff(prevMarks, curMarks) {
        var out = [];
        var seen = {};
        function pushKey(k) {
            if (!k || seen[k]) return;
            seen[k] = true;
            var p = k.split(',');
            out.push({ x: Number(p[0]) || 0, y: Number(p[1]) || 0 });
        }
        for (var k in curMarks) {
            if (!curMarks.hasOwnProperty(k)) continue;
            if (prevMarks[k] !== curMarks[k]) pushKey(k);
        }
        for (var k2 in prevMarks) {
            if (!prevMarks.hasOwnProperty(k2)) continue;
            if (curMarks[k2] == null) pushKey(k2);
        }
        return out;
    }

    function buildScanRange(st, map, radius) {
        if (!st || !map) return null;
        var r = Math.max(2, radius | 0);
        return {
            minX: st.x - r,
            minY: st.y - r,
            maxX: st.x + r,
            maxY: st.y + r
        };
    }

    function renderDomFallback(grid, map, st, E, ctx) {
        grid.innerHTML = '';
        grid.style.width = (map.width * ctx.CELL_PX) + 'px';
        grid.style.height = (map.height * ctx.CELL_PX) + 'px';
        var gap = 1;
        var nieBuMode = ctx && ctx.footworkNieBuMode;
        var nieR = nieBuMode && ctx.nieBuLeapRadius != null ? (ctx.nieBuLeapRadius | 0) : 2;
        for (var gy = 0; gy < map.height; gy++) {
            for (var gx = 0; gx < map.width; gx++) {
                var tile = document.createElement('div');
                var adjacent = E.isAdjacent(gx, gy);
                var walkable = E.isWalkable(gx, gy);
                var leapTarget = false;
                if (nieBuMode && typeof E.canStandAt === 'function' && !(gx === st.x && gy === st.y)) {
                    var chDom = Math.max(Math.abs(gx - st.x), Math.abs(gy - st.y));
                    if (chDom >= 1 && chDom <= nieR && E.canStandAt(gx, gy)) leapTarget = true;
                }
                tile.className = 'tile';
                if (!walkable) tile.classList.add('blocked');
                if (adjacent) tile.classList.add('adjacent');
                if (leapTarget) tile.classList.add('leap-target');
                if (gx === st.x && gy === st.y) tile.classList.add('player');
                tile.style.left = (gx * ctx.CELL_PX + gap) + 'px';
                tile.style.top = (gy * ctx.CELL_PX + gap) + 'px';
                if (nieBuMode) {
                    if (leapTarget) {
                        tile.onclick = (function (tx, ty) {
                            return function () {
                                if (isDialogueBlockingWorldInput()) return;
                                if (ctx.actions && typeof ctx.actions.tryFootworkNieBuJump === 'function') {
                                    ctx.actions.tryFootworkNieBuJump(tx, ty);
                                }
                            };
                        })(gx, gy);
                    }
                } else if (adjacent) {
                    tile.onclick = (function (tx, ty) {
                        return function () {
                            if (isDialogueBlockingWorldInput()) return;
                            var ddx = tx - st.x;
                            var ddy = ty - st.y;
                            if (ctx.actions && typeof ctx.actions.tryIntentMove === 'function') {
                                ctx.actions.tryIntentMove(tx, ty, ddx, ddy, 'click');
                            } else if (ctx.actions && typeof ctx.actions.tryMoveTo === 'function') {
                                ctx.actions.tryMoveTo(tx, ty, ddx, ddy);
                            }
                        };
                    })(gx, gy);
                }
                grid.appendChild(tile);
            }
        }
    }

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
        var ctx = getCtx();
        var IE = ctx ? ctx.IE : null;
        if (!tpl) return '';
        var lines = [];
        if (tpl.weight_kg != null) lines.push('重量：' + tpl.weight_kg + ' kg');
        if (tpl.pocket_slots != null) lines.push('口袋：' + tpl.pocket_slots + ' 格');
        if (tpl.vest_slots != null) lines.push('背心栏：' + tpl.vest_slots + ' 格');
        if (tpl.backpack_slots != null) lines.push('背包：' + tpl.backpack_slots + ' 格');
        if (tpl.backpack_weight_factor != null) lines.push('背包减重：' + (tpl.backpack_weight_factor * 100) + '%');
        if (tpl.damage_reduce_slash_pct != null || tpl.damage_reduce_pierce_pct != null || tpl.damage_reduce_blunt_pct != null) {
            var dr = [];
            if (tpl.damage_reduce_slash_pct != null && tpl.damage_reduce_slash_pct > 0) dr.push('劈砍 ' + (tpl.damage_reduce_slash_pct * 100) + '%');
            if (tpl.damage_reduce_pierce_pct != null && tpl.damage_reduce_pierce_pct > 0) dr.push('戳刺 ' + (tpl.damage_reduce_pierce_pct * 100) + '%');
            if (tpl.damage_reduce_blunt_pct != null && tpl.damage_reduce_blunt_pct > 0) dr.push('钝击 ' + (tpl.damage_reduce_blunt_pct * 100) + '%');
            if (dr.length) lines.push('减伤：' + dr.join('、'));
        }
        if (tpl.skill_coef != null) lines.push('技能系数：' + tpl.skill_coef);
        if (tpl.req_innate_jingu != null) lines.push('先天筋骨要求：' + tpl.req_innate_jingu);
        if (tpl.enchant_slots != null) lines.push('词条槽：' + tpl.enchant_slots);
        var q = (inst && inst.quality_tier != null) ? inst.quality_tier : tpl.quality_tier;
        if (q != null && IE && IE.QUALITY_NAMES) lines.push('品质：' + (IE.QUALITY_NAMES[q] || '—'));
        return lines.length ? lines.join('\n') : '';
    }

    function buildItemTooltipHtml(name, desc, attrs) {
        var html = '<div class="tooltip-name">' + (name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        if (desc) html += '<div class="tooltip-desc">' + (desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        if (attrs) html += '<div class="tooltip-attrs">' + (attrs || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        return html;
    }

    function updateTopTimeHud() {
        var ctx = getCtx();
        if (!ctx || !ctx.isTimeHudVisible || !ctx.isTimeHudVisible()) return;
        var tEl = document.getElementById('hud-time-text');
        var pEl = document.getElementById('hud-time-period');
        if (!tEl && !pEl) return;
        var GT = window.GameTime;
        if (!GT || typeof GT.getState !== 'function') return;
        var st = GT.getState();
        if (tEl) tEl.textContent = st.display || '—';
        if (pEl) pEl.textContent = st.timePeriodLabel || '';
    }

    function appendQuickBeltSlot(frag, IE, char, it, slotIndex) {
        var slot = document.createElement('div');
        slot.className = 'slot';
        if (slotIndex < 9) {
            var keyEl = document.createElement('span');
            keyEl.className = 'quick-belt-slot-key';
            keyEl.textContent = String(slotIndex + 1);
            slot.appendChild(keyEl);
        }
        var body = document.createElement('span');
        body.className = 'quick-belt-slot-body';
        if (it && it.item_id) {
            var tpl = IE.getItemTemplate(it.item_id);
            var tier = IE.getItemDisplayTier(it.item_id, char);
            body.textContent = tpl ? IE.getDisplayName(tpl, tier, char).slice(0, 2) : it.item_id.slice(0, 2);
            var name = tpl ? IE.getDisplayName(tpl, tier, char) : it.item_id;
            var desc = tpl ? IE.getDisplayDesc(tpl, tier, char) : '';
            var attrs = formatItemAttributes(tpl, it);
            var tipHtml = buildItemTooltipHtml(name, desc, attrs);
            slot.addEventListener('mouseenter', function (html, el) { return function () { showItemTooltip(html, el); }; }(tipHtml, slot));
            slot.addEventListener('mouseleave', function () { hideItemTooltip(); });
        } else {
            body.textContent = '—';
        }
        slot.appendChild(body);
        frag.appendChild(slot);
    }

    function updateQuickBelt() {
        var ctx = getCtx();
        if (!ctx || !ctx.IE) return;
        var IE = ctx.IE;
        var el = document.getElementById('quick-belt');
        if (!el) return;
        var pocketArr = IE.getPocketArray();
        var vestArr = IE.getVestArray();
        var char = IE.getCharacterForDisplay();
        var keyParts = [];
        for (var pk = 0; pk < pocketArr.length; pk++) {
            var pit = pocketArr[pk];
            if (pit && pit.item_id) {
                var pTier = (typeof IE.getItemDisplayTier === 'function') ? IE.getItemDisplayTier(pit.item_id, char) : '';
                keyParts.push(pit.item_id + ':' + (pit.count || 1) + ':' + (pit.quality_tier || '') + ':' + pTier);
            } else {
                keyParts.push('-');
            }
        }
        keyParts.push('|');
        for (var vk = 0; vk < vestArr.length; vk++) {
            var vit = vestArr[vk];
            if (vit && vit.item_id) {
                var vTier = (typeof IE.getItemDisplayTier === 'function') ? IE.getItemDisplayTier(vit.item_id, char) : '';
                keyParts.push(vit.item_id + ':' + (vit.count || 1) + ':' + (vit.quality_tier || '') + ':' + vTier);
            } else {
                keyParts.push('-');
            }
        }
        var nextKey = keyParts.join(',');
        if (nextKey === quickBeltCacheKey) return;
        quickBeltCacheKey = nextKey;

        el.innerHTML = '';
        var frag = document.createDocumentFragment();
        var slotIndex = 0;
        var pi;
        for (pi = 0; pi < pocketArr.length; pi++) {
            appendQuickBeltSlot(frag, IE, char, pocketArr[pi], slotIndex++);
        }
        if (pocketArr.length && vestArr.length) {
            var sep = document.createElement('div');
            sep.className = 'quick-belt-sep';
            sep.setAttribute('aria-hidden', 'true');
            frag.appendChild(sep);
        }
        var vj;
        for (vj = 0; vj < vestArr.length; vj++) {
            appendQuickBeltSlot(frag, IE, char, vestArr[vj], slotIndex++);
        }
        el.appendChild(frag);
        if (window.GameLog && typeof window.GameLog.syncQuickBeltDock === 'function') {
            window.GameLog.syncQuickBeltDock();
        }
    }

    function render() {
        var ctx = getCtx();
        if (!ctx || !ctx.E || !ctx.G || !ctx.IE) return;
        var curFootworkNieBuMode = !!(ctx.footworkNieBuMode);
        /**
         * 蹑步结束帧必须整视野重画动态层：V2 在 dirtyCells 非空时只清列表内格子，否则整 canvas 先 clear 再画。
         * moveDirty 在玩家不动时只有身边 3×3，无法覆盖环上半径 2 的落点格；仅靠 pushDirty 易漏格或遇双次 render 只带 3×3。
         */
        var nieBuModeJustEnded = prevFootworkNieBuMode && !curFootworkNieBuMode;
        var E = ctx.E;
        var G = ctx.G;
        var IE = ctx.IE;
        var CELL_PX = ctx.CELL_PX;
        var CENTER_OFFSET_X = ctx.CENTER_OFFSET_X;
        var CENTER_OFFSET_Y = ctx.CENTER_OFFSET_Y;

        var grid = document.getElementById('map-grid');
        if (!grid) {
            prevFootworkNieBuMode = curFootworkNieBuMode;
            return;
        }

        var map = E.getMap();
        var st = E.getState();
        if (!map) {
            prevFootworkNieBuMode = curFootworkNieBuMode;
            return;
        }

        if (!tileRenderer && window.TileRendererV2 && typeof window.TileRendererV2.create === 'function') {
            tileRenderer = window.TileRendererV2.create(grid, { cellPx: CELL_PX });
            if (window.SceneAnimation && typeof window.SceneAnimation.render === 'function') {
                tileRenderer.setEffectsRenderer(function (fxCtx) {
                    window.SceneAnimation.render(fxCtx);
                });
                if (typeof tileRenderer.startAnimationLoop === 'function') tileRenderer.startAnimationLoop();
            }
        }
        var hasV2 = !!tileRenderer;

        var entityAtPlayer = E.getEntityAt(st.x, st.y);
        var canGather = entityAtPlayer && G.getGatheringPointConfig(entityAtPlayer) && G.canGather(entityAtPlayer);
        var pointName = entityAtPlayer && G.getGatheringPointConfig(entityAtPlayer) ? G.getGatheringPointConfig(entityAtPlayer).display_name : '';

        latestFrame = {
            map: map,
            st: st,
            getStaticMetaAt: function (gx, gy) {
                var walkable = E.isWalkable(gx, gy);
                var portal = E.getPortalAt(gx, gy);
                var entityId = E.getEntityAt(gx, gy);
                return {
                    walkable: walkable,
                    portal: !!portal,
                    gathering: (entityId === 'gathering_bush' || entityId === 'gathering_grass'),
                    adjacent: false,
                    groundCount: 0,
                    npc: false,
                    enemy: false,
                    player: false
                };
            },
            getDynamicMetaAt: function (gx, gy) {
                var ctxDyn = getCtx();
                var adjacent = E.isAdjacent(gx, gy);
                var walkable = E.isWalkable(gx, gy);
                var portal = E.getPortalAt(gx, gy);
                var entityId = E.getEntityAt(gx, gy);
                var npcId = (typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null;
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(gx, gy) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                var groundAt = (IE && IE.getGroundItemsAt) ? IE.getGroundItemsAt(st.mapId, gx, gy) : [];
                var leapTarget = false;
                if (ctxDyn && ctxDyn.footworkNieBuMode && typeof E.canStandAt === 'function' && !(gx === st.x && gy === st.y)) {
                    var rDyn = ctxDyn.nieBuLeapRadius != null ? (ctxDyn.nieBuLeapRadius | 0) : 2;
                    var chDyn = Math.max(Math.abs(gx - st.x), Math.abs(gy - st.y));
                    if (chDyn >= 1 && chDyn <= rDyn && E.canStandAt(gx, gy)) leapTarget = true;
                }
                return {
                    x: gx,
                    y: gy,
                    player: (gx === st.x && gy === st.y),
                    adjacent: adjacent,
                    leapTarget: leapTarget,
                    walkable: walkable,
                    portal: !!portal,
                    gathering: (entityId === 'gathering_bush' || entityId === 'gathering_grass'),
                    npc: !!npcId,
                    enemy: !!enemyId,
                    enemyId: enemyId || null,
                    groundCount: groundAt.length
                };
            },
            onTileClick: function (gx, gy) {
                var ctxTile = getCtx();
                if (ctxTile && ctxTile.footworkNieBuMode && ctxTile.actions && typeof ctxTile.actions.tryFootworkNieBuJump === 'function') {
                    ctxTile.actions.tryFootworkNieBuJump(gx, gy);
                    return;
                }
                var ddx = gx - st.x;
                var ddy = gy - st.y;
                if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1 || (!ddx && !ddy)) return;
                var npcId = (typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                if (npcId && ctx.actions && typeof ctx.actions.interactNpc === 'function') {
                    ctx.actions.interactNpc(npcId);
                    return;
                }
                if (ctx.actions && typeof ctx.actions.tryIntentMove === 'function') {
                    ctx.actions.tryIntentMove(gx, gy, ddx, ddy, 'click');
                } else if (ctx.actions && typeof ctx.actions.tryMoveTo === 'function') {
                    ctx.actions.tryMoveTo(gx, gy, ddx, ddy);
                }
            }
        };

        var staticDataKey = '';
        try {
            var parts = [];
            var blocks = Array.isArray(map.blocks) ? map.blocks.length : 0;
            var portals = Array.isArray(map.portals) ? map.portals.length : 0;
            var entities = Array.isArray(map.entities) ? map.entities.length : 0;
            var npcs = Array.isArray(map.npcs) ? map.npcs.length : 0;
            var enemies = Array.isArray(map.enemies) ? map.enemies.length : 0;
            parts.push('b=' + blocks, 'p=' + portals, 'e=' + entities, 'n=' + npcs, 'm=' + enemies);
            if (Array.isArray(map.blocks)) {
                for (var bi = 0; bi < map.blocks.length; bi++) {
                    parts.push('B' + map.blocks[bi].x + ',' + map.blocks[bi].y);
                }
            }
            if (Array.isArray(map.portals)) {
                for (var pi = 0; pi < map.portals.length; pi++) {
                    parts.push('P' + map.portals[pi].x + ',' + map.portals[pi].y + '>' + map.portals[pi].target_map_id);
                }
            }
            if (Array.isArray(map.entities)) {
                for (var ei = 0; ei < map.entities.length; ei++) {
                    parts.push('E' + map.entities[ei].x + ',' + map.entities[ei].y + ':' + (map.entities[ei].entity_id || ''));
                }
            }
            staticDataKey = parts.join('|');
        } catch (e) {
            staticDataKey = String(map.map_id || '') + ':' + String(map.width || 0) + 'x' + String(map.height || 0);
        }

        if (tileRenderer) {
            var container = document.getElementById('map-container');
            if (staticDataKey !== lastStaticDataKey && typeof tileRenderer.invalidateStatic === 'function') {
                tileRenderer.invalidateStatic();
                lastStaticDataKey = staticDataKey;
            }
            var curPos = { mapId: st.mapId, x: st.x, y: st.y };
            var moveDirty = buildDirtyCells(prevRenderState, curPos, 1);
            var actionDirty = (ctx && Array.isArray(ctx.dirtyCells)) ? ctx.dirtyCells.slice() : [];
            if (ctx && Array.isArray(ctx.dirtyCells)) ctx.dirtyCells.length = 0;
            var profile = (ctx && ctx.renderProfile) ? String(ctx.renderProfile) : 'normal';
            var defaultScanInterval = (profile === 'combat') ? 1 : 2;
            var diffScanInterval = (ctx && ctx.dynamicDiffScanInterval != null) ? Math.max(1, ctx.dynamicDiffScanInterval | 0) : defaultScanInterval;
            var diffScanRadius = (ctx && ctx.dynamicDiffScanRadius != null) ? Math.max(4, ctx.dynamicDiffScanRadius | 0) : 16;
            var diffDirty = [];
            dynamicDiffTick++;
            if ((dynamicDiffTick % diffScanInterval) === 0 || !prevDynamicCellMarks || !Object.keys(prevDynamicCellMarks).length) {
                var scanRange = buildScanRange(st, map, diffScanRadius);
                var curMarks = collectDynamicCellMarks(map, st.mapId, E, IE, scanRange);
                diffDirty = buildDirtyFromDynamicDiff(prevDynamicCellMarks, curMarks);
                prevDynamicCellMarks = curMarks;
            }
            var mergedDirty = mergeDirtyCells(mergeDirtyCells(moveDirty, actionDirty), diffDirty);
            var dirtyForV2 = nieBuModeJustEnded ? null : (mergedDirty.length ? mergedDirty : null);
            tileRenderer.render({
                map: map,
                st: st,
                staticMetaAt: latestFrame.getStaticMetaAt,
                dynamicMetaAt: latestFrame.getDynamicMetaAt,
                staticDataKey: staticDataKey,
                dirtyCells: dirtyForV2,
                viewport: {
                    width: container ? container.clientWidth : 1042,
                    height: container ? container.clientHeight : 638
                }
            });
            prevRenderState = curPos;
        } else {
            renderDomFallback(grid, map, st, E, ctx);
        }

        if (hasV2 && !interactionBound) {
            interactionBound = true;
            grid.addEventListener('click', function (ev) {
                if (isDialogueBlockingWorldInput()) return;
                if (!tileRenderer || !latestFrame) return;
                var hit = tileRenderer.hitTest(ev.clientX, ev.clientY);
                if (!hit) return;
                latestFrame.onTileClick(hit.x, hit.y);
            });
            grid.addEventListener('mousemove', function (ev) {
                hoverPendingClientX = ev.clientX;
                hoverPendingClientY = ev.clientY;
                if (hoverRafId) return;
                hoverRafId = requestAnimationFrame(function () {
                    hoverRafId = 0;
                    if (!tileRenderer) return;
                    if (isDialogueBlockingWorldInput()) {
                        grid.style.cursor = 'default';
                        grid.title = '';
                        return;
                    }
                    tileRenderer.setHoverCursor(hoverPendingClientX, hoverPendingClientY);
                    if (!latestFrame) return;
                    var hit = tileRenderer.hitTest(hoverPendingClientX, hoverPendingClientY);
                    if (!hit) {
                        grid.title = '';
                        return;
                    }
                    var meta = latestFrame.getDynamicMetaAt(hit.x, hit.y);
                    var tips = [];
                    if (!meta.walkable) tips.push('不可走');
                    if (meta.portal) tips.push('传送点');
                    if (meta.gathering) tips.push('采集点');
                    if (meta.npc) tips.push('可对话');
                    if (meta.enemy) {
                        if (meta.enemyId === 'enemy.training_dummy_wooden') {
                            try {
                                if (window.UIText && typeof window.UIText.t === 'function') {
                                    tips.push(window.UIText.t('map.tooltip.enemy.training_dummy'));
                                } else {
                                    tips.push('训练木桩');
                                }
                            } catch (eTip) {
                                tips.push('训练木桩');
                            }
                        } else {
                            tips.push('敌人');
                        }
                    }
                    if (meta.groundCount > 0) tips.push('地面有 ' + meta.groundCount + ' 件物品');
                    if (meta.leapTarget) tips.push('蹑步落点');
                    grid.title = tips.join(' · ');
                });
            });
            grid.addEventListener('mouseleave', function () {
                grid.style.cursor = 'default';
                grid.title = '';
            });
        }

        var tx = CENTER_OFFSET_X - st.x * CELL_PX;
        var ty = CENTER_OFFSET_Y - st.y * CELL_PX;
        if (tileRenderer) tileRenderer.setCamera(tx, ty);
        else grid.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';

        var isIdling = ctx && ctx.isGatheringIdling ? !!ctx.isGatheringIdling() : false;
        var groundAtPlayer = (IE && IE.getGroundItemsAt) ? IE.getGroundItemsAt(st.mapId, st.x, st.y) : [];
        var hasGroundItems = groundAtPlayer.length > 0;
        var bubble = document.getElementById('player-action-bubble');
        var bubbleGather = document.getElementById('player-action-gather');
        var bubbleStop = document.getElementById('player-action-gather-stop');
        var bubbleGroundItems = document.getElementById('player-action-ground-items');
        var bubbleDiqiHuti = document.getElementById('player-action-diqi-huti');
        var adjEnemyCombat = ctx && typeof ctx.hasAdjacentEnemyForCombat === 'function' ? !!ctx.hasAdjacentEnemyForCombat() : false;
        var breathSkillId = 'combat_basic_breath';
        var diqiHutiOk = false;
        if (IE && E && window.CombatSkills && adjEnemyCombat) {
            var breathLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(breathSkillId) : 0;
            var hubsB = IE.getCombatState && IE.getCombatState().hubs ? IE.getCombatState().hubs : null;
            if (breathLv >= 50 && hubsB && hubsB.breath === breathSkillId) {
                var shRem = (window.Survival && typeof window.Survival.getDiqiShieldRemaining === 'function') ? window.Survival.getDiqiShieldRemaining() : 0;
                if (shRem <= 0) diqiHutiOk = true;
            }
        }
        var tNie = function (key, vars) {
            try {
                if (window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(key, vars);
            } catch (e1) { /* ignore */ }
            return key;
        };
        if (bubbleDiqiHuti) {
            bubbleDiqiHuti.style.display = diqiHutiOk ? 'inline-block' : 'none';
            bubbleDiqiHuti.textContent = tNie('player.action.diqi_huti');
        }
        var showBubble = canGather || isIdling || hasGroundItems || diqiHutiOk;
        if (bubble) bubble.classList.toggle('visible', !!showBubble);
        // 采集/停止：仅与「站在可采集格」或「正在挂机采集」相关；勿因脚下物品/护体等其它理由把采集钮常驻显示
        if (bubbleGather && bubbleStop) {
            if (showBubble) {
                bubbleGather.style.display = (!isIdling && canGather) ? 'inline-block' : 'none';
                bubbleGather.disabled = !canGather;
                bubbleGather.textContent = pointName ? '采集 · ' + pointName + '（挂机）' : '采集（挂机）';
                bubbleStop.style.display = isIdling ? 'inline-block' : 'none';
            } else {
                bubbleGather.style.display = 'none';
                bubbleStop.style.display = 'none';
            }
        }
        if (bubbleGroundItems) {
            bubbleGroundItems.style.display = hasGroundItems ? 'inline-block' : 'none';
            bubbleGroundItems.textContent = hasGroundItems ? '📦 脚下 ' + groundAtPlayer.length + ' 件' : '📦 脚下物品';
        }

        var abGather = document.getElementById('action-bar-gather');
        var abStop = document.getElementById('action-bar-gather-stop');
        var abGround = document.getElementById('action-bar-ground');
        var abDiqi = document.getElementById('action-bar-diqi-huti');
        var abWarehouse = document.getElementById('action-bar-warehouse');
        var onWarehouseTile = !!(E.getAnnotationAt && E.getAnnotationAt(st.x, st.y) === '仓库');
        if (abGather && bubbleGather) {
            abGather.style.display = bubbleGather.style.display;
            abGather.disabled = !!bubbleGather.disabled;
            abGather.textContent = bubbleGather.textContent || '';
        }
        if (abStop && bubbleStop) {
            abStop.style.display = bubbleStop.style.display;
            abStop.textContent = bubbleStop.textContent || '';
        }
        if (abGround && bubbleGroundItems) {
            abGround.style.display = bubbleGroundItems.style.display;
            abGround.textContent = bubbleGroundItems.textContent || '';
        }
        if (abDiqi && bubbleDiqiHuti) {
            abDiqi.style.display = bubbleDiqiHuti.style.display;
            abDiqi.textContent = bubbleDiqiHuti.textContent || '';
        }
        if (abWarehouse) {
            abWarehouse.style.display = onWarehouseTile ? 'inline-block' : 'none';
            if (onWarehouseTile) {
                try {
                    if (window.UIText && typeof window.UIText.t === 'function') abWarehouse.textContent = window.UIText.t('action.bar.warehouse');
                } catch (eWh) { /* ignore */ }
            }
        }

        var anyCtxAb = (abGather && abGather.style.display !== 'none')
            || (abStop && abStop.style.display !== 'none')
            || (abGround && abGround.style.display !== 'none')
            || (abDiqi && abDiqi.style.display !== 'none')
            || (abWarehouse && abWarehouse.style.display !== 'none');
        var sepAb = document.getElementById('action-bar-sep');
        if (sepAb) sepAb.style.display = anyCtxAb ? 'block' : 'none';

        var slotsAb = (ctx && typeof ctx.getActionBarSlots === 'function') ? ctx.getActionBarSlots() : [null, null, null, null];
        var pxi;
        for (pxi = 0; pxi < 4; pxi++) {
            var pBtn = document.getElementById('action-bar-pin-' + pxi);
            if (!pBtn) continue;
            var tokp = slotsAb[pxi];
            if (!tokp) {
                pBtn.textContent = '·';
                pBtn.classList.add('empty');
                pBtn.title = tNie('action.bar.pin.empty_title') + ' · ' + tNie('action.bar.pin.right_clear');
                continue;
            }
            pBtn.classList.remove('empty');
            var partsp = String(tokp).split('|');
            var lblPin = '—';
            if (partsp.length >= 3 && partsp[0] === 'hub') {
                var skPin = partsp[1];
                var acPin = partsp[2];
                var CSab = (typeof window !== 'undefined' && window.CombatSkills) ? window.CombatSkills : null;
                if (CSab && typeof CSab.getSkill === 'function') {
                    var tplab = CSab.getSkill(skPin);
                    if (tplab && tplab.hub_actions) {
                        var hx;
                        for (hx = 0; hx < tplab.hub_actions.length; hx++) {
                            if (tplab.hub_actions[hx].id === acPin) {
                                lblPin = tplab.hub_actions[hx].name || acPin;
                                break;
                            }
                        }
                    }
                }
                if (lblPin === '—') lblPin = acPin;
            }
            pBtn.textContent = lblPin;
            pBtn.title = lblPin + ' · ' + tNie('action.bar.pin.right_clear');
        }

        updateTopTimeHud();
        if (ctx && typeof ctx.updateStatusPanel === 'function') ctx.updateStatusPanel(G.getCharacterState());
        updateQuickBelt();
        prevFootworkNieBuMode = curFootworkNieBuMode;
    }

    window.SceneRenderer = {
        render: render,
        updateQuickBelt: updateQuickBelt,
        showItemTooltip: showItemTooltip,
        hideItemTooltip: hideItemTooltip,
        buildItemTooltipHtml: buildItemTooltipHtml,
        formatItemAttributes: formatItemAttributes
    };
})();


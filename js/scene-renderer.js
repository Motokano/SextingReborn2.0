// 主场景渲染层：只做 DOM/UI 渲染，不做规则运算
(function () {
    function getCtx() {
        return window.SceneCtx || null;
    }

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

    function formatItemAttributes(tpl) {
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
        if (tpl.quality_tier != null && IE && IE.QUALITY_NAMES) lines.push('品质：' + (IE.QUALITY_NAMES[tpl.quality_tier] || '—'));
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

    function updateQuickBelt() {
        var ctx = getCtx();
        if (!ctx || !ctx.IE) return;
        var IE = ctx.IE;
        var el = document.getElementById('quick-belt');
        if (!el) return;
        el.innerHTML = '';
        var pocketArr = IE.getPocketArray();
        var vestArr = IE.getVestArray();
        var char = IE.getCharacterForDisplay();
        for (var i = 0; i < pocketArr.length; i++) {
            var slot = document.createElement('div');
            slot.className = 'slot';
            var it = pocketArr[i];
            if (it && it.item_id) {
                var tpl = IE.getItemTemplate(it.item_id);
                var tier = IE.getItemDisplayTier(it.item_id, char);
                slot.textContent = tpl ? IE.getDisplayName(tpl, tier).slice(0, 2) : it.item_id.slice(0, 2);
                var name = tpl ? IE.getDisplayName(tpl, tier) : it.item_id;
                var desc = tpl ? IE.getDisplayDesc(tpl, tier) : '';
                var attrs = formatItemAttributes(tpl);
                var tipHtml = buildItemTooltipHtml(name, desc, attrs);
                slot.addEventListener('mouseenter', function (html, el) { return function () { showItemTooltip(html, el); }; }(tipHtml, slot));
                slot.addEventListener('mouseleave', function () { hideItemTooltip(); });
            } else {
                slot.textContent = '—';
            }
            el.appendChild(slot);
        }
        for (var j = 0; j < vestArr.length; j++) {
            var slot2 = document.createElement('div');
            slot2.className = 'slot';
            var it2 = vestArr[j];
            if (it2 && it2.item_id) {
                var tpl2 = IE.getItemTemplate(it2.item_id);
                var tier2 = IE.getItemDisplayTier(it2.item_id, char);
                slot2.textContent = tpl2 ? IE.getDisplayName(tpl2, tier2).slice(0, 2) : it2.item_id.slice(0, 2);
                var name2 = tpl2 ? IE.getDisplayName(tpl2, tier2) : it2.item_id;
                var desc2 = tpl2 ? IE.getDisplayDesc(tpl2, tier2) : '';
                var attrs2 = formatItemAttributes(tpl2);
                var tipHtml2 = buildItemTooltipHtml(name2, desc2, attrs2);
                slot2.addEventListener('mouseenter', function (html, el) { return function () { showItemTooltip(html, el); }; }(tipHtml2, slot2));
                slot2.addEventListener('mouseleave', function () { hideItemTooltip(); });
            } else {
                slot2.textContent = '—';
            }
            el.appendChild(slot2);
        }
    }

    function render() {
        var ctx = getCtx();
        if (!ctx || !ctx.E || !ctx.G || !ctx.IE) return;
        var E = ctx.E;
        var G = ctx.G;
        var IE = ctx.IE;
        var CELL_PX = ctx.CELL_PX;
        var CENTER_OFFSET_X = ctx.CENTER_OFFSET_X;
        var CENTER_OFFSET_Y = ctx.CENTER_OFFSET_Y;

        var grid = document.getElementById('map-grid');
        if (!grid) return;

        var map = E.getMap();
        var st = E.getState();
        if (!map) return;

        grid.innerHTML = '';
        grid.style.width = (map.width * CELL_PX) + 'px';
        grid.style.height = (map.height * CELL_PX) + 'px';

        var entityAtPlayer = E.getEntityAt(st.x, st.y);
        var canGather = entityAtPlayer && G.getGatheringPointConfig(entityAtPlayer) && G.canGather(entityAtPlayer);
        var pointName = entityAtPlayer && G.getGatheringPointConfig(entityAtPlayer) ? G.getGatheringPointConfig(entityAtPlayer).display_name : '';

        var gap = 1;
        for (var gy = 0; gy < map.height; gy++) {
            for (var gx = 0; gx < map.width; gx++) {
                var tile = document.createElement('div');
                var isPlayer = gx === st.x && gy === st.y;
                var adjacent = E.isAdjacent(gx, gy);
                var walkable = E.isWalkable(gx, gy);
                var portal = E.getPortalAt(gx, gy);
                var entityId = E.getEntityAt(gx, gy);
                var npcId = (typeof E.getNpcAt === 'function') ? E.getNpcAt(gx, gy) : null;
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                var groundAt = (IE && IE.getGroundItemsAt) ? IE.getGroundItemsAt(st.mapId, gx, gy) : [];

                tile.className = 'tile';
                if (!walkable) tile.classList.add('blocked');
                if (portal) tile.classList.add('portal');
                if (entityId === 'gathering_bush' || entityId === 'gathering_grass') tile.classList.add('gathering');
                if (groundAt.length > 0) tile.classList.add('ground-items');
                if (isPlayer) tile.classList.add('player');

                if (npcId) {
                    tile.classList.add('npc');
                    if (adjacent) {
                        tile.classList.add('adjacent');
                        tile.onclick = (function (id) {
                            return function () {
                                if (ctx.actions && typeof ctx.actions.interactNpc === 'function') ctx.actions.interactNpc(id);
                            };
                        })(npcId);
                    }
                } else if (adjacent && walkable) {
                    tile.classList.add('adjacent');
                    tile.onclick = (function (tx, ty) {
                        return function () {
                            if (ctx.actions && typeof ctx.actions.tryMoveTo === 'function') ctx.actions.tryMoveTo(tx, ty);
                        };
                    })(gx, gy);
                } else if (adjacent) {
                    tile.classList.add('adjacent');
                }

                if (portal && portal.label) tile.title = portal.label;
                else if (entityId === 'gathering_bush') tile.title = '灌木丛';
                else if (entityId === 'gathering_grass') tile.title = '草丛';
                else if (!walkable) tile.title = '不可走';
                else tile.title = '';
                if (npcId) tile.title = '';
                if (groundAt.length > 0) tile.title = (tile.title ? tile.title + ' · ' : '') + '地面有 ' + groundAt.length + ' 件物品';

                tile.style.left = (gx * CELL_PX + gap) + 'px';
                tile.style.top = (gy * CELL_PX + gap) + 'px';
                grid.appendChild(tile);
            }
        }

        var tx = CENTER_OFFSET_X - st.x * CELL_PX;
        var ty = CENTER_OFFSET_Y - st.y * CELL_PX;
        grid.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';

        var isIdling = ctx && ctx.isGatheringIdling ? !!ctx.isGatheringIdling() : false;
        var groundAtPlayer = (IE && IE.getGroundItemsAt) ? IE.getGroundItemsAt(st.mapId, st.x, st.y) : [];
        var hasGroundItems = groundAtPlayer.length > 0;
        var bubble = document.getElementById('player-action-bubble');
        var bubbleGather = document.getElementById('player-action-gather');
        var bubbleStop = document.getElementById('player-action-gather-stop');
        var bubbleGroundItems = document.getElementById('player-action-ground-items');
        var showBubble = canGather || isIdling || hasGroundItems;
        if (bubble) bubble.classList.toggle('visible', !!showBubble);
        if (showBubble && bubbleGather && bubbleStop) {
            bubbleGather.style.display = !isIdling ? 'inline-block' : 'none';
            bubbleGather.disabled = !canGather;
            bubbleGather.textContent = pointName ? '采集 · ' + pointName + '（挂机）' : '采集（挂机）';
            bubbleStop.style.display = isIdling ? 'inline-block' : 'none';
        }
        if (bubbleGroundItems) {
            bubbleGroundItems.style.display = hasGroundItems ? 'inline-block' : 'none';
            bubbleGroundItems.textContent = hasGroundItems ? '📦 脚下 ' + groundAtPlayer.length + ' 件' : '📦 脚下物品';
        }

        updateTopTimeHud();
        if (ctx && typeof ctx.updateStatusPanel === 'function') ctx.updateStatusPanel(G.getCharacterState());
        updateQuickBelt();
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


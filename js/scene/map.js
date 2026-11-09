/**
 * SceneMapView — 地图装载合并、角色朝向与渲染调度.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var CELL_PX = E.CELL_PX;
    var combatRenderProfileTimer, playerSpriteUrls, currentFacing, currentFacingDir;

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
            return fetch('data/maps/' + id + '.json?t=' + Date.now())
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
            if (window.NPCSystem && typeof window.NPCSystem.preloadAllMapsNpcs === 'function') {
                window.NPCSystem.preloadAllMapsNpcs(next).then(function () { render(); }).catch(function () { render(); });
            } else {
                render();
            }
        });
    }
 // 8-dir: 0 up, 2 right, 4 down, 6 left

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

    function updatePlayerDirectionIndicator() {
        var el = document.getElementById('player-direction-indicator');
        if (!el) return;
        if (window.MapProjection && window.MapProjection.directionIndicatorPosition) {
            var marker = window.MapProjection.directionIndicatorPosition(currentFacingDir, CELL_PX);
            el.style.transform = 'matrix(' + [marker.a, marker.b, marker.c, marker.d, marker.x, marker.y].join(',') + ')';
        } else {
            var angle = normalizeFacingDir(currentFacingDir) * Math.PI / 4;
            var dx = Math.round(Math.sin(angle)), dy = -Math.round(Math.cos(angle));
            el.style.transform = 'translate(' + (dx*CELL_PX/2+6*Math.sin(angle)) + 'px, ' +
                (dy*CELL_PX/2-6*Math.cos(angle)) + 'px) rotate(' + (angle*180/Math.PI) + 'deg)';
        }
    }

    function normalizeFacingDir(v) {
        var n = Number(v);
        if (!isFinite(n)) return 4;
        n = Math.round(n) % 8;
        if (n < 0) n += 8;
        return n;
    }

    function facingDirToVector(dir) {
        switch (normalizeFacingDir(dir)) {
            case 0: return { x: 0, y: -1 };
            case 1: return { x: 1, y: -1 };
            case 2: return { x: 1, y: 0 };
            case 3: return { x: 1, y: 1 };
            case 4: return { x: 0, y: 1 };
            case 5: return { x: -1, y: 1 };
            case 6: return { x: -1, y: 0 };
            case 7: return { x: -1, y: -1 };
            default: return { x: 0, y: 1 };
        }
    }

    function facingDirToCardinal(dir) {
        var d = normalizeFacingDir(dir);
        if (d === 0 || d === 1 || d === 7) return 'up';
        if (d === 2 || d === 3) return 'right';
        if (d === 4 || d === 5) return 'down';
        return 'left';
    }

    function facingDirFromMove(dx, dy) {
        var x = Number(dx) || 0;
        var y = Number(dy) || 0;
        if (!x && !y) return currentFacingDir;
        if (x > 0 && y < 0) return 1;
        if (x > 0 && y > 0) return 3;
        if (x < 0 && y > 0) return 5;
        if (x < 0 && y < 0) return 7;
        if (x > 0) return 2;
        if (x < 0) return 6;
        if (y < 0) return 0;
        return 4;
    }

    function setFacingDir(dir) {
        currentFacingDir = normalizeFacingDir(dir);
        currentFacing = facingDirToCardinal(currentFacingDir);
        updatePlayerAvatarImage();
        updatePlayerDirectionIndicator();
        // 朝向变化会改变整片格的视野揭示/遮挡；原地转向也要触发一次重绘（SceneRenderer.render 内检测朝向变化会整层重画）。
        try { render(); } catch (eFacingRender) { /* 场景尚未就绪时静默 */ }
        return currentFacingDir;
    }

    function getFacingDir() {
        return normalizeFacingDir(currentFacingDir);
    }

    function setFacingFromMove(dx, dy) {
        return setFacingDir(facingDirFromMove(dx, dy));
    }

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

    function render() {
        refreshRenderProfile();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') {
            window.SceneRenderer.render();
        }
        if (window.HuntingPanel) window.HuntingPanel.render();
        if (window.FishingPanel) window.FishingPanel.ensureStarterSupplies();
    }

    function markCellDirty(mapId, x, y) {
        if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
            window.SceneCtx.pushDirtyCell(x, y);
        }
    }

    function getMapsRef() {
        if (!E || typeof E.getMaps !== 'function') return null;
        return E.getMaps();
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

    function refreshRenderProfile(burstMs) {
        if (!window.SceneCtx) return;
        var contextualCombat = !!window.CombatPanel.combatPanelOpen || hasAdjacentEnemyNow();
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

    function initialize() {
        combatRenderProfileTimer = null;
        playerSpriteUrls = { down: '', up: '', left: '', right: '' };
        currentFacing = 'down';
        currentFacingDir = 4;
    }

    function bind() {

    window.addEventListener('mapviewchange', updatePlayerDirectionIndicator);

    window.SceneCtx.setFacingFromMove = setFacingFromMove;

    window.SceneCtx.getFacingDir = getFacingDir;

    window.SceneCtx.setFacingDir = setFacingDir;

    window.SceneCtx.getFacingVector = function () {
        return facingDirToVector(currentFacingDir);
    };

    window.PlayerFacing = {
        getDir: getFacingDir,
        setDir: setFacingDir,
        setFromMove: setFacingFromMove,
        getVector: function () { return facingDirToVector(currentFacingDir); },
        getCardinal: function () { return currentFacing; }
    };

    window.setPlayerAvatar = setPlayerAvatar;

    window.setPlayerAvatarSprites = setPlayerAvatarSprites;

    if (window.EntityAppearance) {
        EntityAppearance.onAppearanceChange(function (entityId, imageUrl) {
            if (entityId === 'player') setPlayerAvatar(imageUrl);
        });
    }

    window.addEventListener('resize', function () {
        render();
    });

    window.SceneCtx.hasAdjacentEnemyForCombat = hasAdjacentEnemyNow;
    }

    window.SceneMapView = {
        initialize: initialize,
        bind: bind,
        bootstrapMapsFromJson: bootstrapMapsFromJson,
        bumpCombatRenderProfile: bumpCombatRenderProfile,
        markCellDirty: markCellDirty,
        refreshRenderProfile: refreshRenderProfile,
        render: render,
        setFacingFromMove: setFacingFromMove,
        setPlayerAvatarSprites: setPlayerAvatarSprites
    };
})(window);

/**
 * Save System (realtime snapshot)
 * - Build a serializable snapshot from runtime modules' getState()
 * - Persist to localStorage as a single latest save (cover write)
 * - Load snapshot and restore by calling setState() on modules
 *
 * NOTE:
 * - Designed to be extensible: snapshot schemaVersion + safe validation + optional future encryption.
 * - Realtime save is stored as plaintext JSON for reliability/performance.
 */
(function (global) {
    'use strict';

    var SaveSystem = {};

    // ---------------------------
    // Config & runtime state
    // ---------------------------
    var SCHEMA_VERSION = 1;
    var DEFAULT_REALTIME_KEY = 'cabi_realtime_save_v1';
    /** 与 js/npc-system.js 中 LS_FLAGS / LS_TRIGGERED 保持一致 */
    var NPC_DEMO_FLAGS_KEY = 'cabi_demo_flags_v1';
    var NPC_DEMO_TRIGGERED_KEY = 'cabi_demo_triggered_entries_v1';
    var SAVE_INTERVAL_TICKS = 50;
    var MAX_SNAPSHOT_NODES = 500000; // guard against accidental huge payloads

    var realtimeKey = DEFAULT_REALTIME_KEY;
    var enableAutoSave = true;
    var enablePendingIdleSave = true;
    var lastSavedTotalTicks = null;
    var inLoad = false;
    var inSave = false;
    var saveGeneration = 0;
    var patched = false;

    // ---------------------------
    // Utilities
    // ---------------------------
    function safeJsonParse(raw, fallback) {
        try { return JSON.parse(raw); } catch (e) { return fallback; }
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function coerceNumber(v, def) {
        var n = Number(v);
        return (typeof n === 'number' && isFinite(n)) ? n : def;
    }

    function assertSnapshotShape(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        if (snapshot.schemaVersion !== SCHEMA_VERSION) return false;
        if (!snapshot.player || typeof snapshot.player !== 'object') return false;
        if (!snapshot.time || typeof snapshot.time !== 'object') return false;
        if (typeof snapshot.time.totalTicks !== 'number') return false;
        return true;
    }

    function countApproxNodes(v) {
        var seen = 0;
        var stack = [v];
        while (stack.length) {
            var cur = stack.pop();
            if (!cur || typeof cur !== 'object') continue;
            seen += 1;
            if (seen > MAX_SNAPSHOT_NODES) return MAX_SNAPSHOT_NODES + 1;
            if (Array.isArray(cur)) {
                for (var i = 0; i < cur.length; i++) stack.push(cur[i]);
            } else {
                for (var k in cur) if (Object.prototype.hasOwnProperty.call(cur, k)) stack.push(cur[k]);
            }
        }
        return seen;
    }

    function tryRequestIdle(fn) {
        if (!enablePendingIdleSave) return fn();
        try {
            if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, { timeout: 1000 });
        } catch (e0) { /* ignore */ }
        return fn();
    }

    // ---------------------------
    // Snapshot build / restore
    // ---------------------------
    function getAllModulesForSnapshot() {
        return {
            GameTime: global.GameTime,
            GameEngine: global.GameEngine,
            CharacterAttributes: global.CharacterAttributes,
            Survival: global.Survival,
            InventoryEquipment: global.InventoryEquipment,
            Gathering: global.Gathering,
            EntityAppearance: global.EntityAppearance,
            BuffSystem: global.BuffSystem,
            NPCSystem: global.NPCSystem
        };
    }

    function buildSnapshot() {
        var mods = getAllModulesForSnapshot();
        if (!mods.GameTime || !mods.GameEngine || !mods.CharacterAttributes || !mods.Survival || !mods.InventoryEquipment) return null;

        var timeSt = typeof mods.GameTime.getState === 'function' ? mods.GameTime.getState() : null;
        var engineSt = typeof mods.GameEngine.getState === 'function' ? mods.GameEngine.getState() : null;
        var charSt = typeof mods.CharacterAttributes.getState === 'function' ? mods.CharacterAttributes.getState() : null;
        var survSt = typeof mods.Survival.getState === 'function' ? mods.Survival.getState() : null;
        var invSt = typeof mods.InventoryEquipment.getState === 'function' ? mods.InventoryEquipment.getState() : null;

        if (!timeSt || typeof timeSt.totalTicks !== 'number') return null;
        if (!engineSt || !engineSt.mapId) return null;
        if (!charSt) return null;
        if (!survSt) return null;
        if (!invSt) return null;

        var gatheringPersist = null;
        if (mods.Gathering && typeof mods.Gathering.getCharacterState === 'function') {
            try {
                var gatherState = mods.Gathering.getCharacterState();
                if (gatherState && typeof gatherState === 'object') {
                    gatheringPersist = { proficiency_count: coerceNumber(gatherState.proficiency_count, 0) };
                }
            } catch (e) { /* ignore */ }
        }

        var appearance = null;
        if (mods.EntityAppearance && typeof mods.EntityAppearance.getAllAppearances === 'function') {
            try { appearance = mods.EntityAppearance.getAllAppearances(); } catch (e2) { appearance = null; }
        }

        // NPC demo state（写入前同步 epithet→flag，避免存档里缺 player_epithet_useless_person）
        if (mods.NPCSystem && typeof mods.NPCSystem.syncPlayerEpithetFlags === 'function') {
            try { mods.NPCSystem.syncPlayerEpithetFlags(); } catch (eSyncSnap) { /* ignore */ }
        }
        var npcDemo = null;
        if (mods.NPCSystem && typeof mods.NPCSystem.getDemoState === 'function') {
            try { npcDemo = mods.NPCSystem.getDemoState(); } catch (e4) { npcDemo = null; }
        }

        var sceneUiPersist = null;
        if (global.SceneCtx && typeof global.SceneCtx.getActionBarSlots === 'function') {
            try {
                var abs = global.SceneCtx.getActionBarSlots();
                if (Array.isArray(abs)) sceneUiPersist = { action_bar_slots: abs.slice(0, 4) };
            } catch (eSceneUi) { sceneUiPersist = null; }
        }

        // Buffs: store dynamic instance fields only, decouple from buff definition templates.
        var buffsPersist = null;
        if (mods.BuffSystem && typeof mods.BuffSystem.getState === 'function' && typeof mods.BuffSystem.setState === 'function') {
            try {
                var bs = mods.BuffSystem.getState();
                var instByOwner = bs && bs.instancesByOwner ? bs.instancesByOwner : null;
                if (isPlainObject(instByOwner)) {
                    buffsPersist = { instancesByOwner: {} };
                    var ownerIds = Object.keys(instByOwner);
                    for (var i = 0; i < ownerIds.length; i++) {
                        var oid = ownerIds[i];
                        var arr = instByOwner[oid];
                        if (!Array.isArray(arr)) continue;
                        buffsPersist.instancesByOwner[oid] = [];
                        for (var j = 0; j < arr.length; j++) {
                            var inst = arr[j];
                            if (!inst || !inst.buff_id) continue;
                            buffsPersist.instancesByOwner[oid].push({
                                uid: String(inst.uid || ''),
                                buff_id: String(inst.buff_id || ''),
                                owner_id: String(inst.owner_id || oid || 'player'),
                                source_id: inst.source_id != null ? String(inst.source_id) : null,
                                started_tick: coerceNumber(inst.started_tick, 0),
                                expires_at_tick: coerceNumber(inst.expires_at_tick, timeSt.totalTicks),
                                stacks: coerceNumber(inst.stacks, 1)
                            });
                        }
                    }
                }
            } catch (e3) { buffsPersist = null; }
        }

        return {
            schemaVersion: SCHEMA_VERSION,
            saveGeneration: saveGeneration,
            savedAt: Date.now(),
            time: { totalTicks: timeSt.totalTicks },
            player: {
                engine: { mapId: engineSt.mapId, x: engineSt.x, y: engineSt.y },
                characterAttributes: charSt,
                survival: survSt,
                inventoryEquipment: invSt,
                gathering: gatheringPersist,
                entityAppearance: appearance,
                npcDemo: npcDemo,
                sceneUi: sceneUiPersist
            },
            buffs: buffsPersist
        };
    }

    function applySnapshot(snapshot) {
        if (!assertSnapshotShape(snapshot)) return false;
        var mods = getAllModulesForSnapshot();
        if (!mods.GameTime || !mods.GameEngine || !mods.CharacterAttributes || !mods.Survival || !mods.InventoryEquipment) return false;

        // Time first: buff expiration is tick-based.
        if (typeof mods.GameTime.reset === 'function') {
            mods.GameTime.reset({ totalTicks: snapshot.time.totalTicks });
        }

        // Engine position.
        if (typeof mods.GameEngine.setState === 'function') {
            mods.GameEngine.setState(snapshot.player.engine.mapId, snapshot.player.engine.x, snapshot.player.engine.y);
        }

        // Inventory/equipment + skills + ground items.
        if (typeof mods.InventoryEquipment.setState === 'function') {
            mods.InventoryEquipment.setState(snapshot.player.inventoryEquipment);
        }

        // Character attributes.
        if (typeof mods.CharacterAttributes.setState === 'function') {
            mods.CharacterAttributes.setState(snapshot.player.characterAttributes);
        }

        // Survival stats.
        if (typeof mods.Survival.setState === 'function') {
            mods.Survival.setState(snapshot.player.survival);
        }

        // Gathering progression.
        if (mods.Gathering && typeof mods.Gathering.setCharacterState === 'function' && snapshot.player.gathering) {
            mods.Gathering.setCharacterState({ proficiency_count: snapshot.player.gathering.proficiency_count });
        }

        // Entity appearance (optional).
        if (mods.EntityAppearance && typeof mods.EntityAppearance.setAllAppearances === 'function' && snapshot.player.entityAppearance) {
            mods.EntityAppearance.setAllAppearances(snapshot.player.entityAppearance);
        }

        // NPC demo state (optional).
        if (mods.NPCSystem && typeof mods.NPCSystem.setDemoState === 'function' && snapshot.player.npcDemo) {
            try { mods.NPCSystem.setDemoState(snapshot.player.npcDemo); } catch (e5) { /* ignore */ }
        }
        // setDemoState 会整包覆盖 flags，需按角色 epithet 再对齐无用之人 flag
        if (mods.NPCSystem && typeof mods.NPCSystem.syncPlayerEpithetFlags === 'function') {
            try { mods.NPCSystem.syncPlayerEpithetFlags(); } catch (e5b) { /* ignore */ }
        }

        // Recalc derived stats once before buff restore.
        if (mods.CharacterAttributes && typeof mods.CharacterAttributes.recalcCharacterStats === 'function') {
            mods.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return mods.InventoryEquipment.getState().equipment; },
                getSkillsState: function () { return mods.InventoryEquipment.getState().skills; },
                getItemTemplate: mods.InventoryEquipment.getItemTemplate,
                getEnchantEntry: mods.InventoryEquipment.getEnchantEntry,
                getStrengthLevel: function () { return mods.InventoryEquipment.getSkillLevel('survival_strength'); }
            });
        }

        if (snapshot.buffs && mods.BuffSystem && typeof mods.BuffSystem.setState === 'function') {
            try { mods.BuffSystem.setState(snapshot.buffs); } catch (e4) { /* ignore */ }
        }

        if (global.SceneCtx && typeof global.SceneCtx.setActionBarSlots === 'function' && snapshot.player && snapshot.player.sceneUi) {
            try {
                var su = snapshot.player.sceneUi;
                if (su && Array.isArray(su.action_bar_slots)) global.SceneCtx.setActionBarSlots(su.action_bar_slots);
            } catch (eAb) { /* ignore */ }
        }

        return true;
    }

    // ---------------------------
    // Export / Import Save Code (AES-256-GCM + PBKDF2)
    // ---------------------------
    var EXPORT_TOKEN_VERSION = 1;
    var DEFAULT_PBKDF2_ITERATIONS = 150000;
    var ACCOUNT_HASH_BYTES = 32; // SHA-256

    function textToBytes(s) {
        return global.TextEncoder ? new global.TextEncoder().encode(String(s || '')) : null;
    }

    function bytesToHex(bytes) {
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        var out = '';
        for (var i = 0; i < u8.length; i++) {
            out += (u8[i] < 16 ? '0' : '') + u8[i].toString(16);
        }
        return out;
    }

    function bytesToBase64(bytes) {
        var bin = '';
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        return global.btoa ? global.btoa(bin) : bin;
    }

    function base64ToBytes(b64) {
        var bin = global.atob ? global.atob(String(b64 || '')) : String(b64 || '');
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }

    async function sha256Hex(input) {
        if (!global.crypto || !global.crypto.subtle) throw new Error('WebCrypto not available');
        var bytes = textToBytes(input);
        var digest = await global.crypto.subtle.digest('SHA-256', bytes);
        return bytesToHex(new Uint8Array(digest));
    }

    async function deriveAesGcmKeyFromPassword(password, saltBytes, iterations) {
        if (!global.crypto || !global.crypto.subtle) throw new Error('WebCrypto not available');
        var pwBytes = textToBytes(password);
        var keyMaterial = await global.crypto.subtle.importKey(
            'raw',
            pwBytes,
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return global.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptPayloadToToken(payload, password, accountHashHex) {
        var salt = new Uint8Array(16);
        var iv = new Uint8Array(12);
        global.crypto.getRandomValues(salt);
        global.crypto.getRandomValues(iv);
        var iterations = DEFAULT_PBKDF2_ITERATIONS;
        var key = await deriveAesGcmKeyFromPassword(password, salt, iterations);
        var plaintextBytes = textToBytes(JSON.stringify(payload));
        var ct = await global.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            plaintextBytes
        );
        var tokenObj = {
            t: EXPORT_TOKEN_VERSION,
            kdf: { it: iterations, salt: bytesToBase64(salt) },
            iv: bytesToBase64(iv),
            ct: bytesToBase64(new Uint8Array(ct)),
            accountHash: accountHashHex
        };
        var tokenJson = JSON.stringify(tokenObj);
        // Return pure string token (base64(utf8(JSON))).
        if (global.btoa) {
            var tokenBytes = textToBytes(tokenJson);
            return bytesToBase64(tokenBytes);
        }
        return tokenJson;
    }

    async function decryptTokenToPayload(code, password, accountHashHexExpected) {
        if (!global.crypto || !global.crypto.subtle) throw new Error('WebCrypto not available');
        if (!code) throw new Error('empty_code');
        var tokenJson = null;
        // Prefer base64(utf8(JSON)), fallback to raw JSON.
        try {
            if (typeof code === 'string' && /^[A-Za-z0-9+/=]+$/.test(code.trim()) && global.atob) {
                var tokenBytes = base64ToBytes(code.trim());
                // tokenBytes -> string
                var bin = '';
                for (var i = 0; i < tokenBytes.length; i++) bin += String.fromCharCode(tokenBytes[i]);
                tokenJson = bin;
            }
        } catch (e0) { /* ignore */ }
        if (!tokenJson) tokenJson = String(code);
        var tokenObj = safeJsonParse(tokenJson, null);
        if (!tokenObj || !tokenObj.kdf || !tokenObj.iv || !tokenObj.ct) throw new Error('bad_token');
        if (tokenObj.accountHash !== accountHashHexExpected) throw new Error('account_mismatch');

        var saltBytes = base64ToBytes(tokenObj.kdf.salt);
        var iterations = coerceNumber(tokenObj.kdf.it, DEFAULT_PBKDF2_ITERATIONS);
        var ivBytes = base64ToBytes(tokenObj.iv);
        var ctBytes = base64ToBytes(tokenObj.ct);

        var key = await deriveAesGcmKeyFromPassword(password, saltBytes, iterations);
        var plaintextBytes = await global.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            key,
            ctBytes
        );

        var decoder = global.TextDecoder ? new global.TextDecoder() : null;
        var jsonStr = decoder ? decoder.decode(plaintextBytes) : String.fromCharCode.apply(null, new Uint8Array(plaintextBytes));
        var payload = safeJsonParse(jsonStr, null);
        if (!payload) throw new Error('bad_payload');
        return payload;
    }

    function getLocalRealtimeSnapshotRaw() {
        try { return localStorage.getItem(realtimeKey); } catch (e) { return null; }
    }

    function getLocalRealtimeSaveGeneration() {
        var raw = getLocalRealtimeSnapshotRaw();
        if (!raw) return null;
        var snap = safeJsonParse(raw, null);
        if (!snap || typeof snap !== 'object') return null;
        return (snap.saveGeneration != null) ? coerceNumber(snap.saveGeneration, 0) : null;
    }

    // Public: export
    SaveSystem.exportSaveCode = async function (params) {
        params = params || {};
        var account = String(params.account || '');
        var password = String(params.password || '');
        if (!account || !password) throw new Error('account/password required');

        if (inLoad || inSave) throw new Error('busy');
        inSave = true;
        try {
            var snapshot = buildSnapshot();
            if (!snapshot) throw new Error('snapshot_unavailable');

            // Export should advance generation once.
            saveGeneration = (coerceNumber(saveGeneration, 0) || 0) + 1;
            snapshot.saveGeneration = saveGeneration;

            snapshot.time.totalTicks = global.GameTime && typeof global.GameTime.getState === 'function'
                ? global.GameTime.getState().totalTicks
                : snapshot.time.totalTicks;

            var accountHashHex = await sha256Hex(account);
            var code = await encryptPayloadToToken(snapshot, password, accountHashHex);
            // Keep realtime save aligned with exported generation.
            try { persistRealtime(snapshot); lastSavedTotalTicks = snapshot.time.totalTicks; } catch (e1) { /* ignore */ }
            return code;
        } finally {
            inSave = false;
        }
    };

    // Public: import
    SaveSystem.importSaveCode = async function (code, params) {
        params = params || {};
        var account = String(params.account || '');
        var password = String(params.password || '');
        if (!account || !password) throw new Error('account/password required');
        if (inLoad || inSave) throw new Error('busy');
        inLoad = true;
        try {
            var accountHashHex = await sha256Hex(account);
            var payloadSnapshot = await decryptTokenToPayload(code, password, accountHashHex);

            // Migrate/validate
            if (!payloadSnapshot || typeof payloadSnapshot !== 'object') throw new Error('payload invalid');
            if (payloadSnapshot.schemaVersion !== SCHEMA_VERSION) payloadSnapshot = migrateSnapshot(payloadSnapshot);
            if (!assertSnapshotShape(payloadSnapshot)) throw new Error('snapshot invalid shape');

            // Save generation check: don't load earlier than local.
            var localGen = getLocalRealtimeSaveGeneration();
            if (localGen != null && payloadSnapshot.saveGeneration != null) {
                var loadGen = coerceNumber(payloadSnapshot.saveGeneration, 0);
                if (loadGen < localGen) return { ok: false, reason: 'older' };
            }

            // Apply snapshot and overwrite realtime save.
            var ok = applySnapshot(payloadSnapshot);
            if (!ok) return { ok: false, reason: 'apply' };

            saveGeneration = coerceNumber(payloadSnapshot.saveGeneration, saveGeneration);
            lastSavedTotalTicks = payloadSnapshot.time && typeof payloadSnapshot.time.totalTicks === 'number'
                ? payloadSnapshot.time.totalTicks
                : lastSavedTotalTicks;

            persistRealtime(payloadSnapshot);
            return { ok: true };
        } finally {
            inLoad = false;
        }
    };

    // Optional convenience prompts (for manual testing)
    SaveSystem.openExportPrompt = async function () {
        var account = global.prompt ? global.prompt('输入账号(account)：') : '';
        var password = global.prompt ? global.prompt('输入密码(password)：') : '';
        if (!account || !password) return null;
        var code = await SaveSystem.exportSaveCode({ account: account, password: password });
        return code;
    };

    SaveSystem.openImportPrompt = async function (code) {
        if (!code && global.prompt) code = global.prompt('粘贴存档码(code)：') || '';
        var account = global.prompt ? global.prompt('输入账号(account)：') : '';
        var password = global.prompt ? global.prompt('输入密码(password)：') : '';
        if (!code || !account || !password) return false;
        var r = await SaveSystem.importSaveCode(code, { account: account, password: password });
        return !!(r && r.ok);
    };

    function persistRealtime(snapshot) {
        try {
            localStorage.setItem(realtimeKey, JSON.stringify(snapshot));
            return true;
        } catch (e) {
            return false;
        }
    }

    function migrateSnapshot(snapshot) {
        // Hook for future migrations.
        // Currently only schemaVersion=1 exists.
        if (!snapshot || typeof snapshot !== 'object') return snapshot;
        snapshot.schemaVersion = SCHEMA_VERSION;
        return snapshot;
    }

    function loadRealtime() {
        if (inLoad) return false;
        var raw = null;
        try { raw = localStorage.getItem(realtimeKey); } catch (e0) { raw = null; }
        if (!raw) return false;
        var snapshot = safeJsonParse(raw, null);
        if (!snapshot) return false;

        var migrated = snapshot;
        if (snapshot.schemaVersion !== SCHEMA_VERSION) migrated = migrateSnapshot(snapshot);
        if (!assertSnapshotShape(migrated)) return false;

        inLoad = true;
        try {
            var ok = applySnapshot(migrated);
            if (ok) {
                lastSavedTotalTicks = migrated.time.totalTicks;
                saveGeneration = coerceNumber(migrated.saveGeneration, saveGeneration);
            }
            return ok;
        } finally {
            inLoad = false;
        }
    }

    function maybeAutoSave() {
        if (!enableAutoSave) return;
        if (inLoad || inSave) return;
        if (!global.GameTime || typeof global.GameTime.getState !== 'function') return;

        var st = global.GameTime.getState();
        if (!st || typeof st.totalTicks !== 'number') return;
        var nowTicks = st.totalTicks;
        if (nowTicks <= 0) return;

        if (lastSavedTotalTicks == null) {
            if (nowTicks < SAVE_INTERVAL_TICKS) return;
        } else {
            if (nowTicks - lastSavedTotalTicks < SAVE_INTERVAL_TICKS) return;
        }

        inSave = true;
        tryRequestIdle(function () {
            try {
                if (inLoad) return;
                var st2 = global.GameTime.getState();
                if (!st2 || typeof st2.totalTicks !== 'number') return;
                if (lastSavedTotalTicks != null && st2.totalTicks - lastSavedTotalTicks < SAVE_INTERVAL_TICKS) return;

                var snapshot = buildSnapshot();
                if (!snapshot) return;
                if (countApproxNodes(snapshot) > MAX_SNAPSHOT_NODES) return;

                saveGeneration = (coerceNumber(saveGeneration, 0) || 0) + 1;
                snapshot.saveGeneration = saveGeneration;
                snapshot.time.totalTicks = st2.totalTicks;

                var ok = persistRealtime(snapshot);
                if (ok) lastSavedTotalTicks = snapshot.time.totalTicks;
            } catch (e) {
                // Never break gameplay.
            } finally {
                inSave = false;
            }
        });
    }

    // ---------------------------
    // Public API
    // ---------------------------
    SaveSystem.init = function (options) {
        options = options || {};
        realtimeKey = options.realtimeKey || DEFAULT_REALTIME_KEY;
        SAVE_INTERVAL_TICKS = coerceNumber(options.saveIntervalTicks, SAVE_INTERVAL_TICKS);
        enableAutoSave = options.enableAutoSave !== false;
        enablePendingIdleSave = options.enablePendingIdleSave !== false;

        if (patched) return;
        patched = true;

        if (global.Survival && typeof global.Survival.advanceTick === 'function') {
            if (!global.Survival.__saveSystemPatched) {
                var oldAdvance = global.Survival.advanceTick;
                global.Survival.advanceTick = function () {
                    var ret = oldAdvance.apply(this, arguments);
                    try { maybeAutoSave(); } catch (e0) { /* ignore */ }
                    return ret;
                };
                global.Survival.__saveSystemPatched = true;
            }
        }
    };

    SaveSystem.loadRealtime = function () {
        try { return loadRealtime(); } catch (e) { return false; }
    };

    SaveSystem.saveNow = function () {
        if (inLoad || inSave) return false;
        inSave = true;
        try {
            if (!global.GameTime || typeof global.GameTime.getState !== 'function') return false;
            var st = global.GameTime.getState();
            if (!st || typeof st.totalTicks !== 'number') return false;

            var snapshot = buildSnapshot();
            if (!snapshot) return false;
            saveGeneration = (coerceNumber(saveGeneration, 0) || 0) + 1;
            snapshot.saveGeneration = saveGeneration;
            snapshot.time.totalTicks = st.totalTicks;

            var ok = persistRealtime(snapshot);
            if (ok) lastSavedTotalTicks = snapshot.time.totalTicks;
            return ok;
        } finally {
            inSave = false;
        }
    };

    SaveSystem.buildSnapshotForDebug = function () {
        return buildSnapshot();
    };

    SaveSystem.getStatus = function () {
        return {
            schemaVersion: SCHEMA_VERSION,
            realtimeKey: realtimeKey,
            lastSavedTotalTicks: lastSavedTotalTicks,
            saveGeneration: saveGeneration,
            enableAutoSave: enableAutoSave,
            saveIntervalTicks: SAVE_INTERVAL_TICKS,
            inLoad: inLoad,
            inSave: inSave
        };
    };

    /**
     * 清除本机与「下次进入会载入」相关的全部持久化数据：
     * - 实时进度快照（localStorage）
     * - NPC demo flags / 一次性触发记录
     * 并重置内存中的存档世代计数，避免清空后仍被旧世代规则误伤。
     */
    SaveSystem.clearAllLocalProgress = function () {
        var anyFail = false;
        function rm(key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                anyFail = true;
            }
        }
        rm(realtimeKey);
        rm(NPC_DEMO_FLAGS_KEY);
        rm(NPC_DEMO_TRIGGERED_KEY);
        lastSavedTotalTicks = null;
        saveGeneration = 0;
        return !anyFail;
    };

    global.SaveSystem = SaveSystem;
})(typeof window !== 'undefined' ? window : this);


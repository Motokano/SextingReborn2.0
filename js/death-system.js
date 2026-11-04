/* One death transaction, shared by both HUDs. Restoring a snapshot never judges a run. */
(function (g) {
    'use strict';
    var state = { version: 1, deathCount: 0, current: null };
    var config, queued = false, error = '', sessionBlocked = false, settling = false;
    var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
    var phases = ['pending', 'awaiting_revival', 'revival_scene', 'revived'];
    function validate(s) {
        if (s == null) return true;
        if (s.version !== 1 || !Number.isSafeInteger(s.deathCount) || s.deathCount < 0) return false;
        var c = s.current;
        return c == null || (typeof c.reason === 'string' && phases.indexOf(c.phase) >= 0 &&
            Number.isSafeInteger(c.number) && c.number > 0 &&
            c.number === s.deathCount + (c.phase === 'pending' ? 1 : 0) &&
            Number.isFinite(c.elapsedMs) && c.elapsedMs >= 0 &&
            (c.dialogueCompleted == null || typeof c.dialogueCompleted === 'boolean') &&
            (c.logEntries == null || (Array.isArray(c.logEntries) && c.logEntries.length <= 9 &&
                c.logEntries.every(function (e) { return e && typeof e.message === 'string' && typeof e.time === 'string'; }))));
    }
    function causeMessage() {
        var c = state.current, reason = c.reason, t = g.UIText.t;
        if (/^vital_(head|chest|abdomen)$/.test(reason)) {
            var part = reason.slice(6), CA = g.CharacterAttributes;
            return t('log.death.vital', { part: t('body.part.' + part),
                current: CA.getPartDestroy(part), max: CA.getBodyPartDestroyMax(part) });
        }
        if (reason === 'energy_shatter') return t('survival.death.energy_shatter');
        if (['starvation', 'dehydration', 'drug_toxicity', 'dungeon_interrupted'].indexOf(reason) >= 0) return t('log.death.' + reason);
        if (reason === 'temperature_extreme_cold' || reason === 'temperature_extreme_hot') {
            return t('log.death.' + reason, { temperature: g.Survival.getState().body_temperature });
        }
        return t('log.death.unknown');
    }
    function captureDeathLog() {
        if (Array.isArray(state.current.logEntries)) return;
        var journal = g.GameLog, entries = journal ? journal.getEntries() : [];
        // The synchronous combat group has finished: its final damage log is now
        // available. Keep actual entries, not a second combat explanation renderer.
        entries = entries.filter(function (e) {
            return e.tick === state.current.logTick && ['log-combat', 'log-damage', 'log-warn'].indexOf(e.type) >= 0;
        }).slice(-8);
        var message = state.current.legacyDead ? g.UIText.t('log.death.record_unavailable') : causeMessage();
        var last = entries[entries.length - 1];
        if (!last || last.message !== message) {
            if (journal) { journal.log(message, 'warn'); last = journal.getEntries().slice(-1)[0]; }
            else last = { message: message, time: '', type: 'log-warn' };
            entries.push(last);
        }
        state.current.logEntries = clone(entries);
    }
    function blocked() { return sessionBlocked || !!(state.current && state.current.phase !== 'revived'); }
    function refresh() {
        if (g.DeathPanel) g.DeathPanel.render();
        if (g.SceneHud) g.SceneHud.refresh('status');
        if (g.SceneRenderer) g.SceneRenderer.render();
    }
    function recalc() {
        var IE = g.InventoryEquipment;
        g.CharacterAttributes.recalcCharacterStats({
            getEquipmentState: function () { return IE.getState().equipment; },
            getSkillsState: function () { return IE.getState().skills; },
            getItemTemplate: IE.getItemTemplate, getEnchantEntry: IE.getEnchantEntry,
            getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
        });
    }
    function transaction(fn, trigger) {
        if (settling || g.SaveSystem.isAtomic()) return false;
        settling = true;
        var result;
        try { result = g.SaveSystem.runAtomic(fn, { trigger: trigger, required: true }); }
        catch (e) { error = '死亡处理未完成，请重试。'; }
        finally { settling = false; }
        if (!result || !result.saved) {
            error = '保存失败，请重试。'; refresh(); return false;
        }
        error = ''; refresh(); return true;
    }
    function settle() {
        if (!state.current || state.current.phase !== 'pending' || !g.Survival.isDead()) return false;
        // Capture before rollback/penalties; storage retry must not append another log.
        captureDeathLog();
        if (g.SceneApp && g.SceneApp.prepareDeath) g.SceneApp.prepareDeath();
        return transaction(function () {
            var IE = g.InventoryEquipment, skills = clone(IE.getState().skills), losses = [];
            Object.keys(skills).forEach(function (id) {
                var row = skills[id], level = Math.max(0, Math.floor(Number(row.level) || 0));
                if (state.current.legacyDead || !g.CombatSkills.getSkill(id) || level === 0) return;
                var lost = Math.max(1, Math.floor(level * 0.1));
                row.level = Math.max(0, level - lost);
                losses.push({ id: id, before: level, after: row.level });
            });
            // The whole synchronous combat group has committed before this microtask.
            // Equipment is therefore still present during both simultaneous strikes.
            if (g.DungeonRuntime) g.DungeonRuntime.die();
            if (g.Hunting) { var hunt = g.Hunting.getState(); hunt.active = null; g.Hunting.setState(hunt); }
            if (g.FishingSession) { var fish = g.FishingSession.getState(); fish.active = null; g.FishingSession.setState(fish); }
            IE.clearAllOnDeath();
            var inventory = clone(IE.getState()); inventory.skills = skills; IE.setState(inventory);
            recalc();
            g.Survival.setState({ isResting: false, is_stamina_regen_action_active: false,
                is_sit_meditation_active: false, is_study_active: false, study_skill_id: null });
            state.deathCount = state.current.number;
            state.current.phase = 'awaiting_revival';
            state.current.skillLosses = losses;
        }, 'death.settle');
    }
    function request(reason) {
        if (state.current && state.current.phase !== 'revived') return;
        state.current = { phase: 'pending', number: state.deathCount + 1,
            reason: String(reason || 'unknown'), elapsedMs: 0, dialogueCompleted: false,
            logTick: g.GameTime ? g.GameTime.getState().totalTicks : 0,
            runId: g.DungeonRuntime && g.DungeonRuntime.getRun() ? g.DungeonRuntime.getRun().id : null };
        error = '';
        if (!queued) {
            queued = true;
            Promise.resolve().then(function () { queued = false; settle(); refresh(); });
        }
    }
    function resume() {
        if (sessionBlocked) { refresh(); return; }
        var run = g.DungeonRuntime && g.DungeonRuntime.getRun();
        if (state.current && state.current.phase !== 'revived') {
            g.Survival.setState({ isDead: true, deathReason: state.current.reason });
            if (state.current.phase === 'pending') settle();
            else if (state.current.phase === 'revival_scene' && state.current.dialogueCompleted) revive();
        } else if (g.Survival.isDead() || (run && run.status === 'active')) {
            // Only startup/import calls this. runAtomic rollback must never enter here.
            var legacyDead = !state.current && g.Survival.isDead();
            var reason = g.Survival.isDead() ? g.Survival.getDeathReason() : 'dungeon_interrupted';
            g.Survival.setState({ isDead: true, deathReason: reason });
            request(reason); state.current.legacyDead = legacyDead; settle();
        }
        refresh();
    }
    function chooseRevival() {
        if (!state.current || state.current.phase !== 'awaiting_revival') return false;
        return transaction(function () {
            state.current.phase = 'revival_scene'; state.current.elapsedMs = 0; state.current.dialogueCompleted = false;
        }, 'death.scene');
    }
    function revive() {
        if (!state.current || state.current.phase !== 'revival_scene' || !state.current.dialogueCompleted) return false;
        return transaction(function () {
            var E = g.GameEngine, CA = g.CharacterAttributes, S = g.Survival, IE = g.InventoryEquipment;
            var found = false;
            config.revivalCells.some(function (p) {
                E.setState(config.revivalMapId, p[0], p[1]);
                if (E.getState().mapId === config.revivalMapId && E.isWalkable(p[0], p[1])) { found = true; return true; }
                return false;
            });
            if (!found) throw new Error('No walkable revival cell');
            var bs = clone(g.BuffSystem.getState());
            bs.instancesByOwner.player = [];
            g.BuffSystem.setState(bs);
            var inv = IE.getState();
            if (inv.combat) { inv = clone(inv); inv.combat.stun_value = 0; inv.combat.stun_rounds_left = 0; IE.setState(inv); }
            var pharmacy = g.SceneCtx && g.SceneCtx.pharmacy_effects;
            if (pharmacy) {
                pharmacy.toxicity = 0; pharmacy.toxicity_lethal_ticks = 0;
                pharmacy.lethal_active = false; pharmacy.last_band = 'none'; pharmacy.topical_parts = {};
            }
            if (g.PharmacyEffects) g.PharmacyEffects.refreshAddictionStage();
            recalc(); S.refreshDiqiMaxFromBreath();
            var parts = {}, acc = {};
            ['head', 'chest', 'abdomen', 'lhand', 'rhand', 'lfoot', 'rfoot'].forEach(function (k) {
                parts[k] = CA.getBodyPartDestroyMax(k) * config.destroyRatio; acc[k] = 0;
            });
            CA.setState({ part_destroy: parts, part_destroy_recover_acc: acc, destroy_recover_block_ticks: 0 });
            var old = S.getState(), get = S.getConfigValue, ratio = config.resourceRatio;
            S.setState({ isDead: false, deathReason: null, isComa: false,
                stamina: S.getStaminaMax() * ratio, energy: S.getEnergyMax() * ratio,
                satiety: get('satiety_max', 100) * ratio, thirst: S.getThirstMax() * ratio,
                qi_li_current: S.getQiLiMax() * ratio, diqi_current: old.diqi_max * ratio,
                diqi_shield_remaining: 0, fatigue: get('fatigue_max', 100) * ratio,
                mood: (get('mood_min', 0) + get('mood_max', 1000)) / 2,
                body_temperature: old.body_temperature_standard, temperature_sources: {},
                starvationTicks: 0, thirstDeathTicks: 0, staminaZeroTicks: 0,
                severeHungerTicks: 0, overfedTicks: 0, pain: 0, pain_no_hit_ticks: 0,
                food_metabolism: null });
            state.current.phase = 'revived';
        }, 'death.revive');
    }
    var api = {
        request: request, settle: settle, resume: resume, blocked: blocked, chooseRevival: chooseRevival, revive: revive,
        validate: validate, getState: function () { return clone(state); },
        restore: function (s) { state = s ? clone(s) : { version: 1, deathCount: 0, current: null }; error = ''; },
        getError: function () { return error; }, isSessionBlocked: function () { return sessionBlocked; },
        getConfig: function () { return clone(config); },
        getLogEntries: function () {
            return clone(state.current && state.current.logEntries || [{ message: g.UIText.t('log.death.record_unavailable'), time: '', type: 'log-warn' }]);
        },
        line: function () { return '变...求...' + String(state.current ? state.current.number : state.deathCount).padStart(5, '0') + '号，...准'; },
        completeDialogue: function (number) {
            if (!state.current || state.current.phase !== 'revival_scene' || state.current.number !== number || error) return false;
            // Completion is retained in a failed transaction's rollback, so retry does
            // not replay the line. A reload of the older saved phase may replay it once.
            state.current.dialogueCompleted = true;
            return revive();
        },
        checkpointScene: function () {
            if (!state.current || state.current.phase !== 'revival_scene' || error) return;
            if (!g.SaveSystem.saveNow({ trigger: 'death.scene', required: true })) { error = '保存失败，请重试。'; refresh(); }
        },
        retry: function () {
            error = '';
            if (state.current.phase === 'pending') return settle();
            if (state.current.phase === 'awaiting_revival') return chooseRevival();
            if (state.current.dialogueCompleted) return revive();
            api.checkpointScene(); refresh();
        }
    };
    api.ready = Promise.all([
        fetch('data/death-system.json').then(function (r) { if (!r.ok) throw new Error('死亡配置加载失败'); return r.json(); }).then(function (c) {
            if (c.version !== 1 ||
                typeof c.revivalMapId !== 'string' || !Array.isArray(c.revivalCells) || !c.revivalCells.length ||
                !c.revivalCells.every(function (p) { return Array.isArray(p) && p.length === 2 && p.every(Number.isInteger); }) ||
                !(c.destroyRatio >= 0 && c.destroyRatio < 1) || !(c.resourceRatio > 0 && c.resourceRatio <= 1)) throw new Error('死亡配置无效');
            config = c;
        }),
        // Browser-held lease: closing/crashing releases it, backgrounding does not.
        new Promise(function (resolve) {
            if (!g.navigator.locks) { resolve(); return; }
            g.navigator.locks.request('cabi-game-session', { ifAvailable: true }, function (lock) {
                sessionBlocked = !lock; resolve();
                if (lock) return new Promise(function () {});
            }).catch(function () { sessionBlocked = true; resolve(); });
        })
    ]);
    g.DeathSystem = api;
})(window);

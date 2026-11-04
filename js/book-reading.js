/* Reading owns its paid ticks; skill progress belongs to the character. */
(function (g) {
    'use strict';
    var session = null, active = false, timer = null, epoch = 0, advancing = false;
    var I = function () { return g.InventoryEquipment; };
    var copy = function (x) { return x == null ? null : JSON.parse(JSON.stringify(x)); };
    var fail = function (reason, message) { return { ok: false, reason: reason, message: message }; };
    var number = function (n) { return Number.isFinite(n) && n >= 0; };
    function position() { var p = g.GameEngine.getState(); return { mapId: p.mapId, x: p.x, y: p.y }; }
    function samePosition(a, b) { return a.mapId === b.mapId && a.x === b.x && a.y === b.y; }
    function sameBook(a, b) { return a && b && a.id === b.id && a.context.type === b.context.type && a.context.owner === b.context.owner; }
    function refresh() { if (g.SceneHud) g.SceneHud.refresh('status'); if (g.SceneApp && g.SceneApp.panelApi) g.SceneApp.panelApi.changed(); }
    function stopTimer() { epoch++; if (timer !== null) g.clearTimeout(timer); timer = null; }
    function pause(message) { stopTimer(); active = false; if (session) session.status = message || '已暂停阅读'; }
    function skillProfile(id) {
        var items = I() && I().getItemTemplate('book_anatomy_textbook');
        return items && items.book_profile && items.book_profile.skill_id === id ? items.book_profile : null;
    }
    function isBookSkill(id) { return !!skillProfile(id); }
    function progress(profile) {
        var skill = profile.skill, level = I().getSkillLevel(profile.skill_id);
        var entry = I().getSkillsState()[profile.skill_id] || {};
        var thresholds = skill.exp_thresholds;
        var cost = thresholds && level < skill.max_level ? thresholds[level + 1] - thresholds[level] : 0;
        var exp = number(entry.book_exp) ? entry.book_exp : 0;
        return { level: level, exp: exp, cost: cost, maxLevel: skill.max_level, total: number(entry.book_total_exp) ? entry.book_total_exp : 0 };
    }
    function check(request) {
        var result = g.BookLearning.inspectBook(request);
        if (!result.ok) return result;
        if (g.CombatEngagement && g.CombatEngagement.isPlayerInCombat()) return fail('combat', '战斗中无法阅读。');
        var profile = result.book.profile, p = progress(profile);
        var cap = Math.min(result.cap, result.book.fragments * profile.levels_per_fragment);
        if (p.level >= cap) return fail('book_cap', '当前内容已掌握');
        if (!p.cost) return fail('missing_curve', '教材学习配置尚未就绪。');
        var energy = Math.max(0, Number(g.Survival.getConfigValue('study_tick_energy_cost', 1)) || 1);
        var budget = Math.floor(g.Survival.getStudyState().potentialPerEnergy * energy);
        var remaining = profile.skill.exp_thresholds[cap] - profile.skill.exp_thresholds[p.level] - p.exp;
        var gain = Math.min(Math.floor(budget / profile.learning.potential_per_exp), Math.floor(I().getPotential() / profile.learning.potential_per_exp), remaining);
        if (g.Survival.getEnergy() < energy) return fail('energy', '精力不足，已停止阅读。');
        if (gain <= 0) return fail('potential', '潜能不足，已停止阅读。');
        return Object.assign(result, { progress: p, teachingCap: cap, gain: gain, energy: energy, potential: gain * profile.learning.potential_per_exp });
    }
    function recalc() {
        if (g.CharacterAttributes) g.CharacterAttributes.recalcCharacterStats({
            getEquipmentState: function () { return I().getState().equipment; }, getSkillsState: I().getSkillsState,
            getItemTemplate: I().getItemTemplate, getEnchantEntry: I().getEnchantEntry,
            getStrengthLevel: function () { return I().getSkillLevel('survival_strength'); }
        });
    }
    function grant(ready) {
        var profile = ready.book.profile, skills = I().getSkillsState();
        var entry = skills[ready.skillId] || (skills[ready.skillId] = { level: 0, move_usage: {}, study_exp: 0 });
        entry.book_exp = ready.progress.exp + ready.gain;
        entry.book_total_exp = ready.progress.total + ready.gain;
        while (entry.level < ready.teachingCap) {
            var cost = profile.skill.exp_thresholds[entry.level + 1] - profile.skill.exp_thresholds[entry.level];
            if (entry.book_exp < cost) break;
            entry.book_exp -= cost; entry.level++;
        }
        // Fractional language XP survives the legacy integer study_exp normalizer.
        var languageId = profile.learning.language_skill_id;
        var language = skills[languageId] || (skills[languageId] = { level: 0, move_usage: {}, study_exp: 0 });
        var tenths = ready.gain * profile.learning.language_exp_ratio.numerator * 10 / profile.learning.language_exp_ratio.denominator;
        var balance = (number(language.book_language_tenths) ? language.book_language_tenths : 0) + tenths;
        I().addStudyExp(languageId, Math.floor(balance / 10)); language.book_language_tenths = balance % 10;
        I().tryAdvanceSkillLevel(languageId);
        session.earned += ready.gain; session.languageTenths += tenths;
        session.status = entry.level > ready.level ? '解剖学提升至 ' + entry.level + ' 级' : '阅读中';
        recalc();
    }
    function transaction(operation) {
        try { var result = g.SaveSystem.runAtomicFor('book.reading', operation); if (result.saved) return result; }
        catch (e) { /* The complete snapshot restores experience, resources and world time. */ }
        pause('保存失败，本次阅读未结算，请重试。'); refresh(); return null;
    }
    function schedule() {
        if (!active || timer !== null || document.hidden) return;
        var token = epoch, ms = g.SceneApp.getFacilityLaborTickMs();
        timer = g.setTimeout(function () { if (token !== epoch) return; timer = null; advance(); }, ms);
    }
    function advance() {
        if (!active || !session || document.hidden || advancing) return;
        var ready = check(session);
        if (!ready.ok || !samePosition(session.position, position())) { pause(ready.ok ? '已移动，阅读停止。' : ready.message); refresh(); return; }
        var result = transaction(function () {
            // No costs or rewards occur before the full wait has elapsed.
            I().consumePotential(ready.potential); g.Survival.consumeEnergy(ready.energy);
            var before = g.GameTime.getState().totalTicks;
            advancing = true;
            try { g.Survival.advanceTick({ source: 'book.reading' }); } finally { advancing = false; }
            if (g.GameTime.getState().totalTicks !== before + 1) throw Error('Reading world tick rejected');
            if (g.Survival.isDead() || g.Survival.isComa()) { pause('阅读已中断'); return; }
            grant(ready);
            var next = check(session); if (!next.ok) pause(next.message);
        });
        if (!result) return;
        refresh(); schedule();
    }
    function start(request) {
        if (active && sameBook(session, request)) return { ok: true };
        var ready = check(request); if (!ready.ok) return ready;
        if (document.hidden) return fail('hidden', '请返回游戏后继续阅读。');
        pause(); g.SceneApp.prepareFacilityAction(); g.Survival.stopStudy();
        var result = transaction(function () {
            if (!sameBook(session, request)) session = { id: request.id, context: copy(request.context), position: position(), skillId: ready.skillId, earned: 0, languageTenths: 0, status: '' };
            session.position = position(); session.status = '阅读中';
        });
        if (!result) return fail('save_failed', '保存失败，未开始阅读。');
        active = true; refresh(); schedule(); return { ok: true };
    }
    function validate(s) {
        if (s == null) return true;
        if (s.version !== 1) return false;
        var x = s.session; if (x == null) return true;
        return typeof x.id === 'string' && x.context && ['pocket', 'backpack', 'vehicle'].indexOf(x.context.type) >= 0 &&
            (x.context.owner == null || typeof x.context.owner === 'string') && typeof x.skillId === 'string' &&
            x.position && typeof x.position.mapId === 'string' && Number.isInteger(x.position.x) && Number.isInteger(x.position.y) &&
            number(x.earned) && Number.isSafeInteger(x.earned) && number(x.languageTenths) && Number.isSafeInteger(x.languageTenths) && typeof x.status === 'string';
    }
    function restore(s) { pause(); session = s && s.session ? copy(s.session) : null; if (session) session.status = '已暂停阅读'; }
    function completedBooks(snapshot) {
        var inv = snapshot.player.inventoryEquipment, list = ['backpack', 'pocket', 'vehicle'].flatMap(function (key) { return inv['inventory_' + key] || []; });
        list = list.concat(snapshot.hideout_warehouse && snapshot.hideout_warehouse.slots || []);
        return list.filter(function (item) { var b = item && I().getBookInfo(item); return b && b.fragments === b.total; });
    }
    function notifyCompleted(before) {
        if (!before || !before.player || !g.BookPanel) return;
        var old = new Set(completedBooks(before).map(function (x) { return x.instance_id; }));
        var now = { player: { inventoryEquipment: I().getState() }, hideout_warehouse: g.HideoutWarehouse && g.HideoutWarehouse.getState() };
        if (completedBooks(now).some(function (x) { return !old.has(x.instance_id); })) g.BookPanel.notify('教材已集齐，可直接消耗整本，使对应技能提升 1 级。');
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden && active) { pause(); refresh(); } });
    g.addEventListener('pagehide', function () { pause(); });
    g.BookReading = { check: check, start: start, pause: pause, isActive: function () { return active; }, progress: progress,
        isBookSkill: isBookSkill, skillProfile: skillProfile, advance: advance, validate: validate, restore: restore,
        getState: function () { return { version: 1, session: copy(session) }; },
        sessionFor: function (request) { return sameBook(session, request) ? copy(session) : null; },
        beforeWorldTick: function () { if (active && !advancing) pause('已开始其他行动，阅读停止。'); }, notifyCompleted: notifyCompleted };
})(window);

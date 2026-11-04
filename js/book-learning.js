/* Shared book ownership checks and atomic full-book consumption. */
(function (g) {
    'use strict';
    var I = function () { return g.InventoryEquipment; };
    var fail = function (reason, message) { return { ok: false, reason: reason, message: message }; };

    function actionBlocked() {
        var s = g.Survival && g.Survival.getState();
        return !s || s.isDead || s.isComa ||
            (g.DeathSystem && g.DeathSystem.blocked()) ||
            (g.BedSleep && g.BedSleep.isActive()) ||
            (g.GymSystem && g.GymSystem.isActive()) ||
            (g.Hunting && g.Hunting.isActive()) ||
            (g.SceneApp && (g.SceneApp.isStoryMovementLocked() || g.SceneApp.isPreCreationGameplayRestricted())) ||
            (g.BuffSystem && g.BuffSystem.hasActionDisabled('player', 'item_use')) ||
            (I() && I().isPlayerStunned());
    }

    function locked(item) {
        return item && (item.warehouse_locked ||
            (g.ForgingSystem && g.ForgingSystem.isInstanceLocked(item.instance_id)) ||
            (g.FishingSession && g.FishingSession.isInstanceLocked(item.instance_id)));
    }

    // Read-only checks are shared by both UIs and repeated inside the save transaction.
    function inspectBook(request) {
        var c = request && request.context;
        if (!c || ['pocket', 'backpack', 'vehicle'].indexOf(c.type) < 0) return fail('not_carried', '请先将教材收入随身容器。');
        var storage = g.InventoryTransfer && g.InventoryTransfer.read(c);
        if (!storage || !storage.ok) return fail('container_changed', '教材所在容器已变化。');
        var index = storage.items.findIndex(function (item) { return item && item.instance_id === request.id; });
        if (index < 0 || index >= storage.capacity) return fail('item_moved', '教材已移动或已被消耗。');
        var item = storage.items[index], book = I().getBookInfo(item);
        if (!book || book.count !== 1) return fail('not_book', '这件物品不能作为教材使用。');
        if (locked(storage.owner) || locked(item) || I().getItemInstanceChildren(item).length) return fail('locked', '教材或所在容器当前不可使用。');
        var skillId = book.profile.skill_id, level = I().getSkillLevel(skillId), cap = book.profile.skill.max_level;
        if (g.CombatSkills && g.CombatSkills.getProgressionSkillMaxLevel) {
            cap = Math.min(cap, g.CombatSkills.getProgressionSkillMaxLevel(I().getCharacterForDisplay(), skillId));
        }
        if (actionBlocked()) return fail('action_blocked', '当前无法使用教材。');
        return { ok: true, item: item, book: book, index: index, skillId: skillId, level: level, cap: cap };
    }

    function checkConsumption(request) {
        var current = inspectBook(request);
        if (!current.ok) return current;
        if (!current.book.profile.consumption || current.book.fragments !== current.book.total) return fail('incomplete', '需要一本 ' + current.book.total + '/' + current.book.total + ' 的完整教材。');
        if (current.level >= current.cap) return fail('max_level', '对应技能已达上限。');
        current.nextLevel = current.level + current.book.profile.consumption.levels_gained;
        return current;
    }

    function consumeFullBook(request) {
        var ready = checkConsumption(request);
        if (!ready.ok) return ready;
        if (!g.SaveSystem || !g.SaveSystem.runAtomicFor) return fail('save_unavailable', '保存服务尚未就绪。');
        if (g.BookReading) g.BookReading.pause();
        var result;
        try {
            result = g.SaveSystem.runAtomicFor('inventory.transfer', function () {
                var current = checkConsumption(request);
                if (!current.ok) { var error = Error(current.message); error.bookFailure = current; throw error; }
                var taken = I().takeItemFromContainer(request.context.type, current.index);
                if (!taken.success || taken.item.instance_id !== request.id) throw Error('book ownership changed');
                var skills = I().getSkillsState();
                var entry = skills[current.skillId] || (skills[current.skillId] = { level: 0, move_usage: {}, study_exp: 0 });
                // Direct levels do not fabricate an XP curve or reset earned progress.
                entry.level = current.nextLevel;
                if (g.CharacterAttributes && g.CharacterAttributes.recalcCharacterStats) {
                    g.CharacterAttributes.recalcCharacterStats({
                        getEquipmentState: function () { return I().getState().equipment; },
                        getSkillsState: I().getSkillsState,
                        getItemTemplate: I().getItemTemplate,
                        getEnchantEntry: I().getEnchantEntry,
                        getStrengthLevel: function () { return I().getSkillLevel('survival_strength'); }
                    });
                }
                return { skillId: current.skillId, previousLevel: current.level, level: current.nextLevel };
            });
        } catch (error) {
            return error.bookFailure || fail('save_failed', '操作失败，教材和技能已恢复。');
        }
        if (!result.saved) return fail('save_failed', '保存失败，教材和技能已恢复。');
        if (g.SceneHud) g.SceneHud.refresh('status');
        if (g.SceneRenderer) g.SceneRenderer.render();
        return Object.assign({ ok: true, message: '已消耗完整教材，对应技能提升至 ' + result.value.level + ' 级。' }, result.value);
    }

    g.BookLearning = { inspectBook: inspectBook, checkConsumption: checkConsumption, consumeFullBook: consumeFullBook };
})(window);

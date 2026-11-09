/**
 * SceneAccess — 场景动作资格与互斥门控.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var ACTION_TYPES;

    function isStoryMovementLocked() {
        if (window.MusclePanel && window.MusclePanel.isOpen()) return true;
        if ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive())) return true;
        if (window.GymPanel && window.GymPanel.isOpen()) return true;
        if (window.GymEntrancePanel && window.GymEntrancePanel.isOpen()) return true;
        if (window.NPCSystem && window.NPCSystem.isOpeningPending && window.NPCSystem.isOpeningPending()) return true;
        if (window.ResetProgressDialog && window.ResetProgressDialog.isOpen()) return true;
        if (window.CookingRepairPanel && window.CookingRepairPanel.isOpen()) return true;
        if (window.ToolbenchPanel && window.ToolbenchPanel.isOpen()) return true;
        if (window.SewingStationPanel && window.SewingStationPanel.isOpen()) return true;
        if (window.ForgingStationPanel && window.ForgingStationPanel.isOpen()) return true;
        if (window.FacilityLaborPanel && window.FacilityLaborPanel.isOpen()) return true;
        if (window.HuntingPanel && window.HuntingPanel.isOpen()) return true;
        if (window.FishingPanel && window.FishingPanel.isOpen()) return true;
        if (window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen()) return true;
        if (window.NPCSystem && typeof window.NPCSystem.isMenuOpen === 'function' && window.NPCSystem.isMenuOpen()) return true;
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
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('intro.blocked.action'), 'info');
        } catch (e0) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.not_available_yet'), 'info');
        }
    }

    function syncIntroShellUi() {
        var CA = window.CharacterAttributes;
        var done = CA && typeof CA.isCharacterCreationCompleted === 'function' && CA.isCharacterCreationCompleted();
        if (document.body) {
            if (done) document.body.classList.remove('intro-shell-active');
            else document.body.classList.add('intro-shell-active');
        }
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.GameLog && typeof window.GameLog.clampLogPanelForLeftHud === 'function') {
            window.GameLog.clampLogPanelForLeftHud();
        }
    }

    function isPlayerComaActive() {
        return !!(window.BuffSystem
            && typeof window.BuffSystem.hasBuffByBuffId === 'function'
            && window.BuffSystem.hasBuffByBuffId('player', 'survival_coma'));
    }

    function guardPlayerComaBlocked() {
        if ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive())) return true;
        if (!isPlayerComaActive()) return false;
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('intro.blocked.action'), 'info');
        return true;
    }

    function normalizeActionType(actionType) {
        var key = String(actionType || '').trim().toLowerCase();
        if (!key) return '';
        if (key === 'movement') return ACTION_TYPES.MOVE;
        return key;
    }

    function isPlayerActionDisabledByBuff(actionType) {
        if ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive())) return true;
        var key = normalizeActionType(actionType);
        if (!key) return false;
        var Buff = window.BuffSystem;
        if (!Buff) return false;
        if (key === ACTION_TYPES.MOVE && typeof Buff.hasMovementDisabled === 'function' && Buff.hasMovementDisabled('player')) {
            return true;
        }
        if (typeof Buff.hasActionDisabled === 'function') {
            return !!Buff.hasActionDisabled('player', key);
        }
        return false;
    }

    function guardPlayerActionBlocked(actionType, opts) {
        if ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive())) return true;
        if (window.DeathSystem && window.DeathSystem.blocked()) return true;
        if (window.Hunting && window.Hunting.isActive()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('hunting.reason.active'), 'info');
            return true;
        }
        // 眩晕中（k13，37 §9.2）：本回合无法行动——吞掉本次动作（移动/采集/制作/交互/用物等）
        if (IE && typeof IE.consumePlayerStunRoundIfBlocking === 'function' && IE.consumePlayerStunRoundIfBlocking()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.log.stun_blocked_action'), 'warn');
            return true;
        }
        if (!isPlayerActionDisabledByBuff(actionType)) return false;
        var options = opts || {};
        var msg = options.msg || window.SceneFeedback.ui('intro.blocked.action');
        var kind = options.level || 'info';
        window.SceneFeedback.showMsg(msg, kind);
        return true;
    }

    /** 47 §5.2：所有玩法门禁统一读取 CombatEngagement。 */
    function isPlayerInCombat() {
        return !!(window.CombatEngagement
            && typeof window.CombatEngagement.isPlayerInCombat === 'function'
            && window.CombatEngagement.isPlayerInCombat());
    }

    /** 47 §5.2：注射需静止——不在挂机（采集/调息）中、不在制作中。 */
    function isPlayerStillEnoughForInjection() {
        if (window.PlayerActions.gatheringIdleTimer || window.PlayerActions.tiaoXiIdleTimer || window.PlayerActions.restIdleTimer) return false;
        if (window.CookingStation && typeof window.CookingStation.getActiveCraft === 'function' && window.CookingStation.getActiveCraft()) return false;
        if (window.PharmacyStation && typeof window.PharmacyStation.getActiveCraft === 'function' && window.PharmacyStation.getActiveCraft()) return false;
        return true;
    }

    /**
     * 给药途径门禁（47 §5.2）：外敷/注射战斗中不可；注射还需静止。返回 null = 放行。
     */
    function checkUseRouteGate(tpl) {
        var route = (window.ItemUse && typeof window.ItemUse.getUseActionRoute === 'function') ? window.ItemUse.getUseActionRoute(tpl) : '';
        if (route !== 'topical' && route !== 'inject') return null;
        if (isPlayerInCombat()) return { reason: 'in_combat', route: route };
        if (route === 'inject' && !isPlayerStillEnoughForInjection()) return { reason: 'must_be_still', route: route };
        return null;
    }
    function canWorkFacilityLabor() {
        return !isPreCreationGameplayRestricted() && !(window.Survival && window.Survival.isDead())
            && !isPlayerComaActive() && !(window.CombatEngagement && window.CombatEngagement.isPlayerInCombat())
            && !guardPlayerActionBlocked(ACTION_TYPES.GATHER);
    }

    function initialize() {
        ACTION_TYPES = {
        MOVE: 'move',
        GATHER: 'gather',
        CRAFT: 'craft',
        NPC_INTERACT: 'npc_interact',
        ITEM_USE: 'item_use'
    };
    }

    function bind() {

    }

    window.SceneAccess = {
        initialize: initialize,
        bind: bind,
        get ACTION_TYPES() { return ACTION_TYPES; },
        canWorkFacilityLabor: canWorkFacilityLabor,
        checkUseRouteGate: checkUseRouteGate,
        guardPlayerActionBlocked: guardPlayerActionBlocked,
        guardPlayerComaBlocked: guardPlayerComaBlocked,
        isPlayerActionDisabledByBuff: isPlayerActionDisabledByBuff,
        isPlayerComaActive: isPlayerComaActive,
        isPreCreationGameplayRestricted: isPreCreationGameplayRestricted,
        isStoryMovementLocked: isStoryMovementLocked,
        showIntroBlockedMsg: showIntroBlockedMsg,
        syncIntroShellUi: syncIntroShellUi
    };
})(window);

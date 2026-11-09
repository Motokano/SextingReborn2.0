/**
 * PlayerActions — 采集、休息、调息、快捷动作及行动菜单.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var G = window.Gathering;
    var idleTickMs, gatheringIdleTimer, gatheringIdleAt, tiaoXiIdleTimer, restIdleTimer, tiaoXiCapModeNotified, playerActionsSubmenuOpen, playerActionsOutsideClickBound, ACTION_BAR_PIN_SLOTS, actionsView, BED_FATIGUE_BUFF_IDS;

    function getIdleTickMs() {
        var n = parseInt(idleTickMs, 10);
        if (!isFinite(n) || n < 200) n = 3000;
        return n;
    }

    function getRestAutoTickMs() {
        var Surv = window.Survival;
        var cfg = Surv && typeof Surv.getConfig === 'function' ? Surv.getConfig() : null;
        var sec = cfg ? Number(cfg.rest_action_auto_tick_seconds) : 5;
        if (!isFinite(sec) || sec <= 0) sec = 5;
        return Math.max(1000, Math.floor(sec * 1000));
    }

    function hubAdjacentForBreathActions() {
        return !!(window.CombatEngagement && typeof window.CombatEngagement.isPlayerInCombat === 'function' && window.CombatEngagement.isPlayerInCombat());
    }

    function parseHubQuickBarToken(tok) {
        if (!tok || String(tok).indexOf('hub|') !== 0) return null;
        var parts = String(tok).split('|');
        if (parts.length < 3 || !parts[1] || !parts[2]) return null;
        return { skillId: parts[1], actionId: parts[2] };
    }

    function parseActionQuickBarToken(tok) {
        if (!tok || String(tok).indexOf('action|') !== 0) return null;
        var parts = String(tok).split('|');
        if (parts.length < 2 || !parts[1]) return null;
        return { actionId: parts[1] };
    }

    function getQuickBarPinLabel(skillId, actionId) {
        var CS = window.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function') return actionId || '—';
        var sk = CS.getSkill(skillId);
        if (window.CombatHubActions) { var commonName = window.CombatHubActions.findHubActionTemplate(skillId, actionId); if (commonName) return commonName.name || actionId; }
        if (!sk || !sk.hub_actions) return actionId || '—';
        var hi;
        for (hi = 0; hi < sk.hub_actions.length; hi++) {
            if (sk.hub_actions[hi].id === actionId) return sk.hub_actions[hi].name || actionId;
        }
        return actionId || '—';
    }

    function pinHubToQuickBar(skillId, actionId) {
        var tok = 'hub|' + skillId + '|' + actionId;
        return pinTokenToQuickBar(tok);
    }

    function pinActionToQuickBar(actionId) {
        var tok = 'action|' + actionId;
        return pinTokenToQuickBar(tok);
    }

    function pinTokenToQuickBar(tok) {
        var slots = window.SceneCtx.getActionBarSlots();
        var i;
        for (i = 0; i < ACTION_BAR_PIN_SLOTS; i++) {
            if (!slots[i]) {
                slots[i] = tok;
                window.SceneCtx.setActionBarSlots(slots);
                if (window.SaveSystem && typeof window.SaveSystem.saveNow === 'function') window.SaveSystem.saveNow('quickbar');
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('action.bar.pin.ok'), 'success');
                if (window.SceneRenderer) window.SceneRenderer.render();
                return true;
            }
        }
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('action.bar.pin.full'), 'warning');
        return false;
    }

    function clearQuickBarPinSlot(slotIndex) {
        var idx = slotIndex | 0;
        if (idx < 0 || idx >= ACTION_BAR_PIN_SLOTS) return;
        var slots = window.SceneCtx.getActionBarSlots();
        if (!slots[idx]) return;
        slots[idx] = null;
        window.SceneCtx.setActionBarSlots(slots);
        if (window.SaveSystem && typeof window.SaveSystem.saveNow === 'function') window.SaveSystem.saveNow('quickbar');
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('action.bar.pin.cleared'), 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function executeQuickBarPinnedSlot(slotIndex) {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        var idx = slotIndex | 0;
        var slots = window.SceneCtx.getActionBarSlots();
        var token = slots[idx];
        var parsedAction = parseActionQuickBarToken(token);
        if (parsedAction) {
            if (parsedAction.actionId === 'drink_flask') return window.ItemUseActions.tryDrinkWaterFlask();
            if (parsedAction.actionId === 'rest_toggle') {
                setRestingActionActive(!(window.Survival && window.Survival.getState && window.Survival.getState().isResting), { showMsg: true });
                if (window.SceneRenderer) window.SceneRenderer.render();
                SceneHud.refresh('status');
                return;
            }
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('action.bar.pin.unknown'), 'info');
            return;
        }
        var parsed = parseHubQuickBarToken(token);
        if (!parsed) return;
        var sk = parsed.skillId;
        var act = parsed.actionId;
        var footworkId = 'combat_basic_footwork';
        var breathId = 'combat_basic_breath';
        if (sk === footworkId && act === 'nie_bu') {
            toggleFootworkNieBuModeFromMenu();
            return;
        }
        if (sk === breathId && act === 'tiao_xi_once') {
            if (tiaoXiIdleTimer) stopTiaoXiIdle(false);
            else startTiaoXiIdle();
            if (window.SceneRenderer) window.SceneRenderer.render();
            SceneHud.refresh('status');
            return;
        }
        if (sk === breathId) {
            var CHAx = window.CombatHubActions;
            if (!CHAx || typeof CHAx.tryExecuteHubAction !== 'function') return;
            var rx = CHAx.tryExecuteHubAction(breathId, act, { isBattleContext: hubAdjacentForBreathActions });
            if (!rx.ok) {
                var varsx = {};
                if (rx.cooldown_ticks != null) varsx.ticks = rx.cooldown_ticks;
                window.SceneFeedback.showMsg(window.SceneFeedback.ui(rx.reason_key, varsx), 'info');
                return;
            }
            if (act === 'diqi_huti') window.SceneFeedback.showMsg(window.SceneFeedback.ui(rx.reason_key, { shield: rx.shield_value != null ? rx.shield_value : 0 }), 'success');
            else {
                var hubOkVars2 = {};
                if (rx.qi_li_restored != null) hubOkVars2.n = rx.qi_li_restored;
                window.SceneFeedback.showMsg(window.SceneFeedback.ui(rx.reason_key || 'combat.hub.ok', hubOkVars2), 'success');
            }
            if (window.SceneRenderer) window.SceneRenderer.render();
            SceneHud.refresh('status');
            return;
        }
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('action.bar.pin.unknown'), 'info');
    }

    function bindQuickBarPinSlotsOnce() {
        if (window.SvelteInteractions) return;
        if (bindQuickBarPinSlotsOnce._done) return;
        bindQuickBarPinSlotsOnce._done = true;
        var si;
        for (si = 0; si < ACTION_BAR_PIN_SLOTS; si++) {
            (function (idx) {
                var b = document.getElementById('action-bar-pin-' + idx);
                if (!b) return;
                b.addEventListener('click', function () {
                    executeQuickBarPinnedSlot(idx);
                });
                b.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    clearQuickBarPinSlot(idx);
                });
            })(si);
        }
    }

    /** 右侧「动作」菜单：切换蹑步选点（与地图点击 tryFootworkNieBuJump 配套） */
    function toggleFootworkNieBuModeFromMenu() {
        var SKILL_ID = 'combat_basic_footwork';
        var ACTION_ID = 'nie_bu';
        var IE = window.InventoryEquipment;
        if (!IE || !window.SceneCtx) return;
        if (!IE.getSkillLevel || IE.getSkillLevel(SKILL_ID) < 1) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.no_skill'), 'info');
            return;
        }
        var hubsNb = IE.getCombatState ? IE.getCombatState().hubs : null;
        if (!hubsNb || hubsNb.footwork !== SKILL_ID) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.hub'), 'info');
            return;
        }
        var cdNb = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(SKILL_ID, ACTION_ID) : 0;
        if (cdNb > 0) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.fail.cooldown', { ticks: cdNb }), 'info');
            return;
        }
        if (window.SceneCtx.footworkNieBuMode) {
            if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') window.SceneCtx.exitFootworkNieBuMode();
            if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
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
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('player.action.niebu.hint'), 'info');
        if (mapNb && typeof window.SceneCtx.pushDirtyNieBuRing === 'function') {
            window.SceneCtx.pushDirtyNieBuRing(stNb.x, stNb.y, rNb);
        }
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
    }

    function closePlayerActionsSubmenu() {
        if (actionsView) { playerActionsSubmenuOpen = false; publishActions(); return; }
        var sub = document.getElementById('player-actions-submenu');
        if (!sub) return;
        sub.classList.remove('open');
        sub.setAttribute('aria-hidden', 'true');
        playerActionsSubmenuOpen = false;
    }

    function buildPlayerActionsItems() {
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        var Surv = window.Survival;
        var CHA = window.CombatHubActions;
        var sub = { children: [] };
        if (!IE) return sub.children;
        if (window.ForgingSystem && window.ForgingSystem.snapshot().items.some(function(x){return x.item_id === 'tool_repair_roll';})) {
            var repairButton={kind:'button',children:[],attrs:{role:'menuitem'},type:'button',className:'player-action-item',textContent:'维修武器'};
            repairButton.disabled=!!(window.CombatEngagement && window.CombatEngagement.isPlayerInCombat());
            repairButton.onclick=function(ev){ev.stopPropagation();closePlayerActionsSubmenu();window.ForgingStationPanel.open({repair:true});};sub.children.push(repairButton);
        }
        if(window.HuntingPanel && /Base|^home$/.test(E.getState().mapId)){
            var craftTitle={ kind: 'div', children: [], attrs: {} };craftTitle.textContent='制作';craftTitle.className='player-action-craft-title';sub.children.push(craftTitle);
            var craftButton={ kind: 'button', children: [], attrs: {} };craftButton.type='button';craftButton.className='player-action-item';craftButton.attrs['role'] = 'menuitem';craftButton.textContent='捕猎用品';
            craftButton.disabled=!window.HuntingPanel.canOpenCrafting();craftButton.onclick=function(ev){ev.stopPropagation();closePlayerActionsSubmenu();window.HuntingPanel.openCrafting();};sub.children.push(craftButton);
            var actionTitle={ kind: 'div', children: [], attrs: {} };actionTitle.textContent='常用动作';actionTitle.className='player-action-craft-title';sub.children.push(actionTitle);
        }
        var breathId = 'combat_basic_breath';
        var footworkId = 'combat_basic_footwork';
        var hubs = IE.getCombatState && IE.getCombatState().hubs ? IE.getCombatState().hubs : {};
        if (window.WaterFlaskUse) {
            var flask = window.WaterFlaskUse.equipped();
            var flaskProfile = flask && window.WaterFlaskUse.profile(flask);
            var flaskBlocked = window.WaterFlaskUse.reason(flask && flask.instance_id);
            var flaskLabel = window.SceneFeedback.ui('flask.action.drink');
            if (flaskProfile && !flaskProfile.error) flaskLabel += ' · ' + window.WaterFlaskStorage.format(flaskProfile.water) + '／' + window.WaterFlaskStorage.format(flaskProfile.capacity);
            var flaskRow = { kind: 'div', children: [], attrs: {}, className: 'player-action-item-row' };
            flaskRow.children.push({ kind: 'button', children: [], attrs: { role: 'menuitem' }, type: 'button', className: 'player-action-item',
                textContent: flaskLabel, title: flaskBlocked || flaskLabel, disabled: !!flaskBlocked,
                onclick: function (ev) { ev.stopPropagation(); closePlayerActionsSubmenu(); window.ItemUseActions.tryDrinkWaterFlask(flask && flask.instance_id); } });
            flaskRow.children.push({ kind: 'button', children: [], attrs: { 'aria-label': window.SceneFeedback.ui('action.bar.pin.hint') }, type: 'button',
                className: 'player-action-pin', textContent: '📌', title: window.SceneFeedback.ui('action.bar.pin.hint'),
                onclick: function (ev) { ev.stopPropagation(); pinActionToQuickBar('drink_flask'); } });
            sub.children.push(flaskRow);
        }
        if (Surv && typeof Surv.getState === 'function' && typeof Surv.setResting === 'function') {
            var survState = Surv.getState() || {};
            var isResting = !!survState.isResting;
            var btnRest = { kind: 'button', children: [], attrs: {} };
            btnRest.type = 'button';
            btnRest.className = 'player-action-item';
            btnRest.attrs['role'] = 'menuitem';
            btnRest.textContent = isResting ? window.SceneFeedback.ui('player.action.rest.stop') : window.SceneFeedback.ui('player.action.rest.start');
            btnRest.title = isResting ? window.SceneFeedback.ui('player.action.rest.stop.hint') : window.SceneFeedback.ui('player.action.rest.start.hint');
            btnRest.onclick = function (ev) {
                ev.stopPropagation();
                setRestingActionActive(!isResting, { showMsg: true });
                closePlayerActionsSubmenu();
                if (window.SceneRenderer) window.SceneRenderer.render();
                SceneHud.refresh('status');
            };
            var restRow = { kind: 'div', children: [], attrs: {} };
            restRow.className = 'player-action-item-row';
            restRow.children.push(btnRest);
            var pinRest = { kind: 'button', children: [], attrs: {} };
            pinRest.type = 'button';
            pinRest.className = 'player-action-pin';
            pinRest.attrs['aria-label'] = window.SceneFeedback.ui('action.bar.pin.hint');
            pinRest.title = window.SceneFeedback.ui('action.bar.pin.hint');
            pinRest.textContent = '📌';
            pinRest.onclick = function (ev) {
                ev.stopPropagation();
                pinActionToQuickBar('rest_toggle');
            };
            restRow.children.push(pinRest);
            sub.children.push(restRow);
        }
        var breathLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(breathId) : 0;
        if (CS && breathLv >= 1) {
            var sk = typeof CS.getSkill === 'function' ? CS.getSkill(breathId) : null;
            if (sk && sk.hub_actions) {
                var mountedSkill = CS.getSkill(hubs.breath);
                var menuActions = (CS.getCommonDiqiActions ? CS.getCommonDiqiActions() : []).concat(mountedSkill ? mountedSkill.hub_actions || [] : []);
                sk = Object.assign({}, sk, {hub_actions:menuActions});
                var mounted = !!mountedSkill;
                var adj = hubAdjacentForBreathActions();
                var i;
                for (i = 0; i < sk.hub_actions.length; i++) {
                    var ha = sk.hub_actions[i];
                    var ul = ha.unlock_level != null ? ha.unlock_level : 1;
                    if (breathLv < ul) continue;
                    var btnRow = { kind: 'button', children: [], attrs: {} };
                    btnRow.type = 'button';
                    btnRow.className = 'player-action-item';
                    btnRow.attrs['role'] = 'menuitem';
                    btnRow.textContent = ha.name || ha.id;
                    var cd = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(breathId, ha.id) : 0;
                    var cdCfg = ha.cooldown_ticks != null ? parseInt(ha.cooldown_ticks, 10) : 0;
                    var dis = false;
                    var hint = '';
                    if (ha.id === 'tiao_xi_once' && tiaoXiIdleTimer) {
                        btnRow.textContent = (ha.name || ha.id) + window.SceneFeedback.ui('scene.gather.idle_suffix');
                        hint = window.SceneFeedback.ui('scene.meditation.stop_hint');
                    }
                    var isCommon = CS.getCommonDiqiActions().some(function(a){return a.id===ha.id;});
                    if (ha.hub_effect === 'breath_burst' && !window.CombatBreath.canActivate()) {
                        dis = true; hint = window.SceneFeedback.ui('combat.hub.fail.cui_qi');
                    } else if (!mounted && !isCommon) {
                        dis = true;
                        hint = window.SceneFeedback.ui('combat.hub.fail.hub_mount');
                    } else if (cd > 0 && isFinite(cdCfg) && cdCfg > 0) {
                        dis = true;
                        hint = window.SceneFeedback.ui('combat.hub.fail.cooldown', { ticks: cd });
                        btnRow.textContent = (ha.name || ha.id) + ' · ' + cd + 't';
                    } else if (ha.battle_only && !adj) {
                        dis = true;
                        hint = window.SceneFeedback.ui('combat.hub.fail.battle_only');
                    } else if (ha.id === 'diqi_huti' && Surv && typeof Surv.getDiqiShieldRemaining === 'function' && Surv.getDiqiShieldRemaining() > 0) {
                        dis = true;
                        hint = window.SceneFeedback.ui('combat.hub.fail.shield_active');
                    }
                    btnRow.disabled = !!dis;
                    if (hint) btnRow.title = hint;
                    var rowWrap = { kind: 'div', children: [], attrs: {} };
                    rowWrap.className = 'player-action-item-row';
                    (function (actionId) {
                        btnRow.onclick = function (ev) {
                            ev.stopPropagation();
                            if (actionId === 'tiao_xi_once') {
                                if (tiaoXiIdleTimer) {
                                    stopTiaoXiIdle(false);
                                    closePlayerActionsSubmenu();
                                    if (window.SceneRenderer) window.SceneRenderer.render();
                                    SceneHud.refresh('status');
                                    return;
                                }
                                startTiaoXiIdle();
                                closePlayerActionsSubmenu();
                                if (window.SceneRenderer) window.SceneRenderer.render();
                                SceneHud.refresh('status');
                                return;
                            }
                            if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') return;
                            var actionSkillId = CS.getCommonDiqiActions().some(function(a){return a.id===actionId;}) ? breathId : hubs.breath;
                            var r = CHA.tryExecuteHubAction(actionSkillId, actionId, { isBattleContext: hubAdjacentForBreathActions });
                            if (!r.ok) {
                                var vars = {};
                                if (r.cooldown_ticks != null) vars.ticks = r.cooldown_ticks;
                                window.SceneFeedback.showMsg(window.SceneFeedback.ui(r.reason_key, vars), 'info');
                                return;
                            }
                            if (actionId === 'diqi_huti') window.SceneFeedback.showMsg(window.SceneFeedback.ui(r.reason_key, { shield: r.shield_value != null ? r.shield_value : 0 }), 'success');
                            else if (actionId === 'tiao_xi_once') window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.ok.tiao_xi', { n: r.diqi_gained != null ? r.diqi_gained : 0 }), 'success');
                            else if (actionId === 'jin_shi') window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.ok.eat', {
                                gain: r.stamina_gain != null ? String(r.stamina_gain) : '0',
                                sat: r.satiety_cost != null ? String(r.satiety_cost) : '0',
                                thirst: r.thirst_cost != null ? String(r.thirst_cost) : '0'
                            }), 'success');
                            else {
                                var hubOkVars = {};
                                if (r.qi_li_restored != null) hubOkVars.n = r.qi_li_restored;
                                window.SceneFeedback.showMsg(window.SceneFeedback.ui(r.reason_key || 'combat.hub.ok', hubOkVars), 'success');
                            }
                            closePlayerActionsSubmenu();
                            if (window.SceneRenderer) window.SceneRenderer.render();
                            SceneHud.refresh('status');
                        };
                    })(ha.id);
                    rowWrap.children.push(btnRow);
                    var pinBtn = { kind: 'button', children: [], attrs: {} };
                    pinBtn.type = 'button';
                    pinBtn.className = 'player-action-pin';
                    pinBtn.attrs['aria-label'] = window.SceneFeedback.ui('action.bar.pin.hint');
                    pinBtn.title = window.SceneFeedback.ui('action.bar.pin.hint');
                    pinBtn.textContent = '📌';
                    // 收藏与执行状态解耦：只要已解锁且挂载即可收藏（冷却/盾未破等瞬时状态不影响收藏）
                    pinBtn.disabled = !mounted || breathLv < ul;
                    (function (pinEl, actionIdForPin) {
                        pinEl.onclick = function (ev) {
                            ev.stopPropagation();
                            if (pinEl.disabled) return;
                            pinHubToQuickBar(breathId, actionIdForPin);
                        };
                    })(pinBtn, ha.id);
                    rowWrap.children.push(pinBtn);
                    sub.children.push(rowWrap);
                }
            }
        }
        var fwLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(footworkId) : 0;
        if (fwLv >= 1) {
            var nieLabel = window.SceneFeedback.ui('player.action.niebu');
            var nieCd = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(footworkId, 'nie_bu') : 0;
            var hubFw = hubs.footwork === footworkId;
            var inNie = window.SceneCtx && window.SceneCtx.footworkNieBuMode;
            var btnNie = { kind: 'button', children: [], attrs: {} };
            btnNie.type = 'button';
            btnNie.className = 'player-action-item';
            btnNie.attrs['role'] = 'menuitem';
            if (nieCd > 0) {
                btnNie.textContent = window.SceneFeedback.ui('player.action.niebu.cooldown', { ticks: nieCd });
                btnNie.disabled = true;
                btnNie.title = window.SceneFeedback.ui('player.action.niebu.fail.cooldown', { ticks: nieCd });
            } else if (!hubFw) {
                btnNie.textContent = nieLabel;
                btnNie.disabled = true;
                btnNie.title = window.SceneFeedback.ui('player.action.niebu.fail.hub');
            } else {
                btnNie.textContent = inNie ? window.SceneFeedback.ui('player.action.niebu.cancel') : nieLabel;
                btnNie.disabled = false;
                btnNie.title = inNie ? window.SceneFeedback.ui('player.action.niebu.cancel') : window.SceneFeedback.ui('player.action.niebu.hint');
            }
            btnNie.onclick = function (ev) {
                ev.stopPropagation();
                if (btnNie.disabled) return;
                toggleFootworkNieBuModeFromMenu();
                closePlayerActionsSubmenu();
                if (window.SceneRenderer) window.SceneRenderer.render();
                SceneHud.refresh('status');
            };
            var nieRow = { kind: 'div', children: [], attrs: {} };
            nieRow.className = 'player-action-item-row';
            nieRow.children.push(btnNie);
            var pinNie = { kind: 'button', children: [], attrs: {} };
            pinNie.type = 'button';
            pinNie.className = 'player-action-pin';
            pinNie.attrs['aria-label'] = window.SceneFeedback.ui('action.bar.pin.hint');
            pinNie.title = window.SceneFeedback.ui('action.bar.pin.hint');
            pinNie.textContent = '📌';
            pinNie.disabled = !!btnNie.disabled;
            pinNie.onclick = function (ev) {
                ev.stopPropagation();
                if (pinNie.disabled) return;
                pinHubToQuickBar(footworkId, 'nie_bu');
            };
            nieRow.children.push(pinNie);
            sub.children.push(nieRow);
        }
        return sub.children;
    }

    function publishActions() { if (actionsView) actionsView({ open: playerActionsSubmenuOpen, items: playerActionsSubmenuOpen ? buildPlayerActionsItems() : [], label: window.SceneFeedback.ui('btn.player.actions.title') }); }

    function rebuildPlayerActionsSubmenu(sub) {
        sub.replaceChildren();
        function append(parent, item) {
            var el = document.createElement(item.kind); el.className = item.className || ''; el.textContent = item.textContent || '';
            el.disabled = !!item.disabled; el.title = item.title || ''; if (item.type) el.type = item.type;
            Object.keys(item.attrs).forEach(function (key) { el.setAttribute(key, item.attrs[key]); });
            if (item.onclick) el.onclick = item.onclick;
            item.children.forEach(function (child) { append(el, child); }); parent.appendChild(el);
        }
        buildPlayerActionsItems().forEach(function (item) { append(sub, item); });
    }

    function openPlayerActionsSubmenu() {
        if (actionsView) { playerActionsSubmenuOpen = true; publishActions(); return; }
        var sub = document.getElementById('player-actions-submenu');
        if (!sub) return;
        rebuildPlayerActionsSubmenu(sub);
        sub.classList.add('open');
        sub.setAttribute('aria-hidden', 'false');
        playerActionsSubmenuOpen = true;
    }

    function refreshPlayerActionsMenuUi() {
        if (actionsView) { publishActions(); return; }
        var wrap = document.getElementById('player-actions-hud-wrap');
        var btn = document.getElementById('btn-player-actions');
        var sub = document.getElementById('player-actions-submenu');
        if (!wrap || !btn || !sub) return;
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        var breathId = 'combat_basic_breath';
        var cnt = 1; // 常驻动作：休息
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

    function setIdleActionType(t) {
        if (window.SceneCtx) window.SceneCtx.idleActionType = t || '';
    }

    function stopGatheringIdle() {
        if (gatheringIdleTimer) {
            clearInterval(gatheringIdleTimer);
            gatheringIdleTimer = null;
            gatheringIdleAt = null;
        }
        if (tiaoXiIdleTimer) {
            clearInterval(tiaoXiIdleTimer);
            tiaoXiIdleTimer = null;
        }
        setIdleActionType('');
    }

    function stopTiaoXiIdle(withMsg) {
        if (!tiaoXiIdleTimer) return;
        clearInterval(tiaoXiIdleTimer);
        tiaoXiIdleTimer = null;
        tiaoXiCapModeNotified = false;
        setIdleActionType('');
        if (withMsg !== false) window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.meditation_stopped'), 'info');
    }

    function stopRestIdleTimer() {
        if (!restIdleTimer) return;
        clearInterval(restIdleTimer);
        restIdleTimer = null;
    }

    function startRestIdleTimer() {
        if ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive())) return;
        if (restIdleTimer) return;
        restIdleTimer = setInterval(function () {
            var Surv = window.Survival;
            if (!Surv || typeof Surv.getState !== 'function' || typeof Surv.advanceTick !== 'function') {
                stopRestIdleTimer();
                return;
            }
            var st = Surv.getState() || {};
            if (!st.isResting) {
                stopRestIdleTimer();
                return;
            }
            Surv.advanceTick();
            if (window.SceneRenderer) window.SceneRenderer.render();
            SceneHud.refresh('status');
        }, getRestAutoTickMs());
    }

    function setRestingActionActive(active, opts) {
        if (active && ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive()))) return false;
        var options = opts || {};
        var Surv = window.Survival;
        if (!Surv || typeof Surv.setResting !== 'function' || typeof Surv.getState !== 'function') return false;
        var before = !!((Surv.getState() || {}).isResting);
        var next = !!active;
        Surv.setResting(next);
        if (next) startRestIdleTimer();
        else stopRestIdleTimer();
        if (before !== next && options.showMsg !== false) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui(next ? 'player.action.rest.enabled' : 'player.action.rest.disabled'), 'info');
        }
        return before !== next;
    }

    function onTiaoXiIdleTick() {
        var CHA = window.CombatHubActions;
        if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') {
            stopTiaoXiIdle(false);
            return;
        }
        var r = CHA.tryExecuteHubAction('combat_basic_breath', 'tiao_xi_once', { isBattleContext: hubAdjacentForBreathActions });
        if (!r.ok) {
            stopTiaoXiIdle(false);
            window.SceneFeedback.showMsg(window.SceneFeedback.ui(r.reason_key || 'combat.hub.fail.tiao_xi.diqi_max'), 'warn');
            if (window.SceneRenderer) window.SceneRenderer.render();
            SceneHud.refresh('status');
            return;
        }
        var Surv = window.Survival;
        var s = Surv && typeof Surv.getState === 'function' ? Surv.getState() : null;
        if (s && s.diqi_max > 0 && s.diqi_cap_limit > 0 && s.diqi_max >= s.diqi_cap_limit && !tiaoXiCapModeNotified) {
            tiaoXiCapModeNotified = true;
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.info.tiao_xi.cap_mode'), 'info');
        }
        // 封顶后达到 2*diqi_max-1 自动停（与 06 设计一致）
        var atCapNow = !!(s && s.diqi_max > 0 && s.diqi_cap_limit > 0 && s.diqi_max >= s.diqi_cap_limit);
        if (s && atCapNow && s.diqi_current >= (2 * s.diqi_max - 1)) {
            stopTiaoXiIdle(false);
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.info.tiao_xi.overflow_stop'), 'info');
        }
        if (window.SceneRenderer) window.SceneRenderer.render();
        SceneHud.refresh('status');
    }

    function startTiaoXiIdle() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (tiaoXiIdleTimer) return;
        if (gatheringIdleTimer) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.stop_gathering_first'), 'info');
            return;
        }
        var CHA = window.CombatHubActions;
        if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.fail.modules'), 'warn');
            return;
        }
        var r0 = CHA.tryExecuteHubAction('combat_basic_breath', 'tiao_xi_once', { isBattleContext: hubAdjacentForBreathActions });
        if (!r0.ok) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui(r0.reason_key || 'combat.hub.fail.tiao_xi.diqi_max'), 'warn');
            return;
        }
        var Surv = window.Survival;
        var s0 = Surv && typeof Surv.getState === 'function' ? Surv.getState() : null;
        if (s0 && s0.diqi_max > 0 && s0.diqi_cap_limit > 0 && s0.diqi_max >= s0.diqi_cap_limit) {
            tiaoXiCapModeNotified = true;
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.info.tiao_xi.cap_mode'), 'info');
        } else {
            tiaoXiCapModeNotified = false;
        }
        var atCap0 = !!(s0 && s0.diqi_max > 0 && s0.diqi_cap_limit > 0 && s0.diqi_max >= s0.diqi_cap_limit);
        if (s0 && atCap0 && s0.diqi_current >= (2 * s0.diqi_max - 1)) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.hub.info.tiao_xi.overflow_stop'), 'info');
            if (window.SceneRenderer) window.SceneRenderer.render();
            SceneHud.refresh('status');
            return;
        }
        tiaoXiIdleTimer = setInterval(onTiaoXiIdleTick, getIdleTickMs());
        setIdleActionType('tiao_xi');
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.meditation_started'), 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
        SceneHud.refresh('status');
    }

    function hasBedSleepDebuff() {
        var Buff = window.BuffSystem;
        if (!Buff || typeof Buff.hasBuffByBuffId !== 'function') return false;
        for (var i = 0; i < BED_FATIGUE_BUFF_IDS.length; i++) {
            if (Buff.hasBuffByBuffId('player', BED_FATIGUE_BUFF_IDS[i])) return true;
        }
        return false;
    }

    function settleSleepAttributeExpOnce(rng) {
        var CA = window.CharacterAttributes;
        if (!CA || typeof CA.settleAttributeExpOnce !== 'function') return { ok: false, any_success: false };
        return CA.settleAttributeExpOnce('player', { reason: 'bed_sleep', source: 'facility_bed', rng: rng }) || { ok: false, any_success: false };
    }

    function executeBedSleepAction() {
        if (!window.BedSleep || window.BedSleep.isActive()) return false;
        if (!StationContext.isOnBedStationTile()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('bed.sleep.not_on_tile'), 'info');
            return false;
        }
        if (!hasBedSleepDebuff()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('bed.sleep.require_fatigue_debuff'), 'info');
            return false;
        }
        var sleepSurvival = window.Survival;
        if (!sleepSurvival || sleepSurvival.isDead()) return false;
        var sleepTicks = Math.max(1, Math.floor(Number(sleepSurvival.getConfigValue('sleep_duration_ticks', 48)) || 48));
        var ask = window.SceneFeedback.ui('bed.sleep.confirm', {
            ticks: sleepTicks,
            seconds: sleepTicks * Math.max(1, Number(sleepSurvival.getConfigValue('sleep_tick_seconds', 1)) || 1),
            satiety: sleepSurvival.getConfigValue('sleep_satiety_cost_per_tick', 1),
            thirst: sleepSurvival.getConfigValue('sleep_thirst_cost_per_tick', 1),
            stamina: sleepSurvival.getConfigValue('sleep_stamina_gain_per_tick', 2),
            fatigue: sleepSurvival.getConfigValue('sleep_fatigue_reduction_per_tick', 2)
        });
        if (typeof window.confirm === 'function' && !window.confirm(ask)) return false;
        return window.BedSleep.start(sleepTicks);
    }

    function trySleepAtBed() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return false;
        }
        if (window.SceneAccess.guardPlayerComaBlocked()) return false;
        return executeBedSleepAction();
    }

    function onGatherTick() {
        if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.GATHER)) {
            stopGatheringIdle();
            return;
        }
        var st = E.getState();
        var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(st.x, st.y) : null;
        var entityId = rec ? (rec.entity_id || null) : E.getEntityAt(st.x, st.y);
        var gatheringInst = rec && rec.gathering_instance_id ? String(rec.gathering_instance_id) : null;
        if (!entityId || !G.canGather(entityId, gatheringInst)) {
            stopGatheringIdle();
            if (!G.canGather(entityId, gatheringInst) && entityId) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.warn.gather.stop.full_or_tired'));
            window.SceneMapView.markCellDirty(st.mapId, st.x, st.y);
            window.SceneMapView.render();
            return;
        }
        var result = G.doGather(entityId, gatheringInst);
        if (result.success && result.gathered) window.SceneFeedback.showMsg(result.message, 'success');
        else if (!result.success) window.SceneFeedback.showMsg(result.message, 'warn');
        window.SceneMapView.markCellDirty(st.mapId, st.x, st.y);
        window.SceneMapView.render();
    }

    function onGatherClick() {
        if (window.FishingPanel && window.FishingPanel.currentPoint()) {
            window.FishingPanel.open();
            return;
        }
        if (window.HuntingPanel && window.HuntingPanel.currentPoint()) {
            window.HuntingPanel.open();
            return;
        }
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (window.SceneAccess.guardPlayerComaBlocked()) return;
        if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.GATHER)) return;
        var st = E.getState();
        var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(st.x, st.y) : null;
        var entityId = rec ? (rec.entity_id || null) : E.getEntityAt(st.x, st.y);
        var gatheringInst = rec && rec.gathering_instance_id ? String(rec.gathering_instance_id) : null;
        if (!entityId || !G.canGather(entityId, gatheringInst)) return;
        if (tiaoXiIdleTimer) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.stop_meditation_first'), 'info');
            return;
        }
        if (gatheringIdleTimer) return;
        gatheringIdleAt = { mapId: st.mapId, x: st.x, y: st.y };
        onGatherTick();
        gatheringIdleTimer = setInterval(onGatherTick, getIdleTickMs());
        setIdleActionType('gathering');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function onGatherStopClick() {
        stopGatheringIdle();
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.info.gather.stop'), 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }
    function stopGatheringIdleFromScene(withMsg) {
                stopGatheringIdle();
                if (withMsg) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.info.gather.stop'), 'info');
                if (window.SceneRenderer) window.SceneRenderer.render();
            }

    function runContextAction(id) {
        if (window.SceneAccess.isStoryMovementLocked() || window.SceneAccess.isPreCreationGameplayRestricted()) return;
        if (id === 'gather') return onGatherClick();
        if (id === 'gather-stop') return window.SceneCtx.actions.stopGatheringIdle(true);
        if (id === 'take-water') return window.StationActions.onTakeWaterClick();
        if (id === 'pour-water') return window.StationActions.onPourWaterClick();
        if (id === 'drink-flask') return window.ItemUseActions.tryDrinkWaterFlask();
        if (id === 'add-fuel') return window.StationActions.onAddFuelClick();
        if (id === 'ground') { window.InventoryPanel.openGroundItems(); return; }
        if (id === 'warehouse') { if (window.WarehouseActions.baseWarehousePanelOpen) window.WarehouseActions.closeBaseWarehousePanel(); else window.WarehouseActions.openBaseWarehousePanel(); return; }
        if (id === 'pharmacy') { if (!PharmacyStationPanel.isOpen()) PharmacyStationPanel.open(); return; }
        if (id === 'cook') { if (CookingStationPanel.isOpen()) CookingStationPanel.close(); else CookingStationPanel.open(); }
    }

    function legacyActionMenu() { return { attachView: function (render) { actionsView = render; render({ open: false, items: [], label: '' }); return function () { actionsView = null; }; },
        open: openPlayerActionsSubmenu, close: closePlayerActionsSubmenu,
        toggle: function () { if (playerActionsSubmenuOpen) closePlayerActionsSubmenu(); else openPlayerActionsSubmenu(); }
    }; }

    function prepareFacilityLabor() {
        if (!window.SceneApp.canWorkFacilityLabor()) return false;
        stopGatheringIdle(); stopTiaoXiIdle(false); setRestingActionActive(false, {showMsg:false});
        window.StationActions.stopCookingCraftIdle(); window.StationActions.stopPharmacyCraftIdle(); window.AgricultureActions.stopAgricultureAutoTick(); window.LivestockActions.stopLivestockAutoTick();
        if (window.Survival) {window.Survival.setStaminaRegenActionActive(false);window.Survival.setSitMeditationActive(false);}
        return true;
    }

    function prepareFacilityAction() {
        if (window.BookReading) window.BookReading.pause();
        stopGatheringIdle(); stopTiaoXiIdle(false); setRestingActionActive(false, {showMsg:false});
        window.StationActions.stopCookingCraftIdle(); window.StationActions.stopPharmacyCraftIdle(); window.AgricultureActions.stopAgricultureAutoTick(); window.LivestockActions.stopLivestockAutoTick();
        if (window.Survival) {window.Survival.setStaminaRegenActionActive(false);window.Survival.setSitMeditationActive(false);}
    }

    function prepareDeath() {
        if (window.BedSleep) window.BedSleep.interrupt();
        if (window.GymSystem) window.GymSystem.interrupt();
        if (window.GymEntrancePanel) window.GymEntrancePanel.close();
        window.SceneApp.prepareFacilityAction();
        if (window.DialogueUI) window.DialogueUI.close();
        window.InventoryPanel.closeBackpackPanel({automatic:true}); window.CombatPanel.closeCombatPanel(); window.SkillOverview.closeSurvivalPanel(); window.SavePanel.closeSavePanel();
        if (window.BackpackPanel) window.BackpackPanel.invalidate();
        if (window.DungeonPanel) window.DungeonPanel.close({silent:true});
        if (window.FacilityLaborPanel) window.FacilityLaborPanel.dismiss();
        if (window.HideoutWarehousePanel) window.HideoutWarehousePanel.suspendForLoad();
        if (window.HuntingPanel && window.HuntingPanel.dismiss) window.HuntingPanel.dismiss();
        if (window.FishingPanel && window.FishingPanel.dismiss) window.FishingPanel.dismiss();
    }

    function bindReadyControls() {

            function hubAdjacentBattleContext() {
                return !!(window.CombatEngagement && typeof window.CombatEngagement.isPlayerInCombat === 'function' && window.CombatEngagement.isPlayerInCombat());
            }

            var breathHubSkillId = 'combat_basic_breath';

            var diqiHutiBtnEl = !window.SvelteInteractions && document.getElementById('player-action-diqi-huti');

            if (diqiHutiBtnEl) {
                diqiHutiBtnEl.addEventListener('click', function () {
                    var CHA2 = window.CombatHubActions;
                    if (!CHA2 || typeof CHA2.tryExecuteHubAction !== 'function') return;
                    var r2 = CHA2.tryExecuteHubAction(breathHubSkillId, 'diqi_huti', { isBattleContext: hubAdjacentBattleContext });
                    if (!r2.ok) {
                        var vars2 = {};
                        if (r2.cooldown_ticks != null) vars2.ticks = r2.cooldown_ticks;
                        window.SceneFeedback.showMsg(window.SceneFeedback.ui(r2.reason_key, vars2), 'info');
                        return;
                    }
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui(r2.reason_key, { shield: r2.shield_value != null ? r2.shield_value : 0 }), 'success');
                    if (window.SceneRenderer) window.SceneRenderer.render();
                    if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
                });
            }

            var abGroundEl = !window.SvelteInteractions && document.getElementById('action-bar-ground');

            if (abGroundEl && !abGroundEl._actionBarProxy) {
                abGroundEl._actionBarProxy = true;
                abGroundEl.addEventListener('click', function () {
                    var gBtn = document.getElementById('player-action-ground-items');
                    if (gBtn) gBtn.click();
                });
            }

            var abTakeWaterEl = !window.SvelteInteractions && document.getElementById('action-bar-take-water');

            if (abTakeWaterEl && !abTakeWaterEl._actionBarProxy) {
                abTakeWaterEl._actionBarProxy = true;
                abTakeWaterEl.addEventListener('click', function () {
                    var tw = document.getElementById('player-action-take-water');
                    if (tw) tw.click();
                });
            }

            var abPourWaterEl = !window.SvelteInteractions && document.getElementById('action-bar-pour-water');

            if (abPourWaterEl && !abPourWaterEl._actionBarProxy) {
                abPourWaterEl._actionBarProxy = true;
                abPourWaterEl.addEventListener('click', function () {
                    var pw = document.getElementById('player-action-pour-water');
                    if (pw) pw.click();
                });
            }

            var abAddFuelEl = !window.SvelteInteractions && document.getElementById('action-bar-add-fuel');

            if (abAddFuelEl && !abAddFuelEl._actionBarProxy) {
                abAddFuelEl._actionBarProxy = true;
                abAddFuelEl.addEventListener('click', function () {
                    var af = document.getElementById('player-action-add-fuel');
                    if (af) af.click();
                });
            }

            var abDiqiEl = !window.SvelteInteractions && document.getElementById('action-bar-diqi-huti');

            if (abDiqiEl && !abDiqiEl._actionBarProxy) {
                abDiqiEl._actionBarProxy = true;
                abDiqiEl.addEventListener('click', function () {
                    var dh = !window.SvelteInteractions && document.getElementById('player-action-diqi-huti');
                    if (dh) dh.click();
                });
            }

            var btnPlayerActions = !actionsView && document.getElementById('btn-player-actions');

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
    }

    function initialize() {
        idleTickMs = 3000;
        gatheringIdleTimer = null;
        gatheringIdleAt = null;
        tiaoXiIdleTimer = null;
        restIdleTimer = null;
        tiaoXiCapModeNotified = false;
        playerActionsSubmenuOpen = false;
        playerActionsOutsideClickBound = false;
        ACTION_BAR_PIN_SLOTS = 4;
        actionsView = null;
        BED_FATIGUE_BUFF_IDS = ['survival_fatigue', 'survival_fatigue_sleepy'];
    }

    function bind() {

    window.SceneCtx.isGatheringIdling = function () { return !!gatheringIdleTimer; };

    window.SceneCtx.isTiaoXiIdling = function () { return !!tiaoXiIdleTimer; };

    if (window.BedSleep) window.BedSleep.configure({
        settle: settleSleepAttributeExpOnce,
        refresh: function () {
            SceneHud.refresh('status');
            if (window.SceneRenderer) window.SceneRenderer.render();
        }
    });
    }

    window.PlayerActions = {
        initialize: initialize,
        bind: bind,
        bindQuickBarPinSlotsOnce: bindQuickBarPinSlotsOnce,
        bindReadyControls: bindReadyControls,
        clearQuickBarPinSlot: clearQuickBarPinSlot,
        executeQuickBarPinnedSlot: executeQuickBarPinnedSlot,
        get gatheringIdleAt() { return gatheringIdleAt; },
        get gatheringIdleTimer() { return gatheringIdleTimer; },
        getIdleTickMs: getIdleTickMs,
        getQuickBarPinLabel: getQuickBarPinLabel,
        get idleTickMs() { return idleTickMs; },
        set idleTickMs(value) { idleTickMs = value; },
        legacyActionMenu: legacyActionMenu,
        onGatherClick: onGatherClick,
        prepareDeath: prepareDeath,
        prepareFacilityAction: prepareFacilityAction,
        prepareFacilityLabor: prepareFacilityLabor,
        refreshPlayerActionsMenuUi: refreshPlayerActionsMenuUi,
        get restIdleTimer() { return restIdleTimer; },
        runContextAction: runContextAction,
        setRestingActionActive: setRestingActionActive,
        startRestIdleTimer: startRestIdleTimer,
        stopGatheringIdle: stopGatheringIdle,
        stopGatheringIdleFromScene: stopGatheringIdleFromScene,
        stopRestIdleTimer: stopRestIdleTimer,
        get tiaoXiIdleTimer() { return tiaoXiIdleTimer; },
        trySleepAtBed: trySleepAtBed
    };
})(window);

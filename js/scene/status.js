/**
 * SceneStatusPanel — 原生 HUD 展示与刷新.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var timeHudVisible, BODY_PART_IDS, BODY_PART_LABELS, LEFT_HUD_DOM_TO_WINDOW, combatEngagementFeedbackReady;

    // NOTE: bootstrapMapsFromJson 会触发 render()，而此时 SceneApp.init 里还未完成 ui_text_zhCN.json 的加载。
    // 放到 init() 的 loadConfig 成功后再执行，避免出现 UIText 未加载导致的崩溃。

    function setTimeHudVisible(visible) {
        timeHudVisible = (visible !== false);
        if (window.SvelteHUD) { window.SvelteHUD.invalidate('environment'); return; }
        var wrap = document.getElementById('top-hud');
        if (wrap) wrap.style.display = timeHudVisible ? '' : 'none';
    }

    function isTimeHudVisible() {
        return !!timeHudVisible;
    }

    function getSatietyLabel(zone) {
        var labels = { normal: 'survival.satiety.normal', mild: 'survival.satiety.mild', moderate: 'survival.satiety.moderate', severe: 'survival.satiety.severe', starvation: 'survival.satiety.starvation' };
        return window.SceneFeedback.ui(labels[zone] || 'common.dash');
    }

    function getThirstLabel(thirst, normalMin) {
        normalMin = normalMin != null ? normalMin : 60;
        if (thirst >= normalMin) return window.SceneFeedback.ui('survival.thirst.normal');
        if (thirst > 0) return window.SceneFeedback.ui('survival.thirst.thirsty');
        return window.SceneFeedback.ui('survival.thirst.dehydrated');
    }

    function updateLimbBlock() {
        if (window.SvelteHUD) { window.SvelteHUD.invalidate('body'); return; }
        var container = document.getElementById('limb-rows');
        if (!container || !BODY_PART_IDS || !BODY_PART_LABELS) return;
        var CA0 = window.CharacterAttributes;
        container.innerHTML = '';
        for (var i = 0; i < BODY_PART_IDS.length; i++) {
            var partId = BODY_PART_IDS[i];
                var labelKey = BODY_PART_LABELS[partId] != null ? BODY_PART_LABELS[partId] : partId;
                var label = window.SceneFeedback.ui(labelKey);
            var destroyKey = partId === 'belly' ? 'abdomen' : partId;
            var statusCell = window.SceneFeedback.ui('body.part.status.ok');
            if (CA0 && typeof CA0.getPartDestroy === 'function' && typeof CA0.getBodyPartDestroyMax === 'function') {
                var showD = destroyKey === 'head' || destroyKey === 'chest' || destroyKey === 'abdomen' || window.CombatPanel.COMBAT_LIMB_IDS.indexOf(partId) >= 0;
                if (showD) {
                    var curD = CA0.getPartDestroy(destroyKey);
                    var maxD = CA0.getBodyPartDestroyMax(destroyKey);
                    statusCell = window.SceneFeedback.ui('body.part.destroy.fmt', { cur: String(curD), max: String(maxD) });
                }
            }
            var row = document.createElement('div');
            row.className = 'limb-row';
            row.innerHTML = '<div class="row"><span>' + (label.replace(/</g, '&lt;')) + '</span><span id="limb-' + partId + '">' + statusCell + '</span></div>';
            // Per-part debug control uses the same destruction limits as combat.
            (function (key, partLabel, host) {
                var debugButton = document.createElement('button');
                debugButton.type = 'button';
                debugButton.className = 'limb-debug-destroy';
                debugButton.textContent = '满损毁';
                debugButton.title = '调试：' + partLabel + '满损毁';
                debugButton.setAttribute('aria-label', debugButton.title);
                debugButton.style.cssText = 'margin-left:6px;padding:1px 5px;font-size:11px;flex-shrink:0';
                debugButton.addEventListener('click', function (event) {
                    event.stopPropagation();
                    var CA = window.CharacterAttributes;
                    if (!CA || typeof CA.applyCombatDestroy !== 'function') return;
                    var max = CA.getBodyPartDestroyMax(key);
                    var remaining = Math.max(0, max - CA.getPartDestroy(key));
                    if (remaining > 0) CA.applyCombatDestroy(key, remaining);
                    SceneUi.hideItemTooltip();
                    SceneHud.refresh('status');
                    if (window.PlayerPawnRig) window.PlayerPawnRig.update(document.querySelector('.player-pawn-visual'));
                    if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
                });
                host.querySelector('.row').appendChild(debugButton);
            })(destroyKey, label, row);
            (function (pid, partLabel) {
                row.addEventListener('mouseenter', function () {
                    var statusEl = document.getElementById('limb-' + pid);
                    var statusText = statusEl ? statusEl.textContent : '—';
                    var esc = function (s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
                    var html = '<div class="tooltip-name">' + esc(partLabel) + '</div>';
                    html += '<div class="tooltip-desc">' + window.SceneFeedback.ui('tooltip.status', { v: esc(statusText) }).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                    if (window.CombatPanel.COMBAT_LIMB_IDS.indexOf(pid) >= 0) {
                        var arr = (window.getLimbActionTagLabels ? window.getLimbActionTagLabels(pid) : (window.CombatPanel.limbActionTags[pid] || [])).map(esc);
                        var tagStr = arr.length ? arr.join(window.SceneFeedback.ui('punct.join.dot')) : window.SceneFeedback.ui('common.dash');
                        html += '<div class="tooltip-attrs">' + window.SceneFeedback.ui('tooltip.action.tags', { v: tagStr }).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                    }
                    // 09「损毁恢复」：损毁值正在回落 / 刚受击宽限中（悬停即时计算，不依赖面板刷新）
                    try {
                        var CAp = window.CharacterAttributes;
                        var pKey = pid === 'belly' ? 'abdomen' : pid;
                        if ((!window.MossGameHUD || !window.SceneCtx || window.SceneCtx.shouldShowSurvivalMetric('body_detail', window.Survival && window.Survival.getState())) && CAp && typeof CAp.getPartDestroy === 'function' && CAp.getPartDestroy(pKey) > 0) {
                            var blockLeft = (typeof CAp.getDestroyRecoverBlockTicks === 'function') ? CAp.getDestroyRecoverBlockTicks() : 0;
                            var recLine = '';
                            if (blockLeft > 0) {
                                recLine = window.SceneFeedback.ui('body.part.destroy.recover.blocked', { v: String(blockLeft) });
                            } else if (typeof CAp.getPartRecoverCfg === 'function') {
                                var rcfg = CAp.getPartRecoverCfg();
                                var pmul = Number(rcfg.part_multiplier[pKey]);
                                if (!isFinite(pmul) || pmul <= 0) pmul = 1;
                                var rateTicks = Math.max(1, Math.round(rcfg.interval / pmul));
                                recLine = window.SceneFeedback.ui('body.part.destroy.recover.active', { rate: String(rateTicks) });
                            }
                            if (recLine) html += '<div class="tooltip-attrs">' + recLine.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                        }
                    } catch (eRecTip) { /* 恢复提示异常不影响 tooltip */ }
                    SceneUi.showItemTooltip(html, row);
                });
                row.addEventListener('mouseleave', SceneUi.hideItemTooltip);
            })(partId, label);
            container.appendChild(row);
        }
    }

    function updateStatusPanel(gatherState) {
        if (window.Weather && window.Weather.isReady()) window.Weather.publishObservation();
        if (window.HungerTile) window.HungerTile.refresh();
        var combatBadge = document.getElementById('status-combat-state');
        if (combatBadge) {
            var inCombatNow = !!(window.CombatEngagement && typeof window.CombatEngagement.isPlayerInCombat === 'function' && window.CombatEngagement.isPlayerInCombat());
            combatBadge.textContent = window.SceneFeedback.ui(inCombatNow ? 'status.combat.in' : 'status.combat.out');
            combatBadge.classList.toggle('in-combat', inCombatNow);
        }
        var SurvForRest = window.Survival;
        if (SurvForRest && typeof SurvForRest.getState === 'function') {
            var restState = SurvForRest.getState() || {};
            if (restState.isResting) window.PlayerActions.startRestIdleTimer();
            else window.PlayerActions.stopRestIdleTimer();
        } else {
            window.PlayerActions.stopRestIdleTimer();
        }
        // Preserve status-side gameplay work above; only the old HUD DOM writer exits.
        if (window.SvelteHUD) {
            var beltKnown = !window.SceneCtx || window.SceneCtx.shouldShowLeftHudBlock('quick_belt');
            var belt = document.getElementById('quick-belt-dock');
            if (belt) belt.style.display = beltKnown ? '' : 'none';
            window.SceneCharacter.updateRoleNameFromCharacter();
            window.PlayerActions.refreshPlayerActionsMenuUi();
            window.SvelteHUD.invalidate();
            return;
        }
        function getEnemyDisplayName(enemyId) {
            var id = enemyId != null ? String(enemyId) : '';
            if (!id) return '';
            try {
                if (window.UIText && typeof window.UIText.t === 'function') {
                    return window.UIText.t('enemy.name.' + id.replace(/\./g, '_'));
                }
            } catch (e0) { /* 无专用名时回退 id */ }
            return id;
        }
        function getBuffHudNowTick() {
            var nowTick = 0;
            if (window.GameTime && typeof window.GameTime.getState === 'function') {
                var ts = window.GameTime.getState();
                nowTick = ts && ts.totalTicks != null ? Number(ts.totalTicks) || 0 : 0;
            }
            return nowTick;
        }
        function appendBuffChips(containerEl, ownerArr, nowTick) {
            if (!containerEl) return;
            containerEl.innerHTML = '';
            if (!ownerArr || !ownerArr.length) {
                containerEl.textContent = window.SceneFeedback.ui('status.enemy_buffs.none_buff');
                return;
            }
            ownerArr.forEach(function (inst) {
                // 不要因为 stacks<=0/缺失就跳过：用于定位“敌方 buff 不显示”的 owner/stacks 对齐问题
                if (!inst || !inst.buff_id) return;
                var chip = document.createElement('span');
                chip.className = 'buff-chip';
                var buffName = (inst.template && inst.template.name) ? String(inst.template.name) : String(inst.buff_id);
                var stacks = Math.max(0, parseInt(inst.stacks, 10) || 0);
                var expiresAt = parseInt(inst.expires_at_tick, 10);
                var rem = inst.template && inst.template.manualLifetime ? null : (isFinite(expiresAt) ? Math.max(0, expiresAt - nowTick) : null);
                chip.textContent = buffName + '×' + stacks + (rem != null ? ' ' + rem + 't' : '');
                chip.title = buffName + (inst.template && inst.template.desc ? (': ' + inst.template.desc) : '');

                // 鼠标悬浮：复用物品说明的同一套 tooltip（#item-tooltip）
                var buffDesc = inst.template && inst.template.desc ? String(inst.template.desc) : '';
                var attrs = window.SceneFeedback.ui('scene.buff.stacks', { v: String(stacks) });
                if (rem != null) attrs += '\n' + window.SceneFeedback.ui('scene.buff.remaining', { v: String(rem) });
                var tipHtml = SceneUi.buildItemTooltipHtml(buffName, buffDesc, attrs);
                chip.addEventListener('mouseenter', function () {
                    SceneUi.showItemTooltip(tipHtml, chip);
                });
                chip.addEventListener('mouseleave', function () {
                    SceneUi.hideItemTooltip();
                });
                containerEl.appendChild(chip);
            });
            if (!containerEl.children.length) containerEl.textContent = window.SceneFeedback.ui('status.enemy_buffs.none_buff');
        }
        function renderBuffHud() {
            var hud = document.getElementById('buff-hud');
            var playerEl = document.getElementById('buff-hud-player-chips');
            var enemyEl = document.getElementById('buff-hud-enemy-chips');
            var selfTitle = document.getElementById('buff-hud-self-title');
            var enemyTitle = document.getElementById('buff-hud-enemy-title');
            if (!hud || !playerEl || !enemyEl) return;
            if (!shouldShowBlock('buff_hud')) {
                setBlockDisplay('buff-hud', false);
                return;
            }
            setBlockDisplay('buff-hud', false);
            if (selfTitle) selfTitle.textContent = window.SceneFeedback.ui('buff.hud.self');
            var nowTick = getBuffHudNowTick();
            if (!window.BuffSystem || typeof window.BuffSystem.getState !== 'function') {
                playerEl.textContent = window.SceneFeedback.ui('status.enemy_buffs.none_buff');
                enemyEl.textContent = window.SceneFeedback.ui('status.enemy_buffs.none_buff');
                return;
            }
            var bs = window.BuffSystem.getState() || {};
            var instByOwner = bs.instancesByOwner || {};
            var pArr = Array.isArray(instByOwner.player) ? instByOwner.player : [];
            appendBuffChips(playerEl, pArr, nowTick);
            var targetEnemyId = window.SceneCtx && window.SceneCtx.lastAttackedEnemyId != null
                ? String(window.SceneCtx.lastAttackedEnemyId)
                : '';
            var chosenEnemyId = targetEnemyId;
            var eArr = (chosenEnemyId && Array.isArray(instByOwner[chosenEnemyId]))
                ? instByOwner[chosenEnemyId]
                : [];

            // 兜底：如果上回合敌方没有 buff（可能 ownerId 对不上/尚未记录），则显示“最近一次出现 buff 的敌人”
            if (!eArr || !eArr.length) {
                var bestOwnerId = '';
                var bestTick = -1;
                var ownerKeys = Object.keys(instByOwner || {});
                for (var k = 0; k < ownerKeys.length; k++) {
                    var oid = ownerKeys[k];
                    if (!oid || oid === 'player') continue;
                    var arr = instByOwner[oid];
                    if (!Array.isArray(arr) || !arr.length) continue;
                    for (var ii = 0; ii < arr.length; ii++) {
                        var inst = arr[ii];
                        if (!inst) continue;
                        var st = inst.started_tick != null ? Number(inst.started_tick) : NaN;
                        if (isFinite(st) && st > bestTick) {
                            bestTick = st;
                            bestOwnerId = oid;
                        }
                    }
                }
                if (bestOwnerId) {
                    chosenEnemyId = bestOwnerId;
                    eArr = Array.isArray(instByOwner[chosenEnemyId]) ? instByOwner[chosenEnemyId] : [];
                }
            }

            // 若自身与敌方都没有可显示的 Buff，则隐藏整个 HUD。
            var selfHas = Array.isArray(pArr) && pArr.some(function (inst) {
                return inst && inst.buff_id && (parseInt(inst.stacks, 10) || 0) > 0;
            });
            var enemyHas = Array.isArray(eArr) && eArr.some(function (inst) {
                return inst && inst.buff_id && (parseInt(inst.stacks, 10) || 0) > 0;
            });
            if (!selfHas && !enemyHas) {
                setBlockDisplay('buff-hud', false);
                return;
            }
            setBlockDisplay('buff-hud', true);

            if (enemyTitle) {
                enemyTitle.textContent = chosenEnemyId
                    ? window.SceneFeedback.ui('buff.hud.target_with_name', { name: getEnemyDisplayName(chosenEnemyId) })
                    : window.SceneFeedback.ui('buff.hud.target_none');
            }

            if (!chosenEnemyId) {
                enemyEl.textContent = window.SceneFeedback.ui('status.enemy_buffs.none_target');
                return;
            }

            // HUD 调试：帮助定位“敌方 buff 不显示”究竟是 ownerId 对不上还是 buff 实例不存在
            try {
                var sig = 't=' + String(targetEnemyId || '') + '|c=' + String(chosenEnemyId || '') + '|e=' + String(eArr && eArr.length ? eArr.length : 0);
                if (window.__buffHudLastSig !== sig) {
                    window.__buffHudLastSig = sig;
                    console.log('[BUFF-HUD]', {
                        targetEnemyId: targetEnemyId,
                        chosenEnemyId: chosenEnemyId,
                        enemyBuffInstanceCount: eArr && eArr.length ? eArr.length : 0,
                        playerBuffInstanceCount: pArr && pArr.length ? pArr.length : 0,
                        ownerKeys: Object.keys(instByOwner || {})
                    });
                }
            } catch (e0) { /* ignore */ }

            appendBuffChips(enemyEl, eArr, nowTick);
        }
        function shouldShowBlock(blockId) {
            var ctx = window.SceneCtx;
            if (ctx && typeof ctx.shouldShowLeftHudBlock === 'function') {
                return !!ctx.shouldShowLeftHudBlock(blockId);
            }
            return true;
        }
        function setBlockDisplay(id, visible) {
            // 已注册窗口经 UIWindows 合并玩家偏好（游戏门控 && 玩家偏好）；未注册/无管线时回退直接显隐
            var winId = LEFT_HUD_DOM_TO_WINDOW[id];
            if (winId && window.UIWindows && typeof window.UIWindows.setGameVisible === 'function') {
                window.UIWindows.setGameVisible(winId, !!visible);
                return;
            }
            var el = document.getElementById(id);
            if (el) el.style.display = visible ? '' : 'none';
        }
        function shouldShowSurvivalMetric(metricId, survivalState) {
            var ctx = window.SceneCtx;
            if (ctx && typeof ctx.shouldShowSurvivalMetric === 'function') {
                return !!ctx.shouldShowSurvivalMetric(metricId, survivalState || null);
            }
            return true;
        }
        function setSurvivalMetricDisplay(id, visible) {
            var el = document.getElementById(id);
            if (!el) return;
            el.style.display = visible ? '' : 'none';
        }
        setBlockDisplay('status-role-card', shouldShowBlock('role'));
        setBlockDisplay('status-limbs', shouldShowBlock('limbs'));
        setBlockDisplay('status-survival', shouldShowBlock('survival'));
        setBlockDisplay('status-resources', shouldShowBlock('resources'));
        setBlockDisplay('quick-belt-dock', shouldShowBlock('quick_belt'));
        setBlockDisplay('status-attrs-block', shouldShowBlock('attrs'));

        updateLimbBlock();
        renderBuffHud();
        window.SceneCharacter.updateRoleNameFromCharacter();
        var CA = window.CharacterAttributes;
        if (CA && typeof CA.getEffectiveAttr === 'function') {
            var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
            attrIds.forEach(function (id) {
                var el = document.getElementById('status-attr-' + id);
                if (!el) return;
                var baseInn = CA.getInnateAttr ? CA.getInnateAttr(id) : (CA.getBaseInnateAttr ? CA.getBaseInnateAttr(id) : 0);
                var eff = CA.getEffectiveAttr(id);
                var extra = Math.max(0, eff - baseInn);
                if (extra > 0) el.textContent = baseInn + '+' + extra + '=' + eff;
                else el.textContent = String(eff);
            });
            var attrExpState = (typeof CA.getAttributeExpState === 'function')
                ? CA.getAttributeExpState('player')
                : {};
            attrIds.forEach(function (id) {
                var expEl = document.getElementById('status-attr-exp-exp-' + id);
                if (!expEl) return;
                var e = attrExpState && attrExpState[id] ? attrExpState[id] : { attribute_level: 0, exp: 0 };
                var exp = Math.max(0, Math.floor(Number(e.exp) || 0));
                expEl.textContent = String(exp);
            });
        }
        var Surv = window.Survival;
        var satietyText = document.getElementById('status-satiety-text');
        var satietyBar = document.getElementById('status-satiety-bar');
        var thirstText = document.getElementById('status-thirst-text');
        var thirstBar = document.getElementById('status-thirst-bar');
        var staminaText = document.getElementById('status-stamina-text');
        var staminaBar = document.getElementById('status-stamina-bar');
        var fatigueText = document.getElementById('status-fatigue-text');
        var fatigueBar = document.getElementById('status-fatigue-bar');
        var energyText = document.getElementById('status-energy-text');
        var energyBar = document.getElementById('status-energy-bar');
        var moodEl = document.getElementById('status-mood');
        var moodBar = document.getElementById('status-mood-bar');
        var nutritionEl = document.getElementById('status-nutrition');
        var nutritionBar = document.getElementById('status-nutrition-bar');
        var dirtynessEl = document.getElementById('status-dirtyness');
        var dirtynessBar = document.getElementById('status-dirtyness-bar');
        var carryOwned = window.SvelteCarryPilot && window.SvelteCarryPilot.owns('carry');
        var weightEl = carryOwned ? null : document.getElementById('status-weight');
        if (!satietyText || (!weightEl && !carryOwned)) {
            window.PlayerActions.refreshPlayerActionsMenuUi();
            return;
        }

        if (Surv && typeof Surv.getState === 'function') {
            var s = Surv.getState();
            setSurvivalMetricDisplay('status-metric-satiety', shouldShowSurvivalMetric('satiety', s));
            setSurvivalMetricDisplay('status-metric-thirst', shouldShowSurvivalMetric('thirst', s));
            setSurvivalMetricDisplay('status-metric-mood', shouldShowSurvivalMetric('mood', s));
            setSurvivalMetricDisplay('status-metric-nutrition', shouldShowSurvivalMetric('nutrition', s));
            setSurvivalMetricDisplay('status-metric-dirtyness', shouldShowSurvivalMetric('dirtyness', s));
            setSurvivalMetricDisplay('status-metric-energy', shouldShowSurvivalMetric('energy', s));
            setSurvivalMetricDisplay('status-metric-stamina', shouldShowSurvivalMetric('stamina', s));
            setSurvivalMetricDisplay('status-metric-fatigue', shouldShowSurvivalMetric('fatigue', s));
            if (!carryOwned) setSurvivalMetricDisplay('status-metric-weight', shouldShowSurvivalMetric('weight', s));

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

            if (fatigueText) {
                var fatigueValue = Math.max(0, Math.min(100, Number(s.fatigue) || 0));
                var fatigueState = 'normal';
                if (fatigueValue >= 80) fatigueState = 'sleepy';
                else if (fatigueValue > 50 && fatigueValue < 80) fatigueState = 'tired';
                var fatigueStateKey = fatigueState === 'sleepy'
                    ? 'survival.fatigue.sleepy'
                    : (fatigueState === 'tired' ? 'survival.fatigue.tired' : 'survival.fatigue.normal');
                fatigueText.textContent = window.SceneFeedback.ui(fatigueStateKey) + ' (' + fatigueValue.toFixed(1) + '/100.0)';
                fatigueText.className = fatigueState === 'sleepy' ? 'value danger' : (fatigueState === 'tired' ? 'value warn' : 'value ok');
                if (fatigueBar) fatigueBar.style.width = fatigueValue + '%';
            }

            var enMax = s.energy_max || 100;
            energyText.textContent = s.energy.toFixed(1) + ' / ' + enMax;
            energyText.className = s.energy <= 0 ? 'value danger' : (s.energy < enMax * 0.3 ? 'value warn' : 'value ok');
            energyBar.style.width = enMax > 0 ? (s.energy / enMax * 100) + '%' : '0%';

            if (moodEl) {
                var moodValue = Math.round(window.Survival && window.Survival.getMood ? window.Survival.getMood() : Number(s.mood) || 0);
                var moodRange = (Surv.getMoodRangeByValue && typeof Surv.getMoodRangeByValue === 'function')
                    ? Surv.getMoodRangeByValue(moodValue)
                    : 'normal';
                var moodKey = moodRange === 'low' ? 'survival.mood.low'
                    : (moodRange === 'high' ? 'survival.mood.high' : 'survival.mood.normal');
                moodEl.textContent = window.SceneFeedback.ui(moodKey) + ' (' + moodValue + '/1000)';
                moodEl.className = moodRange === 'low' ? 'value danger' : (moodRange === 'high' ? 'value ok' : 'value warn');
                if (moodBar) {
                    var moodPct = Math.max(0, Math.min(100, (moodValue / 1000) * 100));
                    moodBar.style.width = moodPct + '%';
                }
            }
            if (nutritionEl) {
                var nutritionValue = Math.max(0, Math.min(100, Number(s.nutrition) || 0));
                nutritionEl.textContent = Math.round(nutritionValue) + ' / 100';
                nutritionEl.className = nutritionValue <= 10 ? 'value danger' : (nutritionValue < 40 ? 'value warn' : 'value ok');
                if (nutritionBar) nutritionBar.style.width = nutritionValue + '%';
            }
            if (dirtynessEl) {
                var dirtynessValue = Math.max(0, Math.min(100, Number(s.dirtyness) || 0));
                dirtynessEl.textContent = Math.round(dirtynessValue) + ' / 100';
                dirtynessEl.className = dirtynessValue >= 80 ? 'value danger' : (dirtynessValue >= 50 ? 'value warn' : 'value ok');
                if (dirtynessBar) dirtynessBar.style.width = dirtynessValue + '%';
            }

            var battleCard = document.getElementById('status-combat-resources-card');
            var battleWrap = document.getElementById('status-battle-resources');
            var showBattleCardByRule = shouldShowBlock('combat_resources');
            if (battleCard) setBlockDisplay('status-combat-resources-card', showBattleCardByRule);
            if (battleWrap) {
                if (showBattleCardByRule) {
                    var qm = s.qi_li_max != null ? s.qi_li_max : (Surv.getQiLiMax ? Surv.getQiLiMax() : 0);
                    var qc = s.qi_li_current != null ? s.qi_li_current : 0;
                    var dmax = s.diqi_max != null ? s.diqi_max : 0;
                    var dc = s.diqi_current != null ? s.diqi_current : 0;
                    var dsh = s.diqi_shield_remaining != null ? s.diqi_shield_remaining : 0;
                    var qiText = document.getElementById('status-qi-li-text');
                    var qiBar = document.getElementById('status-qi-li-bar');
                    var dqText = document.getElementById('status-diqi-text');
                    var dqBar = document.getElementById('status-diqi-bar');
                    var shText = document.getElementById('status-diqi-shield-text');
                    if (qiText) qiText.textContent = qm > 0 ? (qc.toFixed(0) + ' / ' + qm) : '—';
                    if (qiBar) qiBar.style.width = qm > 0 ? (Math.min(100, (qc / qm) * 100)) + '%' : '0%';
                    if (dqText) dqText.textContent = dmax > 0 ? ((dc % 1 === 0 ? String(Math.round(dc)) : dc.toFixed(1)) + ' / ' + dmax) : '—';
                    if (dqBar) dqBar.style.width = dmax > 0 ? (Math.min(100, (dc / dmax) * 100)) + '%' : '0%';
                    if (shText) shText.textContent = dsh > 0 ? String(Math.floor(dsh)) : '—';
                    var stunText = document.getElementById('status-stun-text');
                    if (stunText) {
                        var stunVal = 0;
                        try {
                            if (window.InventoryEquipment && typeof window.InventoryEquipment.getPlayerStunValue === 'function') {
                                stunVal = window.InventoryEquipment.getPlayerStunValue();
                            }
                        } catch (eSt) { /* ignore */ }
                        var stunActive = false;
                        try {
                            if (window.InventoryEquipment && typeof window.InventoryEquipment.isPlayerStunned === 'function') {
                                stunActive = window.InventoryEquipment.isPlayerStunned();
                            }
                        } catch (eSt2) { /* ignore */ }
                        stunText.textContent = stunActive ? (String(stunVal) + '（眩晕中）') : String(stunVal);
                    }
                    // 疼痛（k229/47 §9.6）：显示生效值（min(累积, 封顶 25+0.75×平均损毁%)）+ 档位名
                    var painText = document.getElementById('status-pain-text');
                    if (painText) {
                        var painVal = '—';
                        try {
                            if (Surv && typeof Surv.getPainInfo === 'function') {
                                var pi2 = Surv.getPainInfo() || {};
                                var pTierLabel = '';
                                if (pi2.tier && pi2.tier !== 'none') {
                                    try { pTierLabel = window.SceneFeedback.ui('survival.pain.' + String(pi2.tier)); }
                                    catch (ePt) { pTierLabel = String(pi2.tier); }
                                }
                                painVal = pTierLabel ? (String(pi2.effective) + '（' + pTierLabel + '）') : String(pi2.effective);
                                if (pi2.ignored_ratio > 0) painVal = window.SceneFeedback.ui('survival.pain.medicated', {
                                    raw: pi2.unmedicated, effective: Number(Number(pi2.effective).toFixed(2)),
                                    percent: Math.round(pi2.ignored_ratio * 100)
                                });
                            }
                        } catch (ePainUi) { /* ignore */ }
                        painText.textContent = painVal;
                    }
                }
            }

            if (weightEl) weightEl.textContent = s.weight_kg + ' kg';
            var carryEl = carryOwned ? null : document.getElementById('status-carry');
            var potentialEl = document.getElementById('status-potential');
            var combatExpEl = document.getElementById('status-combat-experience');
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
            if (potentialEl) {
                var pVal = (IE && typeof IE.getPotential === 'function') ? IE.getPotential() : null;
                potentialEl.textContent = (pVal == null) ? '—' : String(pVal);
            }
            if (combatExpEl) {
                var cVal = (IE && typeof IE.getCombatExperience === 'function') ? IE.getCombatExperience() : null;
                combatExpEl.textContent = (cVal == null) ? '—' : String(cVal);
            }
            var studyEl = document.getElementById('status-study');
            if (studyEl) {
                if (window.Survival && typeof window.Survival.getStudyState === 'function' && window.Survival.getStudyState().active) {
                    var stSkillId = window.Survival.getStudySkillId();
                    var stName = stSkillId || '—';
                    if (window.CombatSkills && typeof window.CombatSkills.getSkill === 'function') {
                        var stSk = window.CombatSkills.getSkill(stSkillId);
                        if (stSk && stSk.name) stName = stSk.name;
                    }
                    var stEnergy = (window.Survival && typeof window.Survival.getEnergy === 'function') ? window.Survival.getEnergy() : null;
                    var stPot = (IE && typeof IE.getPotential === 'function') ? IE.getPotential() : null;
                    var stParts = [stName];
                    if (stEnergy != null) stParts.push(window.SceneFeedback.ui('status.label.energy') + ' ' + stEnergy);
                    if (stPot != null) stParts.push(window.SceneFeedback.ui('status.label.potential') + ' ' + stPot);
                    studyEl.textContent = stParts.join(' · ');
                } else {
                    studyEl.textContent = '—';
                }
            }
        } else {
            satietyText.textContent = '—';
            satietyBar.style.width = '100%';
            thirstText.textContent = '—';
            thirstBar.style.width = '100%';
            setSurvivalMetricDisplay('status-metric-satiety', shouldShowSurvivalMetric('satiety', null));
            setSurvivalMetricDisplay('status-metric-thirst', shouldShowSurvivalMetric('thirst', null));
            setSurvivalMetricDisplay('status-metric-mood', shouldShowSurvivalMetric('mood', null));
            setSurvivalMetricDisplay('status-metric-nutrition', shouldShowSurvivalMetric('nutrition', null));
            setSurvivalMetricDisplay('status-metric-dirtyness', shouldShowSurvivalMetric('dirtyness', null));
            setSurvivalMetricDisplay('status-metric-energy', shouldShowSurvivalMetric('energy', null));
            setSurvivalMetricDisplay('status-metric-stamina', shouldShowSurvivalMetric('stamina', null));
            setSurvivalMetricDisplay('status-metric-fatigue', shouldShowSurvivalMetric('fatigue', null));
            if (!carryOwned) setSurvivalMetricDisplay('status-metric-weight', shouldShowSurvivalMetric('weight', null));
            if (gatherState) {
                staminaText.textContent = gatherState.stamina + ' / ' + gatherState.stamina_max;
                staminaBar.style.width = (gatherState.stamina_max > 0 ? (gatherState.stamina / gatherState.stamina_max * 100) : 0) + '%';
            } else {
                staminaText.textContent = '—';
                staminaBar.style.width = '100%';
            }
            energyText.textContent = '—';
            energyBar.style.width = '100%';
            if (fatigueText) {
                fatigueText.textContent = '—';
                fatigueText.className = 'value';
            }
            if (fatigueBar) fatigueBar.style.width = '0%';
            if (moodEl) {
                moodEl.textContent = '—';
                moodEl.className = 'value';
            }
            if (moodBar) moodBar.style.width = '50%';
            if (nutritionEl) {
                nutritionEl.textContent = '—';
                nutritionEl.className = 'value';
            }
            if (nutritionBar) nutritionBar.style.width = '100%';
            if (dirtynessEl) {
                dirtynessEl.textContent = '—';
                dirtynessEl.className = 'value';
            }
            if (dirtynessBar) dirtynessBar.style.width = '0%';
            if (weightEl) weightEl.textContent = '—';
            var carryEl = carryOwned ? null : document.getElementById('status-carry');
            var potentialEl = document.getElementById('status-potential');
            var combatExpEl = document.getElementById('status-combat-experience');
            if (carryEl) {
                var cap = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function') ? window.CharacterAttributes.getCarryCapacity() : null;
                var current = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
                if (cap != null && current != null) carryEl.textContent = current.toFixed(1) + ' / ' + cap.toFixed(1) + ' kg';
                else if (cap != null) carryEl.textContent = '— / ' + cap.toFixed(1) + ' kg';
                else carryEl.textContent = '—';
            }
            if (potentialEl) potentialEl.textContent = '—';
            if (combatExpEl) combatExpEl.textContent = '—';
        }
        window.PlayerActions.refreshPlayerActionsMenuUi();
        refreshPharmacyStatusRows();
    }

    function setupCombatEngagementFeedback() {
        if (combatEngagementFeedbackReady || !window.CombatEngagement || typeof window.CombatEngagement.onChange !== 'function') return;
        combatEngagementFeedbackReady = true;
        window.CombatEngagement.onChange(function (ev) {
            if (window.GameLog && typeof window.GameLog.log === 'function') {
                window.GameLog.log(window.SceneFeedback.ui(ev && ev.inCombat ? 'combat.log.engagement.enter' : 'combat.log.engagement.exit'), 'system');
            }
            if (window.SceneHud && typeof window.SceneHud.refresh === 'function') window.SceneHud.refresh('status');
            if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        });
    }

    /** 制药状态行（47 §4.1 成瘾可见条 + §9.2 体内毒性；k242/k240）。 */
    function refreshPharmacyStatusRows() {
        if (window.SvelteHUD) { window.SvelteHUD.invalidate('battle'); return; }
        var PE = window.PharmacyEffects;
        var addEl = document.getElementById('status-addiction-text');
        if (addEl) {
            var txt = '—';
            try {
                if (PE && typeof PE.getInfo === 'function') {
                    var info = PE.getInfo() || {};
                    var label = window.SceneFeedback.ui('pharmacy.addiction.stage' + String(info.stage || 1));
                    var effectiveLabel = window.SceneFeedback.ui('pharmacy.addiction.stage' + String(info.effective_stage || info.stage || 1));
                    txt = String(Math.round(info.addiction)) + '（' + label + '；' + window.SceneFeedback.ui('pharmacy.addiction.effective_stage', { stage: effectiveLabel, n: info.relief_stages || 0 }) + '）';
                }
            } catch (eAddUi) { /* ignore */ }
            addEl.textContent = txt;
        }
        var toxEl = document.getElementById('status-toxicity-text');
        if (toxEl) {
            var tTxt = '—';
            try {
                if (PE && typeof PE.getInfo === 'function') {
                    var info2 = PE.getInfo() || {};
                    tTxt = String(Math.round(info2.toxicity));
                    if (info2.toxicity > 0) tTxt += '（' + window.SceneFeedback.ui('pharmacy.toxicity.' + String(info2.toxicity_band || 'none')) + '）';
                    if (info2.lethal_active) tTxt += window.SceneFeedback.ui('pharmacy.toxicity.lethal', { n: String(info2.lethal_remaining) });
                }
            } catch (eToxUi) { /* ignore */ }
            toxEl.textContent = tTxt;
        }
    }

    function initialize() {
        timeHudVisible = true;
        BODY_PART_IDS = ['head', 'chest', 'belly', 'lhand', 'rhand', 'lfoot', 'rfoot'];
        BODY_PART_LABELS = { head: 'body.part.head', chest: 'body.part.chest', belly: 'body.part.belly', lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
        LEFT_HUD_DOM_TO_WINDOW = {
        'status-role-card': 'win-role',
        'status-limbs': 'win-limbs',
        'status-combat-resources-card': 'win-battle-resources',
        'status-survival': 'win-survival',
        'status-resources': 'win-resources',
        'status-attrs-block': 'win-attrs',
        'status-attr-exp-block': 'win-attr-exp',
        'buff-hud': 'win-buff'
    };
        combatEngagementFeedbackReady = false;
    }

    function bind() {

    window.HUD = window.HUD || {};

    window.HUD.setTimeHudVisible = setTimeHudVisible;

    window.HUD.isTimeHudVisible = isTimeHudVisible;

    document.addEventListener('hud:time', function (ev) {
        var v = ev && ev.detail ? ev.detail.visible : undefined;
        if (v === undefined) return;
        setTimeHudVisible(!!v);
    });
    }

    window.SceneStatusPanel = {
        initialize: initialize,
        bind: bind,
        get BODY_PART_IDS() { return BODY_PART_IDS; },
        get BODY_PART_LABELS() { return BODY_PART_LABELS; },
        setupCombatEngagementFeedback: setupCombatEngagementFeedback,
        get timeHudVisible() { return timeHudVisible; },
        set timeHudVisible(value) { timeHudVisible = value; },
        updateStatusPanel: updateStatusPanel
    };
})(window);

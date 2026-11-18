/**
 * CombatPanel — 战斗装配面板及其公开展示动作.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var ARM_ACTION_TAGS, FOOT_ACTION_TAGS, COMBAT_LIMB_IDS, limbActionTags, combatPanelOpen, combatUIState, LIMB_LABELS, LIMB_ICONS;

    function getLimbActionTags(limbId) {
        if (!limbActionTags[limbId]) return [];
        return limbActionTags[limbId].slice();
    }

    function getLimbActionTagLabels(limbId) {
        var tags = getLimbActionTags(limbId);
        return tags.map(function (k) {
            try { return window.SceneFeedback.ui(k); } catch (e) { return k; }
        });
    }

    function setLimbActionTags(limbId, tags) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return;
        limbActionTags[limbId] = Array.isArray(tags) ? tags.slice() : [];
    }

    function addLimbActionTag(limbId, tag) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0 || !tag) return;
        var arr = limbActionTags[limbId];
        if (!arr) limbActionTags[limbId] = [];
        if (limbActionTags[limbId].indexOf(tag) < 0) limbActionTags[limbId].push(tag);
    }

    function removeLimbActionTag(limbId, tag) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0 || !limbActionTags[limbId]) return;
        var i = limbActionTags[limbId].indexOf(tag);
        if (i >= 0) limbActionTags[limbId].splice(i, 1);
    }

    function hasLimbActionTag(limbId, tag) {
        return limbActionTags[limbId] && limbActionTags[limbId].indexOf(tag) >= 0;
    }

    function openCombatPanel() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (combatPanelOpen) return;
        combatPanelOpen = true;
        if (window.SvelteCombat) window.SvelteCombat.refresh();
        else if (window.SveltePanels) window.SveltePanels.refresh('combat');
        window.SceneMapView.refreshRenderProfile();
        var firstCat = window.CombatSkills && window.CombatSkills.getCategories().length ? window.CombatSkills.getCategories()[0].id : 'unarmed';
        combatUIState.curCat = firstCat;
        var skillsInCat = window.CombatSkills ? window.CombatSkills.getSkillsByCategory(firstCat) : [];
        combatUIState.curSkillId = (skillsInCat.length && skillsInCat[0].id) ? skillsInCat[0].id : null;
        combatUIState.curPart = 'rhand';
        combatUIState.curSlot = 'active';
        combatUIState.editingSlot = null;
        combatUIState.mode = 'skills';
        if (!window.SveltePanels && !window.SvelteCombat) document.getElementById('modal-combat').classList.add('show');
        document.getElementById('left-hud').style.opacity = '0.1';
        document.getElementById('left-hud').style.pointerEvents = 'none';
        renderCombatModal();
    }

    function closeCombatPanel() {
        if (!combatPanelOpen) return;
        combatPanelOpen = false;
        if (window.SvelteCombat) window.SvelteCombat.refresh();
        else if (window.SveltePanels) window.SveltePanels.refresh('combat');
        window.SceneMapView.refreshRenderProfile();
        if (!window.SveltePanels && !window.SvelteCombat) document.getElementById('modal-combat').classList.remove('show');
        document.getElementById('left-hud').style.opacity = '';
        document.getElementById('left-hud').style.pointerEvents = '';
        if (!window.SveltePanels && !window.SvelteCombat) document.getElementById('picker-move').classList.remove('show');
        combatUIState.editingSlot = null;
        window.SceneMapView.render();
    }

    function safeSetCombatState(patch, failMsg) {
        if (!IE || typeof IE.setCombatState !== 'function') return false;
        try {
            var metaBefore = window.CombatMetaSkills && window.CombatMetaSkills.configSignature();
            var ok = IE.setCombatState(patch);
            if (ok === false) {
                window.SceneFeedback.showMsg(failMsg || window.SceneFeedback.ui('combat.cfg.invalid'), 'warn');
                return false;
            }
            if (window.CombatMetaSkills && metaBefore !== window.CombatMetaSkills.configSignature()
                && window.CombatEngagement.isPlayerInCombat()) window.Survival.advanceTick({source:'combat_setup', intensity:'low'});
            return true;
        } catch (e) {
            window.SceneFeedback.showMsg((failMsg || window.SceneFeedback.ui('combat.cfg.invalid')) + (e && e.message ? (' ' + e.message) : ''), 'warn');
            return false;
        }
    }

    function renderCombatModal() {
        if (window.SvelteCombat) { window.SvelteCombat.refresh(); return; }
        if (window.SveltePanels) { window.SveltePanels.refresh('combat'); return; }
        var CS = window.CombatSkills;
        var AP = window.Muscles;
        var combatState = IE && IE.getCombatState ? IE.getCombatState() : { limbs: {}, hubs: { breath: null, footwork: null }, move_sequences: {}, skill_move_sequences: {}, move_sequence_cursors: {} };
        var limbIds = IE && IE.COMBAT_LIMB_IDS ? IE.COMBAT_LIMB_IDS.slice() : ['lhand', 'rhand', 'lfoot', 'rfoot'];
        combatUIState.mode = 'skills';
        var isMuscleMode = false;
        var combatModal = document.getElementById('modal-combat');
        if (combatModal) combatModal.classList.remove('combat-muscle-mode');

        var catBox = document.getElementById('category-tabs');
        var skillListEl = document.getElementById('skill-list');
        var acListEl = document.getElementById('muscle-list');

        if (catBox) catBox.innerHTML = '';
        if (skillListEl) {
            skillListEl.style.display = isMuscleMode ? 'none' : 'flex';
            if (!isMuscleMode) skillListEl.innerHTML = '';
        }
        if (acListEl) {
            acListEl.style.display = isMuscleMode ? 'flex' : 'none';
            if (isMuscleMode) acListEl.innerHTML = '';
        }
        var hubSectionEl = document.querySelector('#modal-combat .combat-hub-section');
        var limbTitleEl = document.querySelector('#modal-combat .combat-limb-title');
        var limbContainerEl = document.getElementById('limb-container');
        var seqHeadEl = document.querySelector('#modal-combat .combat-seq-head');
        var selectedMetaEl = document.querySelector('#modal-combat .combat-selected-meta');
        var seqWrapEl = document.getElementById('move-sequence');
        var configColEl = document.querySelector('#modal-combat .combat-config-column');
        if (hubSectionEl) hubSectionEl.style.display = isMuscleMode ? 'none' : '';
        if (limbTitleEl) limbTitleEl.style.display = isMuscleMode ? 'none' : '';
        if (limbContainerEl) limbContainerEl.style.display = isMuscleMode ? 'none' : '';
        if (seqHeadEl) {
            seqHeadEl.style.display = isMuscleMode ? 'none' : '';
            var seqTitle = seqHeadEl.querySelector('[data-ui="combat.move_sequence.section"]');
            if (seqTitle) seqTitle.textContent = window.SceneFeedback.ui(combatUIState.curCat === 'footwork' ? 'combat.footwork.effects' : 'combat.move_sequence.section');
        }
        if (selectedMetaEl) selectedMetaEl.style.display = isMuscleMode ? 'none' : '';
        if (seqWrapEl) seqWrapEl.style.display = isMuscleMode ? 'none' : '';
        if (configColEl) configColEl.style.display = isMuscleMode ? 'none' : '';

        window.MusclePanel.renderMusclePassivePanel(isMuscleMode);

        if (CS && !isMuscleMode) {
            var cats = CS.getCategories();
            if (catBox) {
                cats.forEach(function (c) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'combat-cat-btn' + (combatUIState.curCat === c.id ? ' active' : '');
                    btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                    btn.onclick = function () {
                        combatUIState.curCat = c.id;
                        var list = CS.getSkillsByCategory(c.id);
                        combatUIState.curSkillId = (list.length && list[0]) ? list[0].id : null;
                        renderCombatModal();
                    };
                    catBox.appendChild(btn);
                });
            }

            if (skillListEl) {
                var list = CS.getSkillsByCategory(combatUIState.curCat);
                list.forEach(function (s) {
                    var div = document.createElement('div');
                    div.className = 'combat-skill-item' + (combatUIState.curSkillId === s.id ? ' selected' : '');
                    var level = IE && IE.getSkillLevel ? IE.getSkillLevel(s.id) : 0;
                    var metaStr = window.SceneFeedback.ui('combat.level', { v: level });
                    div.innerHTML = '<div class="skill-icon">' + (s.icon || '') + '</div><div class="skill-info"><div class="skill-name">' + (s.name || s.id) + '</div><div class="skill-meta">' + metaStr + '</div></div>';
                    div.onclick = function () {
                        combatUIState.curSkillId = s.id;
                        renderCombatModal();
                    };
                    skillListEl.appendChild(div);
                });
            }
        }

        var hubBreath = document.getElementById('hub-breath');
        var hubFootwork = document.getElementById('hub-footwork');
        var valBreath = document.getElementById('val-breath');
        var valFootwork = document.getElementById('val-footwork');
        if (!isMuscleMode) {
            if (hubBreath) hubBreath.classList.toggle('active', !!combatState.hubs.breath);
            if (hubFootwork) hubFootwork.classList.toggle('active', !!combatState.hubs.footwork);
            if (valBreath) { valBreath.textContent = window.CombatSelection.getCombatSkillName(combatState.hubs.breath) || window.SceneFeedback.ui('combat.not.loaded'); valBreath.classList.toggle('empty', !combatState.hubs.breath); }
            if (valFootwork) { valFootwork.textContent = window.CombatSelection.getCombatSkillName(combatState.hubs.footwork) || window.SceneFeedback.ui('combat.not.loaded'); valFootwork.classList.toggle('empty', !combatState.hubs.footwork); }
        }

        var limbBox = document.getElementById('limb-container');
        if (!isMuscleMode && limbBox && combatState.limbs) {
            limbBox.innerHTML = '';
            var isGlobal = combatUIState.curCat === 'breath' || combatUIState.curCat === 'footwork';
            limbBox.style.opacity = isGlobal ? '0.2' : '1';
            limbBox.style.pointerEvents = isGlobal ? 'none' : 'auto';
            var strikeOrder = (IE && typeof IE.getLimbStrikeOrderSlice === 'function') ? IE.getLimbStrikeOrderSlice() : limbIds.slice();
            if (!Array.isArray(strikeOrder) || strikeOrder.length !== limbIds.length) strikeOrder = limbIds.slice();
            var strikeCursor = (IE && typeof IE.getLimbStrikeOrderCursor === 'function') ? Number(IE.getLimbStrikeOrderCursor()) : 0;
            if (!isFinite(strikeCursor)) strikeCursor = 0;
            strikeCursor = ((Math.floor(strikeCursor) % strikeOrder.length) + strikeOrder.length) % strikeOrder.length;
            var strikeOrderPos = {};
            strikeOrder.forEach(function (lid, idx) { strikeOrderPos[String(lid)] = idx; });
            var strikeBar = document.createElement('div');
            strikeBar.className = 'combat-strike-order-bar';
            var strikeHead = document.createElement('div');
            strikeHead.className = 'strike-order-head';
            strikeHead.innerHTML = '<span class="strike-order-label">' + window.SceneFeedback.ui('combat.strike_order.label') + '</span><span class="strike-order-hint" title="' + window.SceneFeedback.ui('combat.strike_order.hint') + '">ⓘ</span>';
            strikeBar.appendChild(strikeHead);
            var strikeChips = document.createElement('div');
            strikeChips.className = 'strike-order-chips';
            strikeOrder.forEach(function (lid, idx) {
                var chip = document.createElement('span');
                chip.className = 'strike-chip' + (idx === strikeCursor ? ' strike-cursor' : '');
                chip.innerHTML = '<span class="strike-chip-order">' + String(idx + 1) + '</span><span class="strike-chip-name">' + window.SceneFeedback.ui(LIMB_LABELS[lid] || lid) + '</span>' + (idx === strikeCursor ? '<span class="strike-chip-dot"></span>' : '');
                strikeChips.appendChild(chip);
                if (idx < strikeOrder.length - 1) {
                    var swapBtn = document.createElement('button');
                    swapBtn.type = 'button';
                    swapBtn.className = 'btn-strike-swap';
                    swapBtn.textContent = '↔';
                    swapBtn.title = window.SceneFeedback.ui('combat.strike_order.swap_pair');
                    swapBtn.onclick = function (i, j) {
                        return function (e) {
                            e.stopPropagation();
                            if (!IE || typeof IE.swapLimbStrikeOrderIndices !== 'function') return;
                            IE.swapLimbStrikeOrderIndices(i, j);
                            renderCombatModal();
                        };
                    }(idx, idx + 1);
                    strikeChips.appendChild(swapBtn);
                }
            });
            strikeBar.appendChild(strikeChips);
            limbBox.appendChild(strikeBar);
            limbIds.forEach(function (lid) {
                var limb = combatState.limbs[lid] || { active: null };
                var div = document.createElement('div');
                div.className = 'combat-limb-item';
                var activeName = window.CombatSelection.getCombatSkillName(limb.active);
                var isActiveSel = combatUIState.curPart === lid && combatUIState.curSlot === 'active';
                var orderBadge = strikeOrderPos[lid] != null ? ('#' + String(Number(strikeOrderPos[lid]) + 1)) : '--';
                div.innerHTML = '<div class="limb-header"><span>' + (LIMB_ICONS[lid] || '') + ' ' + window.SceneFeedback.ui(LIMB_LABELS[lid] || lid) + '</span><div class="limb-header-right"><span class="limb-order-badge">' + orderBadge + '</span></div></div><div class="limb-slots"><div class="combat-limb-slot' + (isActiveSel ? ' selected' : '') + '" data-part="' + lid + '" data-slot="active"><span class="slot-type">' + window.SceneFeedback.ui('combat.slot.active') + '</span><span class="slot-skill">' + activeName + '</span></div></div>';

                div.querySelectorAll('.combat-limb-slot').forEach(function (slotEl) {
                    slotEl.onclick = function () {
                        combatUIState.curPart = slotEl.getAttribute('data-part');
                        combatUIState.curSlot = slotEl.getAttribute('data-slot');
                        renderCombatModal();
                    };
                });
                limbBox.appendChild(div);
            });
        }

        var selSkill = CS && combatUIState.curSkillId ? CS.getSkill(combatUIState.curSkillId) : null;
        var titleEl = document.getElementById('skill-title');
        var levelEl = document.getElementById('skill-level');
        if (titleEl) {
            if (!isMuscleMode) {
                titleEl.textContent = selSkill ? selSkill.name : '--';
            } else if (AP && combatUIState.curMuscleId) {
                var catId = combatUIState.curMuscleCat;
                var listApTitle = AP.getMuscleEntriesByGroup(catId);
                var curAp = listApTitle.find(function (x) { return x.id === combatUIState.curMuscleId; });
                titleEl.textContent = curAp ? curAp.name : '--';
            } else {
                titleEl.textContent = '--';
            }
        }
        var skillLevel = IE && combatUIState.curSkillId ? IE.getSkillLevel(combatUIState.curSkillId) : 0;
        var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        if (levelEl) levelEl.textContent = window.SceneFeedback.ui('combat.level', { v: skillLevel });
        window.SceneDebug.renderRecipeSchemaValidationDebugList();

        // 肢体仅装配徒手或兵器；防御统一由全局步法提供。
        var btnDeploy = document.getElementById('btn-deploy-combat');
        if (btnDeploy) {
            var canDeploy = true;
            btnDeploy.textContent = isMuscleMode ? (AP.getProgress(combatUIState.curMuscleId).toFixed(3) + '%') : window.SceneFeedback.ui('combat.deploy');
            if (isMuscleMode) {
                canDeploy = false;
            } else if (combatUIState.curCat !== 'breath' && combatUIState.curCat !== 'footwork') {
                if (!selSkill) {
                    canDeploy = false;
                } else {
                    canDeploy = selSkill.category === 'unarmed' || selSkill.category === 'weapon';
                }
            }
            btnDeploy.disabled = !canDeploy;
        }

        function getVariantName(variantId) {
            if (!variantId || !window.CombatVariants || typeof window.CombatVariants.getVariant !== 'function') return '';
            var v = window.CombatVariants.getVariant(variantId);
            if (!v) return String(variantId);
            if (v.name_key && window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(v.name_key);
            return v.id || v.variant_id || String(variantId);
        }

        var seqBox = document.getElementById('move-sequence');
        var limbPartForSeq = combatUIState.curPart || 'lhand';
        var limbRowForSeq = combatState.limbs && combatState.limbs[limbPartForSeq];
        var slotForMoveSeq = combatUIState.curSlot || 'active';
        /** 招式序列以该肢**已部署**的主动技能为准，不要求与左侧技能列表选中的项一致，避免列表与肢上部署不一致时整块序列为空。 */
        var seqSkillId = (slotForMoveSeq === 'active' && limbRowForSeq && limbRowForSeq.active) ? String(limbRowForSeq.active) : null;
        var seqSk = (seqSkillId && CS) ? CS.getSkill(seqSkillId) : null;
        var skillLevelForSeq = (seqSkillId && IE) ? IE.getSkillLevel(seqSkillId) : 0;
        if (!isMuscleMode && combatUIState.curCat !== 'breath' && combatUIState.curCat !== 'footwork'
            && seqBox && slotForMoveSeq === 'active' && seqSk && seqSk.moves && seqSk.moves.length
            && seqSk.category !== 'breath' && seqSk.category !== 'footwork' && seqSkillId) {
            seqBox.innerHTML = '';
            var maxSlots = CS.getMaxSlotsForLevel(seqSkillId, skillLevelForSeq);
            var unlockedSeq = CS.getUnlockedMoves(seqSkillId, skillLevelForSeq);
            var moveUsageSeq = (skillsState[seqSkillId] && skillsState[seqSkillId].move_usage) ? skillsState[seqSkillId].move_usage : {};
            var seq = (combatState.move_sequences && Array.isArray(combatState.move_sequences[limbPartForSeq])) ? combatState.move_sequences[limbPartForSeq].slice() : [];
            while (seq.length < maxSlots) seq.push('');
            seq = seq.slice(0, maxSlots);
            for (var i = 0; i < maxSlots; i++) {
                var rawMoveId = seq[i] ? String(seq[i]) : '';
                var isVariantSlot = rawMoveId.indexOf('variant:') === 0;
                var variantIdAtSlot = isVariantSlot ? rawMoveId.slice('variant:'.length) : '';
                // 11-skills 设计变更：每肢 = 1 主动技能 + 槽1（该肢可用招式）+ 槽2..N（变式槽）
                var moveName;
                var nodeProfTxt = '';
                if (i === 0) {
                    // 槽1：招式（可从技能在该肢可用的招式中选）
                    var mo = null;
                    var mi2;
                    for (mi2 = 0; mi2 < unlockedSeq.length; mi2++) {
                        if (unlockedSeq[mi2].id === rawMoveId) { mo = unlockedSeq[mi2]; break; }
                    }
                    moveName = mo ? mo.name : (rawMoveId ? rawMoveId : window.SceneFeedback.ui('combat.seq.slot_empty'));
                    if (mo) {
                        var uc = moveUsageSeq[mo.id] != null ? moveUsageSeq[mo.id] : 0;
                        var pr = Math.floor(CS.getMoveProficiencyRatio(uc) * 100);
                        nodeProfTxt = '<span class="node-prof">' + window.SceneFeedback.ui('combat.prof.node', { v: pr }) + '</span>';
                    }
                } else {
                    moveName = isVariantSlot
                        ? ('[' + window.SceneFeedback.ui('combat.variant.label') + '] ' + getVariantName(variantIdAtSlot))
                        : window.SceneFeedback.ui('combat.seq.slot_empty');
                }
                var node = document.createElement('div');
                node.className = 'combat-move-node' + (combatUIState.editingSlot === i ? ' editing' : '') + (!rawMoveId ? ' slot-empty' : '');
                node.innerHTML = '<span class="node-index">' + String(i + 1).padStart(2, '0') + '</span><span class="node-name">' + moveName + '</span>' + nodeProfTxt;
                node.onclick = function (idx, el) {
                    return function (e) {
                        e.stopPropagation();
                        combatUIState.editingSlot = idx;
                        openMovePicker(idx, el);
                        if (typeof requestAnimationFrame === 'function') {
                            requestAnimationFrame(function () { renderCombatModal(); });
                        } else {
                            setTimeout(function () { renderCombatModal(); }, 0);
                        }
                    };
                }(i, node);
                seqBox.appendChild(node);
            }

            // 主动链变式与招式共槽，直接在槽位中编辑，不单独渲染列表。
        } else if (seqBox) {
            seqBox.innerHTML = '';
            if (!isMuscleMode && selSkill && selSkill.category === 'footwork') {
                var footworkDescription = document.createElement('p');
                footworkDescription.textContent = selSkill.description || '';
                seqBox.appendChild(footworkDescription);
            }
        }

        var targetEl = document.getElementById('target-indicator');
        if (targetEl) {
            if (!isMuscleMode) {
                if (combatUIState.curCat === 'breath') targetEl.textContent = window.SceneFeedback.ui('combat.target.hub.breath');
                else if (combatUIState.curCat === 'footwork') targetEl.textContent = window.SceneFeedback.ui('combat.target.hub.footwork');
                else targetEl.textContent = window.SceneFeedback.ui('combat.target.limb', { limb: window.SceneFeedback.ui(LIMB_LABELS[combatUIState.curPart] || combatUIState.curPart), slot: window.SceneFeedback.ui('combat.slot.active') });
            } else {
                targetEl.textContent = window.SceneFeedback.ui('combat.target.muscle');
            }
        }

        if (AP && isMuscleMode && catBox && acListEl) {
            var acCats = AP.getCategories();
            // 兜底：默认/残留的肌群 id 不在当前数据表内时，重置到首个真实肌群（防止首屏空白）
            if (acCats.length && !acCats.some(function (c) { return c.id === combatUIState.curMuscleCat; })) {
                combatUIState.curMuscleCat = acCats[0].id;
            }
            acCats.forEach(function (c) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'combat-cat-btn' + (combatUIState.curMuscleCat === c.id ? ' active' : '');
                btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                btn.onclick = function () {
                    combatUIState.curMuscleCat = c.id;
                    combatUIState.musclePage = 0;
                    var listAp2 = AP.getMuscleEntriesByGroup(c.id);
                    combatUIState.curMuscleId = listAp2.length ? listAp2[0].id : null;
                    renderCombatModal();
                };
                catBox.appendChild(btn);
            });

            var listAp = AP.getMuscleEntriesByGroup(combatUIState.curMuscleCat);
            // 兜底：当前选中肌肉不属于当前肌群（跨肌群残留）时重置
            if (!listAp.some(function (x) { return x.id === combatUIState.curMuscleId; })) {
                combatUIState.curMuscleId = listAp.length ? listAp[0].id : null;
            }
            var pageSize = 18;
            var total = listAp.length;
            var maxPage = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0;
            if (combatUIState.musclePage > maxPage) combatUIState.musclePage = maxPage;
            if (combatUIState.musclePage < 0) combatUIState.musclePage = 0;
            var start = combatUIState.musclePage * pageSize;
            var end = Math.min(start + pageSize, total);

            for (var i = start; i < end; i++) {
                var a = listAp[i];
                var div = document.createElement('div');
                var isSel = combatUIState.curMuscleId === a.id;
                div.className = 'combat-muscle-item' + (isSel ? ' selected' : '');
                var isUnlocked = AP.isUnlocked(a.id);
                var meta = window.SceneFeedback.ui(isUnlocked ? 'muscle.meta.unlocked' : 'muscle.meta.locked', { effects: (a.effectsText || '') });
                div.innerHTML = '<div class="muscle-name">' + a.name + '</div><div class="muscle-meta">' + meta + '</div>';
                var unlockBtn = document.createElement('button');
                unlockBtn.type = 'button';
                unlockBtn.className = 'combat-pager-btn';
                unlockBtn.textContent = AP.getProgress(a.id).toFixed(3) + '%';
                unlockBtn.disabled = true;

                div.appendChild(unlockBtn);
                div.onclick = function (id) {
                    return function () {
                        combatUIState.curMuscleId = id;
                        renderCombatModal();
                    };
                }(a.id);
                acListEl.appendChild(div);
            }

            if (total > pageSize) {
                var pager = document.createElement('div');
                pager.className = 'combat-pager';

                var btnPrev = document.createElement('button');
                btnPrev.type = 'button';
                btnPrev.className = 'combat-pager-btn';
                btnPrev.textContent = window.SceneFeedback.ui('pager.prev');
                btnPrev.disabled = combatUIState.musclePage <= 0;
                if (!btnPrev.disabled) {
                    btnPrev.onclick = function () {
                        combatUIState.musclePage--;
                        renderCombatModal();
                    };
                }

                var info = document.createElement('span');
                info.textContent = window.SceneFeedback.ui('pager.info', { cur: (combatUIState.musclePage + 1), max: (maxPage + 1), total: total });

                var btnNext = document.createElement('button');
                btnNext.type = 'button';
                btnNext.className = 'combat-pager-btn';
                btnNext.textContent = window.SceneFeedback.ui('pager.next');
                btnNext.disabled = combatUIState.musclePage >= maxPage;
                if (!btnNext.disabled) {
                    btnNext.onclick = function () {
                        combatUIState.musclePage++;
                        renderCombatModal();
                    };
                }

                pager.appendChild(btnPrev);
                pager.appendChild(info);
                pager.appendChild(btnNext);
                acListEl.appendChild(pager);
            }
        }
    }

    function openMovePicker(idx, anchorEl) {
        var CS = window.CombatSkills;
        var picker = document.getElementById('picker-move');
        var listEl = document.getElementById('picker-list');
        if (!picker || !listEl || !CS) return;
        var part = combatUIState.curPart || 'lhand';
        var combatPre = IE.getCombatState();
        var limbRec = combatPre.limbs && combatPre.limbs[part];
        if (!limbRec || !limbRec.active) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.seq.need_deploy'), 'warn');
            return;
        }
        var pickSkillId = String(limbRec.active);
        var skillLevel = IE ? IE.getSkillLevel(pickSkillId) : 0;
        var unlocked = CS.getUnlockedMoves(pickSkillId, skillLevel);
        var limbKeys = typeof window.getLimbActionTags === 'function' ? window.getLimbActionTags(part) : [];
        var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        var CV = window.CombatVariants;
        // 11-skills 设计变更：每肢 = 1 主动技能 + 槽1（该肢可用招式）+ 槽2..N（变式槽）；idx===0 开招式页，其余开变式页
        var tabState = { current: (idx === 0 ? 'moves' : 'variants') };
        var unlockDeps = {
            getSkillLevel: function (sid) { return IE.getSkillLevel(String(sid || '')) || 0; },
            getMoveUsage: function (skid) {
                var s = skillsState[skid];
                return (s && s.move_usage && typeof s.move_usage === 'object') ? s.move_usage : {};
            },
            CombatSkills: CS
        };
        var seqPreview = (combatPre.move_sequences && Array.isArray(combatPre.move_sequences[part])) ? combatPre.move_sequences[part].slice() : [];
        var maxSlotsPick = CS.getMaxSlotsForLevel(pickSkillId, skillLevel);
        while (seqPreview.length < maxSlotsPick) seqPreview.push('');
        seqPreview = seqPreview.slice(0, maxSlotsPick);
        while (seqPreview.length <= idx) seqPreview.push('');
        // 11-skills 设计变更：槽位只装变式，任意已装槽均可清空（无「至少保留一个招式」限制）
        var canClearSlot = !!seqPreview[idx];
        var btnClearSlot = document.createElement('button');
        btnClearSlot.type = 'button';
        btnClearSlot.className = 'picker-move-clear-slot';
        btnClearSlot.textContent = window.SceneFeedback.ui('combat.seq.clear_slot');
        btnClearSlot.disabled = !canClearSlot;
        btnClearSlot.title = canClearSlot ? '' : window.SceneFeedback.ui('combat.seq.already_empty');
        btnClearSlot.onclick = function () {
            var combat = IE.getCombatState();
            var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[part])) ? combat.move_sequences[part].slice() : [];
            var mx = CS.getMaxSlotsForLevel(pickSkillId, IE.getSkillLevel(pickSkillId));
            while (seq.length < mx) seq.push('');
            seq = seq.slice(0, mx);
            while (seq.length <= idx) seq.push('');
            if (!seq[idx]) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.seq.already_empty'), 'warn');
                return;
            }
            seq[idx] = '';
            var patchMs = {};
            patchMs[part] = seq;
            if (!safeSetCombatState({ move_sequences: patchMs }, window.SceneFeedback.ui('combat.seq.already_empty'))) return;
            if (IE && typeof IE.setMoveSlotPowerLevel === 'function') IE.setMoveSlotPowerLevel(part, idx, null);
            combatUIState.editingSlot = null;
            combatUIState.movePickerTab = tabState.current;
            picker.classList.remove('show');
            renderCombatModal();
        };
        function buildVariantPicker() {
            if (!CV || typeof CV.getAllVariants !== 'function') return;
            var allVar = CV.getAllVariants() || [];
            allVar.forEach(function (v) {
                if (!v) return;
                var vid = String(v.variant_id || v.id || '');
                if (!vid) return;
                var scope = String(v.assist_scope || 'active_moves');
                if (scope !== 'active_moves' && scope !== 'both') return;
                if (typeof CV.isVariantUnlocked === 'function' && !CV.isVariantUnlocked(v, unlockDeps)) return;
                var token = 'variant:' + vid;
                var isDup = seqPreview.indexOf(token) >= 0;
                var btnV = document.createElement('button');
                btnV.type = 'button';
                btnV.className = 'picker-pick-item';
                var vName = (v.name_key && window.UIText && typeof window.UIText.t === 'function') ? window.UIText.t(v.name_key) : vid;
                btnV.innerHTML = '<span>' + vName + '</span><span class="move-prof">' + window.SceneFeedback.ui('combat.variant.badge', {}) + '</span>';
                btnV.disabled = isDup;
                btnV.title = isDup ? window.SceneFeedback.ui('combat.variant.dup_limb', {}) : '';
                btnV.onclick = function () {
                    var combat = IE.getCombatState();
                    var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[part])) ? combat.move_sequences[part].slice() : [];
                    var mxSel = CS.getMaxSlotsForLevel(pickSkillId, IE.getSkillLevel(pickSkillId));
                    while (seq.length < mxSel) seq.push('');
                    seq = seq.slice(0, mxSel);
                    while (seq.length <= idx) seq.push('');
                    for (var di = 0; di < seq.length; di++) {
                        if (di !== idx && seq[di] === token) {
                            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.variant.dup_limb'), 'warn');
                            return;
                        }
                    }
                    seq[idx] = token;
                    var patchMs2 = {};
                    patchMs2[part] = seq;
                    if (!safeSetCombatState({ move_sequences: patchMs2 }, window.SceneFeedback.ui('combat.seq.already_empty'))) return;
                    if (IE && typeof IE.setMoveSlotPowerLevel === 'function') IE.setMoveSlotPowerLevel(part, idx, null);
                    combatUIState.editingSlot = null;
                    combatUIState.movePickerTab = 'variants';
                    picker.classList.remove('show');
                    renderCombatModal();
                };
                listEl.appendChild(btnV);
            });
        }
        function reflowPicker() {
            listEl.innerHTML = '';
            // 11-skills 设计变更：每肢 = 1 主动技能 + 槽1（该肢可用招式）+ 槽2..N（变式槽）
            if (combatUIState) combatUIState.movePickerTab = tabState.current;
            listEl.appendChild(btnClearSlot);
            if (idx === 0) {
                // 槽1：招式选择（该技能在该肢可用的招式）
                var anyMove = false;
                unlocked.forEach(function (m) {
                    if (typeof CS.moveAllowedOnLimbByTagKeys === 'function' && !CS.moveAllowedOnLimbByTagKeys(m, limbKeys)) return;
                    anyMove = true;
                    var count = (skillsState[pickSkillId] && skillsState[pickSkillId].move_usage && skillsState[pickSkillId].move_usage[m.id] != null) ? skillsState[pickSkillId].move_usage[m.id] : 0;
                    var pct = Math.floor(CS.getMoveProficiencyRatio(count) * 100);
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'picker-pick-item';
                    btn.innerHTML = '<span>' + m.name + '</span><span class="move-prof">' + window.SceneFeedback.ui('combat.prof.short', { v: pct }) + '</span>';
                    btn.onclick = function () {
                        if (typeof CS.moveAllowedOnLimbByTagKeys === 'function' && !CS.moveAllowedOnLimbByTagKeys(m, limbKeys)) {
                            window.SceneFeedback.showMsg(window.SceneFeedback.ui('combat.seq.limb_tag_blocked'), 'warn');
                            return;
                        }
                        var combat = IE.getCombatState();
                        var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[part])) ? combat.move_sequences[part].slice() : [];
                        var mxSel = CS.getMaxSlotsForLevel(pickSkillId, IE.getSkillLevel(pickSkillId));
                        while (seq.length < mxSel) seq.push('');
                        seq = seq.slice(0, mxSel);
                        while (seq.length <= idx) seq.push('');
                        seq[0] = m.id;
                        var patchMs = {};
                        patchMs[part] = seq;
                        if (!safeSetCombatState({ move_sequences: patchMs }, window.SceneFeedback.ui('combat.seq.already_empty'))) return;
                        if (IE && typeof IE.setMoveSlotPowerLevel === 'function') IE.setMoveSlotPowerLevel(part, idx, null);
                        combatUIState.editingSlot = null;
                        combatUIState.movePickerTab = 'moves';
                        picker.classList.remove('show');
                        renderCombatModal();
                    };
                    listEl.appendChild(btn);
                });
                if (!anyMove) {
                    var emptyMoveHint = document.createElement('div');
                    emptyMoveHint.className = 'picker-empty-hint';
                    emptyMoveHint.style.padding = '8px 12px';
                    emptyMoveHint.style.fontSize = '12px';
                    emptyMoveHint.style.color = '#a8a29e';
                    emptyMoveHint.textContent = window.SceneFeedback.ui('combat.seq.no_matching_moves');
                    listEl.appendChild(emptyMoveHint);
                }
            } else {
                // 槽2..N：变式选择
                buildVariantPicker();
                if (!listEl.querySelectorAll('.picker-pick-item').length) {
                    var emptyHint = document.createElement('div');
                    emptyHint.className = 'picker-empty-hint';
                    emptyHint.style.padding = '8px 12px';
                    emptyHint.style.fontSize = '12px';
                    emptyHint.style.color = '#a8a29e';
                    emptyHint.textContent = window.SceneFeedback.ui('picker.move.empty.variants');
                    listEl.appendChild(emptyHint);
                }
            }
        }
        reflowPicker();
        if (combatUIState) combatUIState.movePickerTab = tabState.current;
        var rect = anchorEl.getBoundingClientRect();
        picker.style.left = (rect.left) + 'px';
        picker.style.top = (rect.top - 200) + 'px';
        picker.classList.add('show');
    }

    function handleDeployCombat() {
        var CS = window.CombatSkills;
        var AP = window.Muscles;

        if (combatUIState.mode === 'muscles') return;

        var skillId = combatUIState.curSkillId;
        if (!skillId || !IE || !IE.setCombatState) return;
        var sk = CS && CS.getSkill(skillId);
        if (!sk) return;
        var combat = IE.getCombatState();
        if (combatUIState.curCat === 'breath') {
            var prevBreath = combat.hubs.breath;
            if (!safeSetCombatState({ hubs: { breath: skillId } }, window.SceneFeedback.ui('combat.deploy.breath_mount_fail'))) return;
            if (prevBreath !== skillId && window.Survival) {
                // 07「切换」：切换呼吸法 = 消耗 1 tick + 读取新呼吸法的初始状态（initial_state，基本呼吸法 qi_li=0）
                if (typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick({source:'combat_setup', intensity:'low'});
            }
        } else if (combatUIState.curCat === 'footwork') {
            combat.hubs.footwork = skillId;
            if (!safeSetCombatState({ hubs: { footwork: skillId } }, window.SceneFeedback.ui('combat.deploy.footwork_mount_fail'))) return;
        } else {
            if (sk.category !== 'unarmed' && sk.category !== 'weapon') return;
            var part = combatUIState.curPart;
            var prevActive = combat.limbs[part] && combat.limbs[part].active;
            combat.limbs[part].active = skillId;
            var deployPatch = { limbs: combat.limbs };
            if (prevActive !== skillId) {
                var freshSeq = window.CombatSelection.buildDefaultMoveSequenceArray(CS, IE, skillId, part);
                var ms = {};
                ms[part] = freshSeq;
                deployPatch.move_sequences = ms;
                var mc = {};
                mc[part] = 0;
                deployPatch.move_sequence_cursors = mc;
            }
            if (!safeSetCombatState(deployPatch, window.SceneFeedback.ui('combat.deploy.skill_mount_fail'))) return;
        }
        if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.combat.deployed', { name: (sk.name || skillId) }), 'system');
        renderCombatModal();
    }
    function legacyCombatApi() { return {
        combatState: combatUIState,
        getOpen: function () { return combatPanelOpen; },
        close: closeCombatPanel,
        deploy: handleDeployCombat, debugCombat: window.SceneDebug.debugCombatPlus50,
        setCombat: safeSetCombatState, recipeReport: window.SceneDebug.getRecipeSchemaValidationReport,
        setWeaponConfig: function (kind, value) {
            var w = window.ModularWeaponCombat;
            if (!combatPanelOpen || !w || window.SceneAccess.isPlayerComaActive() || (window.Survival && window.Survival.isDead())) return false;
            var changed = kind === 'order' ? w.setAttackOrder(value) : kind === 'power' ? w.setPowerLevel(value.slot, value.power)
                : kind === 'move' && w.setMoveConfig(value.slot, value.config);
            if (changed && window.CombatEngagement && window.CombatEngagement.isPlayerInCombat()) {
                window.Survival.advanceTick({source:'combat_setup', intensity:'low'}); SceneHud.refresh('status'); window.SceneMapView.render();
            }
            return changed;
        }
    }; }

    function initialize() {
        ARM_ACTION_TAGS = ['combat.action.punch', 'combat.action.push_palm', 'combat.action.finger_jab'];
        FOOT_ACTION_TAGS = ['combat.action.snap_kick', 'combat.action.stomp', 'combat.action.toe_kick'];
        COMBAT_LIMB_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];
        limbActionTags = {
        lhand: ARM_ACTION_TAGS.slice(),
        rhand: ARM_ACTION_TAGS.slice(),
        lfoot: FOOT_ACTION_TAGS.slice(),
        rfoot: FOOT_ACTION_TAGS.slice()
    };
        combatPanelOpen = false;
        combatUIState = {
        mode: 'skills',
        curCat: 'unarmed',
        curSkillId: null,
        curPart: 'rhand',
        curSlot: 'active',
        editingSlot: null,
        curMuscleCat: '',
        curMuscleId: null,
        musclePage: 0,
        recipeSchemaListOpen: false
    };
        LIMB_LABELS = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
        LIMB_ICONS = { lhand: '🤚', rhand: '🤚', lfoot: '👣', rfoot: '👣' };
    }

    function bind() {

    window.getLimbActionTags = getLimbActionTags;

    window.getLimbActionTagLabels = getLimbActionTagLabels;

    window.setLimbActionTags = setLimbActionTags;

    window.addLimbActionTag = addLimbActionTag;

    window.removeLimbActionTag = removeLimbActionTag;

    window.hasLimbActionTag = hasLimbActionTag;

    window.ARM_ACTION_TAGS = ARM_ACTION_TAGS;

    window.FOOT_ACTION_TAGS = FOOT_ACTION_TAGS;

    window.COMBAT_LIMB_IDS = COMBAT_LIMB_IDS;

    if (document.getElementById('btn-combat')) {
        document.getElementById('btn-combat').addEventListener('click', function () {
            if (combatPanelOpen) closeCombatPanel(); else openCombatPanel();
        });
    }

    if (document.getElementById('combat-modal-close')) {
        document.getElementById('combat-modal-close').addEventListener('click', closeCombatPanel);
    }

    if (document.getElementById('btn-deploy-combat')) {
        document.getElementById('btn-deploy-combat').addEventListener('click', handleDeployCombat);
    }

    document.addEventListener('click', function () {
        if (window.SveltePanels || window.SvelteCombat) return;
        var hadOpenPicker = false;
        var movePickerAny = document.getElementById('picker-move');
        if (movePickerAny && movePickerAny.classList.contains('show')) hadOpenPicker = true;
        if (combatUIState.editingSlot != null) {
            combatUIState.editingSlot = null;
            var picker = document.getElementById('picker-move');
            if (picker) picker.classList.remove('show');
            if (combatPanelOpen) renderCombatModal();
            return;
        }
        if (hadOpenPicker) {
            if (movePickerAny) movePickerAny.classList.remove('show');
        }
    });
    }

    window.CombatPanel = {
        initialize: initialize,
        bind: bind,
        get COMBAT_LIMB_IDS() { return COMBAT_LIMB_IDS; },
        closeCombatPanel: closeCombatPanel,
        get combatPanelOpen() { return combatPanelOpen; },
        set combatPanelOpen(value) { combatPanelOpen = value; },
        get combatUIState() { return combatUIState; },
        handleDeployCombat: handleDeployCombat,
        legacyCombatApi: legacyCombatApi,
        get limbActionTags() { return limbActionTags; },
        openCombatPanel: openCombatPanel,
        renderCombatModal: renderCombatModal,
        safeSetCombatState: safeSetCombatState
    };
})(window);

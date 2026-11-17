/**
 * SceneCharacter — 创角、确认事务与角色展示同步.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var CREATION_ATTR_LABELS, creationInnate, CREATION_ATTR_MAX, CREATION_HEIGHT_MIN, CREATION_HEIGHT_MAX, CREATION_HEIGHT_DEFAULT, CREATION_TARGET_BMI, creationView, creationVisible, creationSaveError;

    function clampCreationHeightCm(raw) {
        var n = Math.round(Number(raw) || 0);
        if (!isFinite(n) || n <= 0) n = CREATION_HEIGHT_DEFAULT;
        if (n < CREATION_HEIGHT_MIN) n = CREATION_HEIGHT_MIN;
        if (n > CREATION_HEIGHT_MAX) n = CREATION_HEIGHT_MAX;
        return n;
    }

    function computeCreationDefaultWeightKg(heightCm) {
        var h = clampCreationHeightCm(heightCm) / 100;
        return Math.round(CREATION_TARGET_BMI * h * h * 10) / 10;
    }

    function getCreationInnateSum() {
        return creationInnate.jingu + creationInnate.flexibility + creationInnate.breath + creationInnate.dexterity + creationInnate.focus;
    }

    function getCreationFreePoints() {
        var sum = getCreationInnateSum();
        return Math.max(0, 100 - sum);
    }

    function publishCreation() {
        if (creationView) creationView({ open: creationVisible, innate: Object.assign({}, creationInnate), free: getCreationFreePoints(), max: CREATION_ATTR_MAX,
            error: creationSaveError,
            height: clampCreationHeightCm(window.Survival && window.Survival.getConfigValue ? window.Survival.getConfigValue('height_cm_default', CREATION_HEIGHT_DEFAULT) : CREATION_HEIGHT_DEFAULT) });
    }

    function showCreationSaveError(message) {
        creationSaveError = message || '';
        if (creationView) { publishCreation(); return; }
        var card = document.getElementById('character-creation-card');
        if (!card) return;
        var error = document.getElementById('creation-save-error');
        if (!error) { error = document.createElement('p'); error.id = 'creation-save-error'; error.setAttribute('role', 'alert'); card.appendChild(error); }
        error.textContent = creationSaveError; error.hidden = !creationSaveError;
    }

    function updateCreationPointsDisplay() {
        var el = document.getElementById('creation-points');
        if (!el) return;
        var free = getCreationFreePoints();
        el.textContent = window.SceneFeedback.ui('creation.points.left', { free: free });
        el.classList.remove('ok');
        if (free === 0) el.classList.add('ok');
    }

    function updateCreationConfirmButton() {
        var btn = document.getElementById('btn-confirm-creation');
        var nameEl = document.getElementById('creation-name');
        if (!btn) return;
        var nameOk = nameEl && String(nameEl.value || '').trim().length > 0;
        btn.disabled = !nameOk;
    }

    function randomDistributeCreationRemainingPoints() {
        var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        var remaining = getCreationFreePoints();
        while (remaining > 0) {
            var candidates = attrIds.filter(function (id) {
                return creationInnate[id] < CREATION_ATTR_MAX;
            });
            if (!candidates.length) break;
            var pick = candidates[Math.floor(Math.random() * candidates.length)];
            creationInnate[pick]++;
            remaining--;
        }
    }

    function initCreationUI() {
        var CA = window.CharacterAttributes;
        if (!CA) return;
        var state = CA.getState();
        creationInnate = {
            jingu: state.innate.jingu != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.jingu)) : 1,
            flexibility: state.innate.flexibility != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.flexibility)) : 1,
            breath: state.innate.breath != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.breath)) : 1,
            dexterity: state.innate.dexterity != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.dexterity)) : 1,
            focus: state.innate.focus != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.focus)) : 1
        };
        if (creationView) { publishCreation(); return; }
        var container = document.getElementById('creation-attr-rows');
        if (!container) return;
        container.innerHTML = '';
        var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        var creationRowControls = [];
        function refreshCreationAllRows() {
            var sum = getCreationInnateSum();
            creationRowControls.forEach(function (r) {
                r.valueSpan.textContent = creationInnate[r.attrId];
                r.btnMinus.disabled = creationInnate[r.attrId] <= 0;
                r.btnPlus.disabled = creationInnate[r.attrId] >= CREATION_ATTR_MAX || sum >= 100;
            });
            var ids = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
            ids.forEach(function (id) {
                var el = document.getElementById('status-attr-' + id);
                if (el) {
                    var aq = CA.getAcquiredAttr ? CA.getAcquiredAttr(id) : 0;
                    var total = creationInnate[id] + aq;
                    el.textContent = aq ? creationInnate[id] + '+' + aq + '=' + total : String(total);
                }
            });
            updateCreationPointsDisplay();
            updateCreationConfirmButton();
        }
        attrIds.forEach(function (attrId) {
            var row = document.createElement('div');
            row.className = 'attr-row';
            var label = document.createElement('span');
            label.className = 'attr-label';
            label.textContent = window.SceneFeedback.ui(CREATION_ATTR_LABELS[attrId]);
            var controls = document.createElement('div');
            controls.className = 'attr-controls';
            var btnMinus = document.createElement('button');
            btnMinus.type = 'button';
            btnMinus.className = 'attr-btn';
            btnMinus.textContent = '−';
            btnMinus.setAttribute('aria-label', window.SceneFeedback.ui('creation.attr.minus'));
            var valueSpan = document.createElement('span');
            valueSpan.className = 'attr-value';
            valueSpan.textContent = creationInnate[attrId];
            var btnPlus = document.createElement('button');
            btnPlus.type = 'button';
            btnPlus.className = 'attr-btn';
            btnPlus.textContent = '+';
            btnPlus.setAttribute('aria-label', window.SceneFeedback.ui('creation.attr.plus'));
            creationRowControls.push({ attrId: attrId, valueSpan: valueSpan, btnMinus: btnMinus, btnPlus: btnPlus });
            btnMinus.onclick = function () {
                if (creationInnate[attrId] > 0) {
                    creationInnate[attrId]--;
                    refreshCreationAllRows();
                }
            };
            btnPlus.onclick = function () {
                var s = getCreationInnateSum();
                if (creationInnate[attrId] < CREATION_ATTR_MAX && s < 100) {
                    creationInnate[attrId]++;
                    refreshCreationAllRows();
                }
            };
            controls.appendChild(btnMinus);
            controls.appendChild(valueSpan);
            controls.appendChild(btnPlus);
            row.appendChild(label);
            row.appendChild(controls);
            container.appendChild(row);
        });
        refreshCreationAllRows();

        var nameEl = document.getElementById('creation-name');
        if (nameEl) nameEl.value = '';
        if (nameEl && !nameEl.__sceneAppCreationInputBound) {
            nameEl.__sceneAppCreationInputBound = true;
            nameEl.addEventListener('input', updateCreationConfirmButton);
        }
        var heightEl = document.getElementById('creation-height');
        if (heightEl) {
            var cfgDefaultHeight = CREATION_HEIGHT_DEFAULT;
            if (window.Survival && typeof window.Survival.getConfigValue === 'function') {
                cfgDefaultHeight = clampCreationHeightCm(window.Survival.getConfigValue('height_cm_default', CREATION_HEIGHT_DEFAULT));
            }
            heightEl.value = String(cfgDefaultHeight);
            if (!heightEl.__sceneAppCreationInputBound) {
                heightEl.__sceneAppCreationInputBound = true;
                heightEl.addEventListener('change', function () {
                    heightEl.value = String(clampCreationHeightCm(heightEl.value));
                });
            }
        }
        updateCreationConfirmButton();
        var btnConfirm = document.getElementById('btn-confirm-creation');
        if (btnConfirm && !btnConfirm.__sceneAppCreationConfirmBound) {
            btnConfirm.__sceneAppCreationConfirmBound = true;
            btnConfirm.onclick = function () {
            if (btnConfirm.disabled) return;
            confirmCreation({ name: nameEl && nameEl.value, height: document.getElementById('creation-height').value,
                hand: document.querySelector('input[name="creation-hand"]:checked').value,
                leg: document.querySelector('input[name="creation-leg"]:checked').value,
                gender: document.querySelector('input[name="creation-gender"]:checked').value });
        };
        }
    }

    function confirmCreation(draft) {
        var CA = window.CharacterAttributes;
            if (!creationVisible || (CA.isCharacterCreationCompleted && CA.isCharacterCreationCompleted())) return false;
            var name = String(draft.name || '').trim().slice(0, 20);
            if (!name) return;
            if (getCreationFreePoints() > 0) {
                randomDistributeCreationRemainingPoints();
                publishCreation();
                if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.creation.points.auto'), 'system');
            }
            function commitCreation() {
            if (typeof IE.initNewGame === 'function') {
                IE.initNewGame();
                if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.starter.equip'), 'system');
            }
            window.StationActions.resetCookingStateForNewCharacter();
            window.MedicalActions.restoreProgress(null);
            var heightCm = clampCreationHeightCm(draft.height);
            var initWeightKg = computeCreationDefaultWeightKg(heightCm);
            var gender = (draft.gender === 'female') ? 'female' : 'male';
            var prevHidden = [];
            try {
                var pst = CA.getState();
                if (pst && Array.isArray(pst.hidden_epithets)) prevHidden = pst.hidden_epithets.slice();
            } catch (eH) { prevHidden = []; }
            if (typeof CA.innateAllTwentyForUselessPerson === 'function' && CA.innateAllTwentyForUselessPerson(creationInnate)) {
                var uselessLabel = CA.HIDDEN_EPITHET_USELESS || '无用之人';
                if (prevHidden.indexOf(uselessLabel) < 0) prevHidden.push(uselessLabel);
            }
            CA.setState({
                characterName: name,
                characterGender: gender,
                character_creation_completed: true,
                innate: { jingu: creationInnate.jingu, flexibility: creationInnate.flexibility, breath: creationInnate.breath, dexterity: creationInnate.dexterity, focus: creationInnate.focus },
                dominant_hand: (draft.hand === 'left') ? 'left' : 'right',
                dominant_leg: (draft.leg === 'left') ? 'left' : 'right',
                hidden_epithets: prevHidden
            });
            if (window.Survival && window.Survival.setState) {
                window.Survival.setState({
                    gender_value: gender === 'female' ? 100 : 0,
                    food_metabolism: null,
                    height_cm: heightCm,
                    weight_kg: initWeightKg
                });
            }
            CA.recalcCharacterStats({
                getEquipmentState: function () { return IE.getState().equipment; },
                getSkillsState: function () { return IE.getState().skills; },
                getItemTemplate: IE.getItemTemplate,
                getEnchantEntry: IE.getEnchantEntry,
                getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
            });
            if (window.Survival && typeof window.Survival.initBattleResourcesFull === 'function') {
                window.Survival.initBattleResourcesFull();
            }
            }
            var creationSaved = false;
            try {
                creationSaved = !!(window.SaveSystem && window.SaveSystem.runAtomic(commitCreation, { trigger: 'opening.creation', required: true }).saved);
            } catch (creationError) { /* keep the form and draft available for retry */ }
            if (!creationSaved) {
                showCreationSaveError(window.SceneFeedback.ui('creation.save.failed'));
                return false;
            }
            showCreationSaveError('');
            hideCreationOverlay();
            updateRoleNameFromCharacter();
            window.SceneAccess.syncIntroShellUi();
            if (window.GameLog && typeof window.GameLog.resetLogPanelLayout === 'function') {
                window.GameLog.resetLogPanelLayout();
            }
            if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.creation.done', { name: name }), 'system');
            window.SceneMapView.render();
        return true;
    }

    function hideCreationOverlay() {
        creationVisible = false;
        if (creationView) { publishCreation(); return; }
        var el = document.getElementById('character-creation-overlay');
        if (el) el.classList.add('hidden');
    }

    function showCreationOverlay() {
        creationVisible = true;
        if (creationView) { publishCreation(); return; }
        var el = document.getElementById('character-creation-overlay');
        if (el) el.classList.remove('hidden');
    }

    function openCharacterCreationAfterIntro() {
        showCreationSaveError('');
        showCreationOverlay();
        initCreationUI();
    }

    function updateRoleNameFromCharacter() {
        // Pawn appearance is refreshed below, with the texture fallback.
        var el = document.getElementById('status-role-name');
        if (!el) return;
        var name = window.CharacterAttributes && window.CharacterAttributes.getCharacterName();
        el.textContent = (name && name.length) ? name : window.SceneFeedback.ui('status.role.default');
        var gEl = document.getElementById('status-gender-line');
        if (gEl && window.CharacterAttributes && window.CharacterAttributes.getCharacterGenderLabel) {
            gEl.textContent = window.SceneFeedback.ui('status.gender.prefix', { gender: window.CharacterAttributes.getCharacterGenderLabel() });
        }
        var pawnEl = document.querySelector('.player-pawn-visual');
        if (pawnEl && !(window.PlayerPawnRig && window.PlayerPawnRig.update(pawnEl))) {
            var pawnTexture = 'assets/map/isometric/player-office-pawn-v4.png';
            if (pawnEl.getAttribute('data-texture-src') !== pawnTexture) {
                pawnEl.setAttribute('data-texture-src', pawnTexture);
                pawnEl.classList.remove('has-pawn-texture');
                var pawnImage = new Image();
                pawnImage.onload = function () {
                    if (pawnEl.getAttribute('data-texture-src') !== pawnTexture) return;
                    pawnEl.style.removeProperty('--pawn-image');
                    pawnEl.style.removeProperty('--pawn-image-size');
                    pawnEl.style.removeProperty('--pawn-image-position');
                    // V4 visible alpha bounds; retain the original PNG as the art master.
                    // Reduce in stages instead of sampling a 1k image directly at 39x72.
                    try {
                        var source = document.createElement('canvas');
                        source.width = 564;
                        source.height = 1177;
                        source.getContext('2d').drawImage(pawnImage, 292, 108, 564, 1177, 0, 0, 564, 1177);
                        var density = Math.max(2, Math.min(4, window.devicePixelRatio || 1));
                        var targetWidth = Math.round(39 * density);
                        var targetHeight = Math.round(72 * density);
                        while (source.width > targetWidth || source.height > targetHeight) {
                            var reduced = document.createElement('canvas');
                            reduced.width = Math.max(targetWidth, Math.floor(source.width / 2));
                            reduced.height = Math.max(targetHeight, Math.floor(source.height / 2));
                            var ctx = reduced.getContext('2d');
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            ctx.drawImage(source, 0, 0, reduced.width, reduced.height);
                            source = reduced;
                        }
                        // Body and projected shadow share the same antialiased alpha.
                        pawnEl.style.setProperty('--pawn-image', 'url("' + source.toDataURL('image/png') + '")');
                        pawnEl.style.setProperty('--pawn-image-size', '39px 72px');
                        pawnEl.style.setProperty('--pawn-image-position', 'center top');
                        pawnEl.setAttribute('data-texture-sampling', source.width + 'x' + source.height);
                    } catch (samplingError) {
                        // CSS still displays the source asset if canvas processing is unavailable.
                        pawnEl.removeAttribute('data-texture-sampling');
                    }
                    pawnEl.classList.add('has-pawn-texture');
                };
                pawnImage.onerror = function () { pawnEl.classList.remove('has-pawn-texture'); };
                pawnImage.src = pawnTexture;
            }
        }
    }

    function recalcCharacterStatsFromIE() {
        if (!window.CharacterAttributes || typeof window.CharacterAttributes.recalcCharacterStats !== 'function') return;
        if (!IE || typeof IE.getState !== 'function') return;
        window.CharacterAttributes.recalcCharacterStats({
            getEquipmentState: function () { return IE.getState().equipment; },
            getSkillsState: function () { return IE.getState().skills; },
            getItemTemplate: IE.getItemTemplate,
            getEnchantEntry: IE.getEnchantEntry,
            getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
        });
    }
    function legacyCreation() { return {
        attachView: function (render) { creationView = render; publishCreation(); return function () { creationView = null; }; },
        change: function (id, delta) {
            if (!creationVisible || !Object.prototype.hasOwnProperty.call(creationInnate, id) || (delta !== 1 && delta !== -1)) return;
            if (delta < 0 ? creationInnate[id] > 0 : creationInnate[id] < CREATION_ATTR_MAX && getCreationFreePoints() > 0) creationInnate[id] += delta;
            publishCreation();
        },
        confirm: confirmCreation,
        clampHeight: clampCreationHeightCm
    }; }

    function initialize() {
        CREATION_ATTR_LABELS = { jingu: 'status.attr.jingu', flexibility: 'status.attr.flexibility', breath: 'status.attr.breath', dexterity: 'status.attr.dexterity', focus: 'status.attr.focus' };
        creationInnate = { jingu: 10, flexibility: 10, breath: 10, dexterity: 10, focus: 10 };
        CREATION_ATTR_MAX = 29;
        CREATION_HEIGHT_MIN = 140;
        CREATION_HEIGHT_MAX = 210;
        CREATION_HEIGHT_DEFAULT = 178;
        CREATION_TARGET_BMI = 22;
        creationView = null;
        creationVisible = false;
        creationSaveError = '';
    }

    function bind() {

    }

    window.SceneCharacter = {
        initialize: initialize,
        bind: bind,
        hideCreationOverlay: hideCreationOverlay,
        legacyCreation: legacyCreation,
        openCharacterCreationAfterIntro: openCharacterCreationAfterIntro,
        recalcCharacterStatsFromIE: recalcCharacterStatsFromIE,
        updateRoleNameFromCharacter: updateRoleNameFromCharacter
    };
})(window);

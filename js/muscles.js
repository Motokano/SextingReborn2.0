(function (global) {
    /**
     * 肌肉系统（替代穴位系统，见 34-muscle-system-rework.md）。
     *
     * 结构：22 肌群（6 中轴 + 16 侧），共 478 条肌肉。
     * 双面成长：
     *  - 解锁肌肉 → 永久数值与百分比奖励，走 CharacterAttributes 统一重算；眼耳单块奖励后天专注百分比。
     *  - 对应部位全部肌群点亮 → 开放该部位的动力链槽，共七槽，见 34 §13.28。
     *  - 胸、背、腹、盆底会阴四群全部点亮 → 先天五维各 +2。
     *  - 头部全部点亮 → 先天专注、先天呼吸各 +1，与核心奖励叠加。
     *  - 全部肌肉点亮 → 先天五维再各 +1，与以上奖励叠加。
     *  - 左右手／脚每块点亮 → 对应手臂／腿技能伤害 +1%，各侧独立累计。
     *  - 左右手／脚分别全通 → 对应手臂／腿出招速度 +5。
     *  - 左右前臂／小腿每块点亮 → 同侧出招速度 +0.5%，各群全通 → 后天身手 +6%。
     *
     * 动力链：原「后遗症」迁入，装配在已全通身体部位的槽上；
     * 数据表随 data/muscles.json 的 passives 段加载，效果层仍走 data/post-effects.json（post_effect_id 引用）。
     */

    var groups = [];
    var groupById = {};
    var musclesByGroup = {};
    var muscleById = {};
    var flatDestroyEffectsByPart = {};
    var fullCatalogLoaded = false;
    var unlocked = {};
    var progress = {};
    var passives = [];
    var passiveById = {};
    /** 动力链装配表：slotId → passiveId。旧肌群装配单独保留，冲突不擅自选取。 */
    var equipped = {};
    var legacyEquipped = {};
    var pendingSlotMigration = false;
    var CHAIN_SLOTS = [
        { id: 'head', name: '头', groups: ['head', 'neck'] },
        { id: 'chest', name: '胸', groups: ['chest', 'back'] },
        { id: 'abdomen', name: '腹', groups: ['abdomen', 'pelvis'] },
        { id: 'lhand', name: '左手', groups: ['shoulder_l', 'upperarm_l', 'forearm_l', 'hand_l'] },
        { id: 'rhand', name: '右手', groups: ['shoulder_r', 'upperarm_r', 'forearm_r', 'hand_r'] },
        { id: 'lfoot', name: '左脚', groups: ['hip_l', 'thigh_l', 'calf_l', 'foot_l'] },
        { id: 'rfoot', name: '右脚', groups: ['hip_r', 'thigh_r', 'calf_r', 'foot_r'] }
    ];
    function chainSlot(id) { return CHAIN_SLOTS.find(function (s) { return s.id === id; }) || null; }
    function chainSlotForGroup(id) { return CHAIN_SLOTS.find(function (s) { return s.groups.indexOf(id) >= 0; }) || null; }
    function resolveChainSlot(id) { return chainSlot(id) || chainSlotForGroup(id); }
    function isChainSlotUnlocked(id) {
        var slot = chainSlot(id);
        return !!(fullCatalogLoaded && slot && slot.groups.every(isGroupComplete));
    }
    function chainSlotView(slot) {
        var list = slot.groups.flatMap(function (id) { return musclesByGroup[id] || []; });
        return { id: slot.id, name: slot.name, groups: slot.groups.slice(), total: list.length,
            count: list.filter(function (m) { return !!unlocked[m.id]; }).length, unlocked: isChainSlotUnlocked(slot.id) };
    }
    function allowedSlots(p) {
        return p && Array.isArray(p.allowed_slots) ? p.allowed_slots.filter(function (id) { return !!chainSlot(id); }) : [];
    }
    function migrateLegacySlots() {
        if (!pendingSlotMigration || !fullCatalogLoaded) return;
        equipped = {};
        CHAIN_SLOTS.forEach(function (slot) {
            var candidates = Array.from(new Set([slot.id].concat(slot.groups).map(function (id) { return legacyEquipped[id]; })
                .filter(function (id) { return allowedSlots(passiveById[id]).indexOf(slot.id) >= 0; })));
            if (candidates.length === 1) equipped[slot.id] = candidates[0];
        });
        pendingSlotMigration = false;
    }
    /** 所有消费者共用有效装配，未全通、非法槽及重复记录不能产生效果。 */
    function activeEquippedMap() {
        migrateLegacySlots();
        var out = {}, seen = {};
        CHAIN_SLOTS.forEach(function (slot) {
            var pid = equipped[slot.id], p = passiveById[pid], allowed = allowedSlots(p);
            if (!p || seen[pid] || !isChainSlotUnlocked(slot.id) || allowed.indexOf(slot.id) < 0) return;
            var cost = Math.max(1, parseInt(p.slots_cost, 10) || 1);
            var occupied = CHAIN_SLOTS.filter(function (s) { return equipped[s.id] === pid; }).map(function (s) { return s.id; });
            if (cost > 1 && (allowed.length !== cost || occupied.length !== cost || !allowed.every(function (id) { return equipped[id] === pid && isChainSlotUnlocked(id); }))) return;
            seen[pid] = true;
            (cost === 1 ? [slot.id] : allowed).forEach(function (id) { out[id] = pid; });
        });
        return out;
    }

    var CORE_GROUP_IDS = ['chest', 'back', 'abdomen', 'pelvis'];
    var CORE_COMPLETION_INNATE_BONUS = 2;
    var HEAD_COMPLETION_INNATE_BONUS = { focus: 1, breath: 1 };
    var ALL_COMPLETION_INNATE_BONUS = 1;
    // 隐藏奖励独立于可见 effects / getStatBonus，避免进入详情、总览和点亮日志。
    var HIDDEN_SEXUAL_ABILITY_PER_MUSCLE = { abdomen: 2, upperarm_l: 1, upperarm_r: 1, thigh_l: 1, thigh_r: 1 };
    var GROUP_COMPLETION_EFFECTS = {
        neck: [{ type: 'stunGainReductionPercent', delta: 20 }],
        back: [
            { type: 'acquiredAttributePercent', attribute: 'jingu', delta: 10 },
            { type: 'acquiredAttributePercent', attribute: 'flexibility', delta: 10 },
            { type: 'acquiredAttributePercent', attribute: 'breath', delta: 10 },
            { type: 'acquiredAttributePercent', attribute: 'dexterity', delta: 10 }
        ],
        chest: [{ type: 'limbDestroyMaxPercent', limb: 'chest', delta: 10 }],
        abdomen: [{ type: 'foodBuffDurationTicks', delta: 1 }, { type: 'limbDestroyMaxPercent', limb: 'abdomen', delta: 10 }],
        pelvis: [{ type: 'diqiCapPercent', delta: 20 }],
        shoulder_l: [{ type: 'carryCapacityKg', delta: 5 }],
        shoulder_r: [{ type: 'carryCapacityKg', delta: 5 }],
        hand_l: [{ type: 'limbAttackSpeedFlat', limb: 'lhand', delta: 5 }],
        hand_r: [{ type: 'limbAttackSpeedFlat', limb: 'rhand', delta: 5 }],
        foot_l: [{ type: 'limbAttackSpeedFlat', limb: 'lfoot', delta: 5 }],
        foot_r: [{ type: 'limbAttackSpeedFlat', limb: 'rfoot', delta: 5 }],
        forearm_l: [{ type: 'acquiredAttributePercent', attribute: 'dexterity', delta: 6 }],
        forearm_r: [{ type: 'acquiredAttributePercent', attribute: 'dexterity', delta: 6 }],
        upperarm_l: [{ type: 'limbDestroyMaxPercent', limb: 'lhand', delta: 10 }],
        upperarm_r: [{ type: 'limbDestroyMaxPercent', limb: 'rhand', delta: 10 }],
        calf_l: [{ type: 'acquiredAttributePercent', attribute: 'dexterity', delta: 6 }],
        calf_r: [{ type: 'acquiredAttributePercent', attribute: 'dexterity', delta: 6 }],
        thigh_l: [{ type: 'limbDestroyMaxPercent', limb: 'lfoot', delta: 10 }],
        thigh_r: [{ type: 'limbDestroyMaxPercent', limb: 'rfoot', delta: 10 }],
        hip_l: [{ type: 'acquiredAttributePercent', attribute: 'flexibility', delta: 6 }],
        hip_r: [{ type: 'acquiredAttributePercent', attribute: 'flexibility', delta: 6 }]
    };

    // One consumed food item gives the same slow growth, regardless of food type.
    var FOOD_GROWTH_PER_PORTION = 0.001;
    var FOOD_GROWTH_TARGETS = [
        'masseter', 'temporalis', 'medial_pterygoid', 'lateral_pterygoid',
        'genioglossus', 'hyoglossus', 'styloglossus',
        'tensor_veli_palatini', 'levator_veli_palatini', 'palatoglossus', 'palatopharyngeus',
        'superior_pharyngeal_constrictor', 'middle_pharyngeal_constrictor', 'inferior_pharyngeal_constrictor',
        'stylopharyngeus', 'salpingopharyngeus', 'buccinator', 'orbicularis_oris'
    ].flatMap(function (name) { return ['head_' + name + '_L', 'head_' + name + '_R']; }).concat([
        'head_musculus_uvulae', 'head_superior_longitudinal_lingual', 'head_inferior_longitudinal_lingual',
        'head_transverse_lingual', 'head_vertical_lingual'
    ]);

    /** 招式形态标签（required_limb_tags）→ 调用肌群（34 §4 映射表；中间态侧向近似口径，阶段四用 form.muscle_groups 严格化） */
    var FORM_GROUP_MAP = {
        '挥拳': { sides: ['shoulder', 'upperarm', 'forearm', 'hand'], axial: ['chest', 'abdomen'] },
        '踢击': { sides: ['hip', 'thigh', 'calf', 'foot'], axial: ['abdomen'] },
        '掌击': { sides: ['hand', 'forearm'], axial: ['chest'] },
        '推': { sides: ['hand', 'forearm'], axial: ['chest'] },
        '擒拿': { bilateral: ['hand', 'forearm'], axial: ['back', 'abdomen'] },
        '锁': { bilateral: ['hand', 'forearm'], axial: ['back', 'abdomen'] },
        '头槌': { axial: ['head', 'neck'] },
        '投': { bilateral: ['shoulder'], axial: ['back', 'hip', 'abdomen'] },
        '摔': { bilateral: ['shoulder'], axial: ['back', 'hip', 'abdomen'] }
    };
    var LIMB_SIDE = { lhand: 'L', rhand: 'R', lfoot: 'L', rfoot: 'R' };

    /** 该击（出招肢体 + 形态标签）是否调用指定肌群（34 §3.4 生效边界：侧肌群=单侧、中轴=左右同生效） */
    function attackInvokesGroup(grp, limbId, formTags) {
        if (!grp) return false;
        if (!Array.isArray(formTags) || !formTags.length) return true; // 无法分类时保守不过滤
        var limbSide = LIMB_SIDE[limbId] || '';
        for (var i = 0; i < formTags.length; i++) {
            var entry = FORM_GROUP_MAP[String(formTags[i])];
            if (!entry) continue;
            if (grp.type === 'axial') {
                if (Array.isArray(entry.axial) && entry.axial.indexOf(grp.id) >= 0) return true;
            } else {
                var base = grp.base || grp.id;
                if (Array.isArray(entry.bilateral) && entry.bilateral.indexOf(base) >= 0) return true;
                if (limbSide && grp.side === limbSide && Array.isArray(entry.sides) && entry.sides.indexOf(base) >= 0) return true;
            }
        }
        return false;
    }

    // 内置示例数据（JSON 加载失败时作为退路）
    var fallbackGroups = [
        { id: 'chest', name: '胸', icon: '🫁', type: 'axial', limb: null },
        { id: 'hand_l', name: '左手', icon: '✋', type: 'side', side: 'L', limb: 'lhand' },
        { id: 'hand_r', name: '右手', icon: '✋', type: 'side', side: 'R', limb: 'rhand' },
        { id: 'thigh_l', name: '左大腿', icon: '🍗', type: 'side', side: 'L', limb: 'lfoot' },
        { id: 'thigh_r', name: '右大腿', icon: '🍗', type: 'side', side: 'R', limb: 'rfoot' }
    ];
    var fallbackMuscles = [
        { id: 'chest_pectoral_major', name: '胸大肌', group: 'chest', effects: [{ type: 'jingu', delta: 2 }], unlock_cost: 1 },
        { id: 'chest_diaphragm', name: '膈肌', group: 'chest', effects: [{ type: 'maxQi', delta: 10 }], unlock_cost: 1 },
        { id: 'hand_l_opponens_pollicis', name: '左拇对掌肌', group: 'hand_l', effects: [{ type: 'dexterity', delta: 1 }], unlock_cost: 1 },
        { id: 'hand_r_opponens_pollicis', name: '右拇对掌肌', group: 'hand_r', effects: [{ type: 'dexterity', delta: 1 }], unlock_cost: 1 },
        { id: 'thigh_l_quadriceps', name: '左股四头肌', group: 'thigh_l', effects: [{ type: 'jingu', delta: 2 }], unlock_cost: 1 },
        { id: 'thigh_r_quadriceps', name: '右股四头肌', group: 'thigh_r', effects: [{ type: 'jingu', delta: 2 }], unlock_cost: 1 }
    ];
    var fallbackPassives = [
        {
            id: 'post_no_second_thought',
            name_key: 'posteffect.no_second_thought.name',
            desc_key: 'posteffect.no_second_thought.desc',
            allowed_groups: ['hand_l', 'hand_r', 'upperarm_l', 'upperarm_r', 'shoulder_l', 'shoulder_r', 'forearm_l', 'forearm_r'],
            allowed_slots: ['lhand', 'rhand'],
            slots_cost: 1,
            post_effect_id: 'post_no_second_thought'
        },
        {
            id: 'post_po_xiang',
            name_key: 'posteffect.po_xiang.name',
            desc_key: 'posteffect.po_xiang.desc',
            allowed_groups: ['hand_l', 'hand_r', 'upperarm_l', 'upperarm_r', 'shoulder_l', 'shoulder_r', 'forearm_l', 'forearm_r'],
            allowed_slots: ['lhand', 'rhand'],
            slots_cost: 1,
            post_effect_id: 'post_po_xiang'
        }
    ];

    function indexGroups(list) {
        groups = Array.isArray(list) ? list.slice() : [];
        groupById = {};
        groups.forEach(function (g) {
            if (!g || !g.id) return;
            var rec = g;
            if (g.type === 'side') {
                rec.base = String(g.id).replace(/_(l|r)$/, '');
            } else {
                rec.base = g.id;
            }
            groupById[g.id] = rec;
        });
    }

    function indexPassives(list) {
        passives = Array.isArray(list) ? list.slice() : [];
        passiveById = {};
        passives.forEach(function (p) {
            if (p && p.id) passiveById[p.id] = p;
        });
    }

    function useFallbackData() {
        fullCatalogLoaded = false;
        flatDestroyEffectsByPart = {};
        indexGroups(fallbackGroups);
        musclesByGroup = {};
        muscleById = {};
        fallbackMuscles.forEach(function (m) {
            musclesByGroup[m.group] = musclesByGroup[m.group] || [];
            musclesByGroup[m.group].push(m);
            muscleById[m.id] = m;
        });
        indexPassives(fallbackPassives);
    }

    /** 数据就绪后若有已恢复的解锁/装配记录，通知上层重算属性/重渲染 */
    function notifyDataReadyIfNeeded() {
        if (typeof document === 'undefined') return;
        if (Object.keys(unlocked).length === 0 && Object.keys(equipped).length === 0) return;
        try {
            document.dispatchEvent(new CustomEvent('muscles:data-loaded'));
        } catch (e) { /* ignore */ }
    }

    function loadFromJson() {
        if (!global.fetch) {
            useFallbackData();
            return;
        }
        return fetch('data/muscles.json', { cache: 'no-cache' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('failed to load');
                return resp.json();
            })
            .then(function (data) {
                if (!data || !Array.isArray(data.groups) || !Array.isArray(data.muscles)) throw new Error('bad shape');
                indexGroups(data.groups);
                musclesByGroup = {};
                muscleById = {};
                flatDestroyEffectsByPart = {};
                data.muscles.forEach(function (m) {
                    if (!m || !m.id || !m.group) return;
                    musclesByGroup[m.group] = musclesByGroup[m.group] || [];
                    musclesByGroup[m.group].push(m);
                    muscleById[m.id] = m;
                    (m.effects || []).forEach(function (e) {
                        if (e.type !== 'limbDestroyMaxFlat' || !e.limb) return;
                        var list = flatDestroyEffectsByPart[e.limb] || (flatDestroyEffectsByPart[e.limb] = []);
                        list.push({ id: m.id, delta: Number(e.delta) || 0 });
                    });
                });
                indexPassives(data.passives);
                fullCatalogLoaded = true;
                migrateLegacySlots();
                notifyDataReadyIfNeeded();
            })
            .catch(function () {
                useFallbackData();
                notifyDataReadyIfNeeded();
            });
    }

    var ready = loadFromJson();

    /** 按当前点亮记录重算后天奖励及整群完成的先天奖励，不写入角色基础先天值。 */
    function computeStatBonus() {
        var bonus = {
            maxQi: 0,
            diqiCapPercent: 0,
            foodExpPercent: 0,
            foodBuffDurationTicks: 0,
            carryCapacityKg: 0,
            parryChancePercent: 0,
            headDamageReductionPercent: 0,
            stunGainReductionPercent: 0,
            acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
            innate: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
            skillDamagePercent: { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            attackSpeedFlat: { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            attackSpeedPercent: { lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            destroyMaxPercent: { chest: 0, abdomen: 0, lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            destroyMaxFlat: { head: 0, chest: 0, abdomen: 0, lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 },
            acquiredPercent: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 }
        };
        Object.keys(unlocked).forEach(function (id) {
            var m = muscleById[id];
            if (!m || !Array.isArray(m.effects)) return;
            m.effects.forEach(function (e) {
                if (!e || !e.type) return;
                var d = Number(e.delta) || 0;
                if (e.type === 'maxQi') {
                    bonus.maxQi += d;
                } else if (e.type === 'parryChancePercent') {
                    bonus.parryChancePercent += d;
                } else if (e.type === 'headDamageReductionPercent') {
                    bonus.headDamageReductionPercent += d;
                } else if (e.type === 'foodExpPercent') {
                    bonus.foodExpPercent += d;
                } else if (e.type === 'limbSkillDamagePercent' && Object.prototype.hasOwnProperty.call(bonus.skillDamagePercent, e.limb)) {
                    bonus.skillDamagePercent[e.limb] += d;
                } else if (e.type === 'limbAttackSpeedPercent' && Object.prototype.hasOwnProperty.call(bonus.attackSpeedPercent, e.limb)) {
                    bonus.attackSpeedPercent[e.limb] += d;
                } else if (e.type === 'limbDestroyMaxFlat' && Object.prototype.hasOwnProperty.call(bonus.destroyMaxFlat, e.limb)) {
                    bonus.destroyMaxFlat[e.limb] += d;
                } else if (e.type === 'acquiredAttributePercent' && Object.prototype.hasOwnProperty.call(bonus.acquiredPercent, e.attribute)) {
                    bonus.acquiredPercent[e.attribute] += d;
                } else if (bonus.acquired[e.type] !== undefined) {
                    bonus.acquired[e.type] += d;
                }
            });
        });
        if (CORE_GROUP_IDS.every(isGroupComplete)) {
            Object.keys(bonus.innate).forEach(function (id) {
                bonus.innate[id] = CORE_COMPLETION_INNATE_BONUS;
            });
        }
        if (isGroupComplete('head')) {
            Object.keys(HEAD_COMPLETION_INNATE_BONUS).forEach(function (id) {
                bonus.innate[id] += HEAD_COMPLETION_INNATE_BONUS[id];
            });
        }
        // 必须核对正式目录中的每一条；空目录、退路示例或未知解锁记录不能凑全通。
        var muscleIds = Object.keys(muscleById);
        if (fullCatalogLoaded && muscleIds.length && muscleIds.every(function (id) { return !!unlocked[id]; })) {
            Object.keys(bonus.innate).forEach(function (id) {
                bonus.innate[id] += ALL_COMPLETION_INNATE_BONUS;
            });
        }
        Object.keys(GROUP_COMPLETION_EFFECTS).forEach(function (groupId) {
            if (!isGroupComplete(groupId)) return;
            GROUP_COMPLETION_EFFECTS[groupId].forEach(function (e) {
                if (e.type === 'limbAttackSpeedFlat') bonus.attackSpeedFlat[e.limb] += e.delta;
                if (e.type === 'limbDestroyMaxPercent') bonus.destroyMaxPercent[e.limb] += e.delta;
                if (e.type === 'acquiredAttributePercent') bonus.acquiredPercent[e.attribute] += e.delta;
                if (e.type === 'carryCapacityKg') bonus.carryCapacityKg += e.delta;
                if (e.type === 'diqiCapPercent') bonus.diqiCapPercent += e.delta;
                if (e.type === 'foodBuffDurationTicks') bonus.foodBuffDurationTicks += e.delta;
                if (e.type === 'stunGainReductionPercent') bonus.stunGainReductionPercent += e.delta;
            });
        });
        bonus.parryChancePercent = Math.round(bonus.parryChancePercent * 1e9) / 1e9;
        bonus.headDamageReductionPercent = Math.round(bonus.headDamageReductionPercent * 1e9) / 1e9;
        return bonus;
    }

    function getSexualAbilityBonus() {
        if (!fullCatalogLoaded) return 0;
        return Object.keys(unlocked).reduce(function (sum, id) {
            var muscle = muscleById[id];
            return sum + (muscle ? HIDDEN_SEXUAL_ABILITY_PER_MUSCLE[muscle.group] || 0 : 0);
        }, 0);
    }

    /** 身体条高频查询：只核对对应部位的损毁上限奖励，不重算全部属性。 */
    function getDestroyMaxFlatForLimb(limbId) {
        return (flatDestroyEffectsByPart[limbId] || []).reduce(function (sum, e) {
            return sum + (unlocked[e.id] ? e.delta : 0);
        }, 0);
    }

    function getDestroyMaxPercentForLimb(limbId) {
        var bonus = 0;
        Object.keys(GROUP_COMPLETION_EFFECTS).forEach(function (groupId) {
            GROUP_COMPLETION_EFFECTS[groupId].forEach(function (e) {
                if (e.type === 'limbDestroyMaxPercent' && e.limb === limbId && isGroupComplete(groupId)) bonus += e.delta;
            });
        });
        return bonus;
    }

    /** 底气容器重算只读取全通乘区，不把派生倍率保存成新的基础值。 */
    function getDiqiCapMultiplier() {
        var percent = 0;
        Object.keys(GROUP_COMPLETION_EFFECTS).forEach(function (groupId) {
            GROUP_COMPLETION_EFFECTS[groupId].forEach(function (e) {
                if (e.type === 'diqiCapPercent' && isGroupComplete(groupId)) percent += e.delta;
            });
        });
        return 1 + percent / 100;
    }

    /** 肌群是否已全通（该群全部肌肉已解锁） */
    function isGroupComplete(groupId) {
        var list = musclesByGroup[groupId] || [];
        if (!list.length) return false;
        for (var i = 0; i < list.length; i++) {
            if (!unlocked[list[i].id]) return false;
        }
        return true;
    }

    /** 已全通肌群；整群数值奖励与七部位动力链槽分别计算。 */
    function getCompletedGroups() {
        return groups
            .map(function (g) { return g.id; })
            .filter(function (gid) { return isGroupComplete(gid); });
    }

    /** 单条奖励的名称、数值与单位供所有肌肉界面共用。 */
    function getEffectDisplay(e) {
        e = e || {};
        var LABELS = {
            maxQi: '底气上限',
            jingu: '后天筋骨',
            flexibility: '后天柔韧',
            breath: '后天呼吸',
            dexterity: '后天身手',
            focus: '后天专注'
        };
        var limbs = { lhand: '左臂', rhand: '右臂', lfoot: '左腿', rfoot: '右腿' };
        var destroyParts = Object.assign({ head: '头部', chest: '胸部', abdomen: '腹部' }, limbs);
        if (e.type === 'headDamageReductionPercent') {
            return { name: '头部独立卸力率', value: Number(e.delta) || 0, unit: '%' };
        }
        if (e.type === 'stunGainReductionPercent') {
            return { name: '眩晕条增长', value: -(Number(e.delta) || 0), unit: '%' };
        }
        if (e.type === 'foodExpPercent') {
            return { name: '食物经验奖励', value: Number(e.delta) || 0, unit: '%' };
        }
        if (e.type === 'foodBuffDurationTicks') {
            return { name: '食物Buff时间', value: Number(e.delta) || 0, unit: 'tick' };
        }
        if (e.type === 'diqiCapPercent') {
            return { name: '底气上限', value: Number(e.delta) || 0, unit: '%' };
        }
        if (e.type === 'carryCapacityKg') {
            return { name: '负重上限', value: Number(e.delta) || 0, unit: 'kg' };
        }
        if ((e.type === 'limbDestroyMaxPercent' || e.type === 'limbDestroyMaxFlat') && destroyParts[e.limb]) {
            return { name: destroyParts[e.limb] + '损毁上限', value: Number(e.delta) || 0, unit: e.type === 'limbDestroyMaxPercent' ? '%' : '' };
        }
        if (e.type === 'parryChancePercent') {
            return { name: '全局招架率', value: Number(e.delta) || 0, unit: '%' };
        }
        if (e.type === 'limbSkillDamagePercent' && limbs[e.limb]) {
            return { name: limbs[e.limb] + '技能伤害', value: Number(e.delta) || 0, unit: '%' };
        }
        if ((e.type === 'limbAttackSpeedFlat' || e.type === 'limbAttackSpeedPercent') && limbs[e.limb]) {
            return { name: limbs[e.limb] + '出招速度', value: Number(e.delta) || 0, unit: e.type === 'limbAttackSpeedPercent' ? '%' : '' };
        }
        if (e.type === 'acquiredAttributePercent' && LABELS[e.attribute]) {
            return { name: LABELS[e.attribute], value: Number(e.delta) || 0, unit: '%' };
        }
        return { name: LABELS[e.type] || '', value: Number(e.delta) || 0, unit: '' };
    }

    /** 效果数组 → 展示文本（"底气上限+5，左腿技能伤害+1%"）。 */
    function effectsToText(effects) {
        return (Array.isArray(effects) ? effects : []).map(getEffectDisplay)
            .filter(function (e) { return e.name && e.value; })
            .map(function (e) { return e.name + (e.value > 0 ? '+' : '') + e.value + e.unit; }).join('，');
    }

    /** 动力链装配校验：完整部位已点亮、一槽一个、同一动力链全局唯一。 */
    function canEquipPassive(passiveId, slotId) {
        var p = passiveById[passiveId], slot = resolveChainSlot(slotId);
        if (!p) return { ok: false, reason: 'unknown_passive' };
        if (!slot) return { ok: false, reason: 'unknown_slot' };
        var allowed = allowedSlots(p), map = activeEquippedMap();
        if (allowed.indexOf(slot.id) < 0) return { ok: false, reason: 'slot_not_allowed' };
        var cost = Math.max(1, parseInt(p.slots_cost, 10) || 1);
        if (cost > 1 && allowed.length !== cost) return { ok: false, reason: 'bad_cost' };
        var need = cost === 1 ? [slot.id] : allowed;
        if (!need.every(isChainSlotUnlocked)) return { ok: false, reason: 'slot_not_complete' };
        if (need.some(function (id) { return !!map[id]; })) return { ok: false, reason: 'slot_occupied' };
        if (Object.keys(map).some(function (id) { return map[id] === passiveId; })) return { ok: false, reason: 'already_equipped' };
        return { ok: true, reason: null };
    }

    /** 按有效动力链装配收集效果，仍保留原招式形态与 valid_* 的二次校验。 */
    function collectEquippedPostEffectIds(shouldInclude) {
        var out = [], seen = {}, map = activeEquippedMap();
        Object.keys(map).forEach(function (id) {
            var pid = map[id], p = passiveById[pid];
            if (seen[pid] || (shouldInclude && !shouldInclude(id, p))) return;
            seen[pid] = true;
            var eid = p.post_effect_id ? String(p.post_effect_id) : pid;
            if (out.indexOf(eid) < 0) out.push(eid);
        });
        return out;
    }

    var Muscles = {
        ready: ready,
        getGroups: function () { return groups.slice(); },
        getMusclesByGroup: function (groupId) { return (musclesByGroup[groupId] || []).slice(); },
        getMuscleById: function (id) { return muscleById[id] || null; },
        isUnlocked: function (muscleId) { return !!unlocked[muscleId]; },
        /** 解锁肌肉；返回 { ok, reason }；实际资源扣除与属性重算由调用方负责 */
        unlock: function (muscleId) {
            if (!muscleId) return { ok: false, reason: 'no_id' };
            if (!muscleById[muscleId]) return { ok: false, reason: 'unknown_muscle' };
            if (unlocked[muscleId]) return { ok: false, reason: 'already_unlocked' };
            unlocked[muscleId] = true;
            return { ok: true, reason: null };
        },
        getProgress: function(id) { return unlocked[id] ? 100 : progress[id] || 0; },
        addGrowth: function(id, amount) {
            if(!muscleById[id] || !Number.isFinite(amount) || amount < 0) throw Error('Invalid muscle growth');
            var before=Muscles.getProgress(id),after=Math.min(100,Math.round((before+amount)*1000000)/1000000);
            progress[id]=after;var lit=before<100&&after===100&&Muscles.unlock(id).ok;
            return {id:id,before:before,after:after,gain:after-before,lit:lit};
        },
        getFoodGrowthRewards: function () {
            return FOOD_GROWTH_TARGETS.filter(function (id) { return !!muscleById[id]; })
                .map(function (id) { return { id: id, pct: FOOD_GROWTH_PER_PORTION }; });
        },
        addFoodGrowth: function () {
            return Muscles.getFoodGrowthRewards().map(function (r) { return Muscles.addGrowth(r.id, r.pct); });
        },
        getUnlockedIds: function () { return Object.keys(unlocked); },
        getStatBonus: function () { return computeStatBonus(); },
        getHeadDamageMultiplier: function () { return Math.max(0, 1 - computeStatBonus().headDamageReductionPercent / 100); },
        getStunGainMultiplier: function () { return Math.max(0, 1 - computeStatBonus().stunGainReductionPercent / 100); },
        getFoodExperienceMultiplier: function () { return 1 + computeStatBonus().foodExpPercent / 100; },
        getFoodBuffDurationBonus: function () { return computeStatBonus().foodBuffDurationTicks; },
        getSexualAbilityBonus: getSexualAbilityBonus,
        getDiqiCapMultiplier: getDiqiCapMultiplier,
        getDestroyMaxPercentForLimb: getDestroyMaxPercentForLimb,
        getDestroyMaxFlatForLimb: getDestroyMaxFlatForLimb,
        getParryChanceBonus: function () {
            return computeStatBonus().parryChancePercent / 100;
        },
        getSkillDamageBonusForLimb: function (limbId) {
            return (computeStatBonus().skillDamagePercent[limbId] || 0) / 100;
        },
        getAttackSpeedBonusForLimb: function (limbId) {
            return computeStatBonus().attackSpeedFlat[limbId] || 0;
        },
        getAttackSpeedPercentForLimb: function (limbId) {
            return computeStatBonus().attackSpeedPercent[limbId] || 0;
        },
        getGroupCompletionEffects: function (groupId) {
            return (GROUP_COMPLETION_EFFECTS[groupId] || []).map(function (e) { return Object.assign({}, e); });
        },
        getEffectDisplay: getEffectDisplay,
        /** 存档快照：解锁记录 + 七部位动力链装配（数据表由 data/muscles.json 提供，不入档） */
        getState: function () {
            migrateLegacySlots();
            return { unlocked: Object.assign({},unlocked), equipped: Object.assign({},equipped), progress: Object.assign({},progress),
                chain_slots_version: pendingSlotMigration ? 0 : 1, legacy_equipped: Object.assign({},legacyEquipped) };
        },
        /** 从存档恢复解锁/装配记录；数据表可能尚未加载完成，效果由下一次重算 / muscles:data-loaded 事件收敛 */
        setState: function (state) {
            if (!state || typeof state !== 'object') return;
            var nextUnlocked = {};
            var src = state.unlocked;
            if (src && typeof src === 'object') {
                Object.keys(src).forEach(function (id) {
                    if (src[id] === true || src[id] === 1 || src[id] === '1') nextUnlocked[id] = true;
                });
            } else if (Array.isArray(src)) {
                src.forEach(function (id) {
                    if (id) nextUnlocked[String(id)] = true;
                });
            }
            unlocked = nextUnlocked;
            progress={};
            Object.keys(state.progress||{}).forEach(function(id){var n=state.progress[id];if(Number.isFinite(n)&&n>=0)progress[id]=Math.min(100,n);});
            function readMap(src) {
                var out = {};
                if (src && typeof src === 'object') Object.keys(src).forEach(function (id) { if (typeof src[id] === 'string' && src[id]) out[id] = src[id]; });
                return out;
            }
            legacyEquipped = readMap(state.legacy_equipped);
            pendingSlotMigration = state.chain_slots_version !== 1;
            if (pendingSlotMigration) {
                legacyEquipped = Object.assign(legacyEquipped, readMap(state.equipped));
                equipped = {};
                migrateLegacySlots();
            } else equipped = readMap(state.equipped);
        },
        isGroupComplete: isGroupComplete,
        getCompletedGroups: getCompletedGroups,
        getChainSlots: function () { return CHAIN_SLOTS.map(chainSlotView); },
        getChainSlot: function (id) { var slot = chainSlot(id); return slot ? chainSlotView(slot) : null; },
        getChainSlotForGroup: function (id) { var slot = chainSlotForGroup(id); return slot ? chainSlotView(slot) : null; },
        isChainSlotUnlocked: isChainSlotUnlocked,
        getPassiveSlots: function () {
            var slots = {};
            CHAIN_SLOTS.forEach(function (slot) { if (isChainSlotUnlocked(slot.id)) slots[slot.id] = 1; });
            return slots;
        },
        getPassives: function () { return passives.slice(); },
        getPassiveById: function (id) { return passiveById[id] || null; },
        getEquippedMap: activeEquippedMap,
        getEquippedPassiveForSlot: function (id) { return activeEquippedMap()[id] || null; },
        // 兼容旧调用；同一部位的多个肌群读取同一个槽，不能绕过完整部位门槛。
        getEquippedPassiveForGroup: function (id) { var slot = resolveChainSlot(id); return slot ? activeEquippedMap()[slot.id] || null : null; },
        getEquippedPassiveIds: function () { return Array.from(new Set(Object.values(activeEquippedMap()))); },
        getEquippedPostEffectIds: function () { return collectEquippedPostEffectIds(null); },
        /**
         * 本击生效的动力链效果层 id（34 §13.28：沿用原招式形态调用范围）。
         * 中间态近似：attackInfo = { limbId, formTags }（formTags = 招式 required_limb_tags）。
         * 按部位内允许肌群匹配；原双侧形态保持双侧，无法分类（无标签）时沿旧规则不过滤。
         */
        getEquippedPostEffectIdsForAttack: function (attackInfo) {
            if (!attackInfo || typeof attackInfo !== 'object') return collectEquippedPostEffectIds(null);
            var limbId = attackInfo.limbId != null ? String(attackInfo.limbId) : '';
            var tags = Array.isArray(attackInfo.formTags) ? attackInfo.formTags : [];
            if (!limbId && !tags.length) return collectEquippedPostEffectIds(null);
            return collectEquippedPostEffectIds(function (slotId, p) {
                return chainSlot(slotId).groups.some(function (gid) {
                    return (!Array.isArray(p.allowed_groups) || p.allowed_groups.indexOf(gid) >= 0)
                        && attackInvokesGroup(groupById[gid], limbId, tags);
                });
            });
        },
        canEquipPassive: canEquipPassive,
        /** 正式界面保存成功后才完成装卸；独立试玩没有 SaveSystem，沿内存装配。 */
        setChainPassive: function (slotId, passiveId) {
            var slot = chainSlot(slotId), current = activeEquippedMap()[slotId];
            if (!slot || !isChainSlotUnlocked(slotId)) return { ok: false, reason: 'slot_not_complete' };
            var check = passiveId ? canEquipPassive(passiveId, slotId) : { ok: !!current, reason: 'not_equipped' };
            if (!check.ok) return check;
            var operation = function () { return passiveId ? Muscles.equipPassive(passiveId, slotId) : Muscles.unequipPassive(current); };
            if (!global.SaveSystem || typeof global.SaveSystem.runAtomic !== 'function') return operation();
            var result = global.SaveSystem.runAtomic(operation, { trigger: 'muscles.chain', required: true });
            return result.saved ? result.value : { ok: false, reason: 'save_failed' };
        },
        /** 装配到七个部位槽之一。覆盖旧失效记录，防止日后意外恢复同一动力链。 */
        equipPassive: function (passiveId, slotId) {
            var check = canEquipPassive(passiveId, slotId);
            if (!check.ok) return check;
            var p = passiveById[passiveId], slot = resolveChainSlot(slotId);
            Object.keys(equipped).forEach(function (id) { if (equipped[id] === passiveId) delete equipped[id]; });
            var cost = Math.max(1, parseInt(p.slots_cost, 10) || 1);
            (cost === 1 ? [slot.id] : allowedSlots(p)).forEach(function (id) { equipped[id] = passiveId; });
            return { ok: true, reason: null };
        },
        /** 卸下动力链（全局唯一，任意槽卸下即移除全部占用） */
        unequipPassive: function (passiveId) {
            if (!passiveId) return { ok: false, reason: 'no_id' };
            var found = false;
            for (var g in equipped) {
                if (Object.prototype.hasOwnProperty.call(equipped, g) && equipped[g] === passiveId) {
                    delete equipped[g];
                    found = true;
                }
            }
            return found ? { ok: true, reason: null } : { ok: false, reason: 'not_equipped' };
        },

        // —— 面板展示形状 API（供 scene-app 肌肉分页直接使用）——
        /** 肌群列表 [{id,label,icon}]（label = 肌群名） */
        getCategories: function () {
            return groups.map(function (g) { return { id: g.id, label: g.name, icon: g.icon }; });
        },
        /** 某肌群肌肉列表 [{id,name,effectsText}]（effectsText 由 effects 生成） */
        getMuscleEntriesByGroup: function (groupId) {
            return (musclesByGroup[groupId] || []).map(function (m) {
                return { id: m.id, name: m.name, effectsText: effectsToText(m.effects) };
            });
        },
        /** 单块肌肉效果文本（供详情/日志） */
        getEffectsText: function (muscleId) {
            var m = muscleById[muscleId];
            return m ? effectsToText(m.effects) : '';
        }
    };

    global.Muscles = Muscles;
})(window);

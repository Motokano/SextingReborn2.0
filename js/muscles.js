(function (global) {
    /**
     * 肌肉系统（替代穴位系统，见 34-muscle-system-rework.md）。
     *
     * 结构：22 肌群（6 中轴 + 16 侧）× 肌肉条目（全量目标 639，当前骨架 ~110）。
     * 双面成长：
     *  - 解锁肌肉 → 永久数值（maxQi / 后天四维，走 CharacterAttributes 统一重算；肌肉不奖励专注）；
     *  - 解锁完整肌群 → 获得 1 个「大型被动容量」（肌群专属被动槽，装配规则见 34 §3）。
     *
     * 大型被动（34 §3，阶段三）：原「后遗症」迁入，装配在已全通肌群的槽上；
     * 数据表随 data/muscles.json 的 passives 段加载，效果层仍走 data/post-effects.json（post_effect_id 引用）。
     */

    var groups = [];
    var groupById = {};
    var musclesByGroup = {};
    var muscleById = {};
    var unlocked = {};
    var passives = [];
    var passiveById = {};
    /** 肌群槽装配表：groupId → passiveId（同肌群 1 槽，见 34 §2.4/§3.2） */
    var equipped = {};

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
            slots_cost: 1,
            post_effect_id: 'post_no_second_thought'
        },
        {
            id: 'post_po_xiang',
            name_key: 'posteffect.po_xiang.name',
            desc_key: 'posteffect.po_xiang.desc',
            allowed_groups: ['hand_l', 'hand_r', 'upperarm_l', 'upperarm_r', 'shoulder_l', 'shoulder_r', 'forearm_l', 'forearm_r'],
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
        fetch('data/muscles.json', { cache: 'no-cache' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('failed to load');
                return resp.json();
            })
            .then(function (data) {
                if (!data || !Array.isArray(data.groups) || !Array.isArray(data.muscles)) throw new Error('bad shape');
                indexGroups(data.groups);
                musclesByGroup = {};
                muscleById = {};
                data.muscles.forEach(function (m) {
                    if (!m || !m.id || !m.group) return;
                    musclesByGroup[m.group] = musclesByGroup[m.group] || [];
                    musclesByGroup[m.group].push(m);
                    muscleById[m.id] = m;
                });
                indexPassives(data.passives);
                notifyDataReadyIfNeeded();
            })
            .catch(function () {
                useFallbackData();
                notifyDataReadyIfNeeded();
            });
    }

    loadFromJson();

    /** 汇总已解锁肌肉的效果：{ maxQi, acquired: {jingu,flexibility,breath,dexterity,focus} }（focus 恒为 0，见 34 §2.3） */
    function computeStatBonus() {
        var bonus = {
            maxQi: 0,
            acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 }
        };
        Object.keys(unlocked).forEach(function (id) {
            var m = muscleById[id];
            if (!m || !Array.isArray(m.effects)) return;
            m.effects.forEach(function (e) {
                if (!e || !e.type) return;
                var d = Number(e.delta) || 0;
                if (e.type === 'maxQi') {
                    bonus.maxQi += d;
                } else if (bonus.acquired[e.type] !== undefined) {
                    bonus.acquired[e.type] += d;
                }
            });
        });
        return bonus;
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

    /** 已全通的肌群 id 列表（= 已获得的大型被动容量） */
    function getCompletedGroups() {
        return groups
            .map(function (g) { return g.id; })
            .filter(function (gid) { return isGroupComplete(gid); });
    }

    /** 效果数组 → 展示文本（"底气上限+5，后天筋骨+1"），供 UI 使用 */
    function effectsToText(effects) {
        if (!Array.isArray(effects) || !effects.length) return '';
        var LABELS = {
            maxQi: '底气上限',
            jingu: '后天筋骨',
            flexibility: '后天柔韧',
            breath: '后天呼吸',
            dexterity: '后天身手',
            focus: '后天专注'
        };
        var parts = [];
        effects.forEach(function (e) {
            if (!e || !e.type || !e.delta) return;
            var label = LABELS[e.type];
            if (!label) return;
            var d = Number(e.delta);
            parts.push(label + (d > 0 ? '+' : '') + d);
        });
        return parts.join('，');
    }

    /** 大型被动装配校验（34 §3.3）：槽存在（肌群已全通）、槽未被占、全局唯一 */
    function canEquipPassive(passiveId, groupId) {
        var p = passiveById[passiveId];
        if (!p) return { ok: false, reason: 'unknown_passive' };
        var cost = Math.max(1, parseInt(p.slots_cost, 10) || 1);
        if (cost === 1) {
            if (!groupId) return { ok: false, reason: 'no_group' };
            if (!Array.isArray(p.allowed_groups) || p.allowed_groups.indexOf(groupId) < 0) return { ok: false, reason: 'group_not_allowed' };
            if (!isGroupComplete(groupId)) return { ok: false, reason: 'group_not_complete' };
            if (equipped[groupId]) return { ok: false, reason: 'slot_occupied' };
        } else {
            // cost>1：同时占用 allowed 内全部肌群槽（排他）
            var need = Array.isArray(p.allowed_groups) ? p.allowed_groups.slice() : [];
            if (need.length < cost) return { ok: false, reason: 'bad_cost' };
            for (var ci = 0; ci < need.length; ci++) {
                if (!isGroupComplete(need[ci])) return { ok: false, reason: 'group_not_complete' };
                if (equipped[need[ci]]) return { ok: false, reason: 'slot_occupied' };
            }
        }
        // 全局唯一：同一被动全局只能装 1 份
        for (var g in equipped) {
            if (Object.prototype.hasOwnProperty.call(equipped, g) && equipped[g] === passiveId) return { ok: false, reason: 'already_equipped' };
        }
        return { ok: true, reason: null };
    }

    /** 收集已装配被动的效果层 id（dedupe）；可选按"本击是否调用装配肌群"过滤 */
    function collectEquippedPostEffectIds(shouldInclude) {
        var out = [];
        var seen = {};
        for (var g in equipped) {
            if (!Object.prototype.hasOwnProperty.call(equipped, g) || !equipped[g]) continue;
            var pid = equipped[g];
            if (seen[pid]) continue;
            var p = passiveById[pid];
            if (!p) continue;
            if (shouldInclude && !shouldInclude(g, p)) continue;
            seen[pid] = true;
            var eid = p.post_effect_id ? String(p.post_effect_id) : pid;
            if (out.indexOf(eid) < 0) out.push(eid);
        }
        return out;
    }

    var Muscles = {
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
        getUnlockedIds: function () { return Object.keys(unlocked); },
        getStatBonus: function () { return computeStatBonus(); },
        /** 存档快照：解锁记录 + 肌群槽被动装配（数据表由 data/muscles.json 提供，不入档） */
        getState: function () {
            return { unlocked: unlocked, equipped: equipped };
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
            var nextEquipped = {};
            var eq = state.equipped;
            // 注意：此处不过滤 passiveById —— 数据表可能尚未加载完成；未知 id 留到读取时（getEquippedPassiveIds）再剔除
            if (eq && typeof eq === 'object') {
                Object.keys(eq).forEach(function (gid) {
                    if (eq[gid]) nextEquipped[String(gid)] = String(eq[gid]);
                });
            }
            equipped = nextEquipped;
        },
        isGroupComplete: isGroupComplete,
        getCompletedGroups: getCompletedGroups,
        /** 大型被动容量：已全通肌群 id → 各 1 槽（装配规则见 34 §3；本模块只暴露容量状态） */
        getPassiveSlots: function () {
            var slots = {};
            getCompletedGroups().forEach(function (gid) { slots[gid] = 1; });
            return slots;
        },

        // —— 大型被动（34 §3，阶段三：后遗症迁入）——
        getPassives: function () { return passives.slice(); },
        getPassiveById: function (id) { return passiveById[id] || null; },
        /** 当前装配表副本：{ groupId: passiveId } */
        getEquippedMap: function () {
            var out = {};
            for (var g in equipped) {
                if (Object.prototype.hasOwnProperty.call(equipped, g) && equipped[g]) out[g] = equipped[g];
            }
            return out;
        },
        getEquippedPassiveForGroup: function (groupId) { return equipped[groupId] || null; },
        /** 已装配的大型被动 id 列表（按装配顺序；未知/失效条目剔除） */
        getEquippedPassiveIds: function () {
            var seen = {};
            var out = [];
            for (var g in equipped) {
                if (!Object.prototype.hasOwnProperty.call(equipped, g) || !equipped[g]) continue;
                var pid = equipped[g];
                if (seen[pid]) continue;
                if (!passiveById[pid]) continue;
                seen[pid] = true;
                out.push(pid);
            }
            return out;
        },
        /** 已装配被动对应的效果层 id（post_effect_id，供战斗结算读取） */
        getEquippedPostEffectIds: function () {
            return collectEquippedPostEffectIds(null);
        },
        /**
         * 本击生效的被动效果层 id（34 §3.4 生效边界：招式形态调用装配肌群才触发）。
         * 中间态近似：attackInfo = { limbId, formTags }（formTags = 招式 required_limb_tags）。
         * 侧肌群槽 → 仅同侧出招；中轴肌群槽 → 左右同生效；无法分类（无标签）时保守不过滤。
         */
        getEquippedPostEffectIdsForAttack: function (attackInfo) {
            if (!attackInfo || typeof attackInfo !== 'object') return collectEquippedPostEffectIds(null);
            var limbId = attackInfo.limbId != null ? String(attackInfo.limbId) : '';
            var tags = Array.isArray(attackInfo.formTags) ? attackInfo.formTags : [];
            if (!limbId && !tags.length) return collectEquippedPostEffectIds(null);
            return collectEquippedPostEffectIds(function (gid) {
                return attackInvokesGroup(groupById[gid], limbId, tags);
            });
        },
        canEquipPassive: canEquipPassive,
        /** 装配大型被动到指定肌群槽；返回 { ok, reason } */
        equipPassive: function (passiveId, groupId) {
            var check = canEquipPassive(passiveId, groupId);
            if (!check.ok) return check;
            var p = passiveById[passiveId];
            var cost = Math.max(1, parseInt(p.slots_cost, 10) || 1);
            if (cost === 1) {
                equipped[groupId] = passiveId;
            } else {
                (Array.isArray(p.allowed_groups) ? p.allowed_groups : []).forEach(function (g) { equipped[g] = passiveId; });
            }
            return { ok: true, reason: null };
        },
        /** 卸下大型被动（全局唯一，任意槽卸下即移除全部占用） */
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

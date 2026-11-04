// UI session state only. Equipment, progression and costs remain in the game APIs.
export function combatPanel(g, publish, t) {
    const api = g.SceneApp.combatApi || g.SceneApp.panelApi, IE = g.InventoryEquipment, s = api.combatState;
    const limbKeys = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
    const regions = { headneck: '头颈', torso: '躯干', lhand: '左臂', rhand: '右臂', lfoot: '左腿', rfoot: '右腿' };
    const statLabels = { maxQi: '底气上限', jingu: '后天筋骨', flexibility: '后天柔韧', breath: '后天呼吸', dexterity: '后天身手', focus: '后天专注' };
    let picker = null, serial = 0, region = 'lhand', editingOrder = false;
    const label = id => t(limbKeys[id] || id);
    const variantName = v => v?.name_key ? t(v.name_key) : v?.id || '';
    const passiveName = p => p?.name_key ? t(p.name_key) : p?.id || '';
    const groupRegion = gr => gr.limb || (['head', 'neck'].includes(gr.id) ? 'headneck' : 'torso');
    const learnedMuscles = () => IE.getSkillLevel(IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID || 'special_meridian_studies') >= 1;
    const dependencies = () => ({ getSkillLevel: id => IE.getSkillLevel(id) || 0, getMoveUsage: id => IE.getState().skills?.[id]?.move_usage || {}, CombatSkills: g.CombatSkills });
    const equipped = () => IE.getCombatState();
    const skills = category => g.CombatSkills?.getSkillsByCategory(category) || [];
    const getGroup = id => g.Muscles?.getGroups().find(gr => gr.id === id);
    const groupEntries = id => g.Muscles?.getMusclesByGroup(id) || [];
    const countUnlocked = id => groupEntries(id).filter(m => g.Muscles.isUnlocked(m.id)).length;
    const currentSession = session => !!picker && picker.session === session && api.getOpen('combat');
    function moveMultiplier(skillId, move) {
        if (!move) return null;
        const range = g.CombatSkills.getMovePowerProfile(skillId, move, IE.getSkillLevel(skillId));
        const format = n => String(Number(n.toFixed(3)));
        return range.min === range.max ? format(range.min) : `${format(range.min)}～${format(range.max)}`;
    }
    function validPicker() {
        if (!picker) return false;
        const c = equipped();
        if (['muscles', 'passive'].includes(picker.kind)) return s.mode === 'muscles' && learnedMuscles() && !!getGroup(picker.id) && (picker.kind !== 'passive' || g.Muscles.isGroupComplete(picker.id));
        if (s.mode === 'muscles') return false;
        if (picker.kind === 'hub') return c.hubs[picker.id] === picker.skillId;
        if (!Object.hasOwn(limbKeys, picker.id) || c.limbs[picker.id]?.active !== picker.skillId) return false;
        return picker.kind !== 'move' || (picker.index >= 0 && picker.index < g.CombatSkills.getMaxSlotsForLevel(picker.skillId, IE.getSkillLevel(picker.skillId)));
    }
    function row(id, order) {
        const CS = g.CombatSkills, c = equipped(), skillId = c.limbs[id]?.active, sk = CS?.getSkill(skillId), level = IE.getSkillLevel(skillId), seq = c.move_sequences?.[id] || [];
        const move = sk?.moves?.find(m => m.id === seq[0]), count = IE.getState().skills?.[skillId]?.move_usage?.[move?.id] || 0;
        const max = sk ? CS.getMaxSlotsForLevel(skillId, level) : 0;
        return { id, label: label(id), skillId, name: sk?.name || '未装配', level, order: String(order.indexOf(id) + 1).padStart(2, '0'), move: move?.name || '未选招式', prof: move ? Math.floor(CS.getMoveProficiencyRatio(count) * 100) : null,
            variants: Array.from({ length: Math.max(0, max - 1) }, (_, i) => { const token = seq[i + 1] || ''; return { index: i + 1, name: token.startsWith('variant:') ? variantName(g.CombatVariants?.getVariant(token.slice(8))) : '', token }; }) };
    }
    function muscleOverview() {
        const AP = g.Muscles, groups = AP?.getGroups() || [], map = AP?.getEquippedMap() || {};
        const bonus = AP?.getStatBonus() || {}, totals = { maxQi: bonus.maxQi, ...bonus.acquired };
        const all = groups.map(gr => ({ id: gr.id, name: gr.name, region: groupRegion(gr), total: groupEntries(gr.id).length, count: countUnlocked(gr.id), complete: AP.isGroupComplete(gr.id), passive: passiveName(AP.getPassiveById(map[gr.id])) }));
        return { regions: Object.entries(regions).map(([id, name]) => ({ id, name })), region, groups: all.filter(gr => gr.region === region), total: all.reduce((n, gr) => n + gr.total, 0), count: all.reduce((n, gr) => n + gr.count, 0), complete: all.filter(gr => gr.complete).length, groupTotal: all.length,
            bonuses: Object.entries(totals).filter(([key, value]) => statLabels[key] && value).map(([key, value]) => ({ name: statLabels[key], value })) };
    }
    function readPicker() {
        const p = picker, CS = g.CombatSkills, CV = g.CombatVariants, AP = g.Muscles, c = equipped();
        const result = { ...p, title: '', items: [], canClear: false, empty: '暂无可用选项' };
        if (p.kind === 'skill' || p.kind === 'hub') {
            const list = p.kind === 'hub' ? skills(p.id) : [...skills('unarmed'), ...skills('weapon')];
            result.title = p.kind === 'hub' ? (p.id === 'breath' ? '呼吸法' : '步法') : `${label(p.id)} · 主动技能`;
            result.items = list.map(sk => ({ id: sk.id, name: sk.name, meta: `${IE.getSkillLevel(sk.id)} 级`, description: p.kind === 'hub' ? sk.description || '' : (sk.category === 'weapon' ? '兵器' : '徒手'), selected: sk.id === p.skillId }));
            result.canClear = p.kind === 'hub' && !!p.skillId;
        } else if (p.kind === 'move') {
            const seq = c.move_sequences?.[p.id] || [], usage = IE.getState().skills?.[p.skillId]?.move_usage || {}, tags = g.getLimbActionTags?.(p.id) || [];
            result.title = `${label(p.id)} · ${p.index === 0 ? '主招式' : '变式'}`;
            result.subtitle = CS.getSkill(p.skillId)?.name || '';
            result.canClear = !!seq[p.index];
            if (p.index === 0) result.items = CS.getUnlockedMoves(p.skillId, IE.getSkillLevel(p.skillId)).filter(m => !CS.moveAllowedOnLimbByTagKeys || CS.moveAllowedOnLimbByTagKeys(m, tags)).map(m => ({ id: m.id, name: m.name, meta: `熟练 ${Math.floor(CS.getMoveProficiencyRatio(usage[m.id] || 0) * 100)}%`, description: `倍率 ×${moveMultiplier(p.skillId, m)}${m.hit_segments > 1 ? ` · ${m.hit_segments} 段` : ''}`, selected: seq[0] === m.id }));
            else result.items = (CV?.getAllVariants() || []).filter(v => ['active_moves', 'both'].includes(String(v.assist_scope || 'active_moves')) && (!CV.isVariantUnlocked || CV.isVariantUnlocked(v, dependencies()))).map(v => { const id = 'variant:' + (v.variant_id || v.id); return { id, name: variantName(v), meta: seq.includes(id) ? '已装配' : '变式', disabled: seq.includes(id), selected: seq[p.index] === id }; });
            result.empty = p.index === 0 ? t('combat.seq.no_matching_moves') : '暂无可用变式';
        } else if (p.kind === 'muscles') {
            const gr = getGroup(p.id), list = groupEntries(p.id), pages = Math.max(1, Math.ceil(list.length / 8));
            p.page = Math.max(0, Math.min(p.page || 0, pages - 1));
            Object.assign(result, { title: gr.name, count: countUnlocked(p.id), total: list.length, page: p.page, pages, complete: AP.isGroupComplete(p.id), passive: passiveName(AP.getPassiveById(AP.getEquippedPassiveForGroup(p.id))) });
            result.items = list.slice(p.page * 8, p.page * 8 + 8).map(m => ({ id: m.id, name: gr.side === 'L' ? m.name.replace(/（左）$/, '') : gr.side === 'R' ? m.name.replace(/（右）$/, '') : m.name, fullName: m.name, unlocked: AP.isUnlocked(m.id), progress: AP.getProgress(m.id), effects: (m.effects || []).filter(e => e.delta).map(e => ({ name: statLabels[e.type] || e.type, value: e.delta })) }));
        } else if (p.kind === 'passive') {
            result.title = `${getGroup(p.id).name} · 大型被动`;
            const map = AP.getEquippedMap();
            result.items = AP.getPassives().filter(passive => passive.allowed_groups?.includes(p.id)).map(passive => {
                const at = Object.keys(map).find(id => map[id] === passive.id), selected = map[p.id] === passive.id, check = AP.canEquipPassive(passive.id, p.id);
                return { id: passive.id, name: passiveName(passive), description: t(passive.desc_key).split('\n\n').at(-1), selected, disabled: !selected && !check.ok, action: selected ? 'unequip' : 'equip', actionLabel: selected ? '卸下' : at ? `${getGroup(at)?.name || at}已装` : check.ok ? '装配' : check.reason === 'slot_occupied' ? '槽位已占用' : '所需肌群未全通' };
            });
            result.empty = '暂无适用被动';
        } else if (p.kind === 'detail') {
            const sk = CS.getSkill(p.skillId), seq = c.move_sequences?.[p.id] || [], move = sk?.moves?.find(m => m.id === seq[0]);
            Object.assign(result, { title: `${label(p.id)} · 配置详情`, name: sk?.name || '未装配', level: IE.getSkillLevel(p.skillId), description: sk?.description || '', move: move?.name || '未选招式', multiplier: moveMultiplier(p.skillId, move), report: api.recipeReport().errors, reportOpen: !!s.recipeSchemaListOpen });
        }
        return result;
    }
    function refresh() {
        if (!api.getOpen('combat')) { picker = null; editingOrder = false; publish('combat', { open: false }); return; }
        if (!learnedMuscles() && s.mode === 'muscles') s.mode = 'skills';
        if (picker && !validPicker()) picker = null;
        const c = equipped(), ids = IE.COMBAT_LIMB_IDS || Object.keys(limbKeys), order = IE.getLimbStrikeOrderSlice?.() || ids.slice();
        publish('combat', { open: true, muscle: s.mode === 'muscles', unlocked: learnedMuscles(), editingOrder,
            weapon: g.ModularWeaponCombat?.view(),
            limbs: ids.map(id => row(id, order)), order: order.map(id => ({ id, label: label(id) })), selected: s.curPart,
            hubs: ['breath', 'footwork'].map(id => ({ id, label: id === 'breath' ? '呼吸' : '步法', name: g.CombatSkills?.getSkill(c.hubs[id])?.name || '未装配' })),
            muscles: s.mode === 'muscles' ? muscleOverview() : null, picker: picker ? readPicker() : null });
    }
    function select(mode, id) {
        if (!api.getOpen('combat')) return;
        if (mode === 'mode' && ['skills', 'muscles'].includes(id)) {
            if (id === 'muscles' && !learnedMuscles()) return;
            s.mode = id; picker = null;
        } else if (mode === 'region' && Object.hasOwn(regions, id) && learnedMuscles()) { region = id; picker = null; }
        refresh();
    }
    function openPicker(kind, id, index = 0) {
        if (!api.getOpen('combat')) return;
        const muscle = ['muscles', 'passive'].includes(kind), c = equipped();
        if (muscle) {
            if (s.mode !== 'muscles' || !learnedMuscles() || !getGroup(id) || (kind === 'passive' && !g.Muscles.isGroupComplete(id))) return;
            s.curMuscleCat = id;
        } else {
            if (s.mode === 'muscles') return;
            if (kind === 'hub') { if (!['breath', 'footwork'].includes(id)) return; }
            else if (!['skill', 'move', 'detail'].includes(kind) || !Object.hasOwn(limbKeys, id)) return;
            else { s.curPart = id; s.curSlot = 'active'; s.curSkillId = c.limbs[id]?.active; }
        }
        picker = { kind, id, index, page: 0, session: ++serial, skillId: muscle ? null : kind === 'hub' ? c.hubs[id] : c.limbs[id]?.active };
        if (kind === 'move' && !picker.skillId) picker.kind = 'skill';
        refresh();
    }
    function closePicker() { picker = null; s.editingSlot = null; refresh(); }
    function pick(id, session) {
        if (!currentSession(session)) return;
        if (!validPicker()) { closePicker(); return; }
        const p = { ...picker }, view = readPicker(), CS = g.CombatSkills;
        if (!['skill', 'hub', 'move'].includes(p.kind) || (id ? !view.items.some(item => item.id === id && !item.disabled) : !view.canClear)) return;
        if (p.kind === 'skill' || p.kind === 'hub') {
            if (id === p.skillId) { closePicker(); return; }
            if (id) {
                s.curSkillId = id; s.curCat = CS.getSkill(id).category; if (p.kind === 'skill') s.curPart = p.id; s.curSlot = 'active';
                api.deploy(); // Keeps the game's default move and breathing switch tick cost.
                const actual = p.kind === 'hub' ? equipped().hubs[p.id] : equipped().limbs[p.id]?.active;
                if (actual !== id) { refresh(); return; }
            } else {
                if (!api.setCombat({ hubs: { [p.id]: null } }, t('combat.cfg.invalid'))) return;
                if (p.id === 'breath') g.Survival?.advanceTick();
            }
            if (p.kind === 'skill') { openPicker('move', p.id); return; }
        } else {
            const mx = CS.getMaxSlotsForLevel(p.skillId, IE.getSkillLevel(p.skillId)), seq = (equipped().move_sequences?.[p.id] || []).slice(0, mx);
            while (seq.length < mx) seq.push('');
            seq[p.index] = id;
            if (!api.setCombat({ move_sequences: { [p.id]: seq } }, t('combat.cfg.invalid'))) return;
            IE.setMoveSlotPowerLevel?.(p.id, p.index, null);
        }
        closePicker();
    }
    function unlock() { /* Progress is awarded by completed training. */ }
    function passive(id, action, session) {
        if (!currentSession(session) || !validPicker() || picker.kind !== 'passive') return;
        const AP = g.Muscles, def = AP.getPassiveById(id), group = getGroup(picker.id);
        if (!def?.allowed_groups?.includes(group.id)) return;
        if (action === 'unequip' && AP.getEquippedPassiveForGroup(group.id) === id) {
            if (AP.unequipPassive(id)?.ok) g.GameLog?.log(t('log.system.muscle.passive_unequipped', { name: passiveName(def) }), 'system');
        } else if (action === 'equip' && AP.canEquipPassive(id, group.id)?.ok && AP.equipPassive(id, group.id)?.ok) {
            g.GameLog?.log(t('log.system.muscle.passive_equipped', { name: passiveName(def), group: group.name }), 'system');
            picker = null;
        }
        refresh();
    }
    return { refresh, select, openPicker, pick, closePicker, unlock, passive,
        swapWeapon(i) { if(api.getOpen('combat') && Number.isInteger(i) && i>=0 && i<3) { const rows=g.ModularWeaponCombat?.view()?.rows;if(rows){const ids=rows.map(r=>r.slot);[ids[i],ids[i+1]]=[ids[i+1],ids[i]];api.setWeaponConfig('order',ids);refresh();} } },
        weaponPower(slot,value) { if(api.getOpen('combat')) { api.setWeaponConfig('power',{slot,power:Number(value)});refresh(); } },
        page(delta) { if (picker?.kind === 'muscles' && api.getOpen('combat')) { picker.page += delta; refresh(); } },
        toggleOrder() { if (api.getOpen('combat')) { editingOrder = !editingOrder; refresh(); } },
        swap(i) { if (api.getOpen('combat') && editingOrder && Number.isInteger(i) && i >= 0 && i < 3) { IE.swapLimbStrikeOrderIndices(i, i + 1); refresh(); } },
        debug() { if (picker?.kind === 'detail' && validPicker() && api.getOpen('combat')) { s.curSkillId = picker.skillId; api.debugCombat(); refresh(); } },
        toggleReport() { s.recipeSchemaListOpen = !s.recipeSchemaListOpen; refresh(); }
    };
}

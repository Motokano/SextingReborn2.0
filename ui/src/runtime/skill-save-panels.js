export function skillOverview(g, publish, t) {
    const api = g.SceneApp.panelApi, IE = g.InventoryEquipment;
    function rows() { const tab = api.getSkillTab(); if (tab === 'life')
        return api.lifeSkills.map(s => ({ skillId: s.id, name: t(s.nameKey), desc: t(s.descKey), addOpts: { gameLog: true } })); if (tab === 'special') {
        const id = IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID || 'special_meridian_studies';
        return [{ skillId: id, name: t('special.skill.meridian_studies.name'), desc: t('special.skill.meridian_studies.desc'), levelSuffix: t(IE.getSkillLevel(id) >= 1 ? 'special.skill.meridian_studies.unlocked' : 'special.skill.meridian_studies.locked'), addOpts: { refreshCombat: true } }];
    } return (g.SurvivalSkills?.getAll() || []).map(s => ({ skillId: s.id, name: s.name, desc: s.desc, addOpts: { gameLog: true } })); }
    function refresh() { const open = api.getOpen('survival'); publish('survival', { open, tab: api.getSkillTab(), rows: open ? rows().map(s => { const lv = IE.getSkillLevel(s.skillId) || 0, exp = IE.getStudyExp(s.skillId); let level = lv + t('combat.level.suffix') + (s.levelSuffix ? ' ' + s.levelSuffix : ''); if (exp > 0 && g.CombatSkills?.getPotentialCostForLevel) {
            const st = IE.getState(), cost = g.CombatSkills.getPotentialCostForLevel(s.skillId, lv, { skills: st.skills || {}, skill_max_level_bonus: st.skill_max_level_bonus || {} });
            level += ' · ' + t('survival.study.progress', { exp: String(exp), cost: String(cost || '—') });
        } const bookSkill = !!g.BookReading?.isBookSkill(s.skillId); if (bookSkill) { const p = g.BookReading.progress(g.BookReading.skillProfile(s.skillId)); level = lv + t('combat.level.suffix') + (p.cost ? ' · ' + p.exp + ' / ' + p.cost + ' 经验' : ''); } return { ...s, level, bookSkill, studying: g.Survival.isStudyActive() && g.Survival.getStudySkillId() === s.skillId }; }) : [] }); }
    function current(id) { return api.getOpen('survival') && rows().find(s => s.skillId === id); }
    return { refresh, tab: api.setSkillTab, plus(id) { const row = current(id); if (row)
            api.addSkill(id, 1, row.addOpts); }, study(id) { const row = current(id), S = g.Survival; if (!row || !S?.startStudy)
            return; if (S.isStudyActive() && S.getStudySkillId() === id) {
            S.stopStudy();
            g.GameLog?.log(t('log.system.study.stopped_manual'), 'info');
        }
        else {
            const r = S.startStudy(id);
            g.GameLog?.log(r?.ok ? t('log.system.study.started', { name: row.name || id }) : t('log.system.study.start_fail_' + (r?.reason || 'invalid')), r?.ok ? 'system' : 'warn');
        } refresh(); g.SceneHud.refresh('status'); } };
}
// Async operations retain the original SaveSystem (including transaction/older
// checks). A closed/reopened view cannot receive a stale export or error.
export function savePanel(g, publish, t) {
    const api = g.SceneApp.panelApi;
    let epoch = 0, open = false, busy = false, disposed = false;
    const draft = { account: '', password: '', exportCode: '', importCode: '' };
    const emit = () => publish('save', { open, busy, ...draft });
    function refresh() { const next = api.getOpen('save'); if (next !== open) {
        epoch++;
        open = next;
    } emit(); }
    const message = (key, level) => api.message(t('save.msg.' + key), level);
    async function run(action) {
        if (!open || disposed)
            return;
        if (busy) {
            message('busy', 'error');
            return;
        }
        const S = g.SaveSystem, cred = { account: draft.account.trim(), password: draft.password };
        if (action === 'local') {
            const ok = S?.saveNow?.();
            message(ok ? 'localOk' : 'localFail', ok ? 'info' : 'error');
            return;
        }
        if ((action === 'export' || action === 'import') && (!cred.account || !cred.password)) {
            message('needAccountPassword', 'warning');
            return;
        }
        const code = action === 'copy' ? draft.exportCode.trim() : draft.importCode.trim();
        if ((action === 'copy' || action === 'import') && !code) {
            message(action === 'copy' ? 'copyFail' : 'importFail', 'warning');
            return;
        }
        const token = epoch;
        busy = true;
        emit();
        const current = () => !disposed && open && epoch === token;
        try {
            if (action === 'export') {
                if (!S?.exportSaveCode)
                    throw Error('unavailable');
                const out = await S.exportSaveCode(cred);
                if (current()) {
                    draft.exportCode = out || '';
                    message('exportOk', 'info');
                }
            }
            else if (action === 'copy') {
                if (!g.navigator.clipboard?.writeText)
                    throw Error('unavailable');
                await g.navigator.clipboard.writeText(code);
                if (current())
                    message('copyOk', 'info');
            }
            else if (action === 'import') {
                if (!S?.importSaveCode)
                    throw Error('unavailable');
                const result = await S.importSaveCode(code, cred);
                if (current()) {
                    if (result?.ok) {
                        message('importOk', 'info');
                        api.imported();
                        g.SveltePanels?.refreshAll();
                    }
                    else
                        message(result?.reason === 'older' ? 'importRejectedOlder' : 'importFail', result?.reason === 'older' ? 'warning' : 'error');
                }
            }
        }
        catch (error) {
            if (current())
                message(action === 'export' && String(error?.message).includes('busy') ? 'busy' : action === 'export' ? 'exportFail' : action === 'copy' ? 'copyFail' : 'importFail', action === 'copy' ? 'warning' : 'error');
        }
        finally {
            busy = false;
            if (!disposed)
                emit();
        }
    }
    return { refresh, run, edit(key, value) { if (Object.hasOwn(draft, key)) {
            draft[key] = value;
            emit();
        } }, dispose() { disposed = true; epoch++; draft.password = ''; draft.importCode = ''; draft.exportCode = ''; } };
}

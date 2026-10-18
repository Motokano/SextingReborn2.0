import { formatReading as n } from './carry.mjs';

// Explicit allow-list of the existing public-by-default fields. New fields do
// not become visible merely because a rule has not been configured for them.
const blocks = new Set(['limbs', 'survival', 'attrs', 'resources', 'buff_hud', 'combat_resources', 'journal']);
const metrics = new Set(['body_detail', 'satiety', 'thirst', 'stamina', 'energy', 'fatigue', 'nutrition', 'mood', 'dirtyness', 'time', 'date', 'weather']);
function rule(value: any, fallback: boolean, args: any[] = []) {
  try { return value == null ? fallback : typeof value === 'function' ? !!value(...args) : !!value; }
  catch { return false; }
}
export function block(g: any, id: string) { if (id === 'buff_hud' && g.SceneCtx?.buffHudVisible === false) return false; return rule(g.SceneCtx?.leftHudBlockVisibilityRules?.[id], blocks.has(id)); }
export function known(g: any, id: string, state = g.Survival?.getState()) {
  if (id === 'date' && g.NPCSystem && !g.NPCSystem.isDemoFlagTrue('observation_calendar_unlocked')) return false;
  return rule(g.SceneCtx?.survivalMetricVisibilityRules?.[id], metrics.has(id), [state, id]);
}
export function text(g: any, key: string, args?: any) {
  try { return g.UIText?.t(key, args) || key; } catch { return key; }
}
const finite = (v: any): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export const ratio = (v: any, max: any) => finite(v) != null && max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
const attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
const partIds = ['head', 'chest', 'belly', 'lhand', 'rhand', 'lfoot', 'rfoot'];
const partNames = ['头部', '胸部', '腹部', '左臂', '右臂', '左腿', '右腿'];

export function readBody(g: any, ready: boolean) {
  const available = ready && !!g.CharacterAttributes && block(g, 'limbs');
  const detail = available && known(g, 'body_detail');
  const CA = g.CharacterAttributes;
  return { ready, available, detail, rows: available ? partIds.map((id, i) => {
    const key = id === 'belly' ? 'abdomen' : id;
    const value = finite(CA.getPartDestroy(key)), max = finite(CA.getBodyPartDestroyMax(key));
    // Do not publish exact hidden readings, even into the presentation store.
    return { id, key, label: partNames[i], hurt: (value ?? 0) > 0,
      value: detail ? value : null, max: detail ? max : null, ratio: detail ? ratio(value, max) : 0 };
  }) : [] };
}

export function readSurvival(g: any, ready: boolean) {
  const available = ready && !!g.Survival && block(g, 'survival');
  const s = available ? g.Survival.getState() : null;
  const ids = ['satiety', 'thirst', 'stamina', 'energy', 'fatigue', 'nutrition', 'mood', 'dirtyness'];
  const tones = ['#b6a078', '#8aa4a4', '#9daf91', '#b1b99b', '#a8a18b', '#8d9b72', '#a5aa81', '#a8a18b'];
  return { ready, available, rows: !s ? [] : ids.filter(id => known(g, id, s)).map(id => {
    const value = finite(id === 'mood' && g.Survival.getMood ? g.Survival.getMood() : s[id]);
    const max = id === 'satiety' ? 120 : id === 'mood' ? 1000 : s[id + '_max'] || 100;
    const zone = id === 'satiety' ? g.Survival.getSatietyZone?.() : null;
    const mood = id === 'mood' ? g.Survival.getMoodRangeByValue?.(value) : null;
    const danger = id === 'satiety' ? ['severe', 'starvation'].includes(zone) : id === 'fatigue' ? (value ?? 0) >= 80 : id === 'dirtyness' ? (value ?? 0) >= 80 : id === 'nutrition' ? (value ?? 0) <= 10 : id === 'mood' ? mood === 'low' : (value ?? 0) <= 0;
    const warn = id === 'satiety' ? zone !== 'normal' : id === 'fatigue' ? (value ?? 0) > 50 : id === 'dirtyness' ? (value ?? 0) >= 50 : id === 'nutrition' ? (value ?? 0) < 40 : id === 'mood' ? mood !== 'high' : (value ?? 0) < (id === 'thirst' ? 60 : max * .3);
    return { id, value, max, ratio: ['thirst', 'fatigue', 'nutrition', 'dirtyness'].includes(id) ? Math.max(0, Math.min(100, value ?? 0)) : ratio(value, max), tone: tones[ids.indexOf(id)],
      label: id === 'thirst' ? '水分' : text(g, 'status.label.' + id),
      valueId: 'status-' + id + (['mood', 'nutrition', 'dirtyness'].includes(id) ? '' : '-text'),
      state: danger ? 'danger' : warn ? 'warn' : 'ok', extra: ['mood', 'dirtyness'].includes(id) };
  }) };
}

export function readGrowth(g: any, ready: boolean) {
  const attrsKnown = ready && !!g.CharacterAttributes && block(g, 'attrs');
  const resourcesKnown = ready && !!g.InventoryEquipment && block(g, 'resources');
  const CA = g.CharacterAttributes, IE = g.InventoryEquipment, S = g.Survival;
  const exp = attrsKnown ? CA.getAttributeExpState?.('player') || {} : {};
  let study = '—';
  if (resourcesKnown && S?.getStudyState?.().active) {
    const id = S.getStudySkillId(), skill = g.CombatSkills?.getSkill(id);
    const parts = [skill?.name || id || '—'];
    if (known(g, 'energy') && S.getEnergy) parts.push(text(g, 'status.label.energy') + ' ' + S.getEnergy());
    if (IE.getPotential) parts.push(text(g, 'status.label.potential') + ' ' + IE.getPotential());
    study = parts.join(' · ');
  }
  return { ready, available: attrsKnown || resourcesKnown, attrsKnown, resourcesKnown, study,
    attrs: attrsKnown ? attrIds.map(id => ({ id, label: text(g, 'status.attr.' + id),
      value: finite(CA.getEffectiveAttr(id)), base: finite(CA.getBaseInnateAttr?.(id)),
      exp: Math.max(0, Math.floor(Number(exp[id]?.exp) || 0)) })) : [],
    potential: resourcesKnown ? IE.getPotential?.() ?? null : null,
    experience: resourcesKnown ? IE.getCombatExperience?.() ?? null : null };
}

export function readBattle(g: any, ready: boolean) {
  const S = g.Survival, IE = g.InventoryEquipment;
  const permitted = ready && !!S && block(g, 'combat_resources');
  const s = permitted ? S.getState() : {};
  const info = permitted ? g.PharmacyEffects?.getInfo?.() || {} : {};
  const stun = permitted ? IE?.getPlayerStunValue?.() || 0 : 0;
  const stunned = permitted && !!IE?.isPlayerStunned?.();
  const available = permitted && (!!g.CombatEngagement?.isPlayerInCombat() || s.pain > 0 || stun > 0 || stunned || info.addiction > 0 || info.toxicity > 0);
  const pi = available ? S.getPainInfo?.() : null;
  let pain = '—';
  if (pi) {
    pain = String(pi.effective) + (pi.tier && pi.tier !== 'none' ? '（' + text(g, 'survival.pain.' + pi.tier) + '）' : '');
    if (pi.ignored_ratio > 0) pain = text(g, 'survival.pain.medicated', { raw: pi.unmedicated, effective: Number(Number(pi.effective).toFixed(2)), percent: Math.round(pi.ignored_ratio * 100) });
  }
  let addiction = '—', toxicity = '—';
  if (available && g.PharmacyEffects?.getInfo) {
    addiction = Math.round(info.addiction) + '（' + text(g, 'pharmacy.addiction.stage' + (info.stage || 1)) + '；' + text(g, 'pharmacy.addiction.effective_stage', { stage: text(g, 'pharmacy.addiction.stage' + (info.effective_stage || info.stage || 1)), n: info.relief_stages || 0 }) + '）';
    toxicity = String(Math.round(info.toxicity));
    if (info.toxicity > 0) toxicity += '（' + text(g, 'pharmacy.toxicity.' + (info.toxicity_band || 'none')) + '）';
    if (info.lethal_active) toxicity += text(g, 'pharmacy.toxicity.lethal', { n: String(info.lethal_remaining) });
  }
  const qm = s.qi_li_max ?? S?.getQiLiMax?.() ?? 0, dm = s.diqi_max ?? 0;
  return { ready, available,
    meters: !available ? [] : [
      { id: 'qi-li', label: text(g, 'status.label.qi_li'), value: qm > 0 ? (s.qi_li_current ?? 0).toFixed(0) + ' / ' + qm : '—', ratio: ratio(s.qi_li_current ?? 0, qm), tone: '#b6a078' },
      { id: 'diqi', label: text(g, 'status.label.diqi'), value: dm > 0 ? n(s.diqi_current ?? 0) + ' / ' + dm : '—', ratio: ratio(s.diqi_current ?? 0, dm), tone: '#8aa4a4' }
    ],
    rows: !available ? [] : [
      { id: 'diqi-shield', label: text(g, 'status.label.diqi_shield'), value: s.diqi_shield_remaining > 0 ? String(Math.floor(s.diqi_shield_remaining)) : '—' },
      { id: 'stun', label: text(g, 'status.label.stun'), value: String(stun) + (stunned ? '（眩晕中）' : '') },
      { id: 'pain', label: text(g, 'status.label.pain'), value: pain },
      { id: 'addiction', label: text(g, 'status.label.addiction'), value: addiction },
      { id: 'toxicity', label: text(g, 'status.label.toxicity'), value: toxicity }
    ] };
}

export function readEffects(g: any, ready: boolean) {
  const permitted = ready && !!g.BuffSystem && block(g, 'buff_hud');
  const owners = permitted ? g.BuffSystem.getState()?.instancesByOwner || {} : {};
  let enemy = permitted ? String(g.SceneCtx?.lastAttackedEnemyId || '') : '';
  if (!owners[enemy]?.length) {
    let best = -1;
    for (const [id, arr] of Object.entries<any>(owners)) {
      if (id === 'player' || !Array.isArray(arr)) continue;
      for (const inst of arr) if (inst?.started_tick != null && Number.isFinite(Number(inst.started_tick)) && Number(inst.started_tick) > best) { best = Number(inst.started_tick); enemy = id; }
    }
  }
  const available = permitted && [owners.player, owners[enemy]].some(arr => Array.isArray(arr) && arr.some(inst => inst?.buff_id && parseInt(inst.stacks, 10) > 0));
  const now = available ? Number(g.GameTime?.getState()?.totalTicks) || 0 : 0;
  const chips = (arr: any[]) => (Array.isArray(arr) ? arr : []).filter(inst => inst?.buff_id).map(inst => {
    const stacks = Math.max(0, parseInt(inst.stacks, 10) || 0), end = parseInt(inst.expires_at_tick, 10);
    return { name: String(inst.template?.name || inst.buff_id), desc: String(inst.template?.desc || ''), stacks,
      remaining: inst.template?.manualLifetime || !Number.isFinite(end) ? null : Math.max(0, end - now) };
  });
  return { ready, available, sections: !available ? [] : [
    { id: 'player', titleId: 'self', title: text(g, 'buff.hud.self'), empty: text(g, 'status.enemy_buffs.none_buff'), chips: chips(owners.player) },
    { id: 'enemy', titleId: 'enemy', title: enemy ? text(g, 'buff.hud.target_with_name', { name: text(g, 'enemy.name.' + enemy.replace(/\./g, '_')) }) : text(g, 'buff.hud.target_none'), empty: text(g, 'status.enemy_buffs.' + (enemy ? 'none_buff' : 'none_target')), chips: chips(owners[enemy]) }
  ] };
}

export function readEnvironment(g: any, ready: boolean) {
  const timeKnown = ready && known(g, 'time'), dateKnown = ready && known(g, 'date'), weatherKnown = ready && known(g, 'weather');
  const available = ready && (!g.HUD || g.HUD.isTimeHudVisible()) && (timeKnown || dateKnown || weatherKnown);
  const st = available && (timeKnown || dateKnown) ? g.GameTime?.getState() : null;
  const map = available && weatherKnown ? g.GameEngine?.getMap() : null;
  const observation = map ? g.Weather?.observe(map) : null;
  const measured = map && g.NPCSystem?.isDemoFlagTrue('observation_temperature_unlocked');
  const env = measured ? g.Weather?.getEnvironment(map) : null;
  return { ready, available, timeKnown, dateKnown, weatherKnown,
    period: available && timeKnown ? st?.timePeriodLabel || '' : '',
    time: available && timeKnown && st ? String(st.hour).padStart(2, '0') + ':' + String(st.minute).padStart(2, '0') : '',
    date: available && dateKnown && st ? '第 ' + st.year + ' 年 · 第 ' + st.dayOfYear + ' 日' : '',
    weather: available && weatherKnown ? (observation?.label || '') + (env ? ' · ' + Math.round(env.temperature) + '℃' : '') : '' };
}

export function readJournal(g: any, ready: boolean) {
  const available = ready && block(g, 'journal'), timeKnown = ready && known(g, 'time');
  return { ready, available, timeKnown, entries: available ? (g.GameLog?.getEntries() || []).map((e: any) => ({
    id: e.id, message: e.message, type: e.type, time: timeKnown ? e.time : '',
    debug: /^\[(?:NPCSystem|SaveSystem|BUFF-HUD|debug|bootstrap)\]/i.test(e.message.trim())
  })) : [] };
}

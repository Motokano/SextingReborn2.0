/**
 * 生成制药剂型 buff 模板（k233）并合并进 data/buffs.json。
 *
 * 源表：data/pharmacy-buff-matrix.json（families × routes × potency + 副作用/相冲/成瘾阶段）
 * 产出：data/buffs.json 中 id 形如 buff_pharm_<family>_<route>_<potency> 的模板
 *       + buff_pharm_sideeffect_<band> / buff_pharm_conflict_<outcome> / buff_pharm_addiction_stage<N>
 *
 * 用法：node tools/build-pharmacy-buffs.mjs [--check]
 *   --check 只校验不写文件（CI/冒烟用）
 *
 * 幂等：按 buff_id 覆盖已生成的模板（带 pharmacy_generated 标记），保留其它非制药 buff 原样与顺序。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MATRIX_PATH = path.join(root, 'data', 'pharmacy-buff-matrix.json');
const BUFFS_PATH = path.join(root, 'data', 'buffs.json');
const CHECK_ONLY = process.argv.includes('--check');

const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
const doc = JSON.parse(fs.readFileSync(BUFFS_PATH, 'utf8'));
const buffs = Array.isArray(doc.buffs) ? doc.buffs : [];

const TRIGGER = {
  triggerEventKind: ['world'],
  triggerEventName: ['tick_advanced'],
  triggerTags: ['time', 'tick']
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 按 scale 缩放单条 effect：*_multiplier 只缩放超出 1 的部分，其余按比例线性缩放。 */
function scaleEffect(effect, scale) {
  const type = String(effect.type || '');
  const params = effect.params || {};
  const out = {};
  const keys = Object.keys(params);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = params[k];
    if (typeof v !== 'number' || !isFinite(v)) {
      out[k] = v;
      continue;
    }
    if (/multiplier$/.test(k) || /_pct$/.test(k) || /_ratio$/.test(k)) {
      // 倍率类：1 + (v-1)*scale（如 1.08 → 1.04/1.08/1.12）
      out[k] = round2(v === 0 ? 0 : (v > 1 ? 1 + (v - 1) * scale : v * scale));
    } else {
      out[k] = round2(v * scale);
    }
  }
  return { type: type, params: out };
}

function buildTemplate(spec) {
  const route = matrix.route_profiles[spec.route];
  const potency = matrix.potency_profiles[spec.potency];
  const scale = round2((route.peak != null ? route.peak : 1) * (potency.scale != null ? potency.scale : 1));
  const buffId = 'buff_pharm_' + spec.family + '_' + spec.route + '_' + spec.potency;
  return {
    buff_id: buffId,
    name: spec.familyName + '·' + route.name + '·' + potency.name,
    desc: spec.desc + '（' + route.name + '起效 ' + route.onset_ticks + ' tick，持续 ' + route.duration_ticks + ' tick，峰值 ' + scale + '）',
    onsetTicks: route.onset_ticks,
    durationTicks: route.duration_ticks,
    maxStacks: 1,
    stacksAddOnApply: 1,
    priority: 80,
    listenerSide: 'self',
    consumeMode: 'always',
    consumeLayersFixed: 0,
    applyMode: 'always_apply',
    triggerEventKind: TRIGGER.triggerEventKind.slice(),
    triggerEventName: TRIGGER.triggerEventName.slice(),
    triggerTags: TRIGGER.triggerTags.slice(),
    effects: (spec.effects || []).map((e) => scaleEffect(e, scale)),
    expire_effects: [],
    dispel_pool: 'beneficial',
    pharmacy_generated: true,
    pharmacy_family: spec.family,
    pharmacy_route: spec.route,
    pharmacy_potency: spec.potency,
    pharmacy_scope: route.scope,
    pharmacy_peak: scale
  };
}

function buildFlatTemplate(id, name, desc, durationTicks, effects, extra) {
  const t = {
    buff_id: id,
    name: name,
    desc: desc,
    onsetTicks: 0,
    durationTicks: durationTicks,
    maxStacks: 1,
    stacksAddOnApply: 1,
    priority: 85,
    listenerSide: 'self',
    consumeMode: 'always',
    consumeLayersFixed: 0,
    applyMode: 'always_apply',
    triggerEventKind: TRIGGER.triggerEventKind.slice(),
    triggerEventName: TRIGGER.triggerEventName.slice(),
    triggerTags: TRIGGER.triggerTags.slice(),
    effects: effects,
    expire_effects: [],
    pharmacy_generated: true
  };
  const keys = Object.keys(extra || {});
  for (let i = 0; i < keys.length; i++) t[keys[i]] = extra[keys[i]];
  return t;
}

// ---- 1) 剂型矩阵 ----
const generated = [];
const families = matrix.families || {};
Object.keys(families).forEach((family) => {
  const spec = families[family] || {};
  const routes = Array.isArray(spec.routes) ? spec.routes : [];
  routes.forEach((route) => {
    if (!matrix.route_profiles[route]) {
      console.error('[build-pharmacy-buffs] 未知途径: ' + route + '（family ' + family + '）');
      process.exitCode = 1;
      return;
    }
    Object.keys(matrix.potency_profiles || {}).forEach((potency) => {
      generated.push(buildTemplate({
        family: family,
        familyName: spec.name || family,
        route: route,
        potency: potency,
        desc: spec.desc || '',
        effects: spec.effects || []
      }));
    });
  });
});

// ---- 2) 副作用档 ----
Object.keys(matrix.side_effects || {}).forEach((band) => {
  if (band.startsWith('_')) return;
  const s = matrix.side_effects[band];
  generated.push(buildFlatTemplate(
    'buff_pharm_sideeffect_' + band,
    s.name,
    s.desc,
    Math.max(1, parseInt(s.duration_ticks, 10) || 20),
    s.effects || [],
    { pharmacy_side_effect_band: band }
  ));
});

// ---- 3) 配伍相冲结局 ----
Object.keys(matrix.conflict_outcomes || {}).forEach((key) => {
  if (key.startsWith('_')) return;
  const c = matrix.conflict_outcomes[key];
  generated.push(buildFlatTemplate(
    'buff_pharm_conflict_' + key,
    c.name,
    c.desc,
    Math.max(1, parseInt(c.duration_ticks, 10) || 25),
    c.effects || [],
    { pharmacy_conflict_outcome: key }
  ));
});

// ---- 4) 成瘾阶段惩罚 ----
Object.keys(matrix.addiction_stages || {}).forEach((key) => {
  if (key.startsWith('_')) return;
  const a = matrix.addiction_stages[key];
  generated.push(buildFlatTemplate(
    'buff_pharm_addiction_' + key,
    a.name,
    a.desc,
    Math.max(1, parseInt(a.duration_ticks, 10) || 1),
    [{ type: 'pharmacy_addiction_penalty', params: { penalty_pct: a.penalty_pct } }],
    { pharmacy_addiction_stage: Math.max(1, parseInt(a.stage, 10) || 1) }
  ));
});

// ---- 合并：同 id 覆盖，其余保留 ----
const byId = new Map();
buffs.forEach((b, idx) => {
  if (b && b.buff_id) byId.set(b.buff_id, idx);
});
let added = 0;
let replaced = 0;
generated.forEach((tpl) => {
  if (byId.has(tpl.buff_id)) {
    buffs[byId.get(tpl.buff_id)] = tpl;
    replaced++;
  } else {
    buffs.push(tpl);
    byId.set(tpl.buff_id, buffs.length - 1);
    added++;
  }
});

// 清理源表里已删除的旧生成项（只删带 pharmacy_generated 且不在本次生成集合内的）
const keepIds = new Set(generated.map((t) => t.buff_id));
const kept = [];
let removed = 0;
buffs.forEach((b) => {
  if (b && b.pharmacy_generated === true && b.buff_id && !keepIds.has(b.buff_id)) {
    removed++;
    return;
  }
  kept.push(b);
});

doc.buffs = kept;
console.log('[build-pharmacy-buffs] 生成 ' + generated.length + ' 条（新增 ' + added + ' / 覆盖 ' + replaced + ' / 清理 ' + removed + '），buffs 总数 ' + kept.length);
if (!CHECK_ONLY) {
  fs.writeFileSync(BUFFS_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('[build-pharmacy-buffs] 写入 ' + BUFFS_PATH);
}

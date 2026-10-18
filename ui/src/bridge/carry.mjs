// These two fields were public by default before migration. Missing new fields
// must not inherit that default; a throwing knowledge rule fails closed.
/** @param {unknown} rule @param {unknown[]} args */
function allowed(rule, args = []) {
  try { return rule == null ? true : typeof rule === 'function' ? !!rule(...args) : !!rule; }
  catch { return false; }
}
/** @param {unknown} value */
function finite(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

/** @param {any} g Existing game modules. @param {boolean} ready */
export function readCarry(g, ready) {
  const empty = { ready, available: false, current: null, capacity: null, remaining: null, ratio: 0, weight: null, weightKnown: false };
  if (!ready || !g.SceneCtx || !g.CharacterAttributes || !g.InventoryEquipment || !g.Survival) return empty;
  if (!allowed(g.SceneCtx.leftHudBlockVisibilityRules?.carry)) return empty;
  const state = g.Survival.getState();
  const weightKnown = allowed(g.SceneCtx.survivalMetricVisibilityRules?.weight, [state, 'weight']);
  const current = finite(g.InventoryEquipment.getCurrentCarryWeight());
  const capacity = finite(g.CharacterAttributes.getCarryCapacity());
  return {
    ready, available: true, current, capacity,
    remaining: current != null && capacity != null ? Math.max(0, capacity - current) : null,
    ratio: current != null && capacity != null && capacity > 0 ? Math.max(0, Math.min(100, current / capacity * 100)) : 0,
    weightKnown,
    weight: weightKnown ? finite(state?.weight_kg) : null,
  };
}

/** @param {number | null} value */
export function formatReading(value) {
  return value == null || !Number.isFinite(value) ? '—' : String(Number(value.toFixed(1)));
}

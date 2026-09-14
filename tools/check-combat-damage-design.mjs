// Independent arithmetic checks for design 49, not production-engine tests.
import assert from 'node:assert/strict';

const near = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
};
const fist = s => s <= 150 ? 0.7 * s : 105 + 220 * (1 - Math.exp(-(s - 150) / 450));
const innateBonus = (innate, baseline = 20) => Math.max(0, innate - baseline) * 0.1;
const weapon = (power, innate, req) => {
  if (req > 0 && innate < req / 2) return null;
  return power * (req > 0 ? Math.min(1, innate / req) : 1);
};
const byType = (components, increases) => {
  const result = { blunt: 0, slash: 0, pierce: 0 };
  for (const c of components) {
    // Keep ancestry until all conversions finish; apply each distinct type once.
    result[c.type] += c.amount * [...new Set(c.path)].reduce((m, t) => m * (1 + (increases[t] || 0)), 1);
  }
  return result;
};
const total = typed => Object.values(typed).reduce((sum, x) => sum + x, 0);

// Percentages use the source-stage basis, while actual transfers consume its remainder.
function convert(components, bs, bp, sp) {
  const afterBlunt = components.flatMap(c => {
    if (c.type !== 'blunt') return [c];
    const slash = Math.min(c.amount, c.amount * bs);
    const pierce = Math.min(c.amount - slash, c.amount * bp);
    return [
      { ...c, amount: c.amount - slash - pierce },
      { type: 'slash', amount: slash, path: [...c.path, 'slash'] },
      { type: 'pierce', amount: pierce, path: [...c.path, 'pierce'] },
    ];
  });
  return afterBlunt.flatMap(c => {
    if (c.type !== 'slash') return [c];
    const moved = Math.min(c.amount, c.amount * sp);
    return [
      { ...c, amount: c.amount - moved },
      { type: 'pierce', amount: moved, path: [...c.path, 'pierce'] },
    ];
  });
}
const blunt100 = [{ type: 'blunt', amount: 100, path: ['blunt'] }];
const increases = { blunt: 0.5, slash: 0.4, pierce: 0.2 };

// A: actor-side formula and costly overexertion.
const growth = 1 + 1 + 0.5 + 0.8 + 0.2;
near(growth, 3.5);
near(100 * growth * 1.4 * 1.1 * 0.8, 431.2);
near(100 * growth * 1.4 * 1.1 * 4, 2156);
assert.equal(19 < 10 * 2, true);

// B: fixed damage participates in the snapshot, derived damage inherits its source.
const snapshot = { blunt: 100 + 20, slash: 0, pierce: 0 };
const b = byType([
  { type: 'blunt', amount: snapshot.blunt, path: ['blunt'] },
  { type: 'pierce', amount: snapshot.blunt * 0.2, path: ['blunt', 'pierce'] },
], { blunt: 0.5, pierce: 0.5 });
near(b.blunt, 180);
near(b.pierce, 54);
near(total(b), 234);
// A second percentage effect uses the same snapshot, not newly derived pierce damage.
near(snapshot.pierce * 0.5, 0);

// C: over-100% conversion never manufactures damage; later conversion retains ancestry.
const exhausted = byType(convert(blunt100, 0.8, 0.6, 0), {});
near(exhausted.blunt, 0);
near(exhausted.slash, 80);
near(exhausted.pierce, 20);
const chained = byType(convert(blunt100, 0.8, 0, 0.5), increases);
near(chained.blunt, 30);
near(chained.slash, 84);
near(chained.pierce, 100.8);
near(total(chained), 214.8);
// Same-type increase cannot apply twice even if the ancestry contains duplicates.
near(total(byType([{ type: 'slash', amount: 100, path: ['blunt', 'slash', 'slash'] }], increases)), 210);

// D: shared shield budget, one flexibility evaluation per segment, late rounding.
const afterParry = [100, 100].map(x => x * 0.8);
const ideal = afterParry.map((x, i) => x * [0.3, 0.1][i]);
const shield = 16;
const budgetRatio = Math.min(1, shield / total(ideal));
const absorbed = ideal.map(x => x * budgetRatio);
near(absorbed[0], 12);
near(absorbed[1], 4);
near(shield - total(absorbed), 0);
const afterShield = afterParry.map((x, i) => x - absorbed[i]);
const flexFactor = 1 - 144 / (144 + 3 * total(afterShield));
const afterFlex = afterShield.map(x => x * flexFactor);
near(afterFlex[0], 51);
near(afterFlex[1], 57);
const damage = (afterFlex[0] * 0.8 + afterFlex[1] * 1.2) * (1 + 0.3 + 0.2 - 0.1);
near(damage, 152.88);
assert.equal(Math.floor(damage), 152);
assert.equal(Math.floor(Math.floor(damage) * 0.3), 45);

// E: all three conversion routes, with different paths ending at pierce.
const routes = byType(convert(blunt100, 0.8, 0.6, 0.5), increases);
near(routes.blunt, 0);
near(routes.slash, 84);
near(routes.pierce, 36 + 100.8);
near(total(routes), 220.8);
const noIncreases = byType(convert(blunt100, 0.8, 0.6, 0.5), {});
near(noIncreases.slash, 40);
near(noIncreases.pierce, 60);

// F: each segment receives full flat damage; one common outgoing condition multiplier.
const segment = (50 + 10) * (1 + 0.3 + 0.2);
near(segment, 90);
near(segment * 2, 180);
near(10 * 1.5 * 2, 30);
near([true, false].reduce((sum, hit) => sum + (hit ? Math.floor(segment) : 0), 0), 90);

// G: actor condition snapshot per action, target vulnerability snapshot per segment.
let stacks = 0;
function twoSegments() {
  const actorMultiplier = 1 + stacks * 0.05;
  return Array.from({ length: 2 }, () => {
    const takenMultiplier = 1 + stacks * 0.1;
    const resolved = Math.floor(100 * actorMultiplier * takenMultiplier);
    stacks += 1;
    return resolved;
  });
}
assert.deepEqual(twoSegments(), [100, 110]);
assert.equal(stacks, 2);
assert.equal(twoSegments()[0], 132);

// H: shared curve, no early floor, innate baseline independent of learning eligibility.
near(fist(21), 14.7);
near(fist(150), 105);
near(fist(600), 244.066522942);
assert.equal(Math.floor(fist(21) * 1.4), 20);
assert.equal(Math.floor(Math.floor(fist(21)) * 1.4), 19);
near(innateBonus(28), 0.8);
near(innateBonus(18), 0);
near(weapon(35, 15, 20), 26.25);
assert.equal(Math.floor(weapon(35, 15, 20) * 1.4), 36);
assert.equal(weapon(35, 9, 20), null);
near(weapon(35, 10, 20), 17.5);
near(weapon(35, 20, 20), 35);
near(weapon(35, 0, 0), 35);

console.log('PASS: design examples A–H and boundary checks. Independent specification arithmetic only; production engine not exercised.');

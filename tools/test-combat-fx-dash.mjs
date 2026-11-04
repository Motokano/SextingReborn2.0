import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../js/combat-fx-dash.js', import.meta.url), 'utf8'), sandbox);
const D = sandbox.CombatFxDash;
const project = p => ({ x: (p.x - p.y) * 72, y: (p.x + p.y) * 72 / Math.SQRT2 });
const path = [{ x: 0, y: 2 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
const route = D.prepare(path, project), d = D.durations(route);
assert.equal(d.total / 1.5, 345);
assert.equal(D.durations(D.prepare(path.slice(0, 2), project)).total / 1.5, 240);
function onRoute(p) {
  return route.segments.some(s => {
    const dx = p.x - s.a.x, dy = p.y - s.a.y;
    return Math.abs(dx * s.dy - dy * s.dx) < 1e-7 && dx * s.dx + dy * s.dy >= -1e-7 && dx * s.dx + dy * s.dy <= s.length + 1e-7;
  });
}
for (const [i, distance] of route.cumulative.entries()) {
  const p = D.sample(route, distance / route.length);
  assert.ok(Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y) < 1e-7, 'exact corner visit');
}
let previous = 0;
for (let age = d.push; age <= d.total + 500; age += 1) {
  const s = D.stateAt(route, age);
  assert.ok(onRoute(s), 'no corner cutting or endpoint overshoot');
  assert.ok(s.progress >= previous, 'movement never reverses'); previous = s.progress;
  const ghosts = D.ghostsAt(route, age);
  assert.ok(ghosts.length <= 2); ghosts.forEach(g => assert.ok(onRoute(g), 'ghost follows travelled segments'));
  const particles = D.particlesAt(route, age, 1, 29);
  assert.deepEqual(particles, D.particlesAt(route, age, 1, 29), 'seeking is deterministic');
  particles.forEach(p => assert.ok(Number.isFinite(p.x + p.y + p.size + p.alpha) && p.alpha >= 0 && p.alpha <= 1));
}
assert.equal(D.particlesAt(route, -1).length, 0);
assert.equal(D.particlesAt(route, d.total + 500).length, 0);
assert.equal(D.ghostsAt(route, d.total + 500).length, 0);
assert.equal(D.stateAt(route, d.total).progress, 1);
assert.throws(() => D.prepare([path[0]], project));
assert.throws(() => D.prepare([path[0], path[0]], project));
// Fixture legality only, not proof that live AI pathfinding is implemented.
const blocked = new Set(['1,2']);
for (let i = 1; i < path.length; i++) {
  const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
  assert.equal(Math.max(Math.abs(dx), Math.abs(dy)), 1);
  assert.ok(!blocked.has(`${b.x},${b.y}`));
  if (dx && dy) { assert.ok(!blocked.has(`${a.x + dx},${a.y}`)); assert.ok(!blocked.has(`${a.x},${a.y + dy}`)); }
}
const resized = D.prepare(path, p => { const q = project(p); return { x: q.x * 1.3, y: q.y * 1.3 }; });
for (let age = 0; age <= d.total; age += 7) {
  const a = D.stateAt(route, age), b = D.stateAt(resized, age, 1.3);
  assert.ok(Math.abs(a.x * 1.3 - b.x) < 1e-7 && Math.abs(a.y * 1.3 - b.y) < 1e-7, 'scale does not change motion or timing');
}
console.log('PASS: path corners, endpoint, monotonic motion, ghost limit, deterministic dust, fixture legality, scaling and timing.');

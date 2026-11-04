/** Arrow-step v1, visually approved 2026-10-31: no combat or world mutation.
 * Paths include the start and every visited tile; caller supplies a committed legal path.
 * All times are unscaled animation milliseconds, played at 1.5x by default.
 * Visibility/occlusion must be clipped by the scene compositor at runtime.
 */
(function (global) {
  'use strict';
  const clamp = n => Math.max(0, Math.min(1, n));
  const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const timing = Object.freeze({ push: 90, travelMin: 180, travelPerStep: 52.5, brake: 90, dustLife: 330, ghostDelay: 57, ghostLife: 135 });
  const palette = ['#a79c7d', '#c8af87', '#887d64', '#625e50'];

  function prepare(path, project) {
    if (!Array.isArray(path) || path.length < 2) throw new TypeError('Dash needs a start and destination');
    const points = path.map(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Invalid dash tile');
      const q = project(p);
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) throw new TypeError('Invalid dash projection');
      return { x: q.x, y: q.y };
    });
    const segments = [], cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!length) throw new RangeError('Repeated dash waypoint');
      segments.push({ a, b, length, dx: (b.x - a.x) / length, dy: (b.y - a.y) / length });
      cumulative.push(cumulative[i - 1] + length);
    }
    return { points, segments, cumulative, length: cumulative.at(-1), steps: path.length - 1 };
  }

  function durations(route) {
    const travel = timing.travelMin + (Math.min(4, route.steps) - 1) * timing.travelPerStep;
    return { push: timing.push, travel, brake: timing.brake, total: timing.push + travel + timing.brake };
  }

  function sample(route, fraction) {
    const distance = clamp(fraction) * route.length;
    let i = route.segments.findIndex((s, n) => distance <= route.cumulative[n + 1]);
    if (i < 0) i = route.segments.length - 1;
    const s = route.segments[i], q = clamp((distance - route.cumulative[i]) / s.length);
    return { x: s.a.x + (s.b.x - s.a.x) * q, y: s.a.y + (s.b.y - s.a.y) * q, dx: s.dx, dy: s.dy, segment: i, distance };
  }

  function stateAt(route, age, scale = 1) {
    const d = durations(route);
    let progress = 0, phase = 'idle';
    if (age >= 0 && age < d.push) phase = 'push';
    else if (age >= d.push && age < d.push + d.travel) {
      phase = 'travel';
      const q = (age - d.push) / d.travel;
      progress = .91 * Math.pow(q, 1.15);
    } else if (age >= d.push + d.travel && age < d.total) {
      phase = 'brake';
      const q = (age - d.push - d.travel) / d.brake;
      progress = .91 + .09 * (1 - Math.pow(1 - q, 3));
    } else if (age >= d.total) { phase = 'settled'; progress = 1; }
    const p = sample(route, progress);
    if (phase === 'push') {
      const back = Math.sin(age / d.push * Math.PI) * 2.5 * scale;
      p.x -= p.dx * back; p.y -= p.dy * back;
    }
    return { ...p, phase, progress, duration: d.total };
  }

  // Each ghost samples its own earlier path position; never interpolate across a corner.
  function ghostsAt(route, age, scale = 1) {
    const d = durations(route), ghosts = [];
    if (age < d.push || age > d.total + timing.ghostLife) return ghosts;
    for (let i = 2; i >= 1; i--) {
      const earlier = age - timing.ghostDelay * i;
      if (earlier < d.push || earlier >= d.push + d.travel) continue;
      const fade = clamp((d.total + timing.ghostLife - age) / timing.ghostLife);
      ghosts.push({ ...stateAt(route, earlier, scale), alpha: (i === 1 ? .23 : .11) * fade });
    }
    return ghosts;
  }

  // Stateless deterministic emissions allow seeking/replay without particle caches.
  function particlesAt(route, age, scale = 1, seed = 1) {
    const d = durations(route), out = [];
    function emit(at, point, count, kind, key) {
      const elapsed = age - at;
      if (elapsed < 0 || elapsed > timing.dustLife) return;
      for (let i = 0; i < count; i++) {
        const n = seed * 913 + key * 53 + i * 7, r = noise(n), side = (noise(n + 1) - .5) * 2;
        const life = timing.dustLife * (.65 + noise(n + 2) * .35), q = elapsed / life;
        if (q >= 1) continue;
        const isTrail = kind === 'trail', dir = kind === 'brake' ? 1 : -1;
        const speed = (isTrail ? 13 : 23) + r * (isTrail ? 15 : 22);
        const across = side * (isTrail ? 13 : 28), drift = 1 - Math.pow(1 - q, 2);
        const x = point.x + (point.dx * dir * (12 + speed * drift) - point.dy * across * drift) * scale;
        const y = point.y + (point.dy * dir * (12 + speed * drift) + point.dx * across * drift * .65 + 6 - Math.sin(q * Math.PI) * (5 + r * 13)) * scale;
        const size = (isTrail ? 4.8 : 6.8) * (.65 + noise(n + 3) * .8) * (1 + q * .7) * scale;
        out.push({ x, y, size, alpha: (isTrail ? .48 : .66) * Math.pow(1 - q, 1.3) * Math.min(1, elapsed / 18), color: palette[i % palette.length], seed: n, kind, chip: i % 5 === 0 });
      }
    }
    emit(24, sample(route, 0), 16, 'push', 1);
    let serial = 0;
    for (let at = d.push + 12; at < d.push + d.travel; at += 30) {
      emit(at, stateAt(route, at, scale), 5, 'trail', 10 + serial++);
    }
    emit(d.push + d.travel + 12, sample(route, 1), 15, 'brake', 100);
    return out;
  }

  function drawDust(ctx, particles) {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
      ctx.beginPath();
      const sides = p.chip ? 4 : 8, size = p.size * (p.chip ? .32 : 1);
      for (let i = 0; i < sides; i++) {
        const angle = i / sides * Math.PI * 2, r = size * (.78 + noise(p.seed + i) * .22);
        const x = p.x + Math.cos(angle) * r, y = p.y + Math.sin(angle) * r * .62;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  global.CombatFxDash = Object.freeze({ timing, prepare, durations, sample, stateAt, ghostsAt, particlesAt, drawDust });
})(typeof window !== 'undefined' ? window : globalThis);

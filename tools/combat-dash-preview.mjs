// Visual fixtures only. No AI, cooldown, save state or damage is simulated here.
const $ = id => document.getElementById(id);
const D = window.CombatFxDash, P = window.CombatFxPresentation, paint = window.CombatFxPaint;
const canvas = $('stage'), ctx = canvas.getContext('2d');
const projection = MapProjection.create({ width: 7, height: 6 }, 144 / Math.SQRT2, 'isometric');
const start = { x: 0, y: 2 }, target = { x: 4, y: 2 };
const fixtures = {
  straight: { path: [start, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }], obstacles: [], note: '目标 4 格外，前冲 3 步。' },
  detour: { path: [start, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], obstacles: [{ x: 1, y: 2 }], note: '绕过低矮箱子，走 4 步到邻格。路线不会切过障碍角。' }
};
const startAt = 600, length = 3000;
let scene = 'straight', time = 0, last = 0, speed = 1.5, zoom = 1, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let width = 800, height = 430, pawns, obstacle;

async function loadImage(src) { const image = new Image(); image.src = src; await image.decode(); return image; }
function preparePawn(image, crop, anchor, width) {
  const scale = width / crop[2];
  return { image, crop, width, height: crop[3] * scale, ax: (anchor[0] - crop[0]) * scale, ay: (anchor[1] - crop[1]) * scale,
    shadow: TileRendererV2.makeGroundShadow(image, { crop, anchor, width }, [28.75, 8.75]) };
}
function view() {
  const center = projection.cellCenter(2, 2);
  const project = p => { const q = projection.cellCenter(p.x, p.y); return { x: width * .49 + (q.x - center.x) * zoom, y: height * .62 + (q.y - center.y) * zoom }; };
  return { scale: zoom, heightScale: 1.25, project, direction: (x, y) => projection.directionVector(x, y) };
}
function polygon(points, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function cell(p, v, fill, stroke, lineWidth = 1) {
  const c = v.project(p), hw = 72 * zoom, hh = 144 / Math.SQRT2 / 2 * zoom;
  polygon([{ x: c.x, y: c.y - hh }, { x: c.x + hw, y: c.y }, { x: c.x, y: c.y + hh }, { x: c.x - hw, y: c.y }], fill, stroke, lineWidth);
}
function floor(v, fixture) {
  ctx.fillStyle = '#29382d'; ctx.fillRect(0, 0, width, height);
  for (let y = -4; y <= 9; y++) for (let x = -4; x <= 9; x++) {
    const p = { x, y }, q = v.project(p), variant = Math.abs((x * 13 + y * 7) % 5);
    if (q.x < -144 * zoom || q.x > width + 144 * zoom || q.y < -100 * zoom || q.y > height + 100 * zoom) continue;
    cell(p, v, ['#485447', '#4c584a', '#4b5749', '#4e594b', '#465244'][variant], '#1d2b224d');
    // Quiet ground grain; not a new texture asset or gameplay obstacle.
    ctx.fillStyle = '#a3a4840a'; ctx.fillRect(q.x - 12 * zoom, q.y - 6 * zoom, 17 * zoom, 2 * zoom);
  }
  const fade = ctx.createRadialGradient(width * .5, height * .56, 60, width * .5, height * .56, width * .65);
  fade.addColorStop(0, '#17291b00'); fade.addColorStop(1, '#12241bc4'); ctx.fillStyle = fade; ctx.fillRect(0, 0, width, height);
  cell(target, v, '#cab5740a', '#c3b47777');
  if ($('route').checked) {
    fixture.path.forEach((p, i) => { cell(p, v, '#ddc67a12', '#b9aa6a88'); const q = v.project(p); ctx.fillStyle = '#bfb78e'; ctx.font = '10px "Microsoft YaHei"'; ctx.textAlign = 'center'; ctx.fillText(String(i), q.x, q.y + 30 * zoom); });
    const route = fixture.path.map(v.project); ctx.beginPath(); route.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.setLineDash([4, 7]); ctx.lineWidth = 1.2; ctx.strokeStyle = '#d0c38888'; ctx.stroke(); ctx.setLineDash([]);
    fixture.obstacles.forEach(p => cell(p, v, '#a0644926', '#b37a55aa'));
  }
}
function drawPawn(pawn, p, alpha = 1, shadow = true) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x, p.y); ctx.scale(zoom, zoom);
  if (shadow) ctx.drawImage(pawn.shadow, -64, -32, 160, 88);
  ctx.drawImage(pawn.image, ...pawn.crop, -pawn.ax, 8 - pawn.ay, pawn.width, pawn.height);
  ctx.restore();
}
function drawObstacle(p, v) {
  const q = v.project(p), { image, spec, tileWidth } = obstacle;
  const scale = 144 * tileWidth / spec.bodyWidth * zoom;
  ctx.drawImage(image, ...spec.crop, q.x + (spec.crop[0] - spec.anchor[0]) * scale, q.y + (spec.crop[1] - spec.anchor[1]) * scale, spec.crop[2] * scale, spec.crop[3] * scale);
}
function attackFor(fixture, route) {
  const at = startAt + D.durations(route).total;
  return { actor: 'veteran', target: 'player', move: 'swing_punch', side: 'right', segment: 0, result: 'hit', powerFactor: 1, part: 'head', from: fixture.path.at(-1), to: target, at, hitAt: at + paint.accents.swing_punch.windup };
}
function draw() {
  if (!pawns) return;
  const v = view(), fixture = fixtures[scene], route = D.prepare(fixture.path, v.project), age = time - startAt;
  const st = D.stateAt(route, age, zoom), attack = attackFor(fixture, route), events = $('follow').checked ? [attack] : [];
  ctx.clearRect(0, 0, width, height); floor(v, fixture);
  const particles = D.particlesAt(route, age, zoom, 29);
  const isFront = p => p.kind === 'brake' && p.y > st.y + 6 * zoom;
  D.drawDust(ctx, particles.filter(p => !isFront(p)));
  const units = D.ghostsAt(route, age, zoom).map(g => ({ y: g.y, draw: () => drawPawn(pawns.veteran, g, g.alpha, false) }));
  const enemyOffset = P.pawnOffset('veteran', events, time, v.project, zoom);
  const playerOffset = P.pawnOffset('player', events, time, v.project, zoom), pp = v.project(target);
  units.push({ y: st.y, draw: () => drawPawn(pawns.veteran, { x: st.x + enemyOffset.x, y: st.y + enemyOffset.y }) });
  units.push({ y: pp.y, draw: () => drawPawn(pawns.player, { x: pp.x + playerOffset.x, y: pp.y + playerOffset.y }) });
  fixture.obstacles.forEach(p => units.push({ y: v.project(p).y, draw: () => drawObstacle(p, v) }));
  units.sort((a, b) => a.y - b.y).forEach(u => u.draw());
  // A small foreground fraction gives the braking dust depth without hiding the pawn.
  D.drawDust(ctx, particles.filter(isFront));
  for (const e of events) P.drawStrike(ctx, e, time, v, events);
  const striking = events.length && time >= attack.at && time <= attack.hitAt + 300;
  let phase = { idle: '锁定目标', push: '蹬地发力', travel: '箭步 · 疾冲', brake: '刹步落位', settled: '位移完成' }[st.phase];
  if (striking) phase = time < attack.hitAt ? '接摆拳' : '摆拳命中';
  $('phase').textContent = phase;
  for (const el of document.querySelectorAll('[data-beat]')) el.classList.toggle('active', el.dataset.beat === st.phase || el.dataset.beat === 'brake' && striking);
  $('timeline').value = String(time); $('time').textContent = (time / 1500).toFixed(2) + 's'; $('play').textContent = playing ? '暂停' : '播放';
}
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  width = r.width; height = r.height; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
}
function replay(next = scene) {
  scene = next; time = 0; playing = true; last = performance.now();
  document.querySelectorAll('[data-scene]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === scene)));
  $('route-note').textContent = fixtures[scene].note;
  const url = new URL(location.href); url.searchParams.set('scene', scene); history.replaceState(null, '', url); draw();
}
function freeze(which) {
  const route = D.prepare(fixtures[scene].path, view().project), d = D.durations(route);
  time = startAt + (which === 'push' ? 65 : which === 'rush' ? d.push + d.travel * .68 : d.push + d.travel + 62);
  playing = false; draw();
}
function frame(now) {
  if (playing && !document.hidden) {
    time += P.frameDelta(now - last) * speed;
    if (time >= length) { if ($('loop').checked) time %= length; else { time = length; playing = false; } }
    draw();
  }
  last = now; requestAnimationFrame(frame);
}
async function boot() {
  const [manifest, art, veteran] = await Promise.all([
    fetch('assets/map/isometric/player-atlas-v1/manifest.json').then(r => { if (!r.ok) throw new Error('主角图册读取失败'); return r.json(); }),
    fetch('assets/dungeon/grid-scene-v1/manifest.json').then(r => { if (!r.ok) throw new Error('场景素材读取失败'); return r.json(); }),
    loadImage('assets/map/isometric/street-thug-veteran-v1/standing.png')
  ]);
  const state = manifest.states.find(s => s.id === 'D000'), catalog = art.catalog['abandoned-chest-v1'];
  const [player, chest] = await Promise.all([loadImage('assets/map/isometric/player-atlas-v1/' + state.file), loadImage(catalog.unsearched.src)]);
  const factor = TileRendererV2.getPawnDisplayScale();
  pawns = { veteran: preparePawn(veteran, [226, 66, 752, 1168], [602, 1234], 46 * factor), player: preparePawn(player, state.crop, [state.crop[0] + state.anchor[0], state.crop[1] + state.anchor[1]], state.crop[2] * manifest.displayBaseWidth * factor / state.baseWidth) };
  obstacle = { image: chest, spec: catalog.unsearched, tileWidth: catalog.tileWidth };
  document.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => replay(b.dataset.scene));
  $('play').disabled = false; $('replay').disabled = false;
  $('play').onclick = () => { if (time >= length) time = 0; playing = !playing; last = performance.now(); draw(); };
  $('replay').onclick = () => replay();
  $('timeline').oninput = () => { time = Number($('timeline').value); playing = false; draw(); };
  $('speed').onchange = () => { speed = Number($('speed').value); };
  $('zoom').onchange = () => { zoom = Number($('zoom').value); canvas.style.height = `${430 * zoom}px`; $('scale-note').textContent = zoom === 1 ? '144px 格宽 · 人物 125%' : '放大 1.3 倍 · 人物比例不变'; resize(); };
  $('route').onchange = draw; $('follow').onchange = draw;
  ['push', 'rush', 'brake'].forEach(which => $(`freeze-${which}`).onclick = () => freeze(which));
  new ResizeObserver(resize).observe(canvas); resize();
  const requested = new URLSearchParams(location.search).get('scene');
  if (requested in fixtures) { scene = requested; $('route-note').textContent = fixtures[scene].note; document.querySelectorAll('[data-scene]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === scene))); }
  last = performance.now(); draw(); requestAnimationFrame(frame);
}
boot().catch(error => { playing = false; $('phase').textContent = '素材加载失败，请重试'; $('route-note').textContent = error.message; console.error(error); });

// Thin terminal shell for the same disposable logic used by the browser prototype.
import readline from 'node:readline';
import { initialState, profile, transition, modifyReason, craftReason, refillPlan, encodeSave, decodeSave, AFFIXES, INSERTS, MODIFICATIONS } from './water-flask-prototype-model.mjs';
let state = initialState();
let snapshot = null;
const commands = {
  d: { type: 'drink' }, f: { type: 'refill' }, e: { type: 'equip' },
  h: { type: 'scene' }, t: { type: 'wait', ticks: 1 }, T: { type: 'wait', ticks: 5 },
  '0': { type: 'plan-insert', value: 'none' }, '1': { type: 'plan-insert', value: 'slow' },
  '2': { type: 'plan-insert', value: 'breath' }, m: { type: 'modify' },
  x: { type: 'materials', value: 'empty' }, z: { type: 'materials', value: 'restock' },
  s: { type: 'affix', value: 'economical' },
  k: { type: 'death' }, g: { type: 'craft' },
  '[': { type: 'plan-craft', value: 'iron' }, ']': { type: 'plan-craft', value: 'bamboo' },
  B: { type: 'scenario', value: 'bamboo_source' }, I: { type: 'scenario', value: 'iron_source' },
  N: { type: 'scenario', value: 'bamboo_near_full' }, u: { type: 'source-drink' },
  b: { type: 'affix', value: 'replenishing' }, n: { type: 'affix', value: 'none' },
  c: { type: 'scenario', value: 'full' }, l: { type: 'scenario', value: 'low' }, r: { type: 'reset' }
};
function render() {
  if (process.stdout.isTTY) console.clear();
  console.log('\x1b[1m水壶基底 · 逻辑试玩\x1b[0m');
  console.log(JSON.stringify({
    tick: state.tick, location: state.location, equipped: state.equipped,
    flask: state.flask, player: state.player, affix: state.flask ? AFFIXES[state.flask.affix].name : null,
    insert: state.flask ? INSERTS[state.flask.insert].name : null, profile: profile(state), active: state.active,
    materials: state.materials, plan: MODIFICATIONS[state.plannedInsert], modifyBlocked: modifyReason(state),
    craftBlocked: craftReason(state), recipeKnown: state.workshop.recipeKnown, flaskSerial: state.flaskSerial,
    source: state.source, refillPlan: refillPlan(state)
  }, null, 2));
  console.log(state.log[0]?.text);
  console.log('\x1b[2m[d]喝水 [f]装满 [e]装卸 [h]出门/回家 [t/T]1/5刻\n[0/1/2]预览普通/缓释/调息 [m]耗材改造 [x/z]清空/补充试玩材料\n[n/s/b]无/节流/润泽 [c]饮水满 [l]余水不足 [r]重置 [q]退出\x1b[0m');
  console.log('[k]模拟死亡 [g]制作水壶　输入 [ 选铁皮、] 选青竹　[S/L]保存/载入内存快照（退出后丢弃）');
  console.log('[B/I]青竹/铁皮空壶＋40水 [N]青竹已装190＋40水 [f]水源装壶 [u]直接喝水源');
}
render();
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
input.on('line', line => {
  const key = line.trim();
  if (key === 'q') { input.close(); return; }
  if (key === 'S') snapshot = encodeSave(state);
  if (key === 'L' && snapshot) state = decodeSave(snapshot);
  if (commands[key]) state = transition(state, commands[key]);
  render();
});

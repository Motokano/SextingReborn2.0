// PROTOTYPE: percentage rewards after complete actions, using real Muscles and Survival.
// Memory only. No SaveSystem, player inventory, production crafting, or production unlock UI.
import { ACTIONS, STATIONS, MATERIALS, EFFICIENCY, TRAINING_FATIGUE_PER_STAMINA, trainingEfficiency, moduleKey } from './gym-prototype-data.mjs';
const clone = v => JSON.parse(JSON.stringify(v));
const round = n => Math.round(n * 1000000) / 1000000;
const handModules = {
  hands:{name:'手部用具',upgrades:['增加不同阻力握力器','添置张指训练器','扩充握捏训练套装']},
  ankle:{name:'足踝踏台',upgrades:['加固防滑踏台','增加踏板角度调节','添置垫高块与弹力带']},
  toes:{name:'足趾用具',upgrades:['添置弹力带与拾物珠','增加毛巾训练配重','添置平衡软垫与阻力带']}
};
export function createGymPrototype(g, config) {
  const M = g.Muscles, S = g.Survival, G = g.GameTime;
  // This isolated page spends action stamina only on training. Override its local
  // conversion so consumeStamina still settles fatigue exactly once.
  S.setConfig({...config, fatigue_gain_per_stamina_spent:TRAINING_FATIGUE_PER_STAMINA});
  const pristine = clone(S.getState());
  const muscles = M.getGroups().flatMap(gr => M.getMusclesByGroup(gr.id));
  for (const a of ACTIONS) for (const id of [...a.main,...a.assist]) {
    if (!M.getMuscleById(id)) throw Error('训练映射缺失：' + id);
  }
  let state;
  const getAction = id => ACTIONS.find(a => a.id === id);
  const station = id => STATIONS.find(s => s.id === id);
  const log = message => { state.log.unshift(message); state.log = state.log.slice(0,8); };
  function idle() { if (state.job) throw Error('请等待当前动作结束。'); }
  const level = a => state.levels[moduleKey(a)] ?? state.levels[a.station] ?? 0;
  const fatigueRate = () => S.getFatigue() >= 80 ? 0 : S.getFatigue() > 50 ? .5 : 1;
  const percent = id => M.isUnlocked(id) ? 100 : state.progress[id] || 0;
  const efficiency = a => trainingEfficiency(level(a),state.anatomyLevel,g);
  function rewardPreview(a,eff = efficiency(a)) {
    const fatigue = fatigueRate();
    return [...a.main.map(id => ({id,role:'主练',base:a.mainPct})), ...a.assist.map(id => ({id,role:'辅助',base:a.assistPct}))]
      .map(r => ({...r, pct:round(r.base * eff.multiplier * fatigue), before:percent(r.id)}));
  }
  function cost(a) { return S.getActionStaminaCost(a.cost); }
  function fatigueCost(a) { return round(cost(a) * TRAINING_FATIGUE_PER_STAMINA); }
  function trainReason(a) {
    if (!state.levels[a.station]) return '先建造这件设施';
    if (S.isDead()) return '当前角色已失能，请重置试玩';
    if (!fatigueRate()) return '疲劳达到80，需要先睡觉';
    if ([...a.main,...a.assist].every(id => M.isUnlocked(id))) return '本项目的肌肉已全部点亮';
    const passive = config.stamina_passive_drain_per_tick || 0;
    if (S.getStamina() + 1e-8 < cost(a) + passive * a.ticks) return '体力不足，请先休息';
    return '';
  }
  function payNextGroup(job) {
    const a = getAction(job.actionId), why = trainReason(a);
    if (why) { state.job = null; log(why); return false; }
    job.efficiency = efficiency(a); job.rewards = rewardPreview(a,job.efficiency); job.ticks = 0; job.paid = cost(a);
    job.fatigueRate = fatigueRate();
    S.setResting(false); S.setStaminaRegenActionActive(false); S.setSitMeditationActive(false);
    S.consumeStamina(job.paid, {raw:true});
    return true;
  }
  function startTraining(actionId, groups = 1) {
    idle(); const a = getAction(actionId);
    if (!a || ![1,4,8].includes(groups)) throw Error('训练项目无效。');
    const why = trainReason(a); if (why) throw Error(why);
    state.last = null;
    state.job = {kind:'train', actionId, groups, remaining:groups, finished:0, stopAfter:false};
    payNextGroup(state.job);
  }
  function award(job) {
    const changes = [], lit = [];
    for (const r of job.rewards) {
      const before = percent(r.id), after = Math.min(100,round(before + r.pct));
      if (before >= 100) continue;
      state.progress[r.id] = after;
      if (after >= 100 && M.unlock(r.id).ok) lit.push(r.id);
      changes.push({id:r.id,role:r.role,before,after,gain:round(after-before)});
    }
    const a = getAction(job.actionId);
    state.last = {name:a.name,changes,lit,paid:job.paid};
    log(a.name + '完成' + (lit.length ? '，点亮' + lit.map(id=>M.getMuscleById(id).name).join('、') : '，' + changes.length + '块肌肉获得成长'));
  }
  function tick() {
    const j = state.job; if (!j) return;
    S.setResting(j.kind !== 'train');
    try { S.advanceTick({source:j.kind === 'sleep' ? 'sleep' : 'gym_prototype'}); }
    finally { S.setResting(false); }
    j.ticks++;
    if (S.isDead()) { state.job = null; log('当前角色已失能，训练中止。'); return; }
    if (j.kind === 'train') {
      if (j.ticks < getAction(j.actionId).ticks) return;
      award(j); j.remaining--; j.finished++;
      if (j.remaining && !j.stopAfter) payNextGroup(j);
      else state.job = null;
    } else if (j.kind === 'sleep') {
      if (j.ticks >= config.sleep_duration_ticks) { state.job = null; log('睡眠完成。'); }
    } else if (j.ticks >= 10 || j.stopAfter || S.getStamina() >= 100 || S.getSatiety() < 1 || S.getThirst() < 1) {
      state.job = null; log('休息结束，已有疲劳保留。');
    }
  }
  function recover(kind) {
    idle();
    if (S.isDead()) throw Error('请重置试玩。');
    if (kind === 'sleep' && S.getFatigue() <= 50) throw Error('疲劳需要大于50才能入睡。');
    if (kind === 'rest' && (S.getStamina() >= 100 || S.getSatiety() < 1 || S.getThirst() < 1)) throw Error('需要体力未满且有足够补给。');
    state.job = {kind,ticks:0,stopAfter:false};
  }
  function afford(costs) { return Object.entries(costs).every(([id,n]) => state.materials[id] >= n); }
  function spend(costs) {
    if (!afford(costs)) throw Error('材料不足。');
    for (const [id,n] of Object.entries(costs)) state.materials[id] -= n;
  }
  function build(id) {
    idle(); const s = station(id); if (!s || state.levels[id]) return;
    spend(s.build); state.levels[id] = 1;
    state.assignedPlates[id] = s.build.plates || 0; log(s.name + '已建成，基础项目开放。');
  }
  function upgradeInfo(a) {
    const s = station(a.station), lv = level(a), module = handModules[moduleKey(a).replace('handsfeet_','')];
    return {key:moduleKey(a),level:lv,name:module?.name || s.name, title:lv >= 4 ? '已完成全部改进' : (module?.upgrades || s.upgrades)[lv-1],
      costs:lv >= 1 && lv < 4 ? s.upgradeCosts[lv-1] : {}, nextEfficiency:EFFICIENCY[Math.min(4,lv+1)]};
  }
  function upgrade(actionId) {
    idle(); const a = getAction(actionId), u = upgradeInfo(a);
    if (!state.levels[a.station] || u.level >= 4) return;
    spend(u.costs); state.levels[u.key] = u.level+1;
    state.assignedPlates[u.key] = (state.assignedPlates[u.key] || 0) + (u.costs.plates || 0);
    log(u.name + '：' + u.title + '，效率提升至' + u.nextEfficiency.toFixed(2) + '倍。');
  }
  function forgePlates() { idle(); spend({metal:12,parts:2}); state.materials.plates++; log('制成一组配重片，可用于器械改进。'); }
  function eat(kind) {
    idle();
    const isFood = kind === 'food', n = isFood ? S.getSatiety() : S.getThirst();
    if (n >= 100) throw Error(isFood ? '饱食已满。' : '饮水已满。');
    if (!state[kind]) throw Error('试玩补给不足。');
    state[kind]--; isFood ? S.addSatiety(25) : S.addThirst(25);
    if (isFood) for (const c of M.addFoodGrowth()) state.progress[c.id] = c.after;
    log(isFood ? '消耗一份食物，补充饱食。' : '消耗一份饮水，补充饮水。');
  }
  function reset(scenario = 'fresh') {
    state = {anatomyLevel:0,levels:{floor:1},assignedPlates:{},materials:{metal:120,wood:80,parts:60,fiber:60,plates:0},food:20,water:20,progress:{},job:null,last:null,log:[]};
    M.setState({unlocked:{},equipped:{}});
    S.setState({...clone(pristine),stamina:100,fatigue:0,satiety:100,thirst:100,energy:100,weight_kg:60,food_metabolism:null,isDead:false,isComa:false,isResting:false});
    G.reset({totalTicks:0});
    if (scenario === 'built' || scenario === 'maxed') {
      const lv = scenario === 'maxed' ? 4 : 1;
      for (const s of STATIONS) state.levels[s.id] = s.id === 'handsfeet' ? 1 : lv;
      for (const key of Object.keys(handModules)) state.levels['handsfeet_'+key] = lv;
      log(lv === 4 ? '试玩情境：器械满级。' : '试玩情境：器械齐备。');
    } else if (scenario === 'near') {
      state.levels.dumbbell = 1;
      for (const group of ['shoulder_l','shoulder_r']) for (const m of M.getMusclesByGroup(group)) {
        if (m.id.includes('_deltoid_')) state.progress[m.id] = 99.9;
        else { state.progress[m.id] = 100; M.unlock(m.id); }
      }
      log('试玩情境：左右肩带只剩三角肌未点亮，成长度99.90%。');
    } else if (scenario === 'tired') { S.setState({fatigue:65,stamina:30}); log('试玩情境：疲劳65，训练收益减半，可以睡眠。'); }
    else if (scenario === 'low') { S.setState({stamina:5}); log('试玩情境：体力不足，可使用补给进行休息。'); }
    else log('基础训练区已开放，所有肌肉成长度从0%开始。');
  }
  reset();
  return {get state(){return state;},muscles,actions:ACTIONS,stations:STATIONS,materials:MATERIALS,
    getAction,station,percent,cost,fatigueCost,level,fatigueRate,rewardPreview,trainReason,upgradeInfo,afford,efficiency,
    setAnatomyLevel(value){idle();if(!Number.isSafeInteger(value)||value<0)throw Error('解剖学等级无效');state.anatomyLevel=value;},
    setNutrition(value){idle();if(!Number.isFinite(value)||value<0||value>100)throw Error('营养值无效');S.setState({nutrition:value});},
    startTraining,tick,recover,build,upgrade,forgePlates,eat,reset,
    stop(){if(state.job && state.job.kind !== 'sleep') state.job.stopAfter=true;},
    supply(){idle();for(const k of ['metal','wood','parts','fiber'])state.materials[k]+=50;state.food+=10;state.water+=10;log('领取试玩物资：四类材料各50、食物和饮水各10。');},
    intervalMs(){return state.job?.kind === 'sleep' ? config.sleep_tick_seconds*1000 : state.job?.kind === 'rest' ? config.rest_action_auto_tick_seconds*1000 : config.idle_seconds_per_tick*1000;}
  };
}

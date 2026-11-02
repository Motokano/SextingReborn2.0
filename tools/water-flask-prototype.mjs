// Browser controls with a disposable save key; never reads or writes production game saves.
import { initialState, profile, transition, drinkReason, refillReason, refillPlan, sourceDrinkReason, modifyReason, craftReason, encodeSave, decodeSave, describeEffect, AFFIXES, INSERTS, SCENARIOS, MATERIALS, MODIFICATIONS, CRAFT_RECIPES, MODELS } from './water-flask-prototype-model.mjs';

const SAVE_KEY = 'water-flask-prototype:save:v1';
let saveStatus = '本页进度自动保存，刷新后继续';
let saveBlocked = false;
function readProgress() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) { const saved = decodeSave(text); saveStatus = '已恢复上次试玩进度 · 操作后自动保存'; return saved; }
  } catch {
    saveBlocked = true;
    saveStatus = '试玩进度无法读取；可用“恢复初始状态”重新开始';
  }
  return initialState();
}
let state = readProgress();
let workshopOpen = true;
let craftOpen = false;
const app = document.querySelector('#app');
const settings = document.querySelector('#settings');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const num = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
const label = { thirst: '饮水', breath: '底气', stamina: '体力' };
const disabled = reason => reason ? ` disabled title="${escape(reason)}"` : '';

function options(catalog, selected) {
  return Object.entries(catalog).map(([key, entry]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${entry.name}</option>`).join('');
}

function flaskArt() {
  const ratio = state.flask.water / state.flask.capacity;
  // Uses the existing dungeon flask icon silhouette as a schematic; not approved item art.
  const shape = 'M9 3h6v4c6 1 6 5 6 10 0 6-18 6-18 0 0-5 0-9 6-10V3Z';
  return `<svg viewBox="0 0 24 27" role="img" aria-label="${MODELS[state.flask.model].name}示意，剩余${num(state.flask.water)}点水">
    <defs><clipPath id="flask-clip"><path d="${shape}"/></clipPath></defs>
    <ellipse cx="12" cy="24" rx="8" ry="1.2" fill="#101a13"/>
    <path d="M6 10C-1 10 1 23 6 24M18 10c7 0 5 13 0 14" fill="none" stroke="#776e4e" stroke-width=".85"/>
    <path d="${shape}" fill="#354235" stroke="#111a14" stroke-width="1"/>
    <g clip-path="url(#flask-clip)"><rect x="2" y="${23 - ratio * 15}" width="20" height="${ratio * 15}" fill="#567d77" opacity=".84"/>
    ${ratio > 0 ? `<path d="M2 ${23 - ratio * 15}q5 -1.1 10 0t10 0" fill="none" stroke="#9fc3b6" stroke-width=".25"/>` : ''}</g>
    <path d="${shape}" fill="none" stroke="#a5af8a" stroke-width=".35"/>
    <path d="M9 6h6M7 12v5m9-5v5M9 10h6" stroke="#b7c4a0" stroke-width=".3" fill="none" opacity=".7"/>
    <rect x="8.6" y="2.4" width="6.8" height="2.4" rx=".5" fill="#80876b" stroke="#172117" stroke-width=".5"/>
    <path d="M9.8 2.8v1.5m1.5-1.5v1.5m1.5-1.5v1.5m1.5-1.5v1.5" stroke="#b3b99a" stroke-width=".2"/>
    <path d="M8 19h8v2H8z" fill="#b7ad7b" opacity=".8"/><path d="M9 20h6" stroke="#565b42" stroke-width=".25"/>
  </svg>`;
}

function vital(target) {
  return `<div class="vital"><div class="vital-line"><span>${label[target]}</span><b id="${target}-value">${num(state.player[target])} / 100</b></div><div class="meter ${target}" role="meter" aria-label="${label[target]}" aria-valuenow="${state.player[target]}" aria-valuemin="0" aria-valuemax="100"><span style="width:${state.player[target]}%"></span></div></div>`;
}

function workshop() {
  const recipe = MODIFICATIONS[state.plannedInsert];
  const preview = profile({ ...state, flask: { water: 0, affix: 'none', ...state.flask, insert: state.plannedInsert } });
  const reason = modifyReason(state);
  return `<details class="refit" id="refit-details"${workshopOpen ? ' open' : ''}>
    <summary>材料改造 <span>当前：${state.flask ? INSERTS[state.flask.insert].name : '暂无水壶'}</span></summary>
    <div class="refit-body">
      <div class="refit-preview"><label for="insert-plan">选择改造方案</label><select id="insert-plan" data-field="plan-insert">${options(MODIFICATIONS, state.plannedInsert)}</select>
        <p class="preview-label">完成后的饮用效果 · 每次耗水${num(preview.cost)}</p>
        <ul class="effect-list">${preview.effects.map(effect => `<li><span class="effect-dot ${effect.target}"></span>${describeEffect(effect)}</li>`).join('')}</ul>
        <p class="settings-copy">选方案只预览，完成改造后才生效。保留当前存水和词条。</p>
      </div>
      <div class="refit-cost"><table class="material-table" aria-label="改造材料"><thead><tr><th scope="col">所需材料</th><th scope="col">需要</th><th scope="col">持有</th></tr></thead><tbody>${Object.entries(recipe.costs).map(([id, count]) => `<tr${state.materials[id] < count ? ' class="missing"' : ''}><th scope="row">${MATERIALS[id].name}</th><td>${count}</td><td>${state.materials[id]}${state.materials[id] < count ? ' · 不足' : ''}</td></tr>`).join('')}</tbody></table>
        <div class="refit-action"><p>${state.flask && state.flask.insert !== 'none' && state.flask.insert !== state.plannedInsert ? '替换当前改造，旧材料不返还' : '消耗所列材料完成改造'}</p><button id="modify-button" class="primary" data-action="modify" aria-describedby="modify-reason"${disabled(reason)}>改造 · ${recipe.ticks}刻</button></div>
        <p class="refit-reason" id="modify-reason">${escape(reason || '材料齐备，可在家中改造。')}</p>
      </div>
    </div>
  </details>`;
}

function crafting() {
  const reason = craftReason(state);
  const recipe = CRAFT_RECIPES[state.plannedCraft];
  return `<div class="lifecycle"><span>随身水壶死亡丢失 · 配方和家中材料保留</span><button data-action="death">模拟死亡并回家</button></div>
    <details class="refit" id="craft-details"${craftOpen || !state.flask ? ' open' : ''}>
      <summary>制作水壶 <span>${state.workshop.recipeKnown ? '配方已掌握' : '配方未掌握'}</span></summary>
      <div class="refit-body"><div class="refit-preview"><label for="craft-plan">选择水壶配方</label><select id="craft-plan" data-field="plan-craft">${options(CRAFT_RECIPES, state.plannedCraft)}</select><p class="preview-label">容量200 · 空壶 · 无词条 · 无改造</p>
        <p class="settings-copy">${MODELS[state.plannedCraft].detail}</p>
        <p class="settings-copy">研究实物或完整制作记录后学会，已学配方死亡不遗忘。<br>需要${recipe.benchLevel}级制作台${state.plannedCraft === 'iron' ? '、金工工位和修理锤，工具不消耗' : '，使用台体工具'}。</p>
        <p class="settings-copy">本页已备好上述条件，演示成功制作。成品放入背包，需自行装备、装水和改造。</p></div>
        <div class="refit-cost"><table class="material-table" aria-label="水壶制作材料"><thead><tr><th scope="col">家中材料</th><th scope="col">需要</th><th scope="col">持有</th></tr></thead><tbody>${Object.entries(recipe.costs).map(([id, count]) => `<tr${state.materials[id] < count ? ' class="missing"' : ''}><th scope="row">${MATERIALS[id].name}</th><td>${count}</td><td>${state.materials[id]}</td></tr>`).join('')}</tbody></table>
        <div class="refit-action"><p>消耗${recipe.stamina}体力 · 当前${num(state.player.stamina)}</p><button id="craft-button" class="primary" data-action="craft" aria-describedby="craft-reason"${disabled(reason)}>制作水壶 · ${recipe.ticks}刻</button></div><p class="refit-reason" id="craft-reason">${escape(reason || '条件齐备，可制作一只新水壶。')}</p></div></div>
    </details>`;
}

function waterSource() {
  const atHome = state.location === 'home';
  const plan = refillPlan(state);
  const reason = refillReason(state);
  const directReason = sourceDrinkReason(state);
  return `<section class="source-panel" aria-label="水源补给">
    <div class="source-title"><h3>${atHome ? '家中水源' : '地牢补水点'}</h3><span>可选择直接饮用或装入水壶</span></div>
    <div class="source-body"><div><p class="source-stock">水源剩余 <strong id="source-water">${atHome ? '充足' : `${num(state.source.water)}点`}</strong></p>
      <p class="source-formula" id="source-preview">${state.flask ? `取水 <b>${num(plan.taken)}</b> <span>→</span> 入壶 <b>${num(plan.gained)}</b>` : '先取得一只水壶，才能装水带走'}</p>
      <p class="settings-copy">${state.flask?.model === 'bamboo' ? '青竹基底：入壶水量 ×1.6；容量足够时，40点水可装成64点存水。' : '入壶水量按实际取水计算。'}</p>
      <p class="settings-copy">最多装至200；只取所需，余水留在水源。直接饮用按水源原量恢复。</p></div>
      <div class="source-controls"><button id="refill-button" class="primary" data-action="refill" aria-describedby="refill-reason"${disabled(reason)}>${atHome ? '装满水壶' : '倒进水壶'} · 1刻</button><button id="source-drink-button" data-action="source-drink"${disabled(directReason)}>直接从水源喝 · 1刻</button><p class="refit-reason" id="refill-reason">${escape(reason || '装水只增加壶内存水。')}</p></div>
    </div>
  </section>`;
}

function render() {
  const current = profile(state);
  const blocked = drinkReason(state);
  const atHome = state.location === 'home';
  const flask = state.flask;
  const affix = flask?.affix || 'none';
  const active = state.active.map(effect => `<div class="active-line"><span>${label[effect.target]} · 待恢复${num(effect.remaining)}</span><span>剩余${effect.ticksLeft}刻</span></div>`).join('');
  app.innerHTML = `<article class="window">
    <header class="window-header"><div class="header-left"><h1>装备 · 水壶</h1><span class="badge">${state.equipped ? '1 / 1 已装备' : '0 / 1 空槽'}</span></div><div class="location"><span id="location-label">${atHome ? '藏身处 · 水源已修复' : '地牢 · 补水点旁'}</span><button id="scene-button" data-action="scene">${atHome ? '外出' : '回家'}</button></div></header>
    <div class="status-strip">${vital('thirst')}${vital('breath')}${vital('stamina')}<div class="clock">已过 <b id="tick-value">${state.tick}</b> 刻</div></div>
    <div class="equipment-body">
      <section class="flask-panel" aria-label="当前水壶">
        <div class="slot-label"><span>独立水壶槽</span><strong>${state.equipped ? '已装备' : flask ? '在背包中' : '空槽'}</strong></div>
        <div class="flask-art${state.equipped ? '' : ' unequipped'}">${flask ? flaskArt() : '<span class="empty-flask">暂无水壶</span>'}</div>
        <h2 class="flask-name">${flask ? MODELS[flask.model].name : '需要重新制作'}</h2><p class="subtype">${flask ? '基底样例 · 容量200' : '死亡不会补发装备'}</p>
        <div class="water-readout"><span>存水</span><b id="water-value">${flask ? `${num(flask.water)} <small>/ ${flask.capacity}</small>` : '—'}</b></div>
        <div class="meter water-meter" role="meter" aria-label="存水" aria-valuemin="0" aria-valuemax="200" aria-valuenow="${flask?.water || 0}"><span style="width:${(flask?.water || 0) / 2}%"></span></div>
        <div class="weight-line">${flask ? `<span>当前 ${num(current.weight)} kg</span><span>空壶含改造 ${num(current.emptyWeight)} kg</span>` : '<span>家中的制作材料仍然保留</span>'}</div>
        <button class="slot-action" id="equip-button" data-action="equip"${disabled(!flask ? '先制作水壶' : '')}>${state.equipped ? '卸下到背包' : '装备水壶'} · 1刻</button>
      </section>
      <section class="detail-panel" aria-label="水壶配置与饮用">
        <div class="detail-title"><h3>词条与改造</h3><span>试调候选</span></div>
        ${flask ? `<p class="base-trait" id="base-trait"><span>基底固有</span>${MODELS[flask.model].detail}</p>` : ''}
        <div class="fitting-row"><label for="affix-select">词条</label><select id="affix-select" data-field="affix"${disabled(!flask ? '先制作水壶' : !atHome ? '在家中调整' : '')}>${options(AFFIXES, affix)}</select><small>${flask ? AFFIXES[affix].detail : '没有可配置的水壶。'}</small></div>
        <div class="fitting-row current-refit"><span>已改造</span><strong id="installed-insert">${flask ? INSERTS[flask.insert].name : '—'}</strong><small>${flask ? INSERTS[flask.insert].detail : '原改造随水壶丢失。'}</small></div>
        <p class="workshop-note">${!flask ? '先在下方制作一只新水壶，再进行改造' : atHome ? '在下方选择方案，消耗材料改造' : '可查看改造方案，回家后加工'}</p>
        <div class="effect-block"><div class="effect-heading"><span>每次饮用</span><strong>${flask ? `耗水 ${num(current.cost)} · 1刻` : '暂无可用效果'}</strong></div>
          <ul class="effect-list">${current.effects.map(effect => `<li><span class="effect-dot ${effect.target}"></span>${describeEffect(effect)}</li>`).join('')}</ul>
          <p class="usage-note">${flask ? `固定扣水，恢复超过上限的部分舍去${flask.insert !== 'none' ? '；持续期间不能重复饮用' : ''}。` : '新制作的水壶需要重新装水、配置词条与改造。'}</p>
        </div>
        <div class="actions"><button id="drink-button" class="primary" data-action="drink" aria-describedby="action-reason"${disabled(blocked)}>喝一口壶里的水</button></div>
        <p class="action-reason" id="action-reason">${escape(blocked || '\u00a0')}</p>
        <div class="active-effects" aria-label="持续效果"><h3>当前持续效果</h3>${active || '<p class="empty-effect">无</p>'}</div>
      </section>
    </div>
    ${waterSource()}
    ${!flask ? crafting() + workshop() : workshop() + crafting()}
    <div class="timebar"><span>${state.active.length ? '每推进一刻，结算一次持续恢复' : '时间由操作推进'}</span><div class="time-controls"><button data-action="wait" data-ticks="1">推进1刻</button><button data-action="wait" data-ticks="5">推进5刻</button></div></div>
    <section class="records" aria-label="使用记录"><div class="records-title"><span>使用记录</span><span>最近在前</span></div><ol>${state.log.map(entry => `<li class="${entry.kind}"><time>${entry.tick}刻</time><span>${escape(entry.text)}</span></li>`).join('')}</ol></section>
  </article>`;
  settings.innerHTML = `<div class="settings-title"><h3>试玩情境</h3><button data-action="reset">恢复初始状态</button></div>
    <div class="scenarios">${Object.entries(SCENARIOS).map(([key, name]) => `<button data-action="scenario" data-value="${key}">${name}</button>`).join('')}</div>
    <p class="settings-copy">常规外出与家中情境保留原壶与水源余量，不补发丢失水壶。三个“40点水源”样例会换成新的示例壶、重置水源和使用状态，供比较取水加成；保留家中材料和基础参数。“恢复初始状态”会覆盖本页试玩进度。</p>
    <div class="parameters">${Object.keys(label).map(field => `<label for="player-${field}">当前${label[field]}<input id="player-${field}" type="number" min="0" max="100" step="0.1" value="${state.player[field]}"></label>`).join('')}<button data-action="apply-player">应用角色数值</button></div>
    <p class="settings-copy">调整角色数值不改变存水，可用来试连续饮用与喝空。</p>
    <div class="parameters"><label for="base-cost">基础单次耗水<input id="base-cost" type="number" min="1" max="100" step="0.1" value="${state.base.waterCost}"${disabled(!atHome ? '在家中调整' : '')}></label><label for="base-recovery">基础补水总量<input id="base-recovery" type="number" min="1" max="100" step="0.1" value="${state.base.thirst}"${disabled(!atHome ? '在家中调整' : '')}></label><button data-action="apply-base"${disabled(!atHome ? '在家中调整' : '')}>应用基础参数</button></div>
    <div class="material-stock" aria-label="家中试玩材料">${Object.entries(MATERIALS).map(([id, material]) => `<span>${material.name} <b>${state.materials[id]}</b></span>`).join('')}</div>
    <div class="scenarios"><button data-action="materials" data-value="restock">补充试玩材料</button><button data-action="materials" data-value="empty">清空试玩材料</button></div>
    <p class="settings-copy">这些试玩材料存放在家中，死亡保留；正式随身材料仍按死亡规则丢失。改造在家中耗材加工，更换方案重新付费，旧材料不返还；恢复普通内胆也耗软木塞1。配方、数量和工时均为试调值。</p>
    <p class="settings-copy">候选词条仍可在家中免费切换，正式获取方式待定。已饮用效果保留当时配置，卸下或改造后仍会结算；改造工时也推进持续恢复。</p>
    <p class="settings-copy">青竹已确定从水源装水增加60%，替代此前回气建议；直接喝水不享受该加成。有限水源和存水一起保存，来回家中、刷新或装卸不会重置水源。小数取水按最多四位小数试算。</p>
    <p class="settings-copy">青竹和铁皮已列入制作台配方；本页也可死亡后耗材重制。旧进度不赠送新增竹材，可用“补充试玩材料”补齐演示库存。饮用与自重沿用同一组试值，专用外观另定；铁皮快饮、粗陶持续恢复仍为讨论提案。</p>
    <p class="settings-copy">本页单独保存试玩进度，刷新继续，不读写正式游戏存档。死亡演示只验证水壶丢失、清除持续效果和复活资源50%，不模拟地狱对话、技能惩罚或投保。制作默认成功，未模拟制造队列和成功率；只允许保有一只试玩水壶。</p>
    <p class="settings-copy">不模拟自然代谢、战斗与往返路程。三项资源上限均用100演示；空壶0.7kg，200点水暂按1kg计。数值和效果均待试玩评价。</p>`;
  const details = document.getElementById('refit-details');
  details.addEventListener('toggle', () => { if (details.isConnected) workshopOpen = details.open; });
  const craftDetails = document.getElementById('craft-details');
  craftDetails.addEventListener('toggle', () => { if (craftDetails.isConnected) craftOpen = craftDetails.open; });
  document.getElementById('save-status').textContent = saveStatus;
}

function dispatch(action, focusId) {
  state = (Array.isArray(action) ? action : [action]).reduce(transition, state);
  if (action.type === 'reset') saveBlocked = false;
  if (!saveBlocked) {
    try {
      localStorage.setItem(SAVE_KEY, encodeSave(state));
      saveStatus = '试玩进度已保存 · 刷新后继续';
    } catch { saveStatus = '本次进度未能保存，刷新可能丢失'; }
  }
  render();
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  document.querySelector('#announcer').textContent = state.log[0]?.text || '';
}

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  if (button.dataset.action === 'apply-player') {
    dispatch(Object.keys(label).map(field => ({ type: 'player', field, value: document.getElementById(`player-${field}`).valueAsNumber })));
    return;
  }
  if (button.dataset.action === 'apply-base') {
    dispatch([{ type: 'base', field: 'waterCost', value: document.getElementById('base-cost').valueAsNumber }, { type: 'base', field: 'thirst', value: document.getElementById('base-recovery').valueAsNumber }]);
    return;
  }
  dispatch({ type: button.dataset.action, value: button.dataset.value, ticks: Number(button.dataset.ticks) }, button.id);
});
document.addEventListener('change', event => {
  if (event.target.dataset.field) dispatch({ type: event.target.dataset.field, value: event.target.value }, event.target.id);
});
document.querySelector('#settings-toggle').addEventListener('click', event => {
  settings.hidden = !settings.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!settings.hidden));
});
render();

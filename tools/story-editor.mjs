const $ = id => document.getElementById(id);
const clone = v => structuredClone(v);
const opening = 'supervisor.firstTalk_01';
const titles = { [opening]: '首次见面 · 身份登记', 'supervisor.postEffectRemark_01': '后遗症 · 练拳提醒', 'supervisor.languageFix_01': '语言教学 · 保命三句', 'supervisor.basicUnarmed_followup_01': '拳脚 · 动作评价', 'supervisor.uselessPerson_remark_01': '无用之人 · 特殊评价', 'supervisor.basicBreath_followup_01': '呼吸法 · 吐气提醒' };
const poolTitles = { 'npc.supervisor.manager.fallback': '陌生时的闲聊', 'npc.supervisor.manager.fallback_veteran': '认识后的闲聊', 'npc.supervisor.manager.fallback_combined': '合并台词池' };
const roles = { npc: '林经理', player: '玩家', narration: '旁白' };
const skillNames = { combat_basic_unarmed: '基本拳脚', combat_basic_breath: '基本呼吸法', survival_language: '语言' };
let data, docs, saved, revisions, kind = 'events', selectedId = opening, selectedLine = 0, overview = true, settings = false, zoom = 1, busy = false, dragIndex = null;
let history = { events: [], pools: [] }, future = { events: [], pools: [] }, previewLines = [], planeWidth = 800, planeHeight = 800;
const draftKey = 'lin-story-editor.drafts.v1';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (text, run, cls) => { const b = el('button', text, cls); b.type = 'button'; b.onclick = run; return b; };
const title = e => e.editorTitle || titles[e.id] || e.id;
const entry = () => docs.events.entries.find(e => e.id === selectedId);
const pool = () => docs.pools.pools[selectedId];
const isDirty = k => JSON.stringify(docs[k]) !== JSON.stringify(saved[k]);
const lines = () => kind === 'events' ? entry()?.dialogue.linesRich || [] : (pool()?.lines || []).map(l => typeof l === 'string' ? { speaker: 'npc', text: l, avatar: '' } : l);
const setLines = values => { if (kind === 'events') { entry().dialogue.linesRich = values; entry().dialogue.lines = values.map(l => l.text); } else pool().lines = values.map(l => l.speaker === 'npc' && !l.avatar ? l.text : l); };
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function stash() { try { sessionStorage.setItem(draftKey, JSON.stringify({ docs, saved, revisions })); } catch { /* manual export remains available */ } }
function remember() { history[kind].push(clone(docs[kind])); if (history[kind].length > 80) history[kind].shift(); future[kind] = []; }
function changed(redraw = true) { stash(); status(); renderLibrary(); drawGraph(); if (redraw) renderInspector(); }
function mutate(fn) { remember(); fn(); changed(); }
function status() {
  const dirty = isDirty(kind), others = isDirty(kind === 'events' ? 'pools' : 'events');
  $('save-state').textContent = busy ? '保存中…' : dirty ? '当前文件有未保存修改' : others ? '另一文件有未保存修改' : '全部已保存';
  $('save').textContent = busy ? '保存中…' : kind === 'events' ? '保存对话事件' : '保存闲聊台词';
  $('save').disabled = busy || !dirty; $('reload').disabled = busy;
  $('undo').disabled = busy || !history[kind].length; $('redo').disabled = busy || !future[kind].length;
  $('source-label').textContent = data.files[kind];
}
function conditionText(c) {
  if (c.type === 'true') return '无额外条件';
  if (c.type === 'flagEquals') return (c.flag === 'supervisor_has_talked' ? '已完成首次见面' : c.flag === 'player_epithet_useless_person' ? '获得「无用之人」' : c.flag) + (c.value ? '：是' : '：否');
  if (c.type === 'skillLevelEquals' || c.type === 'skillLevelGte') return (skillNames[c.skillId] || c.skillId) + (c.type === 'skillLevelEquals' ? ' = ' : ' ≥ ') + c.level + ' 级';
  if (c.type === 'postEffectObtainedGte') return '已获得后遗症 ≥ ' + c.value;
  if (c.type === 'not') return '不满足：' + conditionText(c.cond);
  if (c.conds) return c.conds.map(conditionText).join(c.type === 'and' ? ' 且 ' : ' 或 ');
  return c.type;
}
function choose(id, nextKind = 'events') {
  selectedId = id; kind = nextKind; selectedLine = 0; overview = false; settings = false; zoom = 1;
  $('viewport').scrollTo(0, 0); render();
}
function renderLibrary() {
  const q = $('search').value.trim().toLowerCase(); $('event-list').replaceChildren(); $('pool-list').replaceChildren();
  for (const e of docs.events.entries) {
    if (q && !JSON.stringify(e).toLowerCase().includes(q) && !title(e).toLowerCase().includes(q)) continue;
    const b = button(title(e), () => choose(e.id), !overview && kind === 'events' && selectedId === e.id ? 'selected' : '');
    b.append(el('span', `${e.id === opening ? '新游戏自动触发' : '闲聊条件事件'} · ${e.dialogue.linesRich.length} 句`)); $('event-list').append(b);
  }
  for (const [id, p] of Object.entries(docs.pools.pools)) {
    if (q && !JSON.stringify(p).includes(q) && !(poolTitles[id] || id).includes(q)) continue;
    const b = button(poolTitles[id] || id, () => choose(id, 'pools'), kind === 'pools' && selectedId === id ? 'selected' : '');
    b.append(el('span', p.includePools?.length ? `引用 ${p.includePools.length} 个台词池` : `${p.lines.length} 句 · 随机抽取一条`)); $('pool-list').append(b);
  }
  $('overview').classList.toggle('selected', overview);
}
function svg(tag, attrs) { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; }
function drawGraph() {
  const graph = $('graph'); graph.replaceChildren(); const plane = el('div', null, 'graph-plane'); graph.append(plane);
  const edges = svg('svg', { class: 'edges', width: 2000, height: 2400, 'aria-hidden': 'true' });
  const defs = svg('defs', {}), marker = svg('marker', { id: 'arrow', markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto' });
  marker.append(svg('path', { d: 'M0,0 L6,3 L0,6', style: 'fill:#6c9580;stroke:none' })); defs.append(marker); edges.append(defs); plane.append(edges);
  let maxX = 0, maxY = 0;
  function node(x, y, cls, run, height = 136) {
    const n = button('', run, 'node ' + cls); n.style.left = x + 'px'; n.style.top = y + 'px'; n.style.height = height + 'px'; plane.append(n);
    maxX = Math.max(maxX, x + 258); maxY = Math.max(maxY, y + height); return n;
  }
  function connect(a, b, label = '', blocked = false) {
    const x1 = a.x + 129, y1 = a.y + a.h, x2 = b.x + 129, y2 = b.y;
    const side = a.y === b.y, right = b.x > a.x, startX = a.x + (right ? 258 : 0), endX = b.x + (right ? 0 : 258), mid = (startX + endX) / 2;
    const d = side ? `M${startX},${a.y + a.h / 2} C${mid},${a.y + a.h / 2} ${mid},${b.y + b.h / 2} ${endX},${b.y + b.h / 2}` : `M${x1},${y1} C${x1},${y1 + 28} ${x2},${y2 - 28} ${x2},${y2}`;
    edges.append(svg('path', { d, 'marker-end': 'url(#arrow)', class: blocked ? 'blocked' : '' }));
    if (label) { const t = svg('text', { x: (x1 + x2) / 2 + 8, y: (y1 + y2) / 2 - 3 }); t.textContent = label; edges.append(t); }
  }
  if (overview) {
    $('graph-title').textContent = '事件关系'; $('breadcrumb').textContent = '林经理 / 全部对话事件';
    $('graph-caption').textContent = '连线表示前置条件；满足条件后在闲聊中抽取。点开事件，编排其中的台词。';
    const positions = {}, levels = new Map(), level = (e, seen = new Set()) => { if (seen.has(e.id)) return 0; seen.add(e.id); return e.requires.length ? 1 + Math.max(...e.requires.map(id => { const prev = docs.events.entries.find(v => v.id === id); return prev ? level(prev, new Set(seen)) : 0; })) : 0; };
    for (const e of docs.events.entries) { const l = level(e); if (!levels.has(l)) levels.set(l, []); levels.get(l).push(e); }
    let y = 40;
    for (const [, group] of [...levels].sort((a, b) => a[0] - b[0])) {
      group.forEach((e, i) => { const pos = { x: 40 + i % 3 * 302, y: y + Math.floor(i / 3) * 210, h: 142 }; positions[e.id] = pos;
        const n = node(pos.x, pos.y, 'event', () => choose(e.id), 142);
        n.append(el('span', e.id === opening ? '自动开场 → 创角' : '条件事件', 'node-head'), el('b', title(e)), el('small', conditionText(e.condition)), el('div', e.dialogue.linesRich.length + ' 句 · ' + (e.repeatable ? '可重复' : '仅一次'), 'muted'));
      }); y += Math.ceil(group.length / 3) * 220;
    }
    for (const e of docs.events.entries) { e.requires.forEach(id => { if (positions[id]) connect(positions[id], positions[e.id]); }); e.blocks.forEach(id => { if (positions[id]) connect(positions[id], positions[e.id], '排除', true); }); }
    $('count').textContent = `${docs.events.entries.length} 个事件 · ${docs.events.entries.reduce((n, e) => n + e.dialogue.linesRich.length, 0)} 句台词`;
  } else {
    const ls = lines(), isPool = kind === 'pools';
    $('graph-title').textContent = isPool ? poolTitles[selectedId] || selectedId : title(entry());
    $('breadcrumb').textContent = '林经理 / ' + (isPool ? '日常闲聊' : selectedId === opening ? '自动开场' : '对话事件');
    $('graph-caption').textContent = isPool ? '每次闲聊随机抽取一句；这些台词不按顺序连播。' : '点击任意一句编辑；拖动卡片调整顺序。结束效果在整段对话结束后执行。';
    if (!ls.length) {
      const n = node(40, 40, 'event', () => {}, 142); n.append(el('b', '合并台词池'), el('small', '从以下台词池合并抽取：'));
      (pool().includePools || []).forEach((id, i) => { const b = node(40 + i * 302, 260, 'event', () => choose(id, 'pools'), 100); b.append(el('b', poolTitles[id] || id)); connect({ x: 40, y: 40, h: 142 }, { x: 40 + i * 302, y: 260, h: 100 }); });
    } else {
      const columns = 2, points = [];
      if (!isPool) { const n = node(40, 32, 'terminal', () => { settings = true; renderInspector(); }, 54); n.textContent = selectedId === opening ? '新游戏开始' : '满足条件 · 闲聊触发'; points.push({ x: 40, y: 32, h: 54 }); }
      ls.forEach((l, i) => {
        const row = Math.floor(i / columns), col = row % 2 ? columns - 1 - i % columns : i % columns;
        const pos = { x: 40 + col * 302, y: (isPool ? 40 : 134) + row * 195, h: 136 }; points.push(pos);
        const n = node(pos.x, pos.y, l.speaker + (selectedLine === i && !settings ? ' selected' : ''), () => { selectedLine = i; settings = false; drawGraph(); renderInspector(); });
        n.dataset.line = i; n.draggable = true;
        const head = el('span', null, 'node-head'); head.append(el('span', `${String(i + 1).padStart(2, '0')} / ${roles[l.speaker] || l.speaker}`), el('span', '⠿')); n.append(head, el('span', l.text || '（待填写）', 'node-text'));
        n.addEventListener('dragstart', e => { dragIndex = i; e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
        n.addEventListener('dragover', e => { if (dragIndex !== null) { e.preventDefault(); n.classList.add('drop-target'); } });
        n.addEventListener('dragleave', () => n.classList.remove('drop-target'));
        n.addEventListener('drop', e => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) moveLine(dragIndex, i); dragIndex = null; });
        n.addEventListener('dragend', () => { dragIndex = null; drawGraph(); });
      });
      if (!isPool) {
        const last = points[points.length - 1], end = { x: last.x, y: last.y + 198, h: 54 };
        const n = node(end.x, end.y, 'terminal', () => { settings = true; renderInspector(); }, 54); n.textContent = selectedId === opening ? '保存开场完成 → 创建角色' : `结束 · 执行 ${entry().effects.length} 项效果`; points.push(end);
        for (let i = 1; i < points.length; i++) connect(points[i - 1], points[i]);
      }
    }
    $('count').textContent = `${ls.length} 句${!isPool ? ' · 顺序播放' : ' · 随机抽取'}`;
  }
  planeWidth = maxX + 45; planeHeight = maxY + 50;
  edges.setAttribute('width', planeWidth); edges.setAttribute('height', planeHeight);
  plane.style.width = planeWidth + 'px'; plane.style.height = planeHeight + 'px'; plane.style.transform = `scale(${zoom})`; graph.style.width = planeWidth * zoom + 'px'; graph.style.height = planeHeight * zoom + 'px';
  $('zoom-label').textContent = Math.round(zoom * 100) + '%';
  $('settings').hidden = overview || kind !== 'events'; $('add-line').disabled = overview || kind === 'pools' && !lines().length;
  $('preview').disabled = overview || !lines().length; $('preview').textContent = kind === 'pools' ? '▶ 预览此句' : '▶ 从此句预览';
}
function field(parent, label, value, onEdit, type = 'text') {
  const wrap = el('label', null, 'field'), input = el(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') input.type = type;
  input.value = value ?? ''; wrap.append(el('span', label), input); parent.append(wrap);
  let checkpoint = false;
  input.onfocus = () => { checkpoint = false; };
  input.oninput = () => { if (!checkpoint) { remember(); checkpoint = true; } onEdit(type === 'number' ? Number(input.value) : input.value); changed(false); };
  return input;
}
function select(parent, label, value, choices, onEdit) {
  const wrap = el('label', null, 'field'), input = el('select'); for (const [id, name] of choices) { const o = el('option', name); o.value = id; input.append(o); }
  input.value = String(value); input.onchange = () => mutate(() => onEdit(input.value)); wrap.append(el('span', label), input); parent.append(wrap); return input;
}
function renderInspector() {
  const p = $('inspector'); p.replaceChildren();
  if (overview) { p.append(el('div', 'FLOW / 事件关系', 'eyebrow'), el('h3', '从开场开始编排'), el('p', '首次见面在新游戏开始时自动播放，台词结束后进入创角。其他事件保留现有的闲聊触发条件。', 'muted'), el('hr', null, 'divider'), el('span', '已载入正式配置', 'pill'), el('p', '点开图中的事件，再选择任意一句台词。你可以从中间开始编辑和预览。', 'muted')); return; }
  if (kind === 'events' && settings) { renderSettings(p); return; }
  const ls = lines(), l = ls[selectedLine];
  p.append(el('div', kind === 'pools' ? 'LINE / 随机台词' : 'LINE / 对话节点', 'eyebrow'));
  if (!l) { p.append(el('h3', '合并台词池'), el('p', '此池引用其他台词池，点击画布中的来源编辑台词。', 'muted')); return; }
  p.append(el('h3', `第 ${selectedLine + 1} 句`), el('p', kind === 'events' ? title(entry()) : poolTitles[selectedId], 'muted'));
  select(p, '说话人', l.speaker, Object.entries(roles), value => { const arr = lines(); arr[selectedLine].speaker = value; if (value === 'narration') arr[selectedLine].avatar = ''; setLines(arr); });
  const text = field(p, '台词内容', l.text, value => { const arr = lines(); arr[selectedLine].text = value; setLines(arr); }, 'textarea'); text.rows = 8; text.id = 'line-text';
  const nav = el('div', null, 'actions');
  const up = button('↑ 上移', () => moveLine(selectedLine, selectedLine - 1)); up.disabled = selectedLine === 0;
  const down = button('↓ 下移', () => moveLine(selectedLine, selectedLine + 1)); down.disabled = selectedLine === ls.length - 1; nav.append(up, down); p.append(nav);
  const actions = el('div', null, 'actions'); const del = button('删除', () => mutate(() => { const arr = lines(); arr.splice(selectedLine, 1); setLines(arr); selectedLine = Math.max(0, selectedLine - 1); }), 'danger'); del.disabled = ls.length <= 1;
  actions.append(button('复制', () => mutate(() => { const arr = lines(); arr.splice(selectedLine + 1, 0, clone(arr[selectedLine])); selectedLine++; setLines(arr); })), button('后插一句', addLine), del); p.append(actions);
  p.append(el('hr', null, 'divider'), button(kind === 'pools' ? '▶ 预览此句' : '▶ 从这一句开始预览', preview, 'accent'));
  if (kind === 'events') p.append(el('p', '预览只播放台词，不触发事件效果。', 'muted'));
  const advanced = el('details'), summary = el('summary', '头像与原始引用'); advanced.append(summary); field(advanced, '头像路径（保留兼容字段）', l.avatar || '', value => { const arr = lines(); arr[selectedLine].avatar = value; setLines(arr); }); p.append(advanced);
}
function renderSettings(p) {
  const e = entry(), intro = e.id === opening;
  p.append(el('div', 'EVENT / 触发与结束', 'eyebrow'), el('h3', title(e)), el('p', e.id, 'muted'));
  field(p, '事件名称', title(e), value => { e.editorTitle = value; });
  if (intro) p.append(el('p', '新游戏自动进入；开场完成标记与创角衔接固定保留。此事件的闲聊条件只用于手动入口。', 'muted'));
  select(p, '重复触发', e.repeatable, [['false', '仅一次'], ['true', '每次满足条件均可触发']], value => { e.repeatable = value === 'true'; }).disabled = intro;
  const choices = [['true', '无额外条件'], ['flagEquals', '标记为指定值'], ['skillLevelEquals', '技能等级等于'], ['skillLevelGte', '技能等级至少'], ['postEffectObtainedGte', '获得后遗症数量至少']];
  if (!choices.some(v => v[0] === e.condition.type)) choices.push([e.condition.type, '组合条件（下方编辑）']);
  select(p, '触发条件', e.condition.type, choices, type => { e.condition = type === 'true' ? { type } : type === 'flagEquals' ? { type, flag: 'supervisor_has_talked', value: true } : type === 'postEffectObtainedGte' ? { type, value: 1 } : { type, skillId: 'survival_language', level: 1 }; });
  const c = e.condition;
  if (c.type === 'flagEquals') { field(p, '标记名称', c.flag, value => { c.flag = value; }); select(p, '标记值', c.value, [['true', '是'], ['false', '否']], value => { c.value = value === 'true'; }); }
  if (c.type.startsWith('skillLevel')) { field(p, '技能编号', c.skillId, value => { c.skillId = value; }); field(p, '等级', c.level, value => { c.level = value; }, 'number'); }
  if (c.type === 'postEffectObtainedGte') field(p, '数量', c.value, value => { c.value = value; }, 'number');
  if (['and', 'or', 'not'].includes(c.type)) {
    const a = el('textarea'); a.rows = 8; a.value = JSON.stringify(c, null, 2); p.append(a, button('应用组合条件', () => { try { const value = JSON.parse(a.value); mutate(() => { e.condition = value; }); } catch { message('组合条件不是有效 JSON。', true); } }));
  }
  for (const [key, name] of [['requires', '前置事件 · 全部完成'], ['blocks', '排除事件 · 任一完成则不触发']]) {
    const section = el('details'); section.append(el('summary', `${name} (${e[key].length})`));
    for (const other of docs.events.entries.filter(v => v.id !== e.id)) {
      const label = el('label', null, 'check'), check = el('input'); check.type = 'checkbox'; check.checked = e[key].includes(other.id); check.disabled = intro;
      check.onchange = () => mutate(() => { e[key] = check.checked ? [...e[key], other.id] : e[key].filter(id => id !== other.id); }); label.append(check, el('span', title(other))); section.append(label);
    } p.append(section);
  }
  const effects = el('details'); effects.open = true; effects.append(el('summary', `对话结束效果 (${e.effects.length})`));
  e.effects.forEach((ef, index) => {
    const box = el('div', null, 'effect-row'), param = ef.params, required = intro && ef.type === 'setFlag' && param.flag === 'supervisor_has_talked';
    if (required) { box.append(el('span', '完成首次见面 · 固定保存标记', 'pill')); effects.append(box); return; }
    const effectChoices = intro ? [['setFlag', '设置剧情标记']] : [['setFlag', '设置标记'], ['modifySkillLevel', '改变技能等级'], ['modifySkillMaxLevelBonus', '改变技能等级上限'], ['giveItem', '给予物品'], ['removeItem', '移除物品']];
    select(box, '效果', ef.type, effectChoices, type => { e.effects[index] = { type, params: type === 'setFlag' ? { flag: 'new_flag', value: true } : type.includes('Item') ? { itemId: '', count: 1 } : { skillId: 'survival_language', delta: 1, min: 0 } }; });
    if (ef.type === 'setFlag') { field(box, '标记', param.flag, value => { param.flag = value; }); select(box, '值', param.value, [['true', '是'], ['false', '否']], value => { param.value = value === 'true'; }); }
    else if (ef.type.includes('Item')) { field(box, '物品编号', param.itemId, value => { param.itemId = value; }); field(box, '数量', param.count, value => { param.count = value; }, 'number'); }
    else { field(box, '技能编号', param.skillId, value => { param.skillId = value; }); field(box, '变化值', param.delta, value => { param.delta = value; }, 'number'); }
    box.append(button('移除此效果', () => mutate(() => e.effects.splice(index, 1)), 'danger')); effects.append(box);
  });
  effects.append(button('＋ 添加结束效果', () => mutate(() => e.effects.push({ type: 'setFlag', params: { flag: 'new_flag', value: true } })))); p.append(effects);
}
function addLine() { if (overview) return; mutate(() => { const arr = lines(); const at = Math.min(selectedLine + 1, arr.length); arr.splice(at, 0, { speaker: 'npc', text: '新台词', avatar: '' }); setLines(arr); selectedLine = at; settings = false; }); revealSelected(); }
function moveLine(from, to) { const arr = lines(); if (to < 0 || to >= arr.length) return; mutate(() => { const [line] = arr.splice(from, 1); arr.splice(to, 0, line); setLines(arr); selectedLine = to; settings = false; }); revealSelected(); }
function revealSelected() { $('graph').querySelector(`[data-line="${selectedLine}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
function render() { status(); renderLibrary(); drawGraph(); renderInspector(); }
function preview() {
  previewLines = clone(kind === 'pools' ? [lines()[selectedLine]] : lines().slice(selectedLine));
  $('preview-title').textContent = (kind === 'events' ? title(entry()) : poolTitles[selectedId]) + ` · 从第 ${selectedLine + 1} 句`;
  $('preview-dialog').showModal(); playPreview();
}
function playPreview() { $('preview-finished').hidden = true; window.DialogueUI.playLinesRich(previewLines, { npcId: 'npc.supervisor.manager', npcName: '林经理', playerName: '玩家', onQueueExhausted: () => { $('preview-finished').hidden = false; } }); }
function closePreview() { window.DialogueUI.close(); $('preview-dialog').close(); }
window.UIText.setDict(await (await fetch('/data/ui_text_zhCN.json')).json());
window.DialogueUI.attachView(v => { $('preview-panel').hidden = !v.open; $('preview-role').textContent = v.role === 'narration' ? '' : v.speakerName; $('preview-text').textContent = v.text; $('preview-next').textContent = v.typing ? '显示整句' : v.nextLabel === '结束' ? '结束' : '下一句'; });
$('preview-next').onclick = () => window.DialogueUI.next(); $('preview-text').onclick = () => window.DialogueUI.next();
$('preview-close').onclick = closePreview; $('preview-done').onclick = closePreview; $('preview-restart').onclick = playPreview;
$('preview-dialog').addEventListener('cancel', e => { e.preventDefault(); closePreview(); });
document.addEventListener('keydown', e => { if ($('preview-dialog').open && ['Enter', ' '].includes(e.key) && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopImmediatePropagation(); window.DialogueUI.next(); } }, true);
async function load(reset = false) {
  try {
    const response = await fetch('/api/story'); if (!response.ok) throw Error('读取失败'); data = await response.json(); docs = clone(data.docs); saved = clone(data.docs); revisions = clone(data.revisions);
    for (const e of docs.events.entries) if (!e.dialogue.linesRich) e.dialogue.linesRich = e.dialogue.lines.map(text => ({ speaker: 'npc', text, avatar: '' }));
    let restored = false;
    if (!reset) { try { const draft = JSON.parse(sessionStorage.getItem(draftKey)); if (draft?.docs && draft?.saved && draft?.revisions) { docs = draft.docs; saved = draft.saved; revisions = draft.revisions; restored = isDirty('events') || isDirty('pools'); if (!restored) { docs = clone(data.docs); saved = clone(data.docs); revisions = clone(data.revisions); } } } catch { /* fresh state */ } }
    history = { events: [], pools: [] }; future = { events: [], pools: [] }; kind = 'events'; selectedId = opening; selectedLine = 0; overview = true; settings = false;
    render(); message(restored ? '已恢复未保存草稿；保存前仍会检查文件版本。' : '已载入全部对话。点开一个事件开始编排。');
    if (reset) stash();
  } catch (error) { message(error.message + '，请检查本地编辑器服务后重新读取。', true); }
}
async function save() {
  if (busy || !isDirty(kind)) return;
  const savingKind = kind, document = clone(docs[kind]), revision = revisions[kind]; busy = true; status();
  try {
    const response = await fetch('/api/story', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': data.token }, body: JSON.stringify({ kind: savingKind, revision, document }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error || '保存失败');
    revisions[savingKind] = result.revision; saved[savingKind] = clone(result.document);
    if (JSON.stringify(docs[savingKind]) === JSON.stringify(document)) docs[savingKind] = clone(result.document);
    stash(); message('已保存到项目。刷新游戏后使用新台词；已有完成记录保留。');
  } catch (error) { message(error.message, true); }
  finally { busy = false; render(); }
}
$('save').onclick = save;
$('reload').onclick = () => { if (docs && (isDirty('events') || isDirty('pools')) && !confirm('重新读取会放弃未保存草稿。继续吗？')) return; load(true); };
$('export').onclick = () => { if (!docs) return; const blob = new Blob([JSON.stringify(docs[kind], null, 2) + '\n'], { type: 'application/json' }); const a = el('a'); a.href = URL.createObjectURL(blob); a.download = data.files[kind].split('/').pop(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); message('已导出当前文件草稿。'); };
$('undo').onclick = () => { if (!history[kind].length) return; future[kind].push(clone(docs[kind])); docs[kind] = history[kind].pop(); selectedLine = Math.min(selectedLine, Math.max(0, lines().length - 1)); if (kind === 'events' && !entry()) { overview = true; selectedId = opening; } changed(); };
$('redo').onclick = () => { if (!future[kind].length) return; history[kind].push(clone(docs[kind])); docs[kind] = future[kind].pop(); changed(); };
$('search').oninput = renderLibrary;
$('overview').onclick = () => { if (!docs) return; overview = true; kind = 'events'; zoom = 1; $('viewport').scrollTo(0, 0); render(); };
$('settings').onclick = () => { settings = !settings; drawGraph(); renderInspector(); }; $('add-line').onclick = addLine; $('preview').onclick = preview;
$('add-event').onclick = () => { if (!docs) return; kind = 'events'; mutate(() => { selectedId = 'supervisor.custom_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12); docs.events.entries.push({ id: selectedId, editorTitle: '新对话事件', entryType: 'dialogue', entrySource: 'chat', condition: { type: 'true' }, requires: [opening], blocks: [], dialogue: { linesRich: [{ speaker: 'npc', text: '新台词', avatar: '' }], lines: ['新台词'], hasOptions: false, options: [] }, effects: [], repeatable: false, scope: 'global', causesNpcDisappear: false }); overview = false; settings = true; selectedLine = 0; }); };
function setZoom(value) { zoom = Math.max(.35, Math.min(1.6, value)); drawGraph(); }
$('zoom-in').onclick = () => setZoom(zoom + .1); $('zoom-out').onclick = () => setZoom(zoom - .1);
$('fit').onclick = () => { setZoom(Math.min(1, ($('viewport').clientWidth - 12) / planeWidth, ($('viewport').clientHeight - 12) / planeHeight)); $('viewport').scrollTo(0, 0); };
$('viewport').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? .05 : -.05)); } }, { passive: false });
window.addEventListener('beforeunload', e => { if (docs && (isDirty('events') || isDirty('pools'))) { e.preventDefault(); e.returnValue = ''; } });
await load();

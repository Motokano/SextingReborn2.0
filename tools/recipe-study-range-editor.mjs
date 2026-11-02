export function mountEditor(doc, request = (...args) => doc.defaultView.fetch(...args)) {
  const win = doc.defaultView, $ = id => doc.getElementById(id);
  let snapshot = null, draft = null, selected = new Set(), busy = false;
  let category = 'all', filter = 'all', query = '', focused = null;
  let activeDungeonId = null, drafts = new Map(), mode = 'edit', assignmentFilter = 'all';
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const categoryName = id => snapshot?.categories.find(c => c.id === id)?.name || id;
  const currentDungeon = () => snapshot?.dungeons.find(d => d.id === activeDungeonId);
  const changes = (id = activeDungeonId) => {
    const original = snapshot?.dungeons.find(d => d.id === id)?.recipeStudy;
    const value = drafts.get(id), after = id === activeDungeonId ? selected : new Set(value?.recipeIds || []);
    const before = new Set(original?.recipeIds || []);
    return {
      added: [...after].filter(key => !before.has(key)).length,
      removed: [...before].filter(key => !after.has(key)).length,
      settings: !!value && (value.enabled !== original.enabled || value.chance !== original.chance),
    };
  };
  const dirty = (id = activeDungeonId) => { const c = changes(id); return c.added + c.removed > 0 || c.settings; };
  const dirtyCount = () => snapshot?.dungeons.filter(d => dirty(d.id)).length || 0;
  const invalid = () => !Number.isFinite(draft?.chance) || draft.chance < 0 || draft.chance > 1 ? '出现率须为 0～100%。' : draft?.enabled && draft.chance > 0 && !selected.size ? '请至少选择一项研究配方，或关闭资料台投放。' : '';
  const payload = () => ({ enabled: draft.enabled, chance: draft.chance, recipeIds: snapshot.recipes.filter(r => r.selectable && selected.has(r.id)).map(r => r.id) });
  const assignedTo = recipeId => snapshot.dungeons.filter(d => drafts.get(d.id).recipeIds.includes(recipeId));
  const dungeonState = dungeon => {
    const value = drafts.get(dungeon.id);
    return `${dungeon.connected ? '已接入地图' : '仅配置 · 未接地图'}${!value.enabled || value.chance === 0 ? ' · 不投放' : ''}${dirty(dungeon.id) ? ' · 未保存' : ''}`;
  };
  function status(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }
  function visibleRows() {
    return snapshot.recipes.filter(r => {
      if (category !== 'all' && category !== r.category) return false;
      if (mode === 'overview') {
        if (!r.selectable) return false;
        const count = assignedTo(r.id).length;
        if (assignmentFilter === 'unassigned' && count || assignmentFilter === 'shared' && count < 2) return false;
      } else if (filter === 'research' && !r.selectable || filter === 'selected' && !selected.has(r.id) || filter === 'unselected' && (!r.selectable || selected.has(r.id)) || filter === 'readonly' && r.selectable) return false;
      return !query || [r.name, r.id, r.itemId, categoryName(r.category), ...r.inputs.map(i => i.name)].join(' ').toLowerCase().includes(query);
    });
  }
  function renderDungeons() {
    $('dungeons').replaceChildren();
    for (const d of snapshot.dungeons) {
      const button = el('button', 'dungeon-button');
      button.dataset.dungeon = d.id; button.disabled = busy;
      button.setAttribute('aria-pressed', String(mode === 'edit' && d.id === activeDungeonId));
      button.append(el('strong', '', d.name), el('span', '', `${drafts.get(d.id).recipeIds.length} 项 · ${dungeonState(d)}`));
      $('dungeons').append(button);
    }
    $('new-dungeon').disabled = busy;
    $('allocation-button').disabled = busy;
    $('allocation-button').setAttribute('aria-pressed', String(mode === 'overview'));
    $('create-fields').disabled = busy;
  }
  function assignmentChips(id) {
    const group = el('div', 'assignment-chips'), owners = assignedTo(id);
    if (!owners.length) group.append(el('span', 'unassigned', '尚未分配'));
    for (const d of owners) {
      const button = el('button', 'assignment-chip'); button.dataset.jumpDungeon = d.id; button.dataset.focusRecipe = id;
      button.disabled = busy; button.append(el('span', '', d.name), el('small', '', dungeonState(d))); group.append(button);
    }
    return group;
  }
  function renderCategories() {
    $('categories').replaceChildren();
    for (const c of [{ id: 'all', name: '全部配方' }, ...snapshot.categories]) {
      const rows = snapshot.recipes.filter(r => r.selectable && (c.id === 'all' || r.category === c.id));
      const button = el('button');
      button.dataset.category = c.id;
      button.setAttribute('aria-pressed', String(category === c.id));
      button.disabled = busy;
      const row = el('span', 'category-row');
      row.append(el('span', '', c.name), el('span', 'category-count', mode === 'overview' ? `${rows.length}` : `${rows.filter(r => selected.has(r.id)).length} / ${rows.length}`));
      button.append(row);
      $('categories').append(button);
    }
  }
  function renderDetail() {
    const container = $('detail'), r = snapshot.recipes.find(row => row.id === focused);
    container.replaceChildren();
    if (!r) { container.append(el('p', 'muted', '点击配方查看用料和制作条件')); return; }
    container.append(el('h3', '', r.name), el('p', 'id', r.id), el('p', 'unlock', r.unlockText));
    if (r.selectable) { container.append(el('h4', '', '已分配地牢'), assignmentChips(r.id)); }
    for (const [title, items, empty] of [['每批用料', r.inputs, '无额外用料'], ['所需工具', r.tools, '无额外工具']]) {
      container.append(el('h4', '', title));
      const list = el('ul');
      for (const i of items) {
        const row = el('li'); row.append(el('span', '', i.name), el('strong', '', `× ${i.count}`)); list.append(row);
      }
      container.append(items.length ? list : el('p', 'muted', empty));
    }
    const facts = el('dl');
    for (const [label, value] of [['每批产量', `${r.output} 份`], ['工作地点', r.station], ['制作台等级', r.bench ? `${r.bench} 级` : '无要求'], ['耗时 / 体力', `${r.ticks} 刻 / ${r.stamina}`]]) facts.append(el('dt', '', label), el('dd', '', value));
    container.append(facts);
    if (r.selectable && mode === 'edit') {
      const toggle = el('button', selected.has(r.id) ? '' : 'primary', selected.has(r.id) ? '从范围中移出' : '加入解锁范围');
      toggle.id = 'detail-toggle'; toggle.dataset.toggle = r.id; toggle.disabled = busy; container.append(toggle);
    }
    container.append(el('p', 'detail-footnote', r.selectable ? '这里编辑资料台的候选范围。制作条件沿用配方目录；完整制造执行器仍待接入。' : '此项按既有基础或关联规则掌握，不作为资料台的独立奖励。'));
  }
  function render() {
    if (!snapshot) return;
    const previousFocus = doc.activeElement;
    const focusKey = previousFocus?.dataset.recipe || previousFocus?.dataset.detail;
    const focusType = previousFocus?.dataset.recipe ? 'recipe' : 'detail';
    const restoreDetailToggle = previousFocus?.id === 'detail-toggle';
    renderDungeons(); renderCategories();
    const overview = mode === 'overview', dungeon = currentDungeon();
    $('range-overview').hidden = overview; $('allocation-overview').hidden = !overview;
    $('recipe-filters').hidden = overview; $('assignment-filters').hidden = !overview; $('bulk-actions').hidden = overview;
    $('workspace').classList.toggle('allocation-mode', overview);
    $('dungeon-title').textContent = dungeon.name;
    $('dungeon-state').textContent = `${dungeonState(dungeon)} · 每处解锁 1 项`;
    $('scope-title').textContent = overview ? '所有地牢 · 分配总览' : `${dungeon.name} · 全楼层共用`;
    const allocatable = snapshot.recipes.filter(r => r.selectable);
    $('assigned-count').textContent = allocatable.filter(r => assignedTo(r.id).length).length;
    $('unassigned-count').textContent = allocatable.filter(r => !assignedTo(r.id).length).length;
    $('shared-count').textContent = allocatable.filter(r => assignedTo(r.id).length > 1).length;
    const research = snapshot.recipes.filter(r => r.selectable).length;
    $('source-summary').textContent = `${snapshot.recipes.filter(r => r.kind !== 'processing').length} 条成品 · ${snapshot.recipes.filter(r => r.kind === 'processing').length} 条中间工序 · 目录修订 ${snapshot.designRevision}`;
    $('selected-count').textContent = selected.size;
    $('research-count').textContent = research;
    $('selection-meter').style.width = `${research ? selected.size / research * 100 : 0}%`;
    $('enabled').checked = draft.enabled;
    $('chance').value = Number.isFinite(draft.chance) ? String(Number((draft.chance * 100).toFixed(6))) : '';
    doc.querySelector('.settings').disabled = busy;
    $('search').disabled = busy;
    $('workspace').setAttribute('aria-busy', String(busy));
    for (const button of doc.querySelectorAll('[data-filter]')) {
      button.disabled = busy; button.setAttribute('aria-pressed', String(filter === button.dataset.filter));
    }
    for (const button of doc.querySelectorAll('[data-assignment]')) {
      button.disabled = busy; button.setAttribute('aria-pressed', String(assignmentFilter === button.dataset.assignment));
    }
    const rows = visibleRows(), editable = rows.filter(r => r.selectable);
    $('category-title').textContent = category === 'all' ? '全部配方' : categoryName(category);
    $('result-count').textContent = `${rows.length} 项`;
    $('visible-summary').textContent = overview ? `当前结果 ${rows.length} 项 · 点击地牢名称前往编辑` : `当前结果 ${editable.length} 项可选 · ${editable.filter(r => selected.has(r.id)).length} 项已选`;
    $('select-visible').disabled = busy || !editable.some(r => !selected.has(r.id));
    $('clear-visible').disabled = busy || !editable.some(r => selected.has(r.id));
    $('recipes').replaceChildren();
    for (const r of rows) {
      if (overview) {
        const row = el('div', 'assignment-row');
        const title = el('button', 'assignment-title', r.name); title.dataset.detail = r.id; title.disabled = busy;
        row.append(title, el('span', 'muted', categoryName(r.category)), assignmentChips(r.id));
        $('recipes').append(row); continue;
      }
      const row = el('div', 'recipe-row');
      row.classList.toggle('is-selected', selected.has(r.id));
      row.classList.toggle('is-focused', focused === r.id);
      row.classList.toggle('is-readonly', !r.selectable);
      const label = el('label', 'recipe-label'), checkbox = el('input');
      checkbox.type = 'checkbox'; checkbox.dataset.recipe = r.id; checkbox.checked = selected.has(r.id);
      checkbox.disabled = busy || !r.selectable;
      checkbox.setAttribute('aria-label', r.selectable ? `选择${r.name}` : `${r.name}，仅查看`);
      const text = el('span', 'recipe-text');
      text.append(el('span', 'recipe-name', r.name), el('span', 'recipe-meta', `${categoryName(r.category)} · ${r.selectable ? `${r.bench || 0} 级台 / ${r.ticks} 刻` : r.unlockText}`));
      label.append(checkbox, text);
      const detail = el('button', 'detail-button', '详情 ›'); detail.dataset.detail = r.id;
      detail.setAttribute('aria-label', `查看${r.name}详情`); detail.disabled = busy;
      row.append(label, el('span', 'tag', r.selectable ? selected.has(r.id) ? '已选' : '未选' : '仅查看'), detail);
      $('recipes').append(row);
    }
    $('empty').hidden = rows.length !== 0;
    renderDetail();
    const c = changes();
    $('change-summary').textContent = overview ? `${snapshot.dungeons.length} 个地牢配置 · ${dirtyCount()} 份未保存修改` : (dirty() ? `${dungeon.name} · 新增 ${c.added} 项 / 移出 ${c.removed} 项${c.settings ? ' · 投放已变更' : ''}` : `${dungeon.name} · 与已保存配置一致`) + (dirtyCount() > Number(dirty()) ? ` · 另有 ${dirtyCount() - Number(dirty())} 份未保存` : '');
    $('save').disabled = busy || !dirty() || !!invalid();
    $('save').textContent = busy ? '处理中…' : '保存当前地牢';
    for (const id of ['save', 'undo', 'export']) $(id).hidden = overview;
    $('undo').disabled = busy || !dirty(); $('export').disabled = busy || !!invalid(); $('reload').disabled = busy;
    $('override-note').hidden = overview || dungeon.connected && !dungeon.ticketOverrides;
    $('override-note').textContent = !dungeon.connected ? '这是一份待接入地图的范围配置。创建和保存不会新增可进入的地牢。' : `此地牢有 ${dungeon.ticketOverrides} 张门票单独配置了资料台，门票中的设置仍然优先。`;
    if (focusKey) [...doc.querySelectorAll(`[data-${focusType}]`)].find(node => node.dataset[focusType] === focusKey)?.focus({ preventScroll: true });
    if (restoreDetailToggle) $('detail-toggle')?.focus({ preventScroll: true });
  }
  function changed() {
    draft.recipeIds = payload().recipeIds;
    render();
    status(invalid() || (!draft.enabled || draft.chance === 0 ? '当前设置不投放资料台；所选范围会保留。' : currentDungeon().connected ? '保存后，刷新游戏并开始新出征生效。' : '保存当前范围，待对应地图接入后使用。'), !!invalid());
  }
  function selectDungeon(id) {
    activeDungeonId = id; draft = drafts.get(id); selected = new Set(draft.recipeIds);
  }
  function accept(data, { reset = false, savedId = null } = {}) {
    const pending = new Map(reset ? [] : [...drafts].filter(([id]) => id !== savedId && dirty(id)));
    snapshot = data;
    drafts = new Map(data.dungeons.map(d => [d.id, pending.get(d.id) || structuredClone(d.recipeStudy)]));
    selectDungeon(data.dungeons.some(d => d.id === activeDungeonId) ? activeDungeonId : data.defaultDungeonId);
    if (!snapshot.recipes.some(r => r.id === focused)) focused = snapshot.recipes.find(r => r.selectable)?.id || null;
  }
  async function fetchData(method, body) {
    const response = await request('/api/recipe-study', method !== 'GET' ? { method, headers: { 'Content-Type': 'application/json', 'X-Editor-Token': snapshot.token }, body: JSON.stringify(body) } : { cache: 'no-store' });
    let data;
    try { data = await response.json(); } catch { throw Error('请运行 npm run editor:recipe-study，再打开页面。'); }
    if (!response.ok) throw Error(data.error || '操作失败，请重试。');
    return data;
  }
  async function load() {
    if (busy) return;
    if (snapshot && dirtyCount() && !win.confirm('重新读取会丢弃所有地牢尚未保存的修改，继续吗？')) return;
    busy = true; $('reload').disabled = true; render(); status('正在读取制作目录和地牢配置…');
    try { accept(await fetchData('GET'), { reset: true }); status('已读取所有地牢范围；选择一个地牢开始编辑。'); }
    catch (error) { status(error.message, true); }
    finally { busy = false; $('reload').disabled = false; render(); }
  }
  async function save() {
    if (!snapshot || busy || mode !== 'edit' || !dirty() || invalid()) return;
    busy = true; render(); status('正在保存范围…');
    try {
      accept(await fetchData('PUT', { revision: snapshot.revision, dungeonId: activeDungeonId, config: payload() }), { savedId: activeDungeonId });
      status(currentDungeon().connected ? `已保存「${currentDungeon().name}」。刷新游戏并开始新出征后生效。` : `已保存「${currentDungeon().name}」的范围，等待对应地图接入。`);
    }
    catch (error) { status(error.message, true); }
    finally { busy = false; render(); }
  }
  async function create() {
    if (!snapshot || busy) return;
    const name = $('new-name').value.trim();
    if (!name) { $('create-status').textContent = '请填写地牢名称。'; return; }
    busy = true; render(); $('create-status').textContent = '正在创建…';
    try {
      const data = await fetchData('POST', { revision: snapshot.revision, name, copyFromId: $('copy-from').value || null });
      accept(data); selectDungeon(data.createdId); mode = 'edit'; category = 'all'; filter = 'all'; query = ''; $('search').value = '';
      $('create-form').hidden = true; $('new-name').value = ''; $('create-status').textContent = '';
      status(`已创建「${currentDungeon().name}」的配置，可继续选择配方。`);
    } catch (error) { $('create-status').textContent = error.message; status(error.message, true); }
    finally { busy = false; render(); }
  }
  function toggle(id, checked) {
    if (busy || mode !== 'edit' || !snapshot.recipes.find(r => r.id === id)?.selectable) return;
    if (checked) selected.add(id); else selected.delete(id);
    focused = id; changed();
  }
  $('dungeons').addEventListener('click', event => {
    const button = event.target.closest('[data-dungeon]'); if (!button || busy) return;
    selectDungeon(button.dataset.dungeon); mode = 'edit'; render();
    status(invalid() || '只保存当前地牢；切换地牢会保留其他未保存修改。', !!invalid());
  });
  $('allocation-button').addEventListener('click', () => {
    if (!snapshot || busy) return;
    mode = 'overview'; category = 'all'; query = ''; $('search').value = ''; render();
    status('总览包含未保存修改。点击地牢名称即可编辑该地牢。');
  });
  $('workspace').addEventListener('click', event => {
    const button = event.target.closest('[data-jump-dungeon]'); if (!button || busy) return;
    selectDungeon(button.dataset.jumpDungeon); focused = button.dataset.focusRecipe;
    mode = 'edit'; category = 'all'; filter = 'all'; query = ''; $('search').value = ''; render();
    status(`正在编辑「${currentDungeon().name}」的范围。`);
  });
  $('new-dungeon').addEventListener('click', () => {
    if (!snapshot || busy) return;
    $('copy-from').replaceChildren();
    const empty = el('option', '', '空范围 · 默认关闭投放'); empty.value = ''; $('copy-from').append(empty);
    for (const d of snapshot.dungeons) { const option = el('option', '', `复制「${d.name}」的已保存范围`); option.value = d.id; $('copy-from').append(option); }
    $('create-form').hidden = false; $('create-status').textContent = ''; $('new-name').focus();
  });
  $('cancel-create').addEventListener('click', () => { if (!busy) $('create-form').hidden = true; });
  $('create-form').addEventListener('submit', event => { event.preventDefault(); create(); });
  $('categories').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button || busy) return;
    category = button.dataset.category; render();
    [...$('categories').querySelectorAll('button')].find(b => b.dataset.category === category)?.focus({ preventScroll: true });
  });
  doc.querySelector('.filters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]'); if (!button || busy) return;
    filter = button.dataset.filter; render();
  });
  $('assignment-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-assignment]'); if (!button || busy) return;
    assignmentFilter = button.dataset.assignment; render();
  });
  $('search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); render(); });
  $('recipes').addEventListener('change', event => { if (event.target.dataset.recipe) toggle(event.target.dataset.recipe, event.target.checked); });
  $('recipes').addEventListener('click', event => {
    const button = event.target.closest('[data-detail]'); if (!button || busy) return;
    focused = button.dataset.detail; render();
    if (win.matchMedia?.('(max-width:900px)').matches) doc.querySelector('.detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('detail').addEventListener('click', event => { const id = event.target.closest('[data-toggle]')?.dataset.toggle; if (id) toggle(id, !selected.has(id)); });
  for (const [id, value] of [['select-visible', true], ['clear-visible', false]]) $(id).addEventListener('click', () => {
    if (!snapshot || busy || mode !== 'edit') return;
    const ids = visibleRows().filter(r => r.selectable).map(r => r.id);
    for (const key of ids) { if (value) selected.add(key); else selected.delete(key); }
    changed();
  });
  $('enabled').addEventListener('change', () => { draft.enabled = $('enabled').checked; changed(); });
  $('chance').addEventListener('change', () => { draft.chance = $('chance').value.trim() === '' ? NaN : Number($('chance').value) / 100; changed(); });
  $('undo').addEventListener('click', () => { if (!busy && snapshot) { drafts.set(activeDungeonId, structuredClone(currentDungeon().recipeStudy)); selectDungeon(activeDungeonId); render(); status('已撤销当前地牢的修改，其他地牢的草稿保留。'); } });
  $('export').addEventListener('click', () => {
    if (!snapshot || busy || invalid()) return;
    const blob = new win.Blob([JSON.stringify({ id: activeDungeonId, name: currentDungeon().name, recipeStudy: payload() }, null, 2) + '\n'], { type: 'application/json' });
    const url = win.URL.createObjectURL(blob), link = el('a');
    link.href = url; link.download = activeDungeonId + '-recipe-range.json'; doc.body.append(link); link.click(); link.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    status('已导出当前选择；导出不会改动地牢配置。');
  });
  $('reload').addEventListener('click', load); $('save').addEventListener('click', save);
  win.addEventListener('beforeunload', event => { if (dirtyCount()) { event.preventDefault(); event.returnValue = ''; } });
  const ready = load();
  return { ready, save, load, create };
}

if (typeof document !== 'undefined') mountEditor(document);

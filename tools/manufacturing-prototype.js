// Disposable UI prototype. Three forge-style layouts share only in-memory state.
// Data is read from the design draft and existing item catalog; no game globals or storage.
import { MODELS, createFlask } from './water-flask-prototype-model.mjs';
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => Number(Number(n).toFixed(1)).toLocaleString('zh-CN');
const skillNames = {life_fishing:'钓鱼',life_mining:'采矿',life_logging:'伐木',life_manufacturing:'制造',life_weaving:'纺织',life_pharmacy:'制药',life_cooking:'烹饪',life_planting:'种植',life_hunting:'狩猎'};
const categoryNames = {all:'全部已学配方',fishing:'钓具与鱼饵',gathering:'采集与维修工具',hunting:'狩猎耗材',daily:'日用与布作',cooking:'烹饪器具',pharmacy:'制药器具',agriculture:'配土材料'};
const variantNames = {A:'配方册',B:'分步',C:'清单'};
let data, catalog, classes, recipes, state;
let variant = new URLSearchParams(location.search).get('variant') || 'A';
if (!variantNames[variant]) variant = 'A';
let tab = 'make', selected = 'manufacturing.fishing_rod_hand_basic', category = 'all', search = '', quantity = 1, step = 1, moduleView = null, closed = false, cancelPrompt = false;
const choices = new Map();
const defaultEvidence = [
  {id:'repair-record',item:'tool_repair_pliers',type:'record',title:'夹持工具装配图',source:'旧维修工位',description:'从厂房维修间带回的完整装配图，标出了钳口与转轴的连接方法。'},
  {id:'rod-record',item:'fishing_rod_lure_basic',type:'record',title:'路亚竿制作手册',source:'旧渔具维修桌',description:'竹片定形、竿体装配和连接处密封的记录都还完整。'},
  {id:'reel-sample',item:'fishing_reel_basic',type:'M',title:'待研究的基础渔轮',source:'旧渔具维修桌',description:'关键结构完整，已经清空并卸下外接线组。拆解后无法保留这件样本。'}
];
function identity(id) { const i=catalog[id]; return i?.attribute_modules?.base?.identity || i || {}; }
function name(id) { const i=identity(id); return i.sn || i.name || '未标注物品'; }
function owned(id) { return state.inventory[id] || 0; }
function add(id,n) { state.inventory[id] = owned(id) + n; }
function recipe(id) { return recipes.find(r=>r.recipe_id===id); }
function recipeForItem(id) { return recipes.find(r=>r.item_id===id); }
function benchName() { return data.workbench.levels[state.level-1].name; }
function itemCategory(id) { const c=classes[id]?.category; return c?.startsWith('fishing_') ? 'fishing' : c || 'daily'; }
function grant(r) { if (!r || state.known.has(r.recipe_id)) return false; state.known.add(r.recipe_id); return true; }
function syncKnowledge() {
  const added=[];
  for (const r of recipes) {
    const u=r.unlock || {};
    const basic=u.kind==='skill_level' && (state.skills[u.skill_id]||1)>=u.level;
    const linked=['any_known_recipe','any_known_plan'].includes(u.kind) && ((u.recipe_ids||[]).some(id=>state.known.has(id)) || (u.upgrade_ids||[]).some(id=>state.inspected.has(id)));
    if ((basic || linked) && grant(r)) added.push(r.name);
  }
  return added;
}
function reset(preset='start') {
  state={level:1,facilities:new Set(['simple','bench','soil','metal']),inventory:{},craftedFlasks:[],flaskSerial:0,known:new Set(),inspected:new Set(),skills:Object.fromEntries(Object.keys(skillNames).map(k=>[k,k==='life_manufacturing'?5:1])),stamina:300,focus:100,xp:0,ticks:0,job:null,message:'',evidence:structuredClone(defaultEvidence),broken:true,preset};
  const productIds=new Set(recipes.map(r=>r.item_id));
  for(const r of recipes) for(const i of r.inputs||[]) if(!productIds.has(i.item_id)) state.inventory[i.item_id]=24;
  for(const f of Object.values(data.facilities)) for(const [id] of f.inputs||[]) if(!productIds.has(id)) state.inventory[id]=24;
  Object.assign(state.inventory,{wood_plank_soft:30,ore_steel_ingot:24,mechanical_parts:24,electronic_wire:12,item_glass:20,wood_bamboo_green:12,resin_pine:12,supply_rope_hemp_short:8,tool_repair_hammer:1,tool_sewing_kit_cloth:1,fishing_reel_basic:1});
  if(preset==='short') {
    state.level=2;state.facilities.add('precision');
    Object.assign(state.inventory,{wood_bamboo_green:0,material_nylon_stock:0,tool_repair_hammer:0,tool_repair_pliers:0,mechanical_parts:1});
    for(const id of ['fishing_reel_basic','tool_repair_pliers']) grant(recipeForItem(id));
  }
  if(preset==='advanced') {
    state.level=3;state.facilities=new Set(Object.keys(data.facilities));
    for(const k of Object.keys(state.skills)) state.skills[k]=25;
    for(const r of recipes) { grant(r); for(const i of r.inputs||[]) state.inventory[i.item_id]=Math.max(owned(i.item_id),40); }
    state.inventory.tool_repair_pliers=1;state.inventory.tool_repair_hammer=1;
  }
  syncKnowledge();tab='make';selected=preset==='start'?'manufacturing.fishing_rod_hand_basic':'manufacturing.fishing_reel_basic';category='all';search='';quantity=1;step=1;moduleView=null;closed=false;cancelPrompt=false;choices.clear();
  renderSettings();render();
}
function actualInputs(r) {
  return (r.inputs||[]).map(i=>{
    if(Array.isArray(i)) return {item_id:i[0],count:i[1]};
    const alt=choices.get(`${r.recipe_id}:${i.item_id}`);
    return alt && r.input_alternatives?.[i.item_id]?.find(x=>x.item_id===alt) || i;
  });
}
function staminaCost(r) {
  if(['upgrade','facility','research'].includes(r.kind)||r.work_profile==='existing_hunting') return r.stamina||0;
  return Math.ceil((r.stamina||0)*(1-.002*state.skills.life_manufacturing)*10)/10;
}
function successRate(r) {
  if(['upgrade','facility','research','repair'].includes(r.kind)) return 1;
  const p=data.work_profiles[r.work_profile];
  if(!p || p.random_failure===false) return 1;
  const l=state.skills.life_manufacturing;
  return Math.min(.98,Math.max(.25,p.base_success_rate+.002*(l-1)-.01*Math.max(0,p.recommended_level-l)));
}
function requirements(r, count=1, committed=false) {
  const missing=[];
  if(state.level<(r.workbench_level_min||0)) missing.push(`需要 ${r.workbench_level_min} 级制作台`);
  const facilities=[r.station,...(r.support_facilities||[]),...(r.required_facilities||[])].filter(Boolean);
  for(const f of new Set(facilities)) if(!state.facilities.has(f)) missing.push(`缺少${data.facilities[f].name}`);
  for(const t of r.required_tools||[]) if(owned(t.item_id)<t.count) missing.push(`缺少${name(t.item_id)}`);
  if(!committed) {
    for(const i of actualInputs(r)) if(owned(i.item_id)<i.count*count) missing.push(`${name(i.item_id)}还差 ${fmt(i.count*count-owned(i.item_id))}`);
    if(state.stamina+1e-6<staminaCost(r)*count) missing.push('体力不足');
    if(state.focus<(r.focus||0)*count) missing.push('专注不足');
  }
  if(r.kind==='upgrade' && state.level!==r.from_level) missing.push('台体等级已改变');
  if(r.kind==='facility' && state.facilities.has(r.facility)) missing.push('工位已经安装');
  if(r.kind==='research' && state.known.has(r.target_recipe)) missing.push('已经掌握');
  return missing;
}
function glyph(id,large=false) {
  let path='M14 40l25-25m-31 7 10-10 12 12-10 10zM35 31l8 8-5 5-8-8';
  const cat=itemCategory(id);
  if(id?.includes('rod')) path='M9 46 36 8m-4 6 5 2m-11 7 6 2m-12 7 6 2M36 8c8 7 9 20 8 29v7c0 5-7 5-7 0';
  else if(id?.includes('reel')) path='M29 15a13 13 0 1 0 0 26 13 13 0 1 0 0-26m0 7a6 6 0 1 0 0 12 6 6 0 1 0 0-12M17 19l-6-7m18 16 15 2v9h6M28 15V8H15';
  else if(id?.includes('pliers')) path='m17 7 4 13 9 9-8 19m16-41-4 13-9 9 12 19m-12-23h5';
  else if(id?.includes('flask')) path='M22 6h12v8l9 5v26H13V19l9-5zM20 6h16M15 33h26M22 14h12';
  else if(id?.includes('line')||id?.includes('rope')||id?.includes('wire')||cat==='hunting') path='M17 15c-12 5-8 25 5 26 13 1 27-15 19-26-8-12-25 0-24 11 2 14 19 4 18-5-2-9-12-3-12 3m0 17 17 8';
  else if(id?.includes('hook')) path='M34 10a4 4 0 1 0 0 8 4 4 0 1 0 0-8m0 8v20c0 16-23 16-23 0v-8l7 9';
  else if(['pharmacy','cooking'].includes(cat)) path='M12 25h32l-4 20H16zM21 25V12h14v13M19 12h18M10 30H5v9h9m28-9h7v9h-9';
  else if(id?.startsWith('material_')) path='m8 20 25-8 15 9-26 9zM8 20v19l14 8 26-10V21M22 30v17m-6-29 15 9';
  return `<span class="glyph${large?' large':''}" aria-hidden="true"><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></span>`;
}
function materialRows(r,count=1) {
  const inputs=actualInputs(r);
  if(!inputs.length) return '<p class="empty-tool">不消耗材料。</p>';
  return `<div class="materials"><div class="material-row head"><span>材料</span><span>持有</span><span>投入</span></div>${inputs.map((i,idx)=>{
    const source=r.inputs[idx];
    const options=r.input_alternatives?.[source.item_id];
    const producer=recipes.find(x=>x.item_id===i.item_id && state.known.has(x.recipe_id));
    const need=i.count*count, short=owned(i.item_id)<need;
    const pick=options?`<select aria-label="替代${esc(name(source.item_id))}" data-alternative="${esc(source.item_id)}" data-recipe="${esc(r.recipe_id)}">${[source,...options].map(o=>`<option value="${esc(o.item_id)}" ${i.item_id===o.item_id?'selected':''}>${esc(name(o.item_id))}</option>`).join('')}</select>`:esc(name(i.item_id));
    return `<div class="material-row"><span class="material-name">${pick}${short&&producer?`<button class="link" data-action="goto-recipe" data-id="${esc(producer.recipe_id)}">去${data.processing_recipes.includes(producer)?'加工':'制作'} ↗</button>`:''}</span><span class="${short?'bad':''}">${fmt(owned(i.item_id))}</span><span>${fmt(need)}</span></div>`;
  }).join('')}</div>`;
}
function toolRows(r) {
  if(!r.required_tools?.length) return '';
  return r.required_tools.map(t=>{
    const p=recipeForItem(t.item_id), missing=owned(t.item_id)<t.count;
    return `<div class="tool-row"><span>${esc(name(t.item_id))} × ${t.count}${missing&&p&&state.known.has(p.recipe_id)?` <button class="link" data-action="goto-recipe" data-id="${esc(p.recipe_id)}">去制作 ↗</button>`:''}</span><span class="${missing?'bad':'good'}">${missing?'缺少':'已备齐'}</span></div>`;
  }).join('');
}
function requirementTags(r) {
  const level=r.workbench_level_min||0;
  return `<div class="requirements"><span class="requirement ${state.level<level?'missing':''}">${state.level>=level?'✓':'!'} ${level?`${level} 级制作台`:'无需制作台'}</span>${[r.station,...(r.support_facilities||[]),...(r.required_facilities||[])].filter(Boolean).filter((f,i,a)=>a.indexOf(f)===i).map(f=>`<span class="requirement ${state.facilities.has(f)?'':'missing'}">${state.facilities.has(f)?'✓':'!'} ${f==='bench'?'本体操作面':esc(data.facilities[f].name)}</span>`).join('')}${state.level<level||[r.station,...(r.support_facilities||[])].filter(Boolean).some(f=>!state.facilities.has(f))?'<button class="link" data-action="open-bench">检查台体 ↗</button>':''}</div>`;
}
function quoteView(r,count=1,button='开始制作',allowQuantity=true) {
  const missing=requirements(r,count);
  return `<div class="quote"><div class="quote-stats"><span>工时<b>${r.ticks*count} 刻</b></span><span>体力<b>${fmt(staminaCost(r)*count)}</b></span>${r.focus?`<span>专注<b>${r.focus*count}</b></span>`:''}<span>成功率<b>${fmt(successRate(r)*100)}%</b></span></div><div class="action-line">${allowQuantity?`<div class="quantity"><span>批数</span><button data-action="quantity-minus" aria-label="减少批数" ${count<=1?'disabled':''}>−</button><input id="quantity" type="number" min="1" max="20" value="${count}" aria-label="制作批数"><button data-action="quantity-plus" aria-label="增加批数" ${count>=20?'disabled':''}>＋</button></div>`:'<span></span>'}<button class="primary" data-action="start" ${missing.length?'disabled':''}>${esc(button)}</button></div>${missing.length?`<p class="blocker">${missing.map(esc).join('；')}</p>`:''}</div>`;
}
function recipeDetail(r,ledger=false) {
  const tools=r.required_tools?.length?`<div><div class="section-title">工具 <span>不消耗</span></div>${toolRows(r)}</div>`:'';
  const materials=`<div>${materialRows(r,quantity)}</div>`;
  const output=r.water_flask_output;
  const flaskInfo=output?`<div class="tool-row"><span>空壶 ${output.water}／${output.capacity} · 无词条 · 无改造</span></div><div class="tool-row"><span>${esc(MODELS[output.model].detail)}</span></div>${state.craftedFlasks.some(f=>f.item_id===r.item_id)?`<div class="tool-row"><span>已制成空壶 ${state.craftedFlasks.filter(f=>f.item_id===r.item_id).length} 只</span></div>`:''}`:'';
  return `<article class="detail"><div class="detail-scroll"><div class="recipe-title">${glyph(r.item_id,true)}<div><h2>${esc(r.name)}</h2><span class="muted">${r.output_count||1} 件／批 · 持有 ${owned(r.item_id)}</span></div></div>${flaskInfo}${requirementTags(r)}${ledger?`<div class="ledger-columns">${materials}${tools}</div>`:materials+tools}</div>${quoteView(r,quantity,tab==='process'?'开始加工':'开始制作')}</article>`;
}
function visibleRecipes() {
  const source=tab==='process'?data.processing_recipes:data.recipes;
  return source.filter(r=>state.known.has(r.recipe_id) && (category==='all'||tab==='process'||itemCategory(r.item_id)===category) && (!search||r.name.includes(search)));
}
function filters() {
  return `<div class="book-tools"><select id="category" aria-label="配方分类">${Object.entries(tab==='process'?{all:'已学材料加工'}:categoryNames).map(([k,n])=>`<option value="${k}" ${category===k?'selected':''}>${n}</option>`).join('')}</select></div><input class="recipe-search" id="search" type="search" value="${esc(search)}" placeholder="查找已学配方" aria-label="查找已学配方">`;
}
function recipeRow(r) {
  const m=requirements(r), label=m.length?(state.level<r.workbench_level_min?'台级不足':m.some(x=>x.startsWith('缺少'))?'缺工位／工具':'缺材料／体力'):'可制作';
  return `<button class="recipe-row ${selected===r.recipe_id?'selected':''}" data-action="select" data-id="${esc(r.recipe_id)}" aria-pressed="${selected===r.recipe_id}">${glyph(r.item_id)}<span class="row-text"><b>${esc(r.name)}</b><small>${r.output_count||1} 件／批 · ${r.ticks} 刻</small></span><span class="row-status ${m.length?'':'ready'}">${label}</span></button>`;
}
function VariantA(list,r) {
  return `<div class="workshop"><aside class="recipe-book">${filters()}<div class="book-list">${list.map(recipeRow).join('')||'<p class="empty">无匹配配方</p>'}</div></aside>${r?recipeDetail(r):''}</div>`;
}
function VariantB(list,r) {
  return `<div class="wizard"><div class="steps"><span class="${step===1?'active':''}"><b>01</b>选择</span><span class="${step===2?'active':''}"><b>02</b>备料</span><span><b>03</b>制作</span></div>${step===1?`<section class="wizard-select">${filters()}<div class="book-list">${list.map(recipeRow).join('')||'<p class="empty">无匹配配方</p>'}</div><div class="wizard-bottom"><span class="muted">${r?esc(r.name):''}</span><button class="primary" data-action="next" ${r?'':'disabled'}>准备材料 →</button></div></section>`:`<button class="quiet back-link" data-action="previous">← 返回选择</button>${r?recipeDetail(r):'<p class="empty">未选择配方</p>'}`}</div>`;
}
function VariantC(list) {
  return `<div class="ledger-view"><div class="ledger-tools">${filters()}</div>${list.map(r=>`<section class="ledger-item">${recipeRow(r)}${r.recipe_id===selected?recipeDetail(r,true):''}</section>`).join('')||'<p class="empty">没有符合条件的已学配方。</p>'}</div>`;
}
function researchAction(e) {
  const p=data.research[e.type];
  return {kind:'research',name:`研究 · ${name(e.item)}`,item_id:e.item,target_recipe:recipeForItem(e.item).recipe_id,evidence:e.id,station:'bench',workbench_level_min:1,inputs:p.consumes_sample?[{item_id:e.item,count:1}]:[],required_tools:[],...p};
}
function researchView() {
  return `<div class="vertical-list">${state.evidence.map(e=>{
    const r=researchAction(e),known=state.known.has(r.target_recipe),missing=requirements(r);
    return `<article class="entry"><span class="paper-icon" aria-hidden="true">${e.type==='M'?'⚙':'▤'}</span><div class="entry-body"><h3>${esc(e.title)}</h3><div class="entry-meta"><span>${esc(e.source)}</span><span>${e.type==='M'?'消耗实物 × 1':'资料不消耗'}</span></div><small>${r.ticks} 刻 · ${r.stamina} 体力 · ${r.focus} 专注</small>${!known&&missing.length?`<p class="bad">${missing.map(esc).join('；')}</p>`:''}</div><button data-action="research" data-id="${e.id}" ${known||missing.length?'disabled':''}>${known?'已掌握':e.type==='M'?'拆解研究':'研读资料'}</button></article>`;
  }).join('')}</div>`;
}
function repairAction() {
  const r=data.maintenance.costs.find(r=>r.item_id==='fishing_rod_hand_basic');
  return {...r,kind:'repair',name:'维修基础手竿',output_count:1};
}
function repairView() {
  const r=repairAction();
  return `<div class="vertical-list"><article class="entry">${glyph(r.item_id,true)}<div class="entry-body"><h3>基础手竿</h3><p class="${state.broken?'bad':'good'}">${state.broken?'已损坏':'已修复'}</p><small>永久磨损：轻度${state.broken?'（无法修复）':''}</small></div></article>${state.broken?`${requirementTags(r)}${materialRows(r)}${toolRows(r)}${quoteView(r,1,'开始维修',false)}`:''}</div>`;
}
function upgradeAction() {
  const u=data.workbench.upgrades.find(u=>u.from_level===state.level);
  return u?{...u,kind:'upgrade',name:`改造为${data.workbench.levels[u.to_level-1].name}`,workbench_level_min:u.from_level}:null;
}
function facilityAction(id) {
  const f=data.facilities[id];
  return {...f,kind:'facility',facility:id,name:`加装${f.name}`,required_facilities:f.requires};
}
function inspectBench() {
  const u=upgradeAction();
  if(u) {state.inspected.add(u.upgrade_id); const gained=syncKnowledge(); if(gained.length) state.message=`检查改造方案，掌握了${gained.join('、')}的加工方法。`;}
}
function benchDrawing() {
  return '<svg class="bench-drawing" viewBox="0 0 240 160" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path fill="#303a28" d="m18 49 133-30 72 34-134 34z"/><path d="m18 49 1 11 70 37 134-33V53M89 87v10m-57-30v60l15 9V76m155-6v56l-13 7V74M90 99v49l15-3V94m-59 22 44 23m15-14 84-23M60 51l89-21m-62 35 91-22"/><path fill="#58604a" d="m152 29-17-9v24l20 10 15-4V31zM135 20l14-4 21 10v5m-15 5v18"/><path d="m169 42 23 9m-2-4 4 9M65 43l9-19 11 4-10 19m-1-23-8-4 11-7 16 9-8 6"/></svg>';
}
function benchView() {
  const u=upgradeAction(), f=moduleView&&facilityAction(moduleView), action=f||u;
  return `<div class="bench-layout"><aside class="bench-side">${benchDrawing()}<h2>${benchName()}</h2><div class="level-list">${data.workbench.levels.map(l=>`<span class="${l.level===state.level?'current':''}">${l.level} 级 · ${l.name}</span>`).join('')}</div></aside><section>${f?'<button class="quiet back-top" data-action="module-back">← 返回台体</button>':''}<div class="view-heading"><h3>${f?esc(f.name):u?`升级至 ${u.to_level} 级 · ${data.workbench.levels[u.to_level-1].name}`:'已达最高等级'}</h3></div>${action?`${requirementTags(action)}${materialRows(action)}${action.required_tools?.length?`<div class="section-title">工具 <span>不消耗</span></div>${toolRows(action)}`:''}${quoteView(action,1,f?'开始加装':'开始改造',false)}`:''}${!f?`<div class="module-list"><div class="section-title">附属工位</div>${['metal','kiln','precision'].map(id=>`<div class="module"><strong>${esc(data.facilities[id].name)}</strong>${state.facilities.has(id)?'<span class="good">已安装</span>':`<button class="small" data-action="module" data-id="${id}">查看加装</button>`}</div>`).join('')}</div>`:''}</section></div>`;
}
function currentAction() {
  if(tab==='bench') return moduleView?facilityAction(moduleView):upgradeAction();
  if(tab==='repair') return repairAction();
  return recipe(selected);
}
function startJob(r,count=1) {
  if(!r || state.job || requirements(r,count).length) return;
  const snapshot={...structuredClone(r),inputs:actualInputs(r)};
  state.job={r:snapshot,total:count,done:0,progress:0,committed:false,paid:[],staminaPaid:0,focusPaid:0,successes:0,failures:0,produced:0,xp:0,paused:false,complete:false,seed:null,cost:staminaCost(r),chance:successRate(r)};
  state.message='';cancelPrompt=false;render();
}
function awardXP(amount) {
  state.xp+=amount;
  while(state.skills.life_manufacturing<100 && state.xp>=50*state.skills.life_manufacturing+50) {
    state.xp-=50*state.skills.life_manufacturing+50;state.skills.life_manufacturing++;
  }
  syncKnowledge();
}
function tick() {
  const j=state?.job;
  if(!j || j.paused || j.complete || closed || document.hidden) return;
  const missing=requirements(j.r,1,j.committed);
  if(missing.length) {j.paused=true;state.message=missing.join('；');render();return;}
  if(!j.committed) {
    // Commit only this batch. Reusable tools never leave the inventory.
    for(const i of j.r.inputs||[]) {add(i.item_id,-i.count);j.paid.push(i);}
    state.stamina=Math.max(0,state.stamina-j.cost);state.focus-=j.r.focus||0;
    j.staminaPaid+=j.cost;j.focusPaid+=j.r.focus||0;j.seed=Math.random();j.committed=true;
  }
  j.progress++;state.ticks++;
  if(j.progress>=j.r.ticks) {
    j.done++;
    const success=j.seed<j.chance;
    if(success){j.successes++;j.produced+=j.r.output_count||1;}else j.failures++;
    if(j.r.kind==='research') j.xp+=j.r.experience||0;
    else if(!['upgrade','facility'].includes(j.r.kind)) j.xp+=j.r.ticks*(success?1:.25);
    j.committed=false;j.progress=0;
    if(j.done>=j.total) {j.complete=true;state.message='';announce('作业完成');}
  }
  render();
}
function settleJob(cancelled=false) {
  const j=state.job;if(!j || (!j.complete&&!cancelled)) return;
  const r=j.r;let message='已停止作业，未开工的批次没有扣料。';
  if(j.successes) {
    if(r.kind==='upgrade') {state.level=r.to_level;message=`已升级：${benchName()}`;}
    else if(r.kind==='facility') {state.facilities.add(r.facility);moduleView=null;message=`${data.facilities[r.facility].name}已安装。`;}
    else if(r.kind==='research') {grant(recipe(r.target_recipe));syncKnowledge();message=`掌握了${name(r.item_id)}的制作方法。`;}
    else if(r.kind==='repair') {state.broken=false;message='基础手竿已修复';}
    else {
      add(r.item_id,j.produced);
      if(r.water_flask_output) for(let i=0;i<j.produced;i++) state.craftedFlasks.push(createFlask(++state.flaskSerial,r.water_flask_output.model));
      message=`收到${r.name} × ${j.produced}${r.water_flask_output?'（空壶，无词条、无改造）':''}${j.failures?`，另有 ${j.failures} 批未成功`:''}。`;
    }
  } else if(j.complete) message='本次加工未成功，已经投入的材料无法收回。';
  awardXP(j.xp);state.job=null;cancelPrompt=false;state.message=message;
  if(tab==='bench') inspectBench();
  if(r.kind==='research') {tab='make';selected=r.target_recipe;category='all';search='';step=2;quantity=1;}
  announce(state.message);render();
}
function workView() {
  const j=state.job,r=j.r;
  const title=j.complete?'工作结束':j.paused?'已暂停':r.kind==='research'?'正在研究':r.kind==='upgrade'?'正在改造':r.kind==='facility'?'正在加装':r.kind==='repair'?'正在维修':'正在制作';
  const percent=(j.done*r.ticks+j.progress)/(j.total*r.ticks)*100;
  const reusable=(r.required_tools||[]).map(t=>`${name(t.item_id)} × ${t.count}`).join('、');
  let result=r.kind==='research'?`掌握${name(r.item_id)}的制作方法`:r.kind==='upgrade'?`${r.to_level} 级 · ${data.workbench.levels[r.to_level-1].name}`:r.kind==='facility'?`${data.facilities[r.facility].name}加装完毕`:r.kind==='repair'?'旧手竿恢复可用，原有磨损保留':j.produced?`${r.name} × ${j.produced}`:'未制成成品';
  return `<section class="work-view"><div class="${!j.paused&&!j.complete?'work-active':''}">${r.item_id?glyph(r.item_id,true):'<div class="work-symbol" aria-hidden="true">⚒</div>'}</div><div class="eyebrow">${title}</div><h2>${esc(r.name)}</h2>${j.complete?`<div class="result-box"><strong>${esc(result)}</strong>${j.failures?`<p>${j.failures} 批失败，材料已消耗</p>`:''}</div>`:`<div class="progress-track" role="progressbar" aria-label="工作进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(percent)}"><div class="progress-fill" style="width:${percent}%"></div></div><div class="progress-caption"><span>第 ${Math.min(j.done+1,j.total)} / ${j.total} 批</span><span>${j.done*r.ticks+j.progress} / ${j.total*r.ticks} 刻</span></div>`}<div class="work-ledger">${j.paid.length?`<p>投入：${Object.entries(j.paid.reduce((a,i)=>(a[i.item_id]=(a[i.item_id]||0)+i.count,a),{})).map(([id,n])=>`${esc(name(id))} × ${fmt(n)}`).join('、')}</p>`:''}${reusable?`<p>借用：${esc(reusable)}</p>`:''}<p>体力消耗 ${fmt(j.staminaPaid)}${j.focusPaid?` · 专注消耗 ${j.focusPaid}`:''}${j.complete?` · 制造经验 +${fmt(j.xp)}`:''}</p></div><div class="actions">${j.complete?'<button class="primary" data-action="collect">收取成果</button>':`<button class="primary" data-action="pause">${j.paused?'继续作业':'暂停作业'}</button><button data-action="stop">停止作业</button>`}</div>${cancelPrompt?`<div class="cancel-warning">当前批材料不退；收取已完成的 ${j.done} 批，剩余批次不扣料。<div class="actions"><button data-action="cancel-back">继续保留</button><button data-action="cancel-confirm">确认停止</button></div></div>`:''}</section>`;
}
function render() {
  if(!state) return;
  const scroll=$('.content')?.scrollTop||0,bookScroll=$('.book-list')?.scrollTop||0,detailScroll=$('.detail-scroll')?.scrollTop||0;
  const focus=document.activeElement;const focusId=focus?.id;const focusAction=focus?.dataset?.action;const focusDataId=focus?.dataset?.id;const selection=focusId==='search'?[focus.selectionStart,focus.selectionEnd]:null;
  $('#variant-label').textContent=`${variant} · ${variantNames[variant]}`;
  if(closed) {$('#app').innerHTML=`<section class="closed">${state.job&&!state.job.complete?'<p>作业已暂停</p>':''}<button class="primary" data-action="reopen">打开制作台</button></section>`;return;}
  let content;
  if(state.job) content=workView();
  else if(tab==='research') content=researchView();
  else if(tab==='bench') content=benchView();
  else if(tab==='repair') content=repairView();
  else {
    const list=visibleRecipes();
    if(!list.some(r=>r.recipe_id===selected)) selected=list[0]?.recipe_id||'';
    const r=recipe(selected);
    content=variant==='A'?VariantA(list,r):variant==='B'?VariantB(list,r):VariantC(list);
  }
  $('#app').innerHTML=`<section class="window" role="region" aria-label="制作台"><header class="header"><h1>制作台</h1><nav class="tabs" role="tablist" aria-label="制作台功能">${Object.entries({make:'制作',process:'加工',research:'研究',repair:'维修',bench:'台体'}).map(([k,n])=>`<button role="tab" aria-selected="${k===tab}" data-action="tab" data-id="${k}" ${state.job?'disabled':''}>${n}</button>`).join('')}</nav><button class="close" aria-label="关闭制作台" data-action="close">×</button></header><div class="context"><strong>${benchName()} · ${state.level} 级</strong>${state.message?`<span class="notice" title="${esc(state.message)}">${esc(state.message)}</span>`:''}</div><div class="content">${content}</div><footer class="footer"><span></span><div class="footer-right"><span>制造 ${state.skills.life_manufacturing} 级</span><span>体力 ${fmt(state.stamina)}</span><span>专注 ${state.focus}</span><span class="world-clock">${state.ticks} 刻</span></div></footer></section>`;
  if($('.content')) $('.content').scrollTop=scroll;
  if($('.book-list')) $('.book-list').scrollTop=bookScroll;
  if($('.detail-scroll')) $('.detail-scroll').scrollTop=detailScroll;
  if(focusId && document.getElementById(focusId)) {document.getElementById(focusId).focus({preventScroll:true});if(selection) $('#search').setSelectionRange(...selection);}
  else if(focusAction) $(`[data-action="${focusAction}"]${focusDataId?`[data-id="${focusDataId}"]`:''}`)?.focus({preventScroll:true});
}
function announce(text) {$('#announcer').textContent=text;}
function renderSettings() {
  $('#settings').innerHTML=`<h3>试玩设置</h3><label>情境（切换后重置）<select id="preset"><option value="start" ${state.preset==='start'?'selected':''}>初建制作台</option><option value="short" ${state.preset==='short'?'selected':''}>缺材料与工具</option><option value="advanced" ${state.preset==='advanced'?'selected':''}>精密台 · 全配方</option></select></label><button data-action="reset" class="small">重置</button><p>生活技能</p><div class="skill-edit"><select id="skill" aria-label="调整的生活技能">${Object.entries(skillNames).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select><input id="skill-level" aria-label="生活技能等级" type="number" min="1" max="100" value="${state.skills.life_fishing}"><button class="small" data-action="skill-apply" ${state.job?'disabled':''}>应用</button></div><p class="skill-summary">${Object.entries(state.skills).map(([k,v])=>`${skillNames[k]} ${v}`).join(' · ')}</p><p>不写入存档，刷新重置。</p><button class="quiet small" data-action="settings-close">收起</button>`;
}
function switchVariant(delta) {
  const names=Object.keys(variantNames);variant=names[(names.indexOf(variant)+delta+names.length)%names.length];
  const url=new URL(location.href);url.searchParams.set('variant',variant);history.replaceState(null,'',url);render();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b || b.disabled || !state) return;
  if(b.dataset.variant) {switchVariant(Number(b.dataset.variant));return;}
  if(b.id==='settings-toggle') {$('#settings').hidden=!$('#settings').hidden;b.setAttribute('aria-expanded',String(!$('#settings').hidden));renderSettings();return;}
  const a=b.dataset.action,id=b.dataset.id;
  if(a==='settings-close') {$('#settings').hidden=true;$('#settings-toggle').setAttribute('aria-expanded','false');return;}
  if(a==='reset') {reset(state.preset);return;}
  if(a==='skill-apply'&&!state.job) {
    const skill=$('#skill').value,value=Math.max(1,Math.min(100,Math.round(Number($('#skill-level').value)||1)));
    state.skills[skill]=value;const gained=syncKnowledge();state.message=gained.length?`新配方：${gained.join('、')}`:`${skillNames[skill]} ${value} 级`;announce(state.message);renderSettings();render();return;
  }
  if(a==='close') {closed=true;if(state.job&&!state.job.complete) state.job.paused=true;}
  else if(a==='reopen') closed=false;
  else if(a==='pause'&&state.job&&!state.job.complete) {state.job.paused=!state.job.paused;cancelPrompt=false;}
  else if(a==='stop'&&state.job) {state.job.paused=true;cancelPrompt=true;}
  else if(a==='cancel-back') cancelPrompt=false;
  else if(a==='cancel-confirm') {settleJob(true);return;}
  else if(a==='collect') {settleJob();return;}
  else if(state.job) return;
  else if(a==='tab') {tab=id;category='all';search='';quantity=1;step=1;moduleView=null;if(tab==='bench') inspectBench();}
  else if(a==='select') {selected=id;quantity=1;if(variant==='B') step=2;}
  else if(a==='next') step=2;
  else if(a==='previous') step=1;
  else if(a==='quantity-minus') quantity=Math.max(1,quantity-1);
  else if(a==='quantity-plus') quantity=Math.min(20,quantity+1);
  else if(a==='goto-recipe') {selected=id;tab=data.processing_recipes.some(r=>r.recipe_id===id)?'process':'make';category='all';search='';quantity=1;step=2;}
  else if(a==='open-bench') {tab='bench';moduleView=null;inspectBench();}
  else if(a==='module') moduleView=id;
  else if(a==='module-back') moduleView=null;
  else if(a==='start') {startJob(currentAction(),['make','process'].includes(tab)?quantity:1);return;}
  else if(a==='research') {startJob(researchAction(state.evidence.find(e=>e.id===id)));return;}
  render();
  if(['tab','goto-recipe','open-bench','module','module-back'].includes(a)) $('.content')?.scrollTo(0,0);
});
document.addEventListener('input',e=>{
  if(e.target.id==='search'){search=e.target.value;render();}
  if(e.target.id==='quantity') {
    // Track edits immediately: native number controls may defer change until blur.
    quantity=Math.max(1,Math.min(20,Math.round(Number(e.target.value)||1)));
  }
});
document.addEventListener('change',e=>{
  if(e.target.id==='preset') {reset(e.target.value);return;}
  if(e.target.id==='skill') {$('#skill-level').value=state.skills[e.target.value];return;}
  if(e.target.id==='category'){category=e.target.value;quantity=1;render();}
  if(e.target.id==='quantity'){quantity=Math.max(1,Math.min(20,Math.round(Number(e.target.value)||1)));render();}
  if(e.target.dataset.alternative){choices.set(`${e.target.dataset.recipe}:${e.target.dataset.alternative}`,e.target.value);render();}
});
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select,[contenteditable=true]')) return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();switchVariant(e.key==='ArrowRight'?1:-1);}
  if(e.key==='Escape'&&!closed){closed=true;if(state?.job&&!state.job.complete) state.job.paused=true;render();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state?.job&&!state.job.complete){state.job.paused=true;render();}});
try {
  const files=['../docs/design/examples/manufacturing-system-v1.json','../docs/design/manufacturing-classification-v1.json','../data/items.json','../data/forging/item-catalog-v2.json'];
  const loaded=await Promise.all(files.map(async file=>{const r=await fetch(file);if(!r.ok) throw new Error(`${file}: ${r.status}`);return r.json();}));
  data=loaded[0];classes=Object.fromEntries(loaded[1].items.map(i=>[i.item_id,i]));catalog={...loaded[2],...loaded[3].items};recipes=[...data.recipes,...data.processing_recipes];
  reset();setInterval(tick,700);
} catch(error) {
  console.error(error);$('#app').innerHTML='<section class="closed"><h2>制作笔记未能加载</h2><p>请通过本地试玩服务打开页面，再刷新重试。</p></section>';
}

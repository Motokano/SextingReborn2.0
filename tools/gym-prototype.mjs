// Single spatial prototype: approach a facility pawn, then train or improve it.
// UI labels and actual results only; no instructions or permanent overview panels.
import {createGymPrototype} from './gym-prototype-model.mjs';
import {createGymScene} from './gym-prototype-scene.mjs';
import {EFFICIENCY} from './gym-prototype-data.mjs';
import {createMuscleAtlas,seedMuscleAtlas} from './muscle-atlas-prototype.mjs';
export async function mountGymPrototype({sceneFactory=createGymScene,initialScenario='fresh'}={}){
const M=window.Muscles,S=window.Survival,$=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Number(v).toFixed(3),gain=v=>Number(v).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
const dis=yes=>yes?'disabled':'';
let demo,scene,texts,config,mode='',stationId='',selected='pushup',tab='train',batch=1,lastActions={};
let timer=null,due=0,tickStarted=0,noticeTimer,moving=false;
let atlas=null;
const busy=()=>!!demo?.state.job,current=()=>demo.getAction(selected);
function notice(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,3200);}
function stopClock(){if(timer!==null)clearTimeout(timer);timer=null;due=0;}
function schedule(){
  if(timer!==null||!busy()||document.hidden)return;
  tickStarted=performance.now();due=tickStarted+demo.intervalMs();
  timer=setTimeout(()=>{timer=null;due=0;const before=demo.state.job;demo.tick();if(!demo.state.job&&before.kind!=='train')notice(before.kind==='sleep'?'睡眠完成':'休息结束');render();schedule();},demo.intervalMs());
}
function perform(fn){try{fn();render();schedule();}catch(e){notice(e.message);}}
function resource(label,key,value){return `<div class="resource ${key}"><span>${label}</span><b>${value.toFixed(1)}</b><div class="bar"><i style="width:${Math.min(100,value)}%"></i></div></div>`;}
function costs(items){return `<div class="cost-row"><span>材料</span><span>库存 / 需要</span></div>`+Object.entries(items).map(([id,n])=>`<div class="cost-row ${demo.state.materials[id]<n?'missing':''}"><span>${demo.materials[id]}</span><span>${demo.state.materials[id]} / ${n}</span></div>`).join('');}
function reason(a){const why=demo.trainReason(a);if(!why)return '';return S.isDead()?'已失能':S.getFatigue()>=80?'疲劳过高':why.includes('全部点亮')?'已练满':'体力不足';}
function jobHTML(){const j=demo.state.job;if(!j)return '';return `<div class="job"><div class="job-head"><span>${j.kind==='train'?`${j.finished+1} / ${j.groups}组`:j.kind==='sleep'?'睡眠':'休息'}</span><span id="job-time"></span></div><div class="bar"><i id="job-bar" style="width:0%"></i></div>${j.kind==='sleep'?'':`<button id="stop" ${dis(j.stopAfter)}>${j.stopAfter?'停止中':j.kind==='train'?'本组后停止':'停止'}</button>`}</div>`;}
function resultHTML(a){const r=demo.state.last;if(!r||r.name!==a.name)return '';return `<div class="result"><div class="result-head"><span>${r.name} · 完成${r.lit.length?' · 点亮 '+r.lit.length:''}</span><button id="dismiss-result" aria-label="关闭结果">×</button></div><div class="result-list">${r.changes.map(c=>`<div><span>${esc(M.getMuscleById(c.id).name)}</span><b>${gain(c.before)}% → ${gain(c.after)}%</b></div>`).join('')}</div></div>`;}
function trainHTML(){
  const a=current(),j=demo.state.job,rewards=j?.kind==='train'?j.rewards:demo.rewardPreview(a),why=reason(a),eff=j?.kind==='train'?j.efficiency:demo.efficiency(a),total=j?.kind==='train'?j.totalPct:demo.totalGrowth(a,eff);
  return `<div class="training-layout"><nav class="action-list" aria-label="训练动作">${demo.actions.filter(x=>x.station===stationId).map(x=>`<button data-action="${x.id}" class="${selected===x.id?'active':''}" ${dis(busy())}>${x.name}</button>`).join('')}</nav><div class="training-detail"><div class="detail-head"><h3>${a.name}</h3><span class="level">${eff?'效率 ×'+eff.multiplier.toFixed(3):'本组收益已锁定'}</span></div>${eff?`<div class="efficiency-sources"><span>器械 ×${eff.equipment.toFixed(2)}</span><span>解剖学 +${(eff.anatomyBonus*100).toFixed(0)}%</span><span>营养 +${(eff.nutritionBonus*100).toFixed(0)}%</span></div>`:""}<div class="metrics"><div>体力<b>−${demo.cost(a).toFixed(1)}</b></div><div>疲劳<b>+${demo.fatigueCost(a).toFixed(1)}</b></div><div>耗时<b>${a.ticks*config.idle_seconds_per_tick}秒</b></div><div>成长总量<b class="growth-total">+${gain(total)}%</b></div></div><div class="reward-head"><span>肌肉</span><span>成长度</span><span>奖励</span></div><div class="rewards">${rewards.map(r=>`<div class="reward-row"><strong>${esc(M.getMuscleById(r.id).name)}<small>${r.role}</small></strong><span>${pct(demo.percent(r.id))}%</span><b>${M.isUnlocked(r.id)?'✓':'随机'}</b><div class="bar"><i style="width:${demo.percent(r.id)}%"></i></div></div>`).join('')}</div>${jobHTML()}<div class="train-controls"><select id="batch" aria-label="训练组数" ${dis(busy())}>${[1,4,8].map(n=>`<option value="${n}" ${batch===n?'selected':''}>${n}组</option>`).join('')}</select><button id="train" class="primary" ${dis(busy()||why)}>${busy()?'训练中':why||'开始训练'}</button></div>${resultHTML(a)}</div></div>`;
}
function upgradeHTML(){
  const u=demo.upgradeInfo(current());
  const modules=stationId==='handsfeet'?`<div class="module-tabs">${[['grip','手部用具'],['calf_raise','足踝踏台'],['toe_curl','足趾用具']].map(([id,name])=>`<button data-module="${id}" class="${demo.upgradeInfo(demo.getAction(id)).key===u.key?'active':''}">${name}</button>`).join('')}</div>`:'';
  return `<div class="upgrade-view">${modules}<div class="upgrade-summary"><span>${u.name} · ${u.level}级</span><span>效率 ×${EFFICIENCY[u.level].toFixed(2)}</span></div>${u.level<4?`<h3>${u.title}</h3><div class="upgrade-summary"><span>${u.level} → ${u.level+1}级</span><span>×${EFFICIENCY[u.level].toFixed(2)} → ×${u.nextEfficiency.toFixed(2)}</span></div>${costs(u.costs)}<button class="primary" id="upgrade" ${dis(busy()||!demo.afford(u.costs))}>升级</button>`:'<h3>已满级</h3>'}${demo.state.assignedPlates[u.key]?`<div class="cost-row"><span>已装配重片组</span><span>${demo.state.assignedPlates[u.key]}</span></div>`:''}</div>`;
}
function facilityHTML(){const s=demo.station(stationId);if(!demo.state.levels[s.id])return `<div class="build-view"><h3>建造 · ${s.name}</h3>${costs(s.build)}<button id="build" class="primary" ${dis(busy()||!demo.afford(s.build))}>建造</button></div>`;
  return `<nav class="tabs" aria-label="设施功能"><button data-tab="train" class="${tab==='train'?'active':''}" ${dis(busy())}>训练</button><button data-tab="upgrade" class="${tab==='upgrade'?'active':''}" ${dis(busy())}>升级</button></nav>${tab==='upgrade'?upgradeHTML():trainHTML()}`;
}
function supplyHTML(){const st=demo.state;return `<div class="utility-view"><div class="inventory"><div><span>食物</span><b>${st.food}</b></div><div><span>饮水</span><b>${st.water}</b></div></div><div class="utility-buttons"><button data-eat="food" ${dis(busy()||S.getSatiety()>=100||!st.food)}>进食</button><button data-eat="water" ${dis(busy()||S.getThirst()>=100||!st.water)}>饮水</button></div><div class="inventory">${Object.entries(demo.materials).map(([id,name])=>`<div><span>${name}</span><b>${st.materials[id]}</b></div>`).join('')}</div><div class="forge-row"><h3>配重片组 ×1</h3>${costs({metal:12,parts:2})}<button id="forge" class="primary" ${dis(busy()||!demo.afford({metal:12,parts:2}))}>制作</button></div></div>`;}
function bedHTML(){
  const st=S.getState(),j=demo.state.job;
  return `<div class="utility-view"><div class="bed-resources">${resource('饱食','satiety',st.satiety)}${resource('饮水','thirst',st.thirst)}${resource('疲劳','fatigue',st.fatigue)}${resource('体力','stamina',st.stamina)}</div><div class="utility-buttons"><button data-recover="rest" ${dis(busy()||st.stamina>=100||st.satiety<1||st.thirst<1)}>${j?.kind==='rest'?'休息中':'休息'}</button><button data-recover="sleep" ${dis(busy()||st.fatigue<=50)}>${j?.kind==='sleep'?'睡眠中':'睡眠'}</button></div>${j?.kind==='rest'?`<button id="stop" ${dis(j.stopAfter)}>${j.stopAfter?'停止中':'停止'}</button>`:''}</div>`;
}
function controls(){for(const id of ['scenario','reset','supply','muscles','anatomy-level','nutrition-value'])if($(id))$(id).disabled=!demo||!scene||busy()||moving;if(demo&&$('anatomy-level')){$('anatomy-level').value=demo.state.anatomyLevel;$('nutrition-value').value=S.getState().nutrition;}}
function render(){
  const st=S.getState();$('resources').innerHTML=resource('体力','stamina',st.stamina)+resource('疲劳','fatigue',st.fatigue)+resource('饱食','satiety',st.satiety)+resource('饮水','thirst',st.thirst);
  const win=$('interaction'),body=$('window-content');
  if(mode){
    const scroll=body.scrollTop,actionScroll=body.querySelector('.action-list')?.scrollTop||0;
    win.dataset.mode=mode;$('interaction-title').textContent=mode==='facility'?demo.station(stationId).name:mode==='ledger'?'肌群':mode==='bed'?'旧床':'物资架';
    if(mode==='ledger'){
      if(!atlas)atlas=createMuscleAtlas({host:body,M,demo,texts,onClose:close});
      else atlas.refresh();
    }else{
      atlas?.destroy();atlas=null;
      body.innerHTML=mode==='facility'?facilityHTML():mode==='bed'?bedHTML():supplyHTML();
    }
    body.scrollTop=scroll;if(body.querySelector('.action-list'))body.querySelector('.action-list').scrollTop=actionScroll;
    if(!win.open){win.showModal();(mode==='ledger'?body.querySelector('[data-close]'):$('close')).focus({preventScroll:true});}
  }
  controls();scene?.refresh();updateClock();
}
function close(){mode='';atlas?.destroy();atlas=null;$('interaction').close();scene?.clearSelection();}
function activePlace(){const j=demo.state.job;return j?.kind==='train'?demo.getAction(j.actionId).station:j?'bed':null;}
function openPlace(id,locked=false,requestedTab='train'){
  if(busy()&&activePlace()!==id){notice('进行中');return;}
  if(id==='bed'||id==='supply')mode=id;
  else {mode='facility';stationId=id;selected=busy()?demo.state.job.actionId:lastActions[id]||demo.actions.find(a=>a.station===id).id;tab=requestedTab==='upgrade'?'upgrade':'train';}
  render();
}
function interactPlace(id,locked=false){
  const npcId=window.GymFacility.npcId(id);
  if(npcId)return window.NPCSystem.openMenu(npcId);
  openPlace(id,locked);
}
function updateClock(){
  const j=demo?.state.job,globalJob=$('active-job');globalJob.hidden=!j;if(!j)return;
  const total=j.kind==='train'?demo.getAction(j.actionId).ticks:j.kind==='sleep'?config.sleep_duration_ticks:10,ms=demo.intervalMs();
  const fraction=document.hidden||!due?0:Math.min(1,Math.max(0,(performance.now()-tickStarted)/ms));
  const left=Math.ceil((total-j.ticks-fraction)*ms/1000),name=j.kind==='train'?demo.getAction(j.actionId).name:j.kind==='sleep'?'睡眠':'休息';
  const status=document.hidden?'已暂停':left+'秒';globalJob.textContent=name+' · '+status;
  if($('job-time'))$('job-time').textContent=status;if($('job-bar'))$('job-bar').style.width=Math.min(100,(j.ticks+fraction)/total*100)+'%';
}
function reset(){if(!demo||!scene||busy()||moving)return;window.NPCSystem.menu.close();close();stopClock();demo.reset($('scenario').value);lastActions=$('scenario').value==='near'?{dumbbell:'lateral_raise'}:$('scenario').value==='core-near'?{floor:'diaphragmatic_breathing'}:{};scene.reset();render();}
$('window-content').addEventListener('click',e=>{
  if(e.target.closest('.muscle-atlas'))return;
  const b=e.target.closest('button');if(!b||b.disabled)return;
  perform(()=>{
    if(b.dataset.action){selected=b.dataset.action;lastActions[stationId]=selected;}
    else if(b.dataset.tab)tab=b.dataset.tab;
    else if(b.dataset.module)selected=b.dataset.module;
    else if(b.dataset.recover)demo.recover(b.dataset.recover);
    else if(b.dataset.eat){demo.eat(b.dataset.eat);notice(b.dataset.eat==='food'?'饱食 +25':'饮水 +25');}
    else if(b.id==='build'){demo.build(stationId);notice(demo.station(stationId).name+' · 已建造');}
    else if(b.id==='upgrade'){demo.upgrade(selected);notice('升级完成');}
    else if(b.id==='train'){demo.startTraining(selected,batch);tab='train';}
    else if(b.id==='stop')demo.stop();
    else if(b.id==='forge'){demo.forgePlates();notice('配重片组 +1');}
    else if(b.id==='dismiss-result')demo.state.last=null;
  });
});
$('window-content').addEventListener('change',e=>{if(e.target.id==='batch')batch=Number(e.target.value);});
$('close').onclick=close;$('interaction').addEventListener('cancel',e=>{e.preventDefault();close();});
$('interaction').addEventListener('click',e=>{if(e.target===$('interaction')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
$('muscles').onclick=()=>{mode='ledger';render();};
if($('inventory'))$('inventory').onclick=()=>{if(!moving&&!busy()){window.NPCSystem.menu.close();openPlace('supply');}};
$('active-job').onclick=()=>interactPlace(activePlace(),true);
$('scenario').onchange=reset;$('reset').onclick=reset;$('supply').onclick=()=>perform(()=>{demo.supply();notice('物资已补充');});
document.addEventListener('visibilitychange',()=>{stopClock();if(demo){render();schedule();}});
window.addEventListener('pagehide',stopClock);window.addEventListener('pageshow',()=>{if(demo)schedule();});
async function boot(){
  const muscleReady=(async()=>{for(let i=0;i<100&&!M.getGroups().length;i++)await new Promise(r=>setTimeout(r,50));if(!M.getGroups().length)throw Error('肌群加载失败');})();
  [config,texts]=await Promise.all(['data/survival-config.json','data/ui_text_zhCN.json'].map(url=>fetch(url).then(r=>r.json())));await muscleReady;
  demo=createGymPrototype(window,config);demo.reset(initialScenario);$('scenario').value=initialScenario;render();
  $('demo-settings').querySelector('.settings-body').insertAdjacentHTML('beforeend','<label>解剖学等级<input id="anatomy-level" type="number" min="0" step="1" value="0"></label><label>营养<input id="nutrition-value" type="number" min="0" max="100" step="1" value="40"></label>');
  $('anatomy-level').onchange=()=>perform(()=>demo.setAnatomyLevel(Number($('anatomy-level').value)));
  $('nutrition-value').onchange=()=>perform(()=>demo.setNutrition(Number($('nutrition-value').value)));
  scene=await sceneFactory({canvas:$('board'),pawns:$('pawns'),container:$('map-viewport'),demo,onInteract:interactPlace,onMoving:value=>{moving=value;controls();},canMove:()=>!busy()&&!$('interaction').open&&!window.NPCSystem.isMenuOpen()});
  window.SceneCtx={E:{getState:()=>scene.getActor()}};
  window.GymFacility.bind({position:()=>scene.getActor(),placement:id=>scene.getPlacement(id),level:id=>demo.state.levels[id]||0,job:()=>demo.state.job,action:id=>demo.getAction(id),open:(id,action)=>{openPlace(id,false,action);return true;}});
  await Promise.all(demo.stations.map(s=>window.NPCSystem.preloadNpc(window.GymFacility.npcId(s.id))));
  render();window.GymPrototype={demo,scene,refresh:render};setInterval(updateClock,150);
  if(new URLSearchParams(location.search).has('atlas')){seedMuscleAtlas(demo,M);mode='ledger';render();}
}
controls();
await boot();
return window.GymPrototype;
}
if(document.body.dataset.gymHost!=='hideout')mountGymPrototype().catch(e=>{document.getElementById('notice').textContent='加载失败';document.getElementById('notice').hidden=false;console.error(e);});

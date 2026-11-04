/* Shared by both UI shells; opened only through the registered facility NPC. */
(function(g){
 'use strict';
 const G=g.GymSystem,D=g.GymData,M=g.Muscles;
 let root,body,id='',selected='',mode='train',batch=1,offer=null,forgeOffer=null,expectedLevel=0,message='';
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const disabled=v=>v?'disabled':'',percent=v=>Number(v).toFixed(2);
 function ensure(){
  if(root)return;root=document.createElement('dialog');root.id='gym-panel';root.className='gym-panel';root.setAttribute('aria-labelledby','gym-title');
  root.innerHTML='<header class="window-head"><h2 id="gym-title"></h2><button type="button" data-close aria-label="关闭健身设施">×</button></header><div class="gym-content"></div>';
  body=root.querySelector('.gym-content');document.body.appendChild(root);
  root.addEventListener('cancel',e=>{e.preventDefault();close();});
  root.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.hasAttribute('data-close')){close();return;}
   if(!G.at(id)){close();return;}
   let result;
   if(b.dataset.action){if(G.isActive())return;selected=b.dataset.action;}
   else if(b.dataset.tab){if(G.isActive())return;mode=b.dataset.tab;}
   else if(b.dataset.module){if(G.isActive())return;selected=b.dataset.module;}
   else if(b.dataset.op==='train')result=G.startTraining(selected,batch);
   else if(b.dataset.op==='build')result=G.build(id,offer.signature);
   else if(b.dataset.op==='upgrade')result=G.upgrade(selected,expectedLevel,offer.signature);
   else if(b.dataset.op==='forge')result=G.forgePlates(id,forgeOffer.signature);
   else if(b.dataset.op==='stop')result=G.stop();
   else if(b.dataset.op==='retry')G.retry();
   else if(b.dataset.op==='dismiss')G.dismissResult();
   if(result)message=result.ok?(b.dataset.op==='build'?'已建造':b.dataset.op==='upgrade'?'升级完成':b.dataset.op==='forge'?'配重片组 +1':''):result.message;
   render();
  });
  root.addEventListener('change',e=>{if(e.target.matches('[data-batch]'))batch=Number(e.target.value);});
 }
 function materialHTML(p){return '<div class="cost-row"><span>材料</span><span>随身 / 消耗</span></div>'+p.used.map(r=>`<div class="cost-row"><span>${esc(r.name)}</span><span>${r.stock} / ${r.count}</span></div>`).join('')+(p.missing.length?`<div class="blocked">缺少：${p.missing.map(esc).join('、')}</div>`:'');}
 function resourceHTML(){const s=g.Survival.getState();return '<div class="gym-resources">'+[['stamina','体力'],['fatigue','疲劳'],['satiety','饱食'],['thirst','饮水']].map(([k,n])=>`<div class="resource ${k}"><span>${n}</span><b>${s[k].toFixed(1)}</b><div class="bar"><i style="width:${Math.min(100,s[k]/(k==='satiety'?120:k==='stamina'?g.Survival.getStaminaMax():100)*100)}%"></i></div></div>`).join('')+'</div>';}
 function trainingHTML(s){
  const a=G.action(selected),j=s.job,busy=!!j,rs=j?j.rewards:G.rewards(a),why=G.trainReason(a),last=G.getLast(),eff=j?j.efficiency:G.efficiency(a);
  return `<div class="training-layout"><nav class="action-list" aria-label="训练动作">${D.ACTIONS.filter(a=>a.station===id).map(a=>`<button data-action="${a.id}" class="${a.id===selected?'active':''}" ${disabled(busy)}>${a.name}</button>`).join('')}</nav><div class="training-detail"><div class="detail-head"><h3>${a.name}</h3><span class="level">${eff?'效率 ×'+eff.multiplier.toFixed(3):'本组收益已锁定'}</span></div>${eff?`<div class="efficiency-sources"><span>器械 ×${eff.equipment.toFixed(2)}</span><span>解剖学 +${(eff.anatomyBonus*100).toFixed(0)}%</span><span>营养 +${(eff.nutritionBonus*100).toFixed(0)}%</span></div>`:""}<div class="metrics"><div>体力<b>−${G.cost(a).toFixed(1)}</b></div><div>疲劳<b>+${(G.cost(a)*D.TRAINING_FATIGUE_PER_STAMINA).toFixed(1)}</b></div><div>耗时<b>${a.ticks*3}秒</b></div></div><div class="reward-head"><span>肌肉</span><span>成长度</span><span>奖励</span></div><div class="rewards">${rs.map(r=>`<div class="reward-row"><strong>${esc(M.getMuscleById(r.id)?.name||r.id)}<small>${r.role}</small></strong><span>${percent(M.getProgress(r.id))}%</span><b>${M.isUnlocked(r.id)?'✓':'+'+r.pct+'%'}</b><div class="bar"><i style="width:${M.getProgress(r.id)}%"></i></div></div>`).join('')}</div>${j?`<div class="job"><div class="job-head"><span>${j.finished+1} / ${j.groups}组</span><span>${document.hidden?'已暂停':(a.ticks-j.ticks)*3+'秒'}</span></div><div class="bar"><i style="width:${j.ticks/a.ticks*100}%"></i></div><button data-op="stop" ${disabled(j.stopAfter)}>${j.stopAfter?'停止中':'本组后停止'}</button></div>`:''}<div class="train-controls"><select data-batch aria-label="训练组数" ${disabled(busy)}>${[1,4,8].map(n=>`<option value="${n}" ${n===batch?'selected':''}>${n}组</option>`).join('')}</select><button class="primary" data-op="train" ${disabled(busy||why)}>${busy?'训练中':why||'开始训练'}</button></div>${last&&last.name===a.name?`<div class="result"><div class="result-head"><span>${a.name} · 完成${last.lit.length?' · 点亮 '+last.lit.length:''}</span><button data-op="dismiss" aria-label="关闭结果">×</button></div><div class="result-list">${last.changes.filter(c=>c.gain>0).map(c=>`<div><span>${esc(M.getMuscleById(c.id).name)}</span><b>${percent(c.before)}% → ${percent(c.after)}%</b></div>`).join('')}</div></div>`:''}</div></div>`;
 }
 function constructionHTML(s){
  const st=G.station(id),built=!!s.levels[id],u=built?G.upgradeInfo(G.action(selected)):null,costs=built?u.costs:st.build;
  offer=G.plan(costs);forgeOffer=G.plan({metal:12,parts:2});expectedLevel=u?.level||0;
  const tabs=built&&id==='handsfeet'?`<div class="module-tabs">${[['grip','手部用具'],['calf_raise','足踝踏台'],['toe_curl','足趾用具']].map(([a,n])=>`<button data-module="${a}" class="${G.moduleKey(G.action(a))===u.key?'active':''}">${n}</button>`).join('')}</div>`:'';
  return `<div class="upgrade-view">${tabs}<h3>${built?u.title:'建造 · '+st.name}</h3>${built?`<div class="upgrade-summary"><span>${u.name} · ${u.level}级</span><span>效率 ×${D.EFFICIENCY[u.level].toFixed(2)}${u.level<4?' → ×'+u.nextEfficiency.toFixed(2):''}</span></div>`:''}${!built||u.level<4?materialHTML(offer)+`<button class="primary" data-op="${built?'upgrade':'build'}" ${disabled(!offer.ok||s.job)}>${built?'升级':'建造'}</button>`:''}<div class="forge-row"><h3>配重片组 · ${s.plates}</h3>${materialHTML(forgeOffer)}<button data-op="forge" ${disabled(!forgeOffer.ok||s.job)}>制作配重片组 ×1</button></div></div>`;
 }
 function render(){
  if(!root?.open)return;if(!G.at(id)){close();return;}
  const s=G.getState(),scroll=body.scrollTop,actionScroll=body.querySelector('.action-list')?.scrollTop||0;
  root.querySelector('h2').textContent=G.station(id).name;
  body.innerHTML=resourceHTML()+(s.levels[id]?`<nav class="tabs" aria-label="设施功能"><button data-tab="train" class="${mode==='train'?'active':''}" ${disabled(s.job)}>训练</button><button data-tab="upgrade" class="${mode==='upgrade'?'active':''}" ${disabled(s.job)}>升级</button></nav>`:'')+(s.levels[id]&&mode==='train'?trainingHTML(s):constructionHTML(s))+`<div class="gym-message" role="status">${esc(G.getError()||message)}${G.getError()&&s.job?'<button data-op="retry">重试</button>':''}</div>`;
  body.scrollTop=scroll;if(body.querySelector('.action-list'))body.querySelector('.action-list').scrollTop=actionScroll;
 }
 function show(stationId,tab='train'){
  if(!G.at(stationId))return false;const s=G.getState();if(s.job&&G.action(s.job.actionId).station!==stationId)return false;
  ensure();if(id!==stationId)selected='';id=stationId;selected=s.job?.actionId||selected||D.ACTIONS.find(a=>a.station===id).id;mode=tab==='upgrade'?'upgrade':'train';message='';
  if(!root.open)root.showModal();render();return true;
 }
 function close(){if(root?.open)root.close();}
 G.subscribe(render);
 // Busy sessions retain one visible route back to the owning facility.
 let activeButton;
 G.subscribe(()=>{if(!activeButton){activeButton=document.createElement('button');activeButton.id='gym-active-job';activeButton.onclick=()=>{const j=G.getState().job;if(j)show(G.action(j.actionId).station);};document.body.appendChild(activeButton);}const j=G.getState().job;activeButton.hidden=!j;activeButton.textContent=j?G.action(j.actionId).name+' · '+(G.getError()?'重试':document.hidden?'已暂停':'训练中'):'';});
 ['click','pointerdown','contextmenu','keydown'].forEach(kind=>g.addEventListener(kind,e=>{if(!G.isActive()||root?.contains(e.target)||e.target===activeButton||e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();e.stopImmediatePropagation();},true));
 g.GymPanel={show,close,render,isOpen:()=>!!root?.open};
})(window);

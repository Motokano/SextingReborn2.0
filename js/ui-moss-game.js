/* Approved C HUD: original game nodes/state only; no prototype bootstrap or mock state. */
(function (g) {
'use strict';
const $=id=>document.getElementById(id), U=g.UIWindows;
const paths={carry:'M6 7h12l1 13H5L6 7Z M9 7V5a3 3 0 0 1 6 0v2 M9 12h6',body:'M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z M7 12h3l2-4 2 8 2-4h2',survival:'M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z M8 15c0 2 1 3 3 3',growth:'M5 20V13h4v7 M10 20V9h4v11 M15 20V4h4v16',effects:'m12 2 2 7 7 3-7 3-2 7-2-7-7-3 7-3 2-7Z',environment:'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',journal:'M5 3h14v18H5Z M8 7h8 M8 11h8 M8 15h5',battle:'m5 3 14 14-2 2L3 5V3h2Z M15 3h6v2L8 18 M14 17l5-5 M5 13l6 6'};
function icon(id){return '<svg class="panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[id]+'"/></svg>';}
const panels={};
function panel(el,id,title){
 el.classList.add('moss-panel');el.dataset.panel=id;el.setAttribute('aria-label',title);
 if(el.tagName==='DETAILS'){const section=document.createElement('section');section.id=el.id;section.className='moss-panel ui-window-host';section.dataset.panel=id;section.setAttribute('aria-label',title);while(el.firstChild)section.append(el.firstChild);el.replaceWith(section);el=section;}
 const oldTitle=el.querySelector(':scope > .block-title,:scope > summary');if(oldTitle)oldTitle.remove();
 const close=el.querySelector(':scope > .ui-window-close')||document.createElement('button');
 const fold=el.querySelector(':scope > .ui-window-min')||document.createElement('button');
 close.className='ui-window-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','关闭'+title);
 fold.className='ui-window-min';fold.type='button';fold.textContent='−';fold.setAttribute('aria-label','收起'+title);fold.setAttribute('aria-expanded','true');
 close.removeAttribute('data-ui');fold.removeAttribute('data-ui');
 const content=document.createElement('div');content.className='panel-content';
 [...el.childNodes].forEach(n=>{if(n!==fold&&n!==close)content.append(n);});
 const header=document.createElement('header');header.className='panel-head';header.innerHTML='<span class="sigil" aria-hidden="true">'+icon(id)+'</span><h2 class="block-title">'+title+'</h2>';header.append(fold,close);
 el.append(header,content);panels[id]=el;return el;
}
function styleMetric(el,tone){
 if(!el)return;
 el.classList.add('metric');el.style.marginTop='';
 const caption=el.querySelector('.row');if(caption)caption.classList.add('metric-caption');
 const wrap=el.querySelector('.progress-wrap');if(wrap){wrap.className='track';wrap.style.setProperty('--tone',tone);const bar=wrap.firstElementChild;if(bar){const i=document.createElement('i');i.id=bar.id;i.style.width=bar.style.width;bar.replaceWith(i);}}
 const value=el.querySelector('.value');if(value){const b=document.createElement('b');b.id=value.id;b.textContent=value.textContent;value.replaceWith(b);}
}
function supplement(parent,title){const details=document.createElement('details');details.className='moss-supplement';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);parent.append(details);const button=document.createElement('button');button.type='button';button.className='moss-more';button.textContent='⋯';button.title=title;button.setAttribute('aria-label',title);button.setAttribute('aria-expanded','false');parent.closest('.moss-panel').querySelector('.panel-head h2').after(button);button.onclick=()=>{details.open=!details.open;button.setAttribute('aria-expanded',String(details.open));};details.addEventListener('toggle',()=>button.setAttribute('aria-expanded',String(details.open)));details.mossButton=button;return details;}
const left=$('left-hud');left.classList.add('moss-runtime');
panel($('status-limbs'),'body','身体');$('limb-rows').className='body-readings';
const surv=panel($('status-survival'),'survival','生存');
const thirstLabel=$('status-metric-thirst').querySelector('.label');thirstLabel.removeAttribute('data-ui');thirstLabel.textContent='水分';
const tones={satiety:'#b6a078',thirst:'#8aa4a4',stamina:'#9daf91',energy:'#b1b99b',fatigue:'#a8a18b',nutrition:'#8d9b72',mood:'#a5aa81',dirtyness:'#a8a18b'};
const primary=['satiety','thirst','stamina','energy','fatigue','nutrition'];const survContent=surv.querySelector('.panel-content');
primary.forEach(id=>{const el=$('status-metric-'+id);styleMetric(el,tones[id]);survContent.append(el);});
const extra= supplement(survContent,'更多生存读数');['mood','dirtyness'].forEach(id=>{styleMetric($('status-metric-'+id),tones[id]);extra.append($('status-metric-'+id));});
const carry=document.createElement('section');carry.id='status-carry-card';left.append(carry);panel(carry,'carry','携行');
const carryContent=carry.querySelector('.panel-content');const carryRow=$('status-carry').closest('.row');
carryRow.className='metric-caption';carryRow.style.marginTop='';carryRow.querySelector('.label').textContent='负重';carryRow.querySelector('.label').removeAttribute('data-ui');
const oldCarry=$('status-carry');const carryValue=document.createElement('b');carryValue.id=oldCarry.id;carryValue.textContent=oldCarry.textContent;oldCarry.replaceWith(carryValue);
const carryMetric=document.createElement('div');carryMetric.className='metric';carryMetric.append(carryRow);carryMetric.insertAdjacentHTML('beforeend','<div class="track" style="--tone:#b6a078"><i id="moss-carry-bar"></i></div>');carryContent.append(carryMetric);
carryContent.insertAdjacentHTML('beforeend','<div class="capacity-left"><span>剩余容量</span><strong id="moss-capacity-left">—</strong></div>');
const weight=$('status-metric-weight');weight.className='ruled-row';weight.style.marginTop='';carryContent.append(weight);
const growth=panel($('status-attrs-block'),'growth','成长');const growthContent=growth.querySelector('.panel-content');const attrs=growth.querySelector('.details-body');attrs.className='attributes';
[...attrs.querySelectorAll('.row')].forEach(row=>{row.className='';const old=row.querySelector('.value');const strong=document.createElement('strong');strong.id=old.id;strong.textContent=old.textContent;old.replaceWith(strong);});
const resource=$('status-resources');growthContent.append(resource);resource.querySelector('.block-title').remove();resource.querySelectorAll(':scope>.row').forEach(row=>{row.className='ruled-row';row.style.marginTop='';});
const expLabel=$('status-combat-experience').previousElementSibling;expLabel.removeAttribute('data-ui');expLabel.textContent='战斗经验';
const study=$('status-study').closest('.ruled-row');const growthMore=supplement(growthContent,'研习与属性经验');growthMore.append(study,$('status-attr-exp-block'));$('status-attr-exp-block').open=true;
const battle=panel($('status-combat-resources-card'),'battle','战斗');['qi-li','diqi'].forEach((id,i)=>{const b=$('status-'+id+'-bar');if(b){const wrap=b.parentElement;const row=wrap.previousElementSibling;const metric=document.createElement('div');metric.className='metric';row.before(metric);metric.append(row,wrap);styleMetric(metric,i?'#8aa4a4':'#b6a078');}});
const buff=panel($('buff-hud'),'effects','状态');buff.classList.add('moss-runtime');
const log=panel($('game-log-panel'),'journal','事件记录');log.classList.add('moss-runtime');const oldLogHeader=log.querySelector('.game-log-header');if(oldLogHeader)oldLogHeader.remove();$('game-log-lines').classList.add('journal');
const desktopBuffParent=buff.parentElement,desktopLogParent=log.parentElement;
const shell=document.createElement('div');shell.className='moss-runtime moss-top-shell';shell.innerHTML='<header class="demo-top"><a href="./?no_reload">潮碧物语</a></header>';document.body.append(shell);const top=shell.firstElementChild;
const env=$('top-hud');env.classList.add('top-environment');env.setAttribute('aria-label','环境信息');top.append(env,$('right-hud'));$('right-hud').classList.add('demo-tools');
$('hud-weather').className='env-weather';$('hud-time-period').className='env-time';$('hud-time-text').className='env-date';const weatherSlot=document.createElement('span');weatherSlot.className='env-weather';weatherSlot.innerHTML=icon('environment');weatherSlot.append($('hud-weather'));const pill=env.querySelector('.time-pill');pill.append(weatherSlot,$('hud-time-period'),$('hud-time-text'));
const menu=$('btn-ui-windows');const menuLabel=document.createElement('span');menuLabel.className='moss-menu-label';menuLabel.textContent='面板管理';menu.append(menuLabel);
const bottom=$('bottom-hud-stack');bottom.classList.add('moss-runtime');
function block(id){return !g.SceneCtx||g.SceneCtx.shouldShowLeftHudBlock(id);}
function known(id){if(id==='date'&&g.NPCSystem&&!g.NPCSystem.isDemoFlagTrue('observation_calendar_unlocked'))return false;return !g.SceneCtx||g.SceneCtx.shouldShowSurvivalMetric(id,g.Survival&&g.Survival.getState());}
function battleRelevant(){const s=g.Survival&&g.Survival.getState(),IE=g.InventoryEquipment,PE=g.PharmacyEffects;const info=PE&&PE.getInfo?PE.getInfo():{};return !!(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat())||!!(s&&Number(s.pain)>0)||!!(IE&&((IE.getPlayerStunValue&&IE.getPlayerStunValue()>0)||(IE.isPlayerStunned&&IE.isPlayerStunned())))||Number(info.addiction)>0||Number(info.toxicity)>0;}
const ids={body:'win-limbs',survival:'win-survival',growth:'win-attrs',carry:'win-carry',effects:'win-buff',battle:'win-battle-resources',journal:'win-log'};
function arrange(){
 const w=g.innerWidth,h=g.innerHeight,header=top.getBoundingClientRect().height;
 if(w<760){if(buff.parentElement!==left)left.append(buff);if(log.parentElement!==left)left.append(log);}else{if(buff.parentElement!==desktopBuffParent)desktopBuffParent.append(buff);if(log.parentElement!==desktopLogParent)desktopLogParent.append(log);}
 const cw=Math.min(272,(w-64)/4),start=(w-(cw*4+36))/2;
 document.body.style.setProperty('--moss-header-height',header+'px');document.body.style.setProperty('--moss-quickbar-y',(h<880?header+22:310)+'px');
 ['body','survival','growth','carry'].forEach((id,i)=>{
  const el=panels[id];el.style.setProperty('--moss-default-x',start+i*(cw+12)+'px');el.style.setProperty('--moss-default-y',Math.max(header+20,h-280-18)+'px');el.style.setProperty('--moss-default-w',cw+'px');
 });
 let y=14;
 if(w<760){['body','survival','growth','carry','journal','effects','battle'].forEach(id=>{const el=panels[id];el.style.setProperty('--moss-default-x','14px');el.style.setProperty('--moss-default-y',y+'px');el.style.setProperty('--moss-default-w',left.clientWidth-28+'px');if(U.getVisible(ids[id]))y+=el.offsetHeight+14;});left.style.setProperty('--moss-scroll-height',y+'px');}
 else { [['journal',w-Math.min(300,w*.3)-18,header+18,Math.min(300,w*.3)],['effects',24,header+18,230],['battle',w/2-110,header+18,220]].forEach(([id,x,y,width])=>{const el=panels[id];el.style.setProperty('--moss-default-x',x+'px');el.style.setProperty('--moss-default-y',y+'px');el.style.setProperty('--moss-default-w',width+'px');});}
}
function escape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function number(v){return Number.isFinite(Number(v))?String(Number(Number(v).toFixed(1))):'—';}
function numeric(id,value,max,unit=''){const el=$(id);if(!el)return;const html=number(value)+' <small>/ '+number(max)+unit+'</small>';if(el.innerHTML!==html)el.innerHTML=html;}
function update(){
 const s=g.Survival&&g.Survival.getState();const CA=g.CharacterAttributes,IE=g.InventoryEquipment;
 if(s){numeric('status-satiety-text',s.satiety,120);numeric('status-thirst-text',s.thirst,100);numeric('status-stamina-text',s.stamina,s.stamina_max||100);numeric('status-energy-text',s.energy,s.energy_max||100);numeric('status-fatigue-text',s.fatigue,100);numeric('status-nutrition',s.nutrition,100);numeric('status-mood',g.Survival.getMood?g.Survival.getMood():s.mood,1000);numeric('status-dirtyness',s.dirtyness,100);}
 if(CA){['jingu','flexibility','breath','dexterity','focus'].forEach(id=>{const el=$('status-attr-'+id);if(el){el.title='先天 '+number(CA.getBaseInnateAttr(id))+' · 当前 '+String(CA.getEffectiveAttr(id));el.textContent=String(Number(Number(CA.getEffectiveAttr(id)).toFixed(1)));}});}
 const rows=$('limb-rows');
 if(CA&&rows){
  if(!rows.querySelector('.field-caption')){const cap=document.createElement('div');cap.className='field-caption';cap.textContent='累计损毁 / 损毁上限';rows.prepend(cap);}
  rows.querySelector('.field-caption').hidden=!known('body_detail');
  rows.querySelectorAll('.limb-row').forEach(row=>{const cell=row.querySelector('[id^="limb-"]');if(!cell)return;const partId=cell.id.slice(5);const key=partId.replace('belly','abdomen');row.querySelector('.row>span').textContent={head:'头部',chest:'胸部',belly:'腹部',lhand:'左臂',rhand:'右臂',lfoot:'左腿',rfoot:'右腿'}[partId]||partId;const value=CA.getPartDestroy(key),max=CA.getBodyPartDestroyMax(key);row.classList.add('body-reading');row.classList.toggle('hurt',value>0);row.querySelector('.row').classList.add('body-reading-caption');let reading=cell;if(cell.tagName!=='B'){reading=document.createElement('b');reading.id=cell.id;cell.replaceWith(reading);}reading.innerHTML=known('body_detail')?number(value)+' <small>/ '+number(max)+'</small>':value>0?'受伤':'无碍';let track=row.querySelector('.body-damage-track');if(!track){track=document.createElement('div');track.className='body-damage-track';track.setAttribute('aria-hidden','true');track.innerHTML='<i></i>';row.append(track);}track.hidden=!known('body_detail');track.firstChild.style.width=Math.min(100,max?value/max*100:0)+'%';});
 }
 if(CA&&IE){const cap=CA.getCarryCapacity(),current=IE.getCurrentCarryWeight();numeric('status-carry',current,cap,' kg');$('moss-carry-bar').style.width=Math.min(100,cap?current/cap*100:0)+'%';$('moss-capacity-left').innerHTML=number(Math.max(0,cap-current))+' <small>kg</small>';}
 extra.hidden=!['mood','dirtyness'].some(known);extra.mossButton.hidden=extra.hidden;
 attrs.hidden=!block('attrs');$('status-attr-exp-block').hidden=!block('attrs');study.hidden=!block('resources');growthMore.hidden=!block('attrs')&&!block('resources');resource.hidden=!block('resources');growthMore.mossButton.hidden=growthMore.hidden;
 if(U){U.setGameVisible('win-log',block('journal'));U.setGameVisible('win-carry',block('carry'));U.setGameVisible('win-battle-resources',block('combat_resources')&&battleRelevant());U.setGameVisible('win-attrs',block('attrs')||block('resources'));U.setGameVisible('win-time',(!g.HUD||g.HUD.isTimeHudVisible())&&['time','date','weather'].some(known));}
 log.classList.toggle('moss-time-unknown',!known('time'));$('hud-time-text').hidden=!known('date');$('hud-time-period').hidden=!known('time');$('hud-weather').hidden=!known('weather');weatherSlot.hidden=!known('weather');
 arrange();
}
function register(){
 const specs={body:'limbs',survival:'survival',growth:'attrs',carry:'carry',effects:'buff_hud',battle:'combat_resources'};
 Object.entries(panels).forEach(([id,el])=>{
  const titleKey={body:'ui.windows.limbs',survival:'ui.windows.survival',growth:'ui.windows.attrs',carry:'ui.windows.carry',effects:'ui.windows.buff',battle:'ui.windows.battle_resources',journal:'ui.windows.log'}[id];
  U.registerPanel(ids[id],{type:'free',titleKey,el,defaultPos:'dock',minW:160,minH:48,closable:true,resizable:false,foldInPlace:true,dragHandle:'.panel-head',gameVisible:()=>id==='journal'?block('journal'):(id==='growth'?(block('attrs')||block('resources')):id==='battle'?(block('combat_resources')&&battleRelevant()):block(specs[id]))});
 });
 ['win-role','win-resources','win-attr-exp'].forEach(id=>U.registerPanel(id,{type:'anchored',menuHidden:true,el:()=>$(id==='win-role'?'status-role-card':id==='win-resources'?'status-resources':'status-attr-exp-block'),gameVisible:()=>id!=='win-role'&&block(id==='win-resources'?'resources':'attrs')}));
 U.registerPanel('win-time',{type:'anchored',titleKey:'ui.windows.time',el:env,closable:true,gameVisible:()=>(!g.HUD||g.HUD.isTimeHudVisible())&&['time','date','weather'].some(known)});
 g.MossGameHUD.registrationComplete=true;U.init();
 // The log was registered before these new chrome controls existed.
 log.querySelector('.ui-window-close').onclick=()=>U.setVisible('win-log',false);
 log.querySelector('.ui-window-min').onclick=()=>U.setFolded('win-log',!log.classList.contains('folded'));
 update();
}
const refresh=g.SceneHud.refresh;g.SceneHud.refresh=function(){const result=refresh.apply(this,arguments);if(arguments[0]==='status')update();return result;};
const observer=new MutationObserver(()=>{if(g.GameTime){const st=g.GameTime.getState();const period=$('hud-time-period');const timeHtml=escape(st.timePeriodLabel||'')+' <b>'+String(st.hour).padStart(2,'0')+':'+String(st.minute).padStart(2,'0')+'</b>';if(period.innerHTML!==timeHtml)period.innerHTML=timeHtml;const date=$('hud-time-text');const dateText='第 '+st.year+' 年 · 第 '+st.dayOfYear+' 日';if(date.textContent!==dateText)date.textContent=dateText;}});observer.observe($('hud-time-text'),{childList:true});
$('game-log-lines').addEventListener('game-log-appended',ev=>{const line=ev.detail.line;const p=document.createElement('p');p.dataset.time=line.dataset.time;while(line.firstChild)p.append(line.firstChild);line.append(p);if(ev.detail.wasAtBottom)$('game-log-lines').scrollTop=$('game-log-lines').scrollHeight;});
g.addEventListener('resize',arrange);if(g.CombatEngagement)g.CombatEngagement.onChange(update);
g.AppBoot=g.AppBoot||{};g.AppBoot.afterStart=g.AppBoot.afterStart||[];g.AppBoot.afterStart.push(register);
g.MossGameHUD={refresh:update,arrange,panels,registrationComplete:false};
})(window);

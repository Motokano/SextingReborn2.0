(async()=>{
const results=[];const check=(condition,name)=>{if(!condition)throw new Error(name);results.push(name);};
const $=id=>document.getElementById(id), visible=el=>!!el&&getComputedStyle(el).display!=='none'&&!el.hidden;
const rules={...SceneCtx.leftHudBlockVisibilityRules}, metrics={...SceneCtx.survivalMetricVisibilityRules};
const CAstate=structuredClone(CharacterAttributes.getState()), survival=structuredClone(Survival.getState());
try{
 check(CharacterAttributes.isCharacterCreationCompleted(),'real creation completed');
 const body=$('status-limbs');check(body.querySelectorAll('.body-reading').length===7,'all seven body parts');
 for(const id of ['body','survival','growth','carry']){const el=MossGameHUD.panels[id];check(el.getBoundingClientRect().height===358,id+' full reference height');}
 check(document.querySelector('[data-panel=body] .panel-content').scrollHeight===document.querySelector('[data-panel=body] .panel-content').clientHeight,'body all seven rows without clipping');
 check(document.querySelector('[data-panel=survival] .panel-content').scrollHeight===document.querySelector('[data-panel=survival] .panel-content').clientHeight,'all six survival rows without clipping');
 Survival.setState({satiety:42,thirst:31,stamina:19,energy:34,fatigue:22,nutrition:57});SceneHud.refresh('status');
 check($('status-satiety-text').textContent.includes('42'),'real satiety update');check($('status-thirst-bar').style.width==='31%','real thirst bar');check($('status-fatigue-text').textContent.includes('22'),'real fatigue update');
 CharacterAttributes.applyCombatDestroy('lhand',18);SceneHud.refresh('status');check($('limb-lhand').closest('.body-reading').classList.contains('hurt'),'real injury highlight');
 SceneCtx.setSurvivalMetricVisibilityRule('body_detail',false);SceneHud.refresh('status');check($('limb-lhand').textContent==='受伤','unknown body detail qualitative only');check(!visible(body.querySelector('.body-damage-track')),'unknown body detail track hidden');
 SceneCtx.setLeftHudBlockVisibilityRule('attrs',false);SceneCtx.setLeftHudBlockVisibilityRule('resources',true);SceneHud.refresh('status');check(!visible(document.querySelector('.attributes')),'attributes hidden while resources known');check(visible($('status-resources')),'resources visible while attributes unknown');check(!$('status-attr-exp-block').getClientRects().length,'attribute experience unknown hidden');
 SceneCtx.setLeftHudBlockVisibilityRule('attrs',true);SceneCtx.setLeftHudBlockVisibilityRule('resources',false);SceneHud.refresh('status');check(visible(document.querySelector('.attributes')),'attributes visible while resources unknown');check(!visible($('status-resources')),'unknown potential and combat experience hidden');
 SceneCtx.setLeftHudBlockVisibilityRule('attrs',false);SceneHud.refresh('status');check(!UIWindows.getPanelList().some(p=>p.id==='win-attrs'),'growth absent from menu when both unknown');
 for(const id of ['time','date','weather'])SceneCtx.setSurvivalMetricVisibilityRule(id,false);SceneHud.refresh('status');check(!UIWindows.getPanelList().some(p=>p.id==='win-time'),'unknown environment absent from menu');check(!visible($('top-hud')),'unknown environment hidden');check(getComputedStyle(document.querySelector('.log-time')).display==='none','unknown time hidden in journal');
 SceneCtx.setLeftHudBlockVisibilityRule('journal',false);SceneHud.refresh('status');check(!UIWindows.getPanelList().some(p=>p.id==='win-log'),'unknown journal absent from menu');
 SceneCtx.leftHudBlockVisibilityRules=rules;SceneCtx.survivalMetricVisibilityRules=metrics;SceneHud.refresh('status');
 const survivalPanel=$('status-survival');survivalPanel.querySelector('.ui-window-min').click();check(survivalPanel.classList.contains('folded'),'fold in place');check(visible(survivalPanel),'folded title remains');survivalPanel.querySelector('.ui-window-min').click();check(!survivalPanel.classList.contains('folded'),'expand in place');
 const carry=$('status-carry-card');carry.querySelector('.ui-window-close').click();check(!UIWindows.getVisible('win-carry'),'close individual carry');check(UIWindows.getVisible('win-survival'),'carry closure independent');UIWindows.setVisible('win-carry',true);check(visible(carry),'restore carry');
 const logBefore=$('game-log-panel').getBoundingClientRect().toJSON(), quickBefore=$('bottom-hud-stack').getBoundingClientRect().toJSON();
 const header=carry.querySelector('.panel-head'),r=header.getBoundingClientRect();header.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:r.left+40,clientY:r.top+15}));document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.left-60,clientY:r.top-85}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:r.left-60,clientY:r.top-85}));
 check(carry.style.position==='fixed'&&parseFloat(carry.style.left)<1000,'actual window drag persists geometry');check(JSON.stringify(logBefore)===JSON.stringify($('game-log-panel').getBoundingClientRect().toJSON()),'drag carry does not move journal');check(JSON.stringify(quickBefore)===JSON.stringify($('bottom-hud-stack').getBoundingClientRect().toJSON()),'drag carry does not move shortcuts');UIWindows.resetWindow('win-carry');
 $('status-survival').querySelector('.moss-more').click();check(document.querySelector('[data-panel=survival] .moss-supplement').open,'extra mood and cleanliness accessible');$('status-survival').querySelector('.moss-more').click();
 $('status-attrs-block').querySelector('.moss-more').click();check(visible($('status-study')),'self study retained');check(visible($('status-attr-exp-exp-jingu')),'attribute experience retained');$('status-attrs-block').querySelector('.moss-more').click();
 $('btn-backpack').click();check($('modal-backpack').classList.contains('show'),'original backpack navigation');$('backpack-panel-close').click();check(!$('modal-backpack').classList.contains('show'),'original backpack close');
 check(!UIWindows.getPanelList().some(p=>['win-role','win-resources','win-attr-exp'].includes(p.id)),'no obsolete duplicate window entries');
 UIWindows.setFolded('win-survival',true);UIWindows.setVisible('win-carry',false);
 return results;
}finally{SceneCtx.leftHudBlockVisibilityRules=rules;SceneCtx.survivalMetricVisibilityRules=metrics;CharacterAttributes.setState(CAstate);Survival.setState(survival);SceneHud.refresh('status');}
})()

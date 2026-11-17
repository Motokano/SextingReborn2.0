/** Shared native/Svelte workshop tabs; actions and persistence belong to their domain owners. */
(function(g){
    'use strict';
    const D=g.ManufacturingData,M=g.ManufacturingActions,K=g.MedicalKit,A=g.MedicalActions;
    let root=null,tab='craft',recipe='basic',kitId=null,mod='expand',returnFocus=null;
    const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const name=id=>g.InventoryEquipment.getItemTemplate(id)?.name||id;
    function initialize(){}
    function bind(){}
    function isOpen(){return !!root;}
    function materials(p){return `<div class="manufacturing-materials">${p.inputs.map(x=>`<div class="${x.available<x.count?'blocked':''}"><span>${esc(x.name)}</span><b>${x.available} / ${x.count}</b></div>`).join('')}</div>`;}
    function crafting(s){
        const list=[{recipe_id:'basic',name:'基础急救包'},...s.recipes];
        if(!list.some(r=>r.recipe_id===recipe))recipe='basic';
        const p=recipe==='basic'?A.basicCraftPlan():M.plan('recipe',recipe);
        const required=p.required_tools||[],station=p.station==='pharmacy'?'制药台':p.workbench_level_min?'制作台 '+p.workbench_level_min+'级':'';
        return `<section class="manufacturing-craft" aria-label="制作"><div class="manufacturing-recipe-list" aria-label="已学配方">${list.map(r=>`<button id="recipe-${r.recipe_id}" data-make-recipe="${r.recipe_id}" aria-pressed="${recipe===r.recipe_id}">${esc(r.name)}</button>`).join('')}</div><div class="manufacturing-recipe"><div class="manufacturing-recipe-heading"><h3>${esc(p.name)}</h3><span>×${p.output_count}</span></div>${materials(p)}<div class="manufacturing-requirements">${[station,...(p.support_facilities||[]).map(k=>D.facilities[k].name),...(p.station&&D.facilities[p.station]&&p.station!=='bench'?[D.facilities[p.station].name]:[]),...required.map(x=>name(typeof x==='string'?x:x.item_id))].filter(Boolean).map(esc).join(' · ')}</div><div class="manufacturing-recipe-cost"><span>${p.ticks}刻</span><span>体力 ${p.stamina}</span>${p.chance!=null?`<span>成功率 ${Math.round(p.chance*100)}%</span>`:''}</div><div class="manufacturing-confirm"><span>${esc(p.reason)}</span><button id="manufacturing-craft" class="primary" data-make="${recipe}" title="${esc(p.reason)}"${p.reason?' disabled':''}>制作</button></div></div></section>`;
    }
    function facilities(s){
        const entries=['metal','kiln','precision'].map(id=>({type:'facility',id}));
        if(s.level<3)entries.push({type:'upgrade',id:D.workbench.upgrades.find(x=>x.from_level===s.level).upgrade_id});
        return `<section class="manufacturing-facilities" aria-label="制作台设施">${entries.map(({type,id})=>{const p=M.plan(type,id);return `<div class="manufacturing-facility"><h3>${esc(p.name)}</h3>${materials(p)}<div class="manufacturing-requirements">${p.tools?.map(x=>esc(name(x.item_id))).join(' · ')||''}</div><div class="manufacturing-recipe-cost"><span>${p.ticks}刻</span><span>体力 ${p.stamina}</span></div><button data-build="${id}" data-type="${type}" title="${esc(p.reason)}"${p.reason?' disabled':''}>${s.facilities.includes(id)?'已建成':type==='upgrade'?'升级':'建造'}</button><small>${esc(p.reason)}</small></div>`;}).join('')}</section>`;
    }
    function medical(){
        const B=g.MedicalKitData,kits=K.carried().map((e,i)=>{const p=K.profile(e.instance);return {id:e.id,number:String(i+1).padStart(2,'0'),name:p.body.name,mod:p.kind,affixes:p.state.affixes,remaining:p.state.remaining};});
        if(!kits.some(k=>k.id===kitId))kitId=kits[0]?.id;
        const s={base:B,kits,selectedKitId:kitId,equippedKitId:K.equipped()?.instance_id,materials:Object.fromEntries(Object.values(B.bodies).flatMap(b=>Object.keys(b.cost||{})).map(id=>[id,g.InventoryEquipment.countCarriedItemsByTemplateId(id)]))};
        const activeKit=()=>kits.find(k=>k.id===kitId),api={activeKit,AFFIXES:B.affixes,MODS:B.bodies,MATERIALS:Object.fromEntries(Object.keys(s.materials).map(id=>[id,name(id)])),
            profile:(_s,kit=activeKit(),_affixes=kit.affixes,kind=kit.mod)=>({caps:Object.fromEntries(Object.entries(B.reserves).map(([k,r])=>[k,r.capacity*B.bodies[kind].capacity_multiplier])),ownWeight:B.bodies[kind].weight_kg}),
            modificationPlan:(_s,kind)=>A.modificationPlan(kitId,kind)};
        return g.MedicalKitView.render(s,mod,api,true,true);
    }
    function job(s){const j=s.job;if(!j)return s.lastResult?`<div class="manufacturing-result" role="status">${esc(s.lastResult.name)} · ${s.lastResult.success?'完成'+(s.lastResult.count?' ×'+s.lastResult.count:''):'失败'}</div>`:'';return `<section class="manufacturing-job" aria-label="当前工作"><div><strong>${esc(j.name)}</strong><span>${j.elapsed} / ${j.ticks}刻</span></div><progress value="${j.elapsed}" max="${j.ticks}" aria-label="制作进度"></progress><div class="manufacturing-job-actions">${s.saveError?'<span>保存失败，请重试</span>':''}<button data-job="${j.phase==='claim'?'claim':j.paused||s.saveError?'resume':'pause'}">${j.phase==='claim'?'领取成品':j.paused||s.saveError?'继续':'暂停'}</button><button data-job="cancel" title="已投入材料和时间不退还">放弃</button></div></section>`;}
    function refresh(){
        if(!root)return;
        if(g.Survival.isDead()||!A.nearbyWorkbench()){close();return;}
        const focused=document.activeElement?.id,scroll=root.querySelector('.kit-list')?.scrollTop||0,s=M.snapshot();
        root.innerHTML=`<article class="window" data-view="manufacturing"><header class="window-header"><div class="window-title"><h2>制作台</h2><small>${s.level}级</small></div><button class="medical-close" data-close aria-label="关闭制作台">×</button></header><nav class="manufacturing-tabs" role="tablist" aria-label="制作台功能">${[['craft','制作'],['medical','急救包改装'],['facilities','设施']].map(([key,label])=>`<button role="tab" id="manufacturing-tab-${key}" aria-controls="manufacturing-content" aria-selected="${key===tab}" tabindex="${key===tab?0:-1}" data-tab="${key}">${label}</button>`).join('')}</nav>${job(s)}<div id="manufacturing-content" role="tabpanel" aria-labelledby="manufacturing-tab-${tab}">${tab==='medical'?medical():tab==='facilities'?facilities(s):crafting(s)}</div></article>`;
        const list=root.querySelector('.kit-list');if(list)list.scrollTop=scroll;
        if(focused)document.getElementById(focused)?.focus({preventScroll:true});
    }
    function click(e){
        const b=e.target.closest('button');if(!b||b.disabled)return;if(b.hasAttribute('data-close')){close();return;}
        let r;
        if(b.dataset.tab)tab=b.dataset.tab;
        if(b.dataset.makeRecipe)recipe=b.dataset.makeRecipe;
        if(b.dataset.make)r=b.dataset.make==='basic'?A.craftBasic():M.start('recipe',b.dataset.make);
        if(b.dataset.build)r=M.start(b.dataset.type,b.dataset.build);
        if(b.dataset.job)r=M[b.dataset.job]();
        if(b.dataset.action==='selectKit'){kitId=b.dataset.value;mod='expand';}
        if(b.dataset.action==='modify')r=A.modify(b.dataset.kitId,mod);
        if(r?.message)g.SceneFeedback.showMsg(r.message,r.ok?'success':'warn');refresh();
    }
    function open(selectedTab='craft'){
        if(M.reason())return false;
        g.MedicalKitPanel.close();tab=['craft','medical','facilities'].includes(selectedTab)?selectedTab:'craft';
        if(root){refresh();return true;}
        returnFocus=document.activeElement;g.PlayerActions.prepareFacilityAction();root=document.createElement('div');root.id='manufacturing-panel';root.className='medical-kit-overlay medical-kit-surface';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','制作台');
        root.addEventListener('click',click);root.addEventListener('change',e=>{if(e.target.id==='modification'){mod=e.target.value;refresh();}});
        root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();return;}const tabs=[...root.querySelectorAll('[role="tab"]')];if(tabs.includes(e.target)&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(tabs.indexOf(e.target)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tab=tabs[i].dataset.tab;refresh();root.querySelector('#manufacturing-tab-'+tab)?.focus();}if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled):not([tabindex="-1"]),select')],first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&e.target===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&e.target===last){e.preventDefault();first?.focus();}}});
        document.body.append(root);refresh();root.querySelector('[data-close]')?.focus();return true;
    }
    function close(){if(!root)return;const old=root;root=null;M.pause();old.remove();returnFocus?.focus?.({preventScroll:true});}
    window.ManufacturingPanel={initialize,bind,isOpen,open,close,refresh};
})(window);

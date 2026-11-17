/** MedicalKitPanel is shared by the native and Svelte shells. */
(function(window){
    'use strict';
    const g=window,D=g.MedicalKitData,K=g.MedicalKit,A=g.MedicalActions;
    let root=null,workbench=false,selectedKitId=null,part='lhand',supply='trauma_dressing',mode='normal',mod='expand',returnFocus=null;
    function initialize(){}
    function bind(){}
    function isOpen(){return !!root;}
    function profileFor(kind){const b=D.bodies[kind];return {caps:Object.fromEntries(Object.entries(D.reserves).map(([k,r])=>[k,r.capacity*b.capacity_multiplier])),ownWeight:b.weight_kg,provisionalStaples:false};}
    function snapshot(){
        const kits=K.carried().map((entry,i)=>{const p=K.profile(entry.instance);return {id:entry.id,number:String(i+1).padStart(2,'0'),name:p.body.name,mod:p.kind,affixes:p.state?.affixes || [],remaining:p.state?.remaining || Object.fromEntries(Object.keys(D.reserves).map(k=>[k,0]))};});
        const equippedId=K.equipped()?.instance_id;
        if(workbench&&!kits.some(k=>k.id===selectedKitId))selectedKitId=kits[0]?.id;
        const op=A.getState();
        if(op){part=op.part;supply='surgical_staples';mode=op.mode;}
        return {base:D,kits,selectedKitId,equippedKitId:equippedId,selectedPart:part,selectedSupply:supply,mode,
            body:Object.fromEntries(Object.keys(K.PARTS).map(k=>[k,K.body(k)])),
            supplies:Object.fromEntries(Object.keys(D.reserves).map(k=>[k,A.refillStock(k).total])),
            supplySources:Object.fromEntries(Object.keys(D.reserves).map(k=>[k,A.refillStock(k)])),
            materials:Object.fromEntries(['textile_cotton_cloth','textile_hemp_cloth','material_nylon_stock','material_steel_wire'].map(id=>[id,g.InventoryEquipment.countCarriedItemsByTemplateId(id)])),
            surgeryLevel:g.InventoryEquipment.getSkillLevel('survival_surgery'),inCombat:g.CombatEngagement.isPlayerInCombat(),operation:op?{...op,costs:{}}:null};
    }
    function refresh(){
        if(!root)return;
        if(g.Survival.isDead() || workbench&&!A.nearbyWorkbench()){close();return;}
        const state=snapshot(),active=s=>s.kits.find(k=>k.id===(workbench?s.selectedKitId:s.equippedKitId));
        const api={activeKit:active,AFFIXES:D.affixes,MODS:D.bodies,PARTS:K.PARTS,INJURIES:K.INJURIES,
            MATERIALS:{textile_cotton_cloth:'棉布',textile_hemp_cloth:'麻布',material_nylon_stock:'尼龙料',material_steel_wire:'钢丝料'},
            profile:(s,kit=active(s),affixes=kit.affixes,kind=kit.mod)=>profileFor(kind),
            refillPlan:(s,key)=>A.refillPlan(active(s)?.id,key),
            refillAllPlan:s=>A.refillAllPlan(active(s)?.id),
            therapyPlan:s=>A.therapyPlan(active(s)?.id,s.selectedPart,s.selectedSupply,s.mode),
            modificationPlan:(s,kind)=>A.modificationPlan(active(s)?.id,kind)};
        const scroll=root.querySelector('.kit-list')?.scrollTop || 0,focused=document.activeElement?.id;
        root.innerHTML=g.MedicalKitView.render(state,mod,api,workbench);
        root.querySelector('.window-header').insertAdjacentHTML('beforeend','<button type="button" class="medical-close" data-close aria-label="关闭急救包">×</button>');
        if(A.hasSaveError()&&state.operation)root.querySelector('.surgery-progress').insertAdjacentHTML('beforeend','<button type="button" data-retry>保存失败 · 重试</button>');
        const list=root.querySelector('.kit-list');if(list)list.scrollTop=scroll;
        if(focused)document.getElementById(focused)?.focus({preventScroll:true});
    }
    function show(atWorkbench){
        if(g.SceneAccess.isPreCreationGameplayRestricted() || g.Survival.isDead())return false;
        if(atWorkbench && (!A.nearbyWorkbench() || A.isActive() || g.CombatEngagement.isPlayerInCombat()))return false;
        if(!atWorkbench && !K.equipped())return false;
        if(root){workbench=atWorkbench;refresh();return true;}
        returnFocus=document.activeElement;workbench=atWorkbench;g.PlayerActions.prepareFacilityAction();
        root=document.createElement('div');root.id='medical-kit-panel';root.className='medical-kit-overlay medical-kit-surface';
        root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',workbench?'制造台 · 急救包':'急救包');
        root.addEventListener('click',click);
        root.addEventListener('change',e=>{if(e.target.id==='modification'){mod=e.target.value;refresh();}});
        root.addEventListener('keydown',function(e){
            e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}
            if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled),select')];const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
        });
        document.body.append(root);refresh();root?.querySelector('[data-close]')?.focus();return true;
    }
    function click(e){
        const b=e.target.closest('button');if(!b || b.disabled)return;
        if(b.hasAttribute('data-close')){close();return;}
        let result;
        if(b.hasAttribute('data-retry'))result=A.advance();
        const action=b.dataset.action,value=b.dataset.value,id=b.dataset.kitId;
        if(action==='selectKit'&&workbench){selectedKitId=value;mod='expand';}
        if(!A.isActive()&&!workbench){if(action==='part')part=value;if(action==='supply'&&!A.therapyPlan(K.equipped()?.instance_id,part,value,'normal').reason){supply=value;mode='normal';}if(action==='mode')mode=value;}
        if(action==='refill'&&!workbench)result=A.refill(id,value);
        if(action==='refillAll'&&!workbench)result=A.refillAll(id);
        if(action==='heal'&&!workbench)result=A.treat(id,part,supply,mode);
        if(action==='cancel'&&!workbench)result=A.cancel();
        if(action==='modify'&&workbench)result=A.modify(id,mod);
        if(result?.message)g.SceneFeedback.showMsg(result.message,result.ok?'success':'warn');refresh();
    }
    function close(){if(!root)return;root.remove();root=null;returnFocus?.focus?.({preventScroll:true});}
    function openDaily(){if(g.ManufacturingPanel)g.ManufacturingPanel.close();return show(false);}
    function openWorkbench(){return g.ManufacturingPanel.open('medical');}
    window.MedicalKitPanel={initialize,bind,isOpen,openDaily,openWorkbench,close,refresh};
})(window);

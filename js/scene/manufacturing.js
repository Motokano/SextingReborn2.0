/** Persistent workshop production and construction. Inventory, medicine and knowledge keep their own owners. */
(function(g){
    'use strict';
    const D=g.ManufacturingData,clone=x=>JSON.parse(JSON.stringify(x));
    let state=fresh(),timer=null,advancing=false,saveError=false;
    function fresh(){return {version:1,level:1,facilities:['bench'],job:null,lastResult:null};}
    function initialize(){}
    function bind(){document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});g.addEventListener('pagehide',()=>{stop();});}
    function getState(){return clone(state);}
    function validate(s){
        if(s==null)return true;
        if(s.version!==1||!Number.isInteger(s.level)||s.level<1||s.level>3||!Array.isArray(s.facilities)||!s.facilities.includes('bench')||new Set(s.facilities).size!==s.facilities.length||s.facilities.some(k=>!D.facilities[k]))return false;
        if(s.level>=2&&!s.facilities.includes('metal')||s.level>=3&&!s.facilities.includes('precision')||s.facilities.includes('precision')&&s.level<2)return false;
        const j=s.job;if(j==null)return true;
        const r=definition(j.type,j.id);if(!r||r.station==='pharmacy')return false;
        const required=(r.required_tools||[]).map(x=>typeof x==='string'?x:x.item_id);
        return typeof j.name==='string'&&typeof j.paused==='boolean'&&['work','claim'].includes(j.phase)&&j.ticks===r.ticks&&
            Number.isInteger(j.ticks)&&j.ticks>0&&j.ticks<=100&&Number.isInteger(j.elapsed)&&j.elapsed>=0&&j.elapsed<=j.ticks&&
            (j.phase==='claim'?j.elapsed===j.ticks:j.elapsed<j.ticks)&&
            Number.isFinite(j.stamina)&&j.stamina>=0&&Number.isFinite(j.paid)&&j.paid>=0&&j.paid<=j.stamina&&typeof j.success==='boolean'&&
            Math.abs(j.paid-Math.round(j.stamina*10*j.elapsed/j.ticks)/10)<1e-8&&
            Array.isArray(j.tools)&&j.tools.length===required.length&&new Set(j.tools.map(t=>t.id)).size===j.tools.length&&j.tools.every((t,i)=>typeof t.id==='string'&&!!t.id&&t.item_id===required[i])&&typeof j.mapId==='string'&&Number.isInteger(j.x)&&Number.isInteger(j.y);
    }
    function restore(s,rollback){stop();state=validate(s)?clone(s||fresh()):fresh();saveError=false;if(!rollback&&state.job)state.job.paused=true;}
    function isWorking(){return !!state.job&&!state.job.paused&&state.job.phase==='work';}
    function isInstanceLocked(id){return !!state.job&&state.job.tools.some(t=>t.id===id);}
    function allowsTick(options){return !isWorking()||advancing&&options?.source==='manufacturing';}
    function stop(){if(timer!==null)g.clearTimeout(timer);timer=null;}
    function refresh(){g.ManufacturingPanel.refresh();g.SceneHud.refresh('status');g.InventoryPanel.updateBackpackPanel();g.SceneMapView.render();}
    function schedule(){stop();if(!isWorking()||document.hidden||saveError||!g.ManufacturingPanel.isOpen())return;timer=g.setTimeout(()=>{timer=null;step();schedule();},1000);}
    function atomic(fn){
        let r;try{r=g.SaveSystem.runAtomicFor('craft.manufacturing',fn);}catch(e){saveError=true;stop();refresh();return {ok:false,message:e.message};}
        if(!r.saved){saveError=true;stop();refresh();return {ok:false,message:'保存失败，本次操作已恢复，请重试。'};}
        saveError=false;refresh();return r.value||{ok:true};
    }
    function reason(){
        const S=g.Survival;
        if(g.SceneAccess.isPreCreationGameplayRestricted()||S.isDead()||S.isComa()||g.DeathSystem?.blocked())return '当前无法制作';
        if(g.CombatEngagement.isPlayerInCombat())return '战斗中不能制作';
        if(!g.MedicalActions.nearbyWorkbench())return '需在家中制作台旁';
        if(g.BuffSystem.hasActionDisabled('player','craft')||g.InventoryEquipment.isPlayerStunned())return '当前无法制作';
        if(g.MedicalActions.isActive()||g.BedSleep?.isActive()||g.GymSystem?.isActive()||g.Hunting?.isActive()||g.PharmacyStation.getActiveCraft()||g.CookingStation.getActiveCraft?.())return '请先结束当前活动';
        return '';
    }
    function definition(type,id){return type==='recipe'?D.recipes.find(r=>r.recipe_id===id):type==='facility'&&['metal','kiln','precision'].includes(id)?D.facilities[id]:type==='upgrade'?D.workbench.upgrades.find(r=>r.upgrade_id===id):null;}
    function carriedTools(){
        const I=g.InventoryEquipment;
        return [...I.getPocketArray(),...I.getVestArray(),...I.getBackpackArray(),...I.getVehicleArray()].filter(x=>x&&!x.warehouse_locked&&!g.ForgingSystem?.isInstanceLocked(x.instance_id)&&!g.FishingSession?.isInstanceLocked(x.instance_id));
    }
    function skill(){return Math.max(0,Math.min(100,g.InventoryEquipment.getSkillLevel('life_manufacturing')||0));}
    function plan(type,id){
        const r=definition(type,id);if(!r)return {reason:'没有这项制作方案',inputs:[]};
        const I=g.InventoryEquipment,inputs=(r.inputs||[]).map(x=>Array.isArray(x)?{item_id:x[0],count:x[1]}:{...x});
        inputs.forEach(x=>{x.name=I.getItemTemplate(x.item_id)?.name||x.item_id;x.available=I.countCarriedItemsByTemplateId(x.item_id);});
        const toolIds=(r.required_tools||[]).map(x=>typeof x==='string'?x:x.item_id),owned=carriedTools(),tools=toolIds.map(item_id=>({item_id,id:owned.find(x=>x.item_id===item_id)?.instance_id}));
        let blocked=reason()||(state.job?'请先完成或放弃当前工作':'');
        if(type==='recipe'){
            if(!g.ManufacturingKnowledge.knows(id))blocked||='尚未掌握配方';
            if(r.station==='pharmacy')blocked||='在制药台制作';
        }
        if(type==='facility'&&state.facilities.includes(id))blocked||='已建成';
        if(type==='upgrade'&&state.level!==r.from_level)blocked||='台级不符';
        const level=r.workbench_level_min||0;
        if(state.level<level)blocked||='需要'+level+'级制作台';
        const facilities=type==='recipe'?[r.station,...(r.support_facilities||[])]:r.required_facilities||r.requires||[];
        if(facilities.some(k=>k!=='pharmacy'&&!state.facilities.includes(k)))blocked||='缺少所需工位';
        if(tools.some(x=>!x.id))blocked||='缺少工具：'+tools.filter(x=>!x.id).map(x=>I.getItemTemplate(x.item_id)?.name).join('、');
        if(inputs.some(x=>x.available<x.count))blocked||='随身材料不足';
        const p=D.profiles[r.work_profile||'routine'],L=skill();
        const chance=type!=='recipe'||!p.random_failure?1:Math.max(.25,Math.min(.98,p.base_success_rate+.002*(L-1)-.01*Math.max(0,p.recommended_level-L)));
        const stamina=type==='recipe'?Math.ceil(g.Survival.getActionStaminaCost(r.stamina*(1-.002*L))*10)/10:r.stamina;
        if(g.Survival.getState().stamina<stamina)blocked||='体力不足';
        return {...r,type,id,inputs,tools,stamina,chance,reason:blocked,name:r.name||(type==='upgrade'?'升级至'+r.to_level+'级制作台':id)};
    }
    function start(type,id){
        const p=plan(type,id);if(p.reason)return {ok:false,message:p.reason};
        g.PlayerActions.prepareFacilityAction();
        const result=atomic(()=>{
            const q=plan(type,id);if(q.reason)throw Error(q.reason);
            for(const x of q.inputs)if(!g.InventoryEquipment.removeCarriedItemsByTemplateId(x.item_id,x.count,{strict:true}).ok)throw Error('材料不足');
            const pos=g.GameEngine.getState();
            state.lastResult=null;state.job={type,id,name:q.name,ticks:q.ticks,stamina:q.stamina,elapsed:0,paid:0,tools:q.tools,mapId:pos.mapId,x:pos.x,y:pos.y,phase:'work',paused:false,success:Math.random()<q.chance};
            return {ok:true};
        });
        if(result.ok)schedule();return result;
    }
    function toolsPresent(j){return j.tools.every(t=>carriedTools().some(x=>x.instance_id===t.id&&x.item_id===t.item_id));}
    function continuationReason(j){const p=g.GameEngine.getState();return reason()||(p.mapId!==j.mapId||p.x!==j.x||p.y!==j.y?'位置已改变':'')||(!toolsPresent(j)?'工具已不可用':'');}
    function step(){
        const j=state.job;if(!j||j.phase!=='work'||j.paused)return {ok:false,message:'没有进行中的工作'};
        const why=continuationReason(j);if(why){pause();return {ok:false,message:why};}
        const due=Math.round(j.stamina*10*(j.elapsed+1)/j.ticks)/10,charge=Math.round((due-j.paid)*10)/10;
        if(g.Survival.getState().stamina<charge){pause();return {ok:false,message:'体力不足，工作已暂停'};}
        const result=atomic(()=>{
            const job=state.job,before=g.WorldTick.getWorldTotalTicks();
            g.Survival.consumeStamina(charge,{raw:true});job.paid=due;job.elapsed++;job.paused=false;
            advancing=true;try{g.Survival.advanceTick({source:'manufacturing'});}finally{advancing=false;}
            if(g.WorldTick.getWorldTotalTicks()!==before+1)throw Error('制作时间未能推进');
            if(job.elapsed===job.ticks){job.phase='claim';job.paused=true;}
            if(continuationReason(job)){job.paused=true;return {ok:false,message:'工作已暂停'};}
            return {ok:true};
        });
        if(result.ok&&state.job?.phase==='claim')return claim();return result;
    }
    function experience(j){
        if(j.type!=='recipe')return;
        const I=g.InventoryEquipment,s=I.getState(),entry=s.skills.life_manufacturing||(s.skills.life_manufacturing={level:1,exp:0});
        entry.exp=(entry.exp||0)+j.ticks*(j.success?1:.25);
        while(entry.level<100&&entry.exp>=50*entry.level+50){entry.exp-=50*entry.level+50;entry.level++;}
        I.setState(s);
    }
    function claim(){
        const j=state.job;if(!j||j.phase!=='claim')return {ok:false,message:'工作尚未完成'};
        const why=continuationReason(j);if(why)return {ok:false,message:why};
        return atomic(()=>{
            const job=state.job,r=definition(job.type,job.id);
            if(job.type==='recipe'&&job.success){for(let i=0;i<r.output_count;i++)if(!g.InventoryEquipment.putItemIntoDefaultContainer({item_id:r.item_id,count:1}).placed)throw Error('背包空间不足，成品保留在制作台，请腾出空间再领取。');}
            if(job.type==='facility')state.facilities.push(job.id);
            if(job.type==='upgrade')state.level=r.to_level;
            experience(job);state.lastResult={name:job.name,success:job.success,count:job.type==='recipe'&&job.success?r.output_count:0};state.job=null;
            return {ok:true,message:job.success?'制作完成':'制作失败，本批材料已消耗'};
        });
    }
    function pause(){stop();if(!state.job||state.job.paused)return {ok:true};return atomic(()=>{state.job.paused=true;return {ok:true};});}
    function resume(){const j=state.job;if(!j)return {ok:false,message:'没有待继续的工作'};if(j.phase==='claim')return claim();const why=continuationReason(j);if(why)return {ok:false,message:why};const r=atomic(()=>{state.job.paused=false;return {ok:true};});if(r.ok)schedule();return r;}
    function cancel(){stop();return atomic(()=>{state.job=null;return {ok:true,message:'已放弃，投入的材料和时间不退还'};});}
    function snapshot(){return {...getState(),recipes:D.recipes.filter(r=>g.ManufacturingKnowledge.knows(r.recipe_id)),saveError};}
    window.ManufacturingActions={initialize,bind,getState,validate,restore,isWorking,isInstanceLocked,allowsTick,reason,plan,start,step,claim,pause,resume,cancel,snapshot};
})(window);

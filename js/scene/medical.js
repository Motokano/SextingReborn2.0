/** MedicalActions owns paid medical actions, surgery progress/reward eligibility and medical-kit workbench crafting/conversions. */
(function (window) {
    'use strict';
    const g=window, K=g.MedicalKit, D=g.MedicalKitData;
    let operation=null, timer=null, advancing=false, saveError=false;
    let rewardedParts=new Set();
    function getProgress(){return {version:1,rewarded_parts:Array.from(rewardedParts)};}
    function validateProgress(s){return s==null || s.version===1 && Array.isArray(s.rewarded_parts) &&
        s.rewarded_parts.length<=4 && new Set(s.rewarded_parts).size===s.rewarded_parts.length &&
        s.rewarded_parts.every(p=>['lhand','rhand','lfoot','rfoot'].includes(p));}
    function restoreProgress(s){rewardedParts=new Set(validateProgress(s)&&s?s.rewarded_parts:[]);}
    function completeSleep(ticks){if(ticks===D.surgery.experience.reset_sleep_ticks)rewardedParts.clear();}
    function awardSurgeryExperience(part){
        if(rewardedParts.has(part))return 0;
        rewardedParts.add(part);
        const I=g.InventoryEquipment,rule=D.surgery.experience;
        if(I.getSkillLevel(rule.skill_id)>=I.getProgressionSkillCap(rule.skill_id))return 0;
        I.addStudyExp(rule.skill_id,rule.success_exp);
        I.tryAdvanceSkillLevel(rule.skill_id);
        return rule.success_exp;
    }
    function initialize() {}
    function bind() {
        document.addEventListener('visibilitychange',function(){stopTimer();schedule();});
        g.addEventListener('pagehide',stopTimer);
        g.addEventListener('pageshow',schedule);
    }
    function isActive(){return !!operation;}
    function getState(){return operation?JSON.parse(JSON.stringify(operation)):null;}
    function validate(s){return s==null || s.version===1 && typeof s.kitId==='string' &&
        ['lhand','rhand','lfoot','rfoot'].includes(s.part) && Number.isInteger(s.elapsed) && s.elapsed>=0 && s.elapsed<6 &&
        s.ticks===6 && Number.isInteger(s.beforeMax) && s.beforeMax>0 && Number.isInteger(s.afterMax) && s.afterMax>=1 && s.afterMax<=s.beforeMax &&
        ['normal','linked'].includes(s.mode) && typeof s.mapId==='string' && Number.isInteger(s.x) && Number.isInteger(s.y);}
    function restore(s,rollback){stopTimer();operation=validate(s)?(s?JSON.parse(JSON.stringify(s)):null):null;saveError=false;if(!rollback)Promise.resolve().then(function(){if(operation){g.PlayerActions.prepareFacilityAction();g.MedicalKitPanel.openDaily();schedule();}});}
    function stopTimer(){if(timer!==null)g.clearTimeout(timer);timer=null;}
    function refresh(){g.SceneHud.refresh('status');g.InventoryPanel.updateBackpackPanel();g.MedicalKitPanel.refresh();g.ManufacturingPanel.refresh();g.SceneMapView.render();}
    function transaction(fn,crafting){
        let result,error;
        try{result=g.SaveSystem.runAtomicFor('medical',fn);}
        catch(e){error=e;g.SceneFeedback.showMsg(e.message,'warn');}
        if(result?.saved){saveError=false;refresh();return result.value;}
        saveError=true;stopTimer();refresh();return {ok:false,message:crafting?(error?.message || '保存失败，本次制作已恢复，请重试。'):'保存失败，本次医疗操作已恢复，请重试。'};
    }
    function basicReason(ownOperation){
        if(!g.SaveSystem || !g.Survival)return '医疗系统尚未就绪';
        return g.SceneAccess.medicalActionReason(ownOperation);
    }
    function inCombat(){return g.CombatEngagement.isPlayerInCombat();}
    function accessReason(id,action,ownOperation){
        const blocked=basicReason(ownOperation);if(blocked)return blocked;
        const instance=K.find(id),p=K.profile(instance);
        if(!p || p.error)return p?.error || '急救包已不在身上';
        if(action!=='modify' && K.equipped()?.instance_id!==id)return '未装备这只急救包';
        if(inCombat() && (action!=='treat' || p.kind!=='quick'))return action==='refill'?'战斗中不能补充':'仅限非战斗状态';
        return '';
    }
    function nearbyWorkbench(){
        const E=g.GameEngine,s=E.getState(),map=E.getMap();
        return s.mapId==='M0_Base_Inside_lv_1' && (map?.npcs || []).some(n=>n.npc_id==='npc.station.manufacturing_base' &&
            Math.max(Math.abs(s.x-n.x),Math.abs(s.y-n.y))===1 && (s.x===n.x || s.y===n.y || E.isWalkable(n.x,s.y)&&E.isWalkable(s.x,n.y)));
    }
    function refillStock(key){
        const item=D.reserves[key]?.item_id;
        if(!item)return {carried:0,warehouse:0,total:0};
        const atHome=['M0_Base_Inside_lv_1','M0_Base_Outside_lv_1'].includes(g.GameEngine.getState().mapId);
        const carried=g.InventoryEquipment.countCarriedItemsByTemplateId(item);
        const warehouse=atHome?g.HideoutWarehouse.countAvailableItem(item):0;
        return {carried,warehouse,total:carried+warehouse};
    }
    function refillPlan(id,key){
        const reason=accessReason(id,'refill');
        return reason?{reason}:K.refillPlan(K.find(id),key,refillStock(key).total);
    }
    function refillAllPlan(id){
        const reason=accessReason(id,'refill');if(reason)return {reason,portions:0,ticks:0};
        const p=K.profile(K.find(id));let portions=0;
        for(const [key,r] of Object.entries(D.reserves)){
            const per=key==='trauma_dressing'?p.caps[key]/3:r.basic_refill_amount;
            portions+=Math.min(Math.ceil((p.caps[key]-p.state.remaining[key])/per),refillStock(key).total);
        }
        return {reason:portions?'':'没有可补充的用品',portions,ticks:portions};
    }
    function therapyPlan(id,part,key,mode){
        const reason=accessReason(id,'treat'),plan=K.therapyPlan(K.find(id),part,key,mode);
        if(reason)plan.reason=reason;
        else if(g.Survival.getState().stamina<plan.stamina)plan.reason='体力不足';
        return plan;
    }
    function modificationPlan(id,kind){
        const reason=accessReason(id,'modify') || (!nearbyWorkbench()?'需在家中制造台':'') || (g.ManufacturingActions.getState().job?'请先完成或放弃制作台工作':'');
        return reason?{reason}:K.modificationPlan(K.find(id),kind);
    }
    function craftingReason(){
        return basicReason() || (g.ManufacturingActions.getState().job?'请先完成或放弃制作台工作':'') || (inCombat()?'仅限非战斗状态':'') ||
            (!nearbyWorkbench()?'需在家中制作台':'') ||
            (g.SceneAccess.isPlayerActionDisabledByBuff('craft')?'当前无法制作':'');
    }
    function basicCraftPlan(){
        const r=D.basic_recipe,IE=g.InventoryEquipment;
        const inputs=r.inputs.map(x=>({...x,name:IE.getItemTemplate(x.item_id).name,available:IE.countCarriedItemsByTemplateId(x.item_id)}));
        const reason=craftingReason() || (!g.ManufacturingKnowledge.knows(r.recipe_id)?'制造1级掌握配方':'') ||
            (inputs.some(x=>x.available<x.count)?'随身材料不足':'');
        return {...r,inputs,reason};
    }
    function craftBasic(){
        const plan=basicCraftPlan();if(plan.reason)return {ok:false,message:plan.reason};
        return transaction(function(){
            const p=basicCraftPlan();if(p.reason)throw Error(p.reason);
            g.PlayerActions.prepareFacilityAction();
            const IE=g.InventoryEquipment;
            for(const x of p.inputs)if(!IE.removeCarriedItemsByTemplateId(x.item_id,x.count).ok)throw Error('随身材料不足');
            for(let i=0;i<p.ticks;i++){
                tick();
                if(craftingReason())return {ok:false,message:'制作中断，已用材料和时间不退还'};
            }
            // Standard inventory creation gives each empty kit its own identity and storage state.
            // Failed delivery rolls back this whole transaction, including materials and time.
            if(!IE.putItemIntoDefaultContainer({item_id:p.item_id,count:p.output_count}).placed)throw Error('没有可存放急救包的空位，本次制作已恢复');
            return {ok:true,message:'已制作基础急救包 ×1（空包）'};
        },true);
    }
    function tick(){
        const before=g.WorldTick.getWorldTotalTicks();
        advancing=true;try{g.Survival.advanceTick(operation ? {source:'medical', intensity:'medium', actionCost: operation.payPerTick ? undefined : 0} : {source:'medical'});}finally{advancing=false;}
        if(g.WorldTick.getWorldTotalTicks()!==before+1)throw Error('医疗时间未能推进');
    }
    function refill(id,key){
        const plan=refillPlan(id,key);if(plan.reason)return {ok:false,message:plan.reason};
        return transaction(function(){
            const current=refillPlan(id,key);if(current.reason)throw Error(current.reason);
            g.PlayerActions.prepareFacilityAction();
            const item=D.reserves[key].item_id;
            const paid=refillStock(key).warehouse>0?g.HideoutWarehouse.consumeAvailableItem(item,1):g.InventoryEquipment.removeCarriedItemsByTemplateId(item,1);
            if(!paid.ok)throw Error('用品不足');
            K.refill(K.find(id),key,current);tick();return {ok:true,message:'已补充'};
        });
    }
    function refillAll(id){
        const plan=refillAllPlan(id);if(plan.reason)return {ok:false,message:plan.reason};
        const pos=g.GameEngine.getState(),origin={mapId:pos.mapId,x:pos.x,y:pos.y};let filled=0;
        for(const key of Object.keys(D.reserves)){
            while(filled<plan.portions){
                const now=g.GameEngine.getState();
                const reason=accessReason(id,'refill') || (now.mapId!==origin.mapId||now.x!==origin.x||now.y!==origin.y?'位置已改变':'');
                if(reason)return {ok:false,message:'已补充'+filled+'份，'+reason,filled};
                if(refillPlan(id,key).reason)break;
                // Each portion commits separately; an interruption or failed save never refunds earlier paid ticks.
                const result=refill(id,key);if(!result.ok)return {...result,filled};
                filled++;
            }
        }
        return {ok:true,message:'已补充'+filled+'份 · '+filled+'刻',filled};
    }
    function treat(id,part,key,mode){
        const plan=therapyPlan(id,part,key,mode);if(plan.reason)return {ok:false,message:plan.reason};
        const result=transaction(function(){
            const p=therapyPlan(id,part,key,mode);if(p.reason)throw Error(p.reason);
            g.PlayerActions.prepareFacilityAction();
            const instance=K.find(id);
            if(p.surgery){
                K.spend(instance,{surgical_staples:p.costs.surgical_staples});
                const pos=g.GameEngine.getState();
                operation={version:1,payPerTick:true,kitId:id,part,mode,elapsed:0,ticks:6,beforeMax:p.beforeMax,afterMax:p.afterMax,mapId:pos.mapId,x:pos.x,y:pos.y};
                return {ok:true,message:'手术开始'};
            }
            K.spend(instance,p.costs);
            p.clears.forEach(type=>g.BuffSystem.clearPartInjury('player',part,type));
            if(p.recovery && g.CharacterAttributes.applyMedicalRecovery(part,p.recovery)!==p.recovery)throw Error('伤情已改变');
            tick();return {ok:true,message:'治疗完成'};
        });
        if(result.ok)schedule();return result;
    }
    function operationReason(){
        const op=operation;if(!op)return '没有进行中的手术';
        const pos=g.GameEngine.getState();
        return accessReason(op.kitId,'treat',true) ||
            (pos.mapId!==op.mapId || pos.x!==op.x || pos.y!==op.y?'位置已改变':'') ||
            (g.CharacterAttributes.getBodyPartDestroyMax(op.part)!==op.beforeMax?'损毁上限已改变':'');
    }
    function advance(){
        if(!operation)return {ok:false,message:'没有进行中的手术'};
        stopTimer();
        const result=transaction(function(){
            let reason=operationReason();if(reason){operation=null;return {ok:false,message:'手术中断：'+reason};}
            tick();
            // World events, including bleeding and enemy actions, settle before surgery completion.
            reason=operationReason();if(reason){operation=null;return {ok:false,message:'手术中断：'+reason};}
            operation.elapsed++;
            if(operation.elapsed<operation.ticks)return {ok:true,message:''};
            const op=operation,instance=K.find(op.kitId);
            if(!g.CharacterAttributes.completeMedicalSurgery(op.part,op.beforeMax,op.afterMax)){operation=null;return {ok:false,message:'伤情已改变，手术中断'};}
            if(op.mode==='linked' && !g.BuffSystem.getPartInjuries('player',op.part).length){
                const available=K.profile(instance).state.remaining.trauma_dressing;
                const healed=g.CharacterAttributes.applyMedicalRecovery(op.part,available);
                if(healed)K.spend(instance,{trauma_dressing:healed});
            }
            // The locked body result, reward and first-success marker share this save transaction.
            const experience=awardSurgeryExperience(op.part);
            operation=null;return {ok:true,message:'手术完成',experience};
        });
        if(result.message)g.SceneFeedback.showMsg(result.message,result.ok?'success':'warn');
        if(result.ok)schedule();return result;
    }
    function schedule(){if(!operation || timer!==null || document.hidden || saveError)return;timer=g.setTimeout(function(){timer=null;advance();},1000);}
    function cancel(){
        if(!operation)return {ok:false,message:'没有进行中的手术'};
        stopTimer();return transaction(function(){operation=null;return {ok:true,message:'已取消手术'};});
    }
    function modify(id,kind){
        const plan=modificationPlan(id,kind);if(plan.reason)return {ok:false,message:plan.reason};
        return transaction(function(){
            const p=modificationPlan(id,kind);if(p.reason)throw Error(p.reason);
            g.PlayerActions.prepareFacilityAction();
            for(const [item,n] of Object.entries(p.cost))if(!g.InventoryEquipment.removeCarriedItemsByTemplateId(item,n).ok)throw Error('改造材料不足');
            for(let i=0;i<p.ticks;i++){
                tick();
                if(basicReason() || inCombat() || !nearbyWorkbench() || !K.find(id))return {ok:false,message:'改造中断，已用材料和时间不退还'};
            }
            const instance=K.find(id),now=K.profile(instance);
            if(now.kind!=='none' || Object.entries(now.state.remaining).some(([k,n])=>n>D.reserves[k].capacity*D.bodies[kind].capacity_multiplier))throw Error('包体状态已改变');
            instance.item_id=p.item_id;
            return {ok:true,message:'已改为'+p.name};
        });
    }
    function useStandalone(container,index,id,part){
        const reason=basicReason() || (inCombat()?'请先脱离战斗':'');
        if(reason)return {ok:false,message:reason};
        const IE=g.InventoryEquipment;
        function locate(){const arr=container==='pocket'?IE.getPocketArray():container==='vest'?IE.getVestArray():container==='backpack'?IE.getBackpackArray():[];return arr[index]?.instance_id===id?arr[index]:null;}
        function plan(){
            const item=locate(),p=item && IE.getItemTemplate(item.item_id)?.medical_supply_profile;
            if(!p || !K.PARTS[part] || !p.allowed_body_parts.includes(part))return {reason:'请选择适用部位'};
            const b=K.body(part),e=p.standalone.effect;
            if(e.kind==='remove_injury')return b.injuries.includes(e.injury_type)?{clear:e.injury_type}:{reason:'无对应伤势'};
            if(b.injuries.length || b.damage>=b.max)return {reason:'该部位暂不能使用敷料'};
            const heal=Math.min(30,Math.max(0,b.damage-Math.ceil(b.max*.3)));
            return heal?{heal}:{reason:'已至治疗下限'};
        }
        const initial=plan();if(initial.reason)return {ok:false,message:initial.reason};
        return transaction(function(){
            const p=plan();if(p.reason)throw Error(p.reason);
            g.PlayerActions.prepareFacilityAction();
            if(!IE.takeItemFromContainer(container,index).success)throw Error('用品已不在原位置');
            if(p.clear)g.BuffSystem.clearPartInjury('player',part,p.clear);
            if(p.heal && g.CharacterAttributes.applyMedicalRecovery(part,p.heal)!==p.heal)throw Error('伤情已改变');
            tick();return {ok:true,message:'治疗完成'};
        });
    }
    function transfer(request){
        const reason=basicReason() || (inCombat()?'请先脱离战斗':'');
        if(reason)return {ok:false,message:reason};
        const IE=g.InventoryEquipment,rec=IE.findItemInstanceRecord(request.id);
        if(!rec || !K.profile(rec.instance) || K.profile(rec.instance).error)return {ok:false,message:'急救包已不在原位置'};
        const unequip=request.action==='unequip';
        if(unequip && K.equipped()?.instance_id!==request.id)return {ok:false,message:'这只包未装备'};
        if(!unequip && !['pocket','vest','backpack','ground'].includes(request.source))return {ok:false,message:'来源无效'};
        return transaction(function(){
            g.PlayerActions.prepareFacilityAction();
            const pos=g.GameEngine.getState();
            function put(item){if(item&&!IE.putItemIntoDefaultContainer(item).placed)throw Error('背包没有空位');}
            if(unequip)put(IE.unequip('medical_kit',pos));
            else {
                const arr=request.source==='ground'?IE.getGroundItemsAt(pos.mapId,pos.x,pos.y):request.source==='pocket'?IE.getPocketArray():request.source==='vest'?IE.getVestArray():IE.getBackpackArray();
                if(arr[request.index]?.instance_id!==request.id)throw Error('急救包已不在原位置');
                const taken=request.source==='ground'?IE.removeItemFromGround(pos.mapId,pos.x,pos.y,request.index):IE.takeItemFromContainer(request.source,request.index).item;
                if(!taken)throw Error('取用急救包失败');
                const old=K.equipped();if(old)put(IE.unequip('medical_kit',pos));
                if(!IE.equip('medical_kit',taken).success)throw Error('装备急救包失败');
            }
            tick();return {ok:true,message:unequip?'已卸下急救包':'已装备急救包'};
        });
    }
    window.MedicalActions={initialize,bind,isActive,getState,validate,restore,getProgress,validateProgress,restoreProgress,completeSleep,refillStock,refillPlan,refillAllPlan,refillAll,therapyPlan,modificationPlan,nearbyWorkbench,basicCraftPlan,craftBasic,refill,treat,advance,cancel,modify,useStandalone,transfer,
        allowsTick:function(options){return !operation || advancing && options?.source==='medical';},
        isAdvancing:function(){return advancing;},hasSaveError:function(){return saveError;}};
})(window);

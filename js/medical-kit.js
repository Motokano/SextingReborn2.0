/* Medical kit rules and instance storage. All paid actions are owned by MedicalActions. */
(function (g) {
    'use strict';
    const D = g.MedicalKitData, keys = Object.keys(D.reserves);
    const PARTS = {head:'头部',chest:'胸部',belly:'腹部',lhand:'左手臂',rhand:'右手臂',lfoot:'左腿',rfoot:'右腿'};
    const INJURIES = {bleeding:'普通出血',heavy_bleeding:'大出血',fracture:'骨折',wound_infection:'伤口感染'};
    const limbs = ['lhand','rhand','lfoot','rfoot'];
    const clone = x => JSON.parse(JSON.stringify(x));
    function profile(instance) {
        const tpl = instance && g.InventoryEquipment.getItemTemplate(instance.item_id);
        if (!tpl || !D.bodies[tpl.medical_kit_body]) return null;
        const kind = tpl.medical_kit_body, body = D.bodies[kind], caps = tpl.medical_capacities;
        const state = instance.attribute_state?.structure?.medical_storage;
        const valid = (instance.count == null || instance.count === 1) && state && state.version === 1 &&
            keys.every(k => Number.isInteger(state.remaining?.[k]) && state.remaining[k] >= 0 && state.remaining[k] <= caps[k]) &&
            Number.isFinite(state.dressing_weight_g) && state.dressing_weight_g >= 0 &&
            (state.remaining.trauma_dressing > 0 || state.dressing_weight_g === 0) &&
            Array.isArray(state.affixes) && new Set(state.affixes).size === state.affixes.length && state.affixes.every(a => D.affixes[a]);
        return {kind, caps:clone(caps), body, error:valid?'':'急救包存量记录无效', state:valid?clone(state):null};
    }
    function carried() {
        const IE = g.InventoryEquipment, results = [], equipment = IE.getState().equipment;
        function add(instance, location) { if (instance && profile(instance)) results.push({id:instance.instance_id,instance,location}); }
        add(equipment.medical_kit, '已装备');
        [['口袋',IE.getPocketArray()],['旧式收纳',IE.getVestArray()],['背包',IE.getBackpackArray()]].forEach(([loc,arr]) => arr.forEach(x => add(x,loc)));
        return results;
    }
    function find(id) {
        if (!carried().some(e => e.id === id)) return null;
        return g.InventoryEquipment.findItemInstanceRecord(id)?.instance || null;
    }
    function equipped() { return g.InventoryEquipment.getState().equipment.medical_kit || null; }
    function contentsWeight(instance) {
        const p = profile(instance); if (!p || p.error) return 0;
        return (p.state.dressing_weight_g + keys.reduce((sum,k) => {
            if (k === 'trauma_dressing') return sum;
            const r = D.reserves[k];
            return sum + p.state.remaining[k] * (r.stored_unit_weight_g ?? r.portion_weight_g / r.basic_refill_amount);
        },0)) / 1000;
    }
    function write(instance, state) {
        const old = instance.attribute_state.structure.medical_storage;
        instance.attribute_state.structure.medical_storage = clone(state);
        if (profile(instance).error) { instance.attribute_state.structure.medical_storage = old; throw Error('医疗存量越界'); }
    }
    function refillPlan(instance,key,stock) {
        const p = profile(instance), r = D.reserves[key];
        if (!p || p.error || !r) return {reason:p?.error || '用品不可用'};
        if (p.state.remaining[key] >= p.caps[key]) return {reason:'已满'};
        if (!(stock > 0)) return {reason:'库存不足'};
        const per = key === 'trauma_dressing' ? p.caps[key]/3 : r.basic_refill_amount;
        const gain = Math.min(per,p.caps[key]-p.state.remaining[key]);
        return {reason:'',gain,weightGain:key==='trauma_dressing'?75*gain/per:0,ticks:1};
    }
    function refill(instance,key,plan) {
        const state = profile(instance).state;
        state.remaining[key] += plan.gain; state.dressing_weight_g += plan.weightGain;
        write(instance,state);
    }
    function spend(instance,costs) {
        const state = profile(instance).state;
        for (const [key,n] of Object.entries(costs)) {
            if (!Number.isInteger(n) || n < 0 || state.remaining[key] < n) throw Error('医疗储量不足');
            if (key === 'trauma_dressing' && n) state.dressing_weight_g *= 1 - n / state.remaining[key];
            state.remaining[key] -= n;
        }
        write(instance,state);
    }
    function body(part) {
        const CA = g.CharacterAttributes;
        return {max:CA.getBodyPartDestroyMax(part),damage:CA.getPartDestroy(part),injuries:g.BuffSystem.getPartInjuries('player',part).map(i => i.type)};
    }
    function therapyPlan(instance,part,key,mode) {
        const p = profile(instance), b = PARTS[part] && body(part), surgery = key==='surgical_staples';
        const result = {reason:'',costs:{},clears:[],recovery:0,ticks:surgery?D.surgery.ticks:1,stamina:surgery?D.surgery.stamina:0,surgery};
        const no = reason => ({...result,reason});
        if (!p || p.error || !b || !D.reserves[key]) return no(p?.error || '治疗目标无效');
        if (mode !== 'normal' && mode !== 'linked') return no('治疗方式无效');
        if (mode==='linked' && p.kind!=='linked') return no('需要联动急救包');
        const need = Math.max(0,b.damage-Math.ceil(b.max*.3)), remaining = p.state.remaining;
        if (surgery) {
            if (!limbs.includes(part)) return no('手术仅限四肢');
            if (b.damage < b.max) return no('部位尚未满损毁');
            result.costs.surgical_staples = (part.includes('hand')?D.surgery.arm:D.surgery.leg)*(p.kind==='meter'?.8:1);
            const level = Math.max(0,Math.min(100,g.InventoryEquipment.getSkillLevel('survival_surgery')));
            result.afterMax = Math.max(1,Math.floor(b.max*(100+level)/200));
            result.beforeMax = b.max; result.afterDamage = result.afterMax-1;
            if (mode==='linked') {
                result.recovery = Math.min(Math.max(0,result.afterDamage-Math.ceil(result.afterMax*.3)),remaining.trauma_dressing);
                if (!result.recovery) return no('无法接敷料');
                result.costs.trauma_dressing = result.recovery;
            }
        } else {
            const t = D.treatments[key];
            if (!t?.allowed_body_parts.includes(part)) return no('部位不适用');
            const temporary = key==='hemostatic_gauze' && p.state.affixes.includes('dressing') && !b.injuries.length;
            if (key==='trauma_dressing' || temporary) {
                if (mode==='linked') return no('请选择伤势用品');
                if (b.damage>=b.max) return no('受伤部位需先手术');
                if (b.injuries.length) return no('存在伤势');
                if (!need) return no('已至治疗下限');
                const cost = temporary?5:1;
                result.recovery = Math.min(need,Math.floor(remaining[key]/cost));
                if (!result.recovery) return no('储量不足');
                result.costs[key] = result.recovery*cost;
            } else {
                let injury = t.injury_type;
                if (key==='tourniquet' && p.state.affixes.includes('universal') && b.injuries.includes('bleeding')) injury='bleeding';
                if (!b.injuries.includes(injury)) return no('无对应伤势');
                result.clears = [injury];
                result.costs[key] = Math.ceil(t.cost_by_body_part[part]*(p.kind==='meter'?.8:1));
                if (key==='fracture_band' && p.state.affixes.includes('fixed') && b.injuries.includes('bleeding')) result.clears.push('bleeding');
                if (mode==='linked') {
                    if (b.injuries.some(i=>!result.clears.includes(i))) return no('尚有其他伤势');
                    if (b.damage>=b.max) return no('受伤部位需先手术');
                    result.recovery = Math.min(need,remaining.trauma_dressing);
                    if (!result.recovery) return no('无法接敷料');
                    result.costs.trauma_dressing = result.recovery;
                }
            }
        }
        if (Object.entries(result.costs).some(([k,n])=>remaining[k]<n)) return no('储量不足');
        return result;
    }
    function modificationPlan(instance,kind) {
        const p = profile(instance), target = D.bodies[kind];
        if (!p || p.error) return {reason:p?.error || '急救包不可用'};
        if (p.kind!=='none') return {reason:'已改造 · 不可再次改造'};
        if (!target?.cost) return {reason:'请选择改造包体'};
        if (keys.some(k=>p.state.remaining[k]>D.reserves[k].capacity*target.capacity_multiplier)) return {reason:'储量超出上限'};
        if (Object.entries(target.cost).some(([id,n])=>g.InventoryEquipment.countCarriedItemsByTemplateId(id)<n)) return {reason:'材料不足'};
        return {reason:'',...target};
    }
    g.MedicalKit = {PARTS,INJURIES,profile,carried,find,equipped,contentsWeight,refillPlan,refill,spend,body,therapyPlan,modificationPlan};
})(window);

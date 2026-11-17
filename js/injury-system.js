/** Part injuries: attack outcomes and world effects; persistent state belongs to BuffSystem. */
(function(g){
    'use strict';
    var parts=['head','chest','belly','lhand','rhand','lfoot','rfoot'], limbs=parts.slice(3);
    function data(){return g.InjuryData;}
    function key(p){return p==='abdomen'?'belly':p;}
    function now(){return g.GameTime ? Number(g.GameTime.getState().totalTicks)||0 : Number(g.Survival && g.Survival.getState().tickCount)||0;}
    function instances(owner){return g.BuffSystem ? (g.BuffSystem.getState().instancesByOwner[owner||'player']||[]).filter(function(i){return i.stacks>0 && i.template && data().types[i.template.injury_type];}) : [];}
    function has(owner,part,type){return instances(owner).some(function(i){return i.body_part===key(part)&&i.template.injury_type===type;});}
    function pain(owner){var seen={};return instances(owner).reduce(function(sum,i){var k=i.body_part+':'+i.template.injury_type;if(seen[k])return sum;seen[k]=true;return sum+data().types[i.template.injury_type].pain;},0);}
    function changed(owner){
        if(owner==='player' && g.Survival)g.Survival.syncPainStateBuff();
        else if(g.CombatEnemies && g.CombatEnemies.refreshInjuryPain)g.CombatEnemies.refreshInjuryPain(owner);
    }
    function apply(owner,part,type){
        var d=data().types[type];part=key(part);
        if(!d||parts.indexOf(part)<0||(d.limbs_only&&limbs.indexOf(part)<0))return false;
        return g.BuffSystem.applyBuff(owner,'injury_'+type,'injury_system',{body_part:part,tick:now()});
    }
    function probabilities(typed,max,part,skills){
        var result={bleeding:0,heavy_bleeding:0,fracture:0};
        if(!(max>0))return result;
        ['blunt','slash','pierce'].forEach(function(type){
            var value=Math.max(0,Number(typed[type])||0)*100/max, row=data().attack_bands[0];
            data().attack_bands.forEach(function(r){if(value>=r.min)row=r;});
            ['bleeding','heavy_bleeding','fracture'].forEach(function(k,i){result[k]=Math.max(result[k],row[type][i]);});
        });
        if(limbs.indexOf(key(part))<0){result.heavy_bleeding=0;result.fracture=0;}
        var rules=data().probability_skills;
        Object.keys(result).forEach(function(type){
            var rule=rules[type],entry=skills&&skills[rule.skill_id];
            var level=Math.max(0,Math.min(rules.level_cap,Math.floor(Number(entry&&typeof entry==='object'?entry.level:entry)||0)));
            result[type]*=1-rule.reduction_per_level*level;
        });
        return result;
    }
    function targetInfo(def,part){
        if(def.kind==='player'){
            var skills={};
            ['survival_health','survival_vitality'].forEach(function(id){skills[id]=g.InventoryEquipment?g.InventoryEquipment.getSkillLevel(id):0;});
            return {owner:'player',max:g.CharacterAttributes.getNormalBodyPartDestroyMax(part),skills:skills};
        }
        var ce=g.CombatEnemies;
        if(!ce||def.mapId==null||def.index==null)return null;
        if((ce.getById(def.enemyId)||{}).limbs_invulnerable)return null;
        var st=ce.getDungeonState(def.mapId,def.index,def.enemyId);
        if(st.dead)return null;
        return {owner:st.ownerId,max:st.maxes[part==='belly'?'abdomen':part],skills:def.skills||(ce.getById(def.enemyId)||{}).skills};
    }
    // Called once after the entire action, including all independent hit segments.
    function finishAttack(ctx){
        if(!ctx||ctx._segmentOfAction||ctx.injuryOutcomes)return;
        var buckets={};
        (ctx.segmentsResults||[ctx]).forEach(function(s){
            if(s.hitRollSuccess===false||!(s.finalDamage>0))return;
            var part=key(s.hitPart),info=targetInfo(s.defender||ctx.defender||{},part);
            if(!info||parts.indexOf(part)<0)return;
            var id=info.owner+':'+part,b=buckets[id]||(buckets[id]={owner:info.owner,part:part,max:info.max,skills:info.skills,typed:{blunt:0,slash:0,pierce:0}});
            var typed=s.defenseBreakdown&&s.defenseBreakdown.typed;
            if(!typed){typed={blunt:0,slash:0,pierce:0};typed[s.damageType||'blunt']=s.finalDamage;}
            var total=['blunt','slash','pierce'].reduce(function(n,k){return n+(Number(typed[k])||0);},0);
            if(total>0)['blunt','slash','pierce'].forEach(function(k){b.typed[k]+=(Number(typed[k])||0)*s.finalDamage/total;});
        });
        ctx.injuryOutcomes=[];
        Object.keys(buckets).forEach(function(id){
            var b=buckets[id],p=probabilities(b.typed,b.max,b.part,b.skills),r;
            if(p.bleeding+p.heavy_bleeding>0){r=Math.random()*100;var type=r<p.heavy_bleeding?'heavy_bleeding':r<p.heavy_bleeding+p.bleeding?'bleeding':null;if(type)ctx.injuryOutcomes.push({owner:b.owner,part:b.part,type:type});}
            if(p.fracture>0&&Math.random()*100<p.fracture)ctx.injuryOutcomes.push({owner:b.owner,part:b.part,type:'fracture'});
        });
        if(!ctx.simultaneousDryRun)commitAttack(ctx);
    }
    function commitAttack(ctx){
        if(ctx._segmentOfAction||ctx.injuriesCommitted)return;
        ctx.injuriesCommitted=true;
        (ctx.injuryOutcomes||[]).forEach(function(o){apply(o.owner,o.part,o.type);});
    }
    function actionMultiplier(ctx,move){
        var a=ctx.attacker||{}, owner=g.CombatEnemies?g.CombatEnemies.ownerOf(a):'player';
        var used=[ctx.limbId || ctx.resourceResult && ctx.resourceResult.limbId].concat(move.required_limbs||[]);
        if(a.kind==='enemy'&&g.CombatEnemies&&a.mapId!=null)used=g.CombatEnemies.actionLimbs(a.enemyId,a.mapId,a.index,move);
        return used.some(function(p){return has(owner,p,'fracture');})?data().fracture.action_damage_multiplier:1;
    }
    function parryMultiplier(owner,part){return has(owner,part,'fracture')?data().fracture.parry_multiplier:1;}
    function moveMultiplier(owner){return 1+['lfoot','rfoot'].filter(function(p){return has(owner,p,'fracture');}).length*data().fracture.move_cost_per_leg;}
    // Hash a saved instance identity and check number: retrying a failed save cannot reroll infection.
    function infectionRoll(uid,check){var h=2166136261,s=uid+':infection:'+check;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967296;}
    function tick(owner,tick,actor){
        var list=instances(owner).slice(),infected={};
        if(!list.length)return;
        function dead(){return owner==='player'?g.Survival.isDead():g.CombatEnemies.isEnemyDead(actor.mapId,actor.index);}
        list.forEach(function(i){if(i.template.injury_type==='wound_infection')infected[i.body_part]=true;});
        list.forEach(function(i){
            if(dead())return;
            var progress=i.injury_progress||(i.injury_progress={last_tick:i.started_tick,elapsed:0,checks:0});
            if(tick<=progress.last_tick||tick<=i.started_tick)return;
            progress.last_tick=tick;
            var type=i.template.injury_type,d=data().types[type];
            if(d.damage_per_tick>0){
                var slow=g.PharmacyEffects && g.PharmacyEffects.getBleedingSlowRatio ? g.PharmacyEffects.getBleedingSlowRatio(owner,i.body_part,tick) : 0;
                // Fixed-point carry belongs to the wound, not the medicine; upgrade and reload retain it.
                var units=(progress.bleed_damage_units || 0)+Math.round(d.damage_per_tick*(1-slow)*1000000);
                var damage=Math.floor(units/1000000);
                progress.bleed_damage_units=units%1000000;
                if(damage>0){
                    if(owner==='player')g.CharacterAttributes.applyCombatDestroy(i.body_part,damage);
                    else g.CombatEnemies.onEnemyDamageResolved({defender:actor,hitPart:i.body_part,finalDamage:damage,hitRollSuccess:true});
                }
                if(dead())return;
                if(!infected[i.body_part]){
                    progress.elapsed++;
                    if(progress.elapsed>=data().infection.interval_ticks){
                        progress.elapsed=0;progress.checks++;
                        var dirty=owner==='player'?g.Survival.getState().dirtyness:50;
                        var band=data().infection.risk_bands.find(function(b){return dirty<=b.max_dirtyness;})||data().infection.risk_bands[2];
                        if(infectionRoll(progress.seed||i.uid,progress.checks)*100<band[type]){apply(owner,i.body_part,'wound_infection');infected[i.body_part]=true;}
                    }
                }
            }else if(type==='wound_infection'&&owner==='player')g.Survival.changeFatigue(data().infection.fatigue_per_tick);
        });
        // Survival already refreshes player pain at tick start; damage/new injuries refresh it on mutation.
        if(owner!=='player')changed(owner);
    }
    function cleared(owner,part,type){
        if(type==='wound_infection')instances(owner).forEach(function(i){if(i.body_part===part&&i.template.injury_group==='bleeding'){
            var p=i.injury_progress||(i.injury_progress={checks:0});p.elapsed=0;p.last_tick=now();
        }});
        changed(owner);
    }
    g.InjurySystem={apply:apply,has:has,pain:pain,changed:changed,cleared:cleared,probabilities:probabilities,
        finishAttack:finishAttack,commitAttack:commitAttack,actionMultiplier:actionMultiplier,parryMultiplier:parryMultiplier,moveMultiplier:moveMultiplier,
        tick:tick,now:now,infectionRoll:infectionRoll};
})(typeof window!=='undefined'?window:this);

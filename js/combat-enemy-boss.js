/* Street-thug boss policy. CombatEnemies owns the instance and save lifecycle. */
(function (g) {
    'use strict';
    const ID = 'enemy.street_thug_boss';
    const clone = v => JSON.parse(JSON.stringify(v));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
    const buffs = () => g.BuffSystem;
    const stacks = id => buffs()?.getBuffStacksSum('player', id) || 0;
    function prepare(t) {
        if (!t?.boss || t.bossDerived || !g.CombatSkills?.getSkill('combat_rogue_sanda')) return t;
        const b = t.boss, attrs = {};
        for (const k of Object.keys(b.innate)) attrs[k] = (b.innate[k] + b.trained[k]) * 1.03;
        Object.assign(t, attrs);
        t.effective_attributes = attrs;
        t.speed = 1 * (1 + attrs.dexterity * .005) + Math.floor(b.skill_level / 10);
        const parry = g.CombatSkills.getParryValues('combat_basic_footwork', b.skill_level);
        t.parry_rate = parry.success * (1 + attrs.flexibility * .005) + .05;
        t.parry_damage_reduce = parry.reduce * (1 + attrs.flexibility * .005) + .05;
        for (const a of t.actions) {
            const shared = g.CombatSkills.getSkill(a.skill_id)?.moves.find(m => m.id === a.id);
            if (shared) Object.assign(a, clone(shared), {diqi_cost: a.diqi_cost});
            const profile = g.CombatSkills.getMovePowerProfile(a.skill_id, a, b.skill_level);
            const base = attrs.jingu * .7 * (1 + profile.levelBonus + b.proficiency_ratio);
            a.power_min = base * profile.min;
            a.power_max = base * profile.max;
        }
        t.bossDerived = true;
        return t;
    }
    function state(st) {
        return st.boss || (st.boss = {diqi:500, charge:0, burstRemaining:0, warningTick:null,
            kneeReadyTick:0, spentTick:null, damagedTick:null, settledTick:null,
            meditationTick:null, meditationTarget:0, combat:false});
    }
    function restore(st, saved) {
        if (!saved || typeof saved !== 'object') return;
        const b = state(st);
        b.diqi = clamp(saved.diqi,0,500); b.charge = clamp(saved.charge,0,200);
        b.burstRemaining = Math.floor(clamp(saved.burstRemaining,0,3));
        b.meditationTarget = clamp(saved.meditationTarget,0,500); b.combat = !!saved.combat;
        for (const k of ['warningTick','kneeReadyTick','spentTick','damagedTick','settledTick','meditationTick'])
            b[k] = Number.isFinite(saved[k]) ? Math.max(0,saved[k]) : (k==='kneeReadyTick'?0:null);
    }
    function context(enemyId,mapId,index) { return {enemyId,mapId,index,tick:g.CombatEnemies.actionTick()}; }
    function visual(kind,c,st) {g.CombatFxEvents?.breathTransition(kind,{kind:'enemy',enemyId:c.enemyId,index:c.index,ownerId:st.ownerId},c.mapId);}
    function live(c) {
        const E=g.GameEngine, map=E?.getMaps?.()[c.mapId], p=E?.getState();
        const e=map?.enemies?.[c.index];
        return e && p?.mapId===c.mapId ? {E,map,p,e,dist:Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))} : null;
    }
    function free(v,x,y) {
        return x>=0 && y>=0 && x<v.map.width && y<v.map.height && v.E.isWalkable(x,y) &&
            !(v.map.enemies||[]).some(e=>e!==v.e&&e.x===x&&e.y===y) &&
            !(v.p.x===x&&v.p.y===y) && !v.E.getNpcAt?.(x,y) && !v.E.getPortalAt?.(x,y);
    }
    // Range two is a one-cell charge, with the same no-corner-cutting rule as the player.
    function approach(c, burst, apply=false) {
        const v=live(c); if(!v) return true;
        if(v.dist<=1) return true;
        if(!burst || v.dist!==2 || g.CombatEnemies.cannotMove(c.enemyId,c.mapId,c.index)) return false;
        const dx=Math.sign(v.p.x-v.e.x),dy=Math.sign(v.p.y-v.e.y),x=v.e.x+dx,y=v.e.y+dy;
        if(!free(v,x,y) || dx&&dy&&(!free(v,v.e.x+dx,v.e.y)||!free(v,v.e.x,v.e.y+dy)))return false;
        if(apply){const fromX=v.e.x,fromY=v.e.y;v.e.x=x;v.e.y=y;
            g.SceneAnimation?.emit?.('combat:charge',{actor:'enemy',enemyId:c.enemyId,fromX,fromY,x,y,path:[{x,y}]});}
        return true;
    }
    function status(st,a,c) {
        const b=state(st);
        if(b.meditationTick===c.tick) return 'meditating';
        if(b.warningTick===c.tick) return 'burst_warning';
        if(b.diqi<a.diqi_cost) return 'insufficient_diqi';
        if(a.id==='collar_knee') {
            if(!stacks('buff_off_balance')) return 'requires_off_balance';
            if(c.tick<b.kneeReadyTick) return 'knee_cooldown';
            if(b.burstRemaining && b.diqi<21+14*(b.burstRemaining-1)) return 'reserve_burst_cost';
        }
        return null;
    }
    function choose(pool,st,c) {
        if(!approach(c,state(st).burstRemaining>0))return null;
        const find=id=>pool.find(a=>a.id===id),v=live(c);
        if(find('collar_knee'))return find('collar_knee');
        const wall=v && !v.E.isWalkable(v.p.x+Math.sign(v.p.x-v.e.x),v.p.y+Math.sign(v.p.y-v.e.y));
        if(wall&&!stacks('buff_off_balance')&&find('shove'))return find('shove');
        if(!stacks('buff_dazzled')&&find('poke_eye'))return find('poke_eye');
        if(!stacks('buff_limping')&&find('kick_knee'))return find('kick_knee');
        return find('swing_punch')||find('shove')||find('poke_eye')||find('kick_knee')||null;
    }
    function prepareOpportunity(st,c,combat=true,atHome=false,canAttack=true) {
        const b=state(st),CE=g.CombatEnemies;
        b.combat=combat;
        if(!combat){b.charge=0;b.burstRemaining=0;b.warningTick=null;}
        if(st.dead||CE.isEnemyStunned(c.mapId,c.index))return;
        if(b.meditationTick===c.tick||b.spentTick===c.tick&&b.warningTick===c.tick)return;
        if(!combat&&!atHome){b.meditationTarget=0;return;}
        if(!combat&&atHome&&b.diqi<500)b.meditationTarget=500;
        if(combat&&b.meditationTarget===500)b.meditationTarget=0;
        if(b.diqi<14)b.meditationTarget=Math.max(b.meditationTarget,28);
        if(b.charge>=200&&b.diqi<42)b.meditationTarget=Math.max(b.meditationTarget,42);
        if(b.diqi>=b.meditationTarget)b.meditationTarget=0;
        if(b.meditationTarget>0 && b.spentTick!==c.tick){b.meditationTick=c.tick;return;}
        if(!combat||!canAttack||b.burstRemaining||b.charge<200||b.warningTick===c.tick||b.diqi<42)return;
        // Only activate if a legal attack can be chosen now; blocked paths and missing limbs do not waste it.
        const qi=st.qi_current;b.burstRemaining=3;st.qi_current=100;
        if(CE.pickEnemyAction(c.enemyId,c.mapId,c.index)) {b.charge=0;b.warningTick=null;visual('activate',c,st);}
        else {b.burstRemaining=0;st.qi_current=qi;}
    }
    function quote(st,a,c) {
        const b=state(st);
        return {enemyId:c.enemyId,mapId:c.mapId,index:c.index,ownerId:st.ownerId,tick:c.tick,
            moveId:a.id,qi:25,diqi:a.diqi_cost,burst:b.burstRemaining>0,burstRemainingBefore:b.burstRemaining,
            offBalanceBefore:stacks('buff_off_balance'),probe:a.id==='swing_punch'?(buffs()?.getBuffStacksSum(st.ownerId,'buff_probe')||0):0,committed:false};
    }
    function commit(st,q) {
        if(!q||q.committed)return; q.committed=true;
        const b=state(st);st.qi_current=Math.max(0,st.qi_current-q.qi);
        b.diqi=Math.max(0,b.diqi-q.diqi);b.spentTick=q.tick;b.combat=true;
        if(q.moveId==='swing_punch')buffs()?.setBuffStacks(st.ownerId,'buff_probe',0);
        if(q.moveId==='collar_knee') {
            buffs()?.setBuffStacks('player','buff_off_balance',Math.max(0,stacks('buff_off_balance')-1));
            b.kneeReadyTick=q.tick+6;
        }
        if(q.burst) b.burstRemaining=Math.max(0,b.burstRemaining-1);
        else {b.charge=Math.min(200,b.charge+q.qi);
            if(b.charge===200&&b.warningTick==null){b.warningTick=q.tick;g.GameLog?.log('头目沉肩吸气，准备猛攻','combat');visual('warning',q,st);}}
    }
    function endTick(st,tick) {
        const b=state(st);if(st.dead||b.settledTick===tick||st.last_turn_tick!==tick)return;
        b.settledTick=tick;
        if(b.spentTick!==tick)st.qi_current=Math.min(100,st.qi_current+50);
        const meditation=b.meditationTick===tick;
        const gain=meditation?(b.damagedTick===tick?0:38):.6;
        b.diqi=Math.min(500,Math.round((b.diqi+gain)*10)/10);
        if(b.diqi>=b.meditationTarget)b.meditationTarget=0;
    }
    g.CombatEnemyBoss={ID,prepare,state,restore,context,status,choose,prepareOpportunity,quote,commit,endTick,approach};
})(typeof window!=='undefined'?window:globalThis);

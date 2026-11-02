/* Ordinary thug policy. Instance state, payments and cooldowns belong to CombatEnemies. */
(function(g){
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v)), stacks=id=>g.BuffSystem?.getBuffStacksSum('player',id)||0;
function prepare(t){
 if(!t?.thug||t.thugDerived||!g.CombatSkills?.getSkill('combat_rogue_sanda'))return t;
 const b=t.thug,attrs={};for(const k of Object.keys(b.innate))attrs[k]=(b.innate[k]+b.trained[k])*1.03;
 Object.assign(t,attrs);t.effective_attributes=attrs;t.speed=1+attrs.dexterity*.005+Math.floor(b.skill_level/10);
 const p=g.CombatSkills.getParryValues('combat_basic_footwork',b.skill_level);
 t.parry_rate=p.success*(1+attrs.flexibility*.005)+.05;t.parry_damage_reduce=p.reduce*(1+attrs.flexibility*.005)+.05;
 for(const a of t.actions){const shared=g.CombatSkills.getSkill(a.skill_id)?.moves.find(m=>m.id===a.id);if(shared)Object.assign(a,clone(shared),{diqi_cost:a.diqi_cost});a.power_min=a.power_max=attrs.jingu*.7*a.move_power_multiplier*(g.CombatSkills.getBasePower(a.skill_id,b.skill_level)+b.proficiency_ratio);}
 t.thugDerived=true;return t;
}
function state(st,t){return st.thug||(st.thug={diqi:t.thug.diqi_max,dashReadyTick:0,spentTick:null,damagedTick:null,settledTick:null,meditationTick:null,meditationTarget:0});}
function restore(st,saved,t){if(!saved)return;const b=state(st,t);b.diqi=Math.max(0,Math.min(t.thug.diqi_max,Number(saved.diqi)||0));b.meditationTarget=Math.max(0,Math.min(t.thug.diqi_max,Number(saved.meditationTarget)||0));for(const k of ['dashReadyTick','spentTick','damagedTick','settledTick','meditationTick'])b[k]=Number.isFinite(saved[k])?Math.max(0,saved[k]):k==='dashReadyTick'?0:null;}
function status(st,a,c,t){const b=state(st,t);return b.meditationTick===c.tick?'meditating':b.diqi<a.diqi_cost?'insufficient_diqi':null;}
function choose(pool,st,c,t){
 const find=id=>pool.find(a=>a.id===id);
 if(t.thug.tier===1){let rows=pool.map(a=>({a,w:(a.id==='poke_eye'&&stacks('buff_dazzled')||a.id==='kick_knee'&&stacks('buff_limping'))?0:a.selection_weight||1}));if(!rows.some(r=>r.w))rows=pool.map(a=>({a,w:a.selection_weight||1}));let n=Math.random()*rows.reduce((v,r)=>v+r.w,0);return rows.find(r=>(n-=r.w)<0)?.a||rows.at(-1).a;}
 const E=g.GameEngine,p=E?.getState(),e=E?.getMaps?.()[c.mapId]?.enemies?.[c.index];
 const wall=p&&e&&p.mapId===c.mapId&&!E.isWalkable(p.x+Math.sign(p.x-e.x),p.y+Math.sign(p.y-e.y));
 if(wall&&!stacks('buff_off_balance')&&find('shove'))return find('shove');
 if(!stacks('buff_dazzled')&&find('poke_eye'))return find('poke_eye');
 if(!stacks('buff_limping')&&find('kick_knee'))return find('kick_knee');
 return find('swing_punch')||find('shove')||find('poke_eye')||find('kick_knee')||null;
}
function prepareOpportunity(st,c,t,combat=true,home=false){
 const b=state(st,t),cost=t.thug.ordinary_diqi_cost;
 if(st.dead||g.CombatEnemies.isEnemyStunned(c.mapId,c.index)||b.meditationTick===c.tick)return;
 if(!combat&&!home){b.meditationTarget=0;return;}
 if(!combat&&home&&b.diqi<t.thug.diqi_max)b.meditationTarget=t.thug.diqi_max;
 if(combat&&b.meditationTarget===t.thug.diqi_max)b.meditationTarget=0;
 if(b.diqi<cost)b.meditationTarget=Math.max(b.meditationTarget,cost*2);
 if(b.diqi>=b.meditationTarget)b.meditationTarget=0;
 if(b.meditationTarget>0&&b.spentTick!==c.tick)b.meditationTick=c.tick;
}
function quote(st,a,c,t){return {...c,ownerId:st.ownerId,policy:'thug',moveId:a.id,qi:a.qi_cost,diqi:a.diqi_cost,burst:false,probe:0,committed:false};}
function commit(st,q,t){if(q.committed)return;q.committed=true;const b=state(st,t);st.qi_current=Math.max(0,st.qi_current-q.qi);b.diqi=Math.max(0,b.diqi-q.diqi);b.spentTick=q.tick;}
function endTick(st,tick,t){const b=state(st,t);if(st.dead||b.settledTick===tick||st.last_turn_tick!==tick)return;b.settledTick=tick;if(b.spentTick!==tick)st.qi_current=Math.min(t.qi_li_max,st.qi_current+50);const gain=b.meditationTick===tick?(b.damagedTick===tick?0:t.thug.meditation_gain):t.thug.diqi_regen;b.diqi=Math.min(t.thug.diqi_max,Math.round((b.diqi+gain)*10)/10);if(b.diqi>=b.meditationTarget)b.meditationTarget=0;}
// Uses the same grid, sight and corner rules as dungeon walking. Never uses shared intel.
function dash(st,c,t,s,e){
 const d=t.thug.dash,b=state(st,t),N=g.RuinsEncounter,R=g.RuinsSettlement;
 if(!d||st.dead||c.tick<b.dashReadyTick||b.meditationTick===c.tick||e.skipTurn||e.cannotMove||g.CombatEnemies.cannotMove(c.enemyId,c.mapId,c.index)||!N.sees(s,e,s.player.cell))return null;
 const w=s.map.width,dist=N.dist(e.cell,s.player.cell,w);
 if(dist<=1||dist>d.targetRange)return null;
 const tiles=N.collision(s,e),flow=R.flood(tiles,w,s.map.height,e.cell),origin=e.cell;
 const choices=N.neighbours(s.player.cell,s.map).filter(k=>flow.dist[k]>0&&flow.dist[k]<=d.maxPathSteps&&N.lineOfSight(s,k,s.player.cell));
 choices.sort((a,b)=>flow.dist[a]-flow.dist[b]||N.dist(a,origin,w)-N.dist(b,origin,w)||a-b);
 if(!choices.length)return null;
 const cells=[choices[0]];while(cells[0]!==origin){const prev=flow.prev[cells[0]];if(prev<0)return null;cells.unshift(prev);}
 // Final recheck immediately before committing; preceding enemies may have moved.
 const fresh=N.collision(s,e);if(cells.slice(1).some((k,i)=>!R.canStep(fresh,w,s.map.height,cells[i],k)))return null;
 b.dashReadyTick=c.tick+d.cooldownTicks;e.cell=cells.at(-1);e.facing=N.direction(e.cell,s.player.cell,w);
 return cells.map(k=>({x:k%w,y:Math.floor(k/w)}));
}
g.CombatEnemyThug={prepare,state,restore,status,choose,prepareOpportunity,quote,commit,endTick,dash};
})(typeof window!=='undefined'?window:globalThis);

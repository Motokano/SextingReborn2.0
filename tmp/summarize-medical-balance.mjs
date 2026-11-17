import fs from 'node:fs';
const names=['medical-balance-20261117','medical-balance-prepared-20261117','medical-balance-boss-20261117','medical-balance-edges-20261117'];
const inputs=names.map(name=>({name,data:JSON.parse(fs.readFileSync('tmp/'+name+'.json','utf8'))}));
const mean=a=>a.length?a.reduce((n,v)=>n+v,0)/a.length:0;
const stats=a=>({n:a.length,min:Math.min(...a),mean:mean(a),median:a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)],max:Math.max(...a)});
// Clarify labels in the first runs: a cleared damage bar does not imply restored surgery maxima or cleared pain.
for(const {name,data:d} of inputs){
  if(name.includes('prepared'))d.method.build='combat skills60; innate attributes20/acquired0; diqi filled subject to real cap (observed initial current73); medical skills0';
  const recoveries=[...d.drills,...d.combat,...(d.edges||[])].map(x=>x.recovery).filter(Boolean);
  for(const r of recoveries){r.damage_cleared=r.remaining_damage===0;r.normal_maxima_restored=Object.keys(r.after).every(p=>r.after[p].max===d.initial.body[p].max);delete r.full_recovery;delete r.fully_healthy;}
  fs.writeFileSync('tmp/'+name+'.json',JSON.stringify(d,null,2)+'\n');
}
const result={scope:{automated_combat_fragments:inputs.reduce((n,x)=>n+x.data.combat.length,0),controlled_recovery_drills:inputs[0].data.drills.length,endurance_profiles:inputs[0].data.endurance.length,extra_boundary_drills:inputs[3].data.edges.length,live_save_used:false,runtime_values_changed:false},groups:[]};
for(const {name,data:d} of inputs)for(const enemy of [...new Set(d.combat.map(x=>x.enemyId))]){
  const a=d.combat.filter(x=>x.enemyId===enemy),alive=a.filter(x=>!x.dead),v=alive.map(x=>x.xp.survival_vitality),h=alive.map(x=>x.recovery.xp_gain.survival_health);
  result.groups.push({run:name,enemy,n:a.length,deaths:a.filter(x=>x.dead).length,injured_at_stop:a.filter(x=>Object.values(x.after).some(b=>b.injuries.length)).length,medical_users:alive.filter(x=>x.treatment.ticks>0).length,vitality:stats(v),health:stats(h),rest:stats(alive.map(x=>x.recovery.ticks)),estimated_fragments_per_level:{health:mean(h)>0?Math.ceil(5000/mean(h)):null,vitality:mean(v)>0?Math.ceil(5000/mean(v)):null}});
}
result.capacity_episodes=inputs[0].data.endurance.map(x=>({kind:x.kind,successful:x.episodes.filter(y=>!y.after.lhand.injuries.length&&y.after.lhand.damage===30).length,first_unsuccessful:x.episodes.length}));
result.drills=inputs[0].data.drills.map(x=>({name:x.name,kind:x.kind,level:x.level,medical_ticks:x.treatment.ticks,cost:x.treatment.cost,rest_ticks:x.recovery.ticks,rest_seconds:x.recovery.real_seconds,health_exp:x.recovery.xp_gain.survival_health,surgery_exp:x.treatment.xp.survival_surgery,food_after:x.recovery.resources.satiety,water_after:x.recovery.resources.thirst,maxima_restored:x.recovery.normal_maxima_restored}));
result.errors=inputs.flatMap(x=>x.data.runtime_errors);
fs.writeFileSync('tmp/medical-balance-summary-20261117.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({scope:result.scope,groups:result.groups,capacity_episodes:result.capacity_episodes,errors:result.errors},null,2));

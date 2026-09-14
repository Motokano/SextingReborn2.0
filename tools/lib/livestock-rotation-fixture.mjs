import assert from 'node:assert/strict';
import { fixture, species } from './livestock-test-fixture.mjs';

export function rotationRun({ mixed=false, prepared=false, pigs=2, birds=5, cattle=2, sheep=2, ticks=12000, damaged=false, recovery=false, manual=false, growing=false }={}) {
  const f=fixture();
  // Same equipment and animals in both layouts. No powered ecological modules.
  f.mount('arm3','inner','coop');
  const troughs=['arm1','arm2','arm3','arm4'].flatMap(arm=>['cw_side','ccw_side'].map(slot=>f.mount(arm,slot,'feed_trough')));
  if(prepared) Object.entries({z1:0.8,z4:0.4,z3:0.1,z2:0}).forEach(([id,h])=>f.st.zones[id].grass_height=h);
  if(damaged) Object.values(f.st.zones).forEach(z=>{z.grass_height=0;z.compaction=100;z.pollution=80;});
  let sequence=0;
  const herd=[];
  for(const [kind,count,zone] of [['cattle',cattle,'z1'],['sheep',sheep,'z4'],['pig',pigs,'z3'],['chicken',birds,'arm3']]) {
    for(let i=0;i<count;i++) herd.push(f.animal(kind,kind==='chicken'?zone:mixed?'z4':zone,{
      uid:'rotation_'+(++sequence),gender:kind==='cattle'||kind==='chicken'?'female':'male',
      weight_kg:growing ? species[kind].growth.birth_weight_kg : species[kind].growth.fatten_cap_kg,
      age_ticks:growing ? 0 : species[kind].growth.maturity_ticks||0,satiety:100
    }));
  }
  const result={mixed,prepared,pigs,birds,cattle,sheep,ticks,damaged,recovery,manual,growing,feed:0,products:{},tills:0,cleans:0,maxLedgerError:0,ledgerChecks:0,cycles:[],deaths:0,sheepBlockedTicks:0};
  let periodFeed=0,periodGrass=0;
  for(let tick=0;tick<ticks;tick++) {
    // Explicit paid external feed replenishment; count actual consumption, never claim a crop supply loop.
    troughs.forEach(t=>t.feed_units=100);
    if(manual || recovery && tick < 1000) {
      for(const [id,z] of Object.entries(f.st.zones)) {
        if((manual && pigs===0 || recovery) && z.compaction>40) {f.ls.tillZone(id,10);result.tills++;}
        if((manual && birds===0 || recovery) && z.pollution>20) {f.ls.cleanZone(id,10);result.cleans++;}
      }
    }
    const before=troughs.reduce((n,t)=>n+t.feed_units,0); f.tick();
    const used=before-troughs.reduce((n,t)=>n+t.feed_units,0); result.feed+=used;periodFeed+=used;
    let feedNutrition=0;
    for(const a of herd) {
      const n=a.nutrition_state.last;
      if(!n||a._auditLast===n)continue;a._auditLast=n;
      for(const value of Object.values(n))assert(Number.isFinite(value)&&value>=-1e-8);
      const error=Math.abs(n.intake+n.reserve_used-n.maintenance_paid-n.reserve_refilled-n.recovery_spent-n.growth_spent-n.production_spent-n.unused);
      result.maxLedgerError=Math.max(result.maxLedgerError,error);assert(error<1e-8);result.ledgerChecks++;
      feedNutrition+=n.feed;periodGrass+=n.grass_taken_m;
      if(a.species_id==='sheep' && f.st.zones[a.zone_id].grass_height>species.sheep.graze.edible_max_m)result.sheepBlockedTicks++;
      for(const p of species[a.species_id].products.living.filter(p=>p.nutrition_per_item>0)){
        const r=f.ls.collectProduct(a.uid,p.product_id);if(r.ok)result.products[r.item_id]=(result.products[r.item_id]||0)+r.count;
      }
    }
    assert(Math.abs(feedNutrition-used*10)<1e-8);
    if((tick+1)%1000===0){
      result.cycles.push({tick:tick+1,feed:periodFeed,grass:periodGrass,minHp:Math.min(...herd.map(a=>a.hp)),
        zones:JSON.parse(JSON.stringify(f.st.zones))});periodFeed=0;periodGrass=0;
    }
  }
  result.deaths=herd.filter(a=>a.dead).length;
  result.animals=herd.map(a=>({kind:a.species_id,weight:a.weight_kg,hp:a.hp,dead:a.dead,cause:a.death_cause||null}));
  result.minHp=Math.min(...herd.map(a=>a.hp));result.maintenanceStamina=(result.tills+result.cleans)*10;
  return result;
}

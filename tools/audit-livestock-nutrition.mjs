// Controlled 12,000-tick scenarios; actual runtime, species, inventory and rotating arms.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fixture, species } from './lib/livestock-test-fixture.mjs';
const setups = [ ['cattle'], ['sheep'], ['pig'], ['chicken'], ['cattle','sheep'], ['cattle','pig'], ['sheep','pig'], ['pig','chicken'], ['cattle','sheep','chicken'], ['cattle','sheep','pig','chicken'] ];
const reports = []; let ledgerChecks = 0, maxError = 0;
for (const kinds of setups) for (const supply of ['pasture', 'fed']) {
  const f = fixture(); f.mount('arm1','inner','coop');
  const troughs = supply === 'fed' ? ['arm1','arm2','arm3','arm4'].flatMap(arm => ['cw_side','ccw_side'].map(slot => f.mount(arm, slot, 'feed_trough'))) : [];
  const herd = kinds.flatMap(kind => Array.from({length: kind === 'chicken' ? 3 : 2}, (_, i) => f.animal(kind, kind === 'chicken' ? 'arm1' : 'z1', {
    gender: kind === 'cattle' || kind === 'chicken' ? 'female' : 'male',
    perks: i === 1 && kind !== 'chicken' ? ['fast_growth'] : [],
    weight_kg: kind === 'chicken' ? 1 : species[kind].growth.graze_cap_kg || species[kind].growth.wean_weight_kg
  })));
  let feed = 0, productNutrition = 0, growthNutrition = 0, unused = 0; const collected = {};
  for (let tick = 0; tick < 12000; tick++) {
    for (const t of troughs) t.feed_units = 100; // Explicit external input; consumption counted below.
    const before = troughs.reduce((n,t)=>n+t.feed_units,0); f.tick();
    const used = before - troughs.reduce((n,t)=>n+t.feed_units,0); feed += used;
    let consumedNutrition = 0;
    for (const a of herd) {
      const n = a.nutrition_state.last; if (!n || a._auditedLast === n) continue; a._auditedLast = n;
      for (const value of Object.values(n)) assert(Number.isFinite(value) && value >= -1e-8);
      const err = Math.abs(n.intake + n.reserve_used - n.maintenance_paid - n.reserve_refilled - n.recovery_spent - n.growth_spent - n.production_spent - n.unused);
      maxError = Math.max(maxError, err); assert(err < 1e-8); ledgerChecks++;
      consumedNutrition += n.feed; productNutrition += n.production_spent; growthNutrition += n.growth_spent; unused += n.unused;
      assert(a.weight_kg >= species[a.species_id].growth.birth_weight_kg - 1e-8);
      assert(a.weight_kg <= species[a.species_id].growth.fatten_cap_kg + 1e-8);
      assert(a.hp >= 0 && a.hp <= 100 && a.satiety >= 0 && a.satiety <= 100);
      for (const p of species[a.species_id].products.living.filter(p => p.nutrition_per_item > 0)) {
        const r = f.ls.collectProduct(a.uid, p.product_id);
        if (r.ok) collected[r.item_id] = (collected[r.item_id] || 0) + r.count;
      }
    }
    assert(Math.abs(consumedNutrition - used * 10) < 1e-8);
    for (const r of f.ls.drainAutoCollectItems()) collected[r.item_id] = (collected[r.item_id] || 0) + r.count;
  }
  reports.push({ kinds, supply, ticks:12000, feed_units:feed, growth_nutrition:growthNutrition, production_nutrition:productNutrition, unused_nutrition:unused, collected,
    animals:herd.map(a=>({kind:a.species_id,weight:a.weight_kg,hp:a.hp,satiety:a.satiety,dead:a.dead,cause:a.death_cause||null})) });
}
const report = { phase:'nutrition-v1', ticks:240000, scenarios:reports.length, ledger_checks:ledgerChecks, max_ledger_error:maxError, assumptions:['Fed scenarios receive externally replenished troughs each tick; consumption is counted, not free production.', 'No cleaning or clinic; ecological collapse remains possible.', 'Collect formed milk/wool/eggs each tick to measure continuous production; do not extract blood.', 'Synchronous rotation remains enabled.'], reports };
fs.writeFileSync(new URL('../docs/reference/livestock-nutrition-verification.json', import.meta.url), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({scenarios:report.scenarios,ticks:report.ticks,ledgerChecks,maxError}));
for (const r of reports) console.log(r.kinds.join('+'),r.supply,JSON.stringify({feed:+r.feed_units.toFixed(3),products:r.collected,alive:r.animals.filter(a=>!a.dead).length,total:r.animals.length}));

// Observations of known remaining design discontinuities; not pass/fail regressions.
import fs from 'node:fs';
import { fixture, species } from './lib/livestock-test-fixture.mjs';
const observations = {};
observations.slaughterThresholds = Object.keys(species).map(kind => {
  const f = fixture(), a = f.animal(kind, kind === 'chicken' ? 'arm1' : 'z1', { weight_kg: 0.001 });
  return { species: kind, minimumKg: f.ls.previewSlaughter(a.uid).minimum_weight_kg };
});
observations.offalCliff = [599.99, 600].map(weight_kg => {
  const f = fixture(), a = f.animal('cattle', 'z1', { weight_kg });
  return { weightKg: weight_kg, products: f.ls.previewSlaughter(a.uid).items };
});
observations.healthCliff = [59.99, 60].map(hp => {
  const f = fixture(), a = f.animal('cattle', 'z1', { weight_kg: 600, hp });
  return { hp, products: f.ls.previewSlaughter(a.uid).items };
});
{
  const f = fixture(); f.mount('arm1', 'inner', 'coop');
  const t = f.mount('arm1', 'cw_side', 'feed_trough');
  const a = f.animal('chicken', 'arm1', { satiety: 0, starvation_ticks: 599 });
  t.feed_units = 0.000001; f.tick();
  observations.starvationReset = { suppliedFeed: 0.000001, satiety: a.satiety, starvationTicks: a.starvation_ticks, dead: a.dead };
}
observations.livingProductionBudget = [70.001, 100].map(satiety => {
  const f = fixture(), a = f.animal('cattle', 'z1', { gender: 'female', satiety });
  const before = { weight: a.weight_kg, satiety: a.satiety };
  const result = f.ls.collectProduct(a.uid, 'milk');
  return { before, after: { weight: a.weight_kg, satiety: a.satiety }, result };
});
observations.chickenMeatTypes = (() => {
  const f = fixture(), a = f.animal('chicken', 'arm1');
  return { configured: species.chicken.products.slaughter.meat_item_ids, actual: f.ls.previewSlaughter(a.uid).items };
})();
const text = JSON.stringify(observations, null, 2) + '\n';
fs.writeFileSync(new URL('../docs/reference/livestock-boundary-observations.json', import.meta.url), text);
console.log(text);

import fs from 'node:fs';
import {rotationRun} from './lib/livestock-rotation-fixture.mjs';
const cases={startup:{},growing:{growing:true},prepared:{prepared:true},mixed:{mixed:true},fewerCattle:{cattle:1},fewerSheep:{sheep:1},moreSheep:{sheep:4},noPig:{pigs:0},noPigManual:{pigs:0,manual:true},noChicken:{birds:0},noChickenManual:{birds:0,manual:true},damaged:{damaged:true},repaired:{damaged:true,recovery:true}};
const reports={};
for(const [name,options] of Object.entries(cases)) {
  const r=reports[name]=rotationRun(options);
  console.log(name,JSON.stringify({feed:+r.feed.toFixed(2),products:r.products,minHp:r.minHp,deaths:r.deaths,tills:r.tills,cleans:r.cleans,blocked:r.sheepBlockedTicks,tailFeed:r.cycles.slice(-4).map(c=>+c.feed.toFixed(2)),tailGrass:r.cycles.slice(-4).map(c=>+c.grass.toFixed(3))}));
}
fs.writeFileSync(new URL('../docs/reference/livestock-rotation-verification.json',import.meta.url),JSON.stringify({phase:'rotation-v1',assumptions:['Adult cohort for 12000 ticks; later chicken replacement and breeding are outside this experiment.','Feed supply is replenished externally and actual consumption counted.','Products collected immediately without time or stamina cost in all cases; no blood extraction.','Startup uses original uniform grass height; only animal grouping and trough/coop placement are prepared.','Manual maintenance uses real state actions, 10 points per action and UI cost 10 stamina; other game-time consequences are not simulated.'],reports},null,2)+'\n');

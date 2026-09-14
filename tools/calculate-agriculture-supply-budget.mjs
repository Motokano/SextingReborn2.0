// Discussion-only budget calculation. Does not change runtime or item parameters.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const balance=read('data/agriculture-crop-balance.json'),soils=read('data/agriculture-soils.json').soils;
const round=v=>Math.round(v*10)/10;
const parameters={target_management_ticks:400,jar:{bottle_capacity:2,max_output_per_tick:3.75,setting_step:.05,bottle_nutrients:{low:700,mid:1000,high:1500}},seaweed:{bottle_nutrients:2400,levels:[{level:1,bottles:2,max_output:6},{level:2,bottles:3,max_output:12},{level:3,bottles:4,max_output:18}]},compost:{cycle_ticks:1008,normal_bottles_min:2,normal_bottles_max:4}};
function findJar(c,soilId,jars=1,plants=4){
  const s=soils[soilId],active=soilId!== 'soil_saline_alkali';
  const multiplier=s.fertilizer_retention*(active?s.fusion_gated?.absorption_modifiers?.fertilizer_multiplier||1:1);
  // Identical crop group shared equally by every jar. Existing per-source 0.1 rounding retained.
  for(let i=1;i<=Math.round(parameters.jar.max_output_per_tick/parameters.jar.setting_step);i++){
    const output=i*.05,absorbed=round(output/plants*multiplier)*jars;
    if(absorbed>=c.fertilizer[1]-1e-8&&absorbed<=c.fertilizer[2]+1e-8)
      return {jars,plants,per_jar_output:+output.toFixed(2),per_plant_absorbed:absorbed,high_one_bottle_ticks:+(1500/output).toFixed(1),high_full_tank_ticks:+(parameters.jar.bottle_capacity*1500/output).toFixed(1),mid_one_bottle_ticks:+(1000/output).toFixed(1),total_raw_per_tick:+(output*jars).toFixed(2),high_bottles_per_1008:+(output*jars*1008/1500).toFixed(2)};
  }return null;
}
function jarPlan(c,soil){for(let jars=1;jars<=4;jars++){const r=findJar(c,soil,jars);if(r)return r;}return null;}
function trace(c,soilId){
  const s=soils[soilId],mul=s.trace_retention*(soilId!=='soil_saline_alkali'?s.fusion_gated?.absorption_modifiers?.trace_multiplier||1:1);
  for(let i=0;i<1000;i++){
    const concentration=i*.05,a=round(concentration*mul);
    if(a>=c.trace[1]-1e-8&&a<=c.trace[2]+1e-8){
      const rows=[6,10,16].map(cells=>{const need=concentration*cells,level=parameters.seaweed.levels.find(l=>l.max_output+1e-8>=need);return {distinct_covered_cells:cells,total_output:+need.toFixed(2),min_level:level?.level||null,full_refill_ticks:level?+(level.bottles*2400/need).toFixed(1):null};});
      return {source_target:+concentration.toFixed(2),absorption:a,layouts:rows};
    }
  }return null;
}
const crops=Object.entries(balance.crops).map(([id,c])=>({id,name:c.name,tier:c.tier,growth_ticks:c.growth_ticks,soil:c.reference_soil,fertilizer:c.fertilizer?{ideal:c.fertilizer.slice(1,3),default_soil:jarPlan(c,'soil_saline_alkali'),reference_soil:jarPlan(c,c.reference_soil)}:null,trace:c.trace?{ideal:c.trace.slice(1,3),default_soil:trace(c,'soil_saline_alkali'),reference_soil:trace(c,c.reference_soil)}:null}));
const output={status:'proposal_not_implemented',parameters,assumptions:['400 ticks means replenishment/adjustment, not automatic harvesting or replanting.','Jar scenarios are four identical growing crops sharing each jar equally; geometric placement and water are not simulated.','Reference-soil modifiers included, but cumulative leaching, rotation, health and full-season settling are not simulated.','Seaweed scenarios use 6/10/16 distinct covered cells after same-device overlap merge; no exact network topology is asserted.','Keeps existing 0.1 per-source absorption rounding and searches 0.05 device settings; rounding must be reviewed when implementing shared distribution.','Steady active output is a conservative refill baseline; mature/empty plots pause jar consumption.','Seaweed production recipe remains unresolved, so its upstream economy is not validated.'],crops};
fs.writeFileSync(path.join(root,'docs/reference/agriculture-supply-budget-proposal.json'),JSON.stringify(output,null,2)+'\n','utf8');
console.log(JSON.stringify({parameters,examples:crops.filter(c=>['celery','cherry','sesame','star_anise','chili_kashmir'].includes(c.id)),growth_range:[Math.min(...crops.map(c=>c.growth_ticks)),Math.max(...crops.map(c=>c.growth_ticks))]},null,2));

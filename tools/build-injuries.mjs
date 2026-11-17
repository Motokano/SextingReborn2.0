import fs from 'node:fs';
import assert from 'node:assert/strict';
const data=JSON.parse(fs.readFileSync('data/injuries.json','utf8'));
assert.deepEqual(Object.keys(data.types),['bleeding','heavy_bleeding','fracture','wound_infection']);
for(const row of data.attack_bands) for(const type of ['blunt','slash','pierce']) {
  assert.equal(row[type].length,3);
  assert.ok(row[type].every(n=>Number.isInteger(n)&&n>=0&&n<=100));
  assert.ok(row[type][0]+row[type][1]<=100);
}
fs.writeFileSync('js/injury-data.js','/* Generated from data/injuries.json. Run npm run build:injuries. */\n(function(g){g.InjuryData='+JSON.stringify(data)+';})(typeof window!=="undefined"?window:this);\n');
const buffs=JSON.parse(fs.readFileSync('data/buffs.json','utf8'));
buffs.buffs=buffs.buffs.filter(b=>!b.injury_generated);
for(const [type,d] of Object.entries(data.types)) buffs.buffs.push({
  buff_id:'injury_'+type,name:d.name,desc:d.description,injury_generated:true,
  injury_type:type,injury_group:d.group,manualLifetime:true,durationTicks:0,
  maxStacks:1,stacksAddOnApply:1,consumeLayersFixed:0,consumeMode:'always',applyMode:'always_apply',
  dispel_pool:'',judgment_tags:{injury:'true'},
  triggerEventKind:['world'],triggerEventName:['tick_advanced'],triggerTags:[],effects:[],expire_effects:[]
});
fs.writeFileSync('data/buffs.json',JSON.stringify(buffs,null,2)+'\n');
console.log('Built four persistent part injuries.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MODELS, createFlask, CRAFT_RECIPES, initialState, craftReason } from './water-flask-prototype-model.mjs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const data=JSON.parse(read('docs/design/examples/manufacturing-system-v1.json'));
const classification=JSON.parse(read('docs/design/manufacturing-classification-v1.json'));
const basic=data.recipes.filter(r=>r.unlock.kind==='skill_level');
const researched=data.recipes.filter(r=>r.unlock.kind==='exploration');
assert.equal(basic.length,22);
assert.equal(researched.length,41);
assert.equal(basic.length+researched.length,data.recipes.length);
assert(basic.every(r=>r.unlock.level===1),'Only level 1 can grant product recipes');
assert.equal(data.processing_recipes.length,2);
for(const r of data.recipes){
  const c=classification.items.find(i=>i.item_id===r.item_id);
  assert.deepEqual(c.unlock,r.unlock,`Classification differs for ${r.item_id}`);
  if(r.unlock.kind==='exploration'){
    assert.equal(r.unlock.hard_skill_level,null);
    assert.equal(r.unlock.level,undefined);
    assert(r.unlock.complete_record_route,`Missing complete research route: ${r.item_id}`);
    assert(data.interest_points[r.unlock.interest_point]?.recipes.includes(r.item_id),`Missing evidence source: ${r.item_id}`);
    const s=r.unlock.sample_route;
    if(s)assert.equal(s.consumes_sample,data.research[s.research_profile].consumes_sample);
  }
}
assert(data.recipes.filter(r=>r.item_id.startsWith('soil_amend_')).every(r=>r.unlock.kind==='exploration'));
const catalog={...JSON.parse(read('data/items.json')),...JSON.parse(read('data/forging/item-catalog-v2.json')).items};
const context=vm.createContext({assert,structuredClone,URLSearchParams,location:{search:''},document:{hidden:false},MODELS,createFlask,fixtureData:data,fixtureCatalog:catalog,fixtureClasses:classification});
// Load the actual prototype functions without browser bootstrapping or event listeners.
const source=read('tools/manufacturing-prototype.js').replace(/^import .*;\r?\n/m,'').split("document.addEventListener('click'")[0];
vm.runInContext(source,context,{filename:fileURLToPath(new URL('tools/manufacturing-prototype.js',root))});
vm.runInContext(`
data=fixtureData;catalog=fixtureCatalog;classes=Object.fromEntries(fixtureClasses.items.map(i=>[i.item_id,i]));recipes=[...data.recipes,...data.processing_recipes];
render=()=>{};renderSettings=()=>{};announce=()=>{};
function evidenceFor(id,type){return researchEvidence().find(e=>e.item===id&&e.type===type);}
function finish(){let guard=50;while(state.job&&!state.job.complete&&guard-->0){assert(!state.job.paused,'Unexpected research pause');tick();}assert(state.job?.complete);settleJob();}
reset();
const knownAtOne=[...state.known].sort();
assert.equal(data.recipes.filter(r=>state.known.has(r.recipe_id)).length,22);
assert.equal(state.known.size,24,'22 products and 2 material processes');
for(const skill of Object.keys(state.skills)) state.skills[skill]=100;
syncKnowledge();assert.deepEqual([...state.known].sort(),knownAtOne,'Skill increases must not unlock research recipes');
for(const r of data.recipes.filter(r=>r.unlock.kind==='exploration')) assert(!state.known.has(r.recipe_id));
startJob(recipeForItem('tool_repair_hammer'));assert.equal(state.job,null,'Unlearned production must be blocked');

// Observation requires a real sample, keeps it, and grants knowledge only on completion.
reset();const hammer='tool_repair_hammer';const hammerAction=researchAction(evidenceFor(hammer,'S'));
startJob(hammerAction);tick();assert.equal(owned(hammer),1);assert(!state.known.has(recipeForItem(hammer).recipe_id));
state.inventory[hammer]=0;tick();assert(state.job.paused,'Lost observation sample must pause research');
state.inventory[hammer]=1;state.job.paused=false;finish();assert.equal(owned(hammer),1);assert(state.known.has(recipeForItem(hammer).recipe_id));
const xp=state.xp;startJob(hammerAction);assert.equal(state.job,null);assert.equal(state.xp,xp,'Repeated research cannot award XP');
for(const skill of Object.keys(state.skills))state.skills[skill]=0;
syncKnowledge();assert(state.known.has(recipeForItem(hammer).recipe_id),'Knowledge survives skill loss');

// Destructive sampling is paid once, and pause/cancel cannot unlock an unfinished recipe.
reset('research');assert.equal(data.recipes.filter(r=>state.known.has(r.recipe_id)).length,22);
const bamboo='tool_flask_bamboo_water';startJob(researchAction(evidenceFor(bamboo,'M')));tick();
assert.equal(owned(bamboo),0);assert(!state.known.has(recipeForItem(bamboo).recipe_id));
state.job.paused=true;const pausedTicks=state.ticks;tick();assert.equal(state.ticks,pausedTicks);
state.job.paused=false;finish();assert.equal(owned(bamboo),0);assert(state.known.has(recipeForItem(bamboo).recipe_id));
assert.equal(state.skills.life_manufacturing,1,'Research does not require a higher manufacturing level');
reset('research');startJob(researchAction(evidenceFor(bamboo,'M')));tick();settleJob(true);
assert(!state.known.has(recipeForItem(bamboo).recipe_id));assert.equal(owned(bamboo),0);

// Complete records work without the product; partial frog evidence must not grant a full plan.
reset();startJob(researchAction(evidenceFor('tool_repair_pliers','record')));finish();
assert(state.known.has(recipeForItem('tool_repair_pliers').recipe_id));assert.equal(owned('tool_repair_pliers'),0);
reset('research');state.inventory.fishing_lure_frog=1;
assert(!evidenceFor('fishing_lure_frog','M'));
assert.equal(researchAction({id:'invented',item:'fishing_lure_frog',type:'M'}),null);
startJob(researchAction(evidenceFor('fishing_lure_frog','record')));finish();assert(state.known.has(recipeForItem('fishing_lure_frog').recipe_id));

// Every research target is reachable through evidence in the review fixture, never via level.
reset('research');for(const r of data.recipes.filter(r=>r.unlock.kind==='exploration'))assert(researchEvidence().some(e=>e.item===r.item_id),r.item_id);
const soil='soil_amend_black';startJob(researchAction(evidenceFor(soil,'M')));finish();
assert(state.known.has(recipeForItem(soil).recipe_id));assert.equal(state.skills.life_planting,1);
assert(!state.known.has(recipeForItem('soil_amend_red').recipe_id),'Soil research is scoped per recipe');
reset();state.evidence=[];state.inventory.tool_repair_hammer=0;state.inventory.fishing_reel_basic=0;
assert.equal(researchEvidence().length,0,'No future directory without evidence');
reset('advanced');assert.equal(state.known.size,65,'Explicit full-recipe review fixture still works');
`,context);

for(const [model,r] of Object.entries(CRAFT_RECIPES)){
  const actual=data.recipes.find(x=>x.recipe_id===r.id);
  assert.equal(r.unlock,'research');assert.equal(r.level,undefined);
  assert.equal(actual.unlock.kind,'exploration');
  assert.equal(r.benchLevel,actual.workbench_level_min);
  assert.deepEqual(r.costs,Object.fromEntries(actual.inputs.map(x=>[x.item_id,x.count])));
  const s=initialState();s.flask=null;s.plannedCraft=model;s.workshop.manufacturingLevel=1;
  assert.equal(craftReason(s),'','Previously learned flask remains craftable at level 1');
  s.workshop.recipeKnown=false;assert(craftReason(s),'Unknown recipe must remain blocked');
}
console.log('PASS: 22 level-1 products, 41 research products; progression, evidence, consumption, pause/cancel, knowledge persistence and flask parity.');

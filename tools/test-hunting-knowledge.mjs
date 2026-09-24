import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync('data/hunting.json','utf8'));
const ctx=vm.createContext({});for(const f of ['hunting-knowledge','hunting'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx);
const H=ctx.Hunting;let time=0,stamina=100,experience=0,location='a',alive=true,bag=10;const rewards=[];
H.configure(config,{now:()=>time,canStart:()=>alive,canContinue:k=>alive&&k===location,stamina:()=>stamina,canSpend:()=>true,count:()=>bag,
 consume:()=>{bag--;return true;},spend:n=>stamina-=n,tick:()=>time++,grant:r=>rewards.push(r),makeJuvenile:s=>({species:s}),addProficiency:n=>experience+=n,level:()=>100,changed:()=>{}});
function seed(n){const s=H.getState();s.points[location].seed=n;assert(H.setState(s));}
function begin(site='a',event='rabbit'){
 location=site;alive=true;stamina=100;const s=H.getState();s.active=null;s.points[site]={seed:1,event,readyAt:0,oldRope:true};assert(H.setState(s));assert(H.start(site,[event]).ok);
 const a=H.getState();delete a.active.variant;H.setState(a);if(event!=='rabbit')H.act('meat');
}
function act(id){const r=H.act(id);assert(r.ok,id+': '+r.reason);}
function escaped(){seed(1800);act('hands');assert.equal(H.getState().active.phase,'survey');}
begin();assert(!H.knows('animal_regular_path'),'high skill never grants knowledge');assert.equal(H.reason('observe'),'knowledge');assert(!H.visible('snare'));
const before=experience;H.act('snare');assert.equal(experience,before);seed(1800);act('look');assert.equal(experience,before+1);assert.equal(H.reason('look'),'done');
escaped();assert.equal(experience,before+2);const cooldown=H.getState().points.a.readyAt;
seed(1);act('inspect_gap');assert.equal(H.getState().active.flags.rope_found,true);assert.equal(experience,before+5);
act('inspect_rope');act('probe_rope');assert(H.knows('snare_tightening'));assert(!H.knows('snare_anchor'));
seed(1);act('practice_knot');assert.equal(bag,9);assert(!H.visible('snare'));assert.equal(H.reason('practice_knot'),'done');
const saved=H.getState(),xp=experience;assert(H.setState(saved));assert.equal(experience,xp);assert.equal(H.reason('inspect_gap'),'done');assert.equal(H.getState().points.a.readyAt,cooldown);
act('close');begin('a');escaped();seed(1);act('inspect_gap');act('inspect_rope');act('probe_rope');seed(1);act('practice_knot');
assert(H.knows('snare_anchor'));assert(H.visible('snare'));assert(!H.knows('animal_regular_path'),'one site never proves general route recognition');
act('close');begin('b');escaped();seed(1);act('inspect_gap');assert(H.knows('animal_regular_path'));assert(H.visible('observe'));
act('close');begin('b');seed(1);act('observe');const x=experience;act('snare');assert.equal(experience,x+1,'placing a trap is deterministic practice');seed(1);act('rest');act('rest');assert.equal(experience,x+4,'trap resolution awards once, rest itself never awards');
assert.equal(H.getState().active.phase,'processing');assert(!H.visible('process_bone'));act('inspect_carcass');assert.equal(H.reason('inspect_carcass'),'done');act('leave');
// Rest cannot fabricate an eyewitness escape; rejected and interrupted actions cannot grant discoveries.
begin('c');const e=experience;for(let i=0;i<4;i++)act('rest');assert.equal(experience,e);assert.equal(H.reason('inspect_gap'),'phase');act('close');
begin('c');stamina=0;assert.equal(H.act('look').reason,'stamina');assert.equal(experience,e);stamina=100;location='elsewhere';assert.equal(H.act('look').reason,'interrupted');
const bad=H.getState();bad.knowledge.snare_anchor.counts.anchor_tested=-1;assert(!H.setState(bad));
// Evidence payload is bounded and repeated facts from one hunt never advance it.
const K=ctx.HuntingKnowledge, records={};for(let i=0;i<30;i++)K.record(records,config.learning.knowledge,'anchor_tested',1,'a');assert.equal(records.snare_anchor.counts.anchor_tested,1);
K.record(records,config.learning.knowledge,'anchor_tested',2,'a');assert(K.knows(records,'snare_anchor'));
console.log('PASS: novice gates, slow cross-hunt/site evidence, rope learning, skill XP, trap resolution, cooldown, save dedupe and invalid data.');

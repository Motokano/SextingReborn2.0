import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c=JSON.parse(read('data/fishing-feedback.json'));
const context=vm.createContext({});vm.runInContext(read('js/fishing-feedback.js'),context);
vm.runInContext('Math.random=function(){throw new Error("must not use gameplay RNG")}',context);
const F=context.FishingFeedback,s=F.create(c),plain=x=>JSON.parse(JSON.stringify(x));
const facts=JSON.parse(read('data/fishing-facts.json'));
for(const [id,fact] of Object.entries(facts.facts)){
  const groups=Object.entries(c.groups).filter(([,g])=>g.requires.includes(id)).map(([key])=>key);
  assert.ok(groups.length,'missing text coverage: '+id);
  assert.deepEqual([...fact.groups].sort(),groups.sort(),'fact/text index drift: '+id);
}
for(const [id,group] of Object.entries(c.groups)){
  for(const f of group.requires){assert.ok(facts.facts[f],'unregistered fact: '+f);assert.ok(facts.facts[f].channels.includes(group.channel),'unreachable text channel: '+id+'/'+f);}
  assert.equal(new Set(group.variants.map(v=>v.text)).size,group.variants.length,'duplicate wording: '+id);
  for(const v of group.variants){
    assert.ok(!/\d+\s*(米|磅|%)/.test(v.text),'unmeasured quantity: '+v.id);
    for(const term of v.text.matchAll(/\{([a-z_]+)\}/g))assert.equal(term[1],'float','unknown perception term');
  }
}
let count=0;
for(const [group,spec] of Object.entries(c.groups)){
  const input={eventId:'cast1:'+group,group,facts:spec.requires,channels:[spec.channel],terms:{float:'线上的浮物'}};
  const before=plain(s.getState());
  assert.equal(s.select({...input,channels:[]}),null);
  for(const missing of spec.requires)assert.equal(s.select({...input,facts:spec.requires.filter(x=>x!==missing)}),null);
  assert.deepEqual(plain(s.getState()),before,'hidden facts must not consume text history');
  const first=s.select(input);assert.ok(first.text);assert.equal(first.text.includes('{'),false);
  const after=plain(s.getState());assert.equal(s.select(input).text,first.text);assert.deepEqual(plain(s.getState()),after);
  const resumed=F.create(c,after);assert.equal(resumed.select(input).text,first.text);
  const selected=[];
  for(let i=0;i<12;i++){const r=s.select({...input,eventId:'cast'+(i+2)+':'+group});assert.equal(selected.slice(-c.selection.recent_per_group).includes(r.variant),false);selected.push(r.variant);}
  count+=spec.variants.length;
}
assert.ok(s.getState().events.length<=c.selection.remembered_events);
const bad=structuredClone(c);bad.groups.bait_present.variants[0].id=bad.groups.bait_absent.variants[0].id;assert.throws(()=>F.validate(bad));
const empty=F.create(c),input={eventId:'missing-term',group:'float_still',facts:c.groups.float_still.requires,channels:['visual']};
assert.throws(()=>empty.select(input));assert.equal(empty.getState().events.length,0);
console.log(`[fishing-feedback] PASS: ${Object.keys(c.groups).length} groups, ${count} variants; perception gates, recent avoidance, replay, save continuity, bounded history, no random calls`);

const composed=F.create(c),event={id:'compose-1',facts:['retrieve_completed','terminal_inspected','hook_present','leader_present','hook_inspected','bait_absent','no_visible_attachment'],channels:['inspection','touch']};
const summary=composed.compose([event],{}),chosen=composed.getState().events.map(e=>JSON.parse(e.key)[1]);
assert.ok(chosen.includes('hook_line_present'));assert.ok(chosen.includes('bait_absent'));assert.ok(!chosen.includes('hook_seen'));assert.ok(!chosen.includes('leader_seen'));assert.ok(!chosen.includes('retrieved'));
assert.equal(composed.compose([event],{}),summary);assert.equal(F.create(c,composed.getState()).compose([event],{}),summary);
console.log('[fishing-feedback] dispatch PASS: compound precedence, complementary evidence, replay');

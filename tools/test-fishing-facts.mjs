import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c=JSON.parse(read('data/fishing-facts.json')),texts=JSON.parse(read('data/fishing-feedback.json'));
const ctx=vm.createContext({});vm.runInContext(read('js/fishing-facts.js'),ctx);vm.runInContext(read('js/fishing-feedback.js'),ctx);
const F=ctx.FishingFacts,T=ctx.FishingFeedback,plain=x=>JSON.parse(JSON.stringify(x));
const ledger=F.create(c),selector=T.create(texts);
for(const [id,group] of Object.entries(texts.groups)){
  for(const fact of group.requires)assert.ok(c.facts[fact],`${id}: missing ${fact}`);
  const e={source:'inspect',tick:1,water:'pond-2',point:'unrelated-point',actual:group.requires,channels:[group.channel]};
  const visible=ledger.record(e);assert.equal('actual' in visible,false);
  const result=selector.select({eventId:visible.id,group:id,facts:visible.facts,channels:visible.channels,terms:{float:'线上的浮物'}});assert.ok(result);
  const hidden=ledger.record({...e,channels:[]});assert.equal(hidden.facts.length,0);
  assert.equal(selector.select({eventId:hidden.id,group:id,facts:hidden.facts,channels:hidden.channels}),null);
}
const saved=plain(ledger.getState()),resumed=F.create(c,saved);assert.deepEqual(plain(resumed.getPublicState()),plain(ledger.getPublicState()));
assert.ok(saved.events.length<=c.history_limit);
for(const pair of c.exclusive)assert.throws(()=>resumed.record({source:'inspect',tick:2,water:'pond-3',point:'x',actual:pair,channels:['inspection','visual']}));
assert.deepEqual(plain(resumed.getState()),saved,'invalid events must be atomic');
const next=resumed.record({source:'inspect',tick:3,water:'pond-3',point:'x',actual:['hook_present'],channels:[]});assert.ok(next.id.startsWith('pond-3:'));
assert.equal(next.facts.length,0);assert.deepEqual(plain(F.create(c,resumed.getState()).getPublicState()).at(-1),plain(next));
const bad=structuredClone(saved);bad.events[0].perceived.push('unknown_fact');assert.throws(()=>F.create(c,bad));
const malformed=structuredClone(c);malformed.strike_profiles.miss.push('unknown_fact');assert.throws(()=>F.validateConfig(malformed));
console.log(`[fishing-facts] PASS: ${Object.keys(c.facts).length} registered facts, all ${Object.keys(texts.groups).length} text groups covered; perception, contradictions, saves, multi-water IDs, bounded history`);

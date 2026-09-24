import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cfg = JSON.parse(fs.readFileSync('data/hunting.json','utf8'));
const items = JSON.parse(fs.readFileSync('data/items.json','utf8'));
function setup(event='rabbit') {
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('js/hunting.js','utf8'),ctx);
 const H=ctx.Hunting;let time=0,stamina=100,alive=true,at='p',ticks=[],rewards=[];
 const bag={'consumable_hunting_net':3,'consumable_hunting_snare':2,'consumable_hunting_bait':2,'consumable_javelin_stone':2};
 H.configure(cfg,{now:()=>time,canStart:k=>alive&&at===k,canContinue:k=>alive&&at===k,stamina:()=>stamina,canSpend:()=>alive,count:id=>bag[id]||0,
 consume:(id,n)=>{if((bag[id]||0)<n)return false;bag[id]-=n;return true;},spend:n=>stamina-=n,
 tick:rest=>{time++;ticks.push(rest);if(rest)stamina=Math.min(100,stamina+2);},grant:i=>rewards.push(i),makeJuvenile:species=>({species,gender:'female',perks:[]}),changed:()=>{}});
 assert(H.start('p',[event]).ok);
 const baseline=H.getState();delete baseline.active.variant;H.setState(baseline);
 return {H,bag,ticks,rewards,get stamina(){return stamina;},get time(){return time;},set stamina(n){stamina=n;},set time(n){time=n;},set alive(x){alive=x;},set at(x){at=x;}};
}
function seed(e,value) {const s=e.H.getState();s.points.p.seed=value;assert(e.H.setState(s));}
// Observation can fail, costs time/stamina, preserves the hidden position and is retryable.
{
 const e=setup(), shelter=JSON.stringify(e.H.getState().active.shelter);
 assert.equal(e.H.chance('observe'),.5);seed(e,1800);
 e.H.act('observe');assert.equal(e.time,2);assert.equal(e.stamina,92);
 assert.equal(e.H.getState().active.flags.observe,undefined);
 assert.equal(e.H.getState().active.last,'hunting.observe_failed');
 assert.equal(e.H.reason('block'),'observe');assert.equal(e.H.reason('snare'),'observe');
 const saved=e.H.getState();e.H.setState(saved);e.H.act('observe');const result=JSON.stringify(e.H.getState());
 e.H.setState(saved);e.H.act('observe');assert.equal(JSON.stringify(e.H.getState()),result,'reload preserves the next observation result');
 seed(e,1);e.H.act('observe');assert.equal(e.H.getState().active.flags.observe,true);
 assert.equal(e.H.reason('block'),null);assert.equal(e.H.reason('observe'),'done');
 assert.equal(JSON.stringify(e.H.getState().active.shelter),shelter);
}
{
 const e=setup();for(let i=0;i<4;i++){seed(e,1800);e.H.act('observe');}
 assert.equal(e.time,8);assert.equal(e.H.getState().active.phase,'ended');assert.equal(e.rewards.length,0);
}
{
 const e=setup(), positions=new Set();
 for(const seedValue of [1,300,900,1800]) {
  e.H.setState({version:1,points:{p:{seed:seedValue,event:'rabbit',readyAt:0}},active:null,successes:0});
  e.H.start('p',['rabbit']);positions.add(JSON.stringify(e.H.getState().active.shelter));
 }
 assert.equal(positions.size,4,'new hunts can select different shelter locations');
 const legacy=e.H.getState();delete legacy.active.shelter;
 e.H.setState(legacy);const upgraded=JSON.stringify(e.H.getState());e.H.setState(legacy);assert.equal(JSON.stringify(e.H.getState()),upgraded);
}
// A blocked preparation is atomic: no item, stamina, tick or state change.
{
 const e=setup();e.stamina=2;const before=JSON.stringify(e.H.getState());assert.equal(e.H.act('net').reason,'stamina');assert.equal(e.bag.consumable_hunting_net,3);assert.equal(e.time,0);assert.equal(JSON.stringify(e.H.getState()),before);
 e.stamina=100;delete e.bag.consumable_hunting_net;assert.equal(e.H.act('net').reason,'item');assert.equal(e.time,0);
 assert.equal(e.H.act('snare').reason,'observe');assert.equal(e.H.act('juvenile').reason,'phase');
}
// Preparations persist and cannot be repeated; failed net costs one and allows exactly one retry.
{
 const e=setup();seed(e,1);assert(e.H.act('observe').ok);assert(e.H.act('block').ok);assert(e.H.act('bait').ok);
 assert.equal(e.H.act('observe').reason,'done');assert(Math.abs(e.H.chance('net')-.75)<1e-9);
 seed(e,1800); // first roll ~0.934, deliberately fails a fully prepared capture
 assert(e.H.act('net').ok);assert.equal(e.H.getState().active.phase,'retry');assert.equal(e.bag.consumable_hunting_net,2);
 seed(e,1800);e.H.act('retry_net');assert.equal(e.H.getState().active.phase,'ended');assert.equal(e.rewards.length,0);assert.equal(e.bag.consumable_hunting_net,1);
 assert.equal(e.H.act('retry_net').reason,'ended');const ready=e.H.getState().points.p.readyAt;e.H.act('close');assert.equal(e.H.start('p',['rabbit']).reason,'cooldown');e.time=ready;assert(e.H.start('p',['rabbit']).ok);
}
// Traps resolve once while resting; bait extends the deadline; save/reload retains waiting and RNG.
{
 const e=setup();seed(e,1);e.H.act('observe');e.H.act('snare');seed(e,1);
 e.H.act('rest');const saved=e.H.getState();assert.equal(saved.active.waitRemaining,2);assert(e.H.setState(saved));
 e.H.act('rest');assert.equal(e.rewards.length,1);assert.equal(e.rewards[0].item_id,'hunt_meat_rabbit');assert.equal(e.bag.consumable_hunting_snare,1);assert.equal(e.ticks.filter(Boolean).length,4);
 e.H.setState(e.H.getState());assert.equal(e.rewards.length,1);assert.equal(e.H.getState().active.phase,'processing');
 e.H.act('leave');assert.equal(e.H.act('rest').reason,'ended');
}
{
 const e=setup();e.H.act('bait');e.H.act('rest');e.H.act('rest');e.H.act('rest');e.H.act('rest');assert.equal(e.H.getState().active.phase,'prepare');e.H.act('rest');e.H.act('rest');assert.equal(e.H.getState().active.phase,'ended');
}
// A juvenile is an exclusive, persistent individual. Lethal tools are rejected before cost.
for (const event of ['pig_calf','cattle_calf','sheep_calf','chicken_calf']) {
 const e=setup(event);e.H.act('juvenile');assert.equal(e.H.act('javelin').reason,'live');assert.equal(e.bag.consumable_javelin_stone,2);if(event!=='rabbit')e.H.act('bait');seed(e,1);e.H.act('net');
 assert.equal(e.rewards.length,1);assert.equal(e.rewards[0].count,1);assert.equal(e.rewards[0].hunting_juvenile.species,cfg.events[event].species);assert.equal(e.rewards[0].item_id,cfg.events[event].juvenile_item);
}
for(const [event,quantity] of Object.entries({rabbit:3,pig_calf:5,cattle_calf:8,sheep_calf:4,chicken_calf:3})) {
 const e=setup(event);if(event!=='rabbit')e.H.act('meat');seed(e,1);e.H.act('net');
 assert.equal(e.rewards.length,1);assert.equal(e.rewards[0].count,quantity);
 e.H.setState(e.H.getState());assert.equal(e.rewards.length,1,'reload cannot duplicate a multi-item reward');
}
// Processing is deterministic, paid once, and delays cooldown until departure/completion.
{
 const e=setup('pig_calf');e.H.act('meat');seed(e,1);e.H.act('net');
 assert.equal(e.H.getState().active.phase,'processing');assert.equal(e.H.getState().points.p.readyAt,0);
 assert.equal(e.H.reason('net'),'phase');assert.equal(e.H.reason('process_blood'),'item');
 const before=e.time;e.H.act('process_blood');assert.equal(e.time,before);
 e.bag.consumable_hunting_blood_kit=2;e.bag.consumable_hunting_skin_kit=1;
 seed(e,1800);const rng=e.H.getState().points.p.seed;
 const stamina=e.stamina;assert(e.H.act('process_blood').ok);
 assert.equal(e.time,before+1);assert.equal(e.stamina,stamina-4);
 assert.equal(e.rewards.at(-1).item_id,'hus_pork_blood');assert.equal(e.bag.consumable_hunting_blood_kit,1);
 assert.equal(e.H.getState().points.p.seed,rng,'processing never rolls for success');
 const saved=e.H.getState();e.H.setState(saved);assert.equal(e.H.reason('process_blood'),'done');
 const rewardCount=e.rewards.length;e.H.act('process_blood');assert.equal(e.rewards.length,rewardCount);
 e.stamina=1;assert.equal(e.H.reason('process_skin'),'stamina');assert.equal(e.bag.consumable_hunting_skin_kit,1);
 for(let i=0;i<5;i++)e.H.act('rest');assert.equal(e.H.getState().active.phase,'processing','rest never loses a caught animal');
 e.stamina=100;e.H.act('process_skin');e.H.act('process_bone');e.H.act('process_special');
 assert.equal(e.H.getState().active.phase,'ended');assert.equal(e.H.getState().points.p.readyAt,e.time+cfg.cooldown_ticks);
 assert.equal(e.rewards.length,5);assert.equal(e.H.getState().active.extraRewards.length,4);
}
{
 const e=setup();seed(e,1);e.H.act('net');e.H.act('leave');
 assert.equal(e.rewards.length,1);assert.equal(e.H.getState().points.p.readyAt,e.time+cfg.cooldown_ticks);
 const live=setup('pig_calf');live.H.act('juvenile');live.H.act('bait');seed(live,1);live.H.act('net');
 assert.equal(live.H.getState().active.phase,'ended');assert.equal(live.H.reason('process_blood'),'ended');
}
// Boars counterattack once; shelter allows one retry, never an infinite capture loop.
{
 const e=setup('pig_calf');e.H.act('meat');seed(e,1);e.H.act('observe');seed(e,1800);e.H.act('net');
 assert.equal(e.H.getState().active.phase,'charge');assert.equal(e.H.reason('rest'),'charge');assert.equal(e.H.reason('net'),'charge');
 assert.equal(e.H.getState().points.p.readyAt,0);const saved=e.H.getState();assert(e.H.setState(saved));
 const cost=e.stamina,time=e.time;e.H.act('hide');assert.equal(e.stamina,cost-8);assert.equal(e.time,time+1);
 assert.equal(e.H.getState().active.phase,'retry');assert.equal(e.H.reason('hide'),'phase');
 seed(e,1800);e.H.act('retry_net');assert.equal(e.H.getState().active.last,'hunting.result.driven_off');
 assert.equal(e.stamina,cost-8-10-18);assert.equal(e.rewards.length,0);assert.equal(e.H.getState().points.p.readyAt,e.time+cfg.cooldown_ticks);
}
{
 const e=setup('pig_calf');e.H.act('juvenile');assert.equal(e.H.reason('net'),'mother');assert.equal(e.time,0);
 e.H.act('bait');assert.equal(e.bag.consumable_hunting_bait,1);seed(e,1800);e.H.act('net');
 assert.equal(e.H.getState().active.phase,'charge');assert.equal(e.H.reason('counter'),'live');assert.equal(e.H.reason('hide'),'observe');
 e.stamina=1;assert(e.H.act('retreat').ok);assert.equal(e.stamina,0);assert.equal(e.H.getState().active.last,'hunting.result.retreated');
 assert.equal(e.rewards.length,0);
}
{
 const e=setup('pig_calf');e.H.act('meat');seed(e,1800);e.H.act('net');
 const n=e.bag.consumable_javelin_stone;seed(e,1);e.H.act('counter');
 assert.equal(e.H.getState().active.phase,'processing');assert.equal(e.bag.consumable_javelin_stone,n-1);
 assert.equal(e.rewards.length,1);assert.equal(e.rewards[0].count,5);
}
{
 const e=setup('pig_calf');e.H.act('meat');seed(e,1800);e.H.act('net');
 const time=e.time,stamina=e.stamina;e.H.act('abandon');assert.equal(e.time,time+1);assert.equal(e.stamina,stamina-6);
 assert.equal(e.H.getState().active.last,'hunting.result.retreated','abandon cannot bypass the reaction cost');
 const rabbit=setup();const s=rabbit.H.getState();s.active.phase='charge';s.active.flags.charged=true;assert(!rabbit.H.setState(s));
}
// Adult birds take flight once. Ground actions are blocked; landing is paid, random and saved.
{
 const e=setup('chicken_calf');e.H.act('meat');seed(e,1);e.H.act('observe');seed(e,1800);e.H.act('net');
 assert.equal(e.H.getState().active.phase,'airborne');assert.equal(e.H.reason('rest'),'airborne');assert.equal(e.H.reason('snare'),'airborne');
 assert.equal(e.H.chance('air_javelin'),.25);assert.equal(e.H.chance('wait_land'),.45);
 seed(e,1);const saved=e.H.getState(),sta=e.stamina,time=e.time;assert(e.H.setState(saved));e.H.act('wait_land');
 assert.equal(e.stamina,sta-4);assert.equal(e.time,time+2);assert.equal(e.H.getState().active.phase,'retry');
 const result=JSON.stringify(e.H.getState());e.H.setState(saved);e.H.act('wait_land');assert.equal(JSON.stringify(e.H.getState()),result);
 assert.equal(e.H.reason('wait_land'),'phase');seed(e,1800);e.H.act('retry_net');
 assert.equal(e.H.getState().active.last,'hunting.result.escaped');assert.equal(e.rewards.length,0);
 assert.equal(e.H.getState().points.p.readyAt,e.time+cfg.cooldown_ticks);
}
{
 const e=setup('chicken_calf');e.H.act('meat');seed(e,1800);e.H.act('hands');
 assert.equal(e.H.reason('wait_land'),'landing');delete e.bag.consumable_javelin_stone;
 const time=e.time;assert.equal(e.H.act('air_javelin').reason,'item');assert.equal(e.time,time);
 e.bag.consumable_javelin_stone=1;seed(e,1);e.H.act('air_javelin');
 assert.equal(e.bag.consumable_javelin_stone,0);assert.equal(e.rewards[0].count,3);assert.equal(e.H.getState().active.phase,'processing');
}
{
 const e=setup('chicken_calf');e.H.act('meat');seed(e,1);e.H.act('observe');seed(e,1800);e.H.act('hands');seed(e,1800);e.H.act('wait_land');
 assert.equal(e.H.getState().active.last,'hunting.result.escaped');assert.equal(e.rewards.length,0);
 const chick=setup('chicken_calf');chick.H.act('juvenile');assert.equal(chick.H.act('net').reason,'hen');assert.equal(chick.time,0);
 chick.H.act('bait');seed(chick,1800);chick.H.act('net');assert.equal(chick.H.getState().active.last,'hunting.result.chicks_hidden');
 assert.equal(chick.rewards.length,0);assert.equal(chick.H.reason('air_javelin'),'ended');
 const rabbit=setup();const s=rabbit.H.getState();s.active.phase='airborne';s.active.flags.flushed=true;assert(!rabbit.H.setState(s));
}
// Herd preparation pays for a reserve snare, rather than starting the ordinary trap wait.
{
 const e=setup('sheep_calf');e.H.act('meat');assert(Math.abs(e.H.chance('net')-.35)<1e-9);
 assert.equal(e.H.reason('set_intercept'),'passage');assert.equal(e.H.reason('snare'),'phase');
 seed(e,1);e.H.act('observe');e.H.act('bait');assert(Math.abs(e.H.chance('net')-.75)<1e-9);
 const time=e.time,sta=e.stamina;e.H.act('set_intercept');assert.equal(e.time,time+1);assert.equal(e.stamina,sta-6);
 assert.equal(e.bag.consumable_hunting_snare,1);assert.equal(e.H.getState().active.phase,'prepare');assert.equal(e.H.reason('set_intercept'),'done');
 seed(e,1800);e.H.act('net');assert.equal(e.H.getState().active.phase,'herd_alert');
 assert.equal(e.H.reason('rest'),'herd_alert');assert.equal(e.H.reason('net'),'herd_alert');assert.equal(e.H.chance('intercept'),.45);
 seed(e,1);const saved=e.H.getState();assert(e.H.setState(saved));e.H.act('intercept');
 assert.equal(e.rewards.length,1);assert.equal(e.rewards[0].count,4);assert.equal(e.H.getState().active.phase,'processing');
 assert.equal(e.bag.consumable_hunting_snare,1,'interception does not charge for a second snare');assert.equal(e.H.reason('intercept'),'phase');
 e.H.setState(e.H.getState());assert.equal(e.rewards.length,1);
}
{
 const e=setup('sheep_calf');e.H.act('juvenile');assert.equal(e.H.act('net').reason,'separate');assert.equal(e.time,0);
 seed(e,1);e.H.act('observe');e.H.act('set_intercept');e.H.act('bait');seed(e,1800);e.H.act('net');
 const saved=e.H.getState();assert(e.H.setState(saved));seed(e,1800);e.H.act('intercept');
 assert.equal(e.H.getState().active.last,'hunting.result.herd_escaped');assert.equal(e.rewards.length,0);
 assert.equal(e.H.getState().points.p.readyAt,e.time+cfg.cooldown_ticks);
 const plain=setup('sheep_calf');plain.H.act('meat');seed(plain,1800);plain.H.act('hands');assert.equal(plain.H.getState().active.last,'hunting.result.herd_escaped');
 const r=setup();const invalid=r.H.getState();invalid.active.phase='herd_alert';invalid.active.flags.set_intercept=true;assert(!r.H.setState(invalid));
}
// Interruptions do not award or erase costs; malformed saves are refused without mutation.
{
 const e=setup();e.at='other';assert.equal(e.H.act('net').reason,'interrupted');assert(e.H.act('abandon').ok);assert.equal(e.rewards.length,0);
 const s=e.H.getState();s.active.phase='waiting';s.active.waitRemaining=-1;assert.equal(e.H.setState(s),false);
}
for(const e of Object.values(cfg.events)){assert(items[e.reward]);if(e.juvenile_item)assert.equal(items[e.juvenile_item].stack_limit,1);for(const p of Object.values(e.processing||{})){assert(items[p.reward]);if(p.item)assert(items[p.item]);}}
for(const a of Object.values(cfg.actions))if(a.item)assert(items[a.item]);
for(const k of cfg.kits){assert(items[k.output]);for(const r of k.inputs)assert(items[r.item]);}
for(const file of ['M0_Field_01','M0_Field_02']){
 const m=JSON.parse(fs.readFileSync('data/maps/'+file+'.json','utf8'));
 for(const p of m.entities.filter(e=>e.entity_id==='hunting_point')){assert(!m.blocks.some(b=>b.x===p.x&&b.y===p.y));for(const id of p.hunting_events)assert(cfg.events[id]);}
}
console.log('PASS: hunting costs, failure/retry, rest/traps, cooldown, persistence, four juvenile species and content references.');

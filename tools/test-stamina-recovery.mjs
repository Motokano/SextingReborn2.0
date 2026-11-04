import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const config=JSON.parse(read('data/survival-config.json'));
function world(production=false){const c=vm.createContext({console});c.window=c;c.globalThis=c;for(const f of ['food-metabolism','game-time','survival'])vm.runInContext(read('js/'+f+'.js'),c);c.Survival.setConfig(production?config:{...config,food_model:null,satiety_tick_decay:0,thirst_tick_decay_interval:0,stamina_passive_drain_per_tick:0});c.Survival.setState({stamina:50,satiety:80,thirst:80});return c;}
for(const mode of ['rest','meditate','explicit']){const c=world(),S=c.Survival;S.setState({fatigue:60});if(mode==='rest')S.setResting(true);else if(mode==='meditate')S.setSitMeditationActive(true);else S.setStaminaRegenActionActive(true);S.advanceTick();let st=S.getState();assert.equal(st.stamina,52,mode);assert.equal(st.satiety,79,mode);assert.equal(st.thirst,79,mode);assert.equal(st.fatigue,60,mode+' preserves fatigue');}
let c=world(),S=c.Survival;S.setResting(true);S.setSitMeditationActive(true);S.advanceTick();assert.equal(S.getState().stamina,52,'overlapping modes only once');
S.setState({stamina:99,satiety:80,thirst:80});S.advanceTick();assert.equal(S.getState().stamina,100);assert.equal(S.getState().satiety,79.5);assert.equal(S.getState().thirst,79.5);S.advanceTick();assert.equal(S.getState().satiety,79.5,'full recovery has no charge');assert.equal(S.getState().isResting,true,'full stamina does not end sleep/rest');
for(const poor of [{satiety:0,thirst:80},{satiety:80,thirst:0}]){S.setState({...poor,stamina:50});S.advanceTick();assert.equal(S.getState().stamina,50);assert.equal(S.getState().satiety,poor.satiety);assert.equal(S.getState().thirst,poor.thirst);}
c=world();S=c.Survival;S.advanceTick();assert.equal(S.getState().stamina,50,'ordinary actions do not generate free stamina');
// Real food model remains active; recovery charges are in addition to the same baseline metabolism.
const resting=world(true),baseline=world(true);resting.Survival.setResting(true);baseline.Survival.setResting(true);baseline.Survival.setState({stamina:100});resting.Survival.advanceTick();baseline.Survival.advanceTick();assert.equal(baseline.Survival.getState().satiety-resting.Survival.getState().satiety,1);assert.equal(baseline.Survival.getState().thirst-resting.Survival.getState().thirst,1);
// Resource arithmetic is independent of wall time; runtime tests cover the real timed bed action.
function bed(production=true) {
 const c=world(production);
 c.runSleepTicks=()=>{for(let i=0;i<c.Survival.getConfigValue('sleep_duration_ticks',48);i++)c.Survival.advanceTick({source:'sleep'});};
 return c;
}
for(const production of [false,true])for(const initial of [{stamina:4,fatigue:100},{stamina:100,fatigue:60}]){
 c=bed(production);S=c.Survival;S.setState({...initial,satiety:100,thirst:100});
 const before=c.GameTime.getState().totalTicks;c.runSleepTicks();
 assert.equal(c.GameTime.getState().totalTicks-before,48);const st=S.getState();
 assert.equal(st.stamina,100);assert.equal(st.fatigue,Math.max(0,initial.fatigue-96));
 assert.equal(st.satiety,52,'48 fixed food charges even after fully recovered');
 assert.equal(st.thirst,52,'48 fixed water charges without extra baseline drain');
 assert.equal(st.isResting,false);
}
// Sleeping must not also run the ordinary conversion, including overlapping recovery flags.
c=world(true);S=c.Survival;S.setState({satiety:100,thirst:100,stamina:99.5,fatigue:0.25,isResting:true,is_stamina_regen_action_active:true,is_sit_meditation_active:true});
S.advanceTick({source:'sleep'});assert.equal(S.getStamina(),100);assert.equal(S.getFatigue(),0);
assert.equal(S.getSatiety(),99);assert.equal(S.getThirst(),99);
// Exhausted supplies do not end the 48-tick sleep, but unfunded ticks grant no recovery.
for(const poor of [{satiety:5,thirst:100},{satiety:100,thirst:5}]){
 c=bed();S=c.Survival;S.setState({...poor,stamina:4,fatigue:100});const before=S.getState().tickCount;
 c.runSleepTicks();assert.equal(S.getState().tickCount-before,48);
 assert.equal(S.getStamina(),14);assert.equal(S.getFatigue(),90);
 assert.equal(S.getSatiety(),Math.max(0,poor.satiety-48));assert.equal(S.getThirst(),Math.max(0,poor.thirst-48));
}
c=world();S=c.Survival;S.setState({satiety:0.5,thirst:1,stamina:4,fatigue:100});S.advanceTick({source:'sleep'});
assert.equal(S.getSatiety(),0);assert.equal(S.getThirst(),0);assert.equal(S.getStamina(),4);assert.equal(S.getFatigue(),100);
// Sleep balance lives in configuration, not in a final unconditional fatigue reset.
c=bed();S=c.Survival;S.setConfig({...config,sleep_duration_ticks:3,sleep_satiety_cost_per_tick:2,sleep_thirst_cost_per_tick:2,sleep_stamina_gain_per_tick:3,sleep_fatigue_reduction_per_tick:4});
S.setState({satiety:100,thirst:100,stamina:10,fatigue:100});c.runSleepTicks();
assert.equal(S.getSatiety(),94);assert.equal(S.getThirst(),94);assert.equal(S.getStamina(),19);assert.equal(S.getFatigue(),88);
const skills=JSON.parse(read('data/combat-skills.json'));
const actions=(skills.common_diqi_actions||[]).concat(Object.values(skills.skills||{}).flatMap(s=>s.hub_actions||[]));
assert.ok(!actions.some(x=>x.id==='jin_shi'||x.hub_effect==='eat_recovery'));
console.log('[stamina-recovery] PASS: shared paid recovery, full/partial/empty reserves, no double charge, real food model, 48 paid sleep ticks');

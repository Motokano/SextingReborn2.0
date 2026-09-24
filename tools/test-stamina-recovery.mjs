import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const config=JSON.parse(read('data/survival-config.json'));
function world(production=false){const c=vm.createContext({console});c.window=c;c.globalThis=c;for(const f of ['food-metabolism','game-time','survival'])vm.runInContext(read('js/'+f+'.js'),c);c.Survival.setConfig(production?config:{...config,food_model:null,satiety_tick_decay:0,thirst_tick_decay_interval:0,stamina_passive_drain_per_tick:0});c.Survival.setState({stamina:50,satiety:80,thirst:80});return c;}
for(const mode of ['rest','meditate','explicit']){const c=world(),S=c.Survival;if(mode==='rest')S.setResting(true);else if(mode==='meditate')S.setSitMeditationActive(true);else S.setStaminaRegenActionActive(true);S.advanceTick();let st=S.getState();assert.equal(st.stamina,52,mode);assert.equal(st.satiety,79,mode);assert.equal(st.thirst,79,mode);}
let c=world(),S=c.Survival;S.setResting(true);S.setSitMeditationActive(true);S.advanceTick();assert.equal(S.getState().stamina,52,'overlapping modes only once');
S.setState({stamina:99,satiety:80,thirst:80});S.advanceTick();assert.equal(S.getState().stamina,100);assert.equal(S.getState().satiety,79.5);assert.equal(S.getState().thirst,79.5);S.advanceTick();assert.equal(S.getState().satiety,79.5,'full recovery has no charge');assert.equal(S.getState().isResting,true,'full stamina does not end sleep/rest');
for(const poor of [{satiety:0,thirst:80},{satiety:80,thirst:0}]){S.setState({...poor,stamina:50});S.advanceTick();assert.equal(S.getState().stamina,50);assert.equal(S.getState().satiety,poor.satiety);assert.equal(S.getState().thirst,poor.thirst);}
c=world();S=c.Survival;S.advanceTick();assert.equal(S.getState().stamina,50,'ordinary actions do not generate free stamina');
// Real food model remains active; recovery charges are in addition to the same baseline metabolism.
const resting=world(true),baseline=world(true);resting.Survival.setResting(true);baseline.Survival.setResting(true);baseline.Survival.setState({stamina:100});resting.Survival.advanceTick();baseline.Survival.advanceTick();assert.equal(baseline.Survival.getState().satiety-resting.Survival.getState().satiety,1);assert.equal(baseline.Survival.getState().thirst-resting.Survival.getState().thirst,1);
// Execute the actual bed action body with only UI/location collaborators stubbed.
const app=read('js/scene-app.js'),start=app.indexOf('    function executeBedSleepAction()'),end=app.indexOf('\n    function ',start+10);assert.ok(start>=0&&end>start);
c=world();c.StationContext={isOnBedStationTile:()=>true};c.hasBedSleepDebuff=()=>true;c.ui=x=>x;c.confirm=()=>true;c.showMsg=()=>{};c.settleSleepAttributeExpOnce=()=>({ok:true,any_success:false});vm.runInContext(app.slice(start,end),c);const before=c.GameTime.getState().totalTicks;assert.equal(c.executeBedSleepAction(),true);assert.equal(c.GameTime.getState().totalTicks-before,48);assert.equal(c.Survival.getState().stamina,100);assert.equal(c.Survival.getState().satiety,55);assert.equal(c.Survival.getState().thirst,55);assert.equal(c.Survival.getState().isResting,false);
const skills=JSON.parse(read('data/combat-skills.json'));
const actions=(skills.common_diqi_actions||[]).concat(Object.values(skills.skills||{}).flatMap(s=>s.hub_actions||[]));
assert.ok(!actions.some(x=>x.id==='jin_shi'||x.hub_effect==='eat_recovery'));
console.log('[stamina-recovery] PASS: shared paid recovery, full/partial/empty reserves, no double charge, real food model, actual 48-tick bed action');

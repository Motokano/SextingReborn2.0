import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const weatherConfig=JSON.parse(read('data/weather-config.json'));
const survivalConfig=JSON.parse(read('data/survival-config.json'));
const plain=x=>JSON.parse(JSON.stringify(x));
function world(map={map_id:'field'}) {
  const c=vm.createContext({console}); c.window=c;
  let current=map, growth=0; const notices=[];
  c.GameEngine={getMap:()=>current};
  c.InventoryEquipment={getSkillLevel:()=>0,incrementSkillMoveUsage:()=>growth++};
  for(const f of ['game-time','weather','survival']) vm.runInContext(read('js/'+f+'.js'),c);
  c.Weather.configure(weatherConfig); c.Weather.reset(123);
  c.Weather.subscribe(t=>notices.push(t));
  c.Survival.setConfig({...survivalConfig,food_model:null,satiety_tick_decay:0,thirst_tick_decay_interval:0,stamina_passive_drain_per_tick:0});
  c.Survival.setState({body_temperature:37,stamina:100,satiety:100,thirst:100,isDead:false});
  return {c,W:c.Weather,T:c.GameTime,S:c.Survival,notices,growth:()=>growth,setMap:m=>current=m};
}
let x=world(), {W,T,S}=x;
const start=plain(W.getState());
assert.deepEqual(plain(W.observe({map_id:'field'})),{map:'field',tick:54,weather:start.regions.jinmu.weather,label:weatherConfig.weather[start.regions.jinmu.weather].label,text:weatherConfig.weather[start.regions.jinmu.weather].text});
assert.equal('temperature' in W.observe({map_id:'field'}),false);
const timeBefore=T.getState().totalTicks; W.observe({map_id:'field'}); W.observe({map_id:'field'}); assert.equal(T.getState().totalTicks,timeBefore);
assert.equal(W.getEnvironment({map_id:'field'}).weather,W.getEnvironment({map_id:'town'}).weather);
T.advanceTicks(30);assert.equal(W.getEnvironment({map_id:'field'}).temperature,W.getEnvironment({map_id:'new-neighbor'}).temperature,'ordinary maps share temperature without map-entry lag');
T.reset({totalTicks:start.tick});W.restore(start,start.tick);T.advanceTicks(2000); const advanced=plain(W.getState());
T.reset({totalTicks:start.tick}); W.restore(start,start.tick); T.advanceTicks(2000);
// Register maps before comparison: querying introduces a map's independent temperature state.
const actual=plain(W.getState()); assert.deepEqual(actual.regions,advanced.regions,'seeded process identical after restore');
assert.ok(W.getHistory('jinmu').length>1);
const saved=plain(W.getState()); assert.equal(W.validate(saved,T.getState().totalTicks),true);
saved.regions.jinmu.temperature=NaN;assert.equal(W.validate(saved,T.getState().totalTicks),false);
T.reset({day:91});assert.equal(T.getState().season,'summer');
T.reset({day:181});assert.equal(T.getState().season,'autumn');
T.reset({day:271});assert.equal(T.getState().season,'winter');
T.reset({year:2,day:1});assert.equal(T.getState().season,'spring');
const hot={map_id:'furnace',environment:{temperature:50,weather:'none'}};
assert.equal(W.getEnvironment(hot).temperature,50); assert.equal(W.observe(hot),null);
assert.equal(W.matches({min_temperature:45},hot),true);
assert.equal(W.matches({tag:'rain'},hot),false);
W.setMapEffect('test',hot,{offset:-20,ticks:10});T.advanceTicks(1);
assert.ok(W.getEnvironment(hot).temperature<50&&W.getEnvironment(hot).temperature>30,'gradual event');
W.setMapEffect('test',hot,{offset:-20,immediate:true});assert.equal(W.getEnvironment(hot).temperature,30);
W.setMapEffect('test',hot,null);T.advanceTicks(1);assert.ok(W.getEnvironment(hot).temperature>30);

// Actual Survival tick uses effective temperature, not calendar/weather names.
x=world({map_id:'cold',environment:{temperature:-10,weather:'none'}});({W,T,S}=x);
S.advanceTick();assert.equal(S.getBodyTemperature(),36.94);assert.equal(x.growth(),1);
S.setTemperatureSource('coat',{cold_range:30});S.advanceTick();assert.equal(S.getBodyTemperature(),36.97);assert.equal(x.growth(),1,'full range coverage does not train');
S.setTemperatureSource('coat',null);S.setTemperatureSource('a',{cold_rate:0.5});S.setTemperatureSource('b',{cold_rate:0.5});
let before=S.getBodyTemperature();S.advanceTick();assert.ok(Math.abs(S.getBodyTemperature()-(before-0.015))<1e-8);
S.setTemperatureSource('immune',{cold_rate:0});let n=x.growth();S.advanceTick();assert.equal(x.growth(),n);
S.setTemperatureSource('immune',null);S.setTemperatureSource('heal',{recover:0.1});S.advanceTick();assert.equal(x.growth(),n+1,'recovery does not erase actual exposure');
const sourceSave=plain(S.getState());S.setState({temperature_sources:{}});S.setState(sourceSave);assert.deepEqual(plain(S.getState().temperature_sources),sourceSave.temperature_sources);

x=world({map_id:'neutral',environment:{temperature:22,weather:'none'}});({W,T,S}=x);
S.setState({body_temperature:35.8});S.advanceTick();assert.equal(S.getBodyTemperature(),35.83,'fractional recovery survives');
const bodyBefore=S.getBodyTemperature();x.setMap(hot);W.getEnvironment(hot);assert.equal(S.getBodyTemperature(),bodyBefore,'map switch preserves body');
S.setState({body_temperature:36.99});S.advanceTick();assert.ok(S.getBodyTemperature()>37,'hot environment can overshoot standard');
S.recoverBodyTemperature(100);assert.equal(S.getBodyTemperature(),37);
S.changeBodyTemperature(3);assert.equal(S.getTemperatureState().stage,3);
assert.equal(S.getActionStaminaCost(4),6);assert.equal(S.getActionStaminaCost(0),0);
S.setState({stamina:100,fatigue:0});S.consumeStamina(4);assert.equal(S.getStamina(),94);assert.equal(S.getFatigue(),0.6);
S.setState({body_temperature:34,stamina:100});assert.equal(S.getTemperatureSpeedMultiplier(),0.75);assert.equal(S.getActionStaminaCost(4),5);
S.recoverBodyTemperature(100);assert.equal(S.getTemperatureSpeedMultiplier(),1);assert.equal(S.getFatigue(),0.6);
S.setState({body_temperature:37,isResting:true,stamina:50});S.advanceTick();assert.equal(S.getState().isResting,true);assert.ok(S.getBodyTemperature()>37,'rest is not temperature protection');
S.setState({body_temperature:41.99});S.advanceTick();assert.equal(S.isDead(),true);assert.equal(S.getDeathReason(),'temperature_extreme_hot');
x=world({map_id:'ice',environment:{temperature:-30}});x.S.setState({body_temperature:31.01});x.S.advanceTick();assert.equal(x.S.getDeathReason(),'temperature_extreme_cold');
assert.ok(x.W.getState().regions);assert.equal(x.W.getState().enemies,undefined,'no enemy physiology');
x=world({map_id:'cold',environment:{temperature:-10}});x.S.setTemperatureSource('one-tick',{cold_rate:0,ticks:1});
x.S.advanceTick();assert.equal(x.S.getBodyTemperature(),37,'one-tick defense covers its first thermal settlement');
x.S.advanceTick();assert.ok(x.S.getBodyTemperature()<37,'one-tick defense expires');
x.S.setState({body_temperature:37});x.S.changeBodyTemperature(6);assert.equal(x.S.isDead(),true,'direct thermal effects check death immediately');

// Weather-only notices never interrupt the current activity or expose numerical facts.
x=world();x.S.setState({isResting:true});x.W.publishObservation();x.T.advanceTicks(1000);
assert.ok(x.notices.length>0);assert.equal(x.S.getState().isResting,true);assert.ok(x.notices.every(t=>!/[0-9℃]/.test(t)));
assert.equal(x.W.getHistory('jinmu').length<=weatherConfig.history_limit+1,true);
console.log('[weather] PASS: deterministic tick process, save/restore, seasons, overrides, gradual/instant effects, cognition, thermal bands, stacked defense, recovery, training, stamina/fatigue, death and non-interrupting notices');

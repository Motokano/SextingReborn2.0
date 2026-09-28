import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c=vm.createContext({console,Math,Date});c.window=c;c.globalThis=c;c.UIText={t:k=>k};
for(const f of ['item-attribute-modules','inventory-equipment','item-assembly','hideout-warehouse','fishing-session','fishing-facts','fishing-feedback','fishing-pond'])vm.runInContext(read('js/'+f+'.js'),c);
const I=c.InventoryEquipment,W=c.HideoutWarehouse,F=c.FishingSession,P=c.FishingPond;
const config=JSON.parse(read('data/fishing-pond.json'));config.fact_rules=JSON.parse(read('data/fishing-facts.json'));config.feedback_rules=JSON.parse(read('data/fishing-feedback.json'));
I.setConfig({equipment:{bag:{item_id:'bag',equip_slot:'backpack',backpack_slots:30}},items:c.ItemAttributeModules.hydrateCatalog(JSON.parse(read('data/item-catalog-v2.json'))),modules:{},default_equipment:{}});
W.setUpgradeTable({base_capacity:40,base_free_qol_ids:['deposit_auto_stack','withdraw_to_character_default_order']});
F.configure(JSON.parse(read('data/fishing-session-config.json')));P.configure(config);
let tick=0,stamina=1000,hour=9;
c.GameTime={getState:()=>({totalTicks:tick,hour}),reset:()=>{}};
c.GameEngine={getState:()=>({mapId:config.entry.map,x:6,y:10}),setState:()=>{}};
const advance=()=>{tick++;W.tickSpoilage();};
F.setHost({stamina:()=>stamina,spendStamina:n=>stamina-=n,advanceTick:advance});
P.setHost({now:()=>tick,allowed:()=>true,stamina:()=>stamina,spend:n=>stamina-=n,tick:advance});
function setup(seed=10){F.setState(null);P.setState(null);tick=0;stamina=1000;hour=9;I.setState({equipment:{backpack:{item_id:'bag'}},inventory_backpack:[],inventory_pocket:[],inventory_vest:[],ground_items:{}});W.setState(W.createDefaultState());assert.equal(P.grantStarter().ok,true);const before=JSON.stringify(W.getState());P.grantStarter();assert.equal(JSON.stringify(W.getState()),before);for(let i=0;i<W.getState().slots.length;i++){if(W.getState().slots[i])assert.equal(W.withdrawSlot(i).ok,true);}let s=P.getState();s.seed=seed;P.setState(s);const rod=I.getState().inventory_backpack.find(x=>x&&x.item_id==='fishing_rod_hand_basic');assert.equal(P.act('select',rod.instance_id).ok,true);return rod;}
function bait(){const b=I.getState().inventory_backpack.find(x=>x&&x.item_id==='fishing_bait_worm');return P.act('bait',b.instance_id);}
function snapshot(){return JSON.parse(JSON.stringify({i:I.getState(),w:W.getState(),f:F.getState(),p:P.getState(),tick,stamina}));}
function restore(s){F.setState(null);I.setState(s.i);W.setState(s.w);assert.equal(F.setState(s.f),true);assert.equal(P.setState(s.p),true);tick=s.tick;stamina=s.stamina;}

function lureSetup(seed=10){setup(seed);const part=(id,connections)=>({item_id:id,count:1,connections:connections||{}});assert.equal(I.putItemIntoDefaultContainer(part('fishing_rod_lure_basic',{reel:part('fishing_reel_basic',{main_line:part('fishing_line_braid_fixed',{leader:part('fishing_leader_lure_wire',{lure:part('fishing_lure_frog')})})})})).placed,true);const rod=I.getState().inventory_backpack.find(x=>x&&x.item_id==='fishing_rod_lure_basic');assert.equal(P.act('select',rod.instance_id).ok,true);return rod;}
// Real environment provider; no thermometer knowledge or observation API is consulted.
vm.runInContext(read('js/weather.js'),c);
const weather=JSON.parse(read('data/weather-config.json'));
c.Weather.configure(weather);
let temperature=20;
c.GameEngine.getMap=()=>({map_id:config.entry.map,environment:{temperature}});
for(const [value,band] of [[-20,'cold'],[4.999,'cold'],[5,'cool'],[14.999,'cool'],[15,'mild'],[24.999,'mild'],[25,'warm'],[34.999,'warm'],[35,'hot'],[60,'hot']]){
 temperature=value;c.Weather.reset(123);
 assert.equal(c.Weather.getEnvironment(c.GameEngine.getMap()).temperature_band,band);
 assert.equal('temperature_band' in c.Weather.observe(c.GameEngine.getMap()),false);
}
temperature=20;c.Weather.reset(123);
c.Weather.setMapEffect('test',c.GameEngine.getMap(),{offset:20,immediate:true});
assert.equal(c.Weather.getEnvironment(c.GameEngine.getMap()).temperature_band,'hot');
const neutral=JSON.parse(JSON.stringify(config));neutral.points.forEach(p=>delete p.temperature_approach);
function trials(cfg,temp,lure){
 assert.equal(P.configure(cfg),true);temperature=temp;let hits=[];
 for(let i=1;i<=64;i++){
  if(lure)lureSetup(i*7919);else{setup(i*7919);bait();}
  c.Weather.reset(123);
  if(lure)assert.equal(P.act('point',1).ok,true);
  assert.equal(P.act('cast').ok,true);
  if(lure)assert.equal(P.act('workLure').ok,true);
  hits.push(!!P.getState().candidate);
  const visible=JSON.stringify(P.getPublicState());
  assert.doesNotMatch(visible,/temperature_band|temperature_approach/);
 }
 return hits;
}
for(const lure of [false,true]){
 const base=trials(neutral,20,lure),mild=trials(config,20,lure),cold=trials(config,0,lure);
 assert.deepEqual(mild,base,'mild weather preserves the existing seeded encounter behavior');
 assert.ok(base.some(Boolean),'fixture must generate real contacts');
 assert.ok(cold.filter(Boolean).length<base.filter(Boolean).length,'cold reduces contacts for both methods');
 assert.ok(cold.every((hit,i)=>!hit||base[i]),'temperature only gates existing contacts');
 const zero=JSON.parse(JSON.stringify(config));zero.points.forEach(p=>p.temperature_approach.hot=0);
 assert.equal(trials(zero,40,lure).some(Boolean),false,'zero configured activity prevents contacts');
}
const bad=JSON.parse(JSON.stringify(config));bad.points[0].temperature_approach.hot=-1;assert.equal(P.configure(bad),false);
// An ongoing wait reads a changed environment without reopening or recasting.
const changing=JSON.parse(JSON.stringify(config));changing.points[0].temperature_approach.hot=0;
assert.equal(P.configure(changing),true);setup(7919);bait();temperature=40;c.Weather.reset(123);
assert.equal(P.act('cast').ok,true);assert.equal(P.act('wait',3).ok,true);assert.equal(P.getState().candidate,null);
c.Weather.setMapEffect('cooling',c.GameEngine.getMap(),{offset:-20,immediate:true});
for(let i=0;i<80&&!P.getState().candidate;i++)assert.equal(P.act('wait',1).ok,true);
assert.ok(P.getState().candidate,'ongoing waits must consume the new temperature band');
assert.equal(P.configure(config),true);
console.log('PASS: temperature boundaries, special heat, private environment, neutral compatibility, cold suppression and zero activity for bait and lure.');

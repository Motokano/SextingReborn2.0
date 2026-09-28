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
let weather='clear';c.Weather={getEnvironment:()=>({weather,temperature_band:'mild'})};
setup();let old=P.getState();old.water.forEach(w=>{w.stock=w.stock.slice(0,4);w.stock[0]=0;});
assert.equal(P.setState(old),true);const migrated=P.getState();
assert.equal(migrated.water[1].stock[0],0);assert.deepEqual(Array.from(migrated.water[1].stock.slice(4)),[3,1]);
migrated.water[1].stock[4]=0;assert.equal(P.setState(migrated),true);assert.equal(P.getState().water[1].stock[4],0);
const bad=structuredClone(config);bad.fish[4].weather_activity.heavy_rain=-1;assert.equal(P.configure(bad),false);
function prepare(fi,seed){setup(seed);if(fi===5){const inv=I.getState();function equip(x){if(!x||typeof x!=='object')return;if(x.item_id==='fishing_hook_single_small')x.item_id='fishing_hook_single_medium';Object.values(x).forEach(equip);}equip(inv);I.setState(inv);}bait();const state=P.getState();state.water[0].stock=state.water[0].stock.map((_,i)=>i===fi?4:0);P.setState(state);}
for(const fi of [4,5]){
 assert.ok(I.getItemTemplate(config.fish[fi].id),'new fish has an inventory template');
 assert.equal(P.recognition(config.fish[fi].id),false);
 const tpl=I.getItemTemplate(config.fish[fi].id),expert={skills:{survival_language:{level:99}}};
 assert.equal(I.getDisplayName(tpl,2,expert),config.fish[fi].appearance,'language proficiency cannot identify an unknown fish');
 assert.equal(I.getDisplayDesc(tpl,2,expert),config.fish[fi].appearance,'unknown description only exposes appearance');
 const hits={};for(const w of ['clear','heavy_rain','thunderstorm','storm']){
 weather=w;hits[w]=[];for(let i=1;i<=64;i++){prepare(fi,i*7919);assert.equal(P.act('cast').ok,true);hits[w].push(!!P.getState().candidate);assert.doesNotMatch(JSON.stringify(P.getPublicState()),/weather_activity/);}
 }
 assert.deepEqual(hits.heavy_rain,hits.thunderstorm,'lightning adds no separate bonus');
 assert.ok(hits.heavy_rain.filter(Boolean).length>hits.clear.filter(Boolean).length,'rain must increase contacts with only one eligible species');
 assert.ok(hits.storm.filter(Boolean).length<hits.clear.filter(Boolean).length,'extreme storm reduces contacts');
 weather='clear';let landed=null;
 for(let seed=1;seed<160&&!landed;seed++){
 prepare(fi,seed*7919);P.act('cast');for(let n=0;n<40;n++){
 const a=F.getState().active;if(a.phase==='waiting')P.act('wait',1);else if(a.phase==='signal'){if(P.getPublicState().canWatch)P.act('watch');if(F.getState().active.phase==='signal')P.act('strike','normal');}else if(a.phase==='fight')P.act('fight','steady');else if(a.phase==='landed'){landed=snapshot();break;}else break;
 }}
 assert.ok(landed,'new species must be landable with actual equipment: '+fi);
 const fish=P.getState().candidate;assert.equal(fish.item.item_id,config.fish[fi].id);assert.equal(P.validateEnvelope(P.getState(),F.getState()),true);
 assert.equal(P.getPublicState().catchText,config.fish[fi].appearance,'first catch does not reveal species name');
 assert.doesNotMatch(JSON.stringify(P.getPublicState()),/黄颡鱼|鲶鱼|weather_activity|temperature_approach/);
 assert.equal(P.act('keep').ok,true);assert.ok(I.getState().inventory_backpack.some(x=>x&&x.item_id===config.fish[fi].id));
 assert.equal(I.getDisplayName(tpl,2,expert),config.fish[fi].appearance,'keeping a fish is not identification');
 restore(landed);const remaining=P.getState().water[0].stock[fi];assert.equal(P.act('release').ok,true);assert.equal(P.getState().water[0].stock[fi],remaining+1);assert.equal(P.act('release').ok,false);
}
console.log('PASS: new fish contacts, rain/storm responses, no double weather bonus, real catches/keep/release, unknown names and legacy stock migration.');

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
setup();assert.equal(P.recognition('fishing_bait_worm'),false);assert.equal(I.getDisplayName(I.getItemTemplate('fishing_bait_worm'),2,{skills:{survival_language:{level:99}}}).includes('蚯蚓'),false);
const before=snapshot();assert.equal(P.act('depth',41).ok,false);assert.equal(P.act('depth',2.5).ok,false);assert.equal(tick,0);assert.deepEqual(snapshot(),before);
hour=0;assert.equal(P.getPublicState().light,false);hour=9;
assert.equal(bait().ok,true);assert.equal(tick,1);assert.equal(P.act('cast').ok,true);
const saved=snapshot();const r1=P.act('wait',3);const state1=snapshot();restore(saved);assert.deepEqual(JSON.parse(JSON.stringify(P.act('wait',3))),JSON.parse(JSON.stringify(r1)));assert.deepEqual(snapshot(),state1);
assert.equal(P.act('close').ok,true);assert.equal(F.getState().active,null);
let landed=null;
for(let seed=1;seed<=100&&!landed;seed++){
 setup(seed);bait();P.act('cast');for(let n=0;n<35;n++){
  const phase=F.getState().active.phase;
  if(phase==='waiting')P.act('wait',1);
  else if(phase==='signal'){if(P.getPublicState().canWatch)P.act('watch');if(F.getState().active.phase==='signal')P.act('strike','normal');}
  else if(phase==='fight')P.act('fight','steady');
  else if(phase==='landed'){landed=snapshot();break;}
  else break;
 }
}
assert.ok(landed,'should produce a landed catch from real configured encounter rules');
const c0=P.getState().candidate,stock=P.getState().water[0].stock[c0.fish];assert.equal(P.act('close').reason,'pending');
assert.equal(P.act('keep').ok,true);const fish=I.getState().inventory_backpack.find(x=>x&&x.item_id===c0.item.item_id);assert.ok(fish);assert.equal(I.getItemCombinedWeight(fish),c0.weight/1000);assert.equal(P.act('keep').ok,false);assert.equal(I.auditItemOwnership().ok,true);
restore(landed);assert.equal(P.act('release').ok,true);assert.equal(P.getState().water[0].stock[c0.fish],stock+1);assert.equal(P.act('release').ok,false);
restore(landed);const inv=I.getState();inv.inventory_backpack=Array.from({length:30},()=>({item_id:'fishing_hook_single_small'}));I.setState(inv);assert.equal(P.act('keep').reason,'space');assert.equal(P.getState().candidate.item.instance_id,c0.item.instance_id);restore(landed);
// Formal save round trip includes the pending fish and rejects corrupt pond before mutation.
c.CharacterAttributes={getState:()=>({}),setState:()=>{},recalcCharacterStats:()=>{}};c.Survival={getState:()=>({stamina}),setState:()=>{}};
vm.runInContext(read('js/save-system.js'),c);const formal=c.SaveSystem.buildSnapshotForDebug();assert.ok(formal.fishing_pond);assert.equal(c.SaveSystem.applySnapshotForDebug(formal),true);assert.equal(P.getState().candidate.item.instance_id,c0.item.instance_id);const bad=JSON.parse(JSON.stringify(formal));bad.fishing_pond.depth=41;assert.equal(c.SaveSystem.applySnapshotForDebug(bad),false);
setup();P.act('cast');let s=P.getState();s.snag=2;P.setState(s);assert.equal(P.act('snag','pull').broken,true);assert.equal(F.getState().active.phase,'ended');assert.equal(I.auditItemOwnership().ok,true);
setup();P.act('cast');stamina=0;assert.equal(P.act('close').ok,true);assert.equal(F.getState().active,null);
// A damaged, incomplete rod remains selectable and repairable after leaving the window.
const rod=setup();P.act('cast');P.act('cut');P.act('close');assert.equal(P.act('select',rod.instance_id).ok,true);
const spare=I.getState().inventory_backpack.findIndex(x=>x&&x.item_id==='fishing_line_main_nylon_thin');assert.equal(P.act('attach',{host:rod.instance_id,slot:'main_line',source:'backpack',index:spare}).ok,true);assert.equal(P.act('cast').reason,'rig_incomplete');
setup();const food=I.getState().inventory_backpack.find(x=>x&&x.item_id==='fishing_bait_grain');P.act('nest',food.instance_id);P.act('close');assert.ok(P.getState().water[0].nest.grain);tick+=6;P.act('observe');assert.equal(P.getState().water[0].nest.grain,undefined);
restore(landed);const corrupt=P.getState();corrupt.candidate.item.fishing_catch.weight_kg=999;assert.equal(P.validate(corrupt),false);assert.equal(P.validateEnvelope(P.getState(),{active:null}),false);
// Route topology, rod reach and available line are separate configured constraints.
setup();P.act('point',3);let costBefore={tick,stamina};
assert.equal(P.act('cast').reason,'rod_range');assert.deepEqual({tick,stamina},costBefore);
assert.equal(P.act('observe').ok,true,'a short rod must not prevent watching water');
const lineConfig=JSON.parse(JSON.stringify(config));lineConfig.stations[0].routes[0].hand_line_required_dm=41;
assert.equal(P.configure(lineConfig),true);setup();costBefore={tick,stamina};
assert.equal(P.act('cast').reason,'line_short');assert.equal(P.act('probe').reason,'line_short');assert.deepEqual({tick,stamina},costBefore);
lineConfig.stations[0].routes[0].hand_line_required_dm=40;
assert.equal(P.configure(lineConfig),true);assert.equal(P.act('cast').ok,true,'exact line length is accepted');P.act('close');
const badConfig=JSON.parse(JSON.stringify(config));badConfig.stations[0].routes[0].distance_dm=0;assert.equal(P.configure(badConfig),false);
assert.equal(P.configure(config),true);setup();P.act('point',2);assert.equal(P.act('cast').reason,'unreachable');
// Short replacement lines constrain depth; catalogs, not per-instance copies, own the specification.
setup();assert.equal(P.act('cast').ok,true);assert.equal(P.act('retrieve').ok,true);
let observations=P.getPublicState().observations,lastObservation=observations.at(-1);
assert.ok(lastObservation.facts.includes('retrieve_completed'));assert.ok(lastObservation.facts.includes('bait_absent'));
assert.equal(JSON.stringify(observations).includes('"actual"'),false);
const factSnapshot=snapshot();assert.equal(P.validate(factSnapshot.p),true);restore(factSnapshot);
assert.deepEqual(JSON.parse(JSON.stringify(P.getPublicState().observations)),JSON.parse(JSON.stringify(observations)));
hour=0;P.act('inspect');lastObservation=P.getPublicState().observations.at(-1);assert.equal(lastObservation.facts.includes('bait_absent'),false);
const badFacts=P.getState();badFacts.factHistory.events.at(-1).perceived.push('secret_fish_id');assert.equal(P.setState(badFacts),false);
// Actual loss ends the fight, but underwater losses remain uninspected until retrieval.
setup();P.act('cast');let lostState=F.getState();lostState.active.phase='ended';lostState.active.needs_retrieval=true;F.setState(lostState);
assert.equal(P.getPublicState().needsRecovery,true);assert.equal(P.act('inspect').reason,'busy');assert.equal(P.act('cast').reason,'busy');
assert.equal(P.act('retrieve').ok,true);assert.equal(P.getPublicState().needsRecovery,false);
// A real obstacle break must not disclose terminal losses before recovery.
setup();P.act('cast');let obstacleState=P.getState();obstacleState.snag=2;P.setState(obstacleState);
assert.equal(P.act('snag','pull').broken,true);
assert.equal(P.getPublicState().castLimit,null);
assert.equal(P.getPublicState().observations.at(-1).facts.includes('hook_absent'),false);
assert.equal(P.act('retrieve').ok,true);
assert.ok(P.getPublicState().observations.at(-1).facts.includes('hook_absent'));
// Natural contact sources record configured signals and keep failed actions inert.
setup(10);bait();P.act('cast');for(let n=0;n<60&&F.getState().active.phase==='waiting';n++)P.act('wait',1);
assert.equal(F.getState().active.phase,'signal');
assert.ok(P.getPublicState().observations.some(e=>e.source==='signal'&&e.facts.length));
const unchangedFacts=JSON.stringify(P.getState().factHistory);P.act('depth',999);
assert.equal(JSON.stringify(P.getState().factHistory),unchangedFacts);
// Old active saves acquire recovery locking without changing item identity.
const legacy=F.getState();delete legacy.active.needs_retrieval;assert.equal(F.setState(legacy),true);
assert.equal(F.getState().active.needs_retrieval,true);
// Feedback is generated once during actions, not during rendering; night facts stay filtered.
setup();hour=0;P.act('cast');P.act('wait',1);
assert.match(P.getPublicState().logs[0].text,/看不清|光线|昏暗/);
const night=snapshot();P.getPublicState();P.getPublicState();assert.deepEqual(snapshot(),night);
P.act('wait',1);assert.equal(P.getState().logs[0].repeats,2);
restore(night);P.act('wait',1);assert.equal(P.getState().logs[0].repeats,2);
P.act('retrieve');assert.match(P.getPublicState().logs[0].text,/收回|回收/);assert.doesNotMatch(P.getPublicState().logs[0].text,/没有饵|钩上|短线/);
setup();P.act('cast');P.act('retrieve');assert.ok(P.getState().feedbackHistory.events.length);
const runtimeCopy=snapshot();restore(runtimeCopy);assert.deepEqual(snapshot(),runtimeCopy);
const shortCatalog=c.ItemAttributeModules.hydrateCatalog(JSON.parse(read('data/item-catalog-v2.json')));
shortCatalog.fishing_line_main_nylon_thin.attribute_modules.equipment.fishing_tackle.fishing_length_dm=10;
I.setConfig({equipment:{bag:{item_id:'bag',equip_slot:'backpack',backpack_slots:30}},items:shortCatalog,modules:{},default_equipment:{}});
setup();assert.equal(P.getPublicState().depthMax,15);costBefore={tick,stamina};
assert.equal(P.act('depth',16).reason,'depth_line_short');assert.deepEqual({tick,stamina},costBefore);
assert.equal(P.act('depth',15).ok,true);
console.log('[fishing-pond] PASS: starter, costs, boundaries, unknown names, seeded resume, natural encounter, unique catch, release, full inventory, formal save, obstacle loss, close, configured route reach and line length');

// Production host: real Survival and GameTime, without sandbox stamina/time overrides.
I.setConfig({equipment:{bag:{item_id:'bag',equip_slot:'backpack',backpack_slots:30}},items:c.ItemAttributeModules.hydrateCatalog(JSON.parse(read('data/item-catalog-v2.json'))),modules:{},default_equipment:{}});
setup();
vm.runInContext(read('js/game-time.js'),c);vm.runInContext(read('js/weather.js'),c);c.Weather.configure(JSON.parse(read('data/weather-config.json')));vm.runInContext(read('js/survival.js'),c);vm.runInContext(read('js/fishing-panel.js'),c);
c.Survival.setState({stamina:100,isDead:false,isComa:false,isResting:false});
F.setHost(null);c.FishingPanel.configure(config);
const realBefore=c.GameTime.getState().totalTicks,staminaBefore=c.Survival.getStamina();
assert.equal(P.act('cast').ok,true);assert.equal(c.GameTime.getState().totalTicks,realBefore+1);assert.ok(c.Survival.getStamina()<staminaBefore);
assert.equal(P.act('retrieve').ok,true);assert.equal(c.GameTime.getState().totalTicks,realBefore+2);
const realSave=c.SaveSystem.buildSnapshotForDebug();assert.ok(realSave);assert.equal(c.SaveSystem.applySnapshotForDebug(realSave),true);
assert.ok(realSave.weather,'formal save includes weather');
assert.equal(JSON.stringify(c.Weather.getState()),JSON.stringify(realSave.weather),'formal restore keeps weather process');
const badWeather=JSON.parse(JSON.stringify(realSave));badWeather.weather.regions.jinmu.weather='invalid';
const beforeBad=c.GameTime.getState().totalTicks;assert.equal(c.SaveSystem.applySnapshotForDebug(badWeather),false);assert.equal(c.GameTime.getState().totalTicks,beforeBad,'reject before mutation');
const legacyWeather=JSON.parse(JSON.stringify(realSave));delete legacyWeather.weather;
assert.equal(c.SaveSystem.applySnapshotForDebug(legacyWeather),true);const migratedWeather=JSON.stringify(c.Weather.getState());
assert.equal(c.SaveSystem.applySnapshotForDebug(legacyWeather),true);assert.equal(JSON.stringify(c.Weather.getState()),migratedWeather,'legacy migration does not reroll');
assert.equal(c.SaveSystem.applySnapshotForDebug(realSave),true);
assert.equal(P.act('close').ok,true);assert.equal(F.getState().active,null);
console.log('[fishing-production-host] PASS: actual panel host, Survival costs, GameTime ticks, formal save/load, close');

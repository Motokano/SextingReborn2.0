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
let rod=lureSetup();assert.equal(P.getPublicState().isLure,true);let before=snapshot();assert.equal(P.act('probe').reason,'floating_lure');assert.equal(P.act('depth',20).reason,'floating_lure');assert.deepEqual(snapshot(),before);
assert.equal(P.act('lureSpeed','fast').ok,true);assert.equal(P.act('lureStyle','twitch').ok,true);assert.equal(tick,0);assert.equal(P.act('lureSpeed','invalid').ok,false);assert.equal(P.act('cast').ok,true);assert.equal(stamina,994);assert.equal(tick,1);before=snapshot();assert.equal(P.act('wait',6).ok,false);assert.equal(P.act('lureStyle','pause').ok,false);assert.deepEqual(snapshot(),before);
assert.equal(P.act('workLure').ok,true);assert.equal(stamina,983);assert.equal(F.getState().active.phase,'waiting');assert.equal(P.act('workLure').ok,true);assert.equal(stamina,972);assert.equal(F.getState().active.phase,'ready');assert.equal(tick,3);assert.ok(I.findItemInstanceRecord(rod.instance_id));
lureSetup();P.act('cast');stamina=6;before=snapshot();assert.equal(P.act('workLure').reason,'stamina');assert.deepEqual(snapshot(),before);
lureSetup();P.act('point',1);P.act('cast');before=snapshot();const result=P.act('workLure'),after=snapshot();restore(before);assert.deepEqual(JSON.parse(JSON.stringify(P.act('workLure'))),JSON.parse(JSON.stringify(result)));assert.deepEqual(snapshot(),after);
let landed=null;
for(let seed=1;seed<=100&&!landed;seed++){rod=lureSetup(seed);P.act('point',1);P.act('cast');for(let n=0;n<30;n++){const phase=F.getState().active.phase;if(P.getPublicState().snag)P.act('snag','relax');else if(phase==='waiting')P.act('workLure');else if(phase==='signal'){if(P.getPublicState().canWatch)P.act('watch');if(F.getState().active.phase==='signal')P.act('strike','normal');}else if(phase==='fight')P.act('fight','steady');else if(phase==='landed'){landed=snapshot();break;}else break;}}
assert.ok(landed,'configured blackfish must be catchable');assert.equal(P.getState().candidate.item.item_id,'fishing_catch_snakehead');let root=I.findItemInstanceRecord(rod.instance_id).instance;const frogId=root.connections.reel.connections.main_line.connections.leader.connections.lure.instance_id;assert.ok(I.findItemInstanceRecord(frogId),'lure must not be consumed by strike');assert.equal(P.validateEnvelope(landed.p,landed.f),true);restore(landed);assert.equal(P.act('keep').ok,true);assert.ok(I.findItemInstanceRecord(frogId));assert.equal(I.auditItemOwnership().ok,true);
rod=lureSetup();P.act('cast');const reelId=I.findItemInstanceRecord(rod.instance_id).instance.connections.reel.instance_id;assert.equal(P.act('cut').ok,true);assert.ok(I.findItemInstanceRecord(reelId));assert.equal(I.findItemInstanceRecord(reelId).instance.connections?.main_line,undefined);assert.equal(I.auditItemOwnership().ok,true);
// Same high pull, different configured drag setting; no physical force simulation.
function fightFixture(drag){lureSetup();P.act('drag',drag);P.act('cast');F.acceptContactEvent({event_id:'drag-test',load_rating:5,endurance:20,hook_fit:'good',takes_bait_on_strike:false,behavior_sequence:[{id:'pull',load_delta:0,progress_delta:0,hook_delta:0}]});F.strike('normal');return F.fightStep('steady');}
assert.equal(fightFixture('loose').load,1);assert.equal(fightFixture('tight').phase,'ended');
setup();P.act('cast');F.acceptContactEvent({event_id:'hand-test',load_rating:1,endurance:20,hook_fit:'good'});F.strike('normal');assert.equal(F.fightStep('give').reason,'no_reel');
lureSetup();P.act('drag','loose');P.act('cast');let snagState=P.getState();snagState.snag=2;P.setState(snagState);assert.equal(P.act('snag','pull').ok,true);assert.equal(P.getState().snag,2);assert.equal(F.getState().active.phase,'waiting');
setup();const old=P.getState();old.water.forEach(w=>w.stock=w.stock.slice(0,3));delete old.lureStyle;delete old.lureSpeed;delete old.retrieveLeft;delete old.drag;assert.equal(P.setState(old),true);assert.equal(P.getState().water[1].stock[3],2);assert.equal(P.getState().lureStyle,'steady');assert.equal(P.getState().seed,old.seed);
console.log('[fishing-lure] PASS: fixed costs, presets, no passive work, float-only, seeded resume, blackfish, reusable lure, drag break, cut preserves reel, legacy migration');

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { sewingTemplates } from './build-sewing-catalog.mjs';

const read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p)),copy=x=>JSON.parse(JSON.stringify(x));
const c=vm.createContext({console,Math,Date});c.window=c;
let flags,saveOK=true,stamina,energy,ticks,access=true;
c.NPCSystem={getFlagValue:k=>flags[k],setDemoFlag:(k,v)=>flags[k]=v,getDemoState:()=>copy(flags),setDemoState:s=>flags=copy(s)};
c.Survival={getIntensityRate:k=>({low:.4,medium:.6,high:1})[k],getActionStaminaCost:n=>n,getState:()=>({}),getStamina:()=>stamina,getEnergy:()=>energy,consumeStamina:n=>stamina-=n,consumeEnergy:n=>energy-=n,advanceTick:({baseCost=.4}={})=>{stamina-=baseCost;ticks++;},setDiqiShieldRemaining:()=>{}};
c.SaveSystem={saveNow:()=>saveOK};c.SewingStationPanel={isOpen:()=>true,canAccess:()=>access,snapshot:()=>({})};
c.GameEngine={getState:()=>({mapId:'M0_Base_Inside_lv_1',x:6,y:12})};
for(const f of ['item-attribute-modules','sewing-system','inventory-equipment'])vm.runInContext(read('js/'+f+'.js'),c);
const IE=c.InventoryEquipment,S=c.SewingSystem;
const items=c.ItemAttributeModules.hydrateCatalog(json('data/item-catalog-v2.json'));
const equipment=c.ItemAttributeModules.hydrateCatalog(json('data/equipment-catalog-v2.json'));
IE.setConfig({items,equipment:{...equipment,bag:{item_id:'bag',equip_slot:'backpack',backpack_slots:100}},modules:{},default_equipment:{}});
const materialIds=[...new Set(Object.values(S.accessories).flatMap(r=>Object.keys(r.cost)))];
function reset(){flags={sewing_station_unlocked:true,sewing_knowledge:{patterns:{},materials:{}}};stamina=energy=10000;ticks=0;access=saveOK=true;S.cancel();IE.setState({sewing_version:1,equipment:{backpack:{item_id:'bag'}},inventory_backpack:materialIds.map(item_id=>({item_id,count:200})),inventory_pocket:[],inventory_vest:[],inventory_vehicle:[],ground_items:{}});}
function add(item_id,extra={}){const x=IE.ensureItemInstanceIdentity({item_id,count:1,...extra});assert(IE.putItemIntoDefaultContainer(x).placed);return x.instance_id;}
function run(actions){const started=S.start(Array.isArray(actions)?actions:[actions]);assert(started.ok,started.message);let n=0;while(S.jobState()){const r=S.step();assert(r.ok,r.message);assert(++n<2000);}return n;}
function sample(recipe,side='left',extra={}){return add(S.accessoryItemId(recipe,side),extra);}
function unlock(recipe){for(const side of ['left','right','left'])run({type:'pattern',id:sample(recipe,side)});assert.equal(S.accessoryLevel(recipe),3);}
reset();assert.equal(Object.keys(S.accessories).length,11);
for(const [id,r] of Object.entries(S.accessories)){
 assert.equal(S.preview({type:'craft_accessory',recipe:id,side:'left'}).ok,false);
 unlock(id);const before=Object.fromEntries(Object.keys(r.cost).map(m=>[m,IE.countCarriedItemsByTemplateId(m)]));
 const t=ticks;run(S.accessoryActions(id,'pair',1));assert.equal(ticks-t,r.ticks*2);
 for(const [m,n] of Object.entries(r.cost)){assert(IE.getItemTemplate(m),m);assert.equal(IE.countCarriedItemsByTemplateId(m),before[m]-n*2);}
 for(const side of ['left','right']){
  const crafted=S.owned().find(x=>x.item.item_id===S.accessoryItemId(id,side)&&x.item.sewing_accessory);
  assert(crafted,id+side);const tpl=IE.getItemTemplate(crafted.item.item_id);assert.equal(tpl.enchant_slots,6);
  assert.equal(crafted.item.enchants.length,0);assert.equal(crafted.item.sewing,undefined,'accessory does not enter clothing armor/fit logic');
  const item=IE.takeItemFromContainer(crafted.container,crafted.index).item;
  assert(IE.equip(r.kind+'_'+side,item).success);assert.equal(IE.getState().equipment[r.kind+'_'+side].instance_id,item.instance_id);
 }
}
assert(IE.auditItemOwnership().ok);
console.log('PASS 11 researched patterns, both sides, exact costs/time, real equipment slots and unchanged template attributes.');

reset();const first=sample('glove_cloth','left',{enchants:['retained-test-enchant']});run({type:'pattern',id:first});
assert.equal(S.accessoryLevel('glove_cloth'),1);assert.equal(S.preview({type:'pattern',id:first}).ok,false);
assert.ok(Math.abs(stamina-(10000-6*.4))<1e-8);assert.equal(energy,9988);assert.deepEqual(copy(S.record(first).item.enchants),['retained-test-enchant']);
const inv=copy(IE.getState()),knowledge=copy(flags);IE.setState(inv);flags=knowledge;
assert.equal(S.accessoryLevel('glove_cloth'),1);assert.equal(S.preview({type:'pattern',id:first}).ok,false,'reload cannot reuse a sample');
const rec=S.record(first),moved=IE.takeItemFromContainer(rec.container,rec.index).item;assert(IE.putItemIntoDefaultContainer(moved).placed);
assert.equal(S.preview({type:'pattern',id:first}).ok,false,'moving cannot reuse a sample');
const second=sample('glove_cloth','right');run({type:'pattern',id:second});assert.equal(S.accessoryLevel('glove_cloth'),2);
const third=sample('glove_cloth');const beforeInv=JSON.stringify(IE.getState()),beforeFlags=JSON.stringify(flags);assert(S.start([{type:'pattern',id:third}]).ok);
for(let i=0;i<5;i++)assert(S.step().ok);saveOK=false;assert.equal(S.step().ok,false);assert.equal(JSON.stringify(IE.getState()),beforeInv);assert.equal(JSON.stringify(flags),beforeFlags);saveOK=true;
run({type:'pattern',id:third});assert.equal(S.accessoryLevel('glove_cloth'),3);
const extra=sample('glove_cloth');assert.equal(S.preview({type:'pattern',id:extra}).ok,false,'mastered patterns do not consume further research');
console.log('PASS legacy instances, shared left/right research, duplicate prevention, transfer/reload, retained enchantments and save rollback.');

reset();unlock('glove_cloth');const cost=S.accessories.glove_cloth.cost.textile_cotton_cloth;
let before=IE.countCarriedItemsByTemplateId('textile_cotton_cloth');assert(S.start(S.accessoryActions('glove_cloth','pair',1)).ok);
assert(S.step().ok);S.cancel();assert.equal(IE.countCarriedItemsByTemplateId('textile_cotton_cloth'),before);
assert(S.start(S.accessoryActions('glove_cloth','pair',1)).ok);for(let i=0;i<3;i++)assert(S.step().ok);assert(S.step().ok);S.cancel();
assert.equal(IE.countCarriedItemsByTemplateId('textile_cotton_cloth'),before-cost);
assert.equal(S.owned().filter(r=>r.item.sewing_accessory).length,1);
assert.equal(S.owned().find(r=>r.item.sewing_accessory).item.item_id,'eq_glove_left_cloth');
IE.removeCarriedItemsByTemplateId('textile_cotton_cloth',before-cost*2,{strict:true});
assert.equal(S.preview({type:'craft_accessory',recipe:'glove_cloth',side:'left'}).ok,true);
assert.equal(S.start(S.accessoryActions('glove_cloth','pair',1)).ok,false,'one shoe worth of materials cannot start a pair');
assert.equal(S.preview({type:'craft_accessory',recipe:'glove_cloth',side:'pair'}).ok,false);
assert.equal(S.preview({type:'craft_accessory',recipe:'missing',side:'left'}).ok,false);
assert.throws(()=>S.accessoryActions('glove_cloth','pair',51));assert.throws(()=>S.accessoryActions('glove_cloth','left',1.5));
access=false;assert.equal(S.start(S.accessoryActions('glove_cloth','left',1)).ok,false);access=true;
stamina=0;assert(S.start(S.accessoryActions('glove_cloth','left',1)).ok);assert.equal(S.step().ok,false);

reset();unlock('shoe_rain');before=JSON.stringify(IE.getState());assert(S.start(S.accessoryActions('shoe_rain','left',1)).ok);
for(let i=0;i<S.accessories.shoe_rain.ticks-1;i++)assert(S.step().ok);saveOK=false;assert.equal(S.step().ok,false);assert.equal(JSON.stringify(IE.getState()),before);saveOK=true;
// Real inventory overflow: filled backpack, materials remain stacked after payment.
const st=copy(IE.getState());while(st.inventory_backpack.length<100)st.inventory_backpack.push({item_id:'eq_glove_left_cloth',count:1});IE.setState(st);
run(S.accessoryActions('shoe_rain','right',1));const ground=IE.getGroundItemsAt('M0_Base_Inside_lv_1',6,12);
assert.equal(ground.filter(i=>i.item_id==='eq_shoe_right_rain').length,1);assert(IE.auditItemOwnership().ok);
console.log('PASS cancellation, partial pairs, total batch costs, access/resources, delivery rollback and full-inventory ground fallback.');

const generated=sewingTemplates(json('data/sewing-item-texts.json')),batch=json('data/dungeon-config.json').pool.batches.find(b=>b.id==='sewing-accessory-supplies-v1');
assert(batch);for(const row of batch.items){assert(row.stock>0);assert(!row.lifeProduct);assert(generated[row.item_id]);assert.equal(items[row.item_id].weight_kg,generated[row.item_id].weight_kg);assert(materialIds.includes(row.item_id));}

// Drive the production iframe UI with actual inventory and work actions.
reset();for(const side of ['left','right','left'])sample('glove_boxing',side);unlock('shoe_rain');
const dom=new JSDOM(read('sewing-station.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{runScripts:'outside-only'}),w=dom.window;
Object.defineProperty(w,'parent',{value:c});let tick;
w.setInterval=fn=>(tick=fn,1);w.clearInterval=()=>{tick=null;};
w.eval(read('js/sewing-station-view.js'));
const button=(area,name)=>{const b=[...w.document.querySelectorAll(area+' button')].find(b=>b.textContent===name);assert(b,area+' '+name);return b;};
const click=(area,name)=>button(area,name).click();
const finish=()=>{let limit=0;while(tick){tick();assert(++limit<2000);}};
const labels=area=>[...w.document.querySelectorAll(area+' button')].map(b=>b.textContent);
const change=(selector,value)=>{const input=w.document.querySelector(selector);input.value=value;input.dispatchEvent(new w.Event('change'));};
const search=value=>{const input=w.document.getElementById('search');input.value=value;input.dispatchEvent(new w.Event('input'));};
assert.deepEqual(labels('#workspaces'),['服装','手套','鞋子','材料加工']);
assert(!w.document.getElementById('mannequin').hidden);
assert.deepEqual(labels('#categories'),['整套衣服','衣服部件']);
click('#workspaces','手套');assert(w.document.getElementById('mannequin').hidden);
assert.deepEqual(labels('#menus'),['制作','研究款式']);assert(w.document.getElementById('categories').hidden);assert.deepEqual(labels('#categories'),[]);
assert.equal(w.document.querySelectorAll('#list button').length,0);assert.match(w.document.querySelector('#editor').textContent,/尚无已掌握的手套款式/);
click('#menus','研究款式');assert.equal(w.document.querySelectorAll('#list button').length,3);
assert(labels('#list').every(name=>name.includes('拳套')));
click('#workspaces','鞋子');assert.deepEqual(labels('#menus'),['制作','研究款式']);assert(w.document.getElementById('categories').hidden);
assert.equal(w.document.querySelectorAll('#list button').length,1);assert(labels('#list').every(name=>name.includes('雨靴')));
click('#menus','研究款式');assert.equal(w.document.querySelectorAll('#list button').length,3);assert(labels('#list').every(name=>name.includes('雨靴')));
search('右脚');assert.equal(w.document.querySelectorAll('#list button').length,1);
click('#workspaces','手套');assert.equal(w.document.getElementById('search').value,'');assert.equal(w.document.querySelectorAll('#list button').length,3);
for(let i=0;i<3;i++){w.document.querySelectorAll('#list button')[i].click();click('#commit','研究款式');finish();}
assert.equal(S.accessoryLevel('glove_boxing'),3);assert(button('#commit','研究款式').disabled);
click('#menus','制作');assert.equal(w.document.querySelectorAll('#list button').length,1);assert(labels('#list').every(name=>name.includes('拳套')));
assert.equal(w.document.querySelector('[aria-label="制作左右"]').value,'pair');assert.match(w.document.querySelector('#preview').textContent,/120 分钟/);
click('#commit','开始制作');assert.match(w.document.getElementById('job').textContent,/手套 ·/);
click('#workspaces','材料加工');assert.deepEqual(labels('#menus'),['加工','研究工艺']);assert(w.document.getElementById('mannequin').hidden);
assert.match(w.document.getElementById('job').textContent,/手套 ·/,'switching work areas keeps the active job identified');
click('#menus','研究工艺');assert(button('#commit','研究材料').disabled,'another work area cannot start a second job');
finish();assert.equal(S.owned().filter(r=>r.item.sewing_accessory).length,2);
const cloth=S.knowledge().materials.textile_cotton_cloth||0;
click('#commit','研究材料');finish();assert.equal(S.knowledge().materials.textile_cotton_cloth,cloth+10);
flags.sewing_knowledge.materials.textile_cotton_cloth=S.materials.textile_cotton_cloth[7];add('textile_cotton_fiber');
click('#menus','加工');assert.equal(w.document.querySelectorAll('#list button').length,1);
const clothStock=IE.countCarriedItemsByTemplateId('textile_cotton_cloth');click('#commit','开始加工');finish();assert.equal(IE.countCarriedItemsByTemplateId('textile_cotton_cloth'),clothStock+10);
click('#categories','填充');assert.equal(w.document.querySelectorAll('#list button').length,0);
click('#workspaces','服装');assert(!w.document.getElementById('mannequin').hidden);assert(!w.document.getElementById('categories').hidden);
click('#menus','改制');assert.equal(w.document.querySelectorAll('#list button').length,0,'accessories must not enter clothing alteration');
click('#menus','硅叶处理');assert.equal(w.document.querySelectorAll('#list button').length,0,'accessories must not enter armor soaking');
click('#workspaces','手套');assert.equal(w.document.querySelector('[aria-label="制作左右"]').value,'pair','work area restores its own operation and draft');
change('[aria-label="制作左右"]','right');change('[aria-label="制作只数"]','2');
click('#workspaces','鞋子');assert.equal(w.document.getElementById('search').value,'右脚');assert.equal(w.document.querySelector('#menus button.active').textContent,'研究款式');assert.equal(w.document.querySelectorAll('#list button').length,1);
search('');click('#menus','制作');assert.equal(w.document.querySelector('[aria-label="制作左右"]').value,'pair');
change('[aria-label="制作左右"]','left');change('[aria-label="制作只数"]','3');
click('#workspaces','手套');assert.equal(w.document.querySelector('[aria-label="制作左右"]').value,'right');assert.equal(w.document.querySelector('[aria-label="制作只数"]').value,'2');
click('#workspaces','鞋子');assert.equal(w.document.querySelector('[aria-label="制作左右"]').value,'left');assert.equal(w.document.querySelector('[aria-label="制作只数"]').value,'3');
click('#workspaces','材料加工');assert(w.document.querySelector('#categories button.active').textContent==='填充','material category is restored independently');
dom.window.close();console.log('PASS four work areas: separate glove/shoe lists, research/unlock/pair delivery, shared materials, clothing-only tools, independent searches/drafts and one active job across navigation.');

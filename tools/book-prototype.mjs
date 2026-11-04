// Isolated acceptance controls; all reading, merging and consumption use production code.
const g=window,$=s=>document.querySelector(s),I=()=>g.InventoryEquipment;
const bookId='book_anatomy_textbook',skillId='special_meridian_studies';
if(!g.__BOOK_PROTOTYPE_MEMORY__)throw Error('Book review requires isolated storage');
await g.__BOOK_PROTOTYPE_READY__;
g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();
await new Promise(r=>setTimeout(r,50));
if(!g.SceneApp.creation.confirm({name:'书籍验收',height:178,gender:'male',hand:'right',leg:'right'}))throw Error('Unable to create review character');
await new Promise(r=>setTimeout(r,50));g.DialogueUI.close();g.GameEngine.setState('M0_Base_Inside_lv_1',10,7);
const initial=I().getState();initial.equipment.backpack=g.BackpackSystem.generate('eq_backpack_light_canvas',[]);
initial.skills.survival_language={level:10,move_usage:{},study_exp:0};initial.inventory_pocket=[];initial.inventory_vest=[];initial.inventory_vehicle=[];initial.bound_vehicle_id=null;initial.ground_items={};
I().setState(initial);const baseInventory=JSON.stringify(I().getState());
function selectBook(){
 const item=I().getState().inventory_backpack.find(x=>x.item_id===bookId);
 if(!item)return;const slot=$('[data-bp-id="'+item.instance_id+'"]');slot?.click();slot?.scrollIntoView({block:'nearest'});
}
function scenario(key){
 g.BookReading.pause();g.SceneApp.closePublicModal('modal-backpack');g.BookReading.restore(null);
 const s=JSON.parse(baseInventory),config={first:[1,0,0],near:[1,0,9998],almost:[99,12,0],full:[100,12,0],learned:[23,23,0]}[key]||[1,0,0];
 s.skills[skillId]={level:config[1],book_exp:config[2],book_total_exp:config[2],study_exp:0,move_usage:{}};s.potential=10000;
 s.inventory_backpack=[{item_id:bookId,count:1,attribute_state:{knowledge:{book:{version:1,fragments:config[0]}}}},{item_id:'food_flatbread_plain',count:2},{item_id:'textile_cotton_cloth',count:3}];
 I().setState(s);g.Survival.setState({energy:100,stamina:100,fatigue:0,satiety:100,thirst:100,isDead:false,isComa:false});
 g.SceneApp.openBackpackPanel();g.SceneHud.refresh('status');g.SceneApp.panelApi.changed();setTimeout(selectBook,50);
}
document.title='书籍 · 正式交互验收';document.body.classList.add('book-review');
document.body.insertAdjacentHTML('beforeend','<aside id="book-review-controls" aria-label="验收控制"><div><strong>书籍验收</strong><select id="book-review-scenario" aria-label="验收场景"><option value="first">首次获得 · 1/100</option><option value="near">临近升级 · 9998/10000经验</option><option value="almost">差一份 · 99/100</option><option value="full">完整教材 · 100/100</option><option value="learned">当前内容已掌握</option></select><button id="book-review-collect">探索获得 1 份</button><button id="book-review-reset">重置场景</button><button id="book-review-reopen">打开背包</button></div><p>隔离验收 · 不写入正式存档 · 每级1万经验，满级100万</p></aside>');
$('#book-review-collect').onclick=()=>{const r=g.InventoryTransfer.receive({item_id:bookId,count:1});if(!r.ok)g.BookPanel.notify(r.message);g.SceneApp.panelApi.changed();setTimeout(selectBook,50);};
$('#book-review-reset').onclick=()=>scenario($('#book-review-scenario').value);
$('#book-review-reopen').onclick=()=>{g.SceneApp.openBackpackPanel();setTimeout(selectBook,50);};
$('#book-review-scenario').onchange=e=>scenario(e.target.value);
scenario('first');

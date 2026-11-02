// Real gameplay renderer and transfers, fresh browser storage only.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const origin=process.env.GROUND_ITEMS_ORIGIN||'http://127.0.0.1:8037';
const out=process.env.GROUND_ITEMS_OUT||'reference/ground-items-v1/runtime';
async function painted(page,piles,bags){
 await page.waitForFunction(({piles,bags})=>{
  const p=window.reviewFrame?.pawnPaints||[];
  return p.filter(x=>x.image.src.endsWith('ground-items-v1/pile.png')).length===piles&&p.filter(x=>x.image.src.endsWith('ground-backpack-v1/closed.png')).length===bags;
 },{piles,bags},{timeout:10000});
}
async function setup(page,full){
 await page.route('**/js/core/tile-renderer-v2.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\n;{const create=TileRendererV2.create;TileRendererV2.create=(...args)=>{const r=create(...args),set=r.setEffectsRenderer;r.setEffectsRenderer=fn=>set(f=>{window.reviewFrame=f;fn?.(f);});window.reviewRenderer=r;return r;};}'});});
 await page.goto(origin+'/?no_reload'+(full?'&ui=svelte-hud':''));
 await page.waitForFunction(()=>window.SceneApp?.openCharacterCreationAfterIntro);
 await page.evaluate(()=>AppBoot.ready);
 await page.evaluate(()=>{DialogueUI.close();SceneApp.openCharacterCreationAfterIntro();});
 await page.locator('#creation-name').fill('地面散物检查');await page.locator('#btn-confirm-creation').click();
 // The drawing contract can also run before the separate backpack UI rollout.
 const inventoryUi=await page.evaluate(()=>!!(window.BackpackPanel&&window.BackpackSystem&&window.InventoryTransfer));
 if(!inventoryUi)return false;
 await page.evaluate(()=>{
  DialogueUI.close();GameEngine.setState('M0_Base_Inside_lv_1',5,12);SceneCtx.setFacingDir(2);
  const I=InventoryEquipment,s=I.getState();s.equipment.backpack=BackpackSystem.generate('eq_backpack_light_canvas');
  s.inventory_pocket=[];s.inventory_backpack=[];s.ground_items={};I.setState(s);
  I.addItemToGround('M0_Base_Inside_lv_1',5,12,{item_id:'material_iron_blank_common',count:3});
  I.addItemToGround('M0_Base_Inside_lv_1',5,12,{item_id:'textile_cotton_cloth',count:1});
  I.addItemToGround('M0_Base_Inside_lv_1',5,12,BackpackSystem.generate('eq_backpack_multi_pocket'));
  window.reviewSnapshot=SaveSystem.buildSnapshotForDebug();SceneRenderer.render();
 });
 return true;
}
async function checkExistingInventory(page,mode){
 await page.evaluate(()=>{
  DialogueUI.close();GameEngine.setState('M0_Base_Inside_lv_1',5,12);SceneCtx.setFacingDir(2);
  const s=InventoryEquipment.getState();s.ground_items={};InventoryEquipment.setState(s);
  InventoryEquipment.addItemToGround('M0_Base_Inside_lv_1',5,12,{item_id:'material_iron_blank_common',count:3});
  InventoryEquipment.addItemToGround('M0_Base_Inside_lv_1',5,12,{item_id:'textile_cotton_cloth',count:1});
  window.reviewSnapshot=SaveSystem.buildSnapshotForDebug();SceneRenderer.render();
 });
 await painted(page,1,0);await page.screenshot({path:out+'/'+mode+'-existing-items.png'});
 await page.evaluate(()=>{InventoryEquipment.removeItemFromGround('M0_Base_Inside_lv_1',5,12,0);SceneRenderer.render();});await painted(page,1,0);
 await page.evaluate(()=>{InventoryEquipment.removeItemFromGround('M0_Base_Inside_lv_1',5,12,0);SceneRenderer.render();});await painted(page,0,0);
 await page.screenshot({path:out+'/'+mode+'-existing-empty.png'});
 assert.equal(await page.locator('#action-bar-ground').isVisible(),false);
 assert.equal(await page.evaluate(()=>SaveSystem.applySnapshotForDebug(window.reviewSnapshot)),true);
 await page.evaluate(()=>SceneRenderer.render());await painted(page,1,0);
 await page.evaluate(()=>{const item=InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12)[0];Survival.setState({tickCount:item.ground_drop_tick+99});Survival.advanceTick();SceneRenderer.render();});await painted(page,0,0);
 assert.equal(await page.evaluate(()=>InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12).length),0);
 return {mode,passed:true,scope:'existing inventory drawing',checks:['partial removal','last removal','world-tick cleanup','save restoration'],unavailable:['backpack transfer UI','dungeon integration']};
}
(async()=>{
 const browser=await chromium.launch({headless:true}),results=[];fs.mkdirSync(out,{recursive:true});
 try{for(const mode of ['native','svelte']){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));console.log(mode+': loading');const inventoryUi=await setup(page,mode==='svelte');page.setDefaultTimeout(8000);
  if(!inventoryUi){results.push(await checkExistingInventory(page,mode));assert.deepEqual(errors,[]);console.log(mode+': existing inventory passed');await context.close();continue;}
  await painted(page,1,1);
  await page.screenshot({path:out+'/'+mode+'-mixed.png'});
  const ids=await page.evaluate(()=>InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12).map(x=>x.instance_id));
  await page.locator('#action-bar-ground').click();
  const slot=id=>page.locator('[data-bp-id="'+id+'"]');
  await slot(ids[0]).click();await page.locator('[data-bp-quantity="right"]').fill('1');await page.locator('[data-bp-transfer="right"]').click();
  assert.equal(await page.evaluate(()=>InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12)[0].count),2);await painted(page,1,1);
  await slot(ids[0]).click();await page.locator('[data-bp-transfer="right"]').click();await painted(page,1,1);
  await slot(ids[1]).click();await page.locator('[data-bp-transfer="right"]').click();await painted(page,0,1);
  await page.locator('#backpack-panel-close').click();await page.screenshot({path:out+'/'+mode+'-bag-only.png'});
  await page.locator('#action-bar-ground').click();await page.locator('[data-bp-whole="pickup"]').click();await painted(page,0,0);
  if(await page.locator('#backpack-panel-close').isVisible())await page.locator('#backpack-panel-close').click();await page.screenshot({path:out+'/'+mode+'-empty.png'});
  console.log(mode+': pickup and empty floor passed');
  assert.equal(await page.locator('#action-bar-ground').isVisible(),false);
  await page.evaluate(()=>{
   InventoryEquipment.addItemToGround('M0_Base_Inside_lv_1',5,12,{item_id:'textile_cotton_cloth',count:1});SceneRenderer.render();SceneApp.openGroundItems();
   window.reviewSave=SaveSystem.saveNow;SaveSystem.saveNow=()=>false;
  });
  await painted(page,1,0);await page.locator('[data-bp-side="right"]').click();await page.locator('[data-bp-transfer="right"]').click();await painted(page,1,0);
  assert.equal(await page.evaluate(()=>InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12).length),1);
  await page.evaluate(()=>{SaveSystem.saveNow=window.reviewSave;SceneApp.openGroundItems();});await page.locator('[data-bp-side="right"]').click();await page.locator('[data-bp-transfer="right"]').click();await painted(page,0,0);await page.locator('#backpack-panel-close').click();
  await page.evaluate(()=>{InventoryEquipment.addItemToGround('M0_Base_Inside_lv_1',5,12,{item_id:'textile_cotton_cloth',count:1});SceneRenderer.render();});await painted(page,1,0);
  await page.evaluate(()=>{const item=InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12)[0];Survival.setState({tickCount:item.ground_drop_tick+99});Survival.advanceTick();SceneRenderer.render();});await painted(page,0,0);
  assert.equal(await page.evaluate(()=>InventoryEquipment.getGroundItemsAt('M0_Base_Inside_lv_1',5,12).length),0,'normal world tick cleans the floor');
  assert.equal(await page.evaluate(()=>SaveSystem.applySnapshotForDebug(window.reviewSnapshot)),true);await page.evaluate(()=>SceneRenderer.render());await painted(page,1,1);
  console.log(mode+': rollback, cleanup and restore passed');
  // The dungeon sends the same visibility-filtered ground counts to the renderer.
  assert.equal(await page.evaluate(()=>{GameEngine.setState('M0_Field_02',7,7);return DungeonRuntime.enter();}),true);
  await page.evaluate(()=>{const p=GameEngine.getState();InventoryEquipment.addItemToGround(p.mapId,p.x,p.y,{item_id:'textile_cotton_cloth',count:1});SceneRenderer.render();});await painted(page,1,0);
  await page.screenshot({path:out+'/'+mode+'-dungeon.png'});
  const removed=await page.evaluate(()=>{const T=InventoryTransfer,p=GameEngine.getState(),item=InventoryEquipment.getGroundItemsAt(p.mapId,p.x,p.y)[0];const r=T.move({from:T.context('ground'),to:T.context('backpack'),id:item.instance_id,count:1});SceneRenderer.render();return r;});assert.equal(removed.ok,true,removed.message);await painted(page,0,0);
  assert.deepEqual(errors,[]);results.push({mode,passed:true,checks:['partial pickup','last loose item','bag remains','all empty','save rollback','world-tick cleanup','save restoration','dungeon pickup']});console.log(mode+': passed');await context.close();
 }
 fs.writeFileSync(out+'/checks.json',JSON.stringify(results,null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

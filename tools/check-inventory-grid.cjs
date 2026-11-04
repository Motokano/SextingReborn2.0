// Real-browser checks use fresh, isolated browser storage; never the player's save.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const origin=process.env.INVENTORY_ORIGIN||'http://127.0.0.1:8037';
async function setup(page,full){
 await page.route('**/js/core/tile-renderer-v2.js*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text())+'\n;{const create=TileRendererV2.create;TileRendererV2.create=(...args)=>{const r=create(...args),set=r.setEffectsRenderer;r.setEffectsRenderer=fn=>set(f=>{window.reviewFrame=f;fn?.(f);});window.reviewRenderer=r;return r;};}'});
 });
 await page.goto(origin+'/?no_reload'+(full?'&ui=svelte-hud':''));
 await page.waitForFunction(()=>window.SceneApp?.openCharacterCreationAfterIntro&&window.BackpackPanel);
 await page.evaluate(()=>AppBoot.ready);
 await page.evaluate(()=>{DialogueUI.close();SceneApp.openCharacterCreationAfterIntro();});
 await page.locator('#creation-name').fill('背包交互验收');
 await page.locator('#btn-confirm-creation').click();
 await page.evaluate(()=>{
  DialogueUI.close();GameEngine.setState('M0_Base_Inside_lv_1',5,12);SceneCtx.setFacingDir(2);
  Survival.setState({isDead:false,isComa:false,stamina:100,energy:100,thirst:100});
  const I=InventoryEquipment,s=I.getState();
  s.equipment=Object.fromEntries(Object.keys(s.equipment).map(k=>[k,null]));
  s.equipment.clothing={item_id:'eq_clothing_combat_suit'};
  s.equipment.backpack=BackpackSystem.generate('eq_backpack_light_canvas');
  s.inventory_pocket=[];s.inventory_vest=[];s.inventory_vehicle=[];s.ground_items={};
  s.inventory_backpack=[{item_id:'material_iron_blank_common',count:5},null,{item_id:'tool_flask_iron_water',count:1,attribute_state:{structure:{liquid_storage:{version:1,water:125}}}}];
  I.setState(s);SceneApp.openBackpackPanel();
 });
 await page.locator('[data-bp-zone="backpack"] [data-bp-id]').first().waitFor();
}
async function drag(page,from,to,touch=false){
 await to.scrollIntoViewIfNeeded();await from.scrollIntoViewIfNeeded();
 const a=await from.boundingBox(),b=await to.boundingBox();assert.ok(a&&b);
 const x=a.x+a.width/2,y=a.y+a.height/2,tx=b.x+b.width/2,ty=b.y+Math.min(35,b.height/2);
 if(touch){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(tx-x)*i/8,y:y+(ty-y)*i/8}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(tx,ty,{steps:8});await page.mouse.up();}
 await page.waitForTimeout(80);
}
async function counts(page){return page.evaluate(()=>({bag:InventoryEquipment.getBackpackArray().filter(Boolean).map(x=>[x.item_id,x.count]),pocket:InventoryEquipment.getPocketArray().filter(Boolean).map(x=>[x.item_id,x.count]),valid:InventoryEquipment.auditItemOwnership().ok}));}
(async()=>{const browser=await chromium.launch({headless:true}),results=[];fs.mkdirSync('tmp/inventory-grid',{recursive:true});try{
 for(const mode of ['native','svelte','touch']){
  const touch=mode==='touch',context=await browser.newContext({viewport:{width:touch?390:1280,height:touch?844:900},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));console.log(mode+': loading');await setup(page,mode==='svelte');console.log(mode+': ready');
  const right=page.locator('[data-bp-zone="backpack"]'),left=page.locator('[data-bp-zone="pocket"]');
  await page.screenshot({path:`tmp/inventory-grid/${mode}-worn.png`});
  const items=await page.evaluate(()=>InventoryEquipment.getBackpackArray().filter(Boolean).map(x=>({id:x.instance_id,item:x.item_id}))),iron=items[0].id,water=items[1].id;
  const slot=id=>page.locator(`[data-bp-id="${id}"]`);
  await drag(page,slot(water),left,touch);assert.equal((await counts(page)).pocket[0][0],'tool_flask_iron_water');
  assert.equal(await page.evaluate(id=>InventoryEquipment.getPocketArray()[0].instance_id===id&&InventoryEquipment.getPocketArray()[0].attribute_state.structure.liquid_storage.water===125,water),true);
  await drag(page,slot(water),right,touch);assert.equal((await counts(page)).pocket.length,0);
  await slot(iron).click();await page.locator('[data-bp-quantity="backpack"]').fill('2');
  await drag(page,slot(iron),left,touch);assert.equal((await counts(page)).pocket.length,2);assert.equal((await counts(page)).bag[0][1],3);
  // An unselected whole stack does not fit into the remaining single pocket slot.
  await page.locator('.bp-detail-close').click();const before=await counts(page);
  await drag(page,slot(iron),left,touch);assert.deepEqual(await counts(page),before);
  await drag(page,slot(iron),page.locator('.bp-title'),touch);assert.deepEqual(await counts(page),before);
  await page.evaluate(()=>{window.realSave=SaveSystem.saveNow;SaveSystem.saveNow=()=>false;});
  await drag(page,slot(water),left,touch);assert.deepEqual(await counts(page),before);
  await page.evaluate(()=>{SaveSystem.saveNow=window.realSave;});
  await drag(page,slot(water),left,touch);assert.equal((await counts(page)).pocket.length,3);
  await page.locator('[data-bp-whole="drop"]').click();
  await page.evaluate(()=>SceneApp.closePublicModal('modal-backpack'));
  const point=await page.evaluate(()=>{const p=GameEngine.getState(),c=reviewRenderer.getCellCenter(p.x,p.y),r=document.querySelector('#map-grid').getBoundingClientRect();return{x:r.left+c.x,y:r.top+c.y};});
  await page.waitForTimeout(250);await page.screenshot({path:`tmp/inventory-grid/${mode}-ground-map.png`});
  await page.waitForFunction(()=>window.reviewFrame?.pawnPaints.some(p=>p.image.src.endsWith('ground-backpack-v1/closed.png')));
  const painted=await page.evaluate(()=>{const f=reviewFrame,p=f.pawnPaints.find(p=>p.image.src.endsWith('ground-backpack-v1/closed.png'));return {width:p.width,scale:p.scale,tile:f.projection.tileWidth};});
  assert.ok(Math.abs(painted.width-1034*32/723)<1e-6);assert.ok(Math.abs(painted.scale-painted.tile/144)<1e-6);
  await page.mouse.click(point.x,point.y);
  await page.locator('[data-bp-whole="equip"]').waitFor({timeout:5000});
  assert.ok(await page.evaluate(()=>BackpackPanel.groundContext()?.id));
  await page.screenshot({path:`tmp/inventory-grid/${mode}-ground-window.png`});
  const overflow=await page.evaluate(()=>{const e=document.querySelector('#modal-backpack .panel'),r=e.getBoundingClientRect();return {width:r.width,x:r.x,right:r.right,scroll:e.scrollWidth,client:e.clientWidth};});
  assert.ok(overflow.x>=0&&overflow.right<=(touch?390:1280)&&overflow.scroll<=overflow.client+1,JSON.stringify(overflow));
  await page.evaluate(()=>{const p=GameEngine.getState();GameEngine.setState(p.mapId,p.x+1,p.y);SceneHud.refresh('status');});
  await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>SceneApp.panelApi.getOpen('backpack')),false);
  assert.equal(await page.locator('.bp-drag-ghost').count(),0);assert.deepEqual(errors,[]);
  results.push({mode,passed:true,overflow});console.log(mode+': passed');await context.close();
 }
 fs.writeFileSync('tmp/inventory-grid/checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

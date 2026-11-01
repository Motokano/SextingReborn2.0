const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'reference/hideout-facilities-v2');
const origin=process.env.FACILITY_REVIEW_ORIGIN||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1240,height:1000},deviceScaleFactor:2}),errors=[];
  let page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  // Confirm the running game is the checkout being tested, before using it.
  const response=await page.request.get(origin+'/js/core/tile-renderer-v2.js');
  assert.equal(await response.text(),fs.readFileSync(path.join(root,'js/core/tile-renderer-v2.js'),'utf8'));
  await page.goto(origin+'/tools/hideout-facilities-review.html?no_reload');
  await page.waitForFunction(()=>window.reviewReady);
  await page.screenshot({path:path.join(output,'comparison-144px.png'),fullPage:true,scale:'css'});
  console.log('Actual-size comparison captured.');
  await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?no_reload&ui=svelte-hud',{waitUntil:'domcontentloaded'});
  console.log('Game document loaded.');
  await page.waitForFunction(()=>window.AppBoot&&window.SceneApp);
  await page.evaluate(async()=>{await AppBoot.ready;DialogueUI.close();SceneApp.openCharacterCreationAfterIntro();});
  await page.locator('#creation-name').fill('设施外观验收');await page.locator('#btn-confirm-creation').click();
  const target=await page.evaluate(()=>FacilityUnlockConfig.projects.bathroom?'bathroom':'cooking'),asset=target==='bathroom'?'bathroom':'stove';
  await page.evaluate(target=>{
   DialogueUI.close();const [x,y]=FacilityUnlock.get(target).spec.position;GameEngine.setState('M0_Base_Inside_lv_1',x-1,y);SceneCtx.setFacingDir(2);
   window.facilityDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='map-grid-canvas-dynamic'&&args[0].src?.includes('hideout-facilities-v2'))facilityDraws.push(args[0].src);return draw.apply(this,args);};
   SceneRenderer.render();
  },target);
  await page.waitForFunction(asset=>facilityDraws.some(url=>url.endsWith('/'+asset+'-damaged.png')),asset);
  await page.screenshot({path:path.join(output,'map-before.png'),scale:'css'});
  await page.screenshot({path:path.join(output,'map-before-detail.png'),clip:{x:480,y:420,width:270,height:205}});
  await page.evaluate(target=>{
   const model=FacilityUnlock.get(target),items=model.groups.map(group=>({item_id:FacilityUnlockConfig.materials.find(m=>m[1]===group.id&&m[0]!=='hus_wool')[0],count:100}));
   InventoryEquipment.setState({...InventoryEquipment.getState(),inventory_pocket:items});
   if(target==='bathroom')SceneCtx.actions.interactNpc('npc.station.bathroom_base');else FacilityUnlockPanel.open(target);
  },target);
  if(target==='bathroom')await page.getByRole('button',{name:'修复卫生间',exact:true}).click();
  const sequential=await page.evaluate(target=>!!FacilityUnlock.get(target).currentGroup,target);
  const steps=await page.evaluate(target=>FacilityUnlock.get(target).groups.length,target);
  if(!sequential)await page.locator('[data-action="inspect"]').click();
  for(let step=0;step<steps;step++){
   if(!sequential){
    await page.locator('.cr-body nav [data-step="'+step+'"]').click();
    const slider=page.locator('.cr-body input[type="range"]').first();await slider.fill(await slider.getAttribute('max'));continue;
   }
   const slider=page.locator('.cr-current input[type="range"]:not(:disabled)').first();await slider.waitFor();
   await slider.fill(await slider.getAttribute('max'));
   await page.getByRole('button',{name:'修复当前部件',exact:true}).click();
  }
  if(!sequential){await page.locator('.cr-body nav [data-step="'+steps+'"]').click();await page.locator('[data-action="repair"]').click();}
  // The UI's repair action must refresh the map, with no explicit render call.
  await page.waitForFunction(asset=>facilityDraws.some(url=>url.endsWith('/'+asset+'-ready.png')),asset);
  assert.equal(await page.evaluate(target=>FacilityUnlock.get(target).isComplete(),target),true);
  await page.getByRole('button',{name:'完成',exact:true}).click();if(target==='bathroom')await page.locator('#npc-menu-close').click();
  await page.screenshot({path:path.join(output,'map-after.png'),scale:'css'});
  await page.screenshot({path:path.join(output,'map-after-detail.png'),clip:{x:480,y:420,width:270,height:205}});
  const imagePath=await page.evaluate(target=>TileRendererV2.getSpeakerPawn('npc.station.'+target+'_base').url,target);
  assert.ok(imagePath.endsWith('/'+asset+'-ready.png'));
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.AppBoot&&window.SceneApp);await page.evaluate(async()=>{await AppBoot.ready;});
  await page.waitForFunction(target=>FacilityUnlock.get(target).isComplete(),target);
  await page.evaluate(()=>SceneRenderer.render());
  assert.ok((await page.evaluate(target=>TileRendererV2.getSpeakerPawn('npc.station.'+target+'_base').url,target)).endsWith('/'+asset+'-ready.png'));
  assert.deepEqual(errors,[]);console.log('PASS: running checkout, 20 actual-size previews, real browser material sliders, automatic repair redraw, fresh-page persistence, no page errors. Screenshots: '+output);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

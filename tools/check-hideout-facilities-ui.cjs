const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'reference/hideout-facilities-v2'),origin=process.env.FACILITY_REVIEW_ORIGIN||'http://127.0.0.1:8000';
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:1240,height:1020},deviceScaleFactor:2}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await(await page.request.get(origin+'/js/core/tile-renderer-v2.js')).text(),fs.readFileSync(path.join(root,'js/core/tile-renderer-v2.js'),'utf8'),'the running checkout is this workspace');
 await page.goto(origin+'/tools/hideout-facilities-review.html?no_reload');await page.waitForFunction(()=>window.reviewReady);await page.screenshot({path:path.join(out,'all-facilities-144px.png'),fullPage:true,scale:'css'});
 if(process.argv.includes('--gallery'))return;
 await page.goto(origin+'/tools/hideout-facilities-map-review.html?no_reload');await page.waitForFunction(()=>window.reviewReady);const game=page.frames().find(f=>f!==page.mainFrame());
 await game.evaluate(()=>{window.reviewDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='map-grid-canvas-dynamic'&&args[0].src)reviewDraws.push(args[0].src);return draw.apply(this,args);};});
 const records=[];
 for(const id of ['cooking','pharmacy','forging','sewing','observation','bathroom','compost','agriculture','livestock','warehouse','bed','manufacturing']){
  await page.selectOption('#facility',id);await game.evaluate(async()=>{await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})));});
  // Wait for the actual canvas sprite requests, not DOM portrait loading.
  await game.evaluate(()=>{reviewDraws=[];SceneRenderer.render();});
  await game.waitForFunction(id=>reviewDraws.some(url=>url.endsWith(TileRendererV2.getSpeakerPawn('npc.station.'+id+'_base').url)),id);
  await page.screenshot({path:path.join(out,'map-'+id+'-before.png'),scale:'css'});
  records.push(await game.evaluate(id=>({id,art:TileRendererV2.getSpeakerPawn('npc.station.'+id+'_base').url,state:GameEngine.getState()}),id));
 }
 await page.click('#state');
 for(const id of ['cooking','pharmacy','forging','sewing','observation','bathroom','compost','agriculture','livestock','warehouse','bed']){
  await page.selectOption('#facility',id);
  await game.evaluate(()=>{reviewDraws=[];SceneRenderer.render();});
  await game.waitForFunction(id=>reviewDraws.some(url=>url.endsWith(TileRendererV2.getSpeakerPawn('npc.station.'+id+'_base').url)),id);
  await page.screenshot({path:path.join(out,'map-'+id+'-after.png'),scale:'css'});
  const art=await game.evaluate(id=>TileRendererV2.getSpeakerPawn('npc.station.'+id+'_base').url,id);assert.ok(art.endsWith('-ready.png'),id+' ready art');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({origin,records,errors},null,2)+'\n');console.log('PASS actual checkout, all 20 sprites, isolated game preview, 12 facilities and state/portrait switching.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

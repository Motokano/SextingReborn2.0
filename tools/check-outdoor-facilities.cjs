const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ART_PLAYWRIGHT||'playwright-core');
const root=path.resolve('.'),out=process.env.OUTDOOR_REVIEW_DIR||'reference/farm-ranch-5x5-v1',origin='http://outdoor-review.test';
const expectedArt=Object.fromEntries(JSON.parse(fs.readFileSync('assets/map/isometric/farm-ranch-5x5-v1/manifest.json')).assets.map(a=>[a.id,a.file]));
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});const reports=[];
 try{for(const full of [false,true]){
  const ctx=await browser.newContext({viewport:{width:1560,height:1000},deviceScaleFactor:1});
  await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();const file=path.resolve(root,decodeURIComponent(u.pathname).slice(1));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page:',e.message);});
  await page.goto(origin+'/tools/outdoor-facilities-review.html?no_reload'+(full?'&ui=svelte-hud':''));await page.waitForFunction(()=>document.body.dataset.outdoorRuntimeReady==='true');
  for(const id of ['farm','ranch']){
   await page.evaluate(id=>outdoorReviewGo(id),id);await page.waitForTimeout(1300);
   await page.screenshot({path:out+'/'+id+'-runtime-'+(full?'svelte':'native')+'.png'});
   const style=await page.addStyleTag({content:'#hud-layer,#player-action-bubble{visibility:hidden!important}'});
   await page.screenshot({path:out+'/'+id+'-scene-'+(full?'svelte':'native')+'.png'});await style.evaluate(el=>el.remove());
   const system=id==='farm'?'agriculture':'livestock';
   const info=await page.evaluate(async system=>{await NPCSystem.openMenu('npc.station.'+system+'_base');return {position:GameEngine.getState(),adjacent:FacilityLabor.nearby(system),art:TileRendererV2.getSpeakerPawn('npc.station.'+system+'_base').url};},system);
   assert.equal(info.adjacent,true);assert.ok(info.art.endsWith(expectedArt[id]));
   await page.getByRole('button',{name:id==='farm'?'管理农田':'管理牧场',exact:true}).click();
   assert.equal(await page.locator('#modal-'+system).evaluate(el=>el.classList.contains('show')),true);
   await page.screenshot({path:out+'/'+id+'-panel-'+(full?'svelte':'native')+'.png'});
   reports.push({ui:full?'svelte':'native',id,...info});
  }
  assert.deepEqual(errors,[]);await ctx.close();
 }
 fs.writeFileSync(out+'/runtime-checks.json',JSON.stringify({date:'2026-11-04',pageErrors:[],checks:reports},null,2)+'\n');console.log(JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

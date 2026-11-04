// Fresh browser contexts only. Never read or alter the player's profile/storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const origin=process.env.DEATH_ORIGIN||'http://127.0.0.1:8043';
(async()=>{
 const browser=await chromium.launch({headless:true});fs.mkdirSync('tmp/death-ui',{recursive:true});
 try {for(const mode of (process.env.DEATH_MODE?[process.env.DEATH_MODE]:['native','svelte','touch'])){
  const ctx=await browser.newContext({viewport:{width:mode==='touch'?390:1280,height:mode==='touch'?844:800},hasTouch:mode==='touch',isMobile:mode==='touch'});
  // Serve the exact workspace files through interception; no network permissions needed.
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   const file=path.resolve('.',decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname).slice(1));
   if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
   return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=origin+'/?no_reload'+(mode==='svelte'?'&ui=svelte-hud':'');
  await page.goto(url);await page.evaluate(()=>AppBoot.ready);
  await page.evaluate(()=>{
   DialogueUI.close();CharacterAttributes.setState({character_creation_completed:true,characterName:'死亡验收',part_destroy:{chest:68}});
   GameLog.clear();GameLog.log('── 地痞攻击你 ──','combat');GameLog.log('部位：胸部','damage');
   CharacterAttributes.applyCombatDestroy('chest',32);
   GameLog.log('本击结算：最终伤害 32，未招架','damage');
  });
  await page.waitForFunction(()=>DeathSystem.getState().current?.phase==='awaiting_revival');
  await page.keyboard.press('Escape');assert(await page.locator('#death-panel').isVisible());
  assert.equal(await page.locator('.death-title').count(),0);
  assert.equal(await page.locator('.death-records').innerText().then(t=>t.includes('最终伤害 32')),true);
  assert.equal(await page.locator('.death-records .is-final').innerText().then(t=>t.includes('100/100')),true);
  await page.screenshot({path:`tmp/death-ui/${mode}-waiting.png`});
  const saved=await page.evaluate(()=>localStorage.getItem(SaveSystem.getStatus().realtimeKey));
  const other=await ctx.newPage();other.on('pageerror',e=>errors.push('other: '+e.message));await other.goto(url);
  await other.waitForFunction(()=>document.querySelector('#death-panel')?.textContent.includes('另一个窗口'),null,{timeout:20000});
  assert(await other.locator('#death-panel').innerText().then(t=>t.includes('另一个窗口')));
  assert.equal(await other.evaluate(()=>localStorage.getItem('cabi_realtime_save_v1')),saved);
  await other.close();
  await page.getByRole('button',{name:'回藏身处复活',exact:true}).click();
  await page.waitForFunction(()=>DeathSystem.getState().current.phase==='revival_scene');
  await page.waitForFunction(()=>DialogueUI.isDialogueOpen()&&!DialogueUI.getView().typing);
  assert.equal(await page.locator('#death-panel #dialogue-text').innerText(),'变...求...00001号，...准');
  assert.equal(await page.locator('.vessel-line').count(),0);
  if(mode==='native')await page.waitForTimeout(6500);
  await page.keyboard.press('Escape');assert(await page.locator('#death-panel #dialogue-panel').isVisible());
  await page.screenshot({path:`tmp/death-ui/${mode}-vessel.png`});
  assert.equal(await page.evaluate(()=>Survival.isDead()),true);
  await page.keyboard.down('ArrowRight');
  if(mode==='svelte')await page.keyboard.press('Enter');
  else if(mode==='touch')await page.getByRole('button',{name:'结束',exact:true}).tap();
  else await page.getByRole('button',{name:'结束',exact:true}).click();
  await page.waitForFunction(()=>DeathSystem.getState().current.phase==='revived',null,{timeout:15000});
  assert.equal(await page.evaluate(()=>GameEngine.getState().mapId),'M0_Base_Inside_lv_1');
  const at=await page.evaluate(()=>JSON.stringify(GameEngine.getState()));
  await page.keyboard.down('ArrowRight');assert.equal(await page.evaluate(()=>JSON.stringify(GameEngine.getState())),at);
  await page.keyboard.up('ArrowRight');
  assert.equal(await page.locator('#death-panel').isVisible(),false);
  assert.equal(await page.locator('#death-panel #dialogue-panel').count(),0);
  // Reuse the ordinary dialogue after the cutscene; its host and controls survived.
  await page.evaluate(()=>DialogueUI.playLinesRich([{speaker:'narration',text:'普通对话回归'}]));
  await page.waitForFunction(()=>!DialogueUI.getView().typing);
  assert(await page.locator('#dialogue-panel').isVisible());
  await page.keyboard.press('Enter');await page.waitForFunction(()=>!DialogueUI.isDialogueOpen());
  await page.reload();await page.evaluate(()=>AppBoot.ready);
  assert.equal(await page.evaluate(()=>DeathSystem.getState().deathCount),1);
  assert.deepEqual(errors,[]);console.log('PASS browser '+mode+': shared dialogue, single line, session lock, completion revival, host restoration, reload');
  await ctx.close();
 }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="livestock-overview-grid"></div>');
 await page.evaluate(({strings})=>{window.UIText={t:(key,vars={})=>(strings[key]||key).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'')};window.InventoryEquipment={getSkillLevel:()=>100};},{strings:JSON.parse(read('data/ui_text_zhCN.json'))});
 for(const file of ['js/livestock-state.js','js/livestock-panel.js'])await page.addScriptTag({content:read(file)});
 await page.evaluate(({species,modules,perks})=>{LivestockState.setConfig(species.species,modules.modules,perks.perks,{}, {},species.pasture_rules);LivestockState.initDemoState();for(let i=0;i<10;i++)LivestockState.admitAnimal('pig','z1',{perks:[]});LivestockPanel.render();},{species:JSON.parse(read('data/livestock-species.json')),modules:JSON.parse(read('data/livestock-modules.json')),perks:JSON.parse(read('data/livestock-perks.json'))});
 assert((await page.locator('.capacity-summary').innerText()).includes('30/30'));
 await page.evaluate(()=>{LivestockState.admitAnimal('pig','z1',{perks:[]});LivestockState.getState().animals[0].pregnant={remaining_ticks:100,children:[{species_id:'pig',gender:'female',perks:[]}]};LivestockPanel.render();});
 const text=await page.locator('.capacity-summary').innerText();assert(text.includes('33/30')&&text.includes('36')&&text.includes('84%'));assert.deepEqual(errors,[]);
 console.log('PASS browser renders soft capacity, overload and pending birth forecast from actual runtime');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

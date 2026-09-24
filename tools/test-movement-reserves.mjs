import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const cfg=JSON.parse(read('data/survival-config.json'));
function world(legacy=false){const c=vm.createContext({console});c.window=c;c.globalThis=c;for(const f of ['food-metabolism','game-time','survival','game-engine'])vm.runInContext(read('js/'+f+'.js'),c);c.Survival.setConfig(legacy?{...cfg,food_model:null}:cfg);c.Survival.setState({stamina:100,satiety:80,thirst:80});c.GameEngine.setMaps({test:{width:5,height:5,enemies:[],npcs:[],portals:[]}});c.GameEngine.setState('test',1,1);return c;}
for(const legacy of [false,true]){
 const c=world(legacy),S=c.Survival,E=c.GameEngine;
 const start=c.GameTime.getState().totalTicks;
 S.setResting(true); // Moving must not buy recovery before the UI cancels rest.
 for(let i=0;i<4;i++){assert.equal(E.moveTo(i%2?1:2,1),true);S.consumeStamina(.25,{source:'movement'});}
 assert.equal(S.getState().satiety,80);assert.equal(S.getState().thirst,80);
 assert.equal(c.GameTime.getState().totalTicks-start,4);assert.ok(S.getState().stamina<100);
 const tick=S.getState().tickCount;assert.equal(E.moveTo(E.getState().x,1),false);assert.equal(S.getState().tickCount,tick);
 S.setResting(false);for(let i=0;i<4;i++)S.advanceTick();
 assert.ok(S.getState().satiety<80);assert.ok(S.getState().thirst<80);
}
console.log('PASS: actual movement advances time without food/water spending; blocked steps and subsequent normal ticks behave correctly');

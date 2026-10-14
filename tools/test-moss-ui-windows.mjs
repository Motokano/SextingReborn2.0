import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../js/ui-windows.js',import.meta.url),'utf8');
function harness(initial={}){
 const storage=new Map(Object.entries(initial));
 const body={classList:{contains:n=>n==='moss-game'},appendChild(){},removeChild(){}};
 const document={body,readyState:'complete',getElementById(){return null;},addEventListener(){}};
 const context={document,innerWidth:1440,innerHeight:1000,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout,addEventListener(){},MossGameHUD:{registrationComplete:false}};context.window=context;vm.runInNewContext(source,context);
 function el(){const classes=new Set();return {style:{},classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k),contains:k=>classes.has(k)},querySelector:()=>null,getBoundingClientRect:()=>({left:22,top:542,width:340,height:358}),addEventListener(){}};}
 function register(id,extra={}){const node=el();context.UIWindows.registerPanel(id,{el:node,type:'anchored',defaultPos:'dock',foldInPlace:true,...extra});return node;}
 return {context,storage,register,U:context.UIWindows};
}
const key='ui_windows_moss_c_v1';
{
 const h=harness({ui_windows_v1:JSON.stringify({version:1,lock:true,windows:{'win-limbs':{x:5,y:7,w:200,h:100,visible:false},'win-attrs':{visible:false},'win-resources':{visible:false},'win-attr-exp':{visible:false}}})});
 const body=h.register('win-limbs');h.register('win-attrs');h.context.MossGameHUD.registrationComplete=true;h.U.init();assert.equal(h.U.getLock(),true);assert.equal(h.U.getVisible('win-limbs'),false);assert.equal(body.style.left,'');assert.equal(h.U.getVisible('win-attrs'),false);assert.equal(h.storage.has('ui_windows_v1'),true);const saved=JSON.parse(h.storage.get(key));assert.equal(saved.windows['win-resources'],undefined);assert.equal(saved.windows['win-limbs'].x,undefined);console.log('PASS C migration keeps visibility/lock, drops obsolete geometry and merged entries');
}
{
 const h=harness({[key]:JSON.stringify({version:1,windows:{'win-survival':{visible:true,folded:true},'win-carry':{visible:false}}})});h.register('win-log');h.U.init();assert.equal(JSON.parse(h.storage.get(key)).windows['win-carry'].visible,false);const survival=h.register('win-survival');h.register('win-carry');h.context.MossGameHUD.registrationComplete=true;h.U.init();assert.equal(survival.classList.contains('folded'),true);assert.equal(h.U.getVisible('win-carry'),false);h.U.setFolded('win-survival',false);assert.equal(survival.classList.contains('folded'),false);assert.equal(JSON.parse(h.storage.get(key)).windows['win-survival'].folded,undefined);console.log('PASS staged registration preserves late windows and folded state');
}
{
 const h=harness({[key]:JSON.stringify({version:1,windows:{'win-survival':{folded:'true'},'win-garbage':{visible:false}}})});const node=h.register('win-survival');h.context.MossGameHUD.registrationComplete=true;h.U.init();assert.equal(node.classList.contains('folded'),false);assert.equal(JSON.parse(h.storage.get(key)).windows['win-garbage'],undefined);h.register('old-resource',{menuHidden:true});assert.equal(h.U.getPanelList().some(x=>x.id==='old-resource'),false);console.log('PASS invalid folds/unknown IDs discarded after complete registration; obsolete menu entries hidden');
}

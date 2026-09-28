import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let dialog,clears=0,reloads=0,focused=0,success=true;
function element(){return {style:{},listeners:{},addEventListener(k,f){this.listeners[k]=f;},focus(){},setAttribute(){},remove(){this.removed=true;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close();}};}
const context={document:{body:{appendChild(d){dialog=d;}},createElement(){const d=element(),parts={};d.querySelector=k=>parts[k]||(parts[k]=element());return d;}}};context.window=context;context.confirm=()=>{throw Error('native confirm must not be used');};
vm.runInNewContext(fs.readFileSync(new URL('../js/reset-progress-dialog.js',import.meta.url),'utf8'),context);
const api=context.ResetProgressDialog,options={message:'确认删除',button:{focus(){focused++;}},clear(){clears++;return success;},reload(){reloads++;}};
api.open(options);assert.equal(dialog.open,true);assert.equal(clears,0);const first=dialog;api.open(options);assert.equal(dialog,first,'single confirmation');
dialog.querySelector('[data-cancel]').listeners.click();assert.equal(clears,0);assert.equal(api.isOpen(),false);assert.equal(focused,1);
api.open(options);success=false;dialog.querySelector('[data-delete]').listeners.click();assert.equal(reloads,0);assert.ok(dialog.querySelector('[data-error]').textContent);assert.equal(dialog.querySelector('[data-delete]').disabled,false);
success=true;dialog.querySelector('[data-delete]').listeners.click();assert.equal(reloads,1);dialog.querySelector('[data-delete]').listeners.click();assert.equal(reloads,1,'duplicate submission ignored');
dialog.close();api.open({...options,clear(){throw Error('storage denied');}});dialog.querySelector('[data-delete]').listeners.click();assert.equal(reloads,1);assert.ok(dialog.querySelector('[data-error]').textContent);
console.log('PASS: visible confirmation, cancel, failure/exception feedback, retry, duplicate guard; no real data deleted.');

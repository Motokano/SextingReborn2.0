import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const key = (g, name, el = g.document.activeElement) => el.dispatchEvent(new g.KeyboardEvent('keydown', { key:name, bubbles:true, cancelable:true }));
const input = (g, id, value) => { const el=g.document.getElementById(id); el.value=value; el.dispatchEvent(new g.Event('input',{bubbles:true})); return el; };
async function created(h) { h.g.DialogueUI.close(); h.g.SceneApp.openCharacterCreationAfterIntro(); await h.drain(); input(h.g,'creation-name','迁移测试'); await h.drain(); h.g.document.getElementById('btn-confirm-creation').click(); await h.drain(); }

test('dialogue owns full subtree: typing/Enter/choices/escaping/focus and completion execute once', async () => {
  const h=await boot(true),g=h.g,d=g.document;
  try {
    g.DialogueUI.close(); await h.drain();
    const trigger=d.getElementById('btn-backpack'); trigger.focus();
    let done=0;
    g.DialogueUI.playLinesRich([{speaker:'narration',text:'<img src=x>\n旁白'},{speaker:'player',text:'继续'}],{onQueueExhausted:()=>done++}); await h.drain();
    const ticks=g.GameTime.getState().totalTicks;
    key(g,' '); await h.drain();
    assert.equal(g.DialogueUI.getView().typing,false);
    assert.equal(d.querySelector('#dialogue-text img'),null);
    assert.equal(d.querySelector('#dialogue-speaker-name').style.display,'none');
    key(g,'Escape'); assert.equal(g.DialogueUI.isDialogueOpen(),true);
    key(g,'1'); assert.equal(g.GameTime.getState().totalTicks,ticks);
    key(g,'Enter'); await h.drain(); assert.equal(g.DialogueUI.getView().role,'player');
    key(g,'Enter'); key(g,'Enter'); await h.drain();
    assert.equal(done,1); assert.equal(g.DialogueUI.isDialogueOpen(),false); assert.equal(d.activeElement,trigger);
    g.DialogueUI.playLinesRich([{speaker:'npc',text:'选择'}],{options:[{text:'<选择>',next:[{speaker:'player',text:'选中'}]}]}); await h.drain();
    assert.equal(d.querySelector('#dialogue-btn-next').disabled,true);
    d.querySelector('.dlg-option-btn').focus(); key(g,'Enter'); await h.drain();
    assert.equal(g.DialogueUI.getView().role,'player');
    assert.equal(d.querySelectorAll('#dialogue-panel').length,1);
    assert.equal(g.React,undefined); assert.equal(g.DialogueReactView,undefined);
    assert.deepEqual(h.errors,[]);
  } finally { await h.close(); }
});

test('late pawn resolves never replace current speaker or reopen closed dialogue',async()=>{
  const h=await boot(true),g=h.g;
  try{
    let first,second;
    g.DialoguePawn.resolve=(_role,id)=>new Promise(resolve=>{if(id==='a')first=resolve;else second=resolve;});
    g.DialogueUI.say({speakerId:'a',text:'A'}); g.DialogueUI.say({speakerId:'b',text:'B'});
    second('current.png'); await h.drain(); first('stale.png'); await h.drain();
    assert.equal(g.DialogueUI.getView().avatarUrl,'current.png');
    g.DialogueUI.close(); await h.drain(); assert.equal(g.DialogueUI.isDialogueOpen(),false);
  }finally{await h.close();}
});

test('creation retains edits across attribute updates, clamps height, allocates exactly 100, and submits once',async()=>{
  const h=await boot(true),g=h.g,d=g.document;
  try{
    g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
    assert.equal(d.querySelector('#btn-confirm-creation').disabled,true);
    input(g,'creation-name','  林间客  '); input(g,'creation-height','260'); await h.drain();
    d.querySelector('#creation-attr-rows .attr-btn:last-child').click(); await h.drain();
    assert.equal(d.querySelector('#creation-name').value,'  林间客  ');
    const height=d.querySelector('#creation-height');height.dispatchEvent(new g.Event('change',{bubbles:true}));await h.drain();assert.equal(height.value,'210');
    d.querySelector('[name=creation-gender][value=female]').click();d.querySelector('[name=creation-hand][value=left]').click();
    let grants=0;const original=g.InventoryEquipment.initNewGame;g.InventoryEquipment.initNewGame=()=>{grants++;return original();};
    const btn=d.querySelector('#btn-confirm-creation');btn.click();btn.click();await h.drain();
    const state=g.CharacterAttributes.getState();assert.equal(grants,1);assert.equal(state.characterName,'林间客');assert.equal(state.characterGender,'female');assert.equal(state.dominant_hand,'left');
    assert.equal(Object.values(state.innate).reduce((sum,v)=>sum+v,0),100);assert.ok(Object.values(state.innate).every(v=>v<=29));
    assert.equal(g.Survival.getState().height_cm,210);assert.ok(d.querySelector('#character-creation-overlay').classList.contains('hidden'));assert.equal(g.SvelteInteractions.overlays.active(),false);
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('NPC stale loading cancels; real supervisor dialogue leads to creation with original effect',async()=>{
  const h=await boot(true),g=h.g,d=g.document;
  try{
    g.DialogueUI.close(); const pending=g.NPCSystem.openMenu('npc.supervisor.manager');g.NPCSystem.menu.close();await pending;await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),false);
    const readTime=g.GameTime.getState;g.GameTime.getState=()=>({...readTime(),minuteOfDay:0});await g.NPCSystem.openMenu('npc.supervisor.manager');await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),false);g.GameTime.getState=readTime;
    await g.NPCSystem.openMenu('npc.supervisor.manager');await h.drain();assert.equal(g.NPCSystem.isMenuOpen(),true);
    d.querySelector('#npc-menu-buttons button').click();await h.drain();assert.equal(g.DialogueUI.isDialogueOpen(),true);
    for(let i=0;g.DialogueUI.isDialogueOpen() && i<100;i++){g.DialogueUI.next();await h.drain();}
    assert.ok(!d.querySelector('#character-creation-overlay').classList.contains('hidden'));
    assert.equal(g.NPCSystem.isDemoFlagTrue('supervisor_has_talked'),true);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('confirmation failure remains open/retryable, success runs once, keyboard blocks world and restores focus',async()=>{
  const h=await boot(true),g=h.g,d=g.document;
  try{
    await created(h);const opener=d.querySelector('#btn-reset-demo-save');opener.focus();let attempts=0,reloads=0;
    g.ResetProgressDialog.open({button:opener,message:'测试清空',clear:()=>++attempts>1,reload:()=>reloads++});await h.drain();
    const ticks=g.GameTime.getState().totalTicks;key(g,' ');key(g,'1');assert.equal(g.GameTime.getState().totalTicks,ticks);
    d.querySelector('[data-delete]').click();await h.drain();assert.match(d.querySelector('[data-error]').textContent,/重试/);assert.equal(reloads,0);
    d.querySelector('[data-delete]').click();d.querySelector('[data-delete]').click();await h.drain();assert.equal(attempts,2);assert.equal(reloads,1);
    key(g,'Escape');await h.drain();assert.equal(g.ResetProgressDialog.isOpen(),false);assert.equal(d.activeElement,opener);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('navigation, action menu and pins preserve business routes and no duplicate listeners',async()=>{
  const h=await boot(true),g=h.g,d=g.document;
  try{
    await created(h);const before=g.GameTime.getState().totalTicks;
    d.querySelector('#btn-backpack').click();await h.drain();assert.ok(d.querySelector('#modal-backpack').classList.contains('show'));assert.equal(g.GameTime.getState().totalTicks,before);
    key(g,' ');key(g,'1');assert.equal(g.GameTime.getState().totalTicks,before);
    key(g,'Escape');await h.drain();assert.ok(!d.querySelector('#modal-backpack').classList.contains('show'));assert.equal(g.GameTime.getState().totalTicks,before);
    d.querySelector('#btn-player-actions').click();await h.drain();assert.equal(d.querySelector('#btn-player-actions').getAttribute('aria-expanded'),'true');
    [...d.querySelectorAll('.player-action-item-row')].find(row=>row.querySelector('.player-action-item')?.textContent===g.UIText.t('player.action.rest.start')).querySelector('.player-action-pin').click();await h.drain();assert.equal(g.SceneCtx.getActionBarSlots()[0],'action|rest_toggle');
    key(g,'Escape',d.querySelector('#btn-player-actions'));await h.drain();
    d.querySelector('#action-bar-pin-0').click();await h.drain();assert.equal(g.Survival.getState().isResting,true);
    d.querySelector('#action-bar-pin-0').click();await h.drain();assert.equal(g.Survival.getState().isResting,false);
    assert.equal(g.BackgroundMusic,undefined);
    assert.equal(d.querySelector('#btn-bgm'),null);
    assert.equal(d.querySelector('audio'),null);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('structured item details preserve all native template readings and CSS classes without leaking locked values',async()=>{
  const h=await boot(true),g=h.g,d=g.document;
  try{
    const IE=g.InventoryEquipment,char=IE.getCharacterForDisplay();
    function flatten(nodes){return nodes.map(n=>{const el=d.createElement(n.tag);if(n.className)el.className=n.className;if(n.breakLines){n.text.split('\n').forEach((line,i)=>{if(i)el.append(d.createElement('br'));el.append(d.createTextNode(line));});}else el.append(d.createTextNode(n.text));for(const child of flatten(n.children))el.append(child);return el;});}
    for(const character of [char,{...char,skills:new Proxy({}, {get:()=>({level:9999})})}]) for(const id of IE.getAllItemIds()){
      const tpl=IE.getItemTemplate(id),inst={item_id:id,count:1};
      const legacy=d.createElement('div');legacy.innerHTML=g.SceneUi.buildItemTooltipHtmlForTemplate(id,tpl,inst,character);
      const current=d.createElement('div');current.append(...flatten(g.SceneUi.buildItemTooltipView(id,tpl,inst,character)));
      const normalize=el=>el.textContent.replace(/\s+/g,' ').trim();
      assert.equal(normalize(current),normalize(legacy),id+' details');
      assert.deepEqual([...current.querySelectorAll('[class]')].map(n=>n.className),[...legacy.querySelectorAll('[class]')].map(n=>n.className),id+' CSS');
    }
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('belt mouse and digit commands consume one item/tick; hidden knowledge removes slots and stale menus',async()=>{
  const h=await boot(true),g=h.g,d=g.document;
  try{
    await created(h);const IE=g.InventoryEquipment;
    const id=IE.getAllItemIds().find(id=>{const tpl=IE.getItemTemplate(id);return tpl.edible===true && tpl.edible_buff_id && tpl.stack_limit>=3;});assert.ok(id);
    IE.setState({...IE.getState(),inventory_pocket:[{item_id:id,count:3},null,null,null]});g.Survival.setState({satiety:0});g.SceneRenderer.render();await h.drain();
    const slot=d.querySelector('#quick-belt .slot'),tip=d.querySelector('#svelte-item-tooltip'),menu=d.querySelector('.quick-belt-hover-menu');
    slot.getBoundingClientRect=()=>({left:100,right:140,top:100,width:40,height:40});
    tip.getBoundingClientRect=()=>({left:parseFloat(tip.style.left),width:220,height:100});
    menu.getBoundingClientRect=()=>({width:88,height:36});
    slot.click();await h.drain();await new Promise(resolve=>setTimeout(resolve,40));assert.ok(d.querySelector('#svelte-item-tooltip.show'));
    assert.ok(parseFloat(menu.style.left)+88<=parseFloat(tip.style.left),'item actions and details never overlap at the viewport edge');
    const ticks=g.GameTime.getState().totalTicks;
    const use=[...d.querySelectorAll('.quick-belt-hover-btn')].find(el=>el.textContent===g.UIText.t('inv.use'));assert.ok(use);use.click();await h.drain();
    assert.equal(IE.getPocketArray()[0].count,2);assert.equal(g.GameTime.getState().totalTicks,ticks+1);
    key(g,'1',d.body);await h.drain();assert.equal(IE.getPocketArray()[0].count,1);assert.equal(g.GameTime.getState().totalTicks,ticks+2);
    d.querySelector('#quick-belt .slot').click();await h.drain();g.SceneCtx.setLeftHudBlockVisibilityRule('quick_belt',false);g.SceneHud.refresh('status');await h.drain();
    assert.equal(d.querySelectorAll('#quick-belt .slot').length,0);assert.equal(d.querySelector('.quick-belt-hover-menu.show'),null);assert.equal(d.querySelector('#svelte-item-tooltip.show'),null);
    const touch=new g.Event('pointerup',{bubbles:true});Object.defineProperty(touch,'pointerType',{value:'touch'});d.querySelector('.body-reading').dispatchEvent(touch);await h.drain();assert.ok(d.querySelector('#svelte-item-tooltip.show'));
    assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
});

test('old save restoration and native/Svelte context action labels remain equivalent',async()=>{
  const old=await boot(false),next=await boot(true);
  try{
    await created(old); const snapshot=old.g.SaveSystem.buildSnapshotForDebug();
    assert.equal(next.g.SaveSystem.applySnapshotForDebug(snapshot),true);await next.drain();
    assert.equal(next.g.CharacterAttributes.isCharacterCreationCompleted(),true);
    assert.ok(next.g.document.querySelector('#character-creation-overlay').classList.contains('hidden'));
    for(const h of [old,next]){h.g.SceneRenderer.render();await h.drain();}
    for(const id of ['gather','gather-stop','take-water','ground','warehouse']){
      const a=old.g.document.getElementById('action-bar-'+id),b=next.g.document.getElementById('action-bar-'+id);
      assert.equal(b.style.display,a.style.display,id+' visibility');
      if(a.style.display!=='none')assert.equal(b.textContent,a.textContent,id+' label');
    }
    assert.deepEqual(next.errors,[]);assert.deepEqual(old.errors,[]);
  }finally{await old.close();await next.close();}
});

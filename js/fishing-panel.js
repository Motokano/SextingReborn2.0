(function(g){
    'use strict';
    var C, overlay, card, opened=false, lastFocus, prepTab="water", workspace="water", historyPage=0, selectedPart="float", choicePage=0, nestChoice=null;
    var errors={rod_range:'从这里抛不到选中的水面，可以换个岸边站位。',line_short:'这套钓组的线不够长，够不到选中的水面。',depth_line_short:'装上的线不够长，无法按这个深度下钩。',tackle_spec_missing:'这套钓组缺少长度规格，暂时无法使用。',floating_lure:'末端的小物件浮在水面，无法用它确认深处的水底。',lure_not_baited:'这个完整的末端物件没有挂食物的位置。',lure_requires_work:'需要摇柄收线，才能带动水面上的物件。',stamina:'体力不足，无法完成这次动作。',location:'需要在岸边停下，再进行作业。',busy:'先收回钩线或处理当前事件。',unreachable:'从这里无法把工具送到选定水面。',rig_not_found:'随身还没有可以使用的长竿钓组，请先从基地仓库取出。',rig_incomplete:'连接尚未接全，需要先整理部件。',rig_broken:'有部件已经损坏，需要更换。',space:'随身空间不足，请先整理或放流。',pending:'先收取或放流岸边的鱼获，再离开。',snag:'钩线仍被阻挡，先处理阻力或切线。',slot_occupied:'末端已经挂有东西，请先检查或取下。',searched:'这片湿土刚刚翻找过。',warehouse_full:'仓库暂时放不下初始物资，腾出空间后会再次尝试。'};
    function node(tag,text,parent,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;}
    function atPoint(){if(!C||!g.GameEngine)return false;var p=g.GameEngine.getState();return p.mapId===C.entry.map&&p.x===C.entry.x&&p.y===C.entry.y;}
    function allowed(){var S=g.Survival,st=S&&S.getState(),app=g.SceneApp;return atPoint()&&st&&!st.isDead&&!st.isComa&&!st.isResting&&!(g.CombatEngagement&&g.CombatEngagement.isPlayerInCombat())&&!(app&&app.isPreCreationGameplayRestricted())&&!(app&&app.isPlayerActionDisabledByBuff('gather'))&&!(g.SceneCtx&&g.SceneCtx.idleActionType);}
    function configure(c){if(!g.FishingPond.configure(c))throw new Error("钓鱼配置加载失败");C=c;g.FishingPond.setHost({now:function(){return g.GameTime.getState().totalTicks;},allowed:allowed,stamina:function(){return g.Survival.getStamina();},spend:function(n){g.Survival.consumeStamina(n);},tick:function(){g.Survival.advanceTick();}});}
    function init(){if(overlay)return;
        overlay=node('div',null,document.body);overlay.id='fishing-overlay';overlay.hidden=true;
        card=node('section',null,overlay,'fishing-window');card.tabIndex=-1;card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','岸边池塘');
        document.addEventListener('keydown',function(e){if(!opened)return;
            if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
            if(e.key==='Tab'){var ns=card.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary');ns=Array.from(ns).filter(function(n){return n.getClientRects().length>0;});var first=ns[0],last=ns[ns.length-1];if(first&&(!card.contains(document.activeElement)||document.activeElement===card||e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first).focus();}e.stopImmediatePropagation();return;}
            if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].indexOf(e.key)>=0&&card.contains(e.target)){e.stopImmediatePropagation();return;}
            e.stopImmediatePropagation();
        },true);
    }
    function save(){if(g.SaveSystem)g.SaveSystem.saveNow();if(g.SceneHud)g.SceneHud.refresh('status');}
    function action(key,value){var r=g.FishingPond.act(key,value);if(r.ok){historyPage=0;if(key==='nest')workspace='water';if(key==='select')workspace='parts';}render();if(!r.ok)status(errors[r.reason]||'当前条件下无法执行，请检查工具与当前作业。');save();return r;}
    function status(text){var n=card.querySelector('.fishing-notice');if(n)n.textContent=text;}
    function btn(parent,text,key,value,disabled){var b=node('button',text,parent);b.disabled=!!disabled;b.onclick=function(){action(key,value);};return b;}
    function open(){if(!C)return;init();if(!allowed())return;
        var gift=g.FishingPond.grantStarter();lastFocus=document.activeElement;opened=true;render();card.focus();if(!gift.ok)status(errors[gift.reason]);save();
    }
    function close(){var r=action('close');if(!r.ok)return;opened=false;overlay.hidden=true;if(lastFocus&&lastFocus.isConnected)lastFocus.focus();ensureStarterSupplies();}
    function ensureStarterSupplies(){if(!C)return;if(!opened&&g.SceneApp&&!g.SceneApp.isPreCreationGameplayRestricted()&&/Base/.test((g.GameEngine.getState()||{}).mapId)&&!g.FishingPond.getState().starter){var gift=g.FishingPond.grantStarter();if(gift.ok)save();}}
    function choose(parent,label,entries){var l=node('label',label,parent),sel=node('select',null,l);entries.forEach(function(x){var o=node('option',x.name+(x.count?' ×'+x.count:''),sel);o.value=x.key;});return sel;}
    function switchPrep(tab){prepTab=tab;workspace=tab==='gear'?'parts':'water';render();}
    function render(){if(!C)return;init();ensureStarterSupplies();overlay.hidden=!opened;if(!opened)return;
        var v=g.FishingPond.getPublicState(),busy=v.needsRecovery||['ready','ended'].indexOf(v.phase)<0,pt=C.points[v.point];if(busy&&(workspace==='nest'||workspace==='rigs'))workspace=prepTab==='gear'?'parts':'water';card.replaceChildren();
        var head=node('header',null,card,'fishing-header');var title=node('div',null,head);node('small','地表 · 基地附近',title);node('h2','岸边池塘',title);
        node('span',g.GameTime.getState().display,head);var quit=node('button','离开水域',head);quit.onclick=close;
        var layout=node('div',null,card,'fishing-layout'),info=node('aside',null,layout,'fishing-info'),map=node('section',null,layout,'fishing-map-panel'),events=node('aside',null,layout,'fishing-events');
        var sidebar=info;
        var prepTabs=node('nav',null,sidebar,'fishing-prep-tabs');prepTabs.setAttribute('aria-label','准备事项');
        [['water','鱼情'],['gear','钓组']].forEach(function(entry){var b=node('button',entry[1],prepTabs);b.setAttribute('aria-pressed',prepTab===entry[0]);b.onclick=function(){switchPrep(entry[0]);};});
        var waterPane=node('div',null,sidebar,'fishing-prep-pane'),adjustPane=node('div',null,sidebar,'fishing-prep-pane'),gearPane=node('div',null,sidebar,'fishing-prep-pane');
        waterPane.hidden=prepTab!=='water';adjustPane.hidden=true;gearPane.hidden=prepTab!=='gear';info=waterPane;
        node('h2',pt.name,info);node('p',v.light?pt.visible:'光线昏暗，远处水面和细小物件不易看清。',info);
        function fieldAction(label,key,help,record){var group=node('div',null,info,'fishing-field-action');var button=btn(group,label,key,null,busy||!v.reachable);var hint=node('p',help,group,'fishing-muted');hint.id='fishing-help-'+key;button.setAttribute('aria-describedby',hint.id);if(record)node('p',record,group,'fishing-field-record');}
        fieldAction('观察水面 · 1刻','observe','留意这片水面的水纹、气泡和动静。',v.notes.fish?('第 '+v.notes.fishAt+' 刻看到：'+v.notes.fish):null);
        fieldAction(v.knownDepth?'探底 · 2刻':'提竿试水 · 2刻','probe',v.isLure?'末端物件浮在水面，无法用它试探水底。':'把钩线放入这片水中，再轻提竿，感受水下的阻力。',v.notes.bottom?('第 '+v.notes.bottomAt+' 刻试过：'+v.notes.bottom):null);
        info=gearPane;
        if(!v.rigs.length)node('p','基地仓库备有一套工具和少量备用件。请先取到随身物品，再来尝试。',info);
        else{
            var currentRig=v.rigs.find(function(x){return x.key===v.selectedRig;});
            var rigHeading=node('div',null,info,'fishing-rig-heading');node('p',currentRig?'当前钓组：'+currentRig.name:'尚未选定钓组',rigHeading,'fishing-current-rig');
            var changeRig=node('button','更换',rigHeading);changeRig.disabled=busy;changeRig.onclick=function(){workspace='rigs';choicePage=0;render();};
        }
        var partCells={},partList=node('nav',null,gearPane,'fishing-part-list');partList.setAttribute('aria-label','钓组部件');
        if(v.selectedRig&&!busy&&g.ItemAssemblyDisplay){
            var rec=g.InventoryEquipment.findItemInstanceRecord(v.selectedRig);
            if(rec){var assembly=node('div',null,map,'fishing-parts-workspace');assembly.hidden=workspace!=='parts';node('h3','当前钓组',assembly);node('p',busy?'钩线尚未收回；先处理当前作业，再更换部件。':'选择左侧部件，在这里调整或更换。',assembly,'fishing-muted');var tree=node('div',null,assembly);
                tree.innerHTML=g.ItemAssemblyDisplay.renderAssemblyHtml({inst:rec.instance,interactive:true,showWeight:false,wording:{
                    'item.assembly.title':'钓组部件','item.assembly.complete':'所需部件已装齐','item.assembly.incomplete':'还有部件没装上',
                    'item.assembly.attach':'装上 · 1刻','item.assembly.detach':'取下 · 1刻','item.assembly.empty':'这里还没装东西',
                    'item.assembly.choose':'选择要装上的物品','item.assembly.no_candidate':'随身没有能装在这里的物品',
                    slots:{main_line:'长线的位置',reel:'摇柄部件的位置',float:'线上轻物的位置',sinker:'线上重物的位置',leader:'末端短线的位置',hook:'小钩的位置',bait:'钩上挂的东西',lure:'末端小物的位置'}
                }});
                var slotNodes=Array.from(tree.querySelectorAll('.item-assembly-slot')),grid=node('div',null,null,'fishing-parts-grid');
                slotNodes.forEach(function(slot){
                    var ownHead=slot.querySelector('.item-assembly-slot-head'),ownButton=ownHead&&ownHead.querySelector('button[data-slot-id]'),picker=Array.from(slot.children).find(function(x){return x.classList.contains('item-assembly-picker');});
                    var key=(ownButton||picker&&picker.querySelector('button[data-slot-id]')||{}).dataset;key=key&&key.slotId;
                    if(!key){var label=ownHead&&ownHead.querySelector('.item-assembly-slot-label');key='empty-'+Object.keys(partCells).length;}
                    var cell=node('div',null,grid,'fishing-part-cell');partCells[key]=cell;
                    Array.from(slot.children).forEach(function(child){if(!child.classList.contains('item-assembly-children'))cell.appendChild(child);});
                    var head=cell.querySelector('.item-assembly-slot-head'),title=head&&head.querySelector('.item-assembly-slot-label'),partName=head&&head.querySelector('.item-assembly-part-name');
                    var labels={main_line:'主线',leader:'末端短线',float:v.knownFloat?'浮漂':'线上的浮物',sinker:'线上的重物',hook:'鱼钩',bait:'钩上的饵',reel:'绕线部件',lure:'末端小物'};
                    var select=node('button',labels[key]||(title?title.textContent:'部件'),partList);select.dataset.partKey=key;select.onclick=function(){selectedPart=key;workspace='parts';render();};
                    if(partName)node('small',partName.textContent,select);
                    var change=node('details',null,cell,'fishing-part-change');node('summary','更换 / 取下',change);
                    var detach=head&&head.querySelector('button');if(detach)change.appendChild(detach);
                    Array.from(cell.children).forEach(function(child){if(child.classList.contains('item-assembly-picker')||child.classList.contains('item-assembly-no-candidate'))change.appendChild(child);});
                    change.querySelectorAll('button,select').forEach(function(el){el.disabled=busy;});
                });
                var heading=tree.querySelector('.item-assembly-title');tree.replaceChildren();if(heading)tree.appendChild(heading);tree.appendChild(grid);
                tree.onclick=function(e){var b=e.target.closest('button');if(!b)return;var val={host:b.dataset.hostInstance,slot:b.dataset.slotId};
                    if(b.dataset.assemblyDetach)action('detach',val);
                    else if(b.dataset.assemblyAttach){var picker=b.parentNode.querySelector('select'),parts=picker.value.split(':');val.source=parts[0];val.index=Number(parts[1]);action('attach',val);}
                };
            }
        }
        if(busy&&prepTab==='gear'){
            var underway=node('div',null,map,'fishing-parts-workspace');node('h3','钓组正在使用',underway);node('p','先收回钩线，再查看或更换部件。',underway,'fishing-muted');
            if(v.isLure){partCells.reel=node('div',null,underway,'fishing-part-cell');node('h3','绕线部件',partCells.reel);}
        }
        var inspection=node('section',null,gearPane,'fishing-rig-inspection');inspection.setAttribute('aria-label','检查钓组');
        var inspectionHead=node('div',null,inspection,'fishing-inspection-heading');node('h3','检查钓组',inspectionHead);node('span','1刻',inspectionHead,'fishing-muted');
        node('p','查看部件，轻牵细线，检查整套钓组。',inspection,'fishing-muted');
        btn(inspection,'查看并轻牵细线','inspect',null,busy||!v.selectedRig);
        info=partCells.float||adjustPane;
        if(!v.isLure){var dl=node('label',v.knownDepth?'钩放多深':'移动线上的浮物',info,'fishing-depth'),track=node('div',null,dl,'fishing-depth-track'),range=node('input',null,track);range.type='range';range.min=C.depth.min;range.max=Math.max(C.depth.min,v.depthMax);range.step=C.depth.step;range.value=Math.min(v.depth,Number(range.max));range.disabled=busy||v.depthMax<C.depth.min;
        var markerLane=node('div',null,track,'fishing-depth-marker-lane'),marker=node('span',null,markerLane,'fishing-depth-marker'),position=Math.max(0,Math.min(100,(v.depth-C.depth.min)/Math.max(1,Number(range.max)-C.depth.min)*100));marker.style.left=position+'%';var markerText=node('span','当前位置',marker);markerText.style.transform='translateX(-'+position+'%)';
        var ends=node('div',null,dl,'fishing-depth-ends');node('span',v.knownDepth?'浅':'靠近钩',ends);node('span',v.knownDepth?'深':'远离钩',ends);
        var val=node('output',null,dl);val.setAttribute('aria-live','polite');
        var depthHelp=node('p',v.knownDepth?'调整浮物到钩的线长：距离越长，钩放得越深。这是你的设定，不是测得的水深；水底较浅时，钩会先触底。':'沿着线移动浮物，改变它与钩的距离。放入水中后，可以观察变化。',info,'fishing-muted');depthHelp.id='fishing-depth-help';range.setAttribute('aria-describedby',depthHelp.id);
        var depthButton=btn(info,'','depth',null,true);
        function updateDepth(){var next=Number(range.value),changed=next!==v.depth;var current=(v.depth/10).toFixed(1),selected=(next/10).toFixed(1);val.textContent=v.knownDepth?('当前设定：约 '+current+' 米'+(changed?' → 约 '+selected+' 米（未调整）':'')):(changed?'已选好新位置，还未移动浮物。':'浮物仍在当前位置。');range.setAttribute('aria-valuetext',v.knownDepth?'约 '+selected+' 米':(next<=v.depth?'靠近钩的一侧':'远离钩的一侧'));depthButton.textContent=changed?'调整到这里 · 1刻':'尚未改变位置';depthButton.disabled=busy||!changed;}
        range.oninput=updateDepth;updateDepth();depthButton.onclick=function(){action('depth',Number(range.value));};}
        else {
            info=partCells.lure||adjustPane;var styles=choose(info,'怎样牵动末端的小物件',[{key:'steady',name:'连续收回'},{key:'pause',name:'收一段，停一下'},{key:'twitch',name:'轻挑后收回'}]);styles.value=v.lureStyle;styles.disabled=busy;styles.onchange=function(){action('lureStyle',styles.value);};
            var speeds=choose(info,'摇柄速度',[{key:'slow',name:'慢一些'},{key:'medium',name:'平常速度'},{key:'fast',name:'快一些'}]);speeds.value=v.lureSpeed;speeds.disabled=busy;speeds.onchange=function(){action('lureSpeed',speeds.value);};
            node('p','试着转动摇柄，看看末端物件如何移动。反复抛出、摇柄和轻挑会持续消耗体力。',info,'fishing-muted');
        }
        if(v.isLure){info=partCells.reel||adjustPane;var dr=choose(info,'绕线部件的松紧',[{key:'loose',name:'较松'},{key:'medium',name:'适中'},{key:'tight',name:'较紧'}]);dr.value=v.drag;dr.disabled=busy&&v.phase!=='fight';dr.onchange=function(){action('drag',dr.value);};if(v.phase==='fight')node('p','调整松紧需要1刻。',info,'fishing-muted');}
        if(v.baits.length&&!v.isLure){info=partCells.bait||partCells.hook||adjustPane;var foods=choose(info,'挂在钩上的食物',v.baits);foods.disabled=busy;var ba=btn(info,'挂上一份 · 1刻','bait',null,busy);ba.onclick=function(){action('bait',foods.value);};}
        var keys=Object.keys(partCells);if(!partCells[selectedPart])selectedPart=partCells[v.isLure?'lure':'float']?(v.isLure?'lure':'float'):keys[0];
        keys.forEach(function(key){partCells[key].hidden=key!==selectedPart;});
        partList.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.partKey===selectedPart);});
        info=waterPane;
        node('p',v.notes.nestAt!=null?'曾于 '+v.notes.nestAt+' 刻投放食物；当前作用未知。':'这里尚无投食记录。',info,'fishing-muted');
        var nestEntry=node('button','打窝',info);nestEntry.disabled=busy||!v.reachable;nestEntry.onclick=function(){workspace='nest';choicePage=0;nestChoice=null;render();};
        btn(info,'翻找岸边湿土 · 2刻','gather',null,busy);
        if(workspace==='nest'||workspace==='rigs'){
            var selectingNest=workspace==='nest',pickerPane=node('div',null,map,'fishing-choice-workspace');
            var choiceHead=node('div',null,pickerPane,'fishing-choice-heading');node('h3',selectingNest?'打窝 · '+pt.name:'更换钓组',choiceHead);
            var cancel=node('button',selectingNest?'返回水域':'返回钓组',choiceHead);cancel.onclick=function(){workspace=selectingNest?'water':'parts';render();};
            node('p',selectingNest?'选择一份食物，投到当前选定的水面。':(v.rigs.length===1?'随身只有这一套钓组。':'选择要使用的钓组。'),pickerPane,'fishing-muted');
            var entries=selectingNest?v.baits:v.rigs,totalPages=Math.max(1,Math.ceil(entries.length/4));choicePage=Math.min(choicePage,totalPages-1);
            if(!entries.length)node('p',selectingNest?'随身没有可以投放的食物。':'随身没有可用的钓组。',pickerPane);
            var choices=node('div',null,pickerPane,'fishing-choice-grid');
            entries.slice(choicePage*4,choicePage*4+4).forEach(function(entry){
                var item=node('div',null,choices,'fishing-choice-card');node('h3',entry.name,item);
                if(selectingNest){node('p','剩余 '+entry.count+' 份',item,'fishing-muted');var pick=node('button',nestChoice===entry.key?'已选中':'选择',item);pick.setAttribute('aria-pressed',nestChoice===entry.key);pick.onclick=function(){nestChoice=entry.key;render();};}
                else {var current=entry.key===v.selectedRig;var use=node('button',current?'使用中':'使用这套',item);use.disabled=current||busy;use.onclick=function(){action('select',entry.key);};}
            });
            if(totalPages>1){var pager=node('div',null,pickerPane,'fishing-history-pages');var prev=node('button','上一页',pager);prev.disabled=choicePage===0;prev.onclick=function(){choicePage--;render();};node('span',(choicePage+1)+' / '+totalPages,pager);var next=node('button','下一页',pager);next.disabled=choicePage+1===totalPages;next.onclick=function(){choicePage++;render();};}
            if(selectingNest){var confirm=node('button','投下一份 · 1刻',pickerPane,'fishing-choice-confirm');confirm.disabled=busy||!entries.some(function(x){return x.key===nestChoice;});confirm.onclick=function(){action('nest',nestChoice);};}
        }
        var waterWorkspace=node('div',null,map,'fishing-water-workspace');waterWorkspace.hidden=workspace!=='water';map=waterWorkspace;
        node('h3','水域',map);var pond=node('div',null,map,'fishing-pond');
        pond.innerHTML='<svg viewBox="0 0 700 440" preserveAspectRatio="none" aria-hidden="true"><path d="M110 50Q215 9 400 38T649 140Q708 238 590 352T300 402Q138 412 68 301T110 50" fill="#294d47" stroke="#768064" stroke-width="12"/><path d="M99 70l8-38m4 39l17-30m-40 69l-11-37m20 49l-8-27m34-26l12-30" stroke="#9d9c65" stroke-width="5"/><path d="M0 369Q69 359 137 405M677 40q-36 17-57 44" stroke="#928568" stroke-width="26" fill="none" opacity=".6"/></svg>';
        C.points.forEach(function(p,i){var b=btn(pond,(i+1)+' '+p.name,'point',i,busy);b.className='fishing-spot';b.style.left=p.xy[0]+'%';b.style.top=p.xy[1]+'%';b.setAttribute('aria-pressed',i===v.point);});
        C.stations.forEach(function(p,i){var b=btn(pond,String.fromCharCode(65+i),'station',i,busy);b.className='fishing-shore';b.style.left=p.xy[0]+'%';b.style.top=p.xy[1]+'%';b.setAttribute('aria-label',p.name);b.setAttribute('aria-pressed',i===v.station);node('span',p.name+(i===v.station?' · 你在这里':''),b);});
        node('p',v.castLimit&&v.selectedRig?(errors[v.castLimit]||'检查钓组后再抛竿。'):'点击岸边标记换站位，点击水面选择抛竿位置。',map,'fishing-muted');
        node('h3','现场与决策',events);var notice=node('p',v.logs.length?(v.logs[0].repeats>1?C.feedback_rules.dispatch.repeat_prefix:'')+v.logs[0].text:'水面就在眼前，水下的情况尚未探明。',events,'fishing-notice');notice.setAttribute('role','status');
        if(v.catchText){node('p',v.catchText,events);btn(events,'收取鱼获','keep');btn(events,'立即放流','release');}
        else if(v.phase==='ended'&&v.needsRecovery){btn(events,'收回检查 · 1刻','retrieve');}
        else if(v.snag){btn(events,'放松后再试 · 1刻','snag','relax');btn(events,'加力拉回 · 1刻','snag','pull');btn(events,'切线放弃','cut');}
        else if(v.phase==='waiting'&&v.isLure){btn(events,'继续摇柄收回 · 1刻','workLure');btn(events,'直接收回检查 · 1刻','retrieve');}
        else if(v.phase==='waiting'){[1,3,6].forEach(function(n){btn(events,'等待 '+n+' 刻','wait',n);});btn(events,'收回检查 · 1刻','retrieve');}
        else if(v.phase==='signal'){['light','normal','strong'].forEach(function(k,i){btn(events,['轻提','正常提起','有力提起'][i],'strike',k);});if(v.canWatch)btn(events,'继续观察','watch');btn(events,'收回检查 · 1刻','retrieve');}
        else if(v.phase==='fight'){btn(events,'稳妥遛鱼 · 1刻','fight','steady');btn(events,'强行收鱼 · 1刻','fight','strong');if(v.isLure)btn(events,'让线缓冲 · 1刻','fight','give');btn(events,'切线止损','cut');}
        else btn(events,'抛竿 · 1刻','cast',null,!v.reachable||!v.rigs.length);
        if(v.phase==='fight'||v.snag)node('p','离开水域会切断岸边的线，水下连接的部件将丢失。',events,'fishing-muted');
        var history=node('div',null,events,'fishing-history');node('h3','现场记录',history);var pages=Math.max(1,Math.ceil(v.logs.length/2));historyPage=Math.min(historyPage,pages-1);var logs=node('ol',null,history,'fishing-logs');v.logs.slice(historyPage*2,historyPage*2+2).forEach(function(l){node('li','第 '+l.tick+' 刻 · '+(l.repeats>1?'连续 '+l.repeats+' 次观察相同 · ':'')+l.text,logs);});
        if(pages>1){var pager=node('div',null,history,'fishing-history-pages');var newer=node('button','较新',pager);newer.disabled=historyPage===0;newer.onclick=function(){historyPage--;render();};node('span',(historyPage+1)+' / '+pages,pager);var older=node('button','较早',pager);older.disabled=historyPage===pages-1;older.onclick=function(){historyPage++;render();};}
        node('footer','观察只记录有依据的见闻 · 调整不会预告鱼口 · 离开水域会结束当前作业',card,'fishing-footer');
    }
    g.FishingPanel={configure:configure,open:open,close:close,render:render,ensureStarterSupplies:ensureStarterSupplies,currentPoint:atPoint,isOpen:function(){return opened;}};
})(window);

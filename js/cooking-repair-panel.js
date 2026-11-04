(function(g){
 'use strict';
 var root=null,selected={},step=0,result=null,model=null,onClose=null,embedded=false,active=false,view=null,location=null;
 var R=function(){return model;};
 function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function description(c){var n=R().state()[c.id];if(R().spec.warehouse){var label={wood:'木料',stone:'土石材料',metal:'金属材料',fiber:'绑扎材料',parts:'机件'}[c.id];return label+(n===0?'尚未准备。':n<c.need?'已备了一部分，还需要补充。':'已经备好。');}if(R().spec.id==='cooking')return c.id==='stone'?(n===0?'灶体裂着口子，台基也有些松散。':n<c.need?'裂口补上了一部分，台基还不够牢靠。':'裂缝已经填实，台基稳固了。'):(n===0?'支架松动，锅架还撑不稳。':n<c.need?'支架比之前稳了些，但还有几处松动。':'支架不再晃动，锅架已经撑稳。');var words={stone:['接缝与基座尚未补齐。','接缝补上了一部分，基座仍需填实。','接缝填实，基座已经稳固。'],wood:['框架还需要补强。','框架已加固一些，仍有松动。','框架已经撑稳。'],metal:['金属连接处尚未装配。','连接件已有了，但还未齐备。','金属连接件已经齐备。'],fiber:['绑扎材料还没有备好。','绑扎材料已有一些，还需补齐。','绑扎材料已经备妥。'],parts:['机件尚未齐备。','机件已有一些，还需要补充。','机件已经齐备。']};return words[c.id][n===0?0:n<c.need?1:2];}
 function done(){var p=R().state();return R().groups.every(function(c){return p[c.id]>=c.need;});}
 function receipt(label,rows){return '<section><h3>'+label+'</h3>'+(rows.length?rows.map(function(r){return '<p>'+esc(r.item.name)+' × '+r.count+'</p>';}).join(''):'<p>无</p>')+'</section>';}
 function selectionSummary(){return R().rows().filter(function(i){return selected[i.id]>0;}).map(function(i){return i.name+' × '+selected[i.id];}).join('、');}
 function sequenceView(){
  var progress=R().state(),current=R().currentGroup(),list=R().rows(true),p=R().preview(selected),index=current?R().groups.indexOf(current):R().groups.length;
  var items=current?list.filter(function(i){return i.group===current.id;}).map(function(i){var required=Math.ceil((current.need-progress[current.id])/i.points);return {id:i.id,name:i.name,basic:i.basic,stock:i.stock,required:required,missing:Math.max(0,required-i.stock),limit:Math.min(i.stock,required),selected:selected[i.id]||0};}):[];
  var used=p.ok?p.used.map(function(r){return {name:r.item.name,count:r.count};}):[];
  return {current:index,items:items,hasStock:items.some(function(i){return i.stock>0;}),used:used,canRepair:p.ok&&used.length>0,button:used.length&&!p.currentComplete?'先修补一部分':'修复当前部件',steps:R().groups.map(function(c,n){return {id:c.id,note:c.note,status:progress[c.id]>=c.need?'已完成':n===index?'当前修复':'等待前一步'};})};
 }
 function sequenceBody(v){
  var s=v.sequence,body='<ol class="cr-steps" aria-label="修复顺序">'+s.steps.map(function(c,n){return '<li class="cr-step'+(c.status==='已完成'?' is-complete':n===s.current?' is-current':' is-locked')+'"'+(n===s.current?' aria-current="step"':'')+'><span class="cr-step-number">'+(c.status==='已完成'?'✓':n+1)+'</span><span>'+esc(c.note)+'<small>'+c.status+'</small></span></li>';}).join('')+'</ol>';
  if(v.result&&v.result.ok)body+='<div class="cr-feedback" role="status"><strong>'+esc(v.result.partNote||'当前部件')+(v.result.partFinished?'已完成。':'已修补一部分。')+'</strong><p>实际消耗：'+esc(v.result.used.map(function(i){return i.name+' × '+i.count;}).join('、'))+'</p></div>';
  if(v.result&&!v.result.ok)body+='<p role="alert">'+esc(v.result.message)+'</p>';
  if(v.done)return body+'<div class="cr-finished"><h2>全部部件已修好</h2><button class="cr-primary" data-action="close">完成</button></div>';
  var c=s.steps[s.current];body+='<section class="cr-current"><h2>'+esc(c.note)+'</h2>';
  function materialRows(items){return items.map(function(i){return '<label class="cr-material cr-repair-material"><span><strong>'+esc(i.name)+'</strong><small title="持有 / 单独使用所需" aria-label="持有 '+i.stock+' 件，单独使用需 '+i.required+' 件">'+i.stock+'/'+i.required+'</small></span><span class="cr-slider cr-repair-slider"><input type="range" step="1" aria-label="'+esc(i.name)+'投入数量" data-item="'+i.id+'" min="0" max="'+i.limit+'" value="'+i.selected+'"'+(!i.stock?' disabled':'')+'><output>投入 '+i.selected+' 件</output></span></label>';}).join('');}
  body+=materialRows(s.items.filter(function(i){return i.basic||!s.hasStock||i.stock>0;}));
  var alternatives=s.items.filter(function(i){return !i.basic&&!i.stock;});
  if(s.hasStock&&alternatives.length)body+='<details class="cr-alternatives"><summary>其他可替代材料（'+alternatives.length+' 种）</summary>'+materialRows(alternatives)+'</details>';
  body+='<div class="cr-commit">'+sequenceCommit(s)+'</div></section>';
  return body;
 }
 function sequenceCommit(s){return '<button class="cr-primary" data-action="repair"'+(!s.canRepair?' disabled':'')+'>'+s.button+'</button>';}
 function updateWarehouseSelection(){
  if(!embedded)return;
  var summary=root.querySelector('[data-selection-summary]'),button=root.querySelector('[data-action="repair"]'),text=selectionSummary();
  if(summary)summary.textContent=text||'尚未选择材料';
  if(button)button.disabled=!text;
 }
 function warehouseBody(list,groups){
  var body='<div class="wh-material-heading"><h2>准备材料</h2><p class="cr-muted">'+(R().spec.warehouse?'已列出随身与仓库中可用于本项整备的材料。':'已列出随身可用于装配这件工具的材料。')+'拖动滑条选择本次交付的件数。</p></div>';
  if(result&&!result.ok)body+='<p role="alert">'+esc(result.message)+'</p>';
  body+=groups.map(function(c){var finished=R().state()[c.id]>=c.need,available=list.filter(function(i){return i.group===c.id;});
   return '<section class="wh-material-group"><header><h3>'+esc(c.note)+'</h3><span>'+description(c)+'</span></header>'+(finished?'<p class="cr-muted">这类材料不用再交付。</p>':available.length?available.map(function(i){return '<label class="cr-material"><span>'+esc(i.name)+'<small>可用 '+i.stock+' 件</small></span><span class="cr-slider"><input type="range" step="1" aria-label="'+esc(i.name)+'投入数量" data-item="'+i.id+'" min="0" max="'+i.stock+'" value="'+(selected[i.id]||0)+'"><output>投入 '+(selected[i.id]||0)+' 件</output></span></label>';}).join(''):'<p class="cr-muted">手边没有适用的材料，可以先交付其他类别，之后再补。</p>')+'</section>';
  }).join('');
  return body+'<div class="wh-delivery"><div><strong>本次交付</strong><p data-selection-summary>'+esc(selectionSummary()||'尚未选择材料')+'</p><small>多余整件留在原处，已交材料会保留。</small></div><button class="wh-primary" data-action="repair" '+(!selectionSummary()?'disabled':'')+'>交付所选材料</button></div>';
 }
 function draw(){
  if(!active)return;if(view){view(getView());return;}
  var focused=document.activeElement,focusAction=focused&&focused.dataset?focused.dataset.action:null,focusItem=focused&&focused.dataset?focused.dataset.item:null;
  var list=R().rows(),groups=R().groups,body='';
  if(R().sequential()){body=sequenceBody(getView());}
  else if(result&&result.ok){body='<h2>'+(done()?(R().spec.warehouse?'材料已备妥，可以开始施工':'装配完成，可以使用了'):(R().spec.warehouse?'材料已收下，还需要继续准备':'还需要继续修补'))+'</h2>'+groups.map(function(c){return '<p>'+description(c)+'</p>';}).join('')+'<div class="cr-receipts">'+receipt('实际消耗',result.used)+receipt('整件退回',result.returned)+'</div><p class="cr-muted">用不上的整件材料仍在原处，已用材料不折成碎片返还。</p><button data-action="'+(done()?'close':'continue')+'">'+(done()?(embedded?'收起交付明细':'完成'):'继续准备材料')+'</button>';}
  else {body=warehouseBody(list,groups);}
  root.innerHTML=embedded?'<section class="cr-window cr-embedded"><div class="cr-body">'+body+'</div></section>':'<section class="cr-window" role="dialog" aria-modal="true" aria-label="'+esc(R().spec.title)+'"><header><h1>'+esc(R().spec.title)+'</h1><button data-action="close" aria-label="关闭修复">×</button></header><div class="cr-body">'+body+'</div></section>';
  if(R().spec.workTicks&&done()){
   var area=root.querySelector('.cr-body');area.innerHTML='<h2>'+(R().isComplete()?'装配完成':'材料已备齐')+'</h2><p>'+(R().isComplete()?'现在可以使用。':'需要亲自施工，剩余 '+((R().spec.workTicks-R().workProgress())*10)+' 分钟。中断后可继续。')+'</p>'+(result&&result.message?'<p role="status">'+esc(result.message)+'</p>':'')+(R().isComplete()?'':'<button data-sewing-work>施工10分钟 · 消耗体力</button>')+' <button data-action="close">关闭</button>';
   var workButton=area.querySelector('[data-sewing-work]');if(workButton)workButton.onclick=function(e){e.stopPropagation();result=Object.assign({used:[],returned:[]},R().work());draw();};
  }
  var focusTarget=focusItem?root.querySelector('[data-item="'+focusItem+'"]'):focusAction?root.querySelector('[data-action="'+focusAction+'"]'):null;
  (focusTarget||root.querySelector('button')).focus({preventScroll:embedded});
 }
 function close(){if(root)root.remove();root=null;active=false;if(view)view({open:false});selected={};result=null;var cb=onClose;onClose=null;if(cb)cb();if(g.SceneRenderer&&g.SceneRenderer.render)g.SceneRenderer.render();}
 function open(id,callback,host,place){if(active)return;embedded=!!host||!!place;location=place||null;model=g.FacilityUnlock.get(id||'cooking');if(!model||!model.accessible())return;active=true;onClose=callback;step=0;selected={};result=null;if(view){draw();return;}root=document.createElement('div');root.className=embedded?'facility-material-embedded':'cooking-repair-overlay';(host||document.body).appendChild(root);
  root.addEventListener('input',function(e){var id=e.target.dataset.item;if(!id)return;select(id,e.target.value);if(R().sequential())return;e.target.value=selected[id];e.target.nextElementSibling.textContent='投入 '+selected[id]+' 件';updateWarehouseSelection();});
  root.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;e.stopPropagation();act(b.dataset.action,b.dataset.step);});
  root.addEventListener('keydown',function(e){if(embedded)return;e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){var elements=Array.from(root.querySelectorAll('button:not(:disabled),input'));var first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  draw();root.querySelector('button').focus({preventScroll:embedded});
 }

 function select(id,value){if(!active)return;var i=R().rows().find(function(i){return i.id===id;}),current=R().currentGroup();if(R().sequential()&&(!i||!current||i.group!==current.id))return;var max=i?i.stock:0;if(R().sequential())max=Math.min(max,Math.ceil((current.need-R().state()[current.id])/i.points));selected[id]=Math.max(0,Math.min(max,Math.floor(Number(value)||0)));if(view)draw();else if(R().sequential()){
  // Keep the range input mounted while dragging; only its output and preview change.
  var input=root.querySelector('[data-item="'+id+'"]'),commit=root.querySelector('.cr-commit');if(input){input.value=selected[id];input.nextElementSibling.textContent='投入 '+selected[id]+' 件';}if(commit)commit.innerHTML=sequenceCommit(sequenceView());
 }}
 function act(a,nextStep){
  if(!active)return;
  if(nextStep!=null)return;
  if(a==='close'){close();return;}
  if(a==='work'){result=Object.assign({used:[],returned:[]},R().work());draw();if(result.ok&&g.SceneRenderer)g.SceneRenderer.render();return;}
  if(a==='repair'){var part=R().currentGroup();result=R().repair(selected);if(result.ok){selected={};result.partNote=part&&part.note;result.partFinished=!!part&&R().state()[part.id]>=part.need;}draw();if(embedded&&R().spec.warehouse&&g.HideoutWarehousePanel)g.HideoutWarehousePanel.render();if(embedded&&R().spec.toolbench&&g.ToolbenchPanel)g.ToolbenchPanel.refresh();if(result&&result.ok&&g.SceneRenderer)g.SceneRenderer.render();return;}
  if(a==='continue'){result=null;step=R().groups.findIndex(function(c){return R().state()[c.id]<c.need;});}
  draw();
 }
 function getView(){
  if(!active)return {open:false};var list=R().rows();
  return {open:true,location:location,embedded:embedded,title:R().spec.title,warehouse:!!R().spec.warehouse,toolbench:!!R().spec.toolbench,step:step,done:done(),sequence:R().sequential()?sequenceView():null,
   work:!!R().spec.workTicks&&done(),complete:R().isComplete(),minutes:(R().spec.workTicks-R().workProgress())*10,
   groups:R().groups.map(function(c){return {id:c.id,note:c.note,description:description(c),finished:R().state()[c.id]>=c.need,rows:list.filter(function(i){return i.group===c.id;}).map(function(i){return {id:i.id,name:i.name,stock:i.stock,selected:selected[i.id]||0};})};}),
   summary:selectionSummary(),picked:list.filter(function(i){return selected[i.id]>0;}).map(function(i){return {name:i.name,count:selected[i.id]};}),
   result:result?{ok:result.ok,message:result.message,partNote:result.partNote,partFinished:result.partFinished,used:(result.used||[]).map(function(r){return {name:r.item.name,count:r.count};}),returned:(result.returned||[]).map(function(r){return {name:r.item.name,count:r.count};})}:null};
 }
 function unmount(){if(!embedded)return;if(root)root.remove();root=null;active=false;onClose=null;selected={};result=null;if(view)view({open:false});}
 g.FacilityUnlockPanel={attachView:function(fn){view=fn;if(view)view(getView());return function(){onClose=null;close();view=null;};},getView:getView,act:act,select:select,open:open,close:close,mount:function(host,id,callback){open(id,callback,host);},mountView:function(place,id,callback){open(id,callback,null,place);},unmount:unmount,hasReceipt:function(){return active&&!!(result&&result.ok)&&!(R().spec.workTicks&&done());},getEmbeddedProject:function(){return active&&embedded?model.spec.id:null;},isOpen:function(){return active&&!embedded;}};g.CookingRepairPanel={open:function(){open('cooking');},close:close,isOpen:function(){return active;}};
})(window);

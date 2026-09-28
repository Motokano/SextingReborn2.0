(function(g){
 'use strict';
 var root=null,selected={},step=0,result=null,model=null,onClose=null,explanation=null,embedded=false;
 var R=function(){return model;};
 function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function description(c){var n=R().state()[c.id];if(R().spec.warehouse){var label={wood:'木料',stone:'土石材料',metal:'金属材料',fiber:'绑扎材料',parts:'机件'}[c.id];return label+(n===0?'尚未准备。':n<c.need?'已备了一部分，还需要补充。':'已经备好。');}if(R().spec.id==='cooking')return c.id==='stone'?(n===0?'灶体裂着口子，台基也有些松散。':n<c.need?'裂口补上了一部分，台基还不够牢靠。':'裂缝已经填实，台基稳固了。'):(n===0?'支架松动，锅架还撑不稳。':n<c.need?'支架比之前稳了些，但还有几处松动。':'支架不再晃动，锅架已经撑稳。');var words={stone:['接缝与基座尚未补齐。','接缝补上了一部分，基座仍需填实。','接缝填实，基座已经稳固。'],wood:['框架还需要补强。','框架已加固一些，仍有松动。','框架已经撑稳。'],metal:['金属连接处尚未装配。','连接件已有了，但还未齐备。','金属连接件已经齐备。'],fiber:['绑扎材料还没有备好。','绑扎材料已有一些，还需补齐。','绑扎材料已经备妥。'],parts:['机件尚未齐备。','机件已有一些，还需要补充。','机件已经齐备。']};return words[c.id][n===0?0:n<c.need?1:2];}
 function done(){var p=R().state();return R().groups.every(function(c){return p[c.id]>=c.need;});}
 function receipt(label,rows){return '<section><h3>'+label+'</h3>'+(rows.length?rows.map(function(r){return '<p>'+esc(r.item.name)+' × '+r.count+'</p>';}).join(''):'<p>无</p>')+'</section>';}
 function selectionSummary(){return R().rows().filter(function(i){return selected[i.id]>0;}).map(function(i){return i.name+' × '+selected[i.id];}).join('、');}
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
  var active=document.activeElement,focusAction=active&&active.dataset?active.dataset.action:null,focusStep=active&&active.dataset?active.dataset.step:null;
  var list=R().rows(),groups=R().groups,body='';
  if(result&&result.ok){body='<h2>'+(done()?(R().spec.warehouse?'材料已备妥，可以开始施工':'装配完成，可以使用了'):(R().spec.warehouse?'材料已收下，还需要继续准备':'还需要继续修补'))+'</h2>'+groups.map(function(c){return '<p>'+description(c)+'</p>';}).join('')+'<div class="cr-receipts">'+receipt('实际消耗',result.used)+receipt('整件退回',result.returned)+'</div><p class="cr-muted">用不上的整件材料仍在原处，已用材料不折成碎片返还。</p><button data-action="'+(done()?'close':'continue')+'">'+(done()?(embedded?'收起交付明细':'完成'):'继续准备材料')+'</button>';}
  else if(embedded&&(R().spec.warehouse||R().spec.toolbench)){body=warehouseBody(list,groups);}
  else {
   body='<button data-action="inspect">查看修补说明</button>'+(explanation?'<p class="cr-explanation">'+esc(explanation)+'</p>':'')+'<nav>'+groups.map(function(c){return c.note;}).concat(['核对材料']).map(function(t,n){return '<button data-step="'+n+'" '+(step===n?'aria-current="step"':'')+'>'+t+'</button>';}).join('')+'</nav>'+(result&&!result.ok?'<p role="alert">'+esc(result.message)+'</p>':'');
   if(step<groups.length){var c=groups[step],finished=R().state()[c.id]>=c.need,available=list.filter(function(i){return i.group===c.id;});body+='<h2>'+c.note+'</h2><p>'+description(c)+'</p>';
    if(finished)body+='<p>'+(R().spec.warehouse?'这类材料已经备妥，不必再投入。':'这里已经修好，不必再投入材料。')+'</p>';
    else {body+='<p class="cr-muted">选择已知适合的材料。'+(R().spec.warehouse?'可使用随身与仓库中未封签的材料。':'使用随身材料。')+'</p><button data-action="all">备齐这类材料</button> <button data-action="clear">清空本步</button>';
     body+=available.length?available.map(function(i){return '<label class="cr-material"><span>'+esc(i.name)+'<small>持有 '+i.stock+' 件</small></span><span class="cr-slider"><input type="range" step="1" aria-label="'+esc(i.name)+'投入数量" data-item="'+i.id+'" min="0" max="'+i.stock+'" value="'+(selected[i.id]||0)+'"><output>投入 '+(selected[i.id]||0)+' 件</output></span></label>';}).join(''):'<p>没有可用且已知适合这一步的材料。可以先查看修补说明，了解材料用途。</p>';}
    body+='<footer><button data-step="'+(step+1)+'">'+(step<groups.length-1?'继续准备':'核对材料')+'</button></footer>';
   }else {var picked=list.filter(function(i){return selected[i.id]>0;});body+='<h2>准备投入</h2>'+picked.map(function(i){return '<p>'+esc(i.name)+' × '+selected[i.id]+'</p>';}).join('')+'<p class="cr-muted">'+(R().spec.warehouse?'提交后收下本次所需材料，已备材料会保留。':'点击后直接修补，已完成的修补会保留。')+'用不上的整件材料仍留在原处。</p><footer><button data-step="'+(groups.length-1)+'">返回选材</button><button data-action="repair" '+(!picked.length?'disabled':'')+'>'+(R().spec.warehouse?'核对并交付材料':'核对并修复')+'</button></footer>';}
  }
  root.innerHTML=embedded?'<section class="cr-window cr-embedded"><div class="cr-body">'+body+'</div></section>':'<section class="cr-window" role="dialog" aria-modal="true" aria-label="'+esc(R().spec.title)+'"><header><h1>'+esc(R().spec.title)+'</h1><button data-action="close" aria-label="关闭修复">×</button></header><div class="cr-body">'+body+'</div></section>';
  var focusTarget=focusAction?root.querySelector('[data-action="'+focusAction+'"]'):focusStep!=null?root.querySelector('[data-step="'+focusStep+'"]'):null;
  (focusTarget||root.querySelector('button')).focus({preventScroll:embedded});
 }
 function close(){if(root)root.remove();root=null;selected={};result=null;var cb=onClose;onClose=null;if(cb)cb();if(g.SceneRenderer&&g.SceneRenderer.render)g.SceneRenderer.render();}
 function open(id,callback,host){if(root)return;embedded=!!host;model=g.FacilityUnlock.get(id||'cooking');if(!model||!model.accessible())return;onClose=callback;explanation=null;step=0;selected={};result=null;root=document.createElement('div');root.className=embedded?'facility-material-embedded':'cooking-repair-overlay';(host||document.body).appendChild(root);
  root.addEventListener('input',function(e){var id=e.target.dataset.item;if(!id)return;var i=R().rows().find(function(i){return i.id===id;});selected[id]=Math.max(0,Math.min(i?i.stock:0,Math.floor(Number(e.target.value)||0)));e.target.value=selected[id];e.target.nextElementSibling.textContent='投入 '+selected[id]+' 件';updateWarehouseSelection();});
  root.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;e.stopPropagation();if(b.dataset.step!=null){step=Number(b.dataset.step);draw();return;}var a=b.dataset.action;if(a==='inspect'){var info=R().inspect();explanation=info.message;draw();return;}if(a==='close'){close();return;}if(a==='repair'){result=R().repair(selected);if(result.ok)selected={};draw();if(embedded&&R().spec.warehouse&&g.HideoutWarehousePanel)g.HideoutWarehousePanel.render();if(embedded&&R().spec.toolbench&&g.ToolbenchPanel)g.ToolbenchPanel.refresh();return;}if(a==='continue'){result=null;step=R().groups.findIndex(function(c){return R().state()[c.id]<c.need;});}if(a==='all'||a==='clear'){var c=R().groups[step];R().rows().filter(function(i){return i.group===c.id;}).forEach(function(i){selected[i.id]=a==='all'?i.stock:0;});}draw();});
  root.addEventListener('keydown',function(e){if(embedded)return;e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){var elements=Array.from(root.querySelectorAll('button:not(:disabled),input'));var first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  draw();root.querySelector('button').focus({preventScroll:embedded});
 }
 g.FacilityUnlockPanel={open:open,close:close,mount:function(host,id,callback){open(id,callback,host);},unmount:function(){if(!embedded)return;if(root)root.remove();root=null;onClose=null;selected={};result=null;},getEmbeddedProject:function(){return root&&embedded?model.spec.id:null;},isOpen:function(){return !!root&&!embedded;}};g.CookingRepairPanel={open:function(){open('cooking');},close:close,isOpen:function(){return !!root;}};
})(window);

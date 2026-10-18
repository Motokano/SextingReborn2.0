(function(g){
 'use strict';
 var root=null,selected='calendar',active=false,view=null;
 var entries=[
  {id:'calendar',name:'日历',description:'整理日期记录，方便查看现在的年日。',done:'日历已装好，日期会自动显示，无需回到这里查看。'},
  {id:'temperature',name:'温度计',description:'用于读取所在环境的温度。',done:'温度计已装好，天气栏会自动显示当前环境温度，无需逐次测量。'},
  {id:'humidity',name:'湿度计',description:'湿度观测暂未开放。',pending:true}
 ];
 function nearby(){var E=g.GameEngine,st=E&&E.getState();return st&&st.mapId==='M0_Base_Inside_lv_1'&&Math.max(Math.abs(st.x-7),Math.abs(st.y-11))===1;}
 function close(){if(!active)return;g.FacilityUnlockPanel.unmount();if(root)root.remove();root=null;active=false;if(view)view({open:false});}
 function refresh(){
  if(!active)return;
  if(view){refreshView();return;}
  root.querySelector('.tb-list').innerHTML=entries.map(function(e){var model=!e.pending&&g.FacilityUnlock.get(e.id);return '<button type="button" data-tool="'+e.id+'" aria-pressed="'+(selected===e.id)+'"><strong>'+e.name+'</strong><span>'+(e.pending?'尚未开放':model.isComplete()?'已装好':'待装配')+'</span><small>'+e.description+'</small></button>';}).join('');
  var e=entries.find(function(x){return x.id===selected;}),host=root.querySelector('.tb-materials'),message=root.querySelector('.tb-state'),F=g.FacilityUnlockPanel;
  if(F.getEmbeddedProject()&&F.getEmbeddedProject()!==selected)F.unmount();
  var model=!e.pending&&g.FacilityUnlock.get(e.id);
  if(e.pending){F.unmount();host.hidden=true;message.hidden=false;message.textContent='这件工具尚未开放装配，暂时不需要准备材料。';}
  else if(model.isComplete()){
   message.hidden=false;message.textContent=e.done;
   if(!host.querySelector('.cr-receipts')){F.unmount();host.hidden=true;}
  }else{
   message.hidden=true;host.hidden=false;
   if(!F.getEmbeddedProject())F.mount(host,selected,refresh);
  }
 }
 function open(){
  if(active||!nearby()||(g.HideoutWarehousePanel&&g.HideoutWarehousePanel.isOpen()))return;
  active=true;if(view){refresh();return;}root=document.createElement('div');root.id='toolbench-panel';root.className='cooking-repair-overlay';
  root.innerHTML='<section class="tb-window" role="dialog" aria-modal="true" aria-label="工具台"><header class="tb-header"><h1>工具台</h1><button type="button" data-close aria-label="关闭工具台">×</button></header><div class="tb-layout"><nav class="tb-list" aria-label="工具列表"></nav><main class="tb-detail"><p class="tb-state" role="status"></p><div class="tb-materials"></div></main></div></section>';
  document.body.append(root);
  root.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-close'))close();else if(b.dataset.tool){if(selected!==b.dataset.tool){g.FacilityUnlockPanel.unmount();selected=b.dataset.tool;}refresh();root.querySelector('.tb-list [data-tool="'+selected+'"]').focus();}});
  root.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key==='Tab'){var nodes=Array.from(root.querySelectorAll('button:not(:disabled),input,summary')).filter(function(n){return n.getClientRects().length;});if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus();}else if(!e.shiftKey&&document.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus();}}});
  refresh();root.querySelector('[data-close]').focus();
 }

 function refreshView(){
  var F=g.FacilityUnlockPanel,e=entries.find(function(x){return x.id===selected;}),model=!e.pending&&g.FacilityUnlock.get(e.id);
  if(F.getEmbeddedProject()&&F.getEmbeddedProject()!==selected)F.unmount();
  if(e.pending||model.isComplete()&&!F.hasReceipt())F.unmount();
  else if(!model.isComplete()&&!F.getEmbeddedProject())F.mountView('toolbench',selected,refresh);
  view({open:true,selected:selected,entries:entries.map(function(e){return {id:e.id,name:e.name,description:e.description,status:e.pending?'尚未开放':g.FacilityUnlock.get(e.id).isComplete()?'已装好':'待装配'};}),message:e.pending?'这件工具尚未开放装配，暂时不需要准备材料。':model.isComplete()?e.done:'',materials:F.getEmbeddedProject()===selected});
 }
 function choose(id){if(!active||!entries.some(function(e){return e.id===id;}))return;if(selected!==id){g.FacilityUnlockPanel.unmount();selected=id;}refresh();}
 g.ToolbenchPanel={attachView:function(fn){view=fn;if(view)view({open:active});return function(){close();view=null;};},choose:choose,open:open,close:close,refresh:refresh,isOpen:function(){return active;}};
})(window);

(function(g){
 'use strict';
 var root=null,id=null,timer=null,message='';
 function laborFeedback(){
  var n=g.FacilityLabor.progress(id),lines=id==='agriculture'
   ?(n<250?['你把挡路的杂物搬到一旁，腾出落脚的位置。','你弯腰拾起散落的碎石，继续收拾入口。']:n<500?['你沿着已经清出的通道，把杂物搬离水源口。','你开始铲去水源口的积泥，淤堵还需要慢慢清除。']:n<750?['你清去导水边缘的沉积物，露出下面的结构。','你搬开夹在淤泥里的碎石，再继续疏通水源口。']:['你蹲下来清理边角，把残留的泥沙拨到一旁。','你收拾操作位置附近的碎屑，为后续修补腾出空间。'])
   :(n<500?['你把轴心旁的杂物搬开，给自己腾出操作的位置。','你清理机械臂下方的障碍，避开四区的牧草。']:['你沿着机械臂的活动范围，继续搬走挡路的杂物。','你清出活动间隙中的碎屑，保留周围的牧草。']);
  return lines[n%lines.length];
 }
 function stop(){if(timer!==null)clearInterval(timer);timer=null;}
 function dismiss(){stop();if(root)root.remove();root=null;id=null;}
 function close(){stop();if(!g.FacilityLabor.save()){message='保存失败，已暂停清理。请稍后再次尝试离开。';draw();return;}dismiss();if(g.SceneRenderer)g.SceneRenderer.render();}
 function draw(){
  if(!root)return;
  var L=g.FacilityLabor,clean=L.progress(id)>=L.total,ready=L.isUnlocked(id),s=g.Survival.getState();
  var old=document.activeElement,action=old&&old.dataset&&old.dataset.action;
  root.innerHTML='<section class="cr-window" role="dialog" aria-modal="true" aria-label="恢复设施"><header><h1>'+g.FacilityUnlockConfig.projects[id].title+'</h1><button data-action="close" aria-label="关闭恢复界面">×</button></header><div class="cr-body"><p class="cr-muted">'+(clean?'✓ 清理场地　›　修补基础':'清理场地　›　修补基础')+'</p><h2>'+(ready?'基础设施已经恢复':clean?'可以着手修补了':'清理荒废场地')+'</h2><p>'+L.description(id)+'</p><p>当前体力：'+Math.floor(s.stamina)+'</p><p class="cr-muted">每 tick 基础劳动消耗 3 体力；当前劳动消耗 '+L.cost()+'。生存消耗照常结算，可随时暂停。</p><p role="status">'+message+'</p><footer>'+(ready?'<button data-action="use">进入管理</button>':clean?'<button data-action="repair">准备修复材料</button>':'<button data-action="'+(timer!==null?'pause':'start')+'" '+(timer===null&&L.reason(id)?'disabled':'')+'>'+(timer!==null?'暂停清理':L.progress(id)?'继续清理':'开始清理')+'</button>')+'<button data-action="close">'+(timer!==null?'停下并离开':'离开')+'</button></footer></div></section>';
  var target=action&&root.querySelector('[data-action="'+action+'"]');(target||root.querySelector('button')).focus();
 }
 function step(){try{var r=g.FacilityLabor.work(id);message=r.message||laborFeedback();if(!r.ok||r.done||r.message)stop();draw();}catch(e){stop();message='劳动已停止，请保存当前进度后重试。';draw();}}
 function open(next){if(root||!g.FacilityLabor.nearby(next))return;id=next;message=g.FacilityLabor.progress(id)>=g.FacilityLabor.total?'清理进度已保留，可以继续修复。':g.FacilityLabor.reason(id)||'清理只消耗时间和体力，不扣材料。';root=document.createElement('div');root.className='cooking-repair-overlay';document.body.append(root);
  root.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var a=b.dataset.action;
   if(a==='close'){close();return;}
   if(a==='pause'){stop();message=g.FacilityLabor.save()?'你放下手头的活，暂时停了下来。清理进度已保存，下次可以接着做。':'保存失败，当前进度仍在本次游戏中。';}
   if(a==='start'){if(timer!==null)return;if(!g.FacilityLabor.save()){message='保存失败，暂不开始劳动。';draw();return;}if(!g.SceneApp.prepareFacilityLabor()){message='当前无法开始清理。';draw();return;}message=g.FacilityLabor.reason(id);if(!message){timer=setInterval(step,g.SceneApp.getFacilityLaborTickMs());message='开始清理。';}}
   if(a==='repair'){var project=id;dismiss();g.FacilityUnlockPanel.open(project,function(){open(project);});return;}
   if(a==='use'){var project=id;close();if(root)return;g.SceneApp[project==='agriculture'?'openAgriculturePanel':'openLivestockPanel']();return;}
   draw();
  });
  root.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){var buttons=Array.from(root.querySelectorAll('button:not(:disabled)')),first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});draw();
 }
 document.addEventListener('visibilitychange',function(){if(document.hidden&&timer!==null){stop();message=g.FacilityLabor.save()?'已暂停，清理进度已保存。':'保存失败，当前进度仍在本次游戏中。';draw();}});
 g.FacilityLaborPanel={open:open,close:close,dismiss:dismiss,isOpen:function(){return !!root;}};
})(window);

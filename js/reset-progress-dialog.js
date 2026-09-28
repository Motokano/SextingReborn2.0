/* Explicit in-game confirmation; no browser-native confirm dependency. */
(function(g){
 'use strict';
 var current=null;
 function open(options){
  if(current)return;
  var dialog=document.createElement('dialog');current=dialog;
  dialog.setAttribute('aria-labelledby','reset-progress-title');
  dialog.style.cssText='max-width:440px;width:calc(100% - 32px);background:#25211c;color:#eee4d5;border:1px solid #99734b;border-radius:10px;padding:24px;box-shadow:0 20px 80px #0009';
  dialog.innerHTML='<h2 id="reset-progress-title" style="margin-top:0">清空本机存档</h2><p data-message></p><p role="alert" data-error style="color:#f3aa91"></p><div style="display:flex;justify-content:flex-end;gap:12px"><button type="button" data-cancel>取消</button><button type="button" data-delete>清空并重新开始</button></div>';
  dialog.querySelector('[data-message]').textContent=options.message;
  var cancel=dialog.querySelector('[data-cancel]'),confirm=dialog.querySelector('[data-delete]'),error=dialog.querySelector('[data-error]');
  [cancel,confirm].forEach(function(b){b.style.cssText='padding:9px 14px;border-radius:5px;border:1px solid #8a6948;background:#342a20;color:#eee4d5;cursor:pointer;font:inherit';});
  confirm.style.background='#703b2c';
  var busy=false;
  function close(){dialog.close();}
  dialog.addEventListener('close',function(){dialog.remove();current=null;if(options.button)options.button.focus();});
  dialog.addEventListener('keydown',function(e){e.stopPropagation();});
  cancel.addEventListener('click',close);
  confirm.addEventListener('click',function(){
   if(busy)return;busy=true;confirm.disabled=true;error.textContent='';
   var ok=false;try{ok=options.clear()===true;}catch(e){ok=false;}
   if(!ok){error.textContent='未能完整清除本机存档，请重试。页面尚未重新载入。';busy=false;confirm.disabled=false;return;}
   options.reload();
  });
  document.body.appendChild(dialog);dialog.showModal();cancel.focus();
 }
 g.ResetProgressDialog={open:open,isOpen:function(){return !!current;}};
})(window);

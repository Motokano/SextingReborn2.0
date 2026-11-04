/* Knowledge-gated entrance; the gym owns material payment and durable opening. */
(function (g) {
 'use strict';
 let root, target, message='';
 const text = key => g.UIText.t(key);
 function canOpen(x, y) {
  return g.GymSystem.canInspectEntrance(x,y);
 }
 function close() { if (root?.open) root.close(); target = null; }
 function refresh() {
  if (!root?.open) return;
  if (target?.mapId !== g.GameEngine.getState().mapId || !canOpen(target.x, target.y)) { close(); return; }
  const plan=g.GymSystem.entrancePlan(),rows=root.querySelector('[data-materials]');
  rows.replaceChildren();
  for(const item of plan.rows){
   const row=document.createElement('div'),name=document.createElement('span'),count=document.createElement('span');
   row.className='cost-row';row.dataset.item=item.id;name.textContent=item.name;count.textContent=item.stock+' / '+item.count;
   if(item.stock<item.count)count.className='insufficient';
   row.append(name,count);rows.append(row);
  }
  root.querySelector('[data-unlock]').disabled=!plan.ok;
  root.querySelector('[data-message]').textContent=message;
 }
 function show(x, y) {
  if (!canOpen(x, y)) { refresh(); return false; }
  if (!root) {
   root = document.createElement('dialog');
   root.id = 'gym-entrance-panel'; root.className = 'gym-panel gym-entrance-panel';
   root.setAttribute('aria-labelledby', 'gym-entrance-title');
   root.innerHTML = '<header class="window-head"><h2 id="gym-entrance-title"></h2><button type="button" data-close>×</button></header><div class="upgrade-view"><div class="cost-row"><span data-skill></span><span data-learned></span></div><div class="cost-row material-head"><span data-material-title></span><span data-stock-title></span></div><div data-materials></div><button type="button" class="primary" data-unlock disabled></button><div class="blocked" data-message role="status"></div></div>';
   root.querySelector('h2').textContent = text('gym.wall.title');
   root.querySelector('[data-close]').setAttribute('aria-label', text('gym.wall.close'));
   root.querySelector('[data-skill]').textContent = text('special.skill.meridian_studies.name');
   root.querySelector('[data-learned]').textContent = text('gym.wall.learned');
   root.querySelector('[data-unlock]').textContent = text('gym.wall.unlock');
   root.querySelector('[data-material-title]').textContent = text('gym.wall.materials');
   root.querySelector('[data-stock-title]').textContent = text('gym.wall.stock');
   root.querySelector('[data-close]').addEventListener('click', close);
   root.querySelector('[data-unlock]').addEventListener('click',()=>{
    if(!root.open||!target||root.querySelector('[data-unlock]').disabled)return;
    const location=target,result=g.GymSystem.openEntrance(location.x,location.y);
    if(result.ok){close();g.GameLog?.log(text('gym.wall.opened'),'success');}
    else {show(location.x,location.y);message=result.message;refresh();}
   });
   root.addEventListener('cancel', e => { e.preventDefault(); close(); });
   document.body.appendChild(root);
  }
  target = { mapId: g.GameEngine.getState().mapId, x, y };message='';
  if (!root.open) root.showModal();
  refresh();
  return true;
 }
 g.SceneHud.subscribe('status', refresh);
 g.GymEntrancePanel = { show, close, refresh, canOpen, isOpen: () => !!root?.open };
})(window);

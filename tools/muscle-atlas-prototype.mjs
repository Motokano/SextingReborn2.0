import '../js/muscle-atlas-view.js';

export function seedMuscleAtlas(demo, M, scenario='growing') {
  const unlocked={}, progress={}, targets={head:38,chest:83,abdomen:10,lhand:47,rhand:48,lfoot:27,rfoot:36};
  for(const slot of M.getChainSlots()) {
    const muscles=slot.groups.flatMap(id=>M.getMusclesByGroup(id));
    const count=scenario==='full'?muscles.length:scenario==='empty'?0:targets[slot.id];
    muscles.forEach((m,i)=>{
      if(i<count) unlocked[m.id]=true;
      progress[m.id]=i<count?100:scenario==='empty'?0:Math.round((19+(i*17)%77)*1000)/1000;
    });
    if(scenario==='growing'&&slot.id==='lhand')progress[muscles.at(-1).id]=99.9;
  }
  M.setState({unlocked,progress,equipped:{},chain_slots_version:1});
  demo.state.progress={...progress};
  if(scenario!=='empty')M.setChainPassive('rhand','post_po_xiang');
}


export function createMuscleAtlas({host,M,demo,texts,onClose}) {
  if(!document.querySelector('link[data-muscle-atlas-style]')) {
    const link=document.createElement('link');link.rel='stylesheet';link.href='tools/muscle-atlas-prototype.css';link.dataset.muscleAtlasStyle='';document.head.append(link);
  }
  const atlas=window.MuscleAtlasView.create({host,M,texts,onClose,getProgress:id=>demo.percent(id),onEquip:(slot,id)=>M.setChainPassive(slot,id)});
  const root=host.querySelector('.muscle-atlas'),footer=root.querySelector('.ma-footer');
  footer.insertAdjacentHTML('afterbegin','<select aria-label="成长情境" data-scenario><option value="growing">成长中</option><option value="empty">从零开始</option><option value="full">全部点亮</option></select><button data-light>演示点亮</button><button data-complete>演示开槽</button>');
  footer.insertAdjacentHTML('beforeend','<button data-reset>重置</button>');
  let scenario='growing',busy=false,disposed=false,timer;
  const light=id=>{M.addGrowth(id,100);demo.state.progress[id]=100;};
  function refresh(){atlas.refresh();const {slotId,muscleId}=atlas.getSelection();root.querySelector('[data-light]').disabled=busy||M.isUnlocked(muscleId);root.querySelector('[data-complete]').disabled=busy||M.getChainSlot(slotId).unlocked;root.querySelector('[data-scenario]').disabled=busy;root.querySelector('[data-reset]').disabled=busy;}
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||button.disabled)return;
    const {slotId,muscleId}=atlas.getSelection();
    if(button.hasAttribute('data-light')){const before=M.getChainSlot(slotId).unlocked;light(muscleId);refresh();const full=M.getChainSlot(slotId).unlocked&&!before;atlas.celebrate(full?'.ma-body-target.selected':'.ma-node.selected',full);}
    else if(button.hasAttribute('data-complete')){
      const remaining=M.getChainSlot(slotId).groups.flatMap(id=>M.getMusclesByGroup(id)).filter(m=>!M.isUnlocked(m.id));
      busy=true;atlas.setBusy(true);let index=0;
      const step=()=>{if(disposed)return;for(let n=0;n<Math.max(1,Math.ceil(remaining.length/24))&&index<remaining.length;n++)light(remaining[index++].id);refresh();if(index<remaining.length)timer=setTimeout(step,root.dataset.effects==='true'?45:0);else{busy=false;atlas.setBusy(false);refresh();atlas.celebrate('[data-slot="'+slotId+'"]',true);}};step();
    }
    else if(button.hasAttribute('data-reset')){seedMuscleAtlas(demo,M,scenario);atlas.resetSelection();refresh();}
    else refresh();
  });
  root.addEventListener('change',e=>{if(e.target.hasAttribute('data-scenario')&&!busy){scenario=e.target.value;seedMuscleAtlas(demo,M,scenario);atlas.resetSelection();refresh();}});
  refresh();
  return {refresh,destroy(){disposed=true;clearTimeout(timer);atlas.destroy();}};
}

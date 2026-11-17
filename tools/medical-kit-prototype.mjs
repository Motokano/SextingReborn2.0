import {initialState,activeKit,profile,refillStock,refillPlan,refillAllPlan,therapyPlan,modificationPlan,act,AFFIXES,MODS,MATERIALS,PARTS,INJURIES} from './medical-kit-prototype-model.mjs';
const draft=await fetch('../data/drafts/medical-kit-items.json').then(r=>r.json());
// Two entry contexts for one design; neither is a production facility authorization.
const params=new URLSearchParams(location.search),atWorkbench=params.get('view')==='workbench';
const freshState=()=>{const s=initialState(draft);s.atHomeManufacturingWorkbench=atWorkbench;
  // Optional fixture links, not production equipment/combat authorization.
  if(s.kits.some(k=>k.id===params.get('kit')))s.selectedKitId=s.equippedKitId=params.get('kit');
  s.inCombat=params.get('combat')==='1';return s;};
let state=freshState(),selectedMod='expand',noticeTimer,surgeryTimer;
const app=document.querySelector('#app');
function render(){
  const focused=document.activeElement?.id;
  const kitListScroll=app.querySelector('.kit-list')?.scrollTop||0;
  const viewState={...state,supplySources:Object.fromEntries(Object.keys(state.base.reserves).map(k=>[k,refillStock(state,k)]))};
  app.innerHTML=window.MedicalKitView.render(viewState,selectedMod,{profile,refillPlan,refillAllPlan,therapyPlan,modificationPlan,activeKit,AFFIXES,MODS,MATERIALS,PARTS,INJURIES},atWorkbench);
  const kitList=app.querySelector('.kit-list');if(kitList)kitList.scrollTop=kitListScroll;
  if(focused)document.getElementById(focused)?.focus({preventScroll:true});
}

function syncSurgeryTimer(){
  clearTimeout(surgeryTimer);
  // One real second per demo tick; background tabs pause the preview clock.
  if(state.operation&&!document.hidden)surgeryTimer=setTimeout(()=>send('advanceSurgery'),1000);
}
function send(action,value,kitId){
  const result=act(state,action,value,kitId);state=result.state;
  if(action==='selectKit'&&!result.notice)selectedMod='expand';
  render();syncSurgeryTimer();
  if(result.notice){const el=document.querySelector('#notice');el.textContent=result.notice;el.classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('visible'),2600);}
}
app.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.action==='selectKit'&&atWorkbench){send('selectKit',b.dataset.value);return;}
  if(b.dataset.action==='modify'&&atWorkbench){send('modify',selectedMod,b.dataset.kitId);return;}
  if(b.dataset.action==='cancel'&&!atWorkbench){send('cancel');return;}
  if(b.dataset.action==='heal'&&!atWorkbench){send('heal',undefined,b.dataset.kitId);return;}
  if(['part','supply','mode'].includes(b.dataset.action)&&!atWorkbench){send(b.dataset.action,b.dataset.value);return;}
  if(b.dataset.action==='refill'&&!atWorkbench)send('refill',b.dataset.value,b.dataset.kitId);
  if(b.dataset.action==='refillAll'&&!atWorkbench)send('refillAll',undefined,b.dataset.kitId);
});
app.addEventListener('change',e=>{if(e.target.id==='modification'&&atWorkbench){selectedMod=e.target.value;render();}});
document.addEventListener('visibilitychange',syncSurgeryTimer);
document.title=atWorkbench?'制造台 · 急救包试玩':'急救包 · 日常试玩';
render();

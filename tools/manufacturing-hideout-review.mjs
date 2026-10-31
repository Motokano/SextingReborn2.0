const frame=document.querySelector('#game'),status=document.querySelector('#status');
try {
  // Use the actual game with a private storage object before any game script runs.
  const isolation=`<script>const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(String(k))??null,setItem:(k,v)=>memory.set(String(k),String(v)),removeItem:k=>memory.delete(String(k)),clear:()=>memory.clear(),key:n=>Array.from(memory.keys())[n]??null,get length(){return memory.size}}});<\/script>`;
  const response=await fetch('index.html?no_reload');if(!response.ok)throw Error('游戏页面加载失败');
  const ready=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  const reviewLayout='<style>#bottom-hud-stack{top:auto!important;bottom:16px!important;left:20px!important;transform:none!important}</style>';
  frame.srcdoc=(await response.text()).replace('<head>','<head><base href="'+new URL('.',document.baseURI).href+'">'+isolation+reviewLayout);
  await ready;const g=frame.contentWindow;await g.AppBoot.ready;
  g.CharacterAttributes.setState({character_creation_completed:true});
  g.document.querySelector('#character-creation-overlay')?.classList.add('hidden');
  g.MapProjection.setMode('isometric');
  await g.NPCSystem.preloadNpc('npc.station.manufacturing_base');
  function returnToBench(){
    g.DialogueUI.close();g.NPCSystem.menu.close();
    g.GameEngine.setState('M0_Base_Inside_lv_1',4,12);g.SceneCtx.setFacingDir(0);
    g.SceneRenderer.render();g.SceneHud.refresh('status');
  }
  returnToBench();
  document.querySelector('#return').onclick=returnToBench;
  document.querySelector('#inspect').onclick=()=>g.SceneCtx.actions.interactNpc('npc.station.manufacturing_base');
  for(const b of document.querySelectorAll('button'))b.disabled=false;
  status.textContent='';
}catch(error){status.textContent=error.message;console.error(error);}

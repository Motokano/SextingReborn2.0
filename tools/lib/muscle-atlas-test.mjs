import assert from 'node:assert/strict';

export async function openMuscleRewards(h) {
  const g=h.g,d=g.document;
  g.SceneHud.refresh('status');
  if(!g.MusclePanel.isOpen()) d.getElementById('btn-muscles').click();
  await h.drain();
  assert.equal(g.MusclePanel.isOpen(),true,'muscles open through the gated HUD entry');
  d.querySelector('#modal-muscles [data-view=rewards]').click();
  await h.drain();
}

export async function readMuscleGroup(h,id) {
  const g=h.g,d=g.document,slot=g.Muscles.getChainSlotForGroup(id);
  d.querySelector(`#modal-muscles [data-slot=${slot.id}]`).click();
  d.querySelector('#modal-muscles [data-view=muscles]').click();
  d.querySelector(`#modal-muscles [data-group=${id}]`).click();
  const ids=[...d.querySelectorAll('#modal-muscles [data-muscle]')].map(el=>el.dataset.muscle),nodes=[];
  for(const muscle of ids){
    d.querySelector(`#modal-muscles [data-muscle="${muscle}"]`).click();
    nodes.push({id:muscle,text:d.querySelector('#modal-muscles .ma-muscle-info').textContent.replace(/\s+/g,'')});
  }
  await h.drain();
  return {id,nodes,text:nodes.map(node=>node.text).join('\n')};
}

// Completion cards were removed from the approved atlas. Check their domain
// contract here; earned totals and per-muscle rewards are read from the real UI.
export function completionText(g,id) {
  return g.Muscles.getGroupCompletionEffects(id).map(effect=>{
    const d=g.Muscles.getEffectDisplay(effect);return d.name+(d.value>0?'+':'')+d.value+d.unit;
  }).join('')+(g.Muscles.isGroupComplete(id)?'已解锁':'未解锁');
}

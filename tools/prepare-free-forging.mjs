// Re-run only when tuning level goals; normal HTML builds use the saved catalog.
import {readFile,writeFile} from 'node:fs/promises';
import {catalogFrom,chapters,categories} from './blade-forging/catalog.mjs';
import {createBladeForge} from './blade-forging/core.mjs';
import {findRoute} from './blade-forging/search.mjs';
const parts=catalogFrom(await readFile(new URL('../docs/design/weapon-component-final-stats-draft.md',import.meta.url),'utf8'));
const {goals:highGoals}=JSON.parse(await readFile(new URL('./blade-forging/high-goal-tuning.json',import.meta.url),'utf8'));
const witnesses=[];
for(const level of parts){
 const initialScore=level.scoreIndices.reduce((s,i)=>s+level.initial[i],0);
 if(level.goalType==='high'){
  level.goal={type:'high',min:99999};
  const forge=createBladeForge(level),route=findRoute(forge,[],{extreme:true});
  const reachable=forge.score(route.state);
  level.goal={type:'high',min:level.id==='B01'?100:Math.max(initialScore+15,Math.ceil(reachable*(.38+level.tier*.025)/5)*5)};
 }else if(level.goalType==='low'){
  level.goal={type:'low',max:0};
  const forge=createBladeForge(level),route=findRoute(forge,[],{extreme:true});
  level.goal={type:'low',max:Math.floor(forge.score(route.state)+(initialScore-forge.score(route.state))*.22)};
 }else{
  // A bounded upward target, with room for light-hammer adjustment.
  const min=initialScore+Math.max(10,Math.round(initialScore*(.65+level.tier*.08)));
  level.goal={type:'range',min,max:min+Math.max(4,Math.round(level.scoreIndices.length*.7))};
 }
 if(level.goal.type==='high'&&highGoals[level.id])level.goal.min=highGoals[level.id];
 // H01: temper leaves 18 points (33%); three careful light strikes can reach 12.
 if(level.id==='H01')level.goal={type:'low',max:12};
 const forge=createBladeForge(level),route=findRoute(forge,[],{width:100});
 if(forge.stars(forge.create())!==0||forge.stars(route.state)!==3)throw Error(level.id+' invalid starting/goal configuration');
 witnesses.push({id:level.id,score:forge.score(route.state),actions:route.actions});
 console.log(level.number+'/83 '+level.id+' '+forge.goalText+' · witness '+forge.score(route.state));
}
await writeFile(new URL('./blade-forging/levels.json',import.meta.url),JSON.stringify({version:2,chapters,categories,levels:parts},null,2)+'\n');
await writeFile(new URL('./blade-forging/witnesses.json',import.meta.url),JSON.stringify(witnesses,null,2)+'\n');

// UI question: A courtyard workbench / B immersive field / C farm ledger.
// Real crop and supply rules, isolated sample state. Construction is an immediate UI preview.
import { renderCropArt as botanical } from './agriculture-crop-art.mjs';
import { renderPlotArt, renderStructureArt, structureArtIds } from './agriculture-structure-art.mjs';
import { mountAgricultureWater } from './agriculture-water-fx.mjs';
import { renderSoilArt } from './agriculture-soil-art.mjs';
import { advanceAgricultureWait } from './agriculture-wait-runtime.mjs';
if (!window.__AGRICULTURE_UI_MEMORY__) throw Error('Memory isolation required');
const root = new URL('../', import.meta.url);
const [defs, soils] = await Promise.all(['agriculture-crop-defs.json','agriculture-soils.json'].map(async f => (await fetch(new URL('data/'+f, root))).json()));
await window.__AGRICULTURE_UI_READY__;
DialogueUI.close(); SceneApp.openCharacterCreationAfterIntro();
await new Promise(r=>setTimeout(r,60));
SceneApp.creation.confirm({name:'农田试玩',height:178,gender:'male',hand:'right',leg:'right'});
await new Promise(r=>setTimeout(r,60));
DialogueUI.close();
for (const id of ['agriculture','livestock']) { NPCSystem.setDemoFlag('facility_cleaned:'+id,true); NPCSystem.setDemoFlag('facility_restored:'+id,true); }
GameEngine.setState('M0_Base_Outside_lv_1',5,10); SceneApp.render();
document.title='农田 · 三种界面试玩';
const A=window.AgricultureMap, env={cropDefs:defs,soils}; A.bindEnv(env);
const variants={A:'庭院总览',B:'田间沉浸',C:'农务手账'};
const ui={variant:variants[new URLSearchParams(location.search).get('variant')]?new URLSearchParams(location.search).get('variant'):'A',view:'growth',mode:'inspect',selected:[3,2],seed:'cherry',seedGroup:'all',build:'channel',tick:0,open:true,waiting:false,filter:'all',message:'',harvest:0};
let st, inspection, timer, waterFx, waitTimer=null;
ui.buildReturn=false;
const host=document.createElement('div');host.id='agriculture-ui-prototype';document.body.append(host);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Math.round((Number(v)||0)*100)/100;
const coord=(x,y)=>`${String.fromCharCode(65+x)}${String(y+1).padStart(2,'0')}`;
const cell=(x,y)=>A.cell(st,x,y);
const curr=()=>cell(...ui.selected);
const structureName=id=>defs.crop_structure_labels[id]||id;
const supportedCrops=id=>Object.keys(defs.crops).filter(cropId=>defs.crops[cropId].required_crop_structure_id===id);
const isCropStructure=id=>structureArtIds.includes(id);
function buildReason(c,id){
 if(!isCropStructure(id)&&!['channel','buried_pot_jar','venturi_fertilizer'].includes(id))return '设施不可用';
 if(c.kind!=='land')return '需空地';
 if(c.crop)return '需先收获作物';
 if(c.cropStructure)return `需先拆除${structureName(c.cropStructure)}`;
 if(isCropStructure(id)&&!c.tilled)return '需先开垦';
 return '';
}
function buildAt(id){
 const c=curr(),[x,y]=ui.selected,reason=buildReason(c,id);
 if(reason)return {ok:false,reason};
 const task=isCropStructure(id)?{type:'build_crop_structure',structureId:id}:{type:{channel:'build',buried_pot_jar:'build_buried_pot_jar',venturi_fertilizer:'build_venturi'}[id]};
 return A.previewChange(st,x,y,{task});
}
function removal(c){
 if(c.kind==='land'&&c.cropStructure)return {type:'remove_crop_structure',label:structureName(c.cropStructure),reason:c.crop?'需先收获或清理作物':!c.tilled?'需已开垦土地':''};
 const type={channel:'remove',buried_pot_jar:'remove_buried_pot_jar',venturi_fertilizer:'remove_venturi',super_fusion:'remove_super_fusion'}[c.kind];
 return type?{type,label:name(c),reason:''}:null;
}
function compatibleSeeds(id){return `<div class="au-compatible">${supportedCrops(id).map(cropId=>`<button data-select-crop="${cropId}">${botanical(cropId)}<span>${esc(defs.crops[cropId].name)}</span></button>`).join('')}</div>`;}
const name=c=>c.crop?.name||(c.cropStructure?structureName(c.cropStructure):null)||({land:c.tilled?'待播耕地':'未开垦土地',pool:'水源',channel:'水渠',buried_pot_jar:'埋地陶瓮',venturi_fertilizer:'文丘里施肥器',super_fusion:'超融合装置'}[c.kind]||'土地');
const progress=c=>c.crop?Math.round(100*(1-c.crop.remainingTicks/c.crop.totalTicks)):0;
const iconPaths={leaf:'M5 18C2 7 10 3 20 3c0 10-4 17-15 15Zm0 0L16 7',water:'M12 3C8 9 5 12 5 16a7 7 0 0 0 14 0c0-4-3-7-7-13Z',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',seed:'M12 21V10M12 14C3 14 2 6 3 4c8 0 9 7 9 10Zm0-3c0-7 5-9 9-9 0 7-4 10-9 9Z',tool:'m4 20 10-12M10 3l10 8M3 18l3 3M14 3l6 6',sun:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M20 4l-2 2M6 18l-2 2',bolt:'m13 2-9 12h7l-1 8L21 9h-8z',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',soil:'m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5',flask:'M9 2h6M10 2v7L4 19q-1 3 3 3h10q4 0 3-3L14 9V2M7 15h10',arrow:'M5 12h14m-6-6 6 6-6 6',check:'m5 12 4 4L20 5',close:'m6 6 12 12M18 6 6 18',basket:'M3 10h18l-3 11H6L3 10Zm3 0 6-8 6 8M9 14v3M15 14v3'};
const ico=(id,cls='')=>`<svg class="au-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[id]||iconPaths.leaf}"/></svg>`;
function device(kind){
 const shapes={buried_pot_jar:'<ellipse cx="50" cy="84" rx="28" ry="7" fill="#1a2018"/><path d="M38 27q-7 12-15 28-10 33 27 34 37-1 27-34-8-16-15-28" fill="#ab784d" stroke="#594f37" stroke-width="3"/><path d="M29 52q22 10 43 0M28 64q22 9 44 0" fill="none" stroke="#c39361" stroke-width="2"/><ellipse cx="50" cy="29" rx="16" ry="7" fill="#4b4230" stroke="#d2a373" stroke-width="4"/>',venturi_fertilizer:'<path d="M36 20h28v61H36z" fill="#73796a"/><rect x="29" y="27" width="42" height="42" rx="5" fill="#b2a375" stroke="#d1bb83" stroke-width="2"/><path d="M35 56h30v8H35z" fill="#688760"/><path d="M43 11h14v10H43zM19 53h10v10H19zM71 53h10v10H71z" fill="#9c916f"/><circle cx="50" cy="38" r="8" fill="#293e35"/><path d="m50 38 4-3" stroke="#d5bd77" stroke-width="2"/>',super_fusion:'<path d="M23 29 50 15l28 14v48L50 91 23 77Z" fill="#576d60" stroke="#9fa690" stroke-width="2"/><path d="M31 37h38v34H31z" fill="#192f2a"/><path d="m54 37-16 22h12l-2 14 17-25H53Z" fill="#c8b277"/>'};
 return `<svg class="au-device" viewBox="0 0 100 100" aria-hidden="true">${shapes[kind]||''}</svg>`;
}
function irrigationArt(kind){
 if(kind!=='channel')return device(kind);
 return '<svg class="au-device" viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="79" rx="35" ry="7" fill="#15231b" opacity=".5"/><path d="M12 55 65 22l25 14v14L37 83 12 69Z" fill="#526651"/><path d="m12 55 25 14 53-33-25-14Z" fill="#9aa18a"/><path d="m21 55 45-28 15 9-45 28Z" fill="#294e49"/><path d="m24 55 42-25 12 7-42 25Z" fill="#5faaa0"/><path d="m29 54 36-22m-28 25 32-20" stroke="#b7dbbc" stroke-width="1.4" stroke-linecap="round" opacity=".65"/><path d="M37 69v14m13-22v13m14-22v13m13-21v13M12 55l25 14 53-33" fill="none" stroke="#b1b396" stroke-width="1.5"/><path d="m16 64 16 9m18-7 9-6m19-11 8-5" stroke="#354c3e" stroke-width="2" opacity=".6"/></svg>';
}
function reset(){
 setWaiting(false);
 st=A.createDefaultState();ui.tick=0;ui.harvest=0;ui.mode='inspect';ui.selected=[5,1];ui.filter='all';ui.buildReturn=false;
 for(let y=0;y<11;y++)for(let x=0;x<11;x++){const c=cell(x,y);if(c.kind==='land'){c.soilId=y<6?'soil_cinnamon':'soil_yellow_cotton';c.soilType=soils.soils[c.soilId].display_name;c.tilled=x>1&&x<10&&y>0&&y<10;}}
 for(let y=0;y<11;y++){A.tryPlaceChannelAt(st,1,y);cell(1,y).capacity=4;}
 for(const y of [4,8])for(let x=2;x<10;x++){A.tryPlaceChannelAt(st,x,y);cell(x,y).capacity=2;}
 A.tryPlaceVenturiAt(st,2,0);A.tryInjectSeaweedEffectAt(st,env,2,0);A.trySetSeaweedConcentrationAt(st,2,0,0);
 for(const [x,y] of [[3,3],[7,6]]){cell(x,y).kind='buried_pot_jar';cell(x,y).jarLiquid={itemId:'fertilizer_compost_plus',nutrientRemaining:2300,bottleCount:2,nutrientPerBottle:1500};cell(x,y).jarReleaseRate=3.2;}
 cell(10,10).kind='super_fusion';st.power_charge=420;
 const groups=[{id:'cherry',xs:[2,3,4],ys:[1,2],soil:'soil_black'},{id:'chili_red',xs:[6,7,8],ys:[2,3],soil:'soil_cinnamon'},{id:'maize',xs:[2,3,4],ys:[5,6,7],soil:'soil_red'},{id:'rice',xs:[6,7,8,9],ys:[5,7],soil:'soil_purple'},{id:'peanut',xs:[2,3,4],ys:[9],soil:'soil_cinnamon'}];
 for(const g of groups)for(const y of g.ys)for(const x of g.xs){const c=cell(x,y);c.tilled=true;c.soilId=g.soil;c.soilType=soils.soils[g.soil].display_name;c.cropStructure=defs.crops[g.id].required_crop_structure_id;A.tryPlantCropAt(st,env,x,y,g.id);if(c.crop){const f=.35+((x*5+y*3)%8)*.065;c.crop.remainingTicks=Math.round(c.crop.totalTicks*(1-f));c.crop.waterAbsorbed=(defs.crops[g.id].perfectMinWater||0)*f;c.crop.fertilizerAbsorbed=(defs.crops[g.id].perfectMinFertilizer||0)*f;c.crop.traceAbsorbed=(defs.crops[g.id].perfectMinTrace||0)*f;}}
 for(const [x,y]of [[2,7],[3,7],[4,7]]){Object.assign(cell(x,y).crop,{settled:true,remainingTicks:0,harvestCount:4,result:'good',resultLabel:'成熟'});}
 for(const [id,x,y]of [['tomato',5,1],['cucumber',6,1],['sugarcane',7,1],['sprout',8,1],['ginger',9,1],['lotus_seed',5,3]]){
  const c=cell(x,y),d=defs.crops[id];
  c.cropStructure=d.required_crop_structure_id;
  A.tryPlantCropAt(st,env,x,y,id);
  if(c.crop){c.crop.remainingTicks=Math.round(c.crop.totalTicks*.65);c.crop.waterAbsorbed=(d.perfectMinWater||0)*.35;c.crop.fertilizerAbsorbed=(d.perfectMinFertilizer||0)*.35;c.crop.traceAbsorbed=(d.perfectMinTrace||0)*.35;}
 }
 // Empty sample patches expose the three soils not used by the planted examples.
 for(const [id,points]of [['soil_saline_alkali',[[9,2],[9,3]]],['soil_alpine_meadow',[[5,5],[5,6]]],['soil_paddy',[[8,9],[9,9]]]]){
  for(const [x,y]of points){const c=cell(x,y);c.soilId=id;c.soilType=soils.soils[id].display_name;}
 }
 A.recomputeIrrigationNetwork(st);A.runAgricultureMapTick(st,env);st.power_charge=420;inspection=A.inspectSupply(st);
 A.setState(st);AgricultureActions.unlockAgriculture();
}
function bands(c,p){if(!c.crop||!p)return[];const d=defs.crops[c.crop.cropId];return ['water','fertilizer','trace'].flatMap(dim=>{const cap=dim[0].toUpperCase()+dim.slice(1),lo=d['perfectMin'+cap],hi=d['perfectMax'+cap];if(hi==null)return[];const low=(lo||0)/c.crop.totalTicks,high=hi/c.crop.totalTicks,value=p[dim];return[{dim,low,high,value,status:value<low?'不足':value>high?'过量':'适宜'}];});}
function status(c,x,y){if(!c.crop)return{name:'待播种',tone:'quiet'};if(c.crop.settled)return{name:c.crop.harvestCount>0?'可收获':'已枯萎',tone:c.crop.harvestCount>0?'ready':'risk'};const b=bands(c,inspection.plots[`${x},${y}`]).find(v=>v.status!=='适宜');return b?{name:({water:'供水',fertilizer:'肥料',trace:'微量'}[b.dim])+b.status,tone:'risk'}:{name:'生长良好',tone:'good'};}
function plots(){return st.map.flatMap((row,y)=>row.flatMap((c,x)=>c.crop?[{c,x,y,s:status(c,x,y)}]:[]));}
function counts(){const p=plots();return {growing:p.filter(p=>!p.c.crop.settled).length,ready:p.filter(p=>p.s.tone==='ready').length,risk:p.filter(p=>p.s.tone==='risk').length};}
function matchesFilter(c,s){return ui.filter==='all'||(ui.filter==='growing'?!c.crop.settled:s.tone===ui.filter);}
function stats(){const v=counts();return `<div class="au-stats" role="group" aria-label="作物状态筛选">${[['growing','生长中'],['ready','可收获'],['risk','需照看']].map(([id,label])=>`<button data-filter="${id}" aria-pressed="${ui.filter===id}"><b>${v[id]}</b><span>${label}</span></button>`).join('')}</div>`;}
const tag=(s)=>`<span class="au-tag ${s.tone}"><i></i>${esc(s.name)}</span>`;
function harvestParticles(x,y){
 const phase=(x*17+y*29)%31/10;
 // Stagger each plot and mote so adjacent ripe crops never blink in unison.
 return `<span class="au-harvest-fx" aria-hidden="true">${[
  [16,88,2.1,-8,3.6],[78,75,1.6,9,4.3],[41,94,1.9,6,3.9],
  [67,68,1.4,-6,4.7],[28,48,6,5,3.7],[84,36,5,-8,4.5],[53,73,1.7,-5,4.1]
 ].map(([px,py,size,drift,duration],i)=>`<i class="${i===4||i===5?'au-harvest-star':''}" style="--x:${px}%;--y:${py}%;--size:${size}px;--drift:${drift}%;--duration:${duration}s;--delay:-${((phase+i*.63)%duration).toFixed(2)}s"></i>`).join('')}</span>`;
}
function cropStatusFx(tone,x,y){
 const phase=(x*17+y*29)%37/10;
 if(tone==='ready')return `<span class="au-crop-fx ready" aria-hidden="true"><span class="au-fx-ground"></span>${harvestParticles(x,y)}</span>`;
 const risk=tone==='risk';
 return `<span class="au-crop-fx ${risk?'risk':'growing'}" aria-hidden="true"><span class="au-fx-ground"></span>${risk?'<i class="au-care-wave"></i><i class="au-care-wave echo"></i>':''}${(risk?[22,76,52]:[19,73,42]).map((px,i)=>`<i class="au-field-mote ${risk?'au-care-fleck':'au-growth-leaf'}" style="--x:${px}%;--y:${risk?18+i*9:76+i*4}%;--drift:${(i%2?1:-1)*(10+i*3)}%;--duration:${risk?3.8+i*.6:4.6+i*.7}s;--delay:-${(phase+i*1.3).toFixed(2)}s"></i>`).join('')}</span>`;
}
function header(){return `<header class="au-header"><div class="au-brand">${ico('seed')}<div><h1>农田</h1></div></div>${ui.variant==='A'?stats():''}<div class="au-header-right"><span class="au-power">${ico('bolt')}${n(st.power_charge)}<small>储能</small></span><button class="au-icon-button" data-action="close" aria-label="关闭农田">${ico('close')}</button></div></header>`;}
function tabs(){return `<nav class="au-layers" aria-label="农田图层">${[['growth','leaf','作物'],['water','water','水路'],['nutrients','flask','养分'],['soil','soil','土壤']].map(([v,i,t])=>`<button data-view="${v}" aria-pressed="${ui.view===v}">${ico(i)}${t}</button>`).join('')}</nav>`;}
function playerStatus(){
 const S=window.Survival;
 const meters=[['stamina','体力',S.getStamina(),S.getStaminaMax()],['fatigue','疲劳',S.getFatigue(),S.getConfigValue('fatigue_max',100)]];
 return `<div class="au-player-status" role="group" aria-label="玩家状态">${meters.map(([id,label,value,max])=>{const pct=Math.max(0,Math.min(100,value/Math.max(1,max)*100));const warn=id==='stamina'?value<max*.3:value>=S.getConfigValue('fatigue_tired_min',50);return `<div class="au-player-meter ${id}${warn?' warning':''}" data-player-resource="${id}"><div class="au-player-reading"><span>${label}</span><b>${n(value)} <small>/ ${n(max)}</small></b></div><div class="au-player-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${n(value)}"><i style="width:${pct}%"></i></div></div>`;}).join('')}</div>`;
}
function board(){
 const [sx,sy]=ui.selected,p=inspection.plots[`${sx},${sy}`];const linked=new Set(p?.jars.map(j=>`${j.x},${j.y}`)||[]);if(p?.source)linked.add(`${p.source.x},${p.source.y}`);
 const ground=st.map.flatMap((row,y)=>row.map((c,x)=>{
  const s=status(c,x,y),selected=sx===x&&sy===y,kind=c.kind,water=kind==='pool'||kind==='channel';
  const required=defs.crops[ui.seed]?.required_crop_structure_id;
  const valid=ui.mode==='plant'?kind==='land'&&c.tilled&&!c.crop&&(!required||c.cropStructure===required):ui.mode==='build'?!buildReason(c,ui.build):false;
  const q=inspection.plots[`${x},${y}`];let metric='';
  if(ui.view==='water'&&(water||c.crop))metric=n(water?(kind==='pool'?200:c.water):q?.water);
  if(ui.view==='nutrients'&&c.crop)metric=n(q?.fertilizer);
  if(ui.view==='soil'&&kind==='land')metric=soils.soils[c.soilId]?.display_name?.replace('典型','').replace('高山','')||'';
  const faded=c.crop&&!matchesFilter(c,s);
  return `<button class="au-tile ${kind} ${c.tilled?'tilled':''} ${selected?'selected':''} ${linked.has(`${x},${y}`)?'linked':''} ${valid?'valid-target':''} ${faded?'faded':''} ${c.crop?'has-crop':''} ${c.cropStructure?'has-structure':''}" style="--grain:${(x*13+y*29)%100}%;--tile-hue:${((x+y)%3)*3}deg;--plot-phase:-${((x*17+y*29)%37/10).toFixed(1)}s" data-cell="${x},${y}" data-status="${c.crop?s.tone:''}" data-soil="${c.soilId}" data-structure="${c.cropStructure||''}" aria-pressed="${selected}" aria-label="${coord(x,y)} ${esc(name(c))}${c.crop?' '+s.name:''}${c.crop&&c.cropStructure?' · '+structureName(c.cropStructure):''}" title="${coord(x,y)} · ${esc(name(c))}">${kind==='land'?renderSoilArt(c.soilId,x*13+y*29,c.tilled):''}${c.crop||c.cropStructure?renderPlotArt(c.crop?.cropId,c.cropStructure):device(kind)}${c.crop&&ui.view==='growth'?`<span class="au-growth"><i style="width:${progress(c)}%"></i></span>${cropStatusFx(s.tone,x,y)}`:''}${metric!==''?`<span class="au-metric">${metric}</span>`:''}${selected?'<span class="au-corner tl"></span><span class="au-corner br"></span>':''}</button>`;
 })).join('');
 return `<section class="au-map-section"><div class="au-map-top">${tabs()}</div><div class="au-field-stage"><div class="au-compass"><span>N</span><i></i></div><div class="au-map-frame"><div class="au-axis top">${Array.from({length:11},(_,i)=>`<span>${String.fromCharCode(65+i)}</span>`).join('')}</div><div class="au-axis left">${Array.from({length:11},(_,i)=>`<span>${String(i+1).padStart(2,'0')}</span>`).join('')}</div><div class="au-map" role="group" aria-label="十一乘十一农田" data-layer="${ui.view}">${ground}</div></div></div><div class="au-map-bottom">${playerStatus()}</div></section>`;
}
function meter(b){
 const names={water:'水分',fertilizer:'肥料',trace:'微量元素'},tone=b.status==='适宜'?'good-text':'warn-text';
 return `<div class="au-supply-item"><span class="au-supply-name">${names[b.dim]}</span><b class="au-supply-value">${n(b.value)}</b><span class="au-supply-state ${tone}">${b.status}</span><small class="au-supply-range">适宜范围 ${n(b.low)}–${n(b.high)}</small></div>`;
}
function cropSupply(bs){return `<section class="au-supply-section" aria-label="当前供给"><div class="au-supply-title"><span>当前供给</span><small>/ 刻</small></div><div class="au-supply-card">${bs.map(meter).join('')}</div></section>`;}
function sourceLink(p,label,compact=false){return `<button class="au-source${compact?' au-context-link':''}" data-cell="${p.x},${p.y}"><span>${esc(label)}</span><b>${coord(p.x,p.y)} <span aria-hidden="true">↗</span></b></button>`;}
function cropContext(c,p){
 const soilName=p?.soil?.display_name||soils.soils[c.soilId]?.display_name||'土壤',effective=p?.effectiveSoil?.display_name;
 const source=c.crop.settled?'':`${p?.source?sourceLink(p.source,'水源',true):'<div class="au-context-row"><span>水源</span><b class="warn-text">未接通</b></div>'}${p?.jars.map(j=>sourceLink(j,'肥源',true)).join('')||''}`;
 return `<div class="au-plot-context">${source}<details class="au-soil-details"><summary><span>土壤</span><span class="au-context-soil"><span class="au-soil-swatch">${renderSoilArt(c.soilId,0,c.tilled)}</span><b>${esc(soilName)}</b><i aria-hidden="true"></i></span></summary><dl class="au-detail-values"><dt>健康</dt><dd>${n(c.crop.healthCurrent)} / ${n(c.crop.healthMax)}</dd>${effective&&effective!==soilName?`<dt>实际土性</dt><dd>${esc(effective)}</dd>`:''}<dt>累计吸水</dt><dd>${n(c.crop.waterAbsorbed)}</dd><dt>累计肥料</dt><dd>${n(c.crop.fertilizerAbsorbed)}</dd><dt>累计微量</dt><dd>${n(c.crop.traceAbsorbed)}</dd></dl></details></div>`;
}
function inspector(){
 const c=curr(),[x,y]=ui.selected,p=inspection.plots[`${x},${y}`],s=status(c,x,y),d=c.crop&&defs.crops[c.crop.cropId];let content='',action='';
 if(ui.mode==='plant'){
  const target=c.kind==='land'&&c.tilled&&!c.crop;
  const preview=target?A.previewChange(st,x,y,{cropId:ui.seed}):{ok:false};
  const groups={all:'全部作物',grain:'谷物',veg:'蔬菜',aromatics:'葱姜香草',spice:'香料',fruit:'果实'};
  const list=Object.keys(defs.crops).filter(id=>ui.seedGroup==='all'||defs.crops[id].group===ui.seedGroup);
  content=`<div class="au-section-heading"><span>种子</span><a class="au-catalog-link" href="tools/agriculture-crop-art-review.html?no_reload" target="_blank" rel="noopener">图鉴 ↗</a></div><select class="au-seed-group" aria-label="作物分类">${Object.entries(groups).map(([id,label])=>`<option value="${id}" ${ui.seedGroup===id?'selected':''}>${label}</option>`).join('')}</select><div class="au-seeds">${list.map(id=>`<button data-seed="${id}" aria-pressed="${ui.seed===id}">${botanical(id)}<span>${defs.crops[id].name}<small>${defs.crops[id].growthTicks} 刻</small></span></button>`).join('')}</div>${preview.ok?`<div class="au-preview"><p>供水 ${n(A.inspectSupply(preview.state).plots[`${x},${y}`]?.water)} / 刻</p></div>`:''}`;
  const req=defs.crops[ui.seed].required_crop_structure_id,missing=req&&c.cropStructure!==req;
  const canPrepare=target&&missing&&!c.cropStructure;
  const hint=!target?(c.kind==='land'&&!c.tilled?'需先开垦':'需空置耕地'):missing?(c.cropStructure?`需先拆除${structureName(c.cropStructure)}`:'未建造'):'已就绪';
  action=`${req?`<div class="au-requirement">${renderStructureArt(req)}<span>${structureName(req)}<small class="${missing||!target?'warn-text':'good-text'}">${hint}</small></span>${target&&!missing?ico('check'):''}</div>`:!target?`<small class="au-build-reason">${hint}</small>`:''}<button class="au-primary" data-action="${canPrepare?'prepare-structure':'plant'}" ${preview.ok||canPrepare?'':'disabled'}>${ico(canPrepare?'tool':'seed')}${canPrepare?'建造'+structureName(req):'播种'+defs.crops[ui.seed].name}</button>${target&&missing&&c.cropStructure?'<button class="au-text-button" data-action="inspect-structure">管理现有设施 →</button>':''}`;
 }else if(ui.mode==='build'){
  const options=[['channel','water','水渠'],['buried_pot_jar','soil','埋地陶瓮'],['venturi_fertilizer','flask','文丘里施肥器']];
  const cropStructure=isCropStructure(ui.build),label=cropStructure?structureName(ui.build):options.find(o=>o[0]===ui.build)?.[2],reason=buildReason(c,ui.build);
  content=`${cropStructure?`<div class="au-build-hero">${renderStructureArt(ui.build)}<h2>${label}</h2><span>${supportedCrops(ui.build).map(id=>defs.crops[id].name).join(' · ')}</span></div>`:''}<div class="au-section-heading"><span>作物设施</span><a class="au-catalog-link" href="tools/agriculture-crop-art-review.html?no_reload&tab=structures" target="_blank" rel="noopener">图鉴 ↗</a></div><div class="au-structure-options">${structureArtIds.map(id=>`<button data-build="${id}" aria-pressed="${ui.build===id}">${renderStructureArt(id)}<span>${structureName(id)}</span></button>`).join('')}</div><div class="au-section-heading"><span>灌溉设施</span></div><div class="au-structure-options au-irrigation-options">${options.map(([id,i,t])=>`<button data-build="${id}" aria-pressed="${ui.build===id}">${irrigationArt(id)}<span>${t}</span></button>`).join('')}</div>`;
  action=`${reason?`<small class="au-build-reason">${reason}</small>`:''}<button class="au-primary" data-action="build" ${reason?'disabled':''}>${ico('tool')}建造${label}</button>${ui.buildReturn?'<button class="au-text-button" data-action="back-to-seeds">返回播种</button>':''}`;
 }else if(c.crop){
  const bs=bands(c,p);
  content=`<div class="au-crop-hero"><div class="au-botanical-orbit"></div>${renderPlotArt(c.crop.cropId,c.cropStructure)}</div><div class="au-crop-heading"><h2>${esc(name(c))}</h2>${tag(s)}</div>${c.cropStructure?`<div class="au-structure-badge">${ico('tool')}${structureName(c.cropStructure)}</div>`:''}<div class="au-progress-label"><span>${c.crop.settled?'本季已成熟':'生长进度'}</span><b>${c.crop.settled?'可收获':`${c.crop.remainingTicks} 刻后成熟`}</b></div><div class="au-progress"><i style="width:${progress(c)}%"></i></div>${!c.crop.settled?cropSupply(bs):`<div class="au-harvest-yield">${ico('basket')}<span>本次收获</span><b>${c.crop.harvestCount} 份</b></div>`}${cropContext(c,p)}`;
  action=`${c.crop.settled&&c.crop.harvestCount>0?`<button class="au-primary" data-action="harvest">${ico('basket')}收获作物</button>`:''}<button class="au-secondary au-remove-action" data-action="clear-crop" title="清理后不返还种子和产物">清理作物</button>`;
 }else if(c.kind==='land'&&c.cropStructure){
  content=`<div class="au-crop-hero">${renderStructureArt(c.cropStructure)}</div><div class="au-crop-heading"><h2>${structureName(c.cropStructure)}</h2>${tag({name:'已建成',tone:'good'})}</div><div class="au-soil-info"><span class="au-soil-swatch">${renderSoilArt(c.soilId,0,c.tilled)}</span><span>${esc(soils.soils[c.soilId]?.display_name||'盐碱土')}</span></div><div class="au-section-heading"><span>适用作物</span></div>${compatibleSeeds(c.cropStructure)}`;
  action=`<button class="au-primary" data-action="plant-mode">${ico('seed')}选择种子</button>`;
 }else if(c.kind==='land'){
  content=`<div class="au-empty-plot">${ico('seed')}</div><div class="au-crop-heading"><h2>${name(c)}</h2></div><div class="au-soil-info"><span class="au-soil-swatch">${renderSoilArt(c.soilId,0,c.tilled)}</span><span>${esc(soils.soils[c.soilId]?.display_name||'盐碱土')}</span></div><div class="au-section-heading"><span>土地特性</span></div>${['water','fertilizer','trace'].map((k,i)=>`<div class="au-fact"><span>${['保水','保肥','微量保持'][i]}</span><b>${n((soils.soils[c.soilId]?.[k+'_retention']||0)*100)}%</b></div>`).join('')}`;
  action=`<button class="au-secondary" data-action="${c.tilled?'plant-mode':'till'}">${ico('seed')}<span>${c.tilled?'选择种子':'开垦土地'}</span></button><button class="au-secondary" data-mode="build">${ico('tool')}<span>营建设施</span></button>`;
 }else{
  const isJar=c.kind==='buried_pot_jar',isVenturi=c.kind==='venturi_fertilizer',liquid=isJar?c.jarLiquid:c.venturiLiquid;
  content=`<div class="au-crop-hero device-hero">${c.kind==='pool'||c.kind==='channel'?ico('water'):device(c.kind)}</div><div class="au-crop-heading"><h2>${name(c)}</h2>${tag({name:c.kind==='channel'&&!(c.water>0)?'未通水':'运行中',tone:'good'})}</div><div class="au-section-heading"><span>设施状态</span></div>${c.kind==='pool'?'<div class="au-big-number">200 <small>/ 刻</small></div>':c.kind==='channel'?`<div class="au-fact"><span>当前水量</span><b>${n(c.water)} / ${n(c.capacity)}</b></div><div class="au-fact"><span>微量浓度</span><b>${n(c.seaweedConcentration)}</b></div>`:isJar||isVenturi?`<div class="au-fact"><span>剩余养分</span><b>${n(liquid?.nutrientRemaining)}</b></div><label class="au-rate">${isJar?'总释放量':'海藻精浓度'}<output>${n(isJar?c.jarReleaseRate:c.seaweedManualConcentration)}</output><input type="range" min="0" max="${isJar?3.75:6}" step="0.05" value="${isJar?c.jarReleaseRate:c.seaweedManualConcentration||0}" data-rate="${isJar?'jar':'venturi'}" aria-label="${isJar?'陶瓮释放量':'海藻精浓度'}"></label>`:`<div class="au-fact"><span>剩余储能</span><b>${n(st.power_charge)}</b></div>`}<div class="au-source-list">${Object.entries(inspection.plots).filter(([,p])=>p.jars.some(j=>j.x===x&&j.y===y)||p.source?.x===x&&p.source?.y===y).map(([key])=>{const [px,py]=key.split(',').map(Number);return sourceLink({x:px,y:py},name(cell(px,py)));}).join('')}</div>`;
  action=isJar||isVenturi?`<button class="au-primary" data-action="refill">${ico('flask')}补充一瓶${isJar?'液态肥':'海藻精'}</button>`:`<button class="au-secondary" data-view="water">${ico('water')}查看水路</button>`;
 }
 const remove=ui.mode==='inspect'&&removal(c);
 if(remove)action+=`<button class="au-secondary au-remove-action" data-action="remove-facility" ${remove.reason?'disabled aria-describedby="au-remove-reason"':''}>拆除${esc(remove.label)}</button>${remove.reason?`<small class="au-remove-reason" id="au-remove-reason">${remove.reason}</small>`:''}`;
 return `<aside class="au-inspector"><div class="au-inspector-top"><span>${ui.mode==='inspect'?'地块详情':ui.mode==='plant'?'播种':'营建'}</span><small>${coord(x,y)}</small></div><div class="au-inspector-scroll">${content}</div>${action?`<div class="au-action-slot">${action}</div>`:''}</aside>`;
}
function ledger(){return `<section class="au-ledger"><div class="au-ledger-title"><span class="au-eyebrow">FIELD NOTES</span><h2>田间手账</h2><p>耕作有序，生长有时。</p></div>${stats()}<div class="au-list-head"><span>作物 / 地块</span><span>生长与供给</span></div><div class="au-ledger-list">${plots().filter(p=>matchesFilter(p.c,p.s)).map(({c,x,y,s})=>`<button class="au-ledger-row ${ui.selected[0]===x&&ui.selected[1]===y?'active':''}" data-cell="${x},${y}">${renderPlotArt(c.crop.cropId,c.cropStructure)}<span><b>${c.crop.name}</b><small>${coord(x,y)} · ${progress(c)}%</small></span><span>${tag(s)}<small>${c.crop.settled?'现在可收获':`还需 ${c.crop.remainingTicks} 刻`}</small></span></button>`).join('')}</div></section>`;}
function footer(){return `<footer class="au-footer"><button class="au-wait" data-action="toggle-wait" role="switch" aria-label="自动等待" aria-checked="${ui.waiting}" title="每秒推进一刻"><span>自动等待</span><span class="au-wait-track" aria-hidden="true"><i></i></span></button></footer>`;}
function VariantA(){return `${header()}<div class="au-layout a-layout">${board()}${inspector()}</div>${footer()}`;}
function VariantB(){return `${header()}<div class="au-layout b-layout"><div class="au-field-float"><span class="au-eyebrow">THE LIVING GARDEN</span><h2>田间</h2>${stats()}</div>${board()}${inspector()}</div>${footer()}`;}
function VariantC(){return `${header()}<div class="au-layout c-layout">${ledger()}${board()}${inspector()}</div>${footer()}`;}
function setWaiting(enabled){
 clearInterval(waitTimer);waitTimer=null;
 ui.waiting=Boolean(enabled&&ui.open);
 if(ui.waiting)waitTimer=setInterval(()=>{
  const result=advanceAgricultureWait(window);
  if(result.ok){st=result.state;ui.tick++;SceneHud.refresh('status');}
  if(result.stopped){setWaiting(false);notify('等待已暂停');}
  render(true);
 },1000);
}
// Tick updates retain live controls, scroll positions and particle animation nodes.
function syncTickNode(current,next){
 if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){current.replaceWith(next.cloneNode(true));return;}
 if(current.nodeType!==Node.ELEMENT_NODE){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
 const keepAttribute=key=>(current.tagName==='DETAILS'&&key==='open')||(current===document.activeElement&&current.matches('input,select')&&key==='value');
 for(const attr of [...current.attributes])if(!keepAttribute(attr.name)&&!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
 for(const attr of next.attributes)if(!keepAttribute(attr.name)&&current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
 const before=[...current.childNodes].filter(node=>!node.classList?.contains('au-water-fx')),after=[...next.childNodes];
 for(let i=0;i<after.length;i++)if(before[i])syncTickNode(before[i],after[i]);else current.append(after[i].cloneNode(true));
 for(let i=after.length;i<before.length;i++)before[i].remove();
}
function render(tick=false){
 if(!tick){waterFx?.destroy();waterFx=null;}
 inspection=A.inspectSupply(st);host.dataset.variant=ui.variant;
 const markup=`${ui.open?`<div class="au-backdrop"></div><main class="au-window" aria-label="农田界面试玩">${({A:VariantA,B:VariantB,C:VariantC}[ui.variant])()}</main>`:''}<div class="au-switcher"><button data-action="previous" aria-label="上一套布局">←</button><span><small>界面试玩</small><b>${ui.variant} · ${variants[ui.variant]}</b></span><button data-action="next" aria-label="下一套布局">→</button><i></i><a class="au-catalog-link" href="tools/agriculture-crop-art-review.html?no_reload" target="_blank" rel="noopener">作物图鉴 ↗</a><i></i><button class="au-reset" data-action="${ui.open?'reset':'reopen'}">${ui.open?'重置':'打开农田'}</button></div><div class="au-toast" role="status" aria-live="polite">${esc(ui.message)}</div>`;
 if(tick){const next=host.cloneNode(false);next.innerHTML=markup;syncTickNode(host,next);waterFx?.refresh();}
 else host.innerHTML=markup;
 host.classList.toggle('closed',!ui.open);
 if(ui.open&&!tick)waterFx=mountAgricultureWater(host.querySelector('.au-map'),st,ui.selected);
}
function notify(message){ui.message=message;clearTimeout(timer);timer=setTimeout(()=>{ui.message='';const e=host.querySelector('.au-toast');if(e)e.textContent='';},3500);}
function variant(delta){const keys=Object.keys(variants);ui.variant=keys[(keys.indexOf(ui.variant)+delta+3)%3];const url=new URL(location.href);url.searchParams.set('variant',ui.variant);history.replaceState(null,'',url);render();}
host.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.cell){
  ui.selected=b.dataset.cell.split(',').map(Number);
  ui.mode='inspect';ui.buildReturn=false;
  render();return;
 }
 if(b.dataset.view){ui.view=b.dataset.view;render();return;}
 if(b.dataset.mode){ui.mode=b.dataset.mode;ui.buildReturn=false;render();return;}
 if(b.dataset.selectCrop){ui.seed=b.dataset.selectCrop;ui.seedGroup=defs.crops[ui.seed].group;ui.mode='plant';render();return;}
 if(b.dataset.seed){const top=host.querySelector('.au-inspector-scroll').scrollTop;ui.seed=b.dataset.seed;render();host.querySelector('.au-inspector-scroll').scrollTop=top;return;}
 if(b.dataset.build){ui.build=b.dataset.build;render();return;}
 if(b.dataset.filter){ui.filter=ui.filter===b.dataset.filter?'all':b.dataset.filter;const first=ui.filter!=='all'&&plots().find(p=>matchesFilter(p.c,p.s));if(first)ui.selected=[first.x,first.y];ui.mode='inspect';render();return;}
 const c=curr(),[x,y]=ui.selected;
 switch(b.dataset.action){
  case'previous':variant(-1);return;case'next':variant(1);return;
  case'close':setWaiting(false);ui.open=false;break;case'reopen':ui.open=true;break;
  case'reset':reset();notify('示例农田已重置');break;
  case'plant-mode':if(c.cropStructure&&defs.crops[ui.seed].required_crop_structure_id!==c.cropStructure)ui.seed=supportedCrops(c.cropStructure)[0];ui.seedGroup='all';ui.mode='plant';break;
  case'prepare-structure':{const req=defs.crops[ui.seed].required_crop_structure_id;if(!req||buildReason(c,req))break;ui.build=req;ui.mode='build';ui.buildReturn=true;break;}
  case'back-to-seeds':ui.mode='plant';ui.buildReturn=false;break;
  case'inspect-structure':ui.mode='inspect';ui.buildReturn=false;break;
  case'till':A.tryTillAt(st,x,y);notify(`${coord(x,y)} 已开垦`);break;
  case'plant':{const r=A.tryPlantCropAt(st,env,x,y,ui.seed);if(r.ok){ui.mode='inspect';notify(`已播种${defs.crops[ui.seed].name}`);}break;}
  case'build':{const r=buildAt(ui.build);if(r.ok){st=A.setState(r.state);ui.mode=ui.buildReturn?'plant':'inspect';ui.buildReturn=false;notify(`${name(curr())}已建成`);}else notify(r.reason||'当前无法建造');break;}
  case'remove-facility':{const remove=removal(c);if(!remove||remove.reason)break;const r=A.previewChange(st,x,y,{task:{type:remove.type}});if(r.ok){st=A.setState(r.state);ui.mode='inspect';ui.buildReturn=false;notify(`${remove.label}已拆除`);}else notify('当前无法拆除');break;}
  case'harvest':{const r=A.tryHarvestAt(st,x,y);if(r.ok){ui.harvest+=r.harvestCount;notify(`已收获${r.itemName} × ${r.harvestCount}`);}break;}
  case'clear-crop':{const r=A.tryClearCropAt(st,x,y);if(r.ok){ui.mode='inspect';ui.buildReturn=false;notify(`${r.cropName||'作物'}已清理`);}else notify('当前无法清理作物');break;}
  case'toggle-wait':setWaiting(!ui.waiting);render(true);return;
  case'refill':{const r=A.tryLoadFacilityBottleAt(st,x,y,c.kind,c.kind==='buried_pot_jar'?'fertilizer_compost_plus':'liquid_seaweed_extract');notify(r.ok?'已补充一瓶':'储槽空间不足，暂不能装入整瓶');break;}
 }
 render();
});
host.addEventListener('input',e=>{if(e.target.matches('[data-rate]'))e.target.previousElementSibling.textContent=n(e.target.value);});
host.addEventListener('change',e=>{if(e.target.matches('.au-seed-group')){ui.seedGroup=e.target.value;render();return;}if(!e.target.matches('[data-rate]'))return;const [x,y]=ui.selected;const value=Number(e.target.value);if(e.target.dataset.rate==='jar')A.trySetJarReleaseRateAt(st,x,y,value);else A.trySetSeaweedConcentrationAt(st,x,y,value);notify('供给设置已更新');render();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopImmediatePropagation();variant(e.key==='ArrowLeft'?-1:1);}else if(e.key==='Escape'){setWaiting(false);ui.open=!ui.open;render();}},true);
window.addEventListener('pagehide',()=>setWaiting(false));
document.addEventListener('visibilitychange',()=>host.classList.toggle('au-motion-paused',document.hidden));
window.addEventListener('pageshow',e=>{if(e.persisted)render();});
reset();render();

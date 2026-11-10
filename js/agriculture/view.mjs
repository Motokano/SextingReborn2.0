// Faithful A-layout port. Visual state only; complete game actions belong to AgricultureActions.
import {renderCropArt as botanical} from './crop-art.mjs';
import {renderPlotArt,renderStructureArt,structureArtIds} from './structure-art.mjs';
import {renderSoilArt} from './soil-art.mjs';
import {mountAgricultureWater} from './water-fx.mjs';
export function createAgricultureView(host,port){
const A=window.AgricultureMap,defs=port.defs(),soils=port.soilDefs();
const ui={variant:'A',view:'growth',mode:'inspect',selected:[0,0],seed:Object.keys(defs.crops)[0],seedGroup:'all',build:'channel',filter:'all',waiting:false,message:'',buildReturn:false};
let st,inspection,waterFx,timer,active=false;
const buildId=id=>structureArtIds.includes(id)?'crop_structure_'+id:({channel:'channel_dig'}[id]||id);
const removeId=c=>c.cropStructure?'crop_structure_remove':({channel:'channel_remove',buried_pot_jar:'buried_pot_jar_remove',venturi_fertilizer:'venturi_fertilizer_remove',super_fusion:'super_fusion_remove'}[c.kind]);
function materials(id,spec=port.buildSpec(id)){
 if(!spec)return '';
 return `<div class="au-materials">${spec.inputs.map(row=>`<div class="au-fact"><span>${esc(port.itemName(row.item_id))}</span><b class="${port.itemCount(row.item_id)<row.count?'warn-text':''}">${port.itemCount(row.item_id)} / ${row.count}</b></div>`).join('')}<div class="au-fact"><span>工期</span><b>${spec.task_ticks} 刻</b></div><div class="au-fact"><span>体力 / 刻</span><b>${n(port.laborCost(spec.stamina_per_tick))}</b></div></div>`;
}
function extraActions(rows){return `<details class="au-soil-details au-extra-actions"><summary>设施调整</summary>${rows.map(([id,label])=>`<button class="au-secondary" data-build-task="${id}">${label}</button>${materials(id)}`).join('')}</details>`;}
function construction(){
 const t=st.task,spec=t.paymentMeta?.spec||port.taskDefaults(),label=port.taskName(t);
 return `<section class="au-construction"><div class="au-progress-label"><span>${esc(label)}</span><b>${n(t.progress)} / ${spec.task_ticks}</b></div><div class="au-progress"><i style="width:${Math.min(100,t.progress/spec.task_ticks*100)}%"></i></div>${t.paused?'<small class="warn-text">体力不足，工程已暂停</small>':''}<button class="au-secondary" data-action="cancel-task">取消工程</button></section>`;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Math.round((Number(v)||0)*100)/100;
const coord=(x,y)=>`${String.fromCharCode(65+x)}${String(y+1).padStart(2,'0')}`;
const cell=(x,y)=>A.cell(st,x,y);
const curr=()=>cell(...ui.selected);
const structureName=id=>defs.crop_structure_labels[id]||id;
const supportedCrops=id=>Object.keys(defs.crops).filter(cropId=>defs.crops[cropId].required_crop_structure_id===id);
const isCropStructure=id=>structureArtIds.includes(id);
function buildReason(c,id){
 if(!isCropStructure(id)&&!['channel','buried_pot_jar','venturi_fertilizer','super_fusion'].includes(id))return '设施不可用';
 if(st.task)return '已有工程进行中';
 if(c.kind!=='land')return '需空地';
 if(c.crop)return '需先收获作物';
 if(c.cropStructure)return `需先拆除${structureName(c.cropStructure)}`;
 if(isCropStructure(id)&&!c.tilled)return '需先开垦';
 return '';
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
function bands(c,p){if(!c.crop||!p)return[];const d=A.getCropDefForInstance(c.crop)||defs.crops[c.crop.cropId];if(!d)return[];return ['water','fertilizer','trace'].flatMap(dim=>{const cap=dim[0].toUpperCase()+dim.slice(1),lo=d['perfectMin'+cap],hi=d['perfectMax'+cap];if(hi==null)return[];const low=(lo||0)/c.crop.totalTicks,high=hi/c.crop.totalTicks,value=p[dim];return[{dim,low,high,value,status:value<low?'不足':value>high?'过量':'适宜'}];});}
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
  const owned=port.seeds();
  const preview=target&&owned.some(row=>row.cropId===ui.seed)?A.previewChange(st,x,y,{cropId:ui.seed}):{ok:false};
  const groups={all:'全部作物',grain:'谷物',veg:'蔬菜',aromatics:'葱姜香草',spice:'香料',fruit:'果实'};
  const list=owned.map(row=>row.cropId).filter(id=>ui.seedGroup==='all'||defs.crops[id].group===ui.seedGroup);
  content=`<div class="au-section-heading"><span>种子</span></div><select class="au-seed-group" aria-label="作物分类">${Object.entries(groups).map(([id,label])=>`<option value="${id}" ${ui.seedGroup===id?'selected':''}>${label}</option>`).join('')}</select><div class="au-seeds">${list.map(id=>`<button data-seed="${id}" aria-pressed="${ui.seed===id}">${botanical(id)}<span>${defs.crops[id].name}<small>${defs.crops[id].growthTicks} 刻 · ${owned.find(row=>row.cropId===id)?.count||0} 份</small></span></button>`).join('')}</div>${preview.ok?`<div class="au-preview"><p>供水 ${n(A.inspectSupply(preview.state).plots[`${x},${y}`]?.water)} / 刻</p></div>`:''}`;
  const req=defs.crops[ui.seed].required_crop_structure_id,missing=req&&c.cropStructure!==req;
  const canPrepare=target&&missing&&!c.cropStructure&&owned.some(row=>row.cropId===ui.seed);
  const hint=!target?(c.kind==='land'&&!c.tilled?'需先开垦':'需空置耕地'):missing?(c.cropStructure?`需先拆除${structureName(c.cropStructure)}`:'未建造'):'已就绪';
  action=`${req?`<div class="au-requirement">${renderStructureArt(req)}<span>${structureName(req)}<small class="${missing||!target?'warn-text':'good-text'}">${hint}</small></span>${target&&!missing?ico('check'):''}</div>`:!target?`<small class="au-build-reason">${hint}</small>`:''}<button class="au-primary" data-action="${canPrepare?'prepare-structure':'plant'}" ${preview.ok||canPrepare?'':'disabled'}>${ico(canPrepare?'tool':'seed')}${canPrepare?'建造'+structureName(req):'播种'+defs.crops[ui.seed].name}</button>${target&&missing&&c.cropStructure?'<button class="au-text-button" data-action="inspect-structure">管理现有设施 →</button>':''}`;
   if(!list.length)content+='<p class="au-build-reason">暂无种子</p>';
 }else if(ui.mode==='build'){
  const options=[['channel','water','水渠'],['buried_pot_jar','soil','埋地陶瓮'],['venturi_fertilizer','flask','文丘里施肥器'],['super_fusion','bolt','超融合装置']];
  const cropStructure=isCropStructure(ui.build),label=cropStructure?structureName(ui.build):options.find(o=>o[0]===ui.build)?.[2],reason=buildReason(c,ui.build);
  content=`${cropStructure?`<div class="au-build-hero">${renderStructureArt(ui.build)}<h2>${label}</h2><span>${supportedCrops(ui.build).map(id=>defs.crops[id].name).join(' · ')}</span></div>`:''}<div class="au-section-heading"><span>作物设施</span></div><div class="au-structure-options">${structureArtIds.map(id=>`<button data-build="${id}" aria-pressed="${ui.build===id}">${renderStructureArt(id)}<span>${structureName(id)}</span></button>`).join('')}</div><div class="au-section-heading"><span>灌溉设施</span></div><div class="au-structure-options au-irrigation-options">${options.map(([id,i,t])=>`<button data-build="${id}" aria-pressed="${ui.build===id}">${irrigationArt(id)}<span>${t}</span></button>`).join('')}</div>`;
  content+=materials(buildId(ui.build));
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
  content=`<div class="au-crop-hero device-hero">${c.kind==='pool'||c.kind==='channel'?ico('water'):device(c.kind)}</div><div class="au-crop-heading"><h2>${name(c)}</h2>${tag({name:c.kind==='channel'&&!(c.water>0)?'未通水':'运行中',tone:'good'})}</div><div class="au-section-heading"><span>设施状态</span></div>${c.kind==='pool'?'<div class="au-big-number">200 <small>/ 刻</small></div>':c.kind==='channel'?`<div class="au-fact"><span>当前水量</span><b>${n(c.water)} / ${n(c.capacity)}</b></div><div class="au-fact"><span>微量浓度</span><b>${n(c.seaweedConcentration)}</b></div>`:isJar||isVenturi?`<div class="au-fact"><span>剩余养分</span><b>${n(liquid?.nutrientRemaining)}</b></div><label class="au-rate">${isJar?'总释放量':'海藻精浓度'}<output>${n(isJar?c.jarReleaseRate:c.seaweedManualConcentration)}</output><input type="range" min="0" max="${isJar?3.75:A.venturiConcRangeForLevel(c.venturiLevel).max}" step="0.05" value="${isJar?c.jarReleaseRate:c.seaweedManualConcentration||0}" data-rate="${isJar?'jar':'venturi'}" aria-label="${isJar?'陶瓮释放量':'海藻精浓度'}"></label>`:`<div class="au-fact"><span>剩余储能</span><b>${n(st.power_charge)}</b></div>`}<div class="au-source-list">${Object.entries(inspection.plots).filter(([,p])=>p.jars.some(j=>j.x===x&&j.y===y)||p.source?.x===x&&p.source?.y===y).map(([key])=>{const [px,py]=key.split(',').map(Number);return sourceLink({x:px,y:py},name(cell(px,py)));}).join('')}</div>`;
  action=isJar||isVenturi?`<button class="au-primary" data-action="refill">${ico('flask')}补充一瓶${isJar?'液态肥':'海藻精'}</button>`:`<button class="au-secondary" data-view="water">${ico('water')}查看水路</button>`;
 }
 if(ui.mode==='inspect'){
  if(c.kind==='channel')content+=extraActions([['channel_upgrade','拓宽水渠'],...(c.capacity>A.constants.defaultChannelCapacity?[['channel_downgrade','收窄水渠']]:[])]);
  if(c.kind==='venturi_fertilizer'&&port.venturiUpgrade(c.venturiLevel))content+=`<div class="au-extra-actions"><button class="au-secondary" data-action="upgrade-venturi">升级施肥器</button>${materials(null,port.venturiUpgrade(c.venturiLevel))}</div>`;
  if(c.kind==='super_fusion')action='<button class="au-primary" data-action="power">补充储能</button>';
  if(c.kind==='land'&&!c.crop){
   content+=`<div class="au-extra-actions"><button class="au-secondary" data-action="soil">改良土壤</button>${c.tilled&&!c.cropStructure?'<button class="au-secondary" data-build-task="land_remove_reclaim">移除耕地</button>':''}</div>`;
   if(!c.tilled)content+=materials('land_reclaim');
  }
 }
 if(['refill','soil','power'].includes(ui.mode)){
  const items=ui.mode==='power'?port.batteries():ui.mode==='soil'?port.soils():port.injectables(c.kind);
  content=`<div class="au-section-heading"><span>${{refill:'补充养分',soil:'改良土壤',power:'补充储能'}[ui.mode]}</span></div><div class="au-item-options">${items.map((row,i)=>`<button data-item-index="${i}"><span>${esc(row.name)}</span><small>${ui.mode==='power'?n(row.charge)+' 电量':row.count+' 份'}</small></button>`).join('')}</div>${items.length?'':'<p class="au-build-reason">暂无可用物品</p>'}`;
  action='<button class="au-secondary" data-action="inspect-structure">返回详情</button>';
 }
 const remove=ui.mode==='inspect'&&removal(c);
 if(remove)action+=`<button class="au-secondary au-remove-action" data-action="remove-facility" ${remove.reason?'disabled aria-describedby="au-remove-reason"':''}>拆除${esc(remove.label)}</button>${remove.reason?`<small class="au-remove-reason" id="au-remove-reason">${remove.reason}</small>`:''}`;
 if(st.task){content=construction()+content;action=action.replace(/<button /g,'<button disabled ');}
 return `<aside class="au-inspector"><div class="au-inspector-top"><span>${ui.mode==='inspect'?'地块详情':ui.mode==='plant'?'播种':ui.mode==='build'?'营建':'物品'}</span><small>${coord(x,y)}</small></div><div class="au-inspector-scroll">${content}</div>${action?`<div class="au-action-slot">${action}</div>`:''}</aside>`;
}
function footer(){return `<footer class="au-footer"><button class="au-wait" data-action="toggle-wait" role="switch" aria-label="自动等待" aria-checked="${ui.waiting}" title="每秒推进一刻"><span>自动等待</span><span class="au-wait-track" aria-hidden="true"><i></i></span></button></footer>`;}
function VariantA(){return `${header()}<div class="au-layout a-layout">${board()}${inspector()}</div>${footer()}`;}
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
 if(!active)return;
 const nextState=port.state();
 if(!nextState)return;
 if(st!==nextState){waterFx?.destroy();waterFx=null;}
 st=nextState;inspection=A.inspectSupply(st);ui.waiting=port.waiting();
 if(!A.cell(st,...ui.selected))ui.selected=[0,0];
 if(!tick){waterFx?.destroy();waterFx=null;}
 const markup=`<div class="au-backdrop"></div><main class="au-window" role="dialog" aria-modal="true" aria-label="农田">${VariantA()}</main><div class="au-toast" role="status" aria-live="polite">${esc(ui.message)}</div>`;
 if(tick&&host.firstChild){const next=host.cloneNode(false);next.innerHTML=markup;syncTickNode(host,next);waterFx?.refresh();}
 else host.innerHTML=markup;
 if(!waterFx)waterFx=mountAgricultureWater(host.querySelector('.au-map'),st,ui.selected);
}
function notify(message){ui.message=message;clearTimeout(timer);timer=setTimeout(()=>{ui.message='';const e=host.querySelector('.au-toast');if(e)e.textContent='';},3500);}
function act(action,params={}){
 const [x,y]=ui.selected,r=port.action(action,{x,y,...params});
 notify(port.resultMessage(action,r));
 if(r?.ok){ui.mode='inspect';ui.buildReturn=false;}
 render();return r;
}
function onClick(e){
 const b=e.target.closest('button');if(!active||!b||b.disabled)return;
 if(b.dataset.cell){ui.selected=b.dataset.cell.split(',').map(Number);ui.mode='inspect';ui.buildReturn=false;render();return;}
 if(b.dataset.view){ui.view=b.dataset.view;render();return;}
 if(b.dataset.mode){ui.mode=b.dataset.mode;ui.buildReturn=false;render();return;}
 if(b.dataset.selectCrop){ui.seed=b.dataset.selectCrop;ui.seedGroup=defs.crops[ui.seed].group;ui.mode='plant';render();return;}
 if(b.dataset.seed){const top=host.querySelector('.au-inspector-scroll').scrollTop;ui.seed=b.dataset.seed;render();host.querySelector('.au-inspector-scroll').scrollTop=top;return;}
 if(b.dataset.build){ui.build=b.dataset.build;render();return;}
 if(b.dataset.buildTask){act('start_build_task',{buildId:b.dataset.buildTask});return;}
 if(b.dataset.filter){ui.filter=ui.filter===b.dataset.filter?'all':b.dataset.filter;const first=ui.filter!=='all'&&plots().find(p=>matchesFilter(p.c,p.s));if(first)ui.selected=[first.x,first.y];ui.mode='inspect';render();return;}
 const c=curr();
 if(b.dataset.itemIndex!=null){
  const items=ui.mode==='power'?port.batteries():ui.mode==='soil'?port.soils():port.injectables(c.kind),row=items[Number(b.dataset.itemIndex)];
  if(!row)return;
  if(ui.mode==='power')act('feed_power',row);
  else if(ui.mode==='soil')act('start_soil_amend_task',{itemId:row.itemId});
  else act('inject_facility',{facilityKind:c.kind,itemId:row.itemId});
  return;
 }
 switch(b.dataset.action){
  case'close':port.close();return;
  case'plant-mode':{const owned=port.seeds(),preferred=owned.find(row=>!c.cropStructure||defs.crops[row.cropId].required_crop_structure_id===c.cropStructure);if(preferred)ui.seed=preferred.cropId;ui.seedGroup='all';ui.mode='plant';break;}
  case'prepare-structure':{const req=defs.crops[ui.seed].required_crop_structure_id;if(!req||buildReason(c,req))break;ui.build=req;ui.mode='build';ui.buildReturn=true;break;}
  case'back-to-seeds':ui.mode='plant';ui.buildReturn=false;break;
  case'inspect-structure':ui.mode='inspect';ui.buildReturn=false;break;
  case'till':act('start_build_task',{buildId:'land_reclaim'});return;
  case'plant':act('plant',{cropId:ui.seed});return;
  case'build':act('start_build_task',{buildId:buildId(ui.build)});return;
  case'remove-facility':{const r=removal(c);if(r&&!r.reason)act('start_build_task',{buildId:removeId(c)});return;}
  case'harvest':act('harvest');return;
  case'clear-crop':act('clear_crop');return;
  case'cancel-task':act('cancel_task');return;
  case'upgrade-venturi':act('start_venturi_upgrade');return;
  case'toggle-wait':port.setWaiting(!port.waiting());render(true);return;
  case'refill':case'soil':case'power':ui.mode=b.dataset.action;break;
 }
 render();
}
function onInput(e){if(e.target.matches('[data-rate]'))e.target.previousElementSibling.textContent=n(e.target.value);}
function onChange(e){
 if(e.target.matches('.au-seed-group')){ui.seedGroup=e.target.value;render();return;}
 if(e.target.matches('[data-rate]'))act(e.target.dataset.rate==='jar'?'set_jar_release':'set_venturi_concentration',{value:Number(e.target.value)});
}
function onKey(e){
 if(!active)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();port.close();return;}
 // Keep map movement shortcuts from leaking through the farm dialog.
 if(!e.target.closest('input,textarea,select,[contenteditable]')&&/^(Arrow|[wasdWASD]$)/.test(e.key)){e.preventDefault();e.stopImmediatePropagation();}
}
function onVisibility(){host.classList.toggle('au-motion-paused',document.hidden);if(document.hidden)port.setWaiting(false);}
host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('change',onChange);
document.addEventListener('keydown',onKey,true);document.addEventListener('visibilitychange',onVisibility);
window.addEventListener('pagehide',()=>port.setWaiting(false));
return {
 open(){active=true;ui.mode='inspect';ui.filter='all';ui.message='';render();host.querySelector('[data-action="close"]')?.focus({preventScroll:true});},
 update(){render(true);},
 close(){active=false;waterFx?.destroy();waterFx=null;clearTimeout(timer);host.replaceChildren();}
};
}

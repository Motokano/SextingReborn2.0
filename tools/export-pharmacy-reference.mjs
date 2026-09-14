/** Export the current pharmacy data as a searchable HTML reference and Markdown. No runtime writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
function csv(s){const rows=[];let r=[],f='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){f+='"';i++;}else q=!q;}else if(c===','&&!q){r.push(f);f='';}else if((c==='\r'||c==='\n')&&!q){if(c==='\r'&&s[i+1]==='\n')i++;r.push(f);if(r.some(Boolean))rows.push(r);r=[];f='';}else f+=c;}if(f||r.length){r.push(f);rows.push(r);}assert(!q);const h=rows.shift();return rows.map(a=>Object.fromEntries(h.map((k,i)=>[k,a[i]??''])));}
const sourcePaths=['data/recipes.json','data/recipe-methods.json','data/life-skill-recipe-interfaces.json','data/items.json','data/items/pharmacy_base.csv','data/buffs.json','data/pharmacy-buff-matrix.json','data/pharmacy-system-config.csv'];
const items=json('data/items.json');
const allRows=csv(read('data/items/pharmacy_base.csv'));
const legacyRows=allRows.filter(r=>r.pharmacy_legacy==='1');
const raw=allRows.filter(r=>r.pharmacy_legacy!=='1');
const config=Object.fromEntries(csv(read('data/pharmacy-system-config.csv')).map(r=>[r.key,r.value]));
const matrix=json('data/pharmacy-buff-matrix.json');
const buffs=Object.fromEntries(json('data/buffs.json').buffs.map(b=>[b.buff_id,b]));
const methods=Object.values(json('data/recipe-methods.json').methods).filter(m=>m.recipe_system==='life_pharmacy');
const byMethod=Object.fromEntries(methods.map(m=>[m.method_id,m]));
const recipes=Object.values(json('data/recipes.json').recipes).filter(r=>r.recipe_system==='life_pharmacy');
const enabled=recipes.filter(r=>r.enabled!==false);
const produced=new Map();
const alternateProductionRoutes=[];
for(const r of enabled){if(produced.has(r.main_output.item_id)){alternateProductionRoutes.push(r.recipe_id);continue;}produced.set(r.main_output.item_id,r);}
const methodNames={crushing:'粉碎',maceration:'浸渍',distillation:'蒸馏',filtration:'过滤',centrifugation:'离心',crystallization:'结晶',tableting:'压片',blending:'调和',rolling:'卷制'};
const routeNames={drink:'口服',topical:'外敷',inhale:'吸入',inject:'注射'};
const methodName=id=>methodNames[id.split('.').at(-1)]||id;
const name=id=>items[id]?.sn||items[id]?.name||id;
const fmt=n=>Number(Number(n).toFixed(6)).toString();
const plus=n=>(n>=0?'+':'')+fmt(n);
const pct=n=>fmt(n*100)+'%';
const amount=a=>a.map(x=>name(x.item_id)+' ×'+x.count).join(' + ');
const entriesAmount=o=>amount(Object.entries(o).filter(([,n])=>n>0).map(([item_id,count])=>({item_id,count})));
const familyName=id=>matrix.families[id]?.name||({detox:'清毒'}[id])||id;
const grade=r=>r.id.endsWith('_purified')?'精炼':r.id.endsWith('_refined')?'精制':'基础';
const resources={energy:'精力',stamina:'体力',fatigue:'疲劳',mood:'心情',thirst:'饮水',satiety:'饱食',nutrition:'营养'};
const stats={jingu:'筋骨',focus:'专注',flexibility:'柔韧',breath:'呼吸',dexterity:'身手'};
function effectText(e){const p=e.params||{};switch(e.type){
 case 'pain_ignore_ratio':return '忽略 '+pct(p.ratio)+' 疼痛，以剩余疼痛判定惩罚（同类取最高值）';
 case 'pharmacy_carry_capacity':return '负重上限 '+plus(p.kilograms)+' kg（同类取最高值）';
 case 'survival_delta':return Object.entries(p).map(([k,v])=>(resources[k]||k)+' '+plus(v)+'/tick').join('；');
 case 'add_stat_delta':return Object.entries(p).map(([k,v])=>(stats[k]||k)+' '+plus(v)).join('；');
 case 'battle_move_speed_multiplier':return '出手速度 ×'+fmt(p.multiplier);
 case 'battle_potential_gain_multiplier':return '潜能收益 ×'+fmt(p.multiplier);
 case 'battle_combat_experience_gain_multiplier':return '实战经验收益 ×'+fmt(p.multiplier);
 case 'pain_suppression':return '暂时压制疼痛影响，不修复损毁';
 case 'pharmacy_part_recovery':return '目标部位损毁 −'+fmt(p.recovery_per_tick)+'/tick';
 case 'pharmacy_anti_stun':return '眩晕抗性 '+pct(p.anti_stun_pct)+'（受总抗性上限约束）';
 case 'pharmacy_revive':return '复苏参数已配置，关键功能未接线';
 case 'pharmacy_bleeding_slow':return '止血参数已配置，流血消费链未接线';
 case 'pharmacy_toxicity_decay_bonus':return '体内毒性额外代谢 '+plus(p.per_tick)+'/tick（与自然代谢同时结算，同类取最高值）';
 case 'pharmacy_synergy_multiplier':return '增效模板无独立消费者；动态配药另算增效';
 default:return e.type+' '+JSON.stringify(p);
}}
function unlock(m,r){const list=(m.unlock||[]).filter(u=>u.type!=='skill_level_min').map(u=>u.type+' '+(u.flag_id||u.id||JSON.stringify(u)));if(r?.recommended_skill_level!=null)list.push('推荐制药 '+r.recommended_skill_level+' 级');return list.join('；')||'无额外工具门槛';}
function baseRate(r){return r.base_success_rate??byMethod[r.method_id].base_success_rate;}
function buildRoute(itemId,count=1){
 const stock={},leaves={},steps=[],cost={fuel:0,water:0,stamina:0,ticks:0};let depth=0;
 function need(id,n,anc=[]){const fromStock=Math.min(stock[id]||0,n);stock[id]=(stock[id]||0)-fromStock;n-=fromStock;if(n===0)return;
  const r=produced.get(id);if(!r){leaves[id]=(leaves[id]||0)+n;return;}
  assert(!anc.includes(id),'Recipe cycle '+anc.join(' -> '));depth=Math.max(depth,anc.length+1);
  const batches=Math.ceil(n/r.main_output.count);for(const input of r.inputs)need(input.item_id,input.count*batches,[...anc,id]);
  const m=byMethod[r.method_id], effectiveCost=r.cost_override||m.cost||{};for(const k of Object.keys(cost))cost[k]+=Number(effectiveCost[k]||0)*batches;
  steps.push({recipe:r,batches});stock[id]=(stock[id]||0)+batches*r.main_output.count-n;
 }
 need(itemId,count);return {itemId,count,leaves,leftovers:Object.fromEntries(Object.entries(stock).filter(([,n])=>n>0)),steps,cost,depth,operations:steps.reduce((s,x)=>s+x.batches,0)};
}
for(const r of recipes){assert(byMethod[r.method_id]);for(const p of [...r.inputs,r.main_output]){assert(items[p.item_id],'Unknown item '+p.item_id);assert(Number.isInteger(p.count)&&p.count>0);}assert((r.bonus_outputs||[]).length===0,'Add bonus output accounting before exporting');}
const fixed=raw.filter(r=>items[r.id]?.use_action&&items[r.id]?.use_buff_id).map(r=>items[r.id]);
assert.equal(new Set(fixed.map(r=>r.item_id)).size,fixed.length);
const powders=raw.filter(r=>items[r.id]?.sub_category==='pharm_powder'&&produced.has(r.id));
const routes=[...fixed.map(r=>buildRoute(r.item_id)),...powders.map(r=>buildRoute(r.id))];
// Independently replay every route to check all inputs, final output and leftovers.
for(const rt of routes){const inventory={...rt.leaves};for(const {recipe:r,batches} of rt.steps){for(const x of r.inputs){assert((inventory[x.item_id]||0)>=x.count*batches);inventory[x.item_id]-=x.count*batches;}inventory[r.main_output.item_id]=(inventory[r.main_output.item_id]||0)+r.main_output.count*batches;}assert((inventory[rt.itemId]||0)>=rt.count);inventory[rt.itemId]-=rt.count;assert.deepEqual(Object.fromEntries(Object.entries(inventory).filter(([,n])=>n>0)),rt.leftovers);}
const overlaps=[];const covers=(a,b)=>b.every(x=>a.some(y=>y.item_id===x.item_id&&y.count>=x.count));
for(let i=0;i<enabled.length;i++)for(let j=i+1;j<enabled.length;j++){const a=enabled[i],b=enabled[j];if(a.method_id===b.method_id&&(covers(a.inputs,b.inputs)||covers(b.inputs,a.inputs)))overlaps.push(name(a.main_output.item_id)+' / '+name(b.main_output.item_id));}
const recipeRows=recipes.map(r=>{const m=byMethod[r.method_id],c=r.cost_override||m.cost;return [name(r.main_output.item_id),methodName(r.method_id),amount(r.inputs),amount([r.main_output]),'燃料 '+c.fuel+' / 体力 '+c.stamina+' / '+c.ticks+' tick',pct(baseRate(r)),unlock(m,r),r.enabled===false?'停用':'启用',r.recipe_id];});
const medicineRows=fixed.map(t=>{const b=buffs[t.use_buff_id];assert(b,'Missing buff '+t.use_buff_id);const ue=Object.entries(t.use_effect||{}).map(([k,v])=>(resources[k]||k)+' '+plus(v)).join('；');const notes=[];
 if(b.effects.some(e=>['pharmacy_revive','pharmacy_bleeding_slow'].includes(e.type)))notes.push('部分/关键功能未接线，见药效列');
 if(b.pharmacy_survival_budget_quantized&&b.effects.some(e=>e.type==='survival_delta'))notes.push('恢复为平均速率，实际按状态精度累计分发');
 if(t.use_action==='inject')notes.push('战斗中禁用，需静止与器具');if(t.use_action==='topical')notes.push('战斗中禁用，指定部位');
 return [name(t.item_id),routeNames[t.use_action],familyName(b.pharmacy_family),matrix.potency_profiles[b.pharmacy_potency]?.name||b.pharmacy_potency,b.effects.map(effectText).join('；'),ue?(ue+'（独立消化通道 '+t.food_buff_duration_ticks+' tick）'):'—',b.onsetTicks,b.durationTicks,t.use_charges||1,Number(config['pharmacy_use_ticks_'+t.use_action]),notes.join('；'),t.item_id];});
const methodRows=methods.map(m=>[methodName(m.method_id),name(m.requires_accessory_item_id),m.cost.fuel,m.cost.water,m.cost.stamina,m.cost.ticks,pct(m.base_success_rate),unlock(m),amount([m.failure_output]),enabled.filter(r=>r.method_id===m.method_id).length]);
const componentRows=raw.map(r=>{const t=items[r.id];let role='原料';if(t.pharmacy_compound)role='动态成品模板';else if(t.use_action&&t.use_buff_id)role='固定成品';else if(t.sub_category==='pharm_powder')role=Number(t.pharm_toxicity)>0?'含毒活性粉':Number(t.pharm_toxicity)<0?'抵消辅粉（当前兼增效）':'功能粉';else if(t.sub_category==='solvent')role='溶媒';else if(t.sub_category==='pharm_adjuvant')role='助溶剂';else if(t.sub_category==='pharm_kit')role='器具/耗材';return [name(r.id),role,grade(r),familyName(t.pharm_family||'—'),t.pharm_effect??'—',t.pharm_toxicity??'—',t.concentration_cost??'—',t.adjuvant_strength??'—',t.usable?'可使用':'非直接使用成品',produced.has(r.id)?methodName(produced.get(r.id).method_id):'本制药表无生产配方',r.id];});
const dynamicFamilyRows=Object.entries(matrix.families).filter(([,f])=>f.routes.includes('inject')).map(([id,f])=>[f.name,...['weak','regular','potent','pure'].map(p=>buffs['buff_pharm_'+id+'_inject_'+p].effects.map(effectText).join('；')),['weak','regular','potent','pure'].map(p=>buffs['buff_pharm_'+id+'_inject_'+p].durationTicks).join(' / '),['revive','coagulant','synergist'].includes(id)?'存在未接线/独立消费者缺口':'已接现有效果']);
const notes=[
 '注射液统一在配药模式用药粉配置，支持单方与复方。11 件旧固定注射成品已从活跃物品数据移除；口服、外敷、吸入成品及药粉加工链保留。',
 '本表从当前运行时物品、配方、工艺和药效表生成。所有名称与工序均为虚构游戏数据，不是现实制备指南。',
 '固定配方表的投入和产出是单次成功制作量。角色最终成功率还会计入当前制药等级、推荐等级差与心情修正。',
 '完整路线按从零制作 1 件成品、所有工序均成功、同一路线复用剩余中间品计算。成本不计失败重试、采集/交易成本和配件制作成本；图中“外部取得”仅表示当前制药配方没有生产该物品，不表示它在全游戏没有来源。',
 '路线是目标配方的成功路径，不保证盲配选中该配方。同工艺采用超集匹配并可能加权随机：'+(overlaps.join('；')||'未发现嵌套投料')+'。额外投入的材料会被消耗。',
 '药效数值为未施加角色免疫等修正的模板基准。持续栏直接读取当前 durationTicks；非注射不要把起效延迟再加成额外有效时间。恢复列为药物贡献，不是包含自然代谢与其他状态后的净变化。',
 '多次用量是满件模板次数；具体实例可能已消耗。表中未将“速率 × 持续 × 次数”标成保证恢复量。止血和复苏关键消费者尚未完整接线，配方存在不代表完整药效已实现。'
];
const dynamicNotes=[
 '注射液全部在制药台“配药”模式制作，单种药粉可配单方，多种药粉可配复方。当前接受 pharm_powder、solvent、pharm_adjuvant；普通成品药片不属于投料白名单。配好后得到可携带的动态注射液实例。',
 '恰好 1 份溶媒；非溶媒浓度占用合计 ≤'+config.pharmacy_concentration_capacity+'。下表原料页列出各件占用；器具和已制成的药膏、药烟不当作成分。',
 '每族有效点数按投入累计，当前所有 synergist 族份数带来每份 '+pct(Number(config.pharmacy_synergy_bonus_per_unit))+' 增效。≤33 弱效、>33且≤66 常效、>66且<100 强效、≥100 纯品（当前显示名称）。',
 '当前毒性正值贡献基础毒性，负值贡献抵消池。抵消比例=min('+pct(Number(config.pharmacy_offset_rate_cap))+',抵消池/基础毒性)。常规净毒性=基础毒性×(1−抵消比例)。无正毒性时该项为0，不能据此宣称无其他风险。',
 '需成盐成分的助溶供给不足、溶媒不相容或成分相冲时，投入会在配置后转成药渣，不产注射液。制药台按0/1/2/4/6级逐步显示玩家能判断的线索，不保存配方尝试历史。',
 '同族合为一个强度档，跨族分别挂药效并独立到期。活络族没有注射模板，投入活络粉不能在针里获得该族效果。增效族由配药过程处理，其模板效果没有独立消费者。',
 '当前动态配药制作没有固定工艺同款燃料/体力/加工计时成本，不能把注射使用耗时当成制作耗时。使用注射液耗 '+config.pharmacy_use_ticks_inject+' tick，并检查统一战斗状态、静止、器具与卫生。'
];
const headers={med:['成品药','剂型','药效族','强度','药效基准','额外恢复通道','起效 tick','持续 tick','满件次数','使用 tick','条件/缺口','物品 ID'],recipes:['产物','工艺','单次投入','单次产出','单次工艺成本','基础成功率','推荐等级/工具','状态','配方 ID'],methods:['工艺','所需配件','燃料','水成本','体力','制作 tick','基础成功率','工具解锁','默认失败产物','配方数'],components:['物品','角色','加工标记','药效族','药效点','毒性参数','浓度占用','助溶能力','使用身份','本表生产方式','物品 ID'],families:['注射药效族','弱效','常效','强效','纯品','持续 tick（弱/常/强/纯）','实现情况']};
const h=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const md=s=>String(s??'').replaceAll('|',' / ').replaceAll('\n',' ');
const mdTable=(hs,rs)=>['| '+hs.join(' | ')+' |','| '+hs.map(()=>'---').join(' | ')+' |',...rs.map(r=>'| '+r.map(md).join(' | ')+' |')].join('\n');
const htmlTable=(hs,rs)=>'<div class="table-wrap"><table><thead><tr>'+hs.map(x=>'<th>'+h(x)+'</th>').join('')+'</tr></thead><tbody>'+rs.map(r=>'<tr data-search="'+h(r.join(' '))+'">'+r.map((x,i)=>'<td'+(i===0?' class="name"':'')+'>'+h(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const routeHtml=rt=>'<article class="route-card" data-search="'+h(name(rt.itemId)+' '+rt.steps.map(s=>amount(s.recipe.inputs)+' '+methodName(s.recipe.method_id)).join(' '))+'"><details><summary><strong>'+h(name(rt.itemId))+'</strong><span>'+rt.depth+' 道层级 · '+rt.operations+' 次制作 · 燃料 '+rt.cost.fuel+' · 体力 '+rt.cost.stamina+' · '+rt.cost.ticks+' tick</span></summary><p><b>外部取得：</b>'+h(entriesAmount(rt.leaves))+'</p><ol>'+rt.steps.map(s=>'<li>'+h(methodName(s.recipe.method_id))+' ×'+s.batches+'：'+h(amount(s.recipe.inputs.map(x=>({...x,count:x.count*s.batches}))))+' → '+h(name(s.recipe.main_output.item_id))+' ×'+s.recipe.main_output.count*s.batches+'</li>').join('')+'</ol><p><b>获得：</b>'+h(name(rt.itemId))+' ×1</p><p><b>剩余中间品：</b>'+h(entriesAmount(rt.leftovers)||'无')+'</p></details></article>';
const sourceRows=sourcePaths.map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')]);
const counts=Object.fromEntries(Object.keys(routeNames).map(k=>[routeNames[k],fixed.filter(t=>t.use_action===k).length]));
const sections=[['medicines','成品药效',htmlTable(headers.med,medicineRows)],['routes','完整路线',routes.map(routeHtml).join('')],['recipes','全部配方',htmlTable(headers.recipes,recipeRows)],['methods','工艺与配件',htmlTable(headers.methods,methodRows)],['components','全部物品',htmlTable(headers.components,componentRows)],['dynamic','动态配药',dynamicNotes.map(n=>'<p>'+h(n)+'</p>').join('')+htmlTable(headers.families,dynamicFamilyRows)],['notes','说明与来源',notes.map(n=>'<p>'+h(n)+'</p>').join('')+htmlTable(['当前数据源','SHA-256'],sourceRows)]];
sections.push(['plan','完整配方规划（草案）',read('docs/reference/pharmacy-full-recipe-plan.fragment.html')]);
sections.push(['addiction','成瘾数值（草案）',read('docs/reference/pharmacy-addiction-values.fragment.html')]);
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>当前制药表</title><style>'+`
:root{font-family:"Microsoft YaHei",system-ui,sans-serif;color:#202c38;background:#f3f6f8;line-height:1.6}*{box-sizing:border-box}body{margin:0}header,main{max-width:1500px;margin:auto;padding:26px 32px}header{padding-bottom:16px}h1{font-size:28px;margin:0 0 6px}header p{color:#526270;margin:4px 0}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.stats span{background:#fff;border:1px solid #dae2e7;border-radius:8px;padding:9px 16px}.stats b{font-size:23px;color:#126659;margin-right:7px}.toolbar{background:#fff;border:1px solid #d5dfe5;border-radius:10px;padding:14px;position:sticky;top:0;z-index:2}nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}button,select,input{font:inherit;border:1px solid #b9c8d0;border-radius:6px;padding:8px 12px;background:white;color:#273844}button{cursor:pointer}button.active{background:#166757;color:white;border-color:#166757}button:hover{border-color:#166757}.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center}input{width:min(430px,100%)}#count{font-size:13px;color:#526270}.panel{display:none}.panel.active{display:block}.table-wrap{overflow:auto;max-height:72vh;border:1px solid #d5dfe5;border-radius:8px;background:white}table{border-collapse:separate;border-spacing:0;min-width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e5ebee;padding:12px;min-width:85px;max-width:360px}th{position:sticky;top:0;background:#e7eff1;color:#264744;z-index:1;white-space:nowrap}td.name{font-weight:600;min-width:150px}td:nth-child(5){min-width:270px}td:last-child{overflow-wrap:anywhere}tr:nth-child(even) td{background:#f8fafb}.route-card{background:#fff;border:1px solid #d5dfe5;border-radius:8px;margin-bottom:10px;padding:15px 20px}summary{cursor:pointer}summary span{display:inline-block;color:#62717d;font-size:13px;margin-left:18px}li{margin:7px 0}.notice{border-left:3px solid #d5a13c;background:#fff8e9;padding:10px 16px;margin:16px 0;font-size:14px}.section-heading{display:flex;align-items:center;gap:14px}h2{font-size:20px}a{color:#166757}#dynamic .table-wrap{margin-top:20px}#notes table{font-size:12px}.empty{padding:20px;color:#687784}@media(max-width:700px){header,main{padding:16px}.toolbar{position:static}summary span{display:block;margin:5px 0}.stats{gap:6px}.stats span{padding:7px 10px}}@media print{.toolbar{display:none}.panel{display:block!important;page-break-before:always}.table-wrap{max-height:none;overflow:visible}table{font-size:9px}th,td{min-width:0!important;padding:4px}header,main{padding:0}.notice{background:none}details{display:block}summary span{display:block}}
`+'</style></head><body><header><h1>当前制药表</h1><p>潮碧物语 · 运行数据快照 · 2026-09-10</p><div class="stats"><span><b>'+enabled.length+'</b>固定配方</span><span><b>'+fixed.length+'</b>固定成品</span><span><b>'+methods.length+'</b>工艺</span><span><b>'+raw.length+'</b>物品</span></div><p>'+Object.entries(counts).map(([k,v])=>k+' '+v+' 件').join('　')+'；动态复方注射液单列。</p></header><main><div class="toolbar"><nav aria-label="表格分类">'+sections.map(([id,label],i)=>'<button data-tab="'+id+'" class="'+(i?'':'active')+'">'+label+'</button>').join('')+'</nav><div class="filters"><input id="search" type="search" aria-label="搜索当前表" placeholder="搜索药名、原料、工艺或 ID"><select id="filter" aria-label="筛选类别"><option value="">全部类别</option></select><button id="expand">展开路线</button><span id="count" aria-live="polite"></span></div></div><div class="notice">运行数据页列当前已启用内容；三条兽心强心粉替代线继续作为储备。制作路线按全部成功计算，制药台会显示角色当前实际成功率。</div>'+sections.map(([id,label,body],i)=>'<section id="'+id+'" class="panel '+(i?'':'active')+'"><div class="section-heading"><h2>'+label+'</h2></div>'+body+'</section>').join('')+'</main><script>'+`
const search=document.getElementById('search'),filter=document.getElementById('filter'),count=document.getElementById('count');let active='medicines';const choices={medicines:${JSON.stringify(Object.values(routeNames))},recipes:${JSON.stringify(Object.values(methodNames))},components:['固定成品','动态成品模板','含毒活性粉','功能粉','抵消辅粉','溶媒','助溶剂','器具/耗材','原料']};
function apply(){const panel=document.getElementById(active),rows=[...panel.querySelectorAll('[data-search]')];let shown=0;const term=search.value.trim().toLowerCase(),category=filter.value;rows.forEach(r=>{const text=r.dataset.search.toLowerCase();const match=text.includes(term)&&(!category||text.includes(category.toLowerCase()));r.hidden=!match;if(match)shown++;});count.textContent=rows.length?shown+' / '+rows.length+' 项':'';}
function setTab(id){active=id;document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===id;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});search.value='';filter.innerHTML='<option value="">全部类别</option>';(choices[id]||[]).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;filter.append(o);});filter.hidden=!choices[id];document.getElementById('expand').hidden=id!=='routes';apply();}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));search.addEventListener('input',apply);filter.addEventListener('change',apply);document.getElementById('expand').addEventListener('click',()=>{const ds=[...document.querySelectorAll('#routes article:not([hidden]) details')];const open=ds.some(d=>!d.open);ds.forEach(d=>d.open=open);});setTab(active);
`+'</script></body></html>';
const markdown=['# 当前制药表','2026-09-10 · 运行数据快照。'+enabled.length+' 条固定配方、'+fixed.length+' 件固定成品、'+methods.length+' 种工艺、'+raw.length+' 件制药源表物品。',...notes.map(n=>'> '+n),'## 成品药效',mdTable(headers.med,medicineRows),'## 完整制作路线',...routes.map(rt=>'### '+name(rt.itemId)+' ×1\n\n外部取得：'+entriesAmount(rt.leaves)+'。\n\n'+rt.steps.map((s,i)=>(i+1)+'. '+methodName(s.recipe.method_id)+' ×'+s.batches+'：'+amount(s.recipe.inputs.map(x=>({...x,count:x.count*s.batches})))+' → '+name(s.recipe.main_output.item_id)+' ×'+s.recipe.main_output.count*s.batches).join('\n')+'\n\n共 '+rt.operations+' 次制作，燃料 '+rt.cost.fuel+'、体力 '+rt.cost.stamina+'、'+rt.cost.ticks+' tick；剩余中间品：'+(entriesAmount(rt.leftovers)||'无')+'。'),'## 全部固定配方',mdTable(headers.recipes,recipeRows),'## 工艺与配件',mdTable(headers.methods,methodRows),'## 全部物品与成分参数',mdTable(headers.components,componentRows),'## 动态配药',...dynamicNotes,mdTable(headers.families,dynamicFamilyRows),'## 数据来源',mdTable(['数据文件','SHA-256'],sourceRows)].join('\n\n')+'\n';
const outputDir=path.join(root,'docs/reference');fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,'pharmacy-current.html'),html,'utf8');fs.writeFileSync(path.join(outputDir,'pharmacy-current.md'),markdown,'utf8');
console.log(JSON.stringify({recipes:recipes.length,enabled:enabled.length,medicines:fixed.length,methods:methods.length,items:raw.length,routes:routes.length,routeInventoryReplay:'passed',overlappingRecipes:overlaps,files:['docs/reference/pharmacy-current.html','docs/reference/pharmacy-current.md']},null,2));

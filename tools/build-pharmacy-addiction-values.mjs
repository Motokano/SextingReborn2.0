/** Design calculations only. Does not change the live addiction system. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const items=json('data/items.json'), matrix=json('data/pharmacy-buff-matrix.json');
const buffs=Object.fromEntries(json('data/buffs.json').buffs.map(b=>[b.buff_id,b]));
const recipes=json('data/pharmacy-recipes.json').recipes;
const plan=json('docs/design/47-pharmacy-addiction-values.json');
const ctx={InventoryEquipment:{getItemTemplate:id=>items[id]}};vm.createContext(ctx);
for(const f of ['pharmacy-config','pharmacy-compounding'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx);
const cfg=ctx.PharmacyConfig.parseCsv(fs.readFileSync('data/pharmacy-system-config.csv','utf8'));
ctx.PharmacyCompounding.setConfig(cfg,json('data/pharmacy-conflict-rules.json'));
const constants=Object.fromEntries(fs.readFileSync('data/pharmacy-system-config.csv','utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split(',').slice(0,2)));
const decay=l=>Number(constants.pharmacy_addiction_decay_per_tick)*(1+l*Number(constants.pharmacy_addiction_immunity_decay_bonus));
const gain=(g,l)=>g*(1-Math.min(.95,l*Number(constants.pharmacy_addiction_immunity_gain_reduction)));
const duration=(d,l)=>Math.round(d*Math.min(3,1+l*Number(constants.pharmacy_duration_immunity_bonus_per_level)));
const delta=(g,d,l)=>gain(g,l)-decay(l)*duration(d,l);
const name=id=>items[id]?.sn||id, round=n=>Number(n.toFixed(4)), sign=n=>(n>0?'+':'')+round(n);
const powders=Object.values(items).filter(t=>t.sub_category==='pharm_powder');
const profile=id=>plan.components[id]||plan.components[id.replace(/_(refined|purified)$/,'')]||{oral_gain:0,relief_stages:0,dose_ratio:1,role:'新增无依赖功能粉；不提供戒断缓解'};
for(const id of Object.keys(plan.components))assert(items[id],id);
for(const t of powders){const p=profile(t.item_id);assert(p.oral_gain>=0);assert(Number.isInteger(p.relief_stages)&&p.relief_stages>=0&&p.relief_stages<=3);if(!p.oral_gain)assert.equal(p.relief_stages,0);}
const componentRows=powders.map(t=>{const p=profile(t.item_id);return [name(t.item_id),matrix.families[t.pharm_family]?.name||t.pharm_family,p.oral_gain?'致瘾':'不致瘾',p.dose_ratio,p.oral_gain,round(p.oral_gain*2),round(p.oral_gain*3),p.relief_stages,p.role];});
const fixed=recipes.filter(r=>items[r.main_output[0]]?.use_buff_id).map(r=>{
 const t=items[r.main_output[0]],route=t.use_action,b=buffs[t.use_buff_id];let base=0,relief=0;
 for(const [id,n] of r.inputs){const p=plan.components[id]||(items[id]?.sub_category==='pharm_powder'?profile(id):null)||(route==='inhale'?plan.raw_carrier_exposure[id]:null);if(p){base+=p.oral_gain*n;relief=Math.max(relief,p.relief_stages);}}
 const g=base*plan.route_multipliers[route]/r.main_output[1];if(!g)relief=0;
 // Current multi-use products are all non-addictive topical medicines.
 if(t.use_charges>1)assert.equal(g,0);
 return {id:t.item_id,route,g,relief,onset:b.onsetTicks,d:b.durationTicks,inputs:r.inputs};
});
const windowRow=x=>[name(x.id),x.route,x.relief,sign(x.g),x.onset,x.d,sign(delta(x.g,x.d,0)),sign(gain(x.g,100)),duration(x.d,100),sign(delta(x.g,x.d,100))];
const injection=[];
for(const t of powders){if(!matrix.families[t.pharm_family]?.routes.includes('inject'))continue;
 const components=[{item_id:t.chem_class==='organic_acid'?'solvent_water_pure':'solvent_saline',count:1},{item_id:t.item_id,count:1}];
 const salt=ctx.PharmacyCompounding.getSaltRequirement(components);if(salt.deficit>0)components.push({item_id:'adj_vitamin_c',count:Math.ceil(salt.deficit)});
 const res=ctx.PharmacyCompounding.resolve(components);assert(res.ok, t.item_id+': '+res.reason);
 const p=profile(t.item_id),b=buffs[res.buff_ids.find(id=>buffs[id].pharmacy_family===t.pharm_family)];
 if(!b){assert.equal(t.pharm_family,'synergist','Unexpected missing effect: '+t.item_id);continue;}
 const x={id:t.item_id,route:'inject',g:p.oral_gain*3,relief:p.relief_stages,onset:b.onsetTicks,d:b.durationTicks};
 injection.push([...windowRow(x),components.map(c=>name(c.item_id)+' ×'+c.count).join(' + '),res.precipitated?'沉淀':res.conflicts.length?'有相冲':'本组合未命中相冲', ['synergist','revive','coagulant'].includes(t.pharm_family)?'现有消费者缺口；不宣称完整药效':'现有药效可解析']);
}
function simulate(g,d,level,doses,start=0){let a=start,peak=start;const D=duration(d,level),period=D+1,end=(doses-1)*period+D;for(let tick=0;tick<=end;tick++){if(tick>0)a=Math.max(0,a-decay(level));if(tick%period===0&&tick/period<doses)a=Math.min(100,a+gain(g,level));peak=Math.max(peak,a);}return {end,final:round(a),peak:round(peak)};}
const root=fixed.find(x=>x.id==='potion_analgesic_pill');assert(delta(root.g,root.d,0)<0&&root.relief===2);
const calm=fixed.find(x=>x.id==='potion_calm_brew');assert(delta(calm.g,calm.d,0)<0);
const cocaine=plan.components.med_cocaine_powder.oral_gain*3;
const one=simulate(cocaine,20,0,1),three=simulate(cocaine,20,0,3);assert(one.peak<25);assert(three.peak>=25&&three.peak<50);
assert(plan.components.med_cocaine_powder_purified.oral_gain>plan.components.med_cocaine_powder.oral_gain);
for(const x of fixed.filter(x=>!x.g))assert.equal(x.relief,0);
const scenarios=[['基础高负担提神注射1次，免疫0',one],['基础高负担提神注射3次，间隔21 tick，免疫0',three],['基础高负担提神注射3次，间隔41 tick，免疫100',simulate(cocaine,20,100,3)],['从75点开始，镇痛药丸10次，间隔91 tick，免疫0',simulate(root.g,root.d,0,10,75)],['从75点开始，不补药经过上述相同时长',{end:simulate(root.g,root.d,0,10,75).end,final:round(Math.max(0,75-decay(0)*simulate(root.g,root.d,0,10,75).end)),peak:75}]];
const notes=['运行时已接入逐成分依赖、途径倍率、免疫减免与按最高已起效来源缓解；除四档镇痛丸与清毒丸外，其余逐成分数值仍是可调首版候选。',`覆盖${powders.length}种现役药粉、${fixed.length}件现役固定成品，以及按实际配置器校验的单粉注射示例。`,'依赖增量 = 成分口服基准 × 投入份数 × 途径系数（口服1／吸入2／注射3／外敷0）× 免疫减免。复方逐项相加，不按最高值收费；缓解阶段取已起效来源最高值。',...plan.rules,'自然衰减 = 0.02 × (1 + 免疫等级 × 0.015)；免疫100使增量减半、窗口翻倍、衰减达到0.05/tick。数值沿用当前配置。','窗口净变化 = 本次增量 − 窗口内自然衰减。负数不是药物主动治疗，也不是无依赖者会获得负依赖；实际值限制在0～100。','固定药烟中的烟草载体单份另计吸入依赖+1，载体不增加缓解。外敷不增加依赖。','四档镇痛丸依赖与缓解为已确认值；其他粉剂数值仍需后续实测。','单粉示例是配置校验，不保证针具卫生安全；复苏、止血、增效消费者缺口仍单独标注。'];
const headers=['药品/成分','途径','缓解阶段','免疫0单次增量','起效tick','免疫0窗口','免疫0窗口净变化','免疫100单次增量','免疫100窗口','免疫100窗口净变化'];
const groups=[['逐成分基准',['药粉','药效族','依赖身份','相对剂量','口服增量','吸入增量','注射增量','缓解阶段','定位'],componentRows],['现役固定成品的完整窗口',headers,fixed.map(windowRow)],['合法单粉注射配置示例',[...headers,'配置投入','相冲检查','实现边界'],injection],['连续使用算例',['条件','总时长tick','结束依赖','过程最高依赖'],scenarios.map(([label,s])=>[label,s.end,s.final,s.peak])]];
const h=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const md=s=>String(s??'').replaceAll('|','／');
const fragment=notes.map(n=>'<p>'+h(n)+'</p>').join('')+groups.map(([title,head,rows])=>'<h3>'+h(title)+'</h3><div class="table-wrap"><table><thead><tr>'+head.map(x=>'<th>'+h(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr data-search="'+h(r.join(' '))+'">'+r.map(x=>'<td>'+h(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');
const markdown='# 制药依赖逐药数值草案\n\n'+notes.map(n=>'> '+n).join('\n\n')+'\n\n'+groups.map(([title,head,rows])=>'## '+title+'\n\n| '+head.join(' | ')+' |\n| '+head.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(md).join(' | ')+' |').join('\n')).join('\n\n')+'\n';
fs.writeFileSync('docs/reference/pharmacy-addiction-values.md',markdown);fs.writeFileSync('docs/reference/pharmacy-addiction-values.fragment.html',fragment);
console.log(JSON.stringify({components:powders.length,fixed:fixed.length,validatedInjectionExamples:injection.length,scenarios,checks:'passed',runtimeWritten:true},null,2));

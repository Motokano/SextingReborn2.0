/** Full game-design catalogue; writes reference documents only, never runtime tables. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const items=read('data/items.json'), plan=read('docs/design/47-pharmacy-full-recipe-plan.json');
const current=read('data/pharmacy-recipes.json').recipes;
const methods=read('data/recipe-methods.json').methods;
const families=read('data/pharmacy-buff-matrix.json').families;
const names=Object.fromEntries(Object.entries(items).map(([id,t])=>[id,t.sn||t.name||id]));
for(const p of plan.new_products){names[p.id]=items[p.id]?.sn||p.name;}
const name=id=>names[id]||id;
const methodNames={crushing:'粉碎',maceration:'浸渍',distillation:'蒸馏',filtration:'过滤',centrifugation:'离心',crystallization:'结晶',tableting:'压片',blending:'调和',rolling:'卷制'};
const method=id=>methodNames[id.split('.').at(-1)]||id;
const amount=rows=>rows.map(([id,n])=>name(id)+' ×'+n).join(' + ');
for(const r of current){
 assert(methods[r.method_id]);
 for(const [id,n] of [...r.inputs,r.main_output]){assert(names[id],id);assert(Number.isInteger(n)&&n>0);}
 assert.notEqual(items[r.main_output[0]]?.use_action,'inject','No fixed injection recipes');
}
for(const c of plan.changes){assert(current.some(r=>r.recipe_id===c.recipe_id));for(const [id,n] of c.inputs){assert(items[id]);assert(n>0);}}
for(const id of plan.held_materials)assert(items[id]);
const available=new Set(Object.keys(items));let pending=plan.additions.slice();
while(pending.length){const ready=pending.filter(r=>r.inputs.every(([id])=>available.has(id)));assert(ready.length,'Unreachable or cyclic proposed chain');for(const r of ready)available.add(r.main_output[0]);pending=pending.filter(r=>!ready.includes(r));}
const stage=r=>r.required_level??Math.max(0,...(methods[r.method_id].unlock||[]).map(x=>x.level||0),r.required_skill_level_min||0);
const currentRows=current.map(r=>[name(r.main_output[0]),method(r.method_id),amount(r.inputs),amount([r.main_output]),stage(r),r.recipe_id]);
const proposedRows=plan.additions.map(r=>{
 const liveId=r.recipe_id.replace('proposal.pharmacy.','life_pharmacy.');
 const live=current.find(x=>x.recipe_id===liveId);
 const status=live?'已实装':(r.recipe_id.includes('cardiac_from_')?'储备':'暂缓');
 return [name(r.main_output[0]),method(r.method_id),amount(r.inputs),amount([r.main_output]),Math.max(stage(r),...(methods[r.method_id].unlock||[]).map(x=>x.level||0)),status,r.purpose,r.dependency];
});
const powderRows=Object.values(items).filter(t=>t.sub_category==='pharm_powder').map(t=>{
 const producers=current.filter(r=>r.main_output[0]===t.item_id);
 const consumers=current.filter(r=>r.inputs.some(([id])=>id===t.item_id));
 const family=families[t.pharm_family];
 return [name(t.item_id),family?.name||t.pharm_family||'—',producers.length?producers.map(r=>amount(r.inputs)+' → '+r.main_output[1]+' 份').join('；'):'外部取得，当前无制药生产配方',consumers.map(r=>name(r.main_output[0])).join('；')||'无固定下游',family?.routes.includes('inject')?'可配置；按浓度、助溶与相冲结算':'无该族注射效果',t.pharm_effect??0,t.pharm_toxicity??0,t.concentration_cost??0];
});
const groups=[
 [`当前固定配方（${current.length} 条，含暂缓记录）`,['产物','工艺','投入','产出','推荐等级','配方 ID'],currentRows],
 ['现有药粉的上下游与注射用途',['药粉','药效族','当前上游','固定下游','配置用途','药效点','毒性参数','浓度占用'],powderRows],
 [`规划增补状态（${plan.additions.length} 条）`,['产物','工艺','投入','产出','推荐等级','状态','玩家收益','实施依赖与药效规格'],proposedRows],
 [`现有配方调整（${plan.changes.length} 条，不重复计数）`,['原配方','拟改投入','原因'],plan.changes.map(c=>[c.recipe_id,amount(c.inputs),c.reason])],
 ['保留外部来源或暂缓接线的原料',['现有物品','处理'],plan.held_materials.map(id=>[name(id),id==='med_vitamin_c_powder'||id==='adj_vitamin_c'?'保留外部取得；两种身份分别为抵消粉/助溶剂，不混为一物':'已有道具保留；尚无经过定义的制药用途，不虚构疗效填表'])]
];
if(plan.medicine_stack_review){
 const review=plan.medicine_stack_review;
 for(const row of review.items){assert(names[row.id],row.id);assert([2,3].includes(row.proposed_stack_limit));}
 assert.equal(new Set(review.items.map(r=>r.id)).size,review.items.length);
 groups.push(['全成品堆叠与成本复核（已按规划落源）',['成品','原上限','当前上限','判断依据','成本意见'],review.items.map(r=>[name(r.id),r.current_stack_limit??'新增',r.proposed_stack_limit,r.reason,r.cost_review])]);
}
const notes=[`当前运行源含${current.length}条制药配方；规划中的3条兽心强心粉替代线继续储备，其余增补按表内状态显示。`,plan.scope,`${plan.changes.length}条原配方调整已并入现役行；新增${plan.new_products.length}件加工/口服产物，新增采集原料0件。`,'本表为虚构游戏资源与工艺规则；份数是游戏单位。','每个配方的投入/产出均为单次成功批量。配方级成本优先于工艺默认成本，等级作为推荐等级影响良品率。','注射没有固定成品配方：从药粉表挑选单方或复方，经配置系统生成携带实例。','实际交易价与原料获得频率尚未完成经济审计。',...plan.notes];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const md=s=>String(s??'').replaceAll('|','／').replaceAll('\n',' ');
const markdown='# 制药完整配方总表：现有原料扩展稿\n\n'+notes.map(n=>'> '+n).join('\n\n')+'\n\n'+groups.map(([title,head,rows])=>'## '+title+'\n\n| '+head.join(' | ')+' |\n| '+head.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(md).join(' | ')+' |').join('\n')).join('\n\n')+'\n';
const html=notes.map(n=>'<p>'+esc(n)+'</p>').join('')+groups.map(([title,head,rows])=>'<h3>'+esc(title)+'</h3><div class="table-wrap"><table><thead><tr>'+head.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr data-search="'+esc(r.join(' '))+'">'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');
fs.writeFileSync('docs/reference/pharmacy-full-recipe-plan.md',markdown);
fs.writeFileSync('docs/reference/pharmacy-full-recipe-plan.fragment.html',html);
console.log(JSON.stringify({current:current.length,proposed:plan.additions.length,changes:plan.changes.length,newProducts:plan.new_products.length,powders:powderRows.length,referenceValidation:'passed',dependencyValidation:'passed'}));

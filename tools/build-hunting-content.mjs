import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write = (p,v) => fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n','utf8');
const ui = read('data/ui_text_zhCN.json');
Object.assign(ui, {
 'hunting.group.notice':'留意现场','hunting.group.survey':'查看现场','hunting.scene.survey':'猎物已经离开',
 'hunting.proficiency':'狩猎熟练度 +{n}','hunting.notes':'狩猎见闻',
 'hunting.odds.low':'很勉强','hunting.odds.some':'有些把握','hunting.odds.good':'较有把握',
 'hunting.reason.knowledge':'还不了解这个方法。',
 'hunting.action.look':'留在原地看看','hunting.action.try_food':'放下食物试试','hunting.action.try_grab':'扑过去抓住它','hunting.action.try_throw':'试着投掷',
 'hunting.action.inspect_gap':'查看它离开的地方','hunting.action.inspect_rope':'检查那根旧绳圈','hunting.action.probe_rope':'用树枝试探绳圈',
 'hunting.action.practice_knot':'照着绳结尝试复原','hunting.action.inspect_trap':'检查留下的捕具','hunting.action.inspect_carcass':'仔细查看猎获物',
 'hunting.learning.look':'你留意到动物抬头张望，也看见了附近可遮挡视线的草木。',
 'hunting.learning.look_failed':'你看了一会儿，没有看出规律。',
 'hunting.learning.inspect_gap':'泥地上有交叠的脚印，草茎上还挂着几根毛。',
 'hunting.learning.inspect_gap_failed':'痕迹很乱，你没能分辨出来。',
 'hunting.learning.rope_found':'脚印旁垂着一根旧绳，末端绕成圈，另一头系在树根上。',
 'hunting.learning.inspect_rope':'绳圈横在低矮的缺口，绳头绕过另一段绳索。旧绳已经腐朽。',
 'hunting.learning.probe_rope':'树枝穿过绳圈后受到拉扯，绳圈随之收紧。',
 'hunting.learning.practice_knot':'新绳圈受拉后收紧，固定端没有松脱。试验用的绳材已耗去。',
 'hunting.learning.practice_knot_failed':'你拉动绳圈时，固定端松开了。试验用的绳材已耗去。',
 'hunting.learning.inspect_trap':'你检查了绳圈高度和周围痕迹，记住了这次布置的样子。',
 'hunting.learning.inspect_carcass':'你辨认皮、骨与肌肉相连的位置，记住了这次所见。',
 'hunting.variant.foraging':'觅食遭遇','hunting.variant.foraging.hint':'诱饵对正在觅食的目标更有效。',
 'hunting.variant.watering':'饮水遭遇','hunting.variant.watering.hint':'岸边踪迹清楚，观察更快；湿地出手更费体力。',
 'hunting.variant.passage':'穿越窄道','hunting.variant.passage.hint':'先观察再投饵；套索更有效，目标很快就会离开。',
 'hunting.group.straining':'套索牵制','hunting.scene.straining':'目标正在挣脱',
 'hunting.cattle_straining':'目标冲入套索，正在奋力挣脱！','hunting.tether_set':'牵制套索已固定在窄道。',
 'hunting.cattle_observed':'已找到牛群的窄道与接近路线。','hunting.cow_lured':'成年牛被引开，幼牛暂时落单。',
 'hunting.cattle_separated':'目标离开牛群，向诱饵靠近。','hunting.action.set_tether':'固定牵制套索','hunting.action.brace':'牵制收捕',
 'hunting.action.lure_cow':'引开成年牛','hunting.action.separate_cattle':'诱离牛群',
 'hunting.reason.calf_tether':'牵制套索只用于成年目标。','hunting.reason.straining':'只能牵制收捕或放弃。',
 'hunting.reason.cow':'需要先用诱饵引开成年牛。','hunting.reason.approach':'先观察通过路线，再投放诱饵。',
 'hunting.result.calf_protected':'牛群护住幼牛，本次狩猎结束。','hunting.scene.cattle_herd':'牛群',
 'hunting.group.herd_alert':'羊群聚拢','hunting.scene.herd_alert':'羊群正在撤离',
 'hunting.herd_alert':'羊群受惊聚拢，正经过设有套索的窄道！',
 'hunting.herd_observed':'已发现边缘的落单目标和窄道。','hunting.sheep_separated':'目标被诱饵引离羊群。',
 'hunting.intercept_set':'窄道套索已就绪。','hunting.action.set_intercept':'窄道布索','hunting.action.intercept':'收紧套索拦截',
 'hunting.action.separate_sheep':'诱离羊群','hunting.reason.passage':'需要先观察发现窄道。',
 'hunting.reason.separate':'需要先用诱饵将幼羊引离羊群。','hunting.reason.herd_alert':'羊群正在撤离，只能拦截或放弃。',
 'hunting.result.herd_escaped':'羊群一同逃离，本次狩猎结束。','hunting.scene.passage':'窄道','hunting.scene.herd':'羊群',
 'hunting.group.airborne':'野鸡惊飞','hunting.scene.airborne':'野鸡腾空',
 'hunting.bird_flushed':'野鸡振翅飞起！','hunting.bird_landed':'野鸡重新落地，还能出手一次。',
 'hunting.bird_observed':'已发现草窠和落脚点。','hunting.hen_lured':'母鸡被引开，幼鸡暂时落单。',
 'hunting.action.lure_hen':'诱开母鸡','hunting.action.air_javelin':'投枪截获','hunting.action.wait_land':'隐蔽等候落地',
 'hunting.reason.airborne':'野鸡在空中，地面行动不可用。','hunting.reason.landing':'需要先观察发现落脚点。',
 'hunting.reason.hen':'需要先用诱饵引开母鸡。','hunting.result.chicks_hidden':'幼鸡钻回草窠，本次狩猎结束。',
 'hunting.scene.nest':'草窠 / 落脚点',
 'hunting.group.charge':'应对冲撞','hunting.scene.charge':'野猪正在冲来',
 'hunting.boar_charge':'野猪挣脱，朝你冲来！',
 'hunting.boar_hidden':'你借掩蔽躲过冲撞，还能补捕一次。',
 'hunting.mother_lured':'母猪被诱饵引开，幼崽暂时落单。',
 'hunting.action.lure_mother':'诱开母猪','hunting.action.hide':'躲入掩蔽处',
 'hunting.action.counter':'迎面投枪','hunting.action.retreat':'撤出猎场',
 'hunting.reason.charge':'先应对野猪冲撞。','hunting.reason.mother':'需要先用诱饵引开母猪。',
 'hunting.result.retreated':'你避开冲撞，撤出了猎场。',
 'hunting.result.driven_off':'野猪将你逼退，额外损失 18 体力（最低至 0）。',
 'hunting.group.processing':'处理猎物','hunting.scene.processing':'处理猎物','hunting.processing_started':'肉料已收好。',
 'hunting.processing_rest':'体力正在恢复。','hunting.processed':'材料已收好。','hunting.rest.processing':'{n} 刻 · 恢复体力',
 'hunting.leave':'收拾离开','hunting.action.process_blood':'收集血液','hunting.action.process_skin':'剥取皮料',
 'hunting.action.process_bone':'拆取骨料','hunting.action.process_special':'收取特殊部位',
 'hunting.group.prepare':'准备','hunting.group.capture':'出手','hunting.group.retry':'补捕',
 'hunting.done':'已完成','hunting.item_short':'{name} ×1 · 余 {n}','hunting.yield':'肉料 ×{n}',
 'hunting.action_time':'{n} 刻', 'hunting.observe_failed':'未找到掩蔽处，可继续观察。',
 'hunting.scene.eyebrow':'现场观察 · 俯视站位', 'hunting.scene.prepare':'接近猎物', 'hunting.scene.waiting':'隐蔽守候', 'hunting.scene.retry':'截住退路 · 补捕机会',
 'hunting.scene.caught':'猎物已捕获', 'hunting.scene.escaped':'猎物已逃离', 'hunting.scene.ended':'本次狩猎结束',
 'hunting.scene.description':'狩猎现场：玩家与猎物的站位，以及已经发现的踪迹。',
 'hunting.scene.burrow':'洞口', 'hunting.scene.cover':'掩蔽处', 'hunting.scene.route':'已辨明的退路', 'hunting.scene.blocked':'退路已封堵', 'hunting.scene.unknown':'退路尚未辨明',
 'hunting.scene.bait':'诱饵', 'hunting.scene.snare':'套索', 'hunting.scene.player':'你', 'hunting.scene.rabbit':'野兔', 'hunting.scene.pig':'野猪',
 'hunting.scene.cattle':'牛', 'hunting.scene.sheep':'羊', 'hunting.scene.chicken':'野鸡', 'hunting.scene.juvenile':'幼崽',
 'hunting.scene.legend':'青色 · 玩家　金色 · 猎物　虚线 · 观察到的路线',
 'hunting.scene.time':'剩余 {n} 刻', 'hunting.scene.wait_time':'守候 {n} 刻',
 'hunting.scene.schematic':'站位示意随局势变化，通过行动选项推进狩猎。',
 'hunting.place.arm1':'一号臂鸡笼','hunting.place.arm2':'二号臂鸡笼','hunting.place.arm3':'三号臂鸡笼','hunting.place.arm4':'四号臂鸡笼',
 'hunting.place.z1':'左上牧区','hunting.place.z2':'右上牧区','hunting.place.z3':'右下牧区','hunting.place.z4':'左下牧区',
 'hunting.title':'狩猎', 'hunting.enter':'查看猎物踪迹', 'hunting.kits':'准备捕具',
 'hunting.event.rabbit.title':'废园里的野兔','hunting.event.rabbit.intro':'野兔正在荒园的嫩叶间觅食。',
 'hunting.event.pig.title':'泥地里的野猪','hunting.event.pig.intro':'母猪带着幼崽在泥地觅食。失手会招来反扑；再次失手会被逼退，最多额外消耗 18 体力。',
 'hunting.event.cattle.title':'水塘边的牛群','hunting.event.cattle.intro':'牛群沿水塘移动，一头小牛紧跟在成年牛身后。岸边的窄道上留下清楚的蹄印。',
 'hunting.event.sheep.title':'坡地上的羊群','hunting.event.sheep.intro':'几只野羊正在坡地吃草，幼羊沿石缝间的小路穿行。',
 'hunting.event.chicken.title':'草窠里的野鸡','hunting.event.chicken.intro':'母鸡领着幼鸡在草间觅食。成年野鸡受惊会起飞，幼鸡则钻回草窠。',
 'hunting.started':'踪迹还很新。可以准备，也可以直接出手。',
 'hunting.stats':'体力 {stamina} · 饱食 {satiety} · 饮水 {thirst}',
 'hunting.cost':'{n} 体力','hunting.item_cost':'{name} −1 · 持有 {n}',
 'hunting.cooldown':'恢复可用还需 {n} 刻','hunting.time':'猎物仍会停留约 {n} 刻。准备和休息都会推进时间。',
 'hunting.close':'结束并返回','hunting.abandon':'放弃本次狩猎','hunting.rest':'休息片刻',
 'hunting.rest.risk':'{n} 刻 · 恢复体力，猎物可能离开',
 'hunting.rest.wait':'{n} 刻 · 恢复体力并守候',
 'hunting.rest.escape':'{n} 刻 · 猎物将逃脱',
 'hunting.rested':'猎物仍在附近。','hunting.waiting':'套索已就绪。',
 'hunting.prepared.observe':'已辨明退路。','hunting.prepared.block':'退路已封堵，可补捕一次。',
 'hunting.prepared.bait':'猎物被诱饵吸引。',
 'hunting.missed_retry':'这次失手了。猎物在被封堵的退路前折返，你还有一次补捕机会。',
 'hunting.result.caught':'捕获成功。','hunting.result.escaped':'猎物逃脱，本次狩猎结束。',
 'hunting.result.abandoned':'你收手离开，本次狩猎结束。','hunting.result.interrupted':'局势发生变化，狩猎被打断。',
 'hunting.reward':'获得：{name} ×{n}','hunting.ground':'随身空间不足，猎获物留在脚下。',
 'hunting.target.meat':'追踪成年目标，获取肉料','hunting.target.juvenile':'寻找幼崽，活捉带回牧场',
 'hunting.action.observe':'观察足迹','hunting.action.block':'封堵退路','hunting.action.bait':'放置诱饵',
 'hunting.action.hands':'徒手捕捉','hunting.action.net':'使用捕网','hunting.action.snare':'布置套索',
 'hunting.action.javelin':'投枪猎杀','hunting.action.retry_hands':'奋力补捕','hunting.action.retry_net':'使用备用捕网',
 'hunting.reason.active':'请先完成或放弃当前狩猎；活动内不能进食或进行其他操作。',
 'hunting.reason.unavailable':'狩猎尚未就绪。','hunting.reason.busy':'请先结束其他行动，并脱离战斗。',
 'hunting.reason.cooldown':'这里的猎物踪迹还未恢复。','hunting.reason.inactive':'没有正在进行的狩猎。',
 'hunting.reason.ended':'本次狩猎已结束。','hunting.reason.interrupted':'当前无法继续狩猎，可以放弃返回。',
 'hunting.reason.phase':'当前阶段不可用。','hunting.reason.target':'请先选择目标。','hunting.reason.waiting':'正在等待套索。',
 'hunting.reason.unknown':'行动不可用。','hunting.reason.done':'已经完成这项准备。','hunting.reason.observe':'尚未发现退路。',
 'hunting.reason.live':'活捉幼崽不能使用投枪。','hunting.reason.stamina':'体力不足或当前身体状态无法执行。',
 'hunting.reason.item':'缺少所需耗材。','hunting.admit':'安置到 {place}',
 'hunting.admit_full':'需要有空位的鸡笼或适配牧区。','hunting.admission_hint':'幼崽从随身物品转入牧场，原有性别与特性保持不变。'
});
const learningNotes={
 animal_regular_path:['动物似乎常从相似的缺口离开。','在不同地点验证过：动物会重复经过固定通道。'],
 snare_tightening:['旧绳圈的用途还需要试探。','绳圈受拉会收紧，可以用来限制穿过的东西。'],
 snare_anchor:['复原的绳结需要经得住拉扯。','反复试验过固定端，现在可以尝试制作和使用基础套索。'],
 snare_placement:['布置的位置、高度可能影响结果。','积累了多次捕具检查经验，可以尝试在窄道预设拦截。'],
 cover_use:['草木和石头可能遮挡视线。','观察过多次遮挡关系，可以有目的地利用掩蔽。'],
 bird_landing:['野鸡停留和起飞的地方似乎有规律。','积累了野鸡活动的观察经验，可以尝试隐蔽等候落地。'],
 cattle_restraint:['成年牛挣脱时的力量很大。','见过多次牛挣脱的过程，可以结合已学的套索方法尝试牵制。'],
 field_processing:['猎获物的皮、骨、肌肉连接需要仔细辨认。','看过不同猎获物的连接结构，可以尝试进一步取材。']
};
for(const [id,notes] of Object.entries(learningNotes)){ui['hunting.note.'+id+'.clue']=notes[0];ui['hunting.note.'+id+'.known']=notes[1];}
write('data/ui_text_zhCN.json',ui);
const p = path.join(root,'data/items/product_base.csv');
let csv = fs.readFileSync(p,'utf8'), header = csv.split(/\r?\n/)[0].split(',');
const additions = [
 ['consumable_hunting_blood_kit','采血包',0.2,5,'consumable','hunting','野外收集血液的容器与封装用品。每次处理消耗一包。',80],
 ['consumable_hunting_skin_kit','剥皮耗材包',0.2,5,'consumable','hunting','一次剥皮所需的石刃与捆扎用品。每次处理消耗一包。',80],
 ['consumable_hunting_net','捕网',0.4,5,'consumable','hunting','展开后罩住猎物的绳网。每次捕捉消耗一个，失手也不回收。',180],
 ['consumable_hunting_snare','套索',0.2,5,'consumable','hunting','布在狭窄兽道上的套索。布置时消耗一个，可以休息守候。',100],
 ['consumable_hunting_bait','蔬菜诱饵',0.15,5,'consumable','hunting','切碎的蔬菜，用于引出觅食动物。投放时消耗一份。',50],
 ['live_pig_juvenile','猪幼崽',1.5,1,'animal','juvenile','活捉带回的猪幼崽，可在牧场安置。',200],
 ['live_cattle_juvenile','牛幼崽',4.5,1,'animal','juvenile','活捉带回的牛幼崽，可在牧场安置。',300],
 ['live_sheep_juvenile','羊幼崽',2.5,1,'animal','juvenile','活捉带回的羊幼崽，可在牧场安置。',200],
 ['live_chicken_juvenile','幼鸡',0.1,1,'animal','juvenile','活捉带回的幼鸡，需要安置在有空位的鸡笼。',80]
];
const species = read('data/livestock-species.json').species;
for (const [id,sn,w,stack,cat,sub,fn,value] of additions) {
 if (csv.split(/\r?\n/).some(line=>line.startsWith(id+','))) continue;
 const sp = id.startsWith('live_') ? id.split('_')[1] : null;
 const row={id,sn,placeholder_name:sn,fn,category:cat,sub_category:sub,weight:sp?species[sp].growth.birth_weight_kg:w,stack_limit:stack,quality:'white',tags:cat+';hunting;'+sub,source:cat==='animal'?'hunting':'craft',production_lines:cat==='animal'?'':'craft',spoilage_ticks:0,price_class:'material',volatility:'mid',region_restrict:0,base_value:value};
 csv=csv.trimEnd()+'\n'+header.map(k=>row[k]??'').join(',')+'\n';
}
fs.writeFileSync(p,csv,'utf8');
// Shared animal products retain their existing source and gain hunting where now obtainable.
const huntingConfig=read('data/hunting.json');
const shared=new Set(Object.values(huntingConfig.events).flatMap(e=>[e.reward,...Object.values(e.processing||{}).map(p=>p.reward)]));
const materialsPath=path.join(root,'data/items/materials_all.csv');
const materials=fs.readFileSync(materialsPath,'utf8').split(/\r?\n/);
const sourceColumn=materials[0].split(',').indexOf('source');
if(sourceColumn<0)throw Error('Missing materials source column');
for(let i=1;i<materials.length;i++) {
 const id=materials[i].split(',')[0];if(!shared.has(id))continue;
 if(materials[i].includes('"'))throw Error('Quoted material row: '+id);
 const cells=materials[i].split(','),sources=(cells[sourceColumn]||'').split(';').filter(Boolean);
 if(!sources.includes('hunting'))sources.push('hunting');cells[sourceColumn]=sources.join(';');materials[i]=cells.join(',');
}
fs.writeFileSync(materialsPath,materials.join('\n'),'utf8');
for (const [mapId,pools] of [['M0_Field_01',[['rabbit'],['pig_calf','chicken_calf']]],['M0_Field_02',[['rabbit'],['cattle_calf','sheep_calf']]]]) {
 const file='data/maps/'+mapId+'.json', m=read(file);
 for(let i=0;i<pools.length;i++) {
  const id=mapId+'_hunt_'+i;
  if(m.entities.some(e=>e.hunting_point_id===id))continue;
  // Reuse a known walkable vegetation cell, preserving the rest of the map.
  const e=m.entities.find(e=>e.entity_id==='gathering_grass'&&!(m.blocks||[]).some(b=>b.x===e.x&&b.y===e.y));
  if(!e)throw Error('No safe point in '+mapId);
  Object.assign(e,{entity_id:'hunting_point',hunting_point_id:id,hunting_events:pools[i]});
  delete e.gathering_instance_id;
 }
 write(file,m);
}
console.log('Hunting text, consumables, juveniles and four field points ready.');

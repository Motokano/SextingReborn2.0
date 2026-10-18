import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildModularCatalog, hydrateModularCatalog } from './item-attribute-catalog.mjs';

// Authoring build only. Registration waits for weapon instances, knowledge and occupancy consumers.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const design = 'docs/design/';
const examples = design + 'examples/';
const req = json(examples + 'weapon-forging-material-requirements-v1.json');
const balance = json(examples + 'weapon-forging-balance-v1.json');
const oreBase = json(examples + 'weapon-forging-ores-v1.json');
const oreExtra = json(examples + 'weapon-ore-intrinsic-traits-v1.json');
const ores = [...oreBase.ores, ...oreExtra.oreAdditions];
const repair = json(examples + 'weapon-repair-tool-knowledge-v1.json');
const rawItems = json(examples + 'weapon-forging-ore-items-v1.json');
const toolItems = json(examples + 'weapon-repair-tool-items-v1.json');
const relative = p => '../../' + p;
const ref = (file, pointer = '') => relative(examples + file) + '#' + pointer;
const rows = file => read(design + file).split(/\r?\n/).filter(l => l.startsWith('|')).map(l => l.split('|').slice(1, -1).map(s => s.trim()));
const partId = id => 'weapon_component_' + id.toLowerCase().replaceAll('-', '_');
const feedId = id => id.replace(/^ore_/, 'material_forging_').replace(/_raw$/, '');
const sourceFiles = { B: 'weapon-blade-components-draft.md', T: 'weapon-tip-pommel-components-draft.md', D: 'weapon-blunt-side-components-draft.md', H: 'weapon-hilt-components-draft.md', M: 'weapon-multi-slot-components-draft.md' };
const groupNames = { B: '剑刃', T: '前端', D: '钝击侧', H: '手柄', M: '跨位置部件' };

// Outer form only: no fixed metal, alloy recipe, quality, numerical benefit or hidden buff in identity text.
const componentText = `
B01|平直薄片|平直的片面向一边收薄|像能装上去|刃面平直并收向刃口的侧刃
B02|凸面厚片|片面微鼓而中部较厚|像能装上去|刃后留有厚实承力部分的凸面侧刃
B03|弧面长片|长片两面有圆顺的弧度|像能装上去|刃面圆顺过渡的透镜形侧刃
B04|窄脊长片|窄长片面中间隆起一道脊|像能装上去|窄身带菱形脊的侧刃
B05|宽面长片|长片较宽而一边收薄|像能装上去|平直宽面的侧刃
B06|带槽宽片|宽长片面上凹着一道浅槽|像能装上去|带浅纵槽的宽身侧刃
B07|厚棱长片|长片中部较厚并带斜棱面|像能装上去|中部厚实并带六棱截面的侧刃
B08|接缝长片|片面一边留有细长接缝|像能装上去|刃缘与承力部分接合的复合侧刃
B09|渐薄弧片|圆弧片面沿长边逐渐变薄|像能装上去|沿长度渐薄的透镜形侧刃
B10|凹面脊片|长片刃面微凹而中脊凸起|像能装上去|浅凹刃面配厚脊与根部的侧刃
B11|前宽长片|长片前部展开得较宽|像能装上去|前部加宽的劈砍侧刃
B12|整齐棱片|长片的斜棱面平整连贯|像能装上去|棱面经过整修的六棱侧刃
B13|双槽薄片|细长片面并排凹着两道槽|像能装上去|带双纵槽并沿长度渐薄的侧刃
B14|夹层刃片|薄边与中部间有细密交界|像能装上去|刃缘与芯部组合的复合侧刃
B15|匀薄长片|长片两面圆顺而厚薄渐变|像能装上去|沿长度精整渐薄的侧刃
B16|整磨宽片|宽片刃面留有整齐磨痕|像能装上去|宽身刃面经过整磨的侧刃
B17|夹缝长片|长片侧面留着细密接合线|像能装上去|芯部与两侧焊合的夹层侧刃
T01|短尖小块|短小块体的四面收向尖端|像能装上去|短小菱形的刺击前端
T02|平顶圆块|圆块顶端平整而边缘钝圆|像能装上去|平顶圆边的钝击前端
T03|叶形尖片|扁片像叶子一样收出尖角|像能装上去|扁叶形的刺击前端
T04|半圆小头|块体的一端圆鼓如半个球|像能装上去|半球形的钝击前端
T05|四棱尖块|四道长棱一同收向尖端|像能装上去|带四道棱的刺击前端
T06|扁圆小头|短块顶面宽圆而侧面扁平|像能装上去|扁圆形的钝击前端
T07|窄脊尖片|窄长尖片中间凸着一条脊|像能装上去|带脊棱的窄刺击前端
T08|多棱钝块|块体带有数个平整的棱面|像能装上去|带多道钝棱的钝击前端
T09|渐细长尖|细长的块体逐渐收出尖端|像能装上去|逐渐收窄的长刺击前端
T10|鼓形圆块|圆块中部鼓起而两端较平|像能装上去|鼓形的钝击前端
T11|厚根尖块|尖块根部较厚而尖端细窄|像能装上去|根部加厚的菱形刺击前端
T12|圆冠厚块|厚块顶端隆起一圈圆冠|像能装上去|圆冠形的厚实钝击前端
D01|圆柱长条|长条四周圆滑而两端平齐|像能装上去|圆柱形的钝击侧条
D02|厚背长条|长条背部较厚而外面钝圆|像能装上去|带厚背的钝击侧条
D03|扁平短板|短板较宽而四边圆钝|像能装上去|扁平钝边的侧击板
D04|六棱长条|长条绕着六个平整棱面|像能装上去|未开刃的六棱钝击侧条
D05|弧面长条|长条外侧弯成连续的圆弧|像能装上去|弧面相连的钝击侧条
D06|加厚平板|板面平展而侧边厚实|像能装上去|加厚的钝击侧板
D07|细圆长条|细长条身四周圆滑|像能装上去|窄圆截面的钝击侧条
D08|凸面短块|短块的一面向外鼓起|像能装上去|接触面向外隆起的钝击侧块
D09|厚棱长块|长块带有厚实而圆钝的棱|像能装上去|加厚钝棱的侧击条
D10|偏厚短块|短块一端明显比另一端厚|像能装上去|质量偏向一端的钝击侧块
D11|宽面短板|板面宽阔而边缘圆钝|像能装上去|宽阔钝面的侧击板
D12|弧背厚条|厚条背面弯成连续圆弧|像能装上去|带厚实弧背的钝击侧条
D13|渐细圆条|圆滑条身向一端渐渐收细|像能装上去|沿长度渐细的钝击侧条
D14|棱面短块|短块表面分出几道钝棱|像能装上去|棱面分明而未开刃的钝击侧块
D15|厚背宽板|宽板背部凸起一片厚面|像能装上去|宽面厚背的钝击侧板
D16|端厚长条|长条末端鼓起一块厚头|像能装上去|质量集中在远端的钝击侧条
D17|宽冠短板|宽板外缘圆鼓成冠状|像能装上去|带宽圆冠面的钝击侧板
D18|厚脊长条|长条背部凸出一道厚脊|像能装上去|带厚脊的钝击侧条
H01|圆尾直把|细直把手末端收成圆头|像是个握把|没有护手并带圆钝尾首的直柄
H02|横格扁尾把|短横格下连着扁圆尾把|像是个握把|带短横格和扁圆尾首的手柄
H03|弧柄弓环把|微弯把身外绕着一道弓环|像是个握把|带单弓护手的弧柄
H04|厚尾直把|直把尾端凸着厚实圆头|像是个握把|没有护手并带厚实柄首的手柄
H05|宽横格把|把身前端横伸出两道宽翼|像是个握把|带宽横向剑格的手柄
H06|椭圆盘把|把身前端连着椭圆挡片|像是个握把|带椭圆盘状护手的手柄
H07|梨尾直把|直把尾端鼓成梨子的形状|像是个握把|没有护手并带梨形圆钝尾首的直柄
H08|双弓环把|两道弓环从把手外侧绕过|像是个握把|带双支护弓的手柄
H09|弧背弯把|弯曲把身外侧连着弧形背|像是个握把|背线连续弯曲的军刀护手柄
H10|八棱尾把|把手尾部鼓成八棱厚块|像是个握把|没有护手并带八棱重首的手柄
H11|三弓环把|三道弓环围在把身外侧|像是个握把|带三支护弓的手柄
H12|下弯横格把|把手前面的横格两端下弯|像是个握把|带下弯剑格及圆钝尾首的手柄
H13|尖尾把手|细把尾端伸出一段短尖|像是个握把|没有护手并带短尾刺的手柄
H14|半篮环把|几道弓环在把外围成半篮|像是个握把|带半篮状护手的手柄
H15|宽弧格把|宽阔横格沿把前弯成弧面|像是个握把|带宽弧剑格的手柄
H16|厚首长把|把身尾端连着厚实钝头|像是个握把|没有护手并带厚实配重首的手柄
H17|碗形罩把|一片碗形罩面围着把身|像是个握把|带碗形护手的手柄
H18|回弯宽格把|宽横格两端向后回弯|像是个握把|带回曲宽剑格的手柄
M01|双面方头|宽头左右各伸出平钝端面|像能接个柄|两侧各有锤面的双面锤头
M02|双翼刃头|宽头两边展开成带薄边的翼|像能接个柄|两侧各有斧刃的双刃斧头
M03|方头刃翼块|块体一侧平钝而另一侧展宽|像能接个柄|一侧为锤面另一侧为斧刃的复合头
M04|方头尖喙块|块体一侧平钝而另一侧伸尖|像能接个柄|一侧为锤面另一侧为尖喙的复合头
M05|双薄边长片|长片两边收薄而前端带尖|像能接个柄|尖端与两侧剑刃连为一体的剑身
M06|厚背尖长片|尖长片一边收薄而另一边厚|像能接个柄|尖端与刀刃和厚背连为一体的刀身
M07|圆钝长杆|长杆四周圆钝而顶端收平|像能接个柄|棍顶与两侧连为一体的棍身
M08|冠尖双面头|双面钝头上方伸出一段尖角|像能接个柄|冠刺与两侧锤面连为一体的锤头
`.trim().split('\n').map(l => l.split('|'));
const textMap = new Map(componentText.map(([id, placeholder, appearance, guess, identified]) => [id, { placeholder, appearance, guess, identified }]));
const feedText = [
 ['iron','铁料','灰黑小坯','灰黑小块表面留着锤痕'],
 ['copper','铜料','红褐小坯','红褐小块的断面泛着光'],
 ['tin','锡料','浅灰小坯','浅灰小块的表面带着亮光'],
 ['lead','铅料','暗灰小坯','暗灰小块表面蒙着一层浅色'],
 ['zinc','锌料','蓝灰小坯','蓝灰小块边缘泛着冷光'],
 ['titanium','钛砂料','暗银小坯','暗银小块表面有细小凹点'],
 ['tungsten','黑重矿料','灰黑粗坯','灰黑小块表面带着粗糙纹理'],
 ['molybdenum','银片矿料','银灰粗坯','银灰小块表面叠着薄薄细纹'],
 ['manganese','黑纹矿料','深灰纹坯','深灰小块上散着深浅纹路'],
 ['antimony','针晶矿料','银亮纹坯','银亮小块断面带着细长纹理'],
 ['silver','银料','浅白小坯','浅白小块的边缘闪着亮光'],
 ['gold','金料','金黄小坯','金黄小块表面留着浅浅凹痕'],
];
const identity = (name, placeholder, observation, identified) => ({ name, name_0:name, sn:name, placeholder_name:placeholder, fn_before:observation, fn:identified, desc_0:identified });
const stats = new Map();
const attack = (text, slot) => { const m = text.match(/^(钝击|劈|刺) (\d+)$/); assert(m, text); return { slot, damageType: ({钝击:'blunt',劈:'slash',刺:'pierce'})[m[1]], basePower:+m[2] }; };
for (const r of rows('weapon-component-final-stats-draft.md')) {
  const single = r[1]?.match(/^([BTDH]\d{2}) (.+)$/), multi = r[0]?.match(/^(M\d{2}-T[1-6]) (.+)$/);
  if (single) {
    const id=single[1], slot=id[0]==='T'?'front':id[0]==='H'?'hilt':'side';
    assert(!stats.has(id));
    stats.set(id,{ name:single[2],tier:+r[0],positions:[attack(r[2],slot)],innateStrength:+r[3],weightKg:+r[4],durabilityMax:+r[5],speedPercent:parseFloat(r[6]),role:r[7] });
  }
  if (multi) {
    const id=multi[1]; assert(!stats.has(id));
    stats.set(id,{name:multi[2],tier:+id.at(-1),positions:r.slice(1,4).flatMap((s,i)=>s==='不占用'?[]:[attack(s,['front','side1','side2'][i])]),innateStrength:+r[4],weightKg:+r[5],durabilityMax:+r[6],speedPercent:parseFloat(r[7])});
  }
}
assert.equal(stats.size,83);
const bladeDefense = new Map(rows(sourceFiles.B).filter(r => ['均衡','轻快','重劈','防守','切入'].includes(r[0])).map(r => [r[0],[+r[3],+r[4]]]));
const bluntRows = new Map(rows(sourceFiles.D).filter(r=>/^D\d\d$/.test(r[1])).map(r=>[r[1],r]));
const hiltRows = new Map(rows(sourceFiles.H).filter(r=>/^H\d\d$/.test(r[1])).map(r=>[r[1],r]));
const hiltBuffs = new Map(rows(sourceFiles.H).filter(r=>/^H\d\d$/.test(r[0])).map(r=>[r[0],r]));
const multiDefense = new Map(rows(sourceFiles.M).filter(r=>/^M\d\d /.test(r[0]) && r.length===7).map(r=>[r[0].slice(0,3),r]));
const multiBuffs = new Map(rows(sourceFiles.M).filter(r=>/^M\d\d /.test(r[0]) && r.length===5).map(r=>[r[0].slice(0,3),r]));
const fallback = {front:{pierce:'weapon_basic_front_thrust',blunt:'weapon_basic_front_bump'},side:{slash:'weapon_basic_side_cleave',blunt:'weapon_basic_side_swing',pierce:'weapon_basic_side_peck'},hilt:{blunt:'weapon_basic_hilt_strike',pierce:'weapon_basic_hilt_thrust'}};
const fresh = {}, definitions = {}, feedRoutes = {};
for (const [i,c] of req.components.entries()) {
  const s=stats.get(c.id), family=c.id.slice(0,3), group=c.id[0], id=partId(c.id), t=textMap.get(group==='M'?family:c.id);
  assert(s && t && s.name===c.name && s.tier===c.tier, c.id);
  const choices=s.positions[0].slot==='side'?['side1','side2']:[s.positions[0].slot];
  const placements=choices.map(anchor=>({anchor, occupies:s.positions.map(p=>p.slot==='side'?anchor:p.slot)}));
  fresh[id]={item_id:id,...identity(s.name,t.placeholder,t.appearance+'，'+t.guess,t.identified+'。'),
    category:'weapon_component',sub_category:({B:'blade',T:'front',D:'blunt_side',H:'hilt',M:'multi_position'})[group],
    weight_kg:s.weightKg,stack_limit:1,tags:'weapon_component;forge;assembly_part',source:'forge',production_lines:'forge',
    assembly_types:choices.map(p=>'weapon.single_hand.'+p)};
  const positions=s.positions.map(p=>{
    let pair=null;
    if(group==='B')pair=bladeDefense.get(s.role);
    if(group==='D')pair=[+bluntRows.get(c.id)[5],+bluntRows.get(c.id)[6]];
    if(group==='H'&&hiltRows.get(c.id)[5]==='是')pair=[+hiltRows.get(c.id)[6],+hiltRows.get(c.id)[7]];
    if(group==='M'&&p.slot!=='front'){const r=multiDefense.get(family),offset=p.slot==='side1'?2:4;pair=[+r[offset],+r[offset+1]];}
    if(pair)assert(pair.every(n=>Number.isFinite(n)&&n>0), c.id+' defense');
    const action=fallback[p.slot.startsWith('side')?'side':p.slot][p.damageType]; assert(action);
    return {...p,blockEligible:!!pair,blockCoefficient:pair?.[0]??null,deflectionCoefficient:pair?.[1]??null,fallbackMoveId:action};
  });
  const buffs=[];
  if(group==='D'){const m=bluntRows.get(c.id)[8].match(/^(\S+) (\d+)%$/);assert(m);buffs.push({name:m[1],strengthPercent:+m[2],ruleSource:relative(design+sourceFiles.D)+'#六种特色buff提案'});}
  if(group==='H'&&hiltBuffs.has(c.id)){const r=hiltBuffs.get(c.id);buffs.push({name:r[2],description:r[3],includedInSpeed:c.id==='H01',ruleSource:relative(design+sourceFiles.H)+'#无护手手柄的特色buff提案'});}
  if(group==='M'){const r=multiBuffs.get(family);buffs.push({name:r[3],strengthPercent:parseFloat(r[4]),ruleKey:family,ruleSource:relative(design+sourceFiles.M)+'#三类联动buff提案'});}
  const damageDoc=group==='M'?'weapon-multi-slot-durability-draft.md':group==='H'?'weapon-hilt-durability-draft.md':sourceFiles[group];
  definitions[id]={designId:c.id,group,tier:c.tier,prototypeId:'single_hand',placements,positions,
    baseline:{weightKg:s.weightKg,innateStrength:s.innateStrength,durabilityMax:s.durabilityMax,speedPercent:s.speedPercent,ordinaryContactLoss:1,blockedContactLoss:2},
    repairToolItemId:repair.repair_targets[c.id],
    materialRequirementsRef:ref('weapon-forging-material-requirements-v1.json','/components/'+i),
    operationCostsRef:ref('weapon-forging-balance-v1.json','/components/'+balance.components.findIndex(x=>x.id===c.id)),
    componentEffects:buffs,
    damageRules:{source:relative(design+damageDoc),lookupKey:group==='M'?family:group==='H'?c.id:group==='T'?positions[0].damageType:group,
      selection:group==='H'?'fixed':'one_of_three_equal_weight',scope:'real_instance',persistUntilRepair:true,
      disableBlockAtZero:group==='H'&&positions[0].blockEligible,disableComponentEffectsAtZero:group==='H',
      speedAtZeroOverride:c.id==='H01'?0:null,executionStatus:'modular_weapon_combat_v1'},
    structureKnowledgeKey:'weapon_structure:'+c.id,
    economy:{valuation:'pending',tradeEnabled:false},
  };
}
for (const [key,name,placeholder,appearance] of feedText) {
  const ore=ores.find(o=>o.id==='ore_'+key+'_raw');assert(ore);
  const id=feedId(ore.id), raw=ore.rawItem;
  fresh[id]={item_id:id,...identity(name,placeholder,appearance+'，像能再加工',ore.name+'加工后得到的一份坯料。'),
    category:'material',sub_category:'forging_feed',weight_kg:ore.scores.density/100,stack_limit:1,
    tags:'material;forging_feed;forge',source:'forge',production_lines:'forge',
    base_value:raw.baseValue,price_class:raw.priceClass,volatility:raw.volatility,region_restrict:0};
  const index=balance.ores.findIndex(o=>o.id===ore.id);
  feedRoutes[id]={rawItemId:ore.id,feedItemId:id,routeKey:ore.id,inputCount:1,outputCount:1,byproducts:[],
    processingRef:ref('weapon-forging-balance-v1.json','/ores/'+index+'/processing'),
    materialInformationRef:ref('weapon-forging-ore-information-v1.json','/entries/'+ore.id),
    unitWeightPolicy:'trial_density_score_divided_by_100_kg_carry_only',
    baseValuePolicy:'same_as_one_raw_item_no_added_trade_premium',
    knowledgeScope:'feed_route:'+ore.id,rawIdentityRequiredForFeedName:true};
}
const toolkitId='tool_repair_roll', weaponId='weapon_single_hand_assembly';
const toolkitSlots={whetstone:{accepts:['repair.whetstone'],required:false},hammer:{accepts:['repair.hammer'],required:false},pliers:{accepts:['repair.pliers'],required:false}};
fresh[toolkitId]={item_id:toolkitId,...identity('帆布工具卷','带袋布卷','厚布上缝着几个长短不同的袋，像能装工具','缝着独立袋位的帆布工具卷，摊开后能放取其中的工具。'),
  category:'tool',sub_category:'repair_kit',weight_kg:0.3,stack_limit:1,tags:'tool;repair;assembly_root',assembly_slots:toolkitSlots};
fresh[weaponId]={item_id:weaponId,...identity('单手武器','拼接长器','几个部件连成一件带把长物，像能拿来挥','由已装入部件组成的单手武器。'),
  category:'weapon',sub_category:'single_hand',equip_slot:'weapon_right',weight_kg:0,stack_limit:1,tags:'weapon;single_hand;assembly_root',source:'forge',production_lines:'forge',
  assembly_slots:Object.fromEntries(['front','side1','side2','hilt'].map(p=>[p,{accepts:['weapon.single_hand.'+p],required:false}]))};
const built=buildModularCatalog(fresh);
const catalog={schema_version:2,items:{...rawItems.items,...built.items,...toolItems.items}};
assert.equal(Object.keys(catalog.items).length,112);
const restored=hydrateModularCatalog(catalog);
for(const [id,item] of Object.entries(catalog.items)){
  assert.equal(id,item.item_id);assert.match(id,/^[a-z0-9_]+$/);
  const a=item.attribute_modules.base.identity,halves=a.fn_before.split('，');
  assert([...a.placeholder_name].length<=8,id+' placeholder');
  assert(halves.length===2&&[...halves[0]].length<=16&&[...halves[1]].length<=6,id+' observation');
  assert.equal(restored[id].sn,a.sn);assert.equal(restored[id].weight_kg,item.weight_kg);
  assert.equal(restored[id].quality,undefined);assert.equal(restored[id].info_module_set_id,undefined);
}
const bindings={version:1,date:'2026-10-18',status:'single_hand_combat_registered',itemCatalog:'item-catalog-v2.json',
  scope:'正式物品模板及系统对应；铸造、认知、装配、维修和单手模块武器战斗已接入；其他原型与获取投放待设计。',
  activation:{automaticRegistration:true,retireOldWeaponsNow:false,acquisition:'pending',
    implemented:['knowledge_filtered_item_views','forged_instance_state_and_weight','multi_position_occupancy_validation','processing_research_craft_repair_actions','single_hand_modular_weapon_combat'],
    requires:['effect_observation_knowledge','other_weapon_prototypes','formal_weapon_skills_and_metaskill','acquisition']},
  counts:{rawOres:12,processedFeeds:12,components:83,repairTools:3,toolkitHosts:1,weaponHosts:1,total:112},
  knowledgeFile:'item-knowledge-v1.json',feedRoutes,components:definitions,
  prototypes:{single_hand:{itemId:weaponId,baseRange:1,requiredAttackPositions:['front','side1','side2','hilt'],
    rootWeightKg:0,rootIsAssemblyRecord:true,emptyRootSpawnable:false,
    defaultBlockPositions:['side1','side2'],extraBlockFromComponent:true,rotationRef:relative(design+'70-modular-weapon-system.md'),
    connectionStorage:'one_full_part_at_anchor_only',occupancy:'derive_from_placements_using_anchor_and_item_id',
    requiredFlagsInGenericHost:false,completeness:'all_four_attack_positions_covered_exactly_once',
    missingOrOverlappingPositions:'reject_use_and_reject_conflicting_attach',saveIncomplete:true,
    aggregation:{weight:'sum_unique_real_component_final_weight',speed:'sum_unique_real_component_speed',innateStrength:'max_unique_real_component_final_requirement',durability:'one_pool_per_real_component'},
    combatStatsOnRoot:false,holdingHandSource:'equipment_slot',equipSlotBinding:'weapon_left_or_weapon_right'}},
  toolkit:{itemId:toolkitId,selfWeightKg:0.3,fullWeightKg:6.8,slots:toolkitSlots,allSlotsOptional:true,
    selectedRootRequired:true,requiresMatchingToolOnly:true,extraWeightDiscount:0,consumesTools:false,toolDurability:false,
    compatibilityRef:ref('weapon-repair-tool-knowledge-v1.json','/repair_targets'),economy:{valuation:'pending',tradeEnabled:false}},
  forgedInstanceContract:{status:'forging_inventory_repair_single_hand_combat_registered',identityFields:['item_id','instance_id'],stateNamespace:'forged_component',
    requiredFields:['design_id','recipe','completion','final_weight_kg','final_innate_strength','final_position_powers','durability_max','durability_current','contact_loss','ore_trait','zero_durability_result'],
    recipeUnit:'processed_feed_item_id_and_integer_count',maxOreTraits:1,oreTraitMayBeNull:true,
    finalStatsPersistedOnce:true,startingDurability:'computed_durability_max',damageStateInitially:null,
    precision:{power:0.01,durability:0.01,weight:'retain_calculation_precision'},
    templateWeightMeaning:'baseline_only_for_components',actualCarryWeightField:'forged_component.final_weight_kg',
    missingForgedState:'reject_incomplete_component_instance_do_not_assume_perfect',
    noPerSlotCopies:true,noQualityField:true,repairPreservesRecipeAndOreTrait:true,
    statFormulaSource:relative(design+'70-modular-weapon-system.md')+'#材料潜力与锻造发挥',
    traitSelectionRef:ref('weapon-ore-combinations-v1.json','/rules')},
  fallbackMoves:{ids:[...new Set(Object.values(fallback).flatMap(Object.values))],source:relative(design+'weapon-basic-moves-draft.md'),ownedBy:'component',learnable:false,upgradeable:false,variantsAllowed:false},
  dataSources:[relative(design+'weapon-component-final-stats-draft.md'),...Object.values(sourceFiles).map(f=>relative(design+f)),relative(design+'weapon-hilt-durability-draft.md'),relative(design+'weapon-multi-slot-durability-draft.md')],
};
const knowledge={version:1,date:'2026-10-17',status:'forging_registered_effect_observation_pending',itemCatalog:'item-catalog-v2.json',owner:'character',defaultKnown:false,
  common:{unseen:'omit_entire_entry',identityNameRequires:['item_seen','identity_known','survival_language>=3'],nameOtherwise:'placeholder_name',
    descriptionWhenLanguageBelow2:'omit',identifiedDescriptionRequires:['identity_known','survival_language>=4'],descriptionOtherwise:'fn_before',
    neverReveal:['editor_name','item_id','tags','assembly_types','assembly_slots','source','production_lines','base_value','full_catalog_count','hidden_trait_count'],
    noIdentityFrom:['language_level_alone','forging_level_alone','pickup','trade','move','open_panel','load_save'],
    noUnseenEnumeration:true,noUnknownGroupHeadings:true,noRawIdFallback:true,noFormulaLeaksInLogsOrSorting:true},
  stationInspection:oreBase.itemInformation.recognitionMethod.processingInspection,
  components:{identityEvidence:'personal_inspection_of_present_component',structureEvidence:'destructive_research_one_real_component',
    structureScope:'design_id_including_stage',identityDoesNotGrantBlueprint:true,researchDoesNotRevealRecipe:true,
    partAppearanceIndependentOfIngredientIdentity:true,
    compatibilityRequires:['component_seen','component_structure_known'],effectsRequire:['effect_known','trigger_known'],
    materialRequirements:{minForgingLevel:10,requires:['component_structure_known']},
    exactInstancePerformance:{minForgingLevel:25,requires:['component_structure_known','instance_recipe_known','all_contributing_material_routes_known']},
    oreTraitStrength:{minForgingLevel:50,requires:['effect_known','trigger_known','relevant_route_known']},
    starsDoNotAutoIdentify:true,buffIsNotIdentityText:true,knowledgeKeyByItem:Object.fromEntries(Object.entries(definitions).map(([id,d])=>[id,d.structureKnowledgeKey]))},
  feeds:{useAndScoresSource:'known_processing_route',namesRequire:['feed_seen','feed_identity_known','raw_identity_known','survival_language>=3'],
    identifiedDescriptionRequires:['feed_identity_known','raw_identity_known','survival_language>=4'],
    productionEvidence:['feed_seen','feed_route_known','feed_unit_known'],
    identityEvidence:'own_processing_of_identified_raw_ore_or_personal_feed_identification',
    rawIdentityCannotBeInferredFromHiddenRouteId:true,exactScoresMinForgingLevel:10,unknownContribution:'suppress_incomplete_totals_and_predictions',
    reference:ref('weapon-forging-ore-information-v1.json','/knowledgePolicy')},
  hosts:{[toolkitId]:{identityEvidence:'personal_inspection',useRequires:['toolkit_use_known'],
      compatibilityKnowledge:'only_observed_tools_and_successful_fit_or_repair',emptySlotsDoNotListUnknownTools:true},
    [weaponId]:{name:'known_assembly_name_or_generic_single_hand_weapon',noAutomaticSwordClassification:true,
      rootNameDoesNotRevealChildren:true,detailsUseEachChildKnowledge:true,missingPartsDoNotRecommendUnseenItems:true}},
  rawOreInformationRef:ref('weapon-forging-ore-information-v1.json'),repairToolInformationRef:ref('weapon-repair-tool-knowledge-v1.json'),
};
const tr = cells=>'| '+cells.join(' | ')+' |';
const table = (head,data)=>[tr(head),tr(head.map(()=>'---')),...data.map(tr)].join('\n');
const md=`# 铸造正式物品配表

2026-10-17。本轮补齐正式物品模板，共112条：12种原矿、12种加工料、83件武器部件、3种维修工具、帆布工具卷和单手武器装配宿主。沿用schema v2及现有属性模块，不加品质字段。

- [物品目录](../../data/forging/item-catalog-v2.json)：身份文案、分类、重量、堆叠和真实部件连接声明。
- [系统对应表](../../data/forging/item-bindings-v1.json)：加工产物、逐位置攻击与防御、整件基准值、成本、维修工具、损坏与特色规则来源。
- [认知表](../../data/forging/item-knowledge-v1.json)：检查、研究、身份、用途、数值和配方各自的认识边界。

目录已加入正式游戏加载清单，铸造生产、认知、装配、负重、维修及单手模块武器战斗已接入。正式可学习武器招式、metaskill、其他原型、旧武器迁移与新物品投放仍待后续完成。详见[铸造运行接入](weapon-forging-runtime.md)。已有三种工具与十二矿目录作为源表保留，构建时原样合入，不能再手改第二份。其他模板由tools/build-forging-items.mjs生成。

## 加工方法

在铸造台检查当前持有的原矿，认识这一种矿的加工用途、路线及单份规格。无需先知道矿石真名，不消耗样本，不另收时间、体力或经验，也不开放试料。重复检查已知路线没有新收益。处理过程中接触到的加工料才进入物品认识；不能提前列出十二种加工料。

检查不直接鉴定矿种、公开组合或授予部件图纸。精确材性仍须满足铸造10级等既有条件；已知加工路线可在低级时正常加工。部件结构仍需研究并破坏一件真实样本，研究整件跨位置部件只扣一件，不按位置扣样本。

## 加工料

每件原矿加工出一份对应坯料，无边角料，单份四项分数沿用原矿路线。材料表内部仍以原矿ID作为路线键，加工产物使用独立物品ID；不可把原矿与加工料各算一份重复投料。

本轮补配的加工料携带重量暂按密度分÷100 kg，基价沿用对应一件原矿，不另加加工溢价；这是首轮数值，不是现实提纯率。重量只影响携带，不再乘进材性分数；部件最终重量继续读取部件基重×密度达成率。数量1∶1不要求原矿、坯料、成品等重，未保留部分不生成边角料物品。

${table(['原矿','加工料','物品ID','每份kg'],Object.values(feedRoutes).map(r=>[ores.find(o=>o.id===r.rawItemId).name,restored[r.feedItemId].sn,r.feedItemId,restored[r.feedItemId].weight_kg]))}

## 部件与装配

部件使用稳定ID weapon_component_加原设计编号，跨位置编号中的连字符转下划线。各阶段同款依然是独立设计，外观相近可以同名，不把阶段当新品质。每件都有外观称呼、初步观察和识别说明；不在固定文案里写矿材、特性强度或特定配方。

${table(['类型','条目数','连接与攻击位置'],[['剑刃',17,'任选侧一或侧二，装两侧需两件'],['前端',12,'只占前端'],['钝击侧',18,'任选侧一或侧二，装两侧需两件'],['手柄',18,'只占手柄；有护手者另开格挡资格'],['跨位置',18,'M01—M04占两侧；M05—M08占前端及两侧']])}

单手武器宿主weight_kg为0，表示组合记录，不是额外锻造的空白武器。连接和承力结构已分摊在部件基重中。每个部件只在锚点连接里保存一个完整实例，其余占位由对应表推导，不复制物品。M01—M04固定锚点侧一，M05—M08固定锚点前端；无旋转，单侧件可选任意一侧。

现有通用连接只校验实际连接槽，不能把跨位置预占当成两个独立子物品。故宿主四个连接槽的通用required为false，武器对应表另声明四个攻击位置必须各覆盖一次；运行接入必须同时执行武器完整性及重叠校验，不能只用通用required检查就允许缺件使用。缺件组合可保存和搬运，不能战斗。零耐久不会形成空槽。

逐位置威力、格挡和卸力已配入系统对应表；整件速度、门槛、重量、耐久不按占位数重复累计。损坏及特色效果关联现有完整设计，执行器仍待接入。七种兜底招式按位置和属性关联，不能学习、升级或装备变式；不复制到人物招式目录。

## 工具卷

tool_repair_roll自重0.30kg，磨刀石、修理锤、维修钳各有一个可选袋位。三件工具沿用2.00、3.00、1.50kg，满装6.80kg。空卷没有维修能力，包内有对应工具即可修该部件，不要求凑齐全部工具，不设工具耐久或额外减重。已有83件工具对应关系全部沿用。

## 模板和成品实例

模板的部件重量是基准，不是所有产物的固定重量。每次打造出的实例保存实际配料、完成度、最终位置威力、最终重量和筋骨要求、耐久上限与当前值、接触扣量、最多一条矿材特性及归零结果。正式负重已读取实例最终重量，跨位置部件只累计一次。

新成品当前耐久等于本炉算出的耐久上限，归零结果为空；材料、完成度均已结算进成品，不在装备或读档时再次滚算。缺少成品状态的实例不能默认为完美成品。维修恢复同一个池，保留配料与矿材特性，跨位置部件只恢复一次。

## 认知与经济边界

遵守[认知论](01-philosophy.md)和[物品文案规范](../../capitalism/items_template_and_style.md)。未知物品不列出条目、问号、隐藏数或槽位兼容目录；语言够高不自动鉴定。每个子件独立走认识过滤。加工料名称及识别说明还需认识其原矿身份，避免从产物反泄露未知矿种。

部件身份、结构图纸、实际配料、材料特性是不同认识。知道名称不等于获得图纸；研究结构不等于知道原物配方；三星不自动鉴定矿材特性。专业数值继续按10／25／50级与对应已知输入开放，不恢复大段预估界面。

获取途径沿用待定。83件部件和工具卷未擅自配售卖价格，交易配置标为停用待估值，缺价不解释为免费；加工料的后台基价也不是自动进入商店的指令。原矿和三种工具沿用已有价格候选，不改当前场景、矿点或商店库存。

## 核对与后续接入

构建执行完整数量、编号、认知短文长度、schema往返、83件基准与材料要求对应校验。运行接入已覆盖实例数值读取、四位置占用校验、认识显示、铸造与维修行动、存档与中断。武器战斗、特性实战观察、获取投放和旧武器迁移仍未完成，不能把配表及成品结算当成这些功能已生效。
`;
const outputs=[['data/forging/item-catalog-v2.json',catalog],['data/forging/item-bindings-v1.json',bindings],['data/forging/item-knowledge-v1.json',knowledge]];
for(const [p,data] of outputs){const content=JSON.stringify(data,null,2)+'\n';if(process.argv.includes('--check'))assert.equal(read(p),content,p+' needs regeneration');else{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),content);}}
const mdPath=design+'weapon-forging-formal-items.md';
if(process.argv.includes('--check'))assert.equal(read(mdPath),md,mdPath+' needs regeneration');else fs.writeFileSync(path.join(root,mdPath),md);
console.log(`${process.argv.includes('--check')?'Checked':'Wrote'} 112 schema-v2 item templates, 83 component bindings, 12 processing routes and knowledge policy.`);

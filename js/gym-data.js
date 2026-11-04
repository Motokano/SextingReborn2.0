(function(g){
'use strict';
const axial = new Set(['chest', 'back', 'abdomen', 'neck']);
const pair = (group, ...names) => names.flatMap(n => axial.has(group)
  ? [`${group}_${n}_L`, `${group}_${n}_R`] : [`${group}_l_${n}_l`, `${group}_r_${n}_r`]);
const cat = (...sets) => sets.flat();
const chest = pair('chest', 'pectoralis_major'), tri = pair('upperarm', 'triceps_brachii');
const delt = pair('shoulder', 'deltoid'), serratus = pair('chest', 'serratus_anterior');
const biceps = pair('upperarm', 'biceps_brachii', 'brachialis');
const lats = pair('back', 'latissimus_dorsi', 'teres_major'), rhombs = pair('back', 'rhomboid_major', 'rhomboid_minor');
const grip = pair('forearm', 'flexor_digitorum_superficialis', 'flexor_digitorum_profundus');
const quads = pair('thigh', 'rectus_femoris', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius');
const glutes = pair('hip', 'gluteus_maximus'), hipSide = pair('hip', 'gluteus_medius', 'gluteus_minimus');
const hamstrings = pair('thigh', 'semitendinosus', 'semimembranosus', 'biceps_femoris_long');
const abs = pair('abdomen', 'rectus_abdominis'), obliques = pair('abdomen', 'external_oblique', 'internal_oblique');
const transverse = pair('abdomen', 'transversus_abdominis'), lumbar = pair('abdomen', 'quadratus_lumborum');
const backExt = pair('back', 'iliocostalis', 'longissimus', 'spinalis');
const hipFlex = pair('hip', 'iliacus', 'psoas_major');
const rows = [];
function action(station, id, name, cost, main, assist = [], mainPct = .2, assistPct = .05) {
  rows.push({ station, id, name, cost, ticks: 2, mainPct, assistPct,
    main: [...new Set(main)], assist: [...new Set(assist)].filter(m => !main.includes(m)) });
}
action('floor','pushup','俯卧撑',10,cat(chest,tri),cat(delt,serratus),.18,.04);
action('floor','crunch','卷腹',10,abs,obliques,.2,.04);
action('floor','back_extension','背伸',10,backExt,pair('back','multifidus'),.18,.04);
action('floor','plank','平板支撑',10,transverse,cat(abs,obliques),.18,.04);
action('floor','side_plank','侧桥',10,cat(obliques,lumbar),hipSide,.18,.04);
action('floor','body_squat','自重蹲起',14,cat(quads,glutes),cat(hipSide,transverse),.16,.03);
action('pullup','pullup','引体向上',12,cat(lats,biceps),grip);
action('pullup','inverted_row','反向划船',12,cat(lats,rhombs),cat(biceps,grip),.18,.04);
action('pullup','knee_raise','悬垂举膝',10,hipFlex,cat(abs,grip),.18,.04);
action('dumbbell','curl','哑铃弯举',8,biceps,pair('forearm','brachioradialis'),.25,.05);
action('dumbbell','triceps_extension','哑铃臂屈伸',8,cat(tri,pair('upperarm','anconeus')),delt,.25,.04);
action('dumbbell','front_raise','前平举',8,delt,pair('upperarm','coracobrachialis'),.22,.04);
action('dumbbell','lateral_raise','侧平举',8,delt,pair('shoulder','supraspinatus'),.22,.05);
action('dumbbell','shrug','耸肩',8,pair('back','trapezius'),pair('neck','levator_scapulae'),.22,.05);
action('dumbbell','wrist_curl','屈腕',6,pair('forearm','flexor_carpi_radialis','flexor_carpi_ulnaris','palmaris_longus'),grip,.25,.04);
action('dumbbell','wrist_extension','伸腕',6,pair('forearm','extensor_carpi_radialis_longus','extensor_carpi_radialis_brevis','extensor_carpi_ulnaris'),[],.25);
action('dumbbell','pronation','前臂旋前',6,pair('forearm','pronator_teres','pronator_quadratus'),[],.25);
action('dumbbell','supination','前臂旋后',6,pair('forearm','supinator'),biceps,.25,.04);
action('barbell','bench','杠铃卧推',10,cat(chest,tri),cat(delt,serratus));
action('barbell','squat','杠铃深蹲',14,cat(quads,glutes),cat(hipSide,transverse),.2,.04);
action('barbell','rdl','罗马尼亚硬拉',16,cat(glutes,hamstrings),cat(backExt,grip),.2,.04);
action('barbell','barbell_row','俯身划船',12,cat(lats,rhombs),cat(biceps,grip));
action('cable','pulldown','高位下拉',12,lats,cat(biceps,grip),.22,.05);
action('cable','seated_row','坐姿划船',12,cat(lats,rhombs),biceps,.22,.05);
action('cable','fly','滑轮夹胸',10,chest,delt,.25,.04);
action('cable','shoulder_internal','肩内旋',6,pair('shoulder','subscapularis'),[],.25);
action('cable','shoulder_external','肩外旋',6,pair('shoulder','infraspinatus','teres_minor'),[],.25);
action('cable','cuff_raise','肩袖外展',6,pair('shoulder','supraspinatus'),delt,.25,.04);
action('leg','leg_extension','伸膝',10,quads,[],.25);
action('leg','leg_curl','屈膝',10,cat(hamstrings,pair('thigh','biceps_femoris_short')),pair('calf','gastrocnemius','popliteus'),.25,.04);
action('leg','hip_flexion','屈髋',10,hipFlex,pair('thigh','sartorius','rectus_femoris'),.25,.04);
action('leg','hip_extension','伸髋',10,glutes,hamstrings,.25,.04);
action('leg','hip_abduction','髋外展',10,cat(hipSide,pair('hip','tensor_fasciae_latae')),[],.25);
action('leg','hip_adduction','髋内收',10,pair('thigh','adductor_longus','adductor_brevis','adductor_magnus','gracilis','pectineus'),[],.25);
action('leg','hip_internal','髋内旋',10,cat(hipSide,pair('hip','tensor_fasciae_latae')),[],.2);
action('leg','hip_external','髋外旋',10,pair('hip','piriformis','obturator_internus','obturator_externus','gemellus_superior','gemellus_inferior','quadratus_femoris'),glutes,.2,.04);
action('handsfeet','grip','握力训练',6,grip,pair('hand','flexor_pollicis_brevis','flexor_digiti_minimi_brevis'),.25,.05);
action('handsfeet','pinch','捏力训练',6,pair('hand','adductor_pollicis','flexor_pollicis_brevis'),pair('forearm','flexor_pollicis_longus'),.25,.05);
action('handsfeet','finger_spread','张指训练',6,pair('hand','dorsal_interosseous_1','dorsal_interosseous_2','dorsal_interosseous_3','dorsal_interosseous_4','abductor_pollicis_brevis','abductor_digiti_minimi'),[],.2);
action('handsfeet','opposition','对掌训练',6,pair('hand','opponens_pollicis','opponens_digiti_minimi'),[],.25);
action('handsfeet','calf_raise','提踵',8,pair('calf','gastrocnemius','soleus'),pair('calf','plantaris'),.25,.04);
action('handsfeet','ankle_flexion','踝背屈',8,pair('calf','tibialis_anterior'),pair('calf','extensor_hallucis_longus','extensor_digitorum_longus','peroneus_tertius'),.25,.05);
action('handsfeet','ankle_inversion','踝内翻',8,pair('calf','tibialis_posterior','tibialis_anterior'),[],.25);
action('handsfeet','ankle_eversion','踝外翻',8,pair('calf','peroneus_longus','peroneus_brevis','peroneus_tertius'),[],.25);
action('handsfeet','toe_curl','屈趾',6,pair('foot','flexor_digitorum_brevis','flexor_hallucis_brevis','flexor_digiti_minimi_brevis','quadratus_plantae'),pair('calf','flexor_hallucis_longus','flexor_digitorum_longus'),.22,.04);
action('handsfeet','toe_extension','伸趾',6,pair('foot','extensor_digitorum_brevis','extensor_hallucis_brevis'),pair('calf','extensor_hallucis_longus','extensor_digitorum_longus'),.25,.04);
action('handsfeet','toe_spread','张趾',6,pair('foot','abductor_hallucis','abductor_digiti_minimi','dorsal_interosseous_1','dorsal_interosseous_2','dorsal_interosseous_3','dorsal_interosseous_4'),[],.22);
action('handsfeet','foot_arch','足弓控制',6,pair('foot','lumbrical_1','lumbrical_2','lumbrical_3','lumbrical_4','plantar_interosseous_1','plantar_interosseous_2','plantar_interosseous_3'),pair('foot','adductor_hallucis'),.2,.04);
action('neck','neck_flexion','颈前屈',6,pair('neck','sternocleidomastoid','longus_capitis','longus_colli'),[],.15);
action('neck','neck_extension','颈后伸',6,pair('neck','splenius_capitis','splenius_cervicis'),pair('back','semispinalis_capitis','semispinalis_cervicis'),.15,.03);
action('neck','neck_side','颈侧屈',6,pair('neck','sternocleidomastoid','scalenus_anterior','scalenus_medius','scalenus_posterior'),pair('neck','rectus_capitis_lateralis'),.15,.03);
action('neck','neck_rotation','颈旋转',6,pair('neck','sternocleidomastoid','splenius_capitis','splenius_cervicis'),pair('back','obliquus_capitis_inferior'),.15,.03);

const ACTIONS = rows;
const MATERIALS = { metal:'金属料', wood:'木料', parts:'零件', fiber:'纤维', plates:'配重片组' };
// Construction costs use the existing facility material categories.
const STATIONS = [
  {id:'floor',name:'基础训练区',tag:'自重 · 核心',build:{wood:8,fiber:4}, upgrades:['铺设防滑地面','加固支撑与绑带','配备负重训练组件'],upgradeCosts:[{wood:8,fiber:4},{metal:8,parts:4},{metal:10,fiber:6}]},
  {id:'pullup',name:'单杠训练架',tag:'上拉 · 握持',build:{metal:12,wood:6},upgrades:['加固立柱与固定点','改进握柄与连接件','安装配重挂接组件'],upgradeCosts:[{metal:12,parts:4},{metal:10,fiber:4},{metal:12,plates:2}]},
  {id:'dumbbell',name:'可调哑铃组',tag:'手臂 · 肩部',build:{metal:12,parts:4},upgrades:['增加哑铃配重','强化握柄与锁紧结构','扩充配重与支撑座'],upgradeCosts:[{plates:1},{metal:12,parts:6},{plates:2,wood:8}]},
  {id:'barbell',name:'杠铃训练站',tag:'复合 · 全身',build:{metal:24,wood:12,parts:6,plates:1},upgrades:['加固架体与训练凳','增加可用杠铃片','强化杆体与承重结构'],upgradeCosts:[{metal:16,wood:8},{plates:2},{metal:24,parts:10,plates:2}]},
  {id:'cable',name:'滑轮牵引架',tag:'胸背 · 肩袖',build:{metal:20,parts:12,fiber:8,plates:1},upgrades:['更换滑轮与轴承','改善绳索与导向结构','加固挂架并增加配重'],upgradeCosts:[{metal:8,parts:8},{parts:8,fiber:10},{metal:16,plates:3}]},
  {id:'leg',name:'腿部抗阻架',tag:'大腿 · 髋部',build:{metal:20,wood:10,parts:10,plates:1},upgrades:['加固座椅与固定结构','改进滚垫和连杆','升级阻力与配重组件'],upgradeCosts:[{metal:12,wood:8},{parts:10,fiber:8},{metal:12,plates:3}]},
  {id:'handsfeet',name:'手足专项训练台',tag:'握捏 · 足踝',build:{wood:8,metal:12,parts:8,fiber:4},upgrades:['改进握捏与指部附件','加固踏台和踝部附件','完善各专项阻力组件'],upgradeCosts:[{metal:8,parts:8},{wood:10,parts:6},{metal:12,parts:12}]},
  {id:'neck',name:'颈部训练机',tag:'颈部 · 稳定',build:{metal:12,parts:6,fiber:8},upgrades:['更换压垫与座椅调节件','加固机架与转轴','增加配重与行程调节'],upgradeCosts:[{fiber:10,parts:4},{metal:16,parts:6},{parts:12,fiber:6}]}
];
const EFFICIENCY = [0,1,1.15,1.3,1.5];
// Training-specific fatigue. Ordinary action conversion remains unchanged.
const TRAINING_FATIGUE_PER_STAMINA = 1.5;
const ANATOMY_EFFICIENCY_PER_LEVEL = .02, NUTRITION_EFFICIENCY_BONUS = .1;
function trainingEfficiency(facilityLevel, anatomyLevel, host) {
  const lv=Number(anatomyLevel),anatomy=Number.isFinite(lv)?Math.max(0,Math.floor(lv)):0;
  const B=host?.BuffSystem,tier=host?.Survival?.getNutritionTier();
  // The isolated prototype has no BuffSystem; reuse Survival's canonical tier there.
  const nourished=B?.hasBuffByBuffId
    ? ['survival_nutrition_abundant','survival_nutrition_peak'].some(id=>B.hasBuffByBuffId('player',id))
    : ['abundant','peak'].includes(tier);
  const equipment=EFFICIENCY[facilityLevel]||1,anatomyBonus=anatomy*ANATOMY_EFFICIENCY_PER_LEVEL,nutritionBonus=nourished?NUTRITION_EFFICIENCY_BONUS:0;
  return {equipment,anatomyLevel:anatomy,anatomyBonus,nutritionBonus,multiplier:Math.round(equipment*(1+anatomyBonus+nutritionBonus)*1e6)/1e6};
}

const ENTRANCE_COST=[{id:'tool_repair_hammer',count:1},{id:'wood_plank_soft',count:2},{id:'supply_rope_hemp_short',count:2}];
g.GymData={ACTIONS,STATIONS,MATERIALS,EFFICIENCY,TRAINING_FATIGUE_PER_STAMINA,ENTRANCE_COST,ANATOMY_EFFICIENCY_PER_LEVEL,NUTRITION_EFFICIENCY_BONUS,trainingEfficiency};
})(typeof window!=='undefined'?window:globalThis);

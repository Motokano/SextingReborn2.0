(function(g){
'use strict';
const axial = new Set(['chest', 'back', 'abdomen', 'neck', 'pelvis']);
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
function action(station, id, name, intensity, main, assist, growthPct) {
  rows.push({ station, id, name, intensity, ticks: 2, growthPct,
    main: [...new Set(main)], assist: [...new Set(assist)].filter(m => !main.includes(m)) });
}
action('floor','pushup','俯卧撑','high',cat(chest,tri),cat(delt,serratus),0.88);
action('floor','crunch','卷腹','medium',abs,obliques,0.56);
action('floor','back_extension','背伸','medium',backExt,pair('back','multifidus'),1.16);
action('floor','plank','平板支撑','medium',transverse,cat(abs,obliques),0.6);
action('floor','side_plank','侧桥','medium',cat(obliques,lumbar),hipSide,1.24);
action('floor','body_squat','自重蹲起','high',cat(quads,glutes),cat(hipSide,transverse),1.78);
// Existing aggregate and regional muscle records keep their own saved progress.
// These are explicit gameplay rewards, not a blanket award to a whole muscle group.
action('floor','prone_extension','俯卧胸背伸展','low',pair('back','iliocostalis_lumborum','iliocostalis_thoracis','longissimus_thoracis','spinalis_thoracis','semispinalis_thoracis'),cat(backExt,pair('back','multifidus')),2.04);
action('floor','bird_dog','鸟狗式支撑','medium',pair('back','multifidus','rotatores','intertransversarii','interspinales'),cat(transverse,lumbar),1.56);
action('floor','pelvic_tilt','仰卧骨盆卷动','low',cat(abs,pair('hip','psoas_minor')),transverse,0.78);
action('floor','diaphragmatic_breathing','膈式呼吸','low',['chest_diaphragm'],[],0.15);
action('floor','rib_expansion','胸廓扩张呼吸','low',cat(pair('chest','external_intercostal'),pair('back','levatores_costarum')),pair('back','serratus_posterior_superior'),0.66);
action('floor','controlled_exhalation','控制呼气','low',pair('chest','internal_intercostal','innermost_intercostal','transversus_thoracis'),cat(pair('back','subcostales','serratus_posterior_inferior'),pair('chest','sternalis')),1.08);
action('floor','pelvic_floor_hold','盆底持续收缩','low',cat(pair('pelvis','iliococcygeus','pubococcygeus','puborectalis'),['pelvis_external_anal_sphincter']),pair('pelvis','coccygeus'),1.11);
action('floor','perineal_control','会阴收缩控制','low',pair('pelvis','superficial_transversus_perinei','deep_transversus_perinei','ischiocavernosus','bulbospongiosus'),pair('pelvis','pubococcygeus'),1.26);
action('pullup','pullup','引体向上','high',cat(lats,biceps),grip,1.8);
action('pullup','inverted_row','反向划船','high',cat(lats,rhombs),cat(biceps,grip),1.76);
action('pullup','knee_raise','悬垂举膝','high',hipFlex,cat(abs,grip),0.96);
action('dumbbell','curl','哑铃弯举','medium',biceps,pair('forearm','brachioradialis'),1.1);
action('dumbbell','triceps_extension','哑铃臂屈伸','medium',cat(tri,pair('upperarm','anconeus')),delt,1.08);
action('dumbbell','front_raise','前平举','medium',delt,pair('upperarm','coracobrachialis'),0.52);
action('dumbbell','lateral_raise','侧平举','medium',delt,pair('shoulder','supraspinatus'),0.54);
action('dumbbell','shrug','耸肩','medium',pair('back','trapezius'),pair('neck','levator_scapulae'),0.54);
action('dumbbell','wrist_curl','屈腕','medium',pair('forearm','flexor_carpi_radialis','flexor_carpi_ulnaris','palmaris_longus'),grip,1.66);
action('dumbbell','wrist_extension','伸腕','medium',pair('forearm','extensor_carpi_radialis_longus','extensor_carpi_radialis_brevis','extensor_carpi_ulnaris'),[],1.5);
action('dumbbell','pronation','前臂旋前','medium',pair('forearm','pronator_teres','pronator_quadratus'),[],1);
action('dumbbell','supination','前臂旋后','medium',pair('forearm','supinator'),biceps,0.66);
action('barbell','bench','杠铃卧推','high',cat(chest,tri),cat(delt,serratus),1);
action('barbell','squat','杠铃深蹲','high',cat(quads,glutes),cat(hipSide,transverse),2.24);
action('barbell','rdl','罗马尼亚硬拉','high',cat(glutes,hamstrings),cat(backExt,grip),2);
action('barbell','barbell_row','俯身划船','high',cat(lats,rhombs),cat(biceps,grip),2);
action('cable','pulldown','高位下拉','high',lats,cat(biceps,grip),1.28);
action('cable','seated_row','坐姿划船','high',cat(lats,rhombs),biceps,1.96);
action('cable','fly','滑轮夹胸','medium',chest,delt,0.58);
action('cable','shoulder_internal','肩内旋','medium',pair('shoulder','subscapularis'),[],0.5);
action('cable','shoulder_external','肩外旋','medium',pair('shoulder','infraspinatus','teres_minor'),[],1);
action('cable','cuff_raise','肩袖外展','medium',pair('shoulder','supraspinatus'),delt,0.58);
action('cable','scapular_depression','肩胛下压','medium',pair('chest','pectoralis_minor'),cat(pair('chest','subclavius'),serratus),0.56);
action('leg','leg_extension','伸膝','medium',quads,[],2);
action('leg','leg_curl','屈膝','medium',cat(hamstrings,pair('thigh','biceps_femoris_short')),pair('calf','gastrocnemius','popliteus'),2.16);
action('leg','hip_flexion','屈髋','medium',hipFlex,pair('thigh','sartorius','rectus_femoris'),1.16);
action('leg','hip_extension','伸髋','medium',glutes,hamstrings,0.74);
action('leg','hip_abduction','髋外展','medium',cat(hipSide,pair('hip','tensor_fasciae_latae')),[],1.5);
action('leg','hip_adduction','髋内收','medium',pair('thigh','adductor_longus','adductor_brevis','adductor_magnus','gracilis','pectineus'),[],2.5);
action('leg','hip_internal','髋内旋','medium',cat(hipSide,pair('hip','tensor_fasciae_latae')),[],1.2);
action('leg','hip_external','髋外旋','medium',pair('hip','piriformis','obturator_internus','obturator_externus','gemellus_superior','gemellus_inferior','quadratus_femoris'),glutes,2.48);
action('handsfeet','grip','握力训练','medium',grip,pair('hand','flexor_pollicis_brevis','flexor_digiti_minimi_brevis'),1.2);
action('handsfeet','pinch','捏力训练','medium',pair('hand','adductor_pollicis','flexor_pollicis_brevis'),pair('forearm','flexor_pollicis_longus'),1.1);
action('handsfeet','finger_spread','张指训练','low',pair('hand','dorsal_interosseous_1','dorsal_interosseous_2','dorsal_interosseous_3','dorsal_interosseous_4','abductor_pollicis_brevis','abductor_digiti_minimi'),[],2.4);
action('handsfeet','opposition','对掌训练','low',pair('hand','opponens_pollicis','opponens_digiti_minimi'),[],1);
action('handsfeet','finger_extension','抗阻伸指','medium',pair('forearm','extensor_digitorum','extensor_digiti_minimi','extensor_indicis'),[],1.32);
action('handsfeet','thumb_extension','抗阻伸拇','medium',pair('forearm','extensor_pollicis_brevis','extensor_pollicis_longus'),[],0.88);
action('handsfeet','thumb_abduction','抗阻拇外展','medium',pair('forearm','abductor_pollicis_longus'),pair('hand','abductor_pollicis_brevis'),0.52);
action('handsfeet','finger_adduction','并指夹持','medium',pair('hand','palmar_interosseous_1','palmar_interosseous_2','palmar_interosseous_3'),[],1.2);
action('handsfeet','intrinsic_grip','指根屈伸','low',pair('hand','lumbrical_1','lumbrical_2','lumbrical_3','lumbrical_4'),pair('hand','dorsal_interosseous_1','dorsal_interosseous_2','dorsal_interosseous_3','dorsal_interosseous_4'),1.92);
action('handsfeet','palm_cup','掌缘收拢','low',pair('hand','palmaris_brevis'),pair('hand','opponens_digiti_minimi','flexor_digiti_minimi_brevis'),0.56);
action('handsfeet','calf_raise','提踵','medium',pair('calf','gastrocnemius','soleus'),pair('calf','plantaris'),1.08);
action('handsfeet','ankle_flexion','踝背屈','medium',pair('calf','tibialis_anterior'),pair('calf','extensor_hallucis_longus','extensor_digitorum_longus','peroneus_tertius'),0.8);
action('handsfeet','ankle_inversion','踝内翻','medium',pair('calf','tibialis_posterior','tibialis_anterior'),[],1);
action('handsfeet','ankle_eversion','踝外翻','medium',pair('calf','peroneus_longus','peroneus_brevis','peroneus_tertius'),[],1.5);
action('handsfeet','toe_curl','屈趾','low',pair('foot','flexor_digitorum_brevis','flexor_hallucis_brevis','flexor_digiti_minimi_brevis','quadratus_plantae'),pair('calf','flexor_hallucis_longus','flexor_digitorum_longus'),1.92);
action('handsfeet','toe_extension','伸趾','low',pair('foot','extensor_digitorum_brevis','extensor_hallucis_brevis'),pair('calf','extensor_hallucis_longus','extensor_digitorum_longus'),1.16);
action('handsfeet','toe_spread','张趾','low',pair('foot','abductor_hallucis','abductor_digiti_minimi','dorsal_interosseous_1','dorsal_interosseous_2','dorsal_interosseous_3','dorsal_interosseous_4'),[],2.64);
action('handsfeet','foot_arch','足弓控制','low',pair('foot','lumbrical_1','lumbrical_2','lumbrical_3','lumbrical_4','plantar_interosseous_1','plantar_interosseous_2','plantar_interosseous_3'),pair('foot','adductor_hallucis'),2.88);
action('neck','neck_flexion','颈前屈','medium',pair('neck','sternocleidomastoid','longus_capitis','longus_colli'),[],0.9);
action('neck','neck_extension','颈后伸','medium',pair('neck','splenius_capitis','splenius_cervicis'),pair('back','semispinalis_capitis','semispinalis_cervicis'),0.72);
action('neck','neck_side','颈侧屈','medium',pair('neck','sternocleidomastoid','scalenus_anterior','scalenus_medius','scalenus_posterior'),pair('neck','rectus_capitis_lateralis'),1.26);
action('neck','neck_rotation','颈旋转','medium',pair('neck','sternocleidomastoid','splenius_capitis','splenius_cervicis'),pair('back','obliquus_capitis_inferior'),0.96);
action('neck','chin_tuck','颈部收颌','low',pair('neck','rectus_capitis_anterior','longus_capitis','longus_colli'),[],0.9);
action('neck','cervical_extension','颈段伸展','medium',pair('back','iliocostalis_cervicis','longissimus_capitis','longissimus_cervicis','spinalis_capitis','spinalis_cervicis'),pair('back','semispinalis_capitis','semispinalis_cervicis'),1.62);
action('neck','suboccipital_stability','枕下稳定','low',pair('back','rectus_capitis_posterior_major','rectus_capitis_posterior_minor','obliquus_capitis_superior'),pair('back','obliquus_capitis_inferior'),0.96);
// Functional exercises use the station's seat/support, without adding loaded throat equipment.
action('neck','chin_resistance','下颌抗阻','medium',pair('neck','digastric','stylohyoid','mylohyoid','geniohyoid'),pair('neck','platysma'),1.26);
action('neck','hyoid_control','舌骨升降控制','low',pair('neck','sternohyoid','sternothyroid','thyrohyoid','omohyoid'),[],1.2);
action('neck','pitch_glide','滑音练习','low',pair('neck','cricothyroid','thyroarytenoid','vocalis'),[],0.9);
action('neck','vocal_onset','轻声起音','low',cat(pair('neck','lateral_cricoarytenoid','oblique_arytenoid'),['neck_transverse_arytenoid']),pair('neck','vocalis'),0.81);
action('neck','airway_control','呼吸与吞咽协调','low',pair('neck','posterior_cricoarytenoid','aryepiglotticus'),[],0.6);

const moduleActions = {
  hands:['grip','pinch','finger_spread','opposition','finger_extension','thumb_extension','thumb_abduction','finger_adduction','intrinsic_grip','palm_cup'],
  ankle:['calf_raise','ankle_flexion','ankle_inversion','ankle_eversion'],
  toes:['toe_curl','toe_extension','toe_spread','foot_arch']
};
for (const a of rows.filter(a=>a.station==='handsfeet')) {
  a.module=Object.keys(moduleActions).find(key=>moduleActions[key].includes(a.id));
  if(!a.module)throw Error('Missing gym upgrade module: '+a.id);
}
function moduleKey(a) { return a.station==='handsfeet'?'handsfeet_'+a.module:a.station; }

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

// Growth is a shared pool in percentage points, not a reward per target.
// Integer micro-percent units keep the sum exact through rounding and overflow.
const GROWTH_SCALE=1000000;
function growthTargets(a) {
  return [...a.main.map(id=>({id,role:'主练'})),...a.assist.map(id=>({id,role:'辅助'}))];
}
function growthRoom(id,progress) {
  return Math.max(0,100*GROWTH_SCALE-Math.round(Math.max(0,Math.min(100,Number(progress(id))||0))*GROWTH_SCALE));
}
function growthTotal(a,multiplier,fatigue,progress) {
  const room=growthTargets(a).reduce((sum,r)=>sum+growthRoom(r.id,progress),0);
  return Math.min(room,Math.max(0,Math.round(a.growthPct*multiplier*fatigue*GROWTH_SCALE)))/GROWTH_SCALE;
}
function distributeGrowth(a,total,progress,random=Math.random) {
  if(!Number.isFinite(total)||total<0)throw Error('Invalid gym growth pool');
  const rows=growthTargets(a).map(r=>({...r,room:growthRoom(r.id,progress),units:0,weight:0}));
  let active=rows.filter(r=>r.room>0),remaining=Math.min(Math.round(total*GROWTH_SCALE),active.reduce((sum,r)=>sum+r.room,0));
  if(remaining>0)for(const row of active){
    const weight=random();if(!Number.isFinite(weight)||weight<0||weight>1)throw Error('Invalid gym growth roll');
    row.weight=weight;
  }
  while(remaining>0&&active.length){
    const sum=active.reduce((n,r)=>n+r.weight,0),weight=r=>sum?r.weight:1,denominator=sum||active.length;
    const capped=active.filter(r=>remaining*weight(r)/denominator>=r.room);
    if(capped.length){
      for(const row of capped){row.units=row.room;remaining-=row.room;}
      active=active.filter(r=>!capped.includes(r));continue;
    }
    for(const row of active){
      const share=remaining*weight(row)/denominator;row.units=Math.floor(share);row.remainder=share-row.units;
    }
    const rest=remaining-active.reduce((sum,r)=>sum+r.units,0);
    active.sort((a,b)=>b.remainder-a.remainder);
    for(let i=0;i<rest;i++)active[i].units++;
    remaining=0;
  }
  return rows.map(({id,role,units})=>({id,role,pct:units/GROWTH_SCALE}));
}

const ENTRANCE_COST=[{id:'tool_repair_hammer',count:1},{id:'wood_plank_soft',count:2},{id:'supply_rope_hemp_short',count:2}];
g.GymData={ACTIONS,STATIONS,MATERIALS,EFFICIENCY,TRAINING_FATIGUE_PER_STAMINA,ENTRANCE_COST,ANATOMY_EFFICIENCY_PER_LEVEL,NUTRITION_EFFICIENCY_BONUS,trainingEfficiency,moduleKey,growthTargets,growthTotal,distributeGrowth};
})(typeof window!=='undefined'?window:globalThis);

/**
 * 生成 data/muscles.json（全量肌肉数据，见 34-muscle-system-rework.md）。
 * 用法：node tools/build_muscles.js
 *
 * 结构：22 肌群（6 中轴 + 16 侧）× 肌肉条目。
 * - 侧群（shoulder/upperarm/forearm/hand/hip/thigh/calf/foot）：清单写「单侧肌肉」，脚本展开 L/R。
 * - 中轴群（head/neck/back/chest/abdomen/pelvis）：清单写「成对肌肉」自动左右各一条（id 带 L/R），
 *   少数正中单条肌肉用 single:true 只生成一条。
 * - 效果：按肌群模板（TPL）分配，个别肌肉可覆盖。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const groups = [
    { id: 'head', name: '头', icon: '🗣️', type: 'axial', limb: null },
    { id: 'neck', name: '颈', icon: '🦒', type: 'axial', limb: null },
    { id: 'back', name: '背', icon: '🏔️', type: 'axial', limb: null },
    { id: 'chest', name: '胸', icon: '🫁', type: 'axial', limb: null },
    { id: 'abdomen', name: '腹', icon: '🔥', type: 'axial', limb: null },
    { id: 'pelvis', name: '盆底会阴', icon: '🔻', type: 'axial', limb: null },
    { id: 'shoulder_l', name: '左肩带', icon: '🫳', type: 'side', side: 'L', limb: 'lhand' },
    { id: 'shoulder_r', name: '右肩带', icon: '🫴', type: 'side', side: 'R', limb: 'rhand' },
    { id: 'upperarm_l', name: '左上臂', icon: '💪', type: 'side', side: 'L', limb: 'lhand' },
    { id: 'upperarm_r', name: '右上臂', icon: '💪', type: 'side', side: 'R', limb: 'rhand' },
    { id: 'forearm_l', name: '左前臂', icon: '🦾', type: 'side', side: 'L', limb: 'lhand' },
    { id: 'forearm_r', name: '右前臂', icon: '🦾', type: 'side', side: 'R', limb: 'rhand' },
    { id: 'hand_l', name: '左手', icon: '✋', type: 'side', side: 'L', limb: 'lhand' },
    { id: 'hand_r', name: '右手', icon: '✋', type: 'side', side: 'R', limb: 'rhand' },
    { id: 'hip_l', name: '左髋', icon: '🦵', type: 'side', side: 'L', limb: 'lfoot' },
    { id: 'hip_r', name: '右髋', icon: '🦵', type: 'side', side: 'R', limb: 'rfoot' },
    { id: 'thigh_l', name: '左大腿', icon: '🍗', type: 'side', side: 'L', limb: 'lfoot' },
    { id: 'thigh_r', name: '右大腿', icon: '🍗', type: 'side', side: 'R', limb: 'rfoot' },
    { id: 'calf_l', name: '左小腿', icon: '🦶', type: 'side', side: 'L', limb: 'lfoot' },
    { id: 'calf_r', name: '右小腿', icon: '🦶', type: 'side', side: 'R', limb: 'rfoot' },
    { id: 'foot_l', name: '左脚', icon: '👣', type: 'side', side: 'L', limb: 'lfoot' },
    { id: 'foot_r', name: '右脚', icon: '👣', type: 'side', side: 'R', limb: 'rfoot' }
];

// 各群默认效果模板（四维均衡：肌肉不奖励专注，见 34-muscle-system-rework.md §2.3）
// 每块肌肉 1 点为主；胸（呼吸肌群 18 块）与盆底（17 块）×2 呼吸用于调平四维总量。
// 全量点满后：筋骨 128 / 身手 126 / 呼吸 125 / 柔韧 133（±4%），专注恒为 0。
const TPL = {
    head: [{ type: 'flexibility', delta: 1 }],
    neck: [{ type: 'breath', delta: 1 }],
    back: [{ type: 'jingu', delta: 1 }],
    chest: [{ type: 'breath', delta: 2 }],
    abdomen: [{ type: 'flexibility', delta: 1 }],
    pelvis: [{ type: 'breath', delta: 2 }],
    shoulder: [{ type: 'dexterity', delta: 1 }],
    upperarm: [{ type: 'jingu', delta: 1 }],
    forearm: [{ type: 'dexterity', delta: 1 }],
    hand: [{ type: 'dexterity', delta: 1 }],
    hip: [{ type: 'jingu', delta: 1 }],
    thigh: [{ type: 'jingu', delta: 1 }],
    calf: [{ type: 'flexibility', delta: 1 }],
    foot: [{ type: 'dexterity', delta: 1 }]
};

// 肌肉清单：{ group, cn, en, single?, effects? }
// 侧群 group 用基础名（shoulder/upperarm/...），脚本展开 _l/_r
const MUSCLES = [
    // ===== 头（成对，正中单条见 single）=====
    { group: 'head', cn: '额肌', en: 'frontalis' },
    { group: 'head', cn: '枕肌', en: 'occipitalis' },
    { group: 'head', cn: '眼轮匝肌', en: 'orbicularis_oculi' },
    { group: 'head', cn: '皱眉肌', en: 'corrugator_supercilii' },
    { group: 'head', cn: '降眉肌', en: 'depressor_supercilii' },
    { group: 'head', cn: '鼻肌', en: 'nasalis' },
    { group: 'head', cn: '提上唇鼻翼肌', en: 'levator_labii_alaque_nasi' },
    { group: 'head', cn: '提上唇肌', en: 'levator_labii_superioris' },
    { group: 'head', cn: '颧小肌', en: 'zygomaticus_minor' },
    { group: 'head', cn: '颧大肌', en: 'zygomaticus_major' },
    { group: 'head', cn: '提口角肌', en: 'levator_anguli_oris' },
    { group: 'head', cn: '笑肌', en: 'risorius' },
    { group: 'head', cn: '降口角肌', en: 'depressor_anguli_oris' },
    { group: 'head', cn: '降下唇肌', en: 'depressor_labii_inferioris' },
    { group: 'head', cn: '颏肌', en: 'mentalis' },
    { group: 'head', cn: '颊肌', en: 'buccinator' },
    { group: 'head', cn: '口轮匝肌', en: 'orbicularis_oris' },
    { group: 'head', cn: '咬肌', en: 'masseter' },
    { group: 'head', cn: '颞肌', en: 'temporalis' },
    { group: 'head', cn: '翼内肌', en: 'medial_pterygoid' },
    { group: 'head', cn: '翼外肌', en: 'lateral_pterygoid' },

    // ===== 颈 =====
    { group: 'neck', cn: '颈阔肌', en: 'platysma' },
    { group: 'neck', cn: '胸锁乳突肌', en: 'sternocleidomastoid' },
    { group: 'neck', cn: '前斜角肌', en: 'scalenus_anterior' },
    { group: 'neck', cn: '中斜角肌', en: 'scalenus_medius' },
    { group: 'neck', cn: '后斜角肌', en: 'scalenus_posterior' },
    { group: 'neck', cn: '二腹肌', en: 'digastric' },
    { group: 'neck', cn: '茎突舌骨肌', en: 'stylohyoid' },
    { group: 'neck', cn: '下颌舌骨肌', en: 'mylohyoid' },
    { group: 'neck', cn: '颏舌骨肌', en: 'geniohyoid' },
    { group: 'neck', cn: '胸骨舌骨肌', en: 'sternohyoid' },
    { group: 'neck', cn: '胸骨甲状肌', en: 'sternothyroid' },
    { group: 'neck', cn: '甲状舌骨肌', en: 'thyrohyoid' },
    { group: 'neck', cn: '肩胛舌骨肌', en: 'omohyoid' },
    { group: 'neck', cn: '肩胛提肌', en: 'levator_scapulae' },
    { group: 'neck', cn: '头夹肌', en: 'splenius_capitis' },
    { group: 'neck', cn: '颈夹肌', en: 'splenius_cervicis' },

    // ===== 背 =====
    { group: 'back', cn: '斜方肌', en: 'trapezius' },
    { group: 'back', cn: '背阔肌', en: 'latissimus_dorsi' },
    { group: 'back', cn: '大圆肌', en: 'teres_major' },
    { group: 'back', cn: '小菱形肌', en: 'rhomboid_minor' },
    { group: 'back', cn: '大菱形肌', en: 'rhomboid_major' },
    { group: 'back', cn: '上后锯肌', en: 'serratus_posterior_superior' },
    { group: 'back', cn: '下后锯肌', en: 'serratus_posterior_inferior' },
    { group: 'back', cn: '髂肋肌', en: 'iliocostalis' },
    { group: 'back', cn: '最长肌', en: 'longissimus' },
    { group: 'back', cn: '棘肌', en: 'spinalis' },
    { group: 'back', cn: '头半棘肌', en: 'semispinalis_capitis' },
    { group: 'back', cn: '颈半棘肌', en: 'semispinalis_cervicis' },
    { group: 'back', cn: '胸半棘肌', en: 'semispinalis_thoracis' },
    { group: 'back', cn: '多裂肌', en: 'multifidus' },
    { group: 'back', cn: '回旋肌', en: 'rotatores' },

    // ===== 胸 =====
    { group: 'chest', cn: '胸大肌', en: 'pectoralis_major' },
    { group: 'chest', cn: '胸小肌', en: 'pectoralis_minor' },
    { group: 'chest', cn: '锁骨下肌', en: 'subclavius' },
    { group: 'chest', cn: '前锯肌', en: 'serratus_anterior' },
    { group: 'chest', cn: '肋间外肌', en: 'external_intercostal' },
    { group: 'chest', cn: '肋间内肌', en: 'internal_intercostal' },
    { group: 'chest', cn: '肋间最内肌', en: 'innermost_intercostal' },
    { group: 'chest', cn: '胸横肌', en: 'transversus_thoracis' },
    { group: 'chest', cn: '膈肌', en: 'diaphragm', single: true, effects: [{ type: 'maxQi', delta: 10 }] },

    // ===== 腹 =====
    { group: 'abdomen', cn: '腹直肌', en: 'rectus_abdominis' },
    { group: 'abdomen', cn: '腹外斜肌', en: 'external_oblique' },
    { group: 'abdomen', cn: '腹内斜肌', en: 'internal_oblique' },
    { group: 'abdomen', cn: '腹横肌', en: 'transversus_abdominis' },
    { group: 'abdomen', cn: '腰方肌', en: 'quadratus_lumborum' },

    // ===== 盆底会阴 =====
    { group: 'pelvis', cn: '会阴浅横肌', en: 'superficial_transversus_perinei' },
    { group: 'pelvis', cn: '会阴深横肌', en: 'deep_transversus_perinei' },
    { group: 'pelvis', cn: '坐骨海绵体肌', en: 'ischiocavernosus' },
    { group: 'pelvis', cn: '球海绵体肌', en: 'bulbospongiosus' },
    { group: 'pelvis', cn: '髂尾肌', en: 'iliococcygeus' },
    { group: 'pelvis', cn: '耻尾肌', en: 'pubococcygeus' },
    { group: 'pelvis', cn: '耻骨直肠肌', en: 'puborectalis' },
    { group: 'pelvis', cn: '尾骨肌', en: 'coccygeus' },

    // ===== 肩带（侧群，展开左右）=====
    { group: 'shoulder', cn: '三角肌', en: 'deltoid' },
    { group: 'shoulder', cn: '冈上肌', en: 'supraspinatus' },
    { group: 'shoulder', cn: '冈下肌', en: 'infraspinatus' },
    { group: 'shoulder', cn: '小圆肌', en: 'teres_minor' },
    { group: 'shoulder', cn: '肩胛下肌', en: 'subscapularis' },

    // ===== 上臂（侧群）=====
    { group: 'upperarm', cn: '肱二头肌', en: 'biceps_brachii' },
    { group: 'upperarm', cn: '肱肌', en: 'brachialis' },
    { group: 'upperarm', cn: '喙肱肌', en: 'coracobrachialis' },
    { group: 'upperarm', cn: '肱三头肌', en: 'triceps_brachii' },
    { group: 'upperarm', cn: '肘肌', en: 'anconeus' },

    // ===== 前臂（侧群）=====
    { group: 'forearm', cn: '旋前圆肌', en: 'pronator_teres' },
    { group: 'forearm', cn: '桡侧腕屈肌', en: 'flexor_carpi_radialis' },
    { group: 'forearm', cn: '掌长肌', en: 'palmaris_longus' },
    { group: 'forearm', cn: '尺侧腕屈肌', en: 'flexor_carpi_ulnaris' },
    { group: 'forearm', cn: '指浅屈肌', en: 'flexor_digitorum_superficialis' },
    { group: 'forearm', cn: '指深屈肌', en: 'flexor_digitorum_profundus' },
    { group: 'forearm', cn: '拇长屈肌', en: 'flexor_pollicis_longus' },
    { group: 'forearm', cn: '旋前方肌', en: 'pronator_quadratus' },
    { group: 'forearm', cn: '肱桡肌', en: 'brachioradialis' },
    { group: 'forearm', cn: '桡侧腕长伸肌', en: 'extensor_carpi_radialis_longus' },
    { group: 'forearm', cn: '桡侧腕短伸肌', en: 'extensor_carpi_radialis_brevis' },
    { group: 'forearm', cn: '指伸肌', en: 'extensor_digitorum' },
    { group: 'forearm', cn: '小指伸肌', en: 'extensor_digiti_minimi' },
    { group: 'forearm', cn: '尺侧腕伸肌', en: 'extensor_carpi_ulnaris' },
    { group: 'forearm', cn: '旋后肌', en: 'supinator' },
    { group: 'forearm', cn: '拇长展肌', en: 'abductor_pollicis_longus' },
    { group: 'forearm', cn: '拇短伸肌', en: 'extensor_pollicis_brevis' },
    { group: 'forearm', cn: '拇长伸肌', en: 'extensor_pollicis_longus' },
    { group: 'forearm', cn: '示指伸肌', en: 'extensor_indicis' },

    // ===== 手（侧群）=====
    { group: 'hand', cn: '拇短展肌', en: 'abductor_pollicis_brevis' },
    { group: 'hand', cn: '拇短屈肌', en: 'flexor_pollicis_brevis' },
    { group: 'hand', cn: '拇对掌肌', en: 'opponens_pollicis' },
    { group: 'hand', cn: '拇收肌', en: 'adductor_pollicis' },
    { group: 'hand', cn: '小指展肌', en: 'abductor_digiti_minimi' },
    { group: 'hand', cn: '小指短屈肌', en: 'flexor_digiti_minimi_brevis' },
    { group: 'hand', cn: '小指对掌肌', en: 'opponens_digiti_minimi' },
    { group: 'hand', cn: '掌短肌', en: 'palmaris_brevis' },
    { group: 'hand', cn: '第一蚓状肌', en: 'lumbrical_1' },
    { group: 'hand', cn: '第二蚓状肌', en: 'lumbrical_2' },
    { group: 'hand', cn: '第三蚓状肌', en: 'lumbrical_3' },
    { group: 'hand', cn: '第四蚓状肌', en: 'lumbrical_4' },
    { group: 'hand', cn: '第一骨间背侧肌', en: 'dorsal_interosseous_1' },
    { group: 'hand', cn: '第二骨间背侧肌', en: 'dorsal_interosseous_2' },
    { group: 'hand', cn: '第三骨间背侧肌', en: 'dorsal_interosseous_3' },
    { group: 'hand', cn: '第四骨间背侧肌', en: 'dorsal_interosseous_4' },
    { group: 'hand', cn: '第一骨间掌侧肌', en: 'palmar_interosseous_1' },
    { group: 'hand', cn: '第二骨间掌侧肌', en: 'palmar_interosseous_2' },
    { group: 'hand', cn: '第三骨间掌侧肌', en: 'palmar_interosseous_3' },

    // ===== 髋（侧群）=====
    { group: 'hip', cn: '臀大肌', en: 'gluteus_maximus' },
    { group: 'hip', cn: '臀中肌', en: 'gluteus_medius' },
    { group: 'hip', cn: '臀小肌', en: 'gluteus_minimus' },
    { group: 'hip', cn: '阔筋膜张肌', en: 'tensor_fasciae_latae' },
    { group: 'hip', cn: '梨状肌', en: 'piriformis' },
    { group: 'hip', cn: '闭孔内肌', en: 'obturator_internus' },
    { group: 'hip', cn: '上孖肌', en: 'gemellus_superior' },
    { group: 'hip', cn: '下孖肌', en: 'gemellus_inferior' },
    { group: 'hip', cn: '股方肌', en: 'quadratus_femoris' },
    { group: 'hip', cn: '闭孔外肌', en: 'obturator_externus' },
    { group: 'hip', cn: '髂肌', en: 'iliacus' },
    { group: 'hip', cn: '腰大肌', en: 'psoas_major' },
    { group: 'hip', cn: '腰小肌', en: 'psoas_minor' },

    // ===== 大腿（侧群）=====
    { group: 'thigh', cn: '股直肌', en: 'rectus_femoris' },
    { group: 'thigh', cn: '股外侧肌', en: 'vastus_lateralis' },
    { group: 'thigh', cn: '股内侧肌', en: 'vastus_medialis' },
    { group: 'thigh', cn: '股中间肌', en: 'vastus_intermedius' },
    { group: 'thigh', cn: '缝匠肌', en: 'sartorius' },
    { group: 'thigh', cn: '半腱肌', en: 'semitendinosus' },
    { group: 'thigh', cn: '半膜肌', en: 'semimembranosus' },
    { group: 'thigh', cn: '股二头肌长头', en: 'biceps_femoris_long' },
    { group: 'thigh', cn: '股二头肌短头', en: 'biceps_femoris_short' },
    { group: 'thigh', cn: '长收肌', en: 'adductor_longus' },
    { group: 'thigh', cn: '短收肌', en: 'adductor_brevis' },
    { group: 'thigh', cn: '大收肌', en: 'adductor_magnus' },
    { group: 'thigh', cn: '股薄肌', en: 'gracilis' },
    { group: 'thigh', cn: '耻骨肌', en: 'pectineus' },

    // ===== 小腿（侧群）=====
    { group: 'calf', cn: '胫骨前肌', en: 'tibialis_anterior' },
    { group: 'calf', cn: '拇长伸肌', en: 'extensor_hallucis_longus' },
    { group: 'calf', cn: '趾长伸肌', en: 'extensor_digitorum_longus' },
    { group: 'calf', cn: '第三腓骨肌', en: 'peroneus_tertius' },
    { group: 'calf', cn: '腓骨长肌', en: 'peroneus_longus' },
    { group: 'calf', cn: '腓骨短肌', en: 'peroneus_brevis' },
    { group: 'calf', cn: '腓肠肌', en: 'gastrocnemius' },
    { group: 'calf', cn: '比目鱼肌', en: 'soleus' },
    { group: 'calf', cn: '跖肌', en: 'plantaris' },
    { group: 'calf', cn: '腘肌', en: 'popliteus' },
    { group: 'calf', cn: '胫骨后肌', en: 'tibialis_posterior' },
    { group: 'calf', cn: '拇长屈肌', en: 'flexor_hallucis_longus' },
    { group: 'calf', cn: '趾长屈肌', en: 'flexor_digitorum_longus' },

    // ===== 足（侧群）=====
    { group: 'foot', cn: '趾短伸肌', en: 'extensor_digitorum_brevis' },
    { group: 'foot', cn: '拇短伸肌', en: 'extensor_hallucis_brevis' },
    { group: 'foot', cn: '拇展肌', en: 'abductor_hallucis' },
    { group: 'foot', cn: '拇短屈肌', en: 'flexor_hallucis_brevis' },
    { group: 'foot', cn: '拇收肌', en: 'adductor_hallucis' },
    { group: 'foot', cn: '小趾展肌', en: 'abductor_digiti_minimi' },
    { group: 'foot', cn: '小趾短屈肌', en: 'flexor_digiti_minimi_brevis' },
    { group: 'foot', cn: '趾短屈肌', en: 'flexor_digitorum_brevis' },
    { group: 'foot', cn: '足底方肌', en: 'quadratus_plantae' },
    { group: 'foot', cn: '第一足蚓状肌', en: 'lumbrical_1' },
    { group: 'foot', cn: '第二足蚓状肌', en: 'lumbrical_2' },
    { group: 'foot', cn: '第三足蚓状肌', en: 'lumbrical_3' },
    { group: 'foot', cn: '第四足蚓状肌', en: 'lumbrical_4' },
    { group: 'foot', cn: '第一足底骨间肌', en: 'plantar_interosseous_1' },
    { group: 'foot', cn: '第二足底骨间肌', en: 'plantar_interosseous_2' },
    { group: 'foot', cn: '第三足底骨间肌', en: 'plantar_interosseous_3' },
    { group: 'foot', cn: '第一足背骨间肌', en: 'dorsal_interosseous_1' },
    { group: 'foot', cn: '第二足背骨间肌', en: 'dorsal_interosseous_2' },
    { group: 'foot', cn: '第三足背骨间肌', en: 'dorsal_interosseous_3' },
    { group: 'foot', cn: '第四足背骨间肌', en: 'dorsal_interosseous_4' },

    // ===== 补充：眼外肌 / 耳肌 / 舌咽腭肌（头）=====
    { group: 'head', cn: '上睑提肌', en: 'levator_palpebrae_superioris' },
    { group: 'head', cn: '上直肌', en: 'superior_rectus' },
    { group: 'head', cn: '下直肌', en: 'inferior_rectus' },
    { group: 'head', cn: '内直肌', en: 'medial_rectus' },
    { group: 'head', cn: '外直肌', en: 'lateral_rectus' },
    { group: 'head', cn: '上斜肌', en: 'superior_oblique' },
    { group: 'head', cn: '下斜肌', en: 'inferior_oblique' },
    { group: 'head', cn: '耳前肌', en: 'auricularis_anterior' },
    { group: 'head', cn: '耳上肌', en: 'auricularis_superior' },
    { group: 'head', cn: '耳后肌', en: 'auricularis_posterior' },
    { group: 'head', cn: '颏舌肌', en: 'genioglossus' },
    { group: 'head', cn: '舌骨舌肌', en: 'hyoglossus' },
    { group: 'head', cn: '茎突舌肌', en: 'styloglossus' },
    { group: 'head', cn: '腭帆张肌', en: 'tensor_veli_palatini' },
    { group: 'head', cn: '腭帆提肌', en: 'levator_veli_palatini' },
    { group: 'head', cn: '腭舌肌', en: 'palatoglossus' },
    { group: 'head', cn: '腭咽肌', en: 'palatopharyngeus' },
    { group: 'head', cn: '悬雍垂肌', en: 'musculus_uvulae', single: true },
    { group: 'head', cn: '咽上缩肌', en: 'superior_pharyngeal_constrictor' },
    { group: 'head', cn: '咽中缩肌', en: 'middle_pharyngeal_constrictor' },
    { group: 'head', cn: '咽下缩肌', en: 'inferior_pharyngeal_constrictor' },
    { group: 'head', cn: '茎突咽肌', en: 'stylopharyngeus' },
    { group: 'head', cn: '咽鼓管咽肌', en: 'salpingopharyngeus' },

    // ===== 补充：深层颈肌 =====
    { group: 'neck', cn: '头长肌', en: 'longus_capitis' },
    { group: 'neck', cn: '颈长肌', en: 'longus_colli' },
    { group: 'neck', cn: '头前直肌', en: 'rectus_capitis_anterior' },
    { group: 'neck', cn: '头侧直肌', en: 'rectus_capitis_lateralis' },

    // ===== 补充：枕下肌与深层背肌 =====
    { group: 'back', cn: '头后大直肌', en: 'rectus_capitis_posterior_major' },
    { group: 'back', cn: '头后小直肌', en: 'rectus_capitis_posterior_minor' },
    { group: 'back', cn: '头上斜肌', en: 'obliquus_capitis_superior' },
    { group: 'back', cn: '头下斜肌', en: 'obliquus_capitis_inferior' },
    { group: 'back', cn: '横突间肌', en: 'intertransversarii' },
    { group: 'back', cn: '棘间肌', en: 'interspinales' },
    { group: 'back', cn: '腰髂肋肌', en: 'iliocostalis_lumborum' },
    { group: 'back', cn: '胸髂肋肌', en: 'iliocostalis_thoracis' },
    { group: 'back', cn: '颈髂肋肌', en: 'iliocostalis_cervicis' },
    { group: 'back', cn: '头最长肌', en: 'longissimus_capitis' },
    { group: 'back', cn: '颈最长肌', en: 'longissimus_cervicis' },
    { group: 'back', cn: '胸最长肌', en: 'longissimus_thoracis' },
    { group: 'back', cn: '头棘肌', en: 'spinalis_capitis' },
    { group: 'back', cn: '颈棘肌', en: 'spinalis_cervicis' },
    { group: 'back', cn: '胸棘肌', en: 'spinalis_thoracis' },

    // ===== 补充：舌内肌（正中器官，single）与肛门外括约肌 =====
    { group: 'head', cn: '舌上纵肌', en: 'superior_longitudinal_lingual', single: true },
    { group: 'head', cn: '舌下纵肌', en: 'inferior_longitudinal_lingual', single: true },
    { group: 'head', cn: '舌横肌', en: 'transverse_lingual', single: true },
    { group: 'head', cn: '舌垂直肌', en: 'vertical_lingual', single: true },
    { group: 'pelvis', cn: '肛门外括约肌', en: 'external_anal_sphincter', single: true },

    // ===== 补充：降眉间肌 / 中耳肌 =====
    { group: 'head', cn: '降眉间肌', en: 'procerus' },
    { group: 'head', cn: '鼓膜张肌', en: 'tensor_tympani' },
    { group: 'head', cn: '镫骨肌', en: 'stapedius' },

    // ===== 补充：喉肌（归颈，成对；杓横肌为正中单条）=====
    { group: 'neck', cn: '环甲肌', en: 'cricothyroid' },
    { group: 'neck', cn: '环杓后肌', en: 'posterior_cricoarytenoid' },
    { group: 'neck', cn: '环杓侧肌', en: 'lateral_cricoarytenoid' },
    { group: 'neck', cn: '杓横肌', en: 'transverse_arytenoid', single: true },
    { group: 'neck', cn: '杓斜肌', en: 'oblique_arytenoid' },
    { group: 'neck', cn: '甲杓肌', en: 'thyroarytenoid' },
    { group: 'neck', cn: '声带肌', en: 'vocalis' },
    { group: 'neck', cn: '会厌肌', en: 'aryepiglotticus' },

    // ===== 补充：肋提肌 / 肋下肌（胸背交界，归背）=====
    { group: 'back', cn: '肋提肌', en: 'levatores_costarum' },
    { group: 'back', cn: '肋下肌', en: 'subcostales' },

    // ===== 补充：胸骨肌（变异，成对）=====
    { group: 'chest', cn: '胸骨肌', en: 'sternalis' }
];

const SIDE_GROUPS = ['shoulder', 'upperarm', 'forearm', 'hand', 'hip', 'thigh', 'calf', 'foot'];
const AXIAL_GROUPS = ['head', 'neck', 'back', 'chest', 'abdomen', 'pelvis'];

// 大型被动（阶段三：后遗症迁入，见 34-muscle-system-rework.md §3）
// post_effect_id 指向 data/post-effects.json 的效果层条目；装配/触发口径见 §3.2/§3.5。
// 挥拳形态被动：允许槽 = 刺拳/摆拳形态调用的同侧侧群（§4 映射表；不装中轴，保持单侧生效）。
const PASSIVES = [
    {
        id: 'post_no_second_thought',
        name_key: 'posteffect.no_second_thought.name',
        desc_key: 'posteffect.no_second_thought.desc',
        allowed_groups: ['hand_l', 'hand_r', 'upperarm_l', 'upperarm_r', 'shoulder_l', 'shoulder_r', 'forearm_l', 'forearm_r'],
        slots_cost: 1,
        post_effect_id: 'post_no_second_thought'
    },
    {
        id: 'post_po_xiang',
        name_key: 'posteffect.po_xiang.name',
        desc_key: 'posteffect.po_xiang.desc',
        allowed_groups: ['hand_l', 'hand_r', 'upperarm_l', 'upperarm_r', 'shoulder_l', 'shoulder_r', 'forearm_l', 'forearm_r'],
        slots_cost: 1,
        post_effect_id: 'post_po_xiang'
    }
];

const muscles = [];
let totalCount = 0;

function addMuscle(groupId, name, en, effects) {
    muscles.push({
        id: groupId + '_' + en,
        name: name,
        group: groupId,
        effects: effects || [],
        unlock_cost: 1
    });
    totalCount++;
}

MUSCLES.forEach(function (m) {
    const eff = m.effects || TPL[m.group] || [];
    if (SIDE_GROUPS.indexOf(m.group) >= 0) {
        // 侧群：展开左右
        addMuscle(m.group + '_l', m.cn + '（左）', m.en + '_l', eff);
        addMuscle(m.group + '_r', m.cn + '（右）', m.en + '_r', eff);
    } else {
        // 中轴群
        if (m.single) {
            addMuscle(m.group, m.cn, m.en, eff);
        } else {
            addMuscle(m.group, m.cn + '（左）', m.en + '_L', eff);
            addMuscle(m.group, m.cn + '（右）', m.en + '_R', eff);
        }
    }
});

const out = {
    version: 3,
    resource_name: 'muscle_points',
    resource_display: '肌力点数',
    groups: groups,
    muscles: muscles,
    passives: PASSIVES
};

const target = path.join(__dirname, '..', 'data', 'muscles.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');
console.log('生成完成：肌群 ' + groups.length + ' 个，肌肉 ' + totalCount + ' 块 → ' + target);

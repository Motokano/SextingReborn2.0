// At the actual 144px tile width. Source points are visual measurements on
// rigid vertical edges, not sprite bounding boxes (which include perspective).
export const ROOM_SCALE={
 dining:{label:'收账桌与客凳 · 1×1格',note:'桌面约30px；凳子收在桌内，不挤占过道'},
 chair:{label:'头目座椅 · 格内留边',note:'坐面约20px；椅背朝后墙，正面朝桌子'},
 sleeping:{label:'铁床 · 1×2格',note:'床面约23px；床的长边朝房间内，留出上下床位置'},
 sideboard:{label:'茶水洗漱柜 · 1×1格',note:'柜面约40px，水壶另计；柜门朝过道'},
 cargo:{label:'周转货架 · 1×2格',note:'延续已确认的两格底面；前立柱约67px'},
 fan:{label:'停转的小电扇',note:'小型风扇底座留边，保持日用品尺度'},
 'den-private':{label:'头目私藏箱 · 接近1格',note:'箱身约38px；开盖不改箱体尺度'},
 'den-basket':{label:'赃物袋筐 · 格内留边',note:'宽底筐体；搜空前后保持筐身与底部不变'},
 mat:{label:'磨旧地垫 · 2×1格',note:'平贴地面，边线沿棋盘的两条轴线'},
 rubble:{label:'角落碎砖 · 格内留边',note:'少量大块轮廓，不用满地碎噪点'}
};
export const ROOM_ARCHITECTURE_SCALE={wall:1.20,door:.90,column:1.08,partition:.36};

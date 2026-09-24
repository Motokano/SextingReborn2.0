// PROTOTYPE: independent item data/visibility experiment, not loaded by the game.
export const categories = { base:'基础', food:'食物', production:'材料与生产', medicine:'药品与使用', equipment:'装备', structure:'收纳与装配', energy:'能源', organism:'活体' };
const n = (label, gate='inspect', unit='') => ({ type:'number', label, gate, unit });
const s = (label, gate='name') => ({ type:'string', label, gate, unit:'' });
export const definitions = {
  base: {
    identity: { label:'名称与描述', fields:{ name:s('名称'), appearance:s('外观称呼','appearance'), description:s('描述') } },
    stacking: { label:'堆叠', fields:{ limit:n('堆叠上限') } },
    spoilage: { label:'保鲜', fields:{ duration:n('腐败时长','inspect',' tick') } }
  },
  food: { nutrition:{ label:'食用', fields:{ satiety:n('饱食','inspect',' 点'), water:n('饮水','inspect',' 点') } } },
  production: {
    cooking:{ label:'烹饪原料', fields:{ kind:s('原料类别','inspect') } },
    fuel:{ label:'燃料', fields:{ value:n('燃料值','inspect',' 点') } },
    water:{ label:'供水', fields:{ value:n('供水值','inspect',' 点') } },
    compost:{ label:'堆肥', fields:{ carbon:n('碳值'), nitrogen:n('氮值') } }
  },
  energy: { storage:{ label:'储能', fields:{ capacity:n('容量','inspect',' 点'), initial_charge:{...n('初始电量'), internal:true} } } }
};
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
export const clone = value => JSON.parse(JSON.stringify(value));
function checkObject(o, where) { if (!o || typeof o !== 'object' || Array.isArray(o)) throw Error(where+' 必须为对象'); }
function allowed(o, keys, where) { checkObject(o,where); for (const k of Object.keys(o)) if (!keys.includes(k)) throw Error(where+'：未知字段 '+k); }
export function resolve(catalog, id) {
  const item = catalog.items.find(x=>x.item_id===id);
  if (!item) throw Error('物品不存在：'+id);
  const loaded = {};
  for (const [category, ref] of Object.entries(item.attribute_modules)) {
    if (!definitions[category]) throw Error(category+' 在试作中尚未定义字段');
    const config = catalog.configs[category]?.[ref];
    if (!config) throw Error(id+'：找不到配置 '+category+'/'+ref);
    loaded[category] = config;
  }
  return loaded;
}
export function validate(catalog) {
  allowed(catalog,['schema_version','items','configs','provenance'],'目录');
  if(catalog.schema_version!==1) throw Error('试作仅支持版本1');
  if(!Array.isArray(catalog.items)||!catalog.items.length) throw Error('主表不能为空');
  checkObject(catalog.configs,'模块配置');
  for(const [cat, configs] of Object.entries(catalog.configs)) {
    if(!definitions[cat]) throw Error('试作尚未实现大类：'+cat);
    checkObject(configs,cat);
    for(const [ref, groups] of Object.entries(configs)) {
      checkObject(groups,cat+'/'+ref);
      for(const [group, fields] of Object.entries(groups)) {
        const def=definitions[cat][group];
        if(!def) throw Error(cat+'：未知属性组 '+group);
        allowed(fields,Object.keys(def.fields),cat+'.'+group);
        // Optional group; once present its required fields must be explicit. No silent zero defaults.
        for(const [key, rule] of Object.entries(def.fields)) {
          const v=fields[key];
          if(!own(fields,key)) throw Error(cat+'.'+group+' 缺少 '+key);
          if(typeof v!==rule.type || (rule.type==='number' && (!Number.isFinite(v)||v<0)) || (rule.type==='string' && !v.trim())) throw Error(cat+'.'+group+'.'+key+' 类型或取值错误');
        }
        if(cat==='base' && group==='stacking' && (!Number.isInteger(fields.limit)||fields.limit<1)) throw Error('堆叠上限必须为正整数');
        if(cat==='base' && group==='spoilage' && (!Number.isInteger(fields.duration)||fields.duration<=0)) throw Error('腐败时长必须为正整数；不腐败请省略该组');
        if(cat==='energy' && group==='storage' && (!Number.isInteger(fields.capacity)||!Number.isInteger(fields.initial_charge)||fields.initial_charge>fields.capacity)) throw Error('电量必须为整数且不能超过容量');
      }
    }
  }
  const ids = new Set();
  for(const item of catalog.items) {
    allowed(item,['item_id','editor_name','weight_kg','attribute_modules'],'主表');
    if(typeof item.item_id!=='string'||!item.item_id.trim()||ids.has(item.item_id)) throw Error('物品ID为空或重复');
    ids.add(item.item_id);
    if(typeof item.editor_name!=='string'||!item.editor_name.trim()) throw Error('缺少编辑名称');
    if(typeof item.weight_kg!=='number'||!Number.isFinite(item.weight_kg)||item.weight_kg<0) throw Error('重量错误');
    checkObject(item.attribute_modules,'模块引用');
    for(const ref of Object.values(item.attribute_modules)) if(typeof ref!=='string') throw Error('配置引用必须为字符串');
    const loaded=resolve(catalog,item.item_id);
    if(!loaded.base?.identity) throw Error('必须提供基础名称配置');
  }
  return catalog;
}
export function createInstance(catalog,id) {
  const loaded=resolve(catalog,id), state={};
  if(loaded.energy?.storage) state.energy={storage:{charge:loaded.energy.storage.initial_charge}};
  if(loaded.base?.spoilage) state.base={spoilage:{elapsed:0}};
  return {item_id:id,count:1,state};
}
export function playerView(catalog,instance,knowledge) {
  const loaded=resolve(catalog,instance.item_id), identity=loaded.base.identity, rows=[];
  // Demo knowledge sets are explicit; they do not simulate the game's skill thresholds.
  const knows=gate => knowledge.includes(gate);
  for(const [cat,groups] of Object.entries(loaded)) for(const [group,fields] of Object.entries(groups)) {
    if(group==='identity') continue;
    const def=definitions[cat][group];
    for(const [key,value] of Object.entries(fields)) {
      const rule=def.fields[key];
      if(rule.internal||!knows(rule.gate)) continue;
      rows.push({id:cat+'.'+group+'.'+key,section:categories[cat],label:rule.label,value:String(value)+rule.unit});
    }
  }
  if(loaded.energy?.storage && knows('inspect')) rows.push({id:'energy.storage.charge',section:'能源',label:'剩余电量',value:instance.state.energy.storage.charge+' 点'});
  if(loaded.base?.spoilage && knows('inspect')) rows.push({id:'base.spoilage.elapsed',section:'基础',label:'已过时间',value:instance.state.base.spoilage.elapsed+' tick'});
  return {name:knows('name')?identity.name:identity.appearance,description:knows('name')?identity.description:'只能辨认外观，尚无性能认识。',rows};
}
export function discharge(catalog,instance,amount) {
  const next=clone(instance);
  if(!resolve(catalog,instance.item_id).energy?.storage) throw Error('没有储能属性');
  if(!Number.isFinite(amount)||amount<0) throw Error('扣电量错误');
  next.state.energy.storage.charge=Math.max(0,next.state.energy.storage.charge-amount);
  return next;
}
export function saveInstance(instance) { return JSON.stringify({schema_version:1,instance}); }
export function loadInstance(catalog,text) {
  const data=JSON.parse(text);
  allowed(data,['schema_version','instance'],'试作快照');
  if(data.schema_version!==1) throw Error('不支持的快照版本');
  const inst=data.instance;
  allowed(inst,['item_id','count','state'],'实例');
  if(inst.count!==1) throw Error('试作仅验证单件实例');
  const expected=createInstance(catalog,inst.item_id);
  allowed(inst.state,Object.keys(expected.state),'实例状态');
  for(const [cat,groups] of Object.entries(expected.state)) {
    allowed(inst.state[cat],Object.keys(groups),'状态 '+cat);
    for(const [group,fields] of Object.entries(groups)) {
      allowed(inst.state[cat][group],Object.keys(fields),'状态 '+cat+'.'+group);
      for(const key of Object.keys(fields)) if(!own(inst.state[cat][group],key)||!Number.isInteger(inst.state[cat][group][key])||inst.state[cat][group][key]<0) throw Error('状态值缺失或非法');
    }
  }
  if(inst.state.energy?.storage.charge>resolve(catalog,inst.item_id).energy.storage.capacity) throw Error('存档电量超过容量');
  return clone(inst);
}

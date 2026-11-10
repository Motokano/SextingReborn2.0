import {createAgricultureView} from './view.mjs';

let view;
const actions=()=>window.AgricultureActions;
const itemName=id=>{
 const IE=window.InventoryEquipment,tpl=IE.getItemTemplate(id);
 return tpl?IE.getDisplayName(tpl,null,window.SceneCtx.character):id;
};
const reasonLabels={
 not_adjacent:'已离开农田',agriculture_locked:'农田尚未修复',task_busy:'请先完成或取消当前工程',
 insufficient_items:'材料不足',insufficient_stamina:'体力不足',no_seed:'没有可用种子',invalid_seed:'种子不匹配',
 inventory_full:'背包空间不足',save_failed:'保存失败，操作已撤回',invalid_cell:'当前地块无法进行此操作',
 not_harvestable:'作物尚未成熟',no_crop:'地块上没有作物',wrong_facility:'设施已改变',
 no_battery:'没有可用电池',empty_battery:'电池已耗尽',stale_item:'物品已改变，请重新选择',
 jar_full:'陶瓮空间不足',facility_capacity:'储槽空间不足，暂不能装入整瓶',jar_mixed_liquid:'请先用完现有液体',crop_structure_occupied:'需先收获或清理作物',
 cannot_plant:'请选择空置耕地',missing_crop_structure:'请先建造对应作物设施',not_injectable:'该物品不能用于此设施'
};
const port={
 defs:()=>actions().agricultureCropDefsDoc,soilDefs:()=>actions().agricultureSoilsDoc,
 state:()=>window.AgricultureMap.getState(),seeds:()=>actions().getAgriculturePlantOptions(),
 soils:()=>actions().getAgricultureSoilAmendmentOptions(),injectables:kind=>actions().getAgricultureInjectables(kind),
 batteries:()=>actions().getAgricultureBatteries(),
 buildSpec:id=>window.AgricultureConfig.getBuildSpec(id),
 taskDefaults:()=>window.AgricultureConfig.getTaskDefaults(),
 venturiUpgrade:level=>window.AgricultureConfig.getVenturiUpgradeSpec(level||1),
 itemName,itemCount:id=>window.AgriculturePlayerItems.countItemId(id),
 laborCost:value=>window.Survival.getActionStaminaCost(value),
 taskName:task=>{
  const id=task.paymentMeta?.buildId;
  if(task.type==='soil_amend')return '改良土壤';
  if(task.type==='upgrade_venturi')return '升级施肥器';
  if(task.type==='build_crop_structure')return '建造'+(actions().agricultureCropDefsDoc.crop_structure_labels[task.structureId]||'作物设施');
  if(task.type==='remove_crop_structure')return '拆除作物设施';
  const spec=window.AgricultureConfig.getBuildSpec(id);
  return spec?.label_key?window.SceneFeedback.ui(spec.label_key):'施工中';
 },
 action:(id,params)=>actions().performAgricultureAction(id,params),
 waiting:()=>actions().isAgricultureAutoTickEnabled(),
 setWaiting:enabled=>actions().setAgricultureAutoTickEnabled(enabled),
 close:()=>actions().closeAgriculturePanel(),
 resultMessage:(id,r)=>{
  if(!r?.ok)return reasonLabels[r?.reason]||'当前无法完成此操作';
  if(id==='harvest')return `已收获 ${r.placedCount} 份${r.placedCount<r.harvestCount?'，剩余产物保留在田中':''}`;
  return {plant:'已播种',clear_crop:'作物已清理',start_build_task:'工程已开始',cancel_task:'工程已取消',start_soil_amend_task:'土壤改良已开始',start_venturi_upgrade:'升级已开始',inject_facility:'已补充一瓶',set_jar_release:'供给设置已更新',set_venturi_concentration:'供给设置已更新',feed_power:'已补充储能'}[id]||'已完成';
 }
};
window.AgriculturePanel={
 render(){const host=document.getElementById('modal-agriculture');if(!host||!port.defs()||!port.soilDefs())return;view??=createAgricultureView(host,port);view.open();},
 update(){view?.update();},
 syncAutoTickToggle(){view?.update();},
 close(){view?.close();}
};

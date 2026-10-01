import fs from 'node:fs';
import {buildModularItem} from './item-attribute-catalog.mjs';

export function sewingTemplates(texts) {
 const weights={textile_cotton_cloth:.02,textile_hemp_cloth:.025,textile_wool_cloth:.035,textile_silk_cloth:.012,leather_cow_soft:.065,leather_sheep_soft:.045};
 const out={};
 for(const [id,e] of Object.entries(texts.entries)) {
  if(id==='silica_leaf')continue;
  const outfit=id.startsWith('sewing_outfit_'),part=id.startsWith('sewing_part_');
  out[id]={item_id:id,...e.identity,name:e.identity.sn,name_0:e.identity.sn,desc_0:e.identity.fn,weight_kg:weights[id]??(id.startsWith('filling_')?.05:e.kind==='raw'?.3:0),stack_limit:outfit||part||e.kind==='facility'?1:100,category:outfit?'equipment':'material',pocketable:!outfit&&!part&&e.kind!=='facility',info_module_set_id:outfit?'module.equipment_armor':'module.material',source:'sewing',production_lines:'sewing',base_value:0};
  if(outfit)Object.assign(out[id],{equip_slot:'clothing',module_slots:['chest','abdomen','arm_l','arm_r','leg_l','leg_r'],pocket_slots:0,base_shield:0,enchant_slots:0});
 }
 return out;
}
if(process.argv[1]&&import.meta.url===new URL('file:///'+process.argv[1].replaceAll('\\','/')).href){
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const templates=sewingTemplates(read('data/sewing-item-texts.json')),items=read('data/items.json'),catalog=read('data/item-catalog-v2.json');
 Object.assign(items,templates);for(const [id,t] of Object.entries(templates))catalog.items[id]=buildModularItem(t);
 fs.writeFileSync('data/items.json',JSON.stringify(items,null,2)+'\n');fs.writeFileSync('data/item-catalog-v2.json',JSON.stringify(catalog,null,2)+'\n');
 console.log(`Registered ${Object.keys(templates).length} sewing templates.`);
}
